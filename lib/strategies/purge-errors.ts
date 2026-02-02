import { PluginConfig } from "../config"
import { Logger } from "../logger"
import type { SessionState, WithParts } from "../state"
import { buildToolIdList } from "../messages/utils"
import { getFilePathFromParameters, isProtectedFilePath } from "../protected-file-patterns"
import { calculateTokensSaved } from "./utils"

/**
 * Purge Errors strategy - prunes tool inputs for tools that errored
 * after they are older than a configurable number of turns.
 * The error message is preserved, but the (potentially large) inputs
 * are removed to save context.
 *
 * Modifies the session state in place to add pruned tool call IDs.
 */
export const purgeErrors = (
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
    messages: WithParts[],
): void => {
    if (!config.strategies.purgeErrors.enabled) {
        return
    }

    // Build list of all tool call IDs from messages (chronological order)
    const allToolIds = buildToolIdList(state, messages, logger)
    if (allToolIds.length === 0) {
        return
    }

    // Filter out IDs already pruned
    const alreadyPruned = new Set(state.prune.toolIds)
    const unprunedIds = allToolIds.filter((id) => !alreadyPruned.has(id))

    if (unprunedIds.length === 0) {
        return
    }

    const protectedTools = config.strategies.purgeErrors.protectedTools
    const turnThreshold = config.strategies.purgeErrors.turns

    const newPruneIds: string[] = []

    for (const id of unprunedIds) {
        const metadata = state.toolParameters.get(id)
        if (!metadata) {
            continue
        }

        // Skip protected tools
        if (protectedTools.includes(metadata.tool)) {
            continue
        }

        const filePath = getFilePathFromParameters(metadata.parameters)
        if (isProtectedFilePath(filePath, config.protectedFilePatterns)) {
            continue
        }

        // Only process error tools
        if (metadata.status !== "error") {
            continue
        }

        // Check if the tool is old enough to prune
        const turnAge = state.currentTurn - metadata.turn
        if (turnAge >= turnThreshold) {
            newPruneIds.push(id)
        }
    }

    if (newPruneIds.length > 0) {
        const tokensSaved = calculateTokensSaved(state, messages, newPruneIds)
        state.stats.totalPruneTokens += tokensSaved
        state.stats.totalPruneMessages += newPruneIds.length
        state.stats.strategyStats.purgeErrors.count += newPruneIds.length
        state.stats.strategyStats.purgeErrors.tokens += tokensSaved
        state.prune.toolIds.push(...newPruneIds)
        logger.debug(
            `Marked ${newPruneIds.length} error tool calls for pruning (older than ${turnThreshold} turns)`,
        )
    }
}
