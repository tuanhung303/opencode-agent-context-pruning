/**
 * Distill operations for tool outputs and messages.
 */

import type { PruneToolContext } from "./_types"
import { SessionState, ToolParameterEntry, WithParts, ensureSessionInitialized } from "../state"
import { saveSessionState } from "../state/persistence"
import { sendUnifiedNotification, sendAttemptedNotification } from "../ui/notification"
import { formatDiscardNotification } from "../ui/minimal-notifications"
import { formatPruningStatus, dimText } from "../ui/pruning-status"
import { calculateTokensSaved, getCurrentParams } from "./utils"
import type { Logger } from "../logger"

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
        {
            state,
            pruneToolIds: callIds,
            toolMetadata,
            reason: "distillation",
            workingDirectory,
            distillation,
            attemptedTargets: hashes,
            options: { simplified: true },
        },
        sessionId,
        currentParams,
    )

    commitStats(state)

    saveSessionState(state, logger).catch((err: Error) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    // Build notification
    const tuiStatus = formatPruningStatus(prunedToolNames, distillation)
    const tuiNotification = tuiStatus ? dimText(tuiStatus) : ""
    const minimalNotification = formatDiscardNotification(callIds.length, "distillation", hashes)

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
    const { state, logger, config } = ctx

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
        const callId = state.hashRegistry.calls.get(hash)
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
        // Send no-op notification showing attempted hashes
        const currentParams = getCurrentParams(state, [], logger)
        await sendAttemptedNotification(
            ctx.client,
            logger,
            config,
            "distill",
            hashes,
            toolCtx.sessionID,
            currentParams,
        )
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
        const partId = state.hashRegistry.messages.get(hash)
        if (partId) {
            if (!state.prune.messagePartIds.includes(partId)) {
                state.prune.messagePartIds.push(partId)
                logger.info(`Distilled message part ${partId} via hash ${hash}: ${summary}`)
                distilledCount++
            }
        } else {
            logger.warn(`Unknown message hash: ${hash}`)
        }
    }

    const currentParams = getCurrentParams(state, [], logger)
    const hashes = entries.map((e) => e[0])

    await sendUnifiedNotification(
        ctx.client,
        logger,
        ctx.config,
        {
            state,
            pruneToolIds: [],
            toolMetadata: new Map(),
            pruneMessagePartIds:
                distilledCount > 0 ? state.prune.messagePartIds.slice(-distilledCount) : [],
            reason: "distillation",
            workingDirectory: ctx.workingDirectory,
            attemptedTargets: hashes,
            options: { simplified: true },
        },
        _toolCtx.sessionID,
        currentParams,
    )

    saveSessionState(state, logger).catch((err: Error) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    return `Distilled ${distilledCount} message(s)`
}

/**
 * Distill reasoning/thinking parts by hash.
 * Used for thinking mode safety: converts discard to distill with minimal placeholder.
 * Note: Updates manualDiscard.thinking stats (not distillation) for proper notification display.
 */
export async function executeContextReasoningDistill(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    entries: Array<[string, string]>,
): Promise<string> {
    const { state, logger, config, client } = ctx
    const sessionId = toolCtx.sessionID

    let distilledCount = 0
    let tokensSaved = 0
    const processedHashes: string[] = []

    for (const [hash, _summary] of entries) {
        const partId = state.hashRegistry.reasoning.get(hash)
        if (partId) {
            if (!state.prune.reasoningPartIds.includes(partId)) {
                state.prune.reasoningPartIds.push(partId)
                processedHashes.push(hash)
                distilledCount++
                tokensSaved += 2000 // Estimate tokens per reasoning block
                logger.info(`Distilled reasoning part ${partId} via hash ${hash}`)
            } else {
                logger.debug(`Hash ${hash} already pruned, skipping`)
            }
        } else {
            logger.warn(`Unknown reasoning hash: ${hash}`)
        }
    }

    if (distilledCount === 0) {
        return "No valid reasoning hashes to distill"
    }

    // Update stats - use manualDiscard.thinking for notification display (shows 🧠 icon)
    state.stats.pruneTokenCounter += tokensSaved
    state.stats.pruneMessageCounter += distilledCount
    state.stats.strategyStats.manualDiscard.thinking.count += distilledCount
    state.stats.strategyStats.manualDiscard.thinking.tokens += tokensSaved

    state.lastDiscardStats = {
        itemCount: distilledCount,
        tokensSaved: state.stats.pruneTokenCounter,
    }

    // Send notification for consistent status display
    const currentParams = getCurrentParams(state, [], logger)
    // Build reasoning part IDs list for notification (using "msgId:partIndex" format)
    const reasoningPartIds = processedHashes
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
        },
        sessionId,
        currentParams,
    )

    // Commit stats
    state.stats.totalPruneTokens += state.stats.pruneTokenCounter
    state.stats.pruneTokenCounter = 0
    state.stats.totalPruneMessages += state.stats.pruneMessageCounter
    state.stats.pruneMessageCounter = 0

    saveSessionState(state, logger).catch((err: Error) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    // Build minimal notification like tool discards
    const minimalNotification = formatDiscardNotification(distilledCount, "manual")
    const hashList =
        processedHashes.length > 3
            ? `${processedHashes.slice(0, 3).join(", ")}... (${processedHashes.length} total)`
            : processedHashes.join(", ")
    const details = `pruned: ${hashList}`

    return `${minimalNotification}\n${dimText(details)}`
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
            const hash = state.hashRegistry.callIds.get(callId) || "unknown"
            logger.debug("Rejecting distill request - call ID not in cache", { callId, hash })
            throw new Error(`Invalid hash provided. The tool may have already been discarded.`)
        }

        if (allProtectedTools.includes(metadata.tool)) {
            const hash = state.hashRegistry.callIds.get(callId) || "unknown"
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
