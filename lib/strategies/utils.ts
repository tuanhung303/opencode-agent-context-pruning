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
