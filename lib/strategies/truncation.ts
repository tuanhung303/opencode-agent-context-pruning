import { PluginConfig } from "../config"
import { Logger } from "../logger"
import type { SessionState, WithParts } from "../state"
import { countTokens } from "./utils"
import { isMessageCompacted } from "../shared-utils"

/**
 * Head-Tail Truncation Strategy
 *
 * Truncates large tool outputs (especially file reads) by keeping the head
 * and tail portions, with a summary marker in the middle. This preserves
 * the most useful context (imports/exports at top, recent code at bottom)
 * while reducing token usage.
 */

const TRUNCATION_MARKER = "\n\n[... middle content truncated to save context ...]\n\n"

/**
 * Truncates large tool outputs in-place, keeping head and tail portions.
 * Only affects tools that have already been processed (not in current turn).
 */
export const truncateLargeOutputs = (
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
    messages: WithParts[],
): void => {
    if (!config.strategies.truncation?.enabled) {
        return
    }

    const maxTokens = config.strategies.truncation.maxTokens ?? 2000
    const headRatio = config.strategies.truncation.headRatio ?? 0.4
    const tailRatio = config.strategies.truncation.tailRatio ?? 0.4
    const minTurnsOld = config.strategies.truncation.minTurnsOld ?? 2
    const targetTools = config.strategies.truncation.targetTools ?? ["read", "grep", "glob", "bash"]

    let totalTokensSaved = 0
    let truncatedCount = 0

    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) {
            continue
        }

        const parts = Array.isArray(msg.parts) ? msg.parts : []
        for (const part of parts) {
            if (part.type !== "tool" || !part.callID) {
                continue
            }

            // Skip if already pruned
            if (state.prune.toolIds.includes(part.callID)) {
                continue
            }

            // Only truncate specific tools
            if (!targetTools.includes(part.tool)) {
                continue
            }

            // Only truncate completed tools
            if (part.state.status !== "completed") {
                continue
            }

            // Skip if output is missing or already truncated
            const output = part.state.output
            if (!output || typeof output !== "string") {
                continue
            }

            if (output.includes("[... middle content truncated")) {
                continue
            }

            // Check tool age (only truncate older outputs)
            const toolMeta = state.toolParameters.get(part.callID)
            if (toolMeta) {
                const toolAge = state.currentTurn - toolMeta.turn
                if (toolAge < minTurnsOld) {
                    continue
                }
            }

            // Check if output exceeds threshold
            const tokenCount = countTokens(output)
            if (tokenCount <= maxTokens) {
                continue
            }

            // Calculate truncation points
            const truncated = truncateContent(output, maxTokens, headRatio, tailRatio)
            if (truncated === output) {
                continue
            }

            // Apply truncation
            const newTokenCount = countTokens(truncated)
            const tokensSaved = tokenCount - newTokenCount

            part.state.output = truncated
            totalTokensSaved += tokensSaved
            truncatedCount++

            logger.debug(`Truncated ${part.tool} output`, {
                callId: part.callID,
                originalTokens: tokenCount,
                newTokens: newTokenCount,
                tokensSaved,
            })
        }
    }

    if (truncatedCount > 0) {
        state.stats.strategyStats.truncation.count += truncatedCount
        state.stats.strategyStats.truncation.tokens += totalTokensSaved
        logger.info(`Truncated ${truncatedCount} large outputs, saved ~${totalTokensSaved} tokens`)
    }
}

/**
 * Truncates content by keeping head and tail portions.
 * Preserves line boundaries for readability.
 */
function truncateContent(
    content: string,
    maxTokens: number,
    headRatio: number,
    tailRatio: number,
): string {
    const lines = content.split("\n")

    // If content is small enough, return as-is
    if (lines.length <= 20) {
        return content
    }

    // Calculate target sizes
    const targetTokens = maxTokens - countTokens(TRUNCATION_MARKER)
    const headTokens = Math.floor(targetTokens * headRatio)
    const tailTokens = Math.floor(targetTokens * tailRatio)

    // Build head section
    const headLines: string[] = []
    let headTokenCount = 0
    for (const line of lines) {
        const lineTokens = countTokens(line + "\n")
        if (headTokenCount + lineTokens > headTokens) {
            break
        }
        headLines.push(line)
        headTokenCount += lineTokens
    }

    // Build tail section (from end)
    const tailLines: string[] = []
    let tailTokenCount = 0
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]!
        const lineTokens = countTokens(line + "\n")
        if (tailTokenCount + lineTokens > tailTokens) {
            break
        }
        tailLines.unshift(line)
        tailTokenCount += lineTokens
    }

    // Ensure we don't overlap
    const headEndIndex = headLines.length
    const tailStartIndex = lines.length - tailLines.length

    if (headEndIndex >= tailStartIndex) {
        // Content is not large enough to truncate meaningfully
        return content
    }

    // Calculate lines removed for the marker
    const linesRemoved = tailStartIndex - headEndIndex
    const marker = `\n\n[... ${linesRemoved} lines truncated to save context ...]\n\n`

    return headLines.join("\n") + marker + tailLines.join("\n")
}

/**
 * Estimates if a tool output would benefit from truncation.
 * Used for preview/stats without modifying content.
 */
export function estimateTruncationSavings(
    output: string,
    maxTokens: number = 2000,
): { wouldTruncate: boolean; estimatedSavings: number } {
    if (!output || typeof output !== "string") {
        return { wouldTruncate: false, estimatedSavings: 0 }
    }

    const tokenCount = countTokens(output)
    if (tokenCount <= maxTokens) {
        return { wouldTruncate: false, estimatedSavings: 0 }
    }

    // Estimate savings (roughly 20% of original after truncation)
    const estimatedSavings = Math.floor(tokenCount * 0.6)
    return { wouldTruncate: true, estimatedSavings }
}
