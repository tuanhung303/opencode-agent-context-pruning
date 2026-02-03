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
import { findMessagesByPattern, storePatternMapping } from "../messages/pattern-match"

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
 * Distill messages by pattern.
 */
export async function executeContextMessageDistill(
    ctx: PruneToolContext,
    _toolCtx: { sessionID: string },
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
                storePatternMapping(pattern, summary, partId, state)
                logger.info(`Distilled message part ${partId} via pattern`)
                distilledCount++
            }
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
