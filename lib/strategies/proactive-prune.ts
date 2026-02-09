import { PluginConfig } from "../config"
import { Logger } from "../logger"
import type { SessionState, WithParts } from "../state"
import { buildToolIdList } from "../messages/utils"
import { getFilePathFromParameters, isProtectedFilePath } from "../protected-file-patterns"
import { calculateTokensSaved, countTokens } from "./utils"
import { getPruneCache } from "../state/utils"
import { isMessageCompacted } from "../shared-utils"

/**
 * Proactive Prune strategy — replaces OpenCode's built-in PRUNE_PROTECT mechanism.
 *
 * When the plugin disables OpenCode's compaction (auto: false, prune: false),
 * this strategy takes ownership of keeping context within budget.
 *
 * Thresholds (based on contextPressure.contextPercent):
 * - 70-84%: Prune oldest tool outputs (largest first, skip recent 2 turns)
 * - 85%+:   Also prune reasoning blocks from older messages
 *
 * This runs as part of the PRUNE_STRATEGIES pipeline in hooks.ts,
 * executing on every turn via experimental.chat.messages.transform.
 */

/** Minimum tokens a tool output must have to be worth proactive pruning */
const MIN_PRUNE_TOKENS = 200

export const proactivePrune = (
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
    messages: WithParts[],
): void => {
    const pressure = state.contextPressure
    const budget = config.strategies.tokenBudget
    const warningPercent = Math.round(budget.warningThreshold * 100)
    const criticalPercent = Math.round(budget.criticalThreshold * 100)
    const targetPercent = Math.round(budget.targetPercent * 100)
    const protectedRecentTurns = budget.protectedRecentTurns

    if (!pressure || pressure.contextPercent < warningPercent) {
        return
    }

    logger.info("Proactive prune triggered", {
        percent: pressure.contextPercent,
        tokens: pressure.contextTokens,
        limit: pressure.effectiveLimit,
    })

    const protectedTools = config.tools.settings.protectedTools
    const { prunedToolIds, prunedReasoningPartIds } = getPruneCache(state)

    // Calculate how many tokens we need to free
    const targetTokens = Math.floor(pressure.effectiveLimit * (targetPercent / 100))
    let tokensToFree = pressure.contextTokens - targetTokens
    if (tokensToFree <= 0) return

    let totalFreed = 0

    // Phase 1: Prune oldest tool outputs (largest first, skip recent turns)
    const toolCandidates = collectToolCandidates(
        state,
        messages,
        protectedTools,
        prunedToolIds,
        config,
        protectedRecentTurns,
    )

    for (const candidate of toolCandidates) {
        if (totalFreed >= tokensToFree) break

        state.prune.toolIds.push(candidate.callId)
        state.stats.totalPruneTokens += candidate.tokens
        state.stats.totalPruneMessages += 1
        state.stats.strategyStats.autoSupersede.context.count += 1
        state.stats.strategyStats.autoSupersede.context.tokens += candidate.tokens
        totalFreed += candidate.tokens

        logger.debug(`Proactive-pruned tool ${candidate.toolName} (${candidate.tokens} tokens)`, {
            callId: candidate.callId,
        })
    }

    // Phase 2: If still over critical threshold, prune reasoning blocks
    if (pressure.contextPercent >= criticalPercent && totalFreed < tokensToFree) {
        const reasoningCandidates = collectReasoningCandidates(
            state,
            messages,
            prunedReasoningPartIds,
            protectedRecentTurns,
        )

        for (const candidate of reasoningCandidates) {
            if (totalFreed >= tokensToFree) break

            state.prune.reasoningPartIds.push(candidate.partId)
            state.stats.totalPruneTokens += candidate.tokens
            state.stats.strategyStats.manualDiscard.thinking.count += 1
            state.stats.strategyStats.manualDiscard.thinking.tokens += candidate.tokens
            totalFreed += candidate.tokens

            logger.debug(`Proactive-pruned reasoning block (${candidate.tokens} tokens)`, {
                partId: candidate.partId,
            })
        }
    }

    if (totalFreed > 0) {
        // Invalidate cache since we modified prune arrays
        state._cache = undefined

        logger.info("Proactive prune complete", {
            tokensFreed: totalFreed,
            targetFreed: tokensToFree,
            newEstimatedTokens: pressure.contextTokens - totalFreed,
        })
    }
}

interface ToolCandidate {
    callId: string
    toolName: string
    tokens: number
    turn: number
}

/**
 * Collect tool output candidates for pruning, sorted by token count descending.
 * Skips protected tools, recent turns, already-pruned, and small outputs.
 */
function collectToolCandidates(
    state: SessionState,
    messages: WithParts[],
    protectedTools: string[],
    prunedToolIds: Set<string>,
    config: PluginConfig,
    protectedRecentTurns: number,
): ToolCandidate[] {
    const candidates: ToolCandidate[] = []
    const recentTurnThreshold = state.currentTurn - protectedRecentTurns

    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) continue

        const parts = Array.isArray(msg.parts) ? msg.parts : []
        for (const part of parts) {
            if (part.type !== "tool" || !part.callID) continue
            if (prunedToolIds.has(part.callID)) continue
            if (protectedTools.includes(part.tool)) continue
            if (part.state?.status !== "completed") continue

            // Check turn age
            const metadata = state.toolParameters.get(part.callID)
            if (metadata && metadata.turn > recentTurnThreshold) continue

            // Check protected file paths
            if (metadata) {
                const filePath = getFilePathFromParameters(metadata.parameters)
                if (isProtectedFilePath(filePath, config.protectedFilePatterns)) continue
            }

            // Estimate token count
            const output = part.state.output
            if (!output) continue
            const content = typeof output === "string" ? output : JSON.stringify(output)
            const tokens = countTokens(content)
            if (tokens < MIN_PRUNE_TOKENS) continue

            candidates.push({
                callId: part.callID,
                toolName: part.tool,
                tokens,
                turn: metadata?.turn ?? 0,
            })
        }
    }

    // Sort: oldest first, then largest first within same turn
    return candidates.sort((a, b) => {
        if (a.turn !== b.turn) return a.turn - b.turn
        return b.tokens - a.tokens
    })
}

interface ReasoningCandidate {
    partId: string
    tokens: number
    turn: number
}

/**
 * Collect reasoning block candidates for pruning, sorted oldest-first then largest-first.
 * Skips recent turns and already-pruned blocks.
 */
function collectReasoningCandidates(
    state: SessionState,
    messages: WithParts[],
    prunedReasoningPartIds: Set<string>,
    protectedRecentTurns: number,
): ReasoningCandidate[] {
    const candidates: ReasoningCandidate[] = []
    const recentTurnThreshold = state.currentTurn - protectedRecentTurns

    // Estimate turn from message position (messages are chronological)
    let estimatedTurn = 0
    for (const msg of messages) {
        if (msg.info.role === "user") estimatedTurn++
        if (isMessageCompacted(state, msg)) continue
        if (msg.info.role !== "assistant") continue

        // Skip recent turns
        if (estimatedTurn > recentTurnThreshold) continue

        const parts = Array.isArray(msg.parts) ? msg.parts : []
        for (let partIndex = 0; partIndex < parts.length; partIndex++) {
            const part = parts[partIndex]
            if (!part || part.type !== "reasoning" || !part.text) continue

            const partId = `${msg.info.id}:${partIndex}`
            if (prunedReasoningPartIds.has(partId)) continue

            const tokens = countTokens(part.text)
            if (tokens < MIN_PRUNE_TOKENS) continue

            candidates.push({ partId, tokens, turn: estimatedTurn })
        }
    }

    return candidates.sort((a, b) => {
        if (a.turn !== b.turn) return a.turn - b.turn
        return b.tokens - a.tokens
    })
}
