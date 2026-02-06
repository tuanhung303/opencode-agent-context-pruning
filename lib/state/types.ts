import { Message, Part } from "@opencode-ai/sdk/v2"

export interface WithParts {
    info: Message
    parts: Part[]
}

export type ToolStatus = "pending" | "running" | "completed" | "error"

export interface ToolParameterEntry {
    tool: string
    parameters: Record<string, unknown>
    status?: ToolStatus
    error?: string
    turn: number
}

export interface SessionStats {
    pruneTokenCounter: number
    totalPruneTokens: number
    pruneMessageCounter: number
    totalPruneMessages: number
    // Strategy effectiveness tracking
    strategyStats: {
        autoSupersede: {
            hash: { count: number; tokens: number }
            file: { count: number; tokens: number }
            todo: { count: number; tokens: number }
            context: { count: number; tokens: number }
            url: { count: number; tokens: number }
            stateQuery: { count: number; tokens: number }
            snapshot: { count: number; tokens: number }
            retry: { count: number; tokens: number }
        }
        purgeErrors: { count: number; tokens: number }
        manualDiscard: {
            message: { count: number; tokens: number }
            thinking: { count: number; tokens: number }
            tool: { count: number; tokens: number }
        }
        distillation: { count: number; tokens: number }
    }
}

export interface Prune {
    toolIds: string[]
    messagePartIds: string[] // "msgId:partIndex" format for assistant text parts
    reasoningPartIds: string[] // "msgId:partIndex" format for reasoning parts
    segmentIds: string[] // List of pruned segment hashes
}

export interface LastDiscardStats {
    itemCount: number
    tokensSaved: number
}

/**
 * Statistics for a single discard operation.
 * Used to track token savings per discard.
 */
export interface DiscardStats {
    timestamp: number
    hashes: string[]
    tokensSaved: number
    reason: string
}

export interface TodoItem {
    id: string
    content: string
    status: "pending" | "in_progress" | "completed" | "cancelled"
    priority: "high" | "medium" | "low"
    inProgressSince?: number // Turn when task became in_progress (for stuck task detection)
}

/**
 * Transient runtime cache for O(1) lookups.
 * NOT persisted - rebuilt on demand from arrays.
 */
export interface RuntimeCache {
    prunedToolIds: Set<string>
    prunedMessagePartIds: Set<string>
    prunedReasoningPartIds: Set<string>
    prunedSegmentIds: Set<string>
}

export interface SessionState {
    sessionId: string | null
    isSubAgent: boolean
    prune: Prune
    stats: SessionStats
    toolParameters: Map<string, ToolParameterEntry>
    lastToolPrune: boolean
    lastCompaction: number
    currentTurn: number
    variant?: string
    lastDiscardStats: LastDiscardStats | null
    lastUserMessageId: string | null

    // Last pruned content for status bar display (survives superseding)
    lastPrunedContent: {
        tools: string[]
        messages: number
        reasoning: number
        timestamp: number
    } | null

    // Hash-based discard system
    hashRegistry: {
        calls: Map<string, string>
        callIds: Map<string, string>
        messages: Map<string, string>
        messagePartIds: Map<string, string>
        reasoning: Map<string, string>
        reasoningPartIds: Map<string, string>
        fileParts: Map<string, string>
        segments: Map<string, string>
    }
    discardHistory: DiscardStats[]

    // Tracking cursors (grouped)
    cursors: {
        todo: {
            lastTurn: number
            lastReminderTurn: number
            lastWriteCallId: string | null
            lastReadCallId: string | null
        }
        context: {
            lastCallId: string | null
        }
        automata: {
            enabled: boolean
            lastTurn: number
            lastReflectionTurn: number
        }
        files: {
            pathToCallIds: Map<string, Set<string>>
        }
        urls: {
            urlToCallIds: Map<string, Set<string>>
        }
        stateQueries: {
            queryToCallIds: Map<string, Set<string>>
        }
        snapshots: {
            allCallIds: Set<string>
            latestCallId: string | null
        }
        retries: {
            // Maps tool+hash to failed callIds awaiting successful retry
            pendingRetries: Map<string, string[]>
        }
    }

    todos: TodoItem[] // Current todo list state

    // Transient runtime cache - NOT persisted, rebuilt on demand
    _cache?: RuntimeCache
}
