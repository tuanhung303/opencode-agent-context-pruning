import { OpenCodeClient } from "../client"
import { SessionState, WithParts } from "./types"
import { Logger } from "../logger"
import { checkSession, ensureSessionInitialized } from "./state"
import { syncToolCache } from "./tool-cache"
import { PluginConfig } from "../config"

/**
 * Synchronizes the session state and tool cache in one go.
 * This should be the primary entry point for session management in hooks.
 */
export async function syncSessionState(
    client: OpenCodeClient,
    state: SessionState,
    config: PluginConfig,
    logger: Logger,
    messages: WithParts[],
): Promise<void> {
    // 1. Ensure session is initialized and valid
    await checkSession(client, state, logger, messages)

    // checkSession might have updated state.sessionId, ensureSessionInitialized handles the rest
    if (state.sessionId) {
        await ensureSessionInitialized(client, state, state.sessionId, logger, messages)
    }

    // 2. Synchronize tool parameters cache
    await syncToolCache(state, config, logger, messages)
}

export * from "./state"
export * from "./tool-cache"
export * from "./types"
export * from "./persistence"
