import type { OpenCodeClient } from "../client"
import type { SessionState, WithParts } from "./types"
import type { Logger } from "../logger"
import { loadSessionState } from "./persistence"
import { isSubAgentSession } from "./utils"
import { getLastUserMessage, isMessageCompacted, isSyntheticMessage } from "../shared-utils"

export const checkSession = async (
    client: OpenCodeClient,
    state: SessionState,
    logger: Logger,
    messages: WithParts[],
): Promise<void> => {
    const lastUserMessage = getLastUserMessage(messages)
    if (!lastUserMessage) {
        return
    }

    const lastSessionId = lastUserMessage.info.sessionID

    if (state.sessionId === null || state.sessionId !== lastSessionId) {
        logger.info(`Session changed: ${state.sessionId} -> ${lastSessionId}`)
        try {
            await ensureSessionInitialized(client, state, lastSessionId, logger, messages)
        } catch (err: unknown) {
            logger.error("Failed to initialize session state", {
                error: err instanceof Error ? err.message : String(err),
            })
        }
    }

    const lastCompactionTimestamp = findLastCompactionTimestamp(messages)
    if (lastCompactionTimestamp > state.lastCompaction) {
        state.lastCompaction = lastCompactionTimestamp
        state.toolParameters.clear()
        state.prune.toolIds = []
        logger.info("Detected compaction from messages - cleared tool cache", {
            timestamp: lastCompactionTimestamp,
        })
    }

    state.currentTurn = countTurns(state, messages)
}

export function createSessionState(): SessionState {
    return {
        sessionId: null,
        isSubAgent: false,
        prune: {
            toolIds: [],
            messagePartIds: [],
            reasoningPartIds: [],
            segmentIds: [],
        },
        stats: {
            pruneTokenCounter: 0,
            totalPruneTokens: 0,
            pruneMessageCounter: 0,
            totalPruneMessages: 0,
            strategyStats: {
                autoSupersede: {
                    hash: { count: 0, tokens: 0 },
                    file: { count: 0, tokens: 0 },
                    todo: { count: 0, tokens: 0 },
                    context: { count: 0, tokens: 0 },
                    url: { count: 0, tokens: 0 },
                    stateQuery: { count: 0, tokens: 0 },
                    snapshot: { count: 0, tokens: 0 },
                    retry: { count: 0, tokens: 0 },
                },
                purgeErrors: { count: 0, tokens: 0 },
                manualDiscard: {
                    message: { count: 0, tokens: 0 },
                    thinking: { count: 0, tokens: 0 },
                    tool: { count: 0, tokens: 0 },
                },
                distillation: { count: 0, tokens: 0 },
            },
        },
        toolParameters: new Map(),
        lastToolPrune: false,
        lastCompaction: 0,
        currentTurn: 0,
        lastDiscardStats: null,
        lastUserMessageId: null,
        lastPrunedContent: null,
        hashRegistry: {
            calls: new Map(),
            callIds: new Map(),
            messages: new Map(),
            messagePartIds: new Map(),
            reasoning: new Map(),
            reasoningPartIds: new Map(),
            fileParts: new Map(),
            segments: new Map(),
        },
        discardHistory: [],
        cursors: {
            todo: {
                lastTurn: 0,
                lastReminderTurn: 0,
                lastWriteCallId: null,
                lastReadCallId: null,
            },
            context: {
                lastCallId: null,
            },
            automata: {
                enabled: false,
                lastTurn: 0,
                lastReflectionTurn: 0,
            },
            files: {
                pathToCallIds: new Map(),
            },
            urls: {
                urlToCallIds: new Map(),
            },
            stateQueries: {
                queryToCallIds: new Map(),
            },
            snapshots: {
                allCallIds: new Set(),
                latestCallId: null,
            },
            retries: {
                pendingRetries: new Map(),
            },
        },
        todos: [],
    }
}

export function resetSessionState(state: SessionState): void {
    const fresh = createSessionState()
    Object.assign(state, fresh)
    state.toolParameters.clear()
}

/**
 * Migrate strategyStats from old flat manualDiscard to new nested structure.
 * Handles backward compatibility with persisted sessions.
 */
function migrateStrategyStats(persisted: any): SessionState["stats"]["strategyStats"] {
    const defaultStats: SessionState["stats"]["strategyStats"] = {
        autoSupersede: {
            hash: { count: 0, tokens: 0 },
            file: { count: 0, tokens: 0 },
            todo: { count: 0, tokens: 0 },
            context: { count: 0, tokens: 0 },
            url: { count: 0, tokens: 0 },
            stateQuery: { count: 0, tokens: 0 },
            snapshot: { count: 0, tokens: 0 },
            retry: { count: 0, tokens: 0 },
        },
        purgeErrors: { count: 0, tokens: 0 },
        manualDiscard: {
            message: { count: 0, tokens: 0 },
            thinking: { count: 0, tokens: 0 },
            tool: { count: 0, tokens: 0 },
        },
        distillation: { count: 0, tokens: 0 },
    }

    if (!persisted) {
        return defaultStats
    }

    // Check if manualDiscard is old flat format (has 'count' property directly)
    const isOldFormat = persisted.manualDiscard && typeof persisted.manualDiscard.count === "number"

    return {
        autoSupersede: persisted.autoSupersede || defaultStats.autoSupersede,
        purgeErrors: persisted.purgeErrors || defaultStats.purgeErrors,
        manualDiscard: isOldFormat
            ? {
                  // Migrate old flat format: assign all to 'tool' category
                  message: { count: 0, tokens: 0 },
                  thinking: { count: 0, tokens: 0 },
                  tool: {
                      count: persisted.manualDiscard.count,
                      tokens: persisted.manualDiscard.tokens,
                  },
              }
            : persisted.manualDiscard || defaultStats.manualDiscard,
        distillation: persisted.distillation || defaultStats.distillation,
    }
}

export async function ensureSessionInitialized(
    client: OpenCodeClient,
    state: SessionState,
    sessionId: string,
    logger: Logger,
    messages: WithParts[],
): Promise<void> {
    if (state.sessionId === sessionId) {
        return
    }

    logger.info("session ID = " + sessionId)
    logger.info("Initializing session state", { sessionId: sessionId })

    resetSessionState(state)
    state.sessionId = sessionId

    const isSubAgent = await isSubAgentSession(client, sessionId)
    state.isSubAgent = isSubAgent
    logger.info("isSubAgent = " + isSubAgent)

    state.lastCompaction = findLastCompactionTimestamp(messages)
    state.currentTurn = countTurns(state, messages)

    const persisted = await loadSessionState(sessionId, logger)
    if (persisted === null) {
        return
    }

    // Since state structure changed significantly, we reset if version mismatch
    // (Implied by the user's acceptance to reset on first run after upgrade)
    if (!persisted.cursors && (persisted.lastTodoTurn !== undefined || persisted.hashToCallId)) {
        logger.info("Detected legacy session state structure - resetting for upgrade")
        return
    }

    state.prune = {
        toolIds: persisted.prune?.toolIds || [],
        messagePartIds: persisted.prune?.messagePartIds || [],
        reasoningPartIds: persisted.prune?.reasoningPartIds || [],
        segmentIds: persisted.prune?.segmentIds || [],
    }
    state.stats = {
        pruneTokenCounter: persisted.stats?.pruneTokenCounter || 0,
        totalPruneTokens: persisted.stats?.totalPruneTokens || 0,
        pruneMessageCounter: persisted.stats?.pruneMessageCounter || 0,
        totalPruneMessages: persisted.stats?.totalPruneMessages || 0,
        strategyStats: migrateStrategyStats(persisted.stats?.strategyStats),
    }

    // Restore hash-based discard system (convert objects back to Maps)
    if (persisted.hashRegistry) {
        state.hashRegistry.calls = new Map(Object.entries(persisted.hashRegistry.calls || {}))
        state.hashRegistry.callIds = new Map(Object.entries(persisted.hashRegistry.callIds || {}))
        state.hashRegistry.messages = new Map(Object.entries(persisted.hashRegistry.messages || {}))
        state.hashRegistry.messagePartIds = new Map(
            Object.entries(persisted.hashRegistry.messagePartIds || {}),
        )
        state.hashRegistry.reasoning = new Map(
            Object.entries(persisted.hashRegistry.reasoning || {}),
        )
        state.hashRegistry.reasoningPartIds = new Map(
            Object.entries(persisted.hashRegistry.reasoningPartIds || {}),
        )
        state.hashRegistry.fileParts = new Map(
            Object.entries(persisted.hashRegistry.fileParts || {}),
        )
    }

    if (persisted.discardHistory) {
        state.discardHistory = persisted.discardHistory
    }

    // Restore cursors
    if (persisted.cursors) {
        state.cursors.todo = persisted.cursors.todo || state.cursors.todo
        state.cursors.context = persisted.cursors.context || state.cursors.context
        state.cursors.automata = persisted.cursors.automata || state.cursors.automata
        if (persisted.cursors.files?.pathToCallIds) {
            state.cursors.files.pathToCallIds = new Map(
                Object.entries(persisted.cursors.files.pathToCallIds).map(([k, v]) => [
                    k,
                    new Set(v as string[]),
                ]),
            )
        }
    }

    state.todos = persisted.todos ?? []

    // Scan message history to sync todo state if needed
    restoreTodoStateFromHistory(state, messages, logger)
}

/**
 * Scan message history for the most recent todowrite to restore todo state.
 * This prevents false reminders on session restore when todowrite was recent.
 */
function restoreTodoStateFromHistory(
    state: SessionState,
    messages: WithParts[],
    logger: Logger,
): void {
    // Only restore if we don't have persisted todo state
    if (state.todos.length > 0 && state.cursors.todo.lastTurn > 0) {
        logger.debug("Using persisted todo state, skipping history scan")
        return
    }

    let lastTodowriteTurn = 0
    let currentTurn = 0
    let lastTodos: any[] = []

    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) {
            continue
        }

        const parts = Array.isArray(msg.parts) ? msg.parts : []
        for (const part of parts) {
            if (part.type === "step-start") {
                currentTurn++
                continue
            }

            if (
                part.type === "tool" &&
                part.tool === "todowrite" &&
                part.state?.status === "completed"
            ) {
                try {
                    const content = part.state.output
                    let todos: any[] | null = null
                    if (typeof content === "string") {
                        todos = JSON.parse(content)
                    } else if (Array.isArray(content)) {
                        todos = content
                    }
                    if (todos && Array.isArray(todos)) {
                        lastTodowriteTurn = currentTurn
                        lastTodos = todos
                    }
                } catch {
                    // Ignore parse errors
                }
            }
        }
    }

    if (lastTodowriteTurn > 0) {
        state.cursors.todo.lastTurn = lastTodowriteTurn
        state.todos = lastTodos
        // Reset reminder cycle since we found a recent todowrite
        state.cursors.todo.lastReminderTurn = 0
        logger.info(
            `Restored todo state from history - last todowrite at turn ${lastTodowriteTurn} with ${lastTodos.length} todos`,
        )
    }
}

function findLastCompactionTimestamp(messages: WithParts[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (msg && msg.info.role === "assistant" && msg.info.summary === true) {
            return msg.info.time.created
        }
    }
    return 0
}

export function countTurns(state: SessionState, messages: WithParts[]): number {
    let turnCount = 0
    for (const msg of messages) {
        if (isMessageCompacted(state, msg) || isSyntheticMessage(msg)) {
            continue
        }
        const parts = Array.isArray(msg.parts) ? msg.parts : []
        for (const part of parts) {
            if (part.type === "step-start") {
                turnCount++
            }
        }
    }
    return turnCount
}
