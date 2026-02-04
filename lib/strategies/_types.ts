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
 * Special bulk target patterns for pruning all items of a type.
 * - "[tools]": All tool outputs eligible for pruning
 * - "[messages]": All assistant message parts eligible for pruning
 * - "[thinking]": All reasoning/thinking blocks eligible for pruning
 * - "[*]" or "[all]": All eligible items (tools + messages + thinking)
 */
export type BulkTargetPattern = "[tools]" | "[messages]" | "[thinking]" | "[*]" | "[all]"

/**
 * Internal bulk target type for categorization.
 */
export type BulkTargetType = "bulk_tools" | "bulk_messages" | "bulk_thinking" | "bulk_all"

/**
 * Result type for target type detection including bulk patterns.
 */
export type TargetTypeResult = "tool_hash" | "message_hash" | "reasoning_hash" | BulkTargetType
