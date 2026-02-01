import { Message, Part } from "@opencode-ai/sdk/v2"

export interface WithParts {
    info: Message
    parts: Part[]
}

export type ToolStatus = "pending" | "running" | "completed" | "error"

export interface ToolParameterEntry {
    tool: string
    parameters: any
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

export interface SessionState {
    sessionId: string | null
    isSubAgent: boolean
    prune: Prune
    stats: SessionStats
    toolParameters: Map<string, ToolParameterEntry>
    lastToolPrune: boolean
    lastCompaction: number
    currentTurn: number
    variant: string | undefined
    lastDiscardStats: LastDiscardStats | null
    lastUserMessageId: string | null

    // Hash-based discard system
    hashToCallId: Map<string, string> // "#r_a1b2c#" → "tooluse_abc123..."
    callIdToHash: Map<string, string> // Reverse lookup
    discardHistory: DiscardStats[] // Per-discard token savings

    // Message part hash system (for assistant text discarding)
    hashToMessagePart: Map<string, string> // "#a_xxxxx#" → "msgId:partIndex"
    messagePartToHash: Map<string, string> // Reverse lookup

    // Soft prune cache for restore capability
    softPrunedTools: Map<string, SoftPrunedEntry> // callId → original output
    softPrunedMessageParts: Map<string, SoftPrunedMessagePart> // "msgId:partIndex" → original text
}

export interface SoftPrunedEntry {
    originalOutput: string
    tool: string
    parameters: any
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
