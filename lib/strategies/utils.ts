import { SessionState, WithParts } from "../state"
import { UserMessage } from "@opencode-ai/sdk/v2"
import { Logger } from "../logger"
import { countTokens as anthropicCountTokens } from "@anthropic-ai/tokenizer"
import { getLastUserMessage, isMessageCompacted } from "../shared-utils"

// Token count memoization cache with LRU eviction
const tokenCache = new Map<string, number>()
const MAX_TOKEN_CACHE_SIZE = 500

export function getCurrentParams(
    state: SessionState,
    messages: WithParts[],
    logger: Logger,
): {
    providerId: string | undefined
    modelId: string | undefined
    agent: string | undefined
    variant: string | undefined
} {
    const userMsg = getLastUserMessage(messages)
    if (!userMsg) {
        logger.debug("No user message found when determining current params")
        return {
            providerId: undefined,
            modelId: undefined,
            agent: undefined,
            variant: state.variant,
        }
    }
    const userInfo = userMsg.info as UserMessage
    const agent: string = userInfo.agent
    const providerId: string | undefined = userInfo.model.providerID
    const modelId: string | undefined = userInfo.model.modelID
    const variant: string | undefined = state.variant ?? userInfo.variant

    return { providerId, modelId, agent, variant }
}

/**
 * Count tokens in text with memoization.
 * Uses LRU eviction when cache exceeds MAX_TOKEN_CACHE_SIZE.
 */
export function countTokens(text: string): number {
    if (!text) return 0

    // Check cache first
    const cached = tokenCache.get(text)
    if (cached !== undefined) {
        return cached
    }

    // Compute token count
    let count: number
    try {
        count = anthropicCountTokens(text)
    } catch {
        count = Math.round(text.length / 4)
    }

    // LRU eviction: remove oldest entry if at capacity
    if (tokenCache.size >= MAX_TOKEN_CACHE_SIZE) {
        const firstKey = tokenCache.keys().next().value
        if (firstKey !== undefined) {
            tokenCache.delete(firstKey)
        }
    }

    // Cache the result
    tokenCache.set(text, count)
    return count
}

/**
 * Clear the token cache. Useful for testing.
 */
export function clearTokenCache(): void {
    tokenCache.clear()
}

function estimateTokensBatch(texts: string[]): number[] {
    return texts.map(countTokens)
}

/**
 * Estimate tokens for a specific tool output by callId.
 * Returns estimated token count using ~4 chars per token heuristic.
 */
export function estimateTokensForItem(
    state: SessionState,
    messages: WithParts[],
    callId: string,
): { callId: string; toolName: string; estimatedTokens: number; target?: string } | null {
    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) continue
        const parts = Array.isArray(msg.parts) ? msg.parts : []
        for (const part of parts) {
            if (part.type !== "tool" || part.callID !== callId) continue

            let content = ""
            let target: string | undefined

            if (part.state.status === "completed" && part.state.output) {
                content =
                    typeof part.state.output === "string"
                        ? part.state.output
                        : JSON.stringify(part.state.output)
            } else if (part.state.status === "error" && part.state.error) {
                content =
                    typeof part.state.error === "string"
                        ? part.state.error
                        : JSON.stringify(part.state.error)
            }

            // Extract target (file path, pattern, etc.) for display
            const input = part.state.input as Record<string, unknown> | undefined
            if (input) {
                target =
                    (input.filePath as string) ||
                    (input.pattern as string) ||
                    (input.command as string) ||
                    (input.url as string) ||
                    (input.query as string)
                if (target && target.length > 30) {
                    target = target.slice(0, 27) + "..."
                }
            }

            return {
                callId,
                toolName: part.tool,
                estimatedTokens: countTokens(content),
                target,
            }
        }
    }
    return null
}

/**
 * Rank pruning candidates by estimated token savings.
 * Returns top N items sorted by tokens descending, excluding protected tools.
 */
export function rankPruningCandidates(
    state: SessionState,
    messages: WithParts[],
    protectedTools: string[],
    limit: number = 5,
): Array<{
    callId: string
    hash: string
    toolName: string
    estimatedTokens: number
    target?: string
}> {
    const candidates: Array<{
        callId: string
        hash: string
        toolName: string
        estimatedTokens: number
        target?: string
    }> = []

    // Get all unpruned tool callIds with their hashes
    for (const [callId, hash] of state.hashRegistry.callIds) {
        // Skip already pruned
        if (state.prune.toolIds.includes(callId)) continue

        const estimate = estimateTokensForItem(state, messages, callId)
        if (!estimate) continue

        // Skip protected tools
        if (protectedTools.includes(estimate.toolName)) continue

        // Skip small outputs (< 100 tokens)
        if (estimate.estimatedTokens < 100) continue

        candidates.push({
            callId,
            hash,
            toolName: estimate.toolName,
            estimatedTokens: estimate.estimatedTokens,
            target: estimate.target,
        })
    }

    // Sort by tokens descending and take top N
    return candidates.sort((a, b) => b.estimatedTokens - a.estimatedTokens).slice(0, limit)
}

/**
 * Calculate total tokens in current context.
 * Used for context pressure indicator.
 */
export function calculateTotalContextTokens(state: SessionState, messages: WithParts[]): number {
    let total = 0
    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) continue
        const parts = Array.isArray(msg.parts) ? msg.parts : []
        for (const part of parts) {
            if (part.type === "text" && part.text) {
                total += countTokens(part.text)
            } else if (part.type === "tool" && part.state?.status === "completed") {
                const output = (part.state as { output?: unknown }).output
                if (output) {
                    const content = typeof output === "string" ? output : JSON.stringify(output)
                    total += countTokens(content)
                }
            } else if (part.type === "reasoning" && part.text) {
                total += countTokens(part.text)
            }
        }
    }
    return total
}

/**
 * Extract the real token count from the last assistant message's provider-reported usage.
 *
 * OpenCode populates msg.info.tokens on assistant messages after each LLM response with:
 *   { input, output, reasoning, cache: { read, write } }
 *
 * This is the authoritative count including system prompts, tool schemas, and provider
 * formatting overhead that our heuristic estimator misses.
 *
 * @returns The real token count, or null if no assistant message has token data
 */
export function getRealTokenCount(messages: WithParts[]): number | null {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (!msg || msg.info.role !== "assistant") continue

        const tokens = (msg.info as any).tokens
        if (!tokens || typeof tokens.input !== "number") continue

        // Match OpenCode's own isOverflow formula: input + cache.read + output
        return tokens.input + (tokens.cache?.read ?? 0) + tokens.output
    }
    return null
}

export const calculateTokensSaved = (
    state: SessionState,
    messages: WithParts[],
    pruneToolIds: string[],
    pruneMessagePartIds: string[] = [],
): number => {
    try {
        const contents: string[] = []
        for (const msg of messages) {
            if (isMessageCompacted(state, msg)) {
                continue
            }
            const parts = Array.isArray(msg.parts) ? msg.parts : []
            const messageId = msg.info.id

            for (let partIndex = 0; partIndex < parts.length; partIndex++) {
                const part = parts[partIndex]
                if (!part) continue

                // Check tool parts
                if (part.type === "tool" && pruneToolIds.includes(part.callID)) {
                    if (part.tool === "question") {
                        const questions = part.state.input?.questions
                        if (questions !== undefined) {
                            const content =
                                typeof questions === "string"
                                    ? questions
                                    : JSON.stringify(questions)
                            contents.push(content)
                        }
                    } else if (part.state.status === "completed") {
                        const content =
                            typeof part.state.output === "string"
                                ? part.state.output
                                : JSON.stringify(part.state.output)
                        contents.push(content)
                    } else if (part.state.status === "error") {
                        const content =
                            typeof part.state.error === "string"
                                ? part.state.error
                                : JSON.stringify(part.state.error)
                        contents.push(content)
                    }
                }

                // Check assistant message parts
                const partId = `${messageId}:${partIndex}`
                if (
                    msg.info.role === "assistant" &&
                    part.type === "text" &&
                    pruneMessagePartIds.includes(partId)
                ) {
                    if (part.text) {
                        contents.push(part.text)
                    }
                }
            }
        }
        const tokenCounts: number[] = estimateTokensBatch(contents)
        return tokenCounts.reduce((sum, count) => sum + count, 0)
    } catch {
        return 0
    }
}

/**
 * Model context window sizes in tokens.
 * Used for dynamic threshold calculation based on the active model.
 * Values represent raw context window limits (not accounting for output buffer).
 *
 * Models are matched by substring (case-insensitive) in order defined below.
 * First match wins, so specific models should come before generic ones.
 */
export const MODEL_CONTEXT_WINDOWS: Array<{
    pattern: string
    windowSize: number
    displayName: string
}> = [
    // Anthropic Claude (200K)
    { pattern: "claude-opus", windowSize: 200000, displayName: "Claude Opus" },
    { pattern: "claude-sonnet", windowSize: 200000, displayName: "Claude Sonnet" },
    { pattern: "claude-haiku", windowSize: 200000, displayName: "Claude Haiku" },
    { pattern: "claude-3-", windowSize: 200000, displayName: "Claude 3" },

    // OpenAI (128K)
    { pattern: "gpt-4o", windowSize: 128000, displayName: "GPT-4o" },
    { pattern: "gpt-4-turbo", windowSize: 128000, displayName: "GPT-4 Turbo" },
    { pattern: "o1-", windowSize: 200000, displayName: "o1" },
    { pattern: "o3-", windowSize: 200000, displayName: "o3" },

    // DeepSeek (128K)
    { pattern: "deepseek", windowSize: 128000, displayName: "DeepSeek" },

    // Google Gemini (1M)
    { pattern: "gemini-2", windowSize: 1000000, displayName: "Gemini 2" },
    { pattern: "gemini-1.5", windowSize: 1000000, displayName: "Gemini 1.5" },
    { pattern: "gemini-1", windowSize: 1000000, displayName: "Gemini" },
]

/**
 * Resolve model context window size from model ID.
 * Uses substring matching (case-insensitive) against known model patterns.
 *
 * @param modelId - The model identifier (e.g., "anthropic/claude-opus-4-6")
 * @returns Object with windowSize and displayName, or null if unknown
 *
 * @example
 * resolveModelContextWindow("claude-opus-4-6") → { windowSize: 200000, modelMatch: "Claude Opus" }
 * resolveModelContextWindow("unknown-model") → null
 */
export function resolveModelContextWindow(
    modelId: string,
): { windowSize: number; modelMatch: string } | null {
    if (!modelId) return null

    const lowerModelId = modelId.toLowerCase()

    for (const { pattern, windowSize, displayName } of MODEL_CONTEXT_WINDOWS) {
        if (lowerModelId.includes(pattern.toLowerCase())) {
            return { windowSize, modelMatch: displayName }
        }
    }

    return null
}

/**
 * Todo reminder configuration for dynamic threshold calculation.
 */
export interface TodoReminderConfig {
    fallbackContextWindow: number
    warningThresholdPercent: number
}

/**
 * Result of effective context threshold calculation.
 */
export interface ContextThreshold {
    rawWindow: number
    warningThreshold: number
    modelMatch: string | null
}

/**
 * Calculate effective context threshold based on model and config.
 *
 * Math:
 * - rawWindow: Model's native context window (or fallback if unknown)
 * - warningThreshold: rawWindow × warningThresholdPercent  [e.g., 200K × 0.7 = 140K]
 *
 * @param modelId - The active model identifier (may be undefined)
 * @param config - Todo reminder configuration
 * @returns ContextThreshold with all calculated values
 */
export function getEffectiveContextThreshold(
    modelId: string | undefined,
    config: TodoReminderConfig,
): ContextThreshold {
    // Resolve model window or use fallback
    const resolved = modelId ? resolveModelContextWindow(modelId) : null
    const rawWindow = resolved?.windowSize ?? config.fallbackContextWindow
    const modelMatch = resolved?.modelMatch ?? null

    // Apply warning threshold (70% default)
    const warningThreshold = Math.floor(rawWindow * config.warningThresholdPercent)

    return {
        rawWindow,
        warningThreshold,
        modelMatch,
    }
}

/**
 * Context status label with color indicator.
 */
export interface ContextStatus {
    label: string
    emoji: string
    remaining: number
    percent: number
}

/**
 * Determine context status label based on current usage vs effective limit.
 *
 * Status bands (based on currentTokens / effectiveInput):
 * - 0-49%: 🟢 Nominal — plenty of room
 * - 50-69%: 🟡 Elevated — consider pruning soon
 * - 70-89%: 🟠 High — active pruning recommended
 * - 90%+: 🔴 Critical — prune immediately or risk truncation
 *
 * @param currentTokens - Current token count in context
 * @param effectiveInput - Effective input limit after output buffer
 * @returns ContextStatus with label, emoji, remaining tokens, and percentage
 */
export function getContextStatus(currentTokens: number, effectiveInput: number): ContextStatus {
    const percent = Math.min(100, Math.round((currentTokens / effectiveInput) * 100))
    const remaining = Math.max(0, effectiveInput - currentTokens)

    let label: string
    let emoji: string

    if (percent < 50) {
        label = "Nominal"
        emoji = "🟢"
    } else if (percent < 70) {
        label = "Elevated"
        emoji = "🟡"
    } else if (percent < 90) {
        label = "High"
        emoji = "🟠"
    } else {
        label = "Critical"
        emoji = "🔴"
    }

    return { label, emoji, remaining, percent }
}
