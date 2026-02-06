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
