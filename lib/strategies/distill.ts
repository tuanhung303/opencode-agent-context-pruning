/**
 * Distill operations for tool outputs and messages.
 */

import type { PruneToolContext } from "./_types"
import type { SessionState, ToolParameterEntry, WithParts } from "../state"
import { ensureSessionInitialized } from "../state"
import { saveSessionState } from "../state/persistence"
import { sendUnifiedNotification } from "../ui/notification"
import { formatDiscardNotification } from "../ui/minimal-notifications"
import { formatPruningStatus, dimText } from "../ui/pruning-status"
import { calculateTokensSaved, getCurrentParams } from "./utils"
import { collectAllToolHashes, collectAllMessageHashes } from "../messages/utils"
import type { BulkTargetType } from "./_types"

/**
 * Core distill operation for tool outputs.
 */
export async function executeToolDistill(
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

    const messagesResponse = await client.session.messages({
        path: { id: sessionId },
    })
    const messages: WithParts[] = (messagesResponse.data || messagesResponse) as WithParts[]

    await ensureSessionInitialized(ctx.client, state, sessionId, logger, messages)

    const currentParams = getCurrentParams(state, messages, logger)

    validateCallIds(state, callIds, config, logger)

    // Add to prune lists
    state.prune.toolIds.push(...callIds)

    // Collect metadata
    const toolMetadata = new Map<string, ToolParameterEntry>()
    const prunedToolNames: string[] = []
    for (const callId of callIds) {
        const toolParameters = state.toolParameters.get(callId)
        if (toolParameters) {
            toolMetadata.set(callId, toolParameters)
            prunedToolNames.push(toolParameters.tool)
        }
    }

    // Calculate savings
    const tokensSaved = calculateTokensSaved(state, messages, callIds, [])
    updateStats(state, callIds.length, tokensSaved)

    // Record in history
    state.discardHistory.push({
        timestamp: Date.now(),
        hashes,
        tokensSaved,
        reason: "distillation",
    })

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

    commitStats(state)

    saveSessionState(state, logger).catch((err: Error) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    // Build notification
    const tuiStatus = formatPruningStatus(prunedToolNames, distillation)
    const tuiNotification = tuiStatus ? dimText(tuiStatus) : ""
    const minimalNotification = formatDiscardNotification(callIds.length, "distillation")

    return tuiNotification ? `${minimalNotification}\n${tuiNotification}` : minimalNotification
}

/**
 * Distill tool outputs by hash (context tool variant).
 */
export async function executeContextToolDistill(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    hashes: string[],
    distillation: string[],
): Promise<string> {
    const { state, logger } = ctx

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
 * Distill message parts by hash.
 */
export async function executeContextMessageDistill(
    ctx: PruneToolContext,
    _toolCtx: { sessionID: string },
    entries: Array<[string, string]>,
): Promise<string> {
    const { state, logger } = ctx

    let distilledCount = 0

    for (const [hash, summary] of entries) {
        const partId = state.hashToMessagePart.get(hash)
        if (partId) {
            if (!state.prune.messagePartIds.includes(partId)) {
                state.prune.messagePartIds.push(partId)
                // Parse partId to get messageId and partIndex
                const [messageId, partIndexStr] = partId.split(":")
                const partIndex = parseInt(partIndexStr!, 10)
                // Store the summary as soft-pruned content for restore capability
                state.softPrunedMessages.set(partId, {
                    content: summary,
                    messageId: messageId!,
                    partIndex: partIndex,
                    prunedAt: Date.now(),
                    hash: hash,
                })
                logger.info(`Distilled message part ${partId} via hash ${hash}`)
                distilledCount++
            }
        } else {
            logger.warn(`Unknown message hash: ${hash}`)
        }
    }

    saveSessionState(state, logger).catch((err: Error) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    return `Distilled ${distilledCount} message(s)`
}

// ============================================================================
// Helpers
// ============================================================================

function validateCallIds(
    state: SessionState,
    callIds: string[],
    config: { tools: { settings: { protectedTools: string[] } } },
    logger: {
        debug: (msg: string, data?: Record<string, unknown>) => void
        warn: (msg: string) => void
    },
): void {
    const allProtectedTools = config.tools.settings.protectedTools

    for (const callId of callIds) {
        const metadata = state.toolParameters.get(callId)
        if (!metadata) {
            const hash = state.callIdToHash.get(callId) || "unknown"
            logger.debug("Rejecting distill request - call ID not in cache", { callId, hash })
            throw new Error(`Invalid hash provided. The tool may have already been discarded.`)
        }

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
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Execute bulk distill operation for tools, messages, or all eligible items.
 * Collects all eligible items based on bulkType and applies a single summary to all.
 *
 * @param ctx - Prune tool context
 * @param toolCtx - Tool context with session ID
 * @param bulkType - Type of bulk operation: "bulk_tools", "bulk_messages", or "bulk_all"
 * @param summary - Single summary to apply to all distilled items
 * @returns Status message describing what was distilled
 */
export async function executeBulkDistill(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    bulkType: BulkTargetType,
    summary: string,
): Promise<string> {
    const { state, logger, config } = ctx

    if (!summary) {
        throw new Error("Summary is required for bulk distill operations")
    }

    const results: string[] = []

    // Handle tools
    if (bulkType === "bulk_tools" || bulkType === "bulk_all") {
        const toolHashes = collectAllToolHashes(state, config)
        if (toolHashes.length > 0) {
            logger.info(`Bulk distill: collecting ${toolHashes.length} tool hashes`)
            // Create array of same summary repeated for each hash
            const distillations = toolHashes.map(() => summary)
            const toolResult = await executeContextToolDistill(
                ctx,
                toolCtx,
                toolHashes,
                distillations,
            )
            results.push(toolResult)
        } else {
            results.push("No eligible tool outputs to distill")
        }
    }

    // Handle messages
    if (bulkType === "bulk_messages" || bulkType === "bulk_all") {
        const messageHashes = collectAllMessageHashes(state)
        if (messageHashes.length > 0) {
            logger.info(`Bulk distill: collecting ${messageHashes.length} message hashes`)
            // Directly distill message parts using collected hashes
            let distilledCount = 0
            for (const hash of messageHashes) {
                const partId = state.hashToMessagePart.get(hash)
                if (partId && !state.prune.messagePartIds.includes(partId)) {
                    state.prune.messagePartIds.push(partId)
                    logger.info(`Bulk distilled message part ${partId}`)
                    distilledCount++
                }
            }
            if (distilledCount > 0) {
                saveSessionState(state, logger).catch((err: Error) =>
                    logger.error("Failed to persist state", { error: err.message }),
                )
                results.push(`Distilled ${distilledCount} message(s)`)
            }
        } else {
            results.push("No eligible message parts to distill")
        }
    }

    return results.join("; ")
}

// ============================================================================
// Helpers
// ============================================================================

function updateStats(state: SessionState, count: number, tokensSaved: number): void {
    state.stats.pruneTokenCounter += tokensSaved
    state.stats.pruneMessageCounter += count
    state.stats.strategyStats.distillation.count += count
    state.stats.strategyStats.distillation.tokens += tokensSaved
    state.lastDiscardStats = {
        itemCount: count,
        tokensSaved: state.stats.pruneTokenCounter,
    }
}

function commitStats(state: SessionState): void {
    state.stats.totalPruneTokens += state.stats.pruneTokenCounter
    state.stats.pruneTokenCounter = 0
    state.stats.totalPruneMessages += state.stats.pruneMessageCounter
    state.stats.pruneMessageCounter = 0
}
