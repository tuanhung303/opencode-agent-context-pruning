import type {
    SessionState,
    ToolParameterEntry,
    WithParts,
    SoftPrunedEntry,
    SoftPrunedMessagePart,
} from "./types"
import type { Logger } from "../logger"
import { loadSessionState } from "./persistence"
import { isSubAgentSession } from "./utils"
import { getLastUserMessage, isMessageCompacted } from "../shared-utils"

export const checkSession = async (
    client: any,
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
        } catch (err: any) {
            logger.error("Failed to initialize session state", { error: err.message })
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
                extraction: { count: 0, tokens: 0 },
                truncation: { count: 0, tokens: 0 },
                thinkingCompression: { count: 0, tokens: 0 },
            },
        },
        toolParameters: new Map<string, ToolParameterEntry>(),
        lastToolPrune: false,
        lastCompaction: 0,
        currentTurn: 0,
        variant: undefined,
        lastDiscardStats: null,
        lastUserMessageId: null,
        // Hash-based discard system
        hashToCallId: new Map<string, string>(),
        callIdToHash: new Map<string, string>(),
        discardHistory: [],
        // Message part hash system
        hashToMessagePart: new Map<string, string>(),
        messagePartToHash: new Map<string, string>(),
        // Soft prune cache for restore capability
        softPrunedTools: new Map<string, SoftPrunedEntry>(),
        softPrunedMessageParts: new Map<string, SoftPrunedMessagePart>(),
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
            extraction: { count: 0, tokens: 0 },
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
}

export async function ensureSessionInitialized(
    client: any,
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
            extraction: { count: 0, tokens: 0 },
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
