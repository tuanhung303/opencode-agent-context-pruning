/**
 * Restore operations for tool outputs and messages.
 */

import type { PruneToolContext } from "./_types"
import { restoreByPattern } from "../messages/pattern-match"
import { saveSessionState } from "../state/persistence"

/**
 * Restore tool outputs by hash.
 */
export async function executeContextToolRestore(
    ctx: PruneToolContext,
    hashes: string[],
): Promise<string> {
    const { state, logger } = ctx

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
 * Restore messages by pattern (symmetric restore).
 */
export async function executeContextMessageRestore(
    ctx: PruneToolContext,
    patterns: string[],
): Promise<string> {
    const { state, logger } = ctx

    const restored: string[] = []

    for (const pattern of patterns) {
        const entry = restoreByPattern(pattern, state)
        if (entry) {
            const pruneIndex = state.prune.messagePartIds.indexOf(entry.partId)
            if (pruneIndex !== -1) {
                state.prune.messagePartIds.splice(pruneIndex, 1)
                restored.push(pattern)
                logger.info(`Restored message via pattern: ${pattern}`)
            }
        }
    }

    saveSessionState(state, logger).catch((err: Error) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    return `Restored ${restored.length} message(s)`
}
