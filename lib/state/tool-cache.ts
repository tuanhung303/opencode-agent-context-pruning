import type { SessionState, ToolStatus, WithParts, TodoItem } from "./index"
import type { Logger } from "../logger"
import { PluginConfig } from "../config"
import { isMessageCompacted } from "../shared-utils"
import { generateToolHash } from "../messages/utils"
import { removeTodoReminder } from "../messages/todo-reminder"

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
                    (part.tool === "discard" || part.tool === "distill") &&
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

        // Track todowrite interactions after tool cache sync
        trackTodoInteractions(state, messages, logger)
    } catch (error) {
        logger.warn("Failed to sync tool parameters from OpenCode", {
            error: error instanceof Error ? error.message : String(error),
        })
    }
}

/**
 * Track todowrite tool interactions to update todo reminder state.
 * Called after tool cache sync to detect todo list updates.
 * Only processes NEW todowrite calls (not already seen).
 */
function trackTodoInteractions(state: SessionState, messages: WithParts[], logger: Logger): void {
    // Find the most recent todowrite call that we haven't processed yet
    let latestTodowriteCallId: string | null = null
    let latestTodowriteTurn = 0
    let latestTodos: TodoItem[] | null = null
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

            // Check for tool parts from todowrite that are completed
            if (
                part.type === "tool" &&
                part.tool === "todowrite" &&
                part.state?.status === "completed" &&
                part.callID
            ) {
                // Track this as the latest todowrite
                latestTodowriteCallId = part.callID
                latestTodowriteTurn = turnCounter

                // Parse todo state from result output
                try {
                    const content = part.state.output
                    const todos = JSON.parse(content) as TodoItem[]
                    if (Array.isArray(todos)) {
                        latestTodos = todos
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        }
    }

    // Only update state if we found a todowrite AND it's different from what we've seen
    if (latestTodowriteCallId && latestTodowriteCallId !== state.lastTodowriteCallId) {
        logger.info(
            `Detected NEW todowrite (callId: ${latestTodowriteCallId}) at turn ${latestTodowriteTurn}`,
        )

        state.lastTodowriteCallId = latestTodowriteCallId
        state.lastTodoTurn = latestTodowriteTurn
        state.lastReminderTurn = 0 // Reset reminder cycle

        if (latestTodos) {
            state.todos = latestTodos
            logger.info(`Updated todo list with ${latestTodos.length} items`)
        }

        // Remove any existing reminder from context since todo was updated
        removeTodoReminder(state, messages, logger)
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
