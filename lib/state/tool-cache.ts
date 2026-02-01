import type { SessionState, ToolStatus, WithParts } from "./index"
import type { Logger } from "../logger"
import { PluginConfig } from "../config"
import { isMessageCompacted } from "../shared-utils"
import { generateToolHash } from "../messages/utils"

const MAX_TOOL_CACHE_SIZE = 1000

/**
 * Sync tool parameters from OpenCode's session.messages() API.
 * Also generates stable hashes for each tool call.
 */
export async function syncToolCache(
    state: SessionState,
    config: PluginConfig,
    logger: Logger,
    messages: WithParts[],
): Promise<void> {
    try {
        logger.info("Syncing tool parameters from OpenCode messages")

        let turnCounter = 0

        for (const msg of messages) {
            if (isMessageCompacted(state, msg)) {
                continue
            }

            const parts = Array.isArray(msg.parts) ? msg.parts : []
            for (const part of parts) {
                if (part.type === "step-start") {
                    turnCounter++
                    continue
                }

                if (part.type !== "tool" || !part.callID) {
                    continue
                }

                const turnProtectionEnabled = config.turnProtection.enabled
                const turnProtectionTurns = config.turnProtection.turns
                const isProtectedByTurn =
                    turnProtectionEnabled &&
                    turnProtectionTurns > 0 &&
                    state.currentTurn - turnCounter < turnProtectionTurns

                state.lastToolPrune =
                    (part.tool === "discard" || part.tool === "extract") &&
                    part.state.status === "completed"

                if (state.toolParameters.has(part.callID)) {
                    continue
                }

                if (isProtectedByTurn) {
                    continue
                }

                const allProtectedTools = config.tools.settings.protectedTools

                // Skip hash generation for protected tools
                if (!allProtectedTools.includes(part.tool)) {
                    // Generate hash for this tool call
                    const baseHash = generateToolHash(part.tool, part.state?.input ?? {})

                    // Handle collision: if hash exists for a different callID, append sequence number
                    let finalHash = baseHash
                    if (
                        state.hashToCallId.has(baseHash) &&
                        state.hashToCallId.get(baseHash) !== part.callID
                    ) {
                        let seq = 2
                        while (state.hashToCallId.has(`${baseHash.slice(0, -1)}_${seq}#`)) {
                            seq++
                        }
                        finalHash = `${baseHash.slice(0, -1)}_${seq}#`
                        logger.warn(`Hash collision detected for ${part.tool}, using ${finalHash}`)
                    }

                    // Store bidirectional mapping
                    state.hashToCallId.set(finalHash, part.callID)
                    state.callIdToHash.set(part.callID, finalHash)
                }

                state.toolParameters.set(part.callID, {
                    tool: part.tool,
                    parameters: part.state?.input ?? {},
                    status: part.state.status as ToolStatus | undefined,
                    error: part.state.status === "error" ? part.state.error : undefined,
                    turn: turnCounter,
                })

                const hash = state.callIdToHash.get(part.callID) || "(protected)"
                logger.info(`Cached tool id: ${part.callID} hash: ${hash} (turn ${turnCounter})`)
            }
        }

        logger.info(
            `Synced cache - size: ${state.toolParameters.size}, hashes: ${state.hashToCallId.size}, currentTurn: ${state.currentTurn}`,
        )
        trimToolParametersCache(state)
    } catch (error) {
        logger.warn("Failed to sync tool parameters from OpenCode", {
            error: error instanceof Error ? error.message : String(error),
        })
    }
}

/**
 * Trim the tool parameters cache to prevent unbounded memory growth.
 * Uses FIFO eviction - removes oldest entries first.
 * Also cleans up corresponding hash mappings to prevent memory leaks.
 */
export function trimToolParametersCache(state: SessionState): void {
    if (state.toolParameters.size <= MAX_TOOL_CACHE_SIZE) {
        return
    }

    const keysToRemove = Array.from(state.toolParameters.keys()).slice(
        0,
        state.toolParameters.size - MAX_TOOL_CACHE_SIZE,
    )

    for (const callId of keysToRemove) {
        state.toolParameters.delete(callId)

        // Clean up hash mappings for evicted entries
        const hash = state.callIdToHash.get(callId)
        if (hash) {
            state.hashToCallId.delete(hash)
            state.callIdToHash.delete(callId)
        }
    }
}
