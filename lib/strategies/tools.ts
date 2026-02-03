import { tool } from "@opencode-ai/plugin"
import type { SessionState, ToolParameterEntry, WithParts } from "../state"
import type { PluginConfig } from "../config"
import { sendUnifiedNotification } from "../ui/notification"
import { formatDiscardNotification } from "../ui/minimal-notifications"
import { formatPruningStatus, dimText } from "../ui/pruning-status"
import { ensureSessionInitialized } from "../state"
import { saveSessionState } from "../state/persistence"
import type { Logger } from "../logger"
import { loadPrompt } from "../prompts"
import { calculateTokensSaved, getCurrentParams } from "./utils"
import {
    findMessagesByPattern,
    storePatternMapping,
    restoreByPattern,
} from "../messages/pattern-match"
import { detectTargetType } from "../messages/utils"

export interface PruneToolContext {
    client: any
    state: SessionState
    logger: Logger
    config: PluginConfig
    workingDirectory: string
}

/**
 * Execute a prune operation for tool outputs.
 */
async function executeToolPrune(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    callIds: string[],
    hashes: string[],
    toolName: string,
): Promise<string> {
    const { client, state, logger, config, workingDirectory } = ctx
    const sessionId = toolCtx.sessionID

    logger.info(`${toolName} tool invoked`)
    logger.info(JSON.stringify({ hashes, toolCount: callIds.length }))

    if (!callIds || callIds.length === 0) {
        logger.debug(`${toolName} tool called but no valid call IDs resolved`)
        throw new Error(`No valid hashes provided. Use hashes from tool outputs (e.g., r_a1b2c).`)
    }

    // Fetch messages to calculate tokens
    const messagesResponse = await client.session.messages({
        path: { id: sessionId },
    })
    const messages: WithParts[] = messagesResponse.data || messagesResponse

    await ensureSessionInitialized(ctx.client, state, sessionId, logger, messages)

    const currentParams = getCurrentParams(state, messages, logger)

    // Validate that all call IDs exist in cache and aren't protected
    for (const callId of callIds) {
        const metadata = state.toolParameters.get(callId)
        if (!metadata) {
            const hash = state.callIdToHash.get(callId) || "unknown"
            logger.debug("Rejecting prune request - call ID not in cache", { callId, hash })
            throw new Error(`Invalid hash provided. The tool may have already been discarded.`)
        }

        const allProtectedTools = config.tools.settings.protectedTools
        if (allProtectedTools.includes(metadata.tool)) {
            const hash = state.callIdToHash.get(callId) || "unknown"
            logger.debug("Rejecting prune request - protected tool", {
                callId,
                hash,
                tool: metadata.tool,
            })
            throw new Error(
                `Cannot discard: '${metadata.tool}' is a protected tool.\n` +
                    `Protected tools: ${allProtectedTools.join(", ")}\n` +
                    `To modify protection, update 'tools.settings.protectedTools' in your ACP config.`,
            )
        }
    }

    // Add to prune lists
    state.prune.toolIds.push(...callIds)

    // Collect metadata for notification
    const toolMetadata = new Map<string, ToolParameterEntry>()
    const prunedToolNames: string[] = []
    for (const callId of callIds) {
        const toolParameters = state.toolParameters.get(callId)
        if (toolParameters) {
            toolMetadata.set(callId, toolParameters)
            prunedToolNames.push(toolParameters.tool)
        } else {
            logger.debug("No metadata found for call ID", { callId })
        }
    }

    // Calculate token savings
    const tokensSaved = calculateTokensSaved(state, messages, callIds, [])
    state.stats.pruneTokenCounter += tokensSaved
    state.stats.pruneMessageCounter += callIds.length

    // Track strategy effectiveness
    state.stats.strategyStats.manualDiscard.count += callIds.length
    state.stats.strategyStats.manualDiscard.tokens += tokensSaved

    // Store stats for display
    state.lastDiscardStats = {
        itemCount: callIds.length,
        tokensSaved: state.stats.pruneTokenCounter,
    }

    // Record in discard history
    state.discardHistory.push({
        timestamp: Date.now(),
        hashes,
        tokensSaved,
        reason: "manual",
    })

    await sendUnifiedNotification(
        client,
        logger,
        config,
        state,
        sessionId,
        callIds,
        toolMetadata,
        "manual",
        currentParams,
        workingDirectory,
        undefined,
        { simplified: true },
        [],
    )

    state.stats.totalPruneTokens += state.stats.pruneTokenCounter
    state.stats.pruneTokenCounter = 0
    state.stats.totalPruneMessages += state.stats.pruneMessageCounter
    state.stats.pruneMessageCounter = 0

    saveSessionState(state, logger).catch((err) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    // Build TUI inline notification
    const tuiStatus = formatPruningStatus(prunedToolNames, [])
    const tuiNotification = tuiStatus ? dimText(tuiStatus) : ""

    // Return minimal single-line notification with TUI status
    const minimalNotification = formatDiscardNotification(callIds.length, "manual")
    return tuiNotification ? `${minimalNotification}\n${tuiNotification}` : minimalNotification
}

/**
 * Execute a distill operation for tool outputs.
 */
async function executeToolDistill(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    callIds: string[],
    hashes: string[],
    distillation: string[],
): Promise<string> {
    const { client, state, logger, config, workingDirectory } = ctx
    const sessionId = toolCtx.sessionID

    logger.info("Distill tool invoked")
    logger.info(JSON.stringify({ hashes, toolCount: callIds.length }))

    if (!callIds || callIds.length === 0) {
        logger.debug("Distill tool called but no valid call IDs resolved")
        throw new Error(`No valid hashes provided. Use hashes from tool outputs (e.g., r_a1b2c).`)
    }

    // Fetch messages to calculate tokens
    const messagesResponse = await client.session.messages({
        path: { id: sessionId },
    })
    const messages: WithParts[] = messagesResponse.data || messagesResponse

    await ensureSessionInitialized(ctx.client, state, sessionId, logger, messages)

    const currentParams = getCurrentParams(state, messages, logger)

    // Validate that all call IDs exist in cache and aren't protected
    for (const callId of callIds) {
        const metadata = state.toolParameters.get(callId)
        if (!metadata) {
            const hash = state.callIdToHash.get(callId) || "unknown"
            logger.debug("Rejecting distill request - call ID not in cache", { callId, hash })
            throw new Error(`Invalid hash provided. The tool may have already been discarded.`)
        }

        const allProtectedTools = config.tools.settings.protectedTools
        if (allProtectedTools.includes(metadata.tool)) {
            const hash = state.callIdToHash.get(callId) || "unknown"
            logger.debug("Rejecting distill request - protected tool", {
                callId,
                hash,
                tool: metadata.tool,
            })
            throw new Error(
                `Cannot distill: '${metadata.tool}' is a protected tool.\n` +
                    `Protected tools: ${allProtectedTools.join(", ")}`,
            )
        }
    }

    // Add to prune lists
    state.prune.toolIds.push(...callIds)

    // Collect metadata for notification
    const toolMetadata = new Map<string, ToolParameterEntry>()
    const prunedToolNames: string[] = []
    for (const callId of callIds) {
        const toolParameters = state.toolParameters.get(callId)
        if (toolParameters) {
            toolMetadata.set(callId, toolParameters)
            prunedToolNames.push(toolParameters.tool)
        } else {
            logger.debug("No metadata found for call ID", { callId })
        }
    }

    // Calculate token savings
    const tokensSaved = calculateTokensSaved(state, messages, callIds, [])
    state.stats.pruneTokenCounter += tokensSaved
    state.stats.pruneMessageCounter += callIds.length

    // Track strategy effectiveness
    state.stats.strategyStats.distillation.count += callIds.length
    state.stats.strategyStats.distillation.tokens += tokensSaved

    // Store stats for display
    state.lastDiscardStats = {
        itemCount: callIds.length,
        tokensSaved: state.stats.pruneTokenCounter,
    }

    // Record in discard history
    state.discardHistory.push({
        timestamp: Date.now(),
        hashes,
        tokensSaved,
        reason: "distillation",
    })

    // Log the distillation for debugging/analysis
    logger.info("Distillation data received:")
    logger.info(JSON.stringify(distillation, null, 2))

    await sendUnifiedNotification(
        client,
        logger,
        config,
        state,
        sessionId,
        callIds,
        toolMetadata,
        "distillation",
        currentParams,
        workingDirectory,
        distillation,
        { simplified: true },
        [],
    )

    state.stats.totalPruneTokens += state.stats.pruneTokenCounter
    state.stats.pruneTokenCounter = 0
    state.stats.totalPruneMessages += state.stats.pruneMessageCounter
    state.stats.pruneMessageCounter = 0

    saveSessionState(state, logger).catch((err) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    // Build TUI inline notification
    const tuiStatus = formatPruningStatus(prunedToolNames, distillation)
    const tuiNotification = tuiStatus ? dimText(tuiStatus) : ""

    // Return minimal single-line notification with TUI status
    const minimalNotification = formatDiscardNotification(callIds.length, "distillation")
    return tuiNotification ? `${minimalNotification}\n${tuiNotification}` : minimalNotification
}

// ============================================================================
// UNIFIED CONTEXT TOOL
// ============================================================================

const CONTEXT_TOOL_SPEC = loadPrompt("context-spec")

/**
 * Execute context operation (discard, distill, restore) with unified interface.
 * Supports mixed targets: tool hashes and message patterns in single call.
 */
async function executeContext(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    action: "discard" | "distill" | "restore",
    targets: Array<[string] | [string, string]>,
): Promise<string> {
    const { client, state, logger } = ctx
    const sessionId = toolCtx.sessionID

    logger.info(`Context tool invoked: ${action}`)
    logger.info(JSON.stringify({ action, targetCount: targets.length }))

    if (!targets || targets.length === 0) {
        throw new Error(
            `No targets provided. Provide an array of [target] or [target, summary] tuples.`,
        )
    }

    // Fetch messages for message pattern matching
    const messagesResponse = await client.session.messages({
        path: { id: sessionId },
    })
    const messages: WithParts[] = messagesResponse.data || messagesResponse

    await ensureSessionInitialized(ctx.client, state, sessionId, logger, messages)

    // Separate targets by type
    const toolHashes: string[] = []
    const toolSummaries: string[] = []
    const messagePatterns: string[] = []
    const messageSummaries: string[] = []

    for (const tuple of targets) {
        const target = tuple[0]
        const summary = tuple[1]

        const targetType = detectTargetType(target)
        if (targetType === "tool_hash") {
            toolHashes.push(target)
            if (action === "distill") {
                if (!summary) {
                    throw new Error(`Summary required for distill action on target: ${target}`)
                }
                toolSummaries.push(summary)
            }
        } else {
            messagePatterns.push(target)
            if (action === "distill") {
                if (!summary) {
                    throw new Error(`Summary required for distill action on pattern: ${target}`)
                }
                messageSummaries.push(summary)
            }
        }
    }

    // Execute based on action
    let toolResult = ""
    let messageResult = ""

    if (action === "discard") {
        if (toolHashes.length > 0) {
            toolResult = await executeContextToolDiscard(ctx, toolCtx, toolHashes)
        }
        if (messagePatterns.length > 0) {
            messageResult = await executeContextMessageDiscard(
                ctx,
                toolCtx,
                messagePatterns,
                messages,
            )
        }
    } else if (action === "distill") {
        if (toolHashes.length > 0) {
            toolResult = await executeContextToolDistill(ctx, toolCtx, toolHashes, toolSummaries)
        }
        if (messagePatterns.length > 0) {
            messageResult = await executeContextMessageDistill(
                ctx,
                toolCtx,
                messagePatterns.map((p, i) => [p, messageSummaries[i]] as [string, string]),
                messages,
            )
        }
    } else if (action === "restore") {
        if (toolHashes.length > 0) {
            toolResult = await executeContextToolRestore(ctx, toolHashes)
        }
        if (messagePatterns.length > 0) {
            messageResult = await executeContextMessageRestore(ctx, messagePatterns)
        }
    }

    // Combine results
    const results = [toolResult, messageResult].filter(Boolean)
    return results.join("\n") || `${action} completed: 0 items processed`
}

/**
 * Discard tool outputs by hash.
 */
async function executeContextToolDiscard(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    hashes: string[],
): Promise<string> {
    const { state, logger } = ctx

    // Resolve hashes to call IDs
    const callIds: string[] = []
    const validHashes: string[] = []

    for (const hash of hashes) {
        const callId = state.hashToCallId.get(hash)
        if (callId) {
            if (!state.prune.toolIds.includes(callId)) {
                callIds.push(callId)
                validHashes.push(hash)
            } else {
                logger.debug(`Hash ${hash} already pruned, skipping`)
            }
        } else {
            logger.warn(`Unknown hash: ${hash}`)
        }
    }

    if (validHashes.length === 0) {
        return "No valid tool hashes to discard"
    }

    // Use existing prune logic
    return executeToolPrune(ctx, toolCtx, callIds, validHashes, "Discard")
}

/**
 * Discard messages by pattern.
 */
async function executeContextMessageDiscard(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    patterns: string[],
    messages: WithParts[],
): Promise<string> {
    const { state, logger } = ctx

    // Find matching messages
    const allMatches: Array<{
        messageId: string
        partIndex: number
        content: string
        pattern: string
    }> = []

    for (const pattern of patterns) {
        const matches = findMessagesByPattern(messages, pattern)
        for (const match of matches) {
            allMatches.push({ ...match, pattern })
        }
    }

    if (allMatches.length === 0) {
        return "No matching messages found"
    }

    // Add to prune list and store pattern mapping for symmetric restore
    let discardedCount = 0
    for (const match of allMatches) {
        const partId = `${match.messageId}:${match.partIndex}`
        if (!state.prune.messagePartIds.includes(partId)) {
            state.prune.messagePartIds.push(partId)

            // Store pattern mapping for symmetric restore
            storePatternMapping(match.pattern, match.content, partId, state)

            logger.info(`Discarded message part ${partId} via pattern`)
            discardedCount++
        }
    }

    // Save state
    saveSessionState(state, logger).catch((err) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    return `Discarded ${discardedCount} message(s)`
}

/**
 * Distill tool outputs by hash.
 */
async function executeContextToolDistill(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    hashes: string[],
    distillation: string[],
): Promise<string> {
    const { state, logger } = ctx

    // Resolve hashes
    const callIds: string[] = []
    const validHashes: string[] = []
    const validDistillation: string[] = []

    for (let i = 0; i < hashes.length; i++) {
        const hash = hashes[i]!
        const summary = distillation[i]
        if (!summary) {
            logger.warn(`No summary provided for hash: ${hash}`)
            continue
        }
        const callId = state.hashToCallId.get(hash)
        if (callId) {
            if (!state.prune.toolIds.includes(callId)) {
                callIds.push(callId)
                validHashes.push(hash)
                validDistillation.push(summary)
            } else {
                logger.debug(`Hash ${hash} already pruned, skipping`)
            }
        } else {
            logger.warn(`Unknown hash: ${hash}`)
        }
    }

    if (validHashes.length === 0) {
        return "No valid tool hashes to distill"
    }

    return executeToolDistill(ctx, toolCtx, callIds, validHashes, validDistillation)
}

/**
 * Distill messages by pattern.
 */
async function executeContextMessageDistill(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    entries: Array<[string, string]>,
    messages: WithParts[],
): Promise<string> {
    const { state, logger } = ctx

    let distilledCount = 0

    for (const [pattern, summary] of entries) {
        const matches = findMessagesByPattern(messages, pattern)
        for (const match of matches) {
            const partId = `${match.messageId}:${match.partIndex}`
            if (!state.prune.messagePartIds.includes(partId)) {
                state.prune.messagePartIds.push(partId)

                // Store pattern mapping with distilled content
                storePatternMapping(pattern, summary, partId, state)

                logger.info(`Distilled message part ${partId} via pattern`)
                distilledCount++
            }
        }
    }

    saveSessionState(state, logger).catch((err) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    return `Distilled ${distilledCount} message(s)`
}

/**
 * Restore tool outputs by hash.
 */
async function executeContextToolRestore(ctx: PruneToolContext, hashes: string[]): Promise<string> {
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

    saveSessionState(state, logger).catch((err) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    return `Restored ${restored.length} tool(s)`
}

/**
 * Restore messages by pattern (symmetric restore).
 */
async function executeContextMessageRestore(
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

    saveSessionState(state, logger).catch((err) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    return `Restored ${restored.length} message(s)`
}

/**
 * Create the unified context tool.
 */
export function createContextTool(ctx: PruneToolContext): ReturnType<typeof tool> {
    return tool({
        description: CONTEXT_TOOL_SPEC,
        args: {
            action: tool.schema
                .enum(["discard", "distill", "restore"])
                .describe("The action to perform: discard, distill, or restore"),
            targets: tool.schema
                .array(
                    tool.schema.union([
                        tool.schema.tuple([
                            tool.schema.string().describe("Target identifier (hash or pattern)"),
                        ]),
                        tool.schema.tuple([
                            tool.schema.string().describe("Target identifier (hash or pattern)"),
                            tool.schema.string().describe("Summary for distill action"),
                        ]),
                    ]),
                )
                .describe(
                    "Array of [target] or [target, summary] tuples. Use [target] for discard/restore, [target, summary] for distill.",
                ),
        },
        async execute(args, toolCtx) {
            const { action, targets } = args
            return executeContext(
                ctx,
                toolCtx,
                action,
                targets as Array<[string] | [string, string]>,
            )
        },
    })
}
