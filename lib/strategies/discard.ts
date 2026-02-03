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
import { findMessagesByPattern, storePatternMapping } from "../messages/pattern-match"

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
 * Discard messages by pattern.
 */
export async function executeContextMessageDiscard(
    ctx: PruneToolContext,
    _toolCtx: { sessionID: string },
    patterns: string[],
    messages: WithParts[],
): Promise<string> {
    const { state, logger } = ctx

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

    let discardedCount = 0
    for (const match of allMatches) {
        const partId = `${match.messageId}:${match.partIndex}`
        if (!state.prune.messagePartIds.includes(partId)) {
            state.prune.messagePartIds.push(partId)
            storePatternMapping(match.pattern, match.content, partId, state)
            logger.info(`Discarded message part ${partId} via pattern`)
            discardedCount++
        }
    }

    saveSessionState(state, logger).catch((err: Error) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    return `Discarded ${discardedCount} message(s)`
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
        state.stats.strategyStats.manualDiscard.count += count
        state.stats.strategyStats.manualDiscard.tokens += tokensSaved
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
