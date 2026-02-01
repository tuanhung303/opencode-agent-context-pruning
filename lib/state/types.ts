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
        deduplication: { count: number; tokens: number }
        supersedeWrites: { count: number; tokens: number }
        purgeErrors: { count: number; tokens: number }
        manualDiscard: { count: number; tokens: number }
        distillation: { count: number; tokens: number }
        truncation: { count: number; tokens: number }
        thinkingCompression: { count: number; tokens: number }
    }
}

export interface Prune {
    toolIds: string[]
    messagePartIds: string[] // "msgId:partIndex" format for assistant text parts
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
    // Hash-based discard system
    hashToCallId: Map<string, string>
    callIdToHash: Map<string, string>
    discardHistory: DiscardStats[]
    // Message part hash system
    hashToMessagePart: Map<string, string>
    messagePartToHash: Map<string, string>
    // Soft prune cache for restore capability
    softPrunedTools: Map<string, SoftPrunedEntry>
    softPrunedMessageParts: Map<string, SoftPrunedMessagePart>
    // Todo reminder tracking
    lastTodoTurn: number // Turn when todowrite was last called
    lastReminderTurn: number // Turn when reminder was last injected (0 = never)
    lastTodowriteCallId: string | null // CallID of last processed todowrite (to avoid reprocessing)
    todos: TodoItem[] // Current todo list state
}

export interface SoftPrunedEntry {
    originalOutput: string
    tool: string
    parameters: Record<string, unknown>
    prunedAt: number
    hash: string
}

export interface SoftPrunedMessagePart {
    originalText: string
    messageId: string
    partIndex: number
    prunedAt: number
    hash: string
}
