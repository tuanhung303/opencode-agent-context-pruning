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
const _FILE_TOOLS = ["read", "write", "edit", "glob", "grep"] as const
type _FileTool = (typeof _FILE_TOOLS)[number]
void (_FILE_TOOLS as readonly string[])
void (undefined as unknown as _FileTool)

/** State query commands that should only keep the latest execution */
const STATE_QUERY_PATTERNS = [
    /^ls\s/,
    /^ls$/,
    /^find\s/,
    /^pwd$/,
    /^git\s+status/,
    /^git\s+branch/,
    /^git\s+log/,
    /^tree\s/,
    /^tree$/,
] as const

/** Keys to preserve when stripping tool inputs (metadata only) */
const INPUT_METADATA_KEYS: Record<string, string[]> = {
    read: ["filePath", "offset", "limit"],
    write: ["filePath"],
    edit: ["filePath"],
    glob: ["pattern", "path"],
    grep: ["pattern", "path", "include"],
    bash: ["command", "description", "workdir"],
    webfetch: ["url", "format"],
    websearch: ["query"],
    task: ["description", "subagent_type"],
    skill: ["name"],
    todowrite: [], // Keep empty - output has the data
    todoread: [],
}

/**
 * Strip tool input to metadata-only object.
 * Removes verbose content like file contents, keeping only key identifiers.
 */
function stripInputToMetadata(
    tool: string,
    input: Record<string, unknown>,
): Record<string, unknown> {
    const keysToKeep = INPUT_METADATA_KEYS[tool] || Object.keys(input).slice(0, 3)
    const stripped: Record<string, unknown> = {}

    for (const key of keysToKeep) {
        if (input[key] !== undefined) {
            const value = input[key]
            // Truncate long string values
            if (typeof value === "string" && value.length > 100) {
                stripped[key] = value.slice(0, 97) + "..."
            } else {
                stripped[key] = value
            }
        }
    }

    return stripped
}

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
 * Extract URL key from webfetch/websearch params for URL-based supersede.
 * Returns null for non-URL tools.
 */
function extractUrlKey(tool: string, params: Record<string, unknown>): string | null {
    if (tool === "webfetch") {
        return (params.url as string) ?? null
    }
    if (tool === "websearch" || tool === "ddg-search_search" || tool === "google_search") {
        return `search:${(params.query as string) ?? ""}`
    }
    return null
}

/**
 * Check if a bash command matches a state query pattern.
 * Returns true if the command is a state query that should supersede previous identical calls.
 */
function isStateQueryCommand(command: string): boolean {
    return STATE_QUERY_PATTERNS.some((pattern) => pattern.test(command))
}

/**
 * Extract a normalized key from a bash state query command.
 * Returns null if not a state query.
 */
function extractStateQueryKey(params: Record<string, unknown>): string | null {
    const command = (params.command as string) ?? ""
    if (!isStateQueryCommand(command)) {
        return null
    }
    // Normalize: take first word + key arguments
    const parts = command.split(/\s+/)
    const cmd = parts[0]
    // For git commands, include subcommand
    if (cmd === "git" && parts[1]) {
        return `bash:${cmd}:${parts[1]}`
    }
    return `bash:${cmd}`
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
 * CRITICAL: Also strips state.input to metadata-only to fix input leak.
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

                // Clear the output to free memory
                if (part.state?.status === "completed") {
                    ;(part.state as any).output = `[auto-superseded: ${reason}]`
                }

                // FIX INPUT LEAK: Strip input to metadata-only
                if (part.state?.input) {
                    part.state.input = stripInputToMetadata(
                        part.tool,
                        part.state.input as Record<string, unknown>,
                    )
                }

                // Add to prune list so it gets filtered out
                if (!state.prune.toolIds.includes(callId)) {
                    state.prune.toolIds.push(callId)
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

                // Track context_prune tool completion and capture pruned content for status bar
                // DEDUPLICATION: Only track if we haven't already tracked this call ID
                if (part.tool === "context_prune" && part.state?.status === "completed") {
                    // Check if we've already processed this context call
                    const alreadyProcessed =
                        state.lastPrunedContent?.timestamp &&
                        state.cursors.context.lastCallId === part.callID

                    if (!alreadyProcessed) {
                        state.lastToolPrune = true

                        // Parse output to capture what was pruned BEFORE it gets superseded
                        const output = (part.state as any).output || ""
                        const prunedTools: string[] = []
                        let prunedMessages = 0
                        let prunedReasoning = 0

                        // Try multiple parsing strategies for different output formats

                        // Strategy 1: Parse "pruned: tool1, tool2, tool3..." format
                        const prunedMatch = output.match(/pruned:\s*([^|]+)/i)
                        if (prunedMatch) {
                            const toolList = prunedMatch[1]
                                .split(",")
                                .map((t: string) => t.trim().replace(/\.\.$/, ""))
                            for (const tool of toolList) {
                                if (tool && tool.length > 0 && !tool.includes(" ")) {
                                    prunedTools.push(tool)
                                }
                            }
                        }

                        // Strategy 2: Parse "⚙️ toolname" format (itemized details)
                        if (prunedTools.length === 0) {
                            const toolMatches = output.match(/⚙️\s*(\w+)/g)
                            if (toolMatches) {
                                for (const match of toolMatches) {
                                    const toolName = match.replace(/⚙️\s*/, "").trim()
                                    if (toolName) prunedTools.push(toolName)
                                }
                            }
                        }

                        // Count message prunes from output (💬 or "msg" in status)
                        const msgMatch = output.match(/💬/g) || output.match(/(\d+)\s*msg/i)
                        if (msgMatch) {
                            if (Array.isArray(msgMatch) && msgMatch[0]?.includes("💬")) {
                                prunedMessages = msgMatch.length
                            } else if (msgMatch[1]) {
                                prunedMessages = parseInt(msgMatch[1], 10) || 0
                            }
                        }

                        // Count reasoning prunes from output (🧠 or "thinking" in status)
                        const reasonMatch = output.match(/🧠/g) || output.match(/(\d+)\s*thinking/i)
                        if (reasonMatch) {
                            if (Array.isArray(reasonMatch) && reasonMatch[0]?.includes("🧠")) {
                                prunedReasoning = reasonMatch.length
                            } else if (reasonMatch[1]) {
                                prunedReasoning = parseInt(reasonMatch[1], 10) || 0
                            }
                        }

                        // Only store if something was actually pruned
                        if (prunedTools.length > 0 || prunedMessages > 0 || prunedReasoning > 0) {
                            state.lastPrunedContent = {
                                tools: prunedTools,
                                messages: prunedMessages,
                                reasoning: prunedReasoning,
                                timestamp: Date.now(),
                            }
                            logger.debug("Captured pruned content for status bar", {
                                tools: prunedTools.length,
                                messages: prunedMessages,
                                reasoning: prunedReasoning,
                                callId: part.callID,
                            })
                        }
                    }
                }

                // Skip if already cached
                if (state.toolParameters.has(part.callID)) {
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
                        state.hashRegistry.calls.has(baseHash) &&
                        state.hashRegistry.calls.get(baseHash) !== part.callID
                    ) {
                        const oldCallId = state.hashRegistry.calls.get(baseHash)!

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
                            state.hashRegistry.calls.delete(baseHash)
                            state.hashRegistry.callIds.delete(oldCallId)
                        }
                    }

                    // Store bidirectional mapping for new call
                    state.hashRegistry.calls.set(baseHash, part.callID)
                    state.hashRegistry.callIds.set(part.callID, baseHash)

                    // === FILE-BASED SUPERSEDE (ONE-FILE-ONE-VIEW) ===
                    // Any file operation supersedes ALL previous operations on the same file
                    const fileKey = extractFileKey(part.tool, part.state?.input ?? {})
                    if (fileKey && part.state?.status === "completed") {
                        const aggressiveFilePrune =
                            config.strategies.aggressivePruning?.aggressiveFilePrune ?? true

                        // One-file-one-view: ANY file op supersedes all previous (not just write→read)
                        const existingCallIds = state.cursors.files.pathToCallIds.get(fileKey)
                        if (existingCallIds) {
                            for (const oldCallId of existingCallIds) {
                                if (oldCallId === part.callID) continue
                                const oldParams = state.toolParameters.get(oldCallId)
                                if (
                                    oldParams &&
                                    oldParams.status === "completed" &&
                                    oldParams.turn < turnCounter
                                ) {
                                    // In aggressive mode, any file op supersedes
                                    // In legacy mode, only write/edit supersedes
                                    if (aggressiveFilePrune || isWriteTool(part.tool)) {
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
                            }
                            // Clear old entries when superseding
                            if (aggressiveFilePrune || isWriteTool(part.tool)) {
                                existingCallIds.clear()
                            }
                        }

                        // Track this call for the file
                        if (!state.cursors.files.pathToCallIds.has(fileKey)) {
                            state.cursors.files.pathToCallIds.set(fileKey, new Set())
                        }
                        state.cursors.files.pathToCallIds.get(fileKey)!.add(part.callID)
                    }

                    // === URL-BASED SUPERSEDE ===
                    // Supersede older webfetch/websearch calls for the same URL/query
                    const urlKey = extractUrlKey(part.tool, part.state?.input ?? {})
                    if (urlKey && part.state?.status === "completed") {
                        const pruneSourceUrls =
                            config.strategies.aggressivePruning?.pruneSourceUrls ?? true
                        const existingUrlCallIds = state.cursors.urls.urlToCallIds.get(urlKey)

                        if (pruneSourceUrls && existingUrlCallIds) {
                            for (const oldCallId of existingUrlCallIds) {
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
                                        `URL superseded by ${part.tool}`,
                                    )
                                    state.stats.strategyStats.autoSupersede.url.count++
                                    state.stats.strategyStats.autoSupersede.url.tokens +=
                                        tokensSaved
                                    logger.info(
                                        `[auto-supersede] 🔗 URL ${urlKey.slice(0, 50)}: ${oldParams.tool} ${oldCallId} superseded by ${part.tool}`,
                                    )
                                }
                            }
                            existingUrlCallIds.clear()
                        }

                        // Track this call for the URL
                        if (!state.cursors.urls.urlToCallIds.has(urlKey)) {
                            state.cursors.urls.urlToCallIds.set(urlKey, new Set())
                        }
                        state.cursors.urls.urlToCallIds.get(urlKey)!.add(part.callID)
                    }

                    // === STATE QUERY SUPERSEDE ===
                    // Keep only the latest state query (ls, find, git status, etc.)
                    if (part.tool === "bash" && part.state?.status === "completed") {
                        const stateQuerySupersede =
                            config.strategies.aggressivePruning?.stateQuerySupersede ?? true
                        const stateQueryKey = extractStateQueryKey(
                            part.state?.input as Record<string, unknown>,
                        )

                        if (stateQuerySupersede && stateQueryKey) {
                            const existingQueryCallIds =
                                state.cursors.stateQueries.queryToCallIds.get(stateQueryKey)
                            if (existingQueryCallIds) {
                                for (const oldCallId of existingQueryCallIds) {
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
                                            `state query superseded by ${part.tool}`,
                                        )
                                        state.stats.strategyStats.autoSupersede.stateQuery.count++
                                        state.stats.strategyStats.autoSupersede.stateQuery.tokens +=
                                            tokensSaved
                                        logger.info(
                                            `[auto-supersede] 📊 query ${stateQueryKey}: ${oldParams.tool} ${oldCallId} superseded`,
                                        )
                                    }
                                }
                                existingQueryCallIds.clear()
                            }

                            // Track this call
                            if (!state.cursors.stateQueries.queryToCallIds.has(stateQueryKey)) {
                                state.cursors.stateQueries.queryToCallIds.set(
                                    stateQueryKey,
                                    new Set(),
                                )
                            }
                            state.cursors.stateQueries.queryToCallIds
                                .get(stateQueryKey)!
                                .add(part.callID)
                        }
                    }

                    // === SNAPSHOT AUTO-SUPERSEDE ===
                    // Keep only the latest snapshot
                    if (part.tool === "snapshot" && part.state?.status === "completed") {
                        const pruneSnapshots =
                            config.strategies.aggressivePruning?.pruneSnapshots ?? true
                        const allSnapshotIds = state.cursors.snapshots.allCallIds

                        if (pruneSnapshots) {
                            for (const oldCallId of allSnapshotIds) {
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
                                        "snapshot superseded by newer snapshot",
                                    )
                                    state.stats.strategyStats.autoSupersede.snapshot.count++
                                    state.stats.strategyStats.autoSupersede.snapshot.tokens +=
                                        tokensSaved
                                    logger.info(
                                        `[auto-supersede] 📸 snapshot ${oldCallId} superseded by ${part.callID}`,
                                    )
                                }
                            }
                            allSnapshotIds.clear()
                        }

                        allSnapshotIds.add(part.callID)
                        state.cursors.snapshots.latestCallId = part.callID
                    }

                    // === RETRY AUTO-PRUNE ===
                    // Detect tool error→retry sequences and prune failed attempts
                    const pruneRetryParts =
                        config.strategies.aggressivePruning?.pruneRetryParts ?? true
                    if (pruneRetryParts && part.state?.status === "completed") {
                        const toolHash = baseHash
                        const pendingRetries = state.cursors.retries.pendingRetries.get(toolHash)

                        if (pendingRetries && pendingRetries.length > 0) {
                            // This is a successful retry - prune all failed attempts
                            for (const failedCallId of pendingRetries) {
                                if (failedCallId === part.callID) continue
                                const tokensSaved = supersedeToolCall(
                                    state,
                                    failedCallId,
                                    messages,
                                    logger,
                                    "retry succeeded - pruning failed attempt",
                                )
                                state.stats.strategyStats.autoSupersede.retry.count++
                                state.stats.strategyStats.autoSupersede.retry.tokens += tokensSaved
                                logger.info(
                                    `[auto-supersede] 🔄 retry ${failedCallId} pruned after successful ${part.callID}`,
                                )
                            }
                            state.cursors.retries.pendingRetries.delete(toolHash)
                        }
                    } else if (pruneRetryParts && part.state?.status === "error") {
                        // Track failed attempts for potential retry pruning
                        const toolHash = baseHash
                        if (!state.cursors.retries.pendingRetries.has(toolHash)) {
                            state.cursors.retries.pendingRetries.set(toolHash, [])
                        }
                        state.cursors.retries.pendingRetries.get(toolHash)!.push(part.callID)
                    }
                }

                state.toolParameters.set(part.callID, {
                    tool: part.tool,
                    parameters: part.state?.input ?? {},
                    status: part.state.status as ToolStatus | undefined,
                    error: part.state.status === "error" ? part.state.error : undefined,
                    turn: turnCounter,
                })

                const hash = state.hashRegistry.callIds.get(part.callID) || "(protected)"
                logger.info(`Cached tool id: ${part.callID} hash: ${hash} (turn ${turnCounter})`)
            }
        }

        logger.info(
            `Synced cache - size: ${state.toolParameters.size}, hashes: ${state.hashRegistry.calls.size}, currentTurn: ${state.currentTurn}`,
        )
        trimToolParametersCache(state)

        // Track todowrite/todoread interactions after tool cache sync (includes todo supersede)
        trackTodoInteractions(state, messages, logger)

        // Track context tool interactions for auto-supersede
        trackContextInteractions(state, messages, logger)
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
                    let todos: TodoItem[] | null = null
                    if (typeof content === "string") {
                        todos = JSON.parse(content) as TodoItem[]
                    } else if (Array.isArray(content)) {
                        todos = content as TodoItem[]
                    }
                    if (todos && Array.isArray(todos)) {
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
    if (latestTodowriteCallId && latestTodowriteCallId !== state.cursors.todo.lastWriteCallId) {
        for (const { callId, turn } of allTodowriteCallIds) {
            if (callId === latestTodowriteCallId) continue
            if (state.prune.toolIds.includes(callId)) continue // Already pruned

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

        state.cursors.todo.lastWriteCallId = latestTodowriteCallId
        state.cursors.todo.lastTurn = latestTodowriteTurn
        state.cursors.todo.lastReminderTurn = 0 // Reset reminder cycle

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
    if (latestTodoreadCallId && latestTodoreadCallId !== state.cursors.todo.lastReadCallId) {
        for (const { callId, turn } of allTodoreadCallIds) {
            if (callId === latestTodoreadCallId) continue
            if (state.prune.toolIds.includes(callId)) continue // Already pruned

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

        state.cursors.todo.lastReadCallId = latestTodoreadCallId
        logger.info(
            `Detected NEW todoread (callId: ${latestTodoreadCallId}) at turn ${latestTodoreadTurn}`,
        )
    }
}

/**
 * Track context tool interactions for auto-supersede.
 * Supersedes all old context calls except the latest.
 */
function trackContextInteractions(
    state: SessionState,
    messages: WithParts[],
    logger: Logger,
): void {
    let latestContextCallId: string | null = null
    let latestContextTurn = 0
    let turnCounter = 0

    // Collect all context call IDs for supersede
    const allContextCallIds: Array<{ callId: string; turn: number }> = []

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

            // Track context_prune calls
            if (part.tool === "context_prune" && part.state?.status === "completed") {
                allContextCallIds.push({ callId: part.callID, turn: turnCounter })
                latestContextCallId = part.callID
                latestContextTurn = turnCounter
            }
        }
    }

    // === CONTEXT-BASED SUPERSEDE ===
    // Supersede all old context calls except the latest
    if (latestContextCallId && latestContextCallId !== state.cursors.context.lastCallId) {
        for (const { callId, turn } of allContextCallIds) {
            if (callId === latestContextCallId) continue
            if (state.prune.toolIds.includes(callId)) continue // Already pruned

            const tokensSaved = supersedeToolCall(
                state,
                callId,
                messages,
                logger,
                "newer context exists",
            )
            if (tokensSaved > 0) {
                state.stats.strategyStats.autoSupersede.context.count++
                state.stats.strategyStats.autoSupersede.context.tokens += tokensSaved
                logger.info(
                    `[auto-supersede] 🔧 context: pruned old context ${callId} (turn ${turn})`,
                )
            }
        }

        state.cursors.context.lastCallId = latestContextCallId
        logger.info(
            `Detected NEW context (callId: ${latestContextCallId}) at turn ${latestContextTurn}`,
        )
    }
}

/**
 * Trim the tool parameters cache to prevent unbounded memory growth.
 * Uses FIFO eviction - removes oldest entries first.
 * Also cleans up corresponding hash mappings and cursor references to prevent memory leaks.
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
        const hash = state.hashRegistry.callIds.get(callId)
        if (hash) {
            state.hashRegistry.calls.delete(hash)
            state.hashRegistry.callIds.delete(callId)
        }

        // Clean up cursor references to prevent dangling pointers
        // Files cursor: remove from all path-to-callId mappings
        for (const [path, callIds] of state.cursors.files.pathToCallIds) {
            if (callIds.has(callId)) {
                callIds.delete(callId)
                if (callIds.size === 0) {
                    state.cursors.files.pathToCallIds.delete(path)
                }
            }
        }

        // URLs cursor: remove from all url-to-callId mappings
        for (const [url, callIds] of state.cursors.urls.urlToCallIds) {
            if (callIds.has(callId)) {
                callIds.delete(callId)
                if (callIds.size === 0) {
                    state.cursors.urls.urlToCallIds.delete(url)
                }
            }
        }

        // State queries cursor: remove from all query-to-callId mappings
        for (const [query, callIds] of state.cursors.stateQueries.queryToCallIds) {
            if (callIds.has(callId)) {
                callIds.delete(callId)
                if (callIds.size === 0) {
                    state.cursors.stateQueries.queryToCallIds.delete(query)
                }
            }
        }

        // Snapshots cursor: remove from Set and clear latestCallId if needed
        if (state.cursors.snapshots.allCallIds.has(callId)) {
            state.cursors.snapshots.allCallIds.delete(callId)
            if (state.cursors.snapshots.latestCallId === callId) {
                // Find the next latest snapshot (most recent in Set)
                const remainingSnapshots = Array.from(state.cursors.snapshots.allCallIds)
                const nextLatest: string | null =
                    remainingSnapshots.length > 0
                        ? (remainingSnapshots[remainingSnapshots.length - 1] ?? null)
                        : null
                state.cursors.snapshots.latestCallId = nextLatest
            }
        }

        // Context cursor: clear lastCallId if it was evicted
        if (state.cursors.context.lastCallId === callId) {
            state.cursors.context.lastCallId = null
        }

        // Todo cursor: clear last write/read call IDs if they were evicted
        if (state.cursors.todo.lastWriteCallId === callId) {
            state.cursors.todo.lastWriteCallId = null
        }
        if (state.cursors.todo.lastReadCallId === callId) {
            state.cursors.todo.lastReadCallId = null
        }

        // Retries cursor: remove from all pending retry arrays
        for (const [toolHash, failedCallIds] of state.cursors.retries.pendingRetries) {
            const index = failedCallIds.indexOf(callId)
            if (index !== -1) {
                failedCallIds.splice(index, 1)
                if (failedCallIds.length === 0) {
                    state.cursors.retries.pendingRetries.delete(toolHash)
                }
            }
        }
    }
}
