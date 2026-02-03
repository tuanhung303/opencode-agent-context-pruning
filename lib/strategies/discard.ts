/**
 * Discard operations for tool outputs and messages.
 */

import type { PruneToolContext } from "./_types"
import type { SessionState, ToolParameterEntry, WithParts } from "../state"
import type { Logger } from "../logger"
import type { PluginConfig } from "../config"
import type { PruneReason } from "../ui/notification"
import { ensureSessionInitialized } from "../state"
import { saveSessionState } from "../state/persistence"
import { sendUnifiedNotification } from "../ui/notification"
import { formatDiscardNotification } from "../ui/minimal-notifications"
import { formatPruningStatus, dimText } from "../ui/pruning-status"
import { calculateTokensSaved, getCurrentParams } from "./utils"
import {
    collectAllToolHashes,
    collectAllMessageHashes,
    collectAllReasoningHashes,
} from "../messages/utils"
import type { BulkTargetType } from "./_types"

interface DiscardOptions {
    toolName: string
    reason: PruneReason
    simplified?: boolean
}

/**
 * Core discard operation for tool outputs.
 */
export async function executeToolPrune(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    callIds: string[],
    hashes: string[],
    options: DiscardOptions,
): Promise<string> {
    const { client, state, logger, config, workingDirectory } = ctx
    const sessionId = toolCtx.sessionID
    const { toolName, reason } = options

    logger.info(`${toolName} tool invoked`)
    logger.info(JSON.stringify({ hashes, toolCount: callIds.length }))

    if (!callIds || callIds.length === 0) {
        logger.debug(`${toolName} tool called but no valid call IDs resolved`)
        throw new Error(
            `No valid hashes provided. Use 6-char hashes from tool outputs (e.g., a1b2c3).`,
        )
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
    updateStats(state, callIds.length, tokensSaved, reason)

    // Record in history
    state.discardHistory.push({
        timestamp: Date.now(),
        hashes,
        tokensSaved,
        reason,
    })

    await sendUnifiedNotification(
        client,
        logger,
        config,
        state,
        sessionId,
        callIds,
        toolMetadata,
        reason,
        currentParams,
        workingDirectory,
        undefined,
        { simplified: true },
        [],
    )

    commitStats(state)

    saveSessionState(state, logger).catch((err: Error) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    // Build notification
    const tuiStatus = formatPruningStatus(prunedToolNames, [])
    const tuiNotification = tuiStatus ? dimText(tuiStatus) : ""
    const minimalNotification = formatDiscardNotification(callIds.length, reason)

    return tuiNotification ? `${minimalNotification}\n${tuiNotification}` : minimalNotification
}

/**
 * Discard tool outputs by hash (context tool variant).
 */
export async function executeContextToolDiscard(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    hashes: string[],
): Promise<string> {
    const { state, logger } = ctx

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

    return executeToolPrune(ctx, toolCtx, callIds, validHashes, {
        toolName: "Discard",
        reason: "manual",
    })
}

/**
 * Discard message parts by hash.
 */
export async function executeContextMessageDiscard(
    ctx: PruneToolContext,
    _toolCtx: { sessionID: string },
    hashes: string[],
): Promise<string> {
    const { state, logger } = ctx

    let discardedCount = 0
    let tokensSaved = 0

    for (const hash of hashes) {
        const partId = state.hashToMessagePart.get(hash)
        if (partId) {
            if (!state.prune.messagePartIds.includes(partId)) {
                state.prune.messagePartIds.push(partId)
                logger.info(`Discarded message part ${partId} via hash ${hash}`)
                discardedCount++
                // Estimate tokens saved (rough estimate based on typical message size)
                tokensSaved += 500
            }
        } else {
            logger.warn(`Unknown message hash: ${hash}`)
        }
    }

    if (discardedCount > 0) {
        // Update stats for message discards
        state.stats.pruneTokenCounter += tokensSaved
        state.stats.pruneMessageCounter += discardedCount
        state.stats.strategyStats.manualDiscard.message.count += discardedCount
        state.stats.strategyStats.manualDiscard.message.tokens += tokensSaved

        state.lastDiscardStats = {
            itemCount: discardedCount,
            tokensSaved: state.stats.pruneTokenCounter,
        }
    }

    saveSessionState(state, logger).catch((err: Error) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    return `Discarded ${discardedCount} message(s)`
}

/**
 * Discard reasoning parts by hash.
 */
export async function executeContextReasoningDiscard(
    ctx: PruneToolContext,
    _toolCtx: { sessionID: string },
    hashes: string[],
): Promise<string> {
    const { state, logger } = ctx

    let discardedCount = 0
    let tokensSaved = 0
    const validHashes: string[] = []

    for (const hash of hashes) {
        const partId = state.hashToReasoningPart.get(hash)
        if (partId) {
            if (!state.prune.reasoningPartIds.includes(partId)) {
                state.prune.reasoningPartIds.push(partId)
                validHashes.push(hash)
                discardedCount++
                // Estimate tokens saved (rough estimate based on typical reasoning block size)
                tokensSaved += 2000
                logger.info(`Discarded reasoning part ${partId} via hash ${hash}`)
            } else {
                logger.debug(`Hash ${hash} already pruned, skipping`)
            }
        } else {
            logger.warn(`Unknown reasoning hash: ${hash}`)
        }
    }

    if (validHashes.length === 0) {
        return "No valid reasoning hashes to discard"
    }

    // Update stats
    state.stats.pruneTokenCounter += tokensSaved
    state.stats.pruneMessageCounter += discardedCount
    state.stats.strategyStats.manualDiscard.thinking.count += discardedCount
    state.stats.strategyStats.manualDiscard.thinking.tokens += tokensSaved

    state.lastDiscardStats = {
        itemCount: discardedCount,
        tokensSaved: state.stats.pruneTokenCounter,
    }

    saveSessionState(state, logger).catch((err: Error) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    return `Discarded ${discardedCount} reasoning block(s), saved ~${tokensSaved} tokens`
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Execute bulk discard operation for tools, messages, or all eligible items.
 * Collects all eligible items based on bulkType and routes to appropriate discard functions.
 *
 * @param ctx - Prune tool context
 * @param toolCtx - Tool context with session ID
 * @param bulkType - Type of bulk operation: "bulk_tools", "bulk_messages", or "bulk_all"
 * @returns Status message describing what was discarded
 */
export async function executeBulkDiscard(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    bulkType: BulkTargetType,
): Promise<string> {
    const { state, logger, config } = ctx

    const results: string[] = []

    // Handle tools
    if (bulkType === "bulk_tools" || bulkType === "bulk_all") {
        const toolHashes = collectAllToolHashes(state, config)
        if (toolHashes.length > 0) {
            logger.info(`Bulk discard: collecting ${toolHashes.length} tool hashes`)
            const toolResult = await executeContextToolDiscard(ctx, toolCtx, toolHashes)
            results.push(toolResult)
        } else {
            results.push("No eligible tool outputs to discard")
        }
    }

    // Handle messages
    if (bulkType === "bulk_messages" || bulkType === "bulk_all") {
        const messageHashes = collectAllMessageHashes(state)
        if (messageHashes.length > 0) {
            logger.info(`Bulk discard: collecting ${messageHashes.length} message hashes`)
            // Directly prune message parts using collected hashes
            let discardedCount = 0
            let tokensSaved = 0
            for (const hash of messageHashes) {
                const partId = state.hashToMessagePart.get(hash)
                if (partId && !state.prune.messagePartIds.includes(partId)) {
                    state.prune.messagePartIds.push(partId)
                    logger.info(`Bulk discarded message part ${partId}`)
                    discardedCount++
                    tokensSaved += 500 // Estimate tokens per message
                }
            }
            if (discardedCount > 0) {
                // Update stats for bulk message discards
                state.stats.pruneTokenCounter += tokensSaved
                state.stats.pruneMessageCounter += discardedCount
                state.stats.strategyStats.manualDiscard.message.count += discardedCount
                state.stats.strategyStats.manualDiscard.message.tokens += tokensSaved

                state.lastDiscardStats = {
                    itemCount: discardedCount,
                    tokensSaved: state.stats.pruneTokenCounter,
                }

                saveSessionState(state, logger).catch((err: Error) =>
                    logger.error("Failed to persist state", { error: err.message }),
                )
                results.push(`Discarded ${discardedCount} message(s)`)
            }
        } else {
            results.push("No eligible message parts to discard")
        }
    }

    // Handle reasoning/thinking blocks
    if (bulkType === "bulk_all") {
        const reasoningHashes = collectAllReasoningHashes(state)
        if (reasoningHashes.length > 0) {
            logger.info(`Bulk discard: collecting ${reasoningHashes.length} reasoning hashes`)
            let discardedCount = 0
            let tokensSaved = 0
            for (const hash of reasoningHashes) {
                const partId = state.hashToReasoningPart.get(hash)
                if (partId && !state.prune.reasoningPartIds.includes(partId)) {
                    state.prune.reasoningPartIds.push(partId)
                    logger.info(`Bulk discarded reasoning part ${partId}`)
                    discardedCount++
                    tokensSaved += 2000 // Estimate tokens per reasoning block
                }
            }
            if (discardedCount > 0) {
                // Update stats for bulk reasoning discards
                state.stats.pruneTokenCounter += tokensSaved
                state.stats.pruneMessageCounter += discardedCount
                state.stats.strategyStats.manualDiscard.thinking.count += discardedCount
                state.stats.strategyStats.manualDiscard.thinking.tokens += tokensSaved

                state.lastDiscardStats = {
                    itemCount: discardedCount,
                    tokensSaved: state.stats.pruneTokenCounter,
                }

                saveSessionState(state, logger).catch((err: Error) =>
                    logger.error("Failed to persist state", { error: err.message }),
                )
                results.push(`Discarded ${discardedCount} reasoning block(s)`)
            }
        }
    }

    return results.join("; ")
}

// ============================================================================
// Helpers
// ============================================================================

function validateCallIds(
    state: SessionState,
    callIds: string[],
    config: PluginConfig,
    logger: Logger,
): void {
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
}

function updateStats(
    state: SessionState,
    count: number,
    tokensSaved: number,
    reason: PruneReason,
): void {
    state.stats.pruneTokenCounter += tokensSaved
    state.stats.pruneMessageCounter += count

    if (reason === "manual") {
        state.stats.strategyStats.manualDiscard.tool.count += count
        state.stats.strategyStats.manualDiscard.tool.tokens += tokensSaved
    }

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
