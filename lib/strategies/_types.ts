/**
 * Shared types for tool strategy modules.
 */

import type { SessionState } from "../state"
import type { PluginConfig } from "../config"
import type { Logger } from "../logger"
import type { OpenCodeClient } from "../client"

export interface PruneToolContext {
    client: OpenCodeClient
    state: SessionState
    logger: Logger
    config: PluginConfig
    workingDirectory: string
}

/**
 * Result type for target type detection.
 * Supports known types (backward compatible) and generic "unknown_hash" for flexibility.
 */
export type TargetTypeResult = "tool_hash" | "message_hash" | "reasoning_hash" | "unknown_hash"

/**
 * Pattern-based replacement operation.
 * Replaces content between start and end patterns with replacement text.
 */
export interface ReplaceOperation {
    /** Pattern marking the start of content to replace */
    start: string
    /** Pattern marking the end of content to replace */
    end: string
    /** Replacement text to insert */
    replacement: string
}

/**
 * Result of a single replacement operation.
 */
export interface ReplacementResult {
    operation: ReplaceOperation
    messageId: string
    partIndex: number
    startIndex: number
    endIndex: number
    originalLength: number
    newLength: number
    tokensSaved: number
}

/**
 * Result of executeReplace operation.
 */
export interface ReplaceOperationResult {
    success: boolean
    replacements: ReplacementResult[]
    errors: string[]
}
