import type { SessionState, WithParts } from "../state"
import type { Logger } from "../logger"
import type { PluginConfig } from "../config"

/**
 * @deprecated This function is no longer used. Hash-based discarding embeds
 * hashes directly into tool outputs instead of injecting a prunable-tools list.
 * Kept for backward compatibility but does nothing.
 */
export const insertPruneToolContext = (
    _state: SessionState,
    _config: PluginConfig,
    _logger: Logger,
    _messages: WithParts[],
): void => {
    // No-op: Hash-based discarding doesn't need list injection.
    // Hashes are embedded directly into tool outputs via injectHashesIntoToolOutputs()
}
