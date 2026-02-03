import type { SessionState, ToolStatus, WithParts, TodoItem } from "./index"
import type { Logger } from "../logger"
import { PluginConfig } from "../config"
import { isMessageCompacted } from "../shared-utils"
import { generateToolHash } from "../messages/utils"
import { removeTodoReminder } from "../messages/todo-reminder"
import { removeAutomataReflection } from "../messages/automata-mode"
import { countTokens } from "../strategies/utils"

const MAX_TOOL_CACHE_SIZE = 1000

/** Tools that operate on files and support file-based supersede */
const FILE_TOOLS = ["read", "write", "edit", "glob", "grep"] as const
type FileTool = (typeof FILE_TOOLS)[number]

/**
 * Extract a unique file key from tool parameters for file-based supersede.
 * Returns null for non-file tools.
 */
function extractFileKey(tool: string, params: Record<string, unknown>): string | null {
    if (tool === "read" || tool === "write" || tool === "edit") {
        return (params.filePath as string) ?? null
    }
    if (tool === "glob") {
        const pattern = (params.pattern as string) ?? ""
        const path = (params.path as string) ?? ""
        return `glob:${path}:${pattern}`
    }
    if (tool === "grep") {
        const pattern = (params.pattern as string) ?? ""
        const path = (params.path as string) ?? ""
        const include = (params.include as string) ?? ""
        return `grep:${path}:${pattern}:${include}`
    }
    return null
}

/**
 * Check if a tool is a write operation (supersedes reads)
 */
function isWriteTool(tool: string): boolean {
    return tool === "write" || tool === "edit"
}

/**
 * Mark a tool call as superseded (soft prune).
 * Returns estimated tokens saved.
 */
function supersedeToolCall(
    state: SessionState,
    callId: string,
    messages: WithParts[],
    logger: Logger,
    reason: string,
): number {
    // Find the tool part and estimate tokens
    let tokensSaved = 0
    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) continue
        const parts = Array.isArray(msg.parts) ? msg.parts : []
        for (const part of parts) {
            if (part.type === "tool" && part.callID === callId) {
                // Estimate tokens from input + output
                const inputStr = JSON.stringify(part.state?.input ?? {})
                const outputStr =
                    part.state?.status === "completed" ? ((part.state as any).output ?? "") : ""
                tokensSaved = countTokens(inputStr) + countTokens(outputStr)

                // Get hash for this call
                const hash = state.callIdToHash.get(callId) ?? callId

                // Mark as soft pruned
                state.softPrunedTools.set(callId, {
                    originalOutput: outputStr,
                    tool: part.tool,
                    parameters: part.state?.input ?? {},
                    prunedAt: state.currentTurn,
                    hash,
                })

                // Clear the output to free memory
                if (part.state?.status === "completed") {
                    ;(part.state as any).output = `[auto-superseded: ${reason}]`
                }

                logger.debug(`Superseded tool ${callId}: ${reason}, ~${tokensSaved} tokens`)
                return tokensSaved
            }
        }
    }
    return tokensSaved
}

/**
 * Sync tool parameters from OpenCode's session.messages() API.
 * Also generates stable hashes for each tool call.
 * Implements auto-supersede: hash-based, file-based, and todo-based.
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

                // Skip if already cached
                if (state.toolParameters.has(part.callID)) {
                    continue
                }

                // Skip turn-protected tools
                if (isProtectedByTurn) {
                    continue
                }

                const allProtectedTools = config.tools.settings.protectedTools

                // Skip hash generation for protected tools
                if (!allProtectedTools.includes(part.tool)) {
                    // Generate hash for this tool call
                    const baseHash = generateToolHash(part.tool, part.state?.input ?? {})

                    // === HASH-BASED SUPERSEDE ===
                    // If same hash exists for a different callID, supersede the OLD one
                    if (
                        state.hashToCallId.has(baseHash) &&
                        state.hashToCallId.get(baseHash) !== part.callID
                    ) {
                        const oldCallId = state.hashToCallId.get(baseHash)!

                        // Only supersede if old call is completed and not in current turn
                        const oldParams = state.toolParameters.get(oldCallId)
                        if (
                            oldParams &&
                            oldParams.status === "completed" &&
                            oldParams.turn < turnCounter
                        ) {
                            const tokensSaved = supersedeToolCall(
                                state,
                                oldCallId,
                                messages,
                                logger,
                                "hash duplicate",
                            )
                            state.stats.strategyStats.autoSupersede.hash.count++
                            state.stats.strategyStats.autoSupersede.hash.tokens += tokensSaved
                            logger.info(
                                `[auto-supersede] 🔄 hash ${baseHash.slice(0, 7)}: ${oldCallId} → ${part.callID}`,
                            )

                            // Clean up old mappings
                            state.hashToCallId.delete(baseHash)
                            state.callIdToHash.delete(oldCallId)
                        }
                    }

                    // Store bidirectional mapping for new call
                    state.hashToCallId.set(baseHash, part.callID)
                    state.callIdToHash.set(part.callID, baseHash)

                    // === FILE-BASED SUPERSEDE ===
                    const fileKey = extractFileKey(part.tool, part.state?.input ?? {})
                    if (fileKey && part.state?.status === "completed") {
                        // If this is a write/edit, supersede all previous read/write/edit for same file
                        if (isWriteTool(part.tool)) {
                            const existingCallIds = state.filePathToCallIds.get(fileKey)
                            if (existingCallIds) {
                                for (const oldCallId of existingCallIds) {
                                    if (oldCallId === part.callID) continue
                                    const oldParams = state.toolParameters.get(oldCallId)
                                    if (
                                        oldParams &&
                                        oldParams.status === "completed" &&
                                        oldParams.turn < turnCounter
                                    ) {
                                        const tokensSaved = supersedeToolCall(
                                            state,
                                            oldCallId,
                                            messages,
                                            logger,
                                            `file superseded by ${part.tool}`,
                                        )
                                        state.stats.strategyStats.autoSupersede.file.count++
                                        state.stats.strategyStats.autoSupersede.file.tokens +=
                                            tokensSaved
                                        logger.info(
                                            `[auto-supersede] 📁 file ${fileKey}: ${oldParams.tool} ${oldCallId} superseded by ${part.tool}`,
                                        )
                                    }
                                }
                                existingCallIds.clear()
                            }
                        }

                        // Track this call for the file
                        if (!state.filePathToCallIds.has(fileKey)) {
                            state.filePathToCallIds.set(fileKey, new Set())
                        }
                        state.filePathToCallIds.get(fileKey)!.add(part.callID)
                    }
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

        // Track todowrite/todoread interactions after tool cache sync (includes todo supersede)
        trackTodoInteractions(state, messages, logger)
    } catch (error) {
        logger.warn("Failed to sync tool parameters from OpenCode", {
            error: error instanceof Error ? error.message : String(error),
        })
    }
}

/**
 * Track todowrite/todoread tool interactions to update todo reminder state.
 * Called after tool cache sync to detect todo list updates.
 * Implements todo-based supersede: clears old todowrite AND todoread calls.
 */
function trackTodoInteractions(state: SessionState, messages: WithParts[], logger: Logger): void {
    // Find the most recent todowrite and todoread calls
    let latestTodowriteCallId: string | null = null
    let latestTodowriteTurn = 0
    let latestTodos: TodoItem[] | null = null
    let latestTodoreadCallId: string | null = null
    let latestTodoreadTurn = 0
    let turnCounter = 0

    // Collect all todowrite and todoread call IDs for supersede
    const allTodowriteCallIds: Array<{ callId: string; turn: number }> = []
    const allTodoreadCallIds: Array<{ callId: string; turn: number }> = []

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

            // Track todowrite calls
            if (part.tool === "todowrite" && part.state?.status === "completed") {
                allTodowriteCallIds.push({ callId: part.callID, turn: turnCounter })
                latestTodowriteCallId = part.callID
                latestTodowriteTurn = turnCounter

                // Parse todo state from result output
                try {
                    const content = (part.state as any).output
                    const todos = JSON.parse(content) as TodoItem[]
                    if (Array.isArray(todos)) {
                        latestTodos = todos
                    }
                } catch {
                    // Ignore parse errors
                }
            }

            // Track todoread calls
            if (part.tool === "todoread" && part.state?.status === "completed") {
                allTodoreadCallIds.push({ callId: part.callID, turn: turnCounter })
                latestTodoreadCallId = part.callID
                latestTodoreadTurn = turnCounter
            }
        }
    }

    // === TODO-BASED SUPERSEDE ===
    // Supersede all old todowrite calls except the latest
    if (latestTodowriteCallId && latestTodowriteCallId !== state.lastTodowriteCallId) {
        for (const { callId, turn } of allTodowriteCallIds) {
            if (callId === latestTodowriteCallId) continue
            if (state.softPrunedTools.has(callId)) continue // Already pruned

            const tokensSaved = supersedeToolCall(
                state,
                callId,
                messages,
                logger,
                "newer todowrite exists",
            )
            if (tokensSaved > 0) {
                state.stats.strategyStats.autoSupersede.todo.count++
                state.stats.strategyStats.autoSupersede.todo.tokens += tokensSaved
                logger.info(
                    `[auto-supersede] ✅ todo: pruned old todowrite ${callId} (turn ${turn})`,
                )
            }
        }

        logger.info(
            `Detected NEW todowrite (callId: ${latestTodowriteCallId}) at turn ${latestTodowriteTurn}`,
        )

        state.lastTodowriteCallId = latestTodowriteCallId
        state.lastTodoTurn = latestTodowriteTurn
        state.lastReminderTurn = 0 // Reset reminder cycle

        if (latestTodos) {
            // Track in_progress transitions for stuck task detection
            for (const newTodo of latestTodos) {
                if (newTodo.status === "in_progress") {
                    const oldTodo = state.todos.find((t) => t.id === newTodo.id)
                    if (oldTodo?.status === "in_progress" && oldTodo.inProgressSince) {
                        // Already in_progress → preserve existing timestamp
                        newTodo.inProgressSince = oldTodo.inProgressSince
                    } else {
                        // Newly in_progress → set timestamp to current turn
                        newTodo.inProgressSince = latestTodowriteTurn
                    }
                }
            }
            state.todos = latestTodos
            logger.info(`Updated todo list with ${latestTodos.length} items`)
        }

        // Remove any existing reminder from context since todo was updated
        removeTodoReminder(state, messages, logger)
        removeAutomataReflection(state, messages, logger)
    }

    // Supersede all old todoread calls except the latest
    if (latestTodoreadCallId && latestTodoreadCallId !== state.lastTodoreadCallId) {
        for (const { callId, turn } of allTodoreadCallIds) {
            if (callId === latestTodoreadCallId) continue
            if (state.softPrunedTools.has(callId)) continue // Already pruned

            const tokensSaved = supersedeToolCall(
                state,
                callId,
                messages,
                logger,
                "newer todoread exists",
            )
            if (tokensSaved > 0) {
                state.stats.strategyStats.autoSupersede.todo.count++
                state.stats.strategyStats.autoSupersede.todo.tokens += tokensSaved
                logger.info(
                    `[auto-supersede] ✅ todo: pruned old todoread ${callId} (turn ${turn})`,
                )
            }
        }

        state.lastTodoreadCallId = latestTodoreadCallId
        logger.info(
            `Detected NEW todoread (callId: ${latestTodoreadCallId}) at turn ${latestTodoreadTurn}`,
        )
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
