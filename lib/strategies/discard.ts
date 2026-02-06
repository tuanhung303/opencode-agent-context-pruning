/**
 * Discard operations for tool outputs and messages.
 */

import type { PruneToolContext } from "./_types"
import { SessionState, ToolParameterEntry, WithParts, ensureSessionInitialized } from "../state"
import { saveSessionState } from "../state/persistence"
import { sendUnifiedNotification, PruneReason, sendAttemptedNotification } from "../ui/notification"
import type { ItemizedPrunedItem } from "../ui/pruning-status"
import { formatDiscardNotification } from "../ui/minimal-notifications"
import { formatPruningStatus, dimText } from "../ui/pruning-status"
import { calculateTokensSaved, getCurrentParams } from "./utils"
import type { Logger } from "../logger"
import type { PluginConfig } from "../config"

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

    // Collect metadata and build itemized data
    const toolMetadata = new Map<string, ToolParameterEntry>()
    const prunedToolNames: string[] = []
    const itemizedPruned: ItemizedPrunedItem[] = []
    for (const callId of callIds) {
        const toolParameters = state.toolParameters.get(callId)
        if (toolParameters) {
            toolMetadata.set(callId, toolParameters)
            prunedToolNames.push(toolParameters.tool)
            itemizedPruned.push({
                type: "tool",
                name: toolParameters.tool,
            })
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
        {
            state,
            pruneToolIds: callIds,
            toolMetadata,
            reason,
            workingDirectory,
            attemptedTargets: hashes,
            options: { simplified: true },
            itemizedPruned,
        },
        sessionId,
        currentParams,
    )

    commitStats(state)

    saveSessionState(state, logger).catch((err: Error) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    // Build notification
    const tuiStatus = formatPruningStatus(prunedToolNames, [])
    const tuiNotification = tuiStatus ? dimText(tuiStatus) : ""
    const minimalNotification = formatDiscardNotification(
        callIds.length,
        reason,
        hashes,
        "tool",
        state,
        workingDirectory,
    )

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
    const { client, state, logger, config } = ctx
    const sessionId = toolCtx.sessionID

    // Always fetch messages for proper state sync (required for thinking mode API compatibility)
    const messagesResponse = await client.session.messages({
        path: { id: sessionId },
    })
    const messages: WithParts[] = (messagesResponse.data || messagesResponse) as WithParts[]

    await ensureSessionInitialized(client, state, sessionId, logger, messages)

    const callIds: string[] = []
    const validHashes: string[] = []

    for (const hash of hashes) {
        const callId = state.hashRegistry.calls.get(hash)
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
        // Send no-op notification showing attempted hashes
        const currentParams = getCurrentParams(state, messages, logger)
        await sendAttemptedNotification(
            client,
            logger,
            config,
            "discard",
            hashes,
            sessionId,
            currentParams,
            "tool",
            state,
            ctx.workingDirectory,
        )
        // Return notification in the response too
        const minimalNotification = formatDiscardNotification(
            0,
            "manual",
            hashes,
            "tool",
            state,
            ctx.workingDirectory,
        )
        return `${minimalNotification}\nNo valid tool hashes to discard`
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
    toolCtx: { sessionID: string },
    hashes: string[],
): Promise<string> {
    const { state, logger, config, client } = ctx
    const sessionId = toolCtx.sessionID

    // Always fetch messages for proper state sync (required for thinking mode API compatibility)
    const messagesResponse = await client.session.messages({
        path: { id: sessionId },
    })
    const messages: WithParts[] = (messagesResponse.data || messagesResponse) as WithParts[]

    await ensureSessionInitialized(client, state, sessionId, logger, messages)

    let discardedCount = 0
    let tokensSaved = 0
    const itemizedPruned: ItemizedPrunedItem[] = []

    for (const hash of hashes) {
        const partId = state.hashRegistry.messages.get(hash)
        if (partId) {
            if (!state.prune.messagePartIds.includes(partId)) {
                state.prune.messagePartIds.push(partId)
                logger.info(`Discarded message part ${partId} via hash ${hash}`)
                discardedCount++
                // Estimate tokens saved (rough estimate based on typical message size)
                tokensSaved += 500
                itemizedPruned.push({
                    type: "message",
                    name: `message part`,
                })
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

    // Send notification for consistent status display
    const currentParams = getCurrentParams(state, messages, logger)
    await sendUnifiedNotification(
        client,
        logger,
        config,
        {
            state,
            pruneToolIds: [],
            toolMetadata: new Map(),
            pruneMessagePartIds:
                discardedCount > 0 ? state.prune.messagePartIds.slice(-discardedCount) : [],
            reason: "manual",
            workingDirectory: ctx.workingDirectory,
            attemptedTargets: hashes,
            options: { simplified: true },
            itemizedPruned: discardedCount > 0 ? itemizedPruned : [],
        },
        toolCtx.sessionID,
        currentParams,
    )

    if (discardedCount > 0) {
        commitStats(state)
    }

    saveSessionState(state, logger).catch((err: Error) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    // Return formatted notification
    const minimalNotification = formatDiscardNotification(
        discardedCount,
        "manual",
        hashes,
        "message",
        state,
        ctx.workingDirectory,
    )
    return minimalNotification
}

/**
 * Discard reasoning parts by hash.
 */
export async function executeContextReasoningDiscard(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    hashes: string[],
): Promise<string> {
    const { state, logger, config, client } = ctx
    const sessionId = toolCtx.sessionID

    // Always fetch messages for proper state sync (required for thinking mode API compatibility)
    const messagesResponse = await client.session.messages({
        path: { id: sessionId },
    })
    const messages: WithParts[] = (messagesResponse.data || messagesResponse) as WithParts[]

    await ensureSessionInitialized(client, state, sessionId, logger, messages)

    let discardedCount = 0
    let tokensSaved = 0
    const validHashes: string[] = []
    const itemizedPruned: ItemizedPrunedItem[] = []

    for (const hash of hashes) {
        const partId = state.hashRegistry.reasoning.get(hash)
        if (partId) {
            if (!state.prune.reasoningPartIds.includes(partId)) {
                state.prune.reasoningPartIds.push(partId)
                validHashes.push(hash)
                discardedCount++
                // Estimate tokens saved (rough estimate based on typical reasoning block size)
                tokensSaved += 2000
                logger.info(`Discarded reasoning part ${partId} via hash ${hash}`)
                itemizedPruned.push({
                    type: "reasoning",
                    name: `thinking block`,
                })
            } else {
                logger.debug(`Hash ${hash} already pruned, skipping`)
            }
        } else {
            logger.warn(`Unknown reasoning hash: ${hash}`)
        }
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

    // Send notification for consistent status display
    const currentParams = getCurrentParams(state, messages, logger)
    // Build reasoning part IDs list for notification (using "msgId:partIndex" format)
    const reasoningPartIds = validHashes
        .map((hash) => state.hashRegistry.reasoning.get(hash))
        .filter((id): id is string => id !== undefined)
    await sendUnifiedNotification(
        client,
        logger,
        config,
        {
            state,
            pruneToolIds: [],
            toolMetadata: new Map(),
            pruneMessagePartIds: [],
            pruneReasoningPartIds: reasoningPartIds,
            reason: "manual",
            workingDirectory: ctx.workingDirectory,
            attemptedTargets: hashes,
            options: { simplified: true },
            itemizedPruned: discardedCount > 0 ? itemizedPruned : [],
        },
        toolCtx.sessionID,
        currentParams,
    )

    commitStats(state)

    saveSessionState(state, logger).catch((err: Error) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    // Return formatted notification
    const minimalNotification = formatDiscardNotification(
        discardedCount,
        "manual",
        hashes,
        "reasoning",
        state,
        ctx.workingDirectory,
    )
    return minimalNotification
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
            const hash = state.hashRegistry.callIds.get(callId) || "unknown"
            logger.debug("Rejecting prune request - call ID not in cache", { callId, hash })
            throw new Error(`Invalid hash provided. The tool may have already been discarded.`)
        }

        const allProtectedTools = config.tools.settings.protectedTools
        if (allProtectedTools.includes(metadata.tool)) {
            const hash = state.hashRegistry.callIds.get(callId) || "unknown"
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
