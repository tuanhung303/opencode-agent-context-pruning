import { PluginConfig } from "../config"
import { Logger } from "../logger"
import type { SessionState, WithParts } from "../state"
import { countTokens } from "./utils"
import { isMessageCompacted } from "../shared-utils"

/**
 * Thinking Block Compression Strategy
 *
 * Compresses extended thinking/reasoning blocks from older turns to save context.
 * These blocks can be extremely large (10k+ tokens) but become less relevant
 * as the conversation progresses. This strategy keeps a summary while
 * removing the bulk of the content.
 */

const COMPRESSION_MARKER = "[Thinking compressed to save context - key points preserved above]"

/**
 * Compresses thinking/reasoning blocks from older assistant messages.
 * Modifies message parts in-place.
 */
export const compressThinkingBlocks = (
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
    messages: WithParts[],
): void => {
    if (!config.strategies.thinkingCompression?.enabled) {
        return
    }

    const minTurnsOld = config.strategies.thinkingCompression.minTurnsOld ?? 3
    const maxTokens = config.strategies.thinkingCompression.maxTokens ?? 500

    let totalTokensSaved = 0
    let compressedCount = 0

    // Track which turn each message belongs to
    let currentTurn = 0

    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) {
            continue
        }

        const parts = Array.isArray(msg.parts) ? msg.parts : []

        // Count turns by step-start parts
        for (const part of parts) {
            if (part.type === "step-start") {
                currentTurn++
            }
        }

        // Only process assistant messages
        if (msg.info.role !== "assistant") {
            continue
        }

        // Calculate message age
        const messageAge = state.currentTurn - currentTurn
        if (messageAge < minTurnsOld) {
            continue
        }

        // Find and compress reasoning parts
        for (const part of parts) {
            if (part.type !== "reasoning") {
                continue
            }

            // Skip if already compressed
            if (part.text?.includes(COMPRESSION_MARKER)) {
                continue
            }

            const reasoning = part.text
            if (!reasoning || typeof reasoning !== "string") {
                continue
            }

            // Check if it exceeds threshold
            const tokenCount = countTokens(reasoning)
            if (tokenCount <= maxTokens) {
                continue
            }

            // Compress the thinking block
            const compressed = compressThinking(reasoning, maxTokens)
            const newTokenCount = countTokens(compressed)
            const tokensSaved = tokenCount - newTokenCount

            part.text = compressed
            totalTokensSaved += tokensSaved
            compressedCount++

            logger.debug(`Compressed thinking block`, {
                messageAge,
                originalTokens: tokenCount,
                newTokens: newTokenCount,
                tokensSaved,
            })
        }
    }

    if (compressedCount > 0) {
        state.stats.strategyStats.thinkingCompression.count += compressedCount
        state.stats.strategyStats.thinkingCompression.tokens += totalTokensSaved
        logger.info(
            `Compressed ${compressedCount} thinking block(s), saved ~${totalTokensSaved} tokens`,
        )
    }
}

/**
 * Compresses a thinking block by extracting key points and truncating.
 * Preserves the beginning (problem understanding) and key conclusions.
 */
function compressThinking(content: string, maxTokens: number): string {
    const lines = content.split("\n")

    // If content is small enough, return as-is
    if (lines.length <= 10) {
        return content
    }

    // Extract key sections
    const keyPhrases = [
        "conclusion",
        "therefore",
        "the answer",
        "in summary",
        "key point",
        "important",
        "decision",
        "approach",
        "solution",
        "result",
    ]

    // Keep first few lines (problem understanding)
    const headLines: string[] = []
    let headTokens = 0
    const headTarget = Math.floor(maxTokens * 0.3)

    for (const line of lines.slice(0, 20)) {
        const lineTokens = countTokens(line + "\n")
        if (headTokens + lineTokens > headTarget) {
            break
        }
        headLines.push(line)
        headTokens += lineTokens
    }

    // Find and keep key conclusion lines
    const keyLines: string[] = []
    let keyTokens = 0
    const keyTarget = Math.floor(maxTokens * 0.5)

    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]!.toLowerCase()
        const isKeyLine = keyPhrases.some((phrase) => line.includes(phrase))

        if (isKeyLine || i >= lines.length - 5) {
            const lineTokens = countTokens(lines[i]! + "\n")
            if (keyTokens + lineTokens > keyTarget) {
                break
            }
            keyLines.unshift(lines[i]!)
            keyTokens += lineTokens
        }
    }

    // Build compressed output
    const linesRemoved = lines.length - headLines.length - keyLines.length
    const marker = `\n\n[... ${linesRemoved} lines of reasoning compressed ...]\n\n`

    return headLines.join("\n") + marker + keyLines.join("\n") + "\n" + COMPRESSION_MARKER
}

/**
 * Estimates potential savings from thinking compression.
 */
export function estimateThinkingCompressionSavings(
    state: SessionState,
    messages: WithParts[],
    minTurnsOld: number = 3,
    maxTokens: number = 500,
): { count: number; estimatedSavings: number } {
    let count = 0
    let estimatedSavings = 0
    let currentTurn = 0

    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) {
            continue
        }

        const parts = Array.isArray(msg.parts) ? msg.parts : []

        for (const part of parts) {
            if (part.type === "step-start") {
                currentTurn++
            }
        }

        if (msg.info.role !== "assistant") {
            continue
        }

        const messageAge = state.currentTurn - currentTurn
        if (messageAge < minTurnsOld) {
            continue
        }

        for (const part of parts) {
            if (part.type !== "reasoning") {
                continue
            }

            const reasoning = part.text
            if (!reasoning || typeof reasoning !== "string") {
                continue
            }

            if (
                reasoning.includes("[... ") &&
                reasoning.includes(" lines of reasoning compressed")
            ) {
                continue
            }

            const tokenCount = countTokens(reasoning)
            if (tokenCount > maxTokens) {
                count++
                // Estimate ~70% savings after compression
                estimatedSavings += Math.floor(tokenCount * 0.7)
            }
        }
    }

    return { count, estimatedSavings }
}
