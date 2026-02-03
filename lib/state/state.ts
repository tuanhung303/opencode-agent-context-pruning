import type { OpenCodeClient } from "../client"
import type { SessionState, WithParts } from "./types"
import type { Logger } from "../logger"
import { loadSessionState } from "./persistence"
import { isSubAgentSession } from "./utils"
import { getLastUserMessage, isMessageCompacted } from "../shared-utils"

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
        },
        stats: {
            pruneTokenCounter: 0,
            totalPruneTokens: 0,
            pruneMessageCounter: 0,
            totalPruneMessages: 0,
            strategyStats: {
                deduplication: { count: 0, tokens: 0 },
                supersedeWrites: { count: 0, tokens: 0 },
                purgeErrors: { count: 0, tokens: 0 },
                manualDiscard: { count: 0, tokens: 0 },
                distillation: { count: 0, tokens: 0 },
                truncation: { count: 0, tokens: 0 },
                thinkingCompression: { count: 0, tokens: 0 },
            },
        },
        toolParameters: new Map(),
        lastToolPrune: false,
        lastCompaction: 0,
        currentTurn: 0,
        lastDiscardStats: null,
        lastUserMessageId: null,
        hashToCallId: new Map(),
        callIdToHash: new Map(),
        discardHistory: [],
        hashToMessagePart: new Map(),
        messagePartToHash: new Map(),
        softPrunedTools: new Map(),
        softPrunedMessageParts: new Map(),
        softPrunedMessages: new Map(),
        patternToContent: new Map(),
        // Todo reminder tracking
        lastTodoTurn: 0,
        lastReminderTurn: 0,
        lastTodowriteCallId: null,
        todos: [],
        // Automata Mode tracking
        automataEnabled: false,
        lastAutomataTurn: 0,
        lastReflectionTurn: 0,
    }
}

export function resetSessionState(state: SessionState): void {
    state.sessionId = null
    state.isSubAgent = false
    state.prune = {
        toolIds: [],
        messagePartIds: [],
    }
    state.stats = {
        pruneTokenCounter: 0,
        totalPruneTokens: 0,
        pruneMessageCounter: 0,
        totalPruneMessages: 0,
        strategyStats: {
            deduplication: { count: 0, tokens: 0 },
            supersedeWrites: { count: 0, tokens: 0 },
            purgeErrors: { count: 0, tokens: 0 },
            manualDiscard: { count: 0, tokens: 0 },
            distillation: { count: 0, tokens: 0 },
            truncation: { count: 0, tokens: 0 },
            thinkingCompression: { count: 0, tokens: 0 },
        },
    }
    state.toolParameters.clear()
    state.lastToolPrune = false
    state.lastCompaction = 0
    state.currentTurn = 0
    state.variant = undefined
    state.lastDiscardStats = null
    state.lastUserMessageId = null
    // Hash-based discard system
    state.hashToCallId.clear()
    state.callIdToHash.clear()
    state.discardHistory = []
    // Soft prune cache for restore capability
    state.softPrunedTools.clear()
    state.softPrunedMessageParts.clear()
    state.softPrunedMessages.clear()
    state.patternToContent.clear()
    // Todo reminder tracking
    state.lastTodoTurn = 0
    state.lastReminderTurn = 0
    state.lastTodowriteCallId = null
    state.todos = []
    // Automata Mode tracking
    state.automataEnabled = false
    state.lastAutomataTurn = 0
    state.lastReflectionTurn = 0
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

    state.prune = {
        toolIds: persisted.prune.toolIds || [],
        messagePartIds: persisted.prune.messagePartIds || [],
    }
    state.stats = {
        pruneTokenCounter: persisted.stats?.pruneTokenCounter || 0,
        totalPruneTokens: persisted.stats?.totalPruneTokens || 0,
        pruneMessageCounter: persisted.stats?.pruneMessageCounter || 0,
        totalPruneMessages: persisted.stats?.totalPruneMessages || 0,
        strategyStats: persisted.stats?.strategyStats || {
            deduplication: { count: 0, tokens: 0 },
            supersedeWrites: { count: 0, tokens: 0 },
            purgeErrors: { count: 0, tokens: 0 },
            manualDiscard: { count: 0, tokens: 0 },
            distillation: { count: 0, tokens: 0 },
            truncation: { count: 0, tokens: 0 },
            thinkingCompression: { count: 0, tokens: 0 },
        },
    }
    // Restore hash-based discard system (convert objects back to Maps)
    if (persisted.hashToCallId) {
        state.hashToCallId = new Map(Object.entries(persisted.hashToCallId))
    }
    if (persisted.callIdToHash) {
        state.callIdToHash = new Map(Object.entries(persisted.callIdToHash))
    }
    if (persisted.discardHistory) {
        state.discardHistory = persisted.discardHistory
    }
    // Restore assistant message hash maps
    if (persisted.hashToMessagePart) {
        state.hashToMessagePart = new Map(Object.entries(persisted.hashToMessagePart))
    }
    if (persisted.messagePartToHash) {
        state.messagePartToHash = new Map(Object.entries(persisted.messagePartToHash))
    }
    // Restore todo reminder state
    state.lastTodoTurn = persisted.lastTodoTurn ?? 0
    state.lastReminderTurn = persisted.lastReminderTurn ?? 0
    state.lastTodowriteCallId = persisted.lastTodowriteCallId ?? null
    state.todos = persisted.todos ?? []
    // Restore automata mode state
    state.automataEnabled = persisted.automataEnabled ?? false
    state.lastAutomataTurn = persisted.lastAutomataTurn ?? 0
    state.lastReflectionTurn = persisted.lastReflectionTurn ?? 0

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
    if (state.todos.length > 0 && state.lastTodoTurn > 0) {
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
                    const todos = JSON.parse(content)
                    if (Array.isArray(todos)) {
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
        state.lastTodoTurn = lastTodowriteTurn
        state.todos = lastTodos
        // Reset reminder cycle since we found a recent todowrite
        state.lastReminderTurn = 0
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
        if (isMessageCompacted(state, msg)) {
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
