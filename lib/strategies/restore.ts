/**
 * Restore operations for tool outputs and messages.
 */

import type { PruneToolContext } from "./_types"
import { saveSessionState } from "../state/persistence"

/**
 * Restore tool outputs by hash.
 */
export async function executeContextToolRestore(
    ctx: PruneToolContext,
    hashes: string[],
): Promise<string> {
    const { state, logger, config } = ctx

    // Restore is not available when fullyForget is enabled
    if (config.tools.discard.fullyForget) {
        return "Cannot restore: fullyForget is enabled. Tool parts were completely removed from context and cannot be restored."
    }

    const restored: string[] = []

    for (const hash of hashes) {
        const callId = state.hashToCallId.get(hash)
        if (callId) {
            const pruneIndex = state.prune.toolIds.indexOf(callId)
            if (pruneIndex !== -1) {
                state.prune.toolIds.splice(pruneIndex, 1)
                restored.push(hash)
                logger.info(`Restored tool with hash ${hash}`)
            }
        }
    }

    saveSessionState(state, logger).catch((err: Error) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    return `Restored ${restored.length} tool(s)`
}

/**
 * Restore messages by hash (symmetric restore).
 */
export async function executeContextMessageRestore(
    ctx: PruneToolContext,
    _toolCtx: { sessionID: string },
    hashes: string[],
): Promise<string> {
    const { state, logger } = ctx

    const restored: string[] = []

    for (const hash of hashes) {
        const partId = state.hashToMessagePart.get(hash)
        if (partId) {
            const pruneIndex = state.prune.messagePartIds.indexOf(partId)
            if (pruneIndex !== -1) {
                state.prune.messagePartIds.splice(pruneIndex, 1)
                restored.push(hash)
                logger.info(`Restored message via hash: ${hash}`)
            }
        } else {
            logger.warn(`Unknown message hash for restore: ${hash}`)
        }
    }

    saveSessionState(state, logger).catch((err: Error) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    return `Restored ${restored.length} message(s)`
}
