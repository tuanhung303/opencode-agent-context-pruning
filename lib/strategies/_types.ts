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
