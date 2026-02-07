/**
 * Pattern-based replacement strategy for context pruning.
 *
 * Replaces content between start/end patterns with concise alternatives,
 * providing more granular control than hash-based pruning.
 *
 * This uses state tracking like discard/distill - replacements are stored
 * in state and applied during message processing.
 */

import type { ReplaceOperation, ReplacementResult, ReplaceOperationResult } from "./_types"
import type { WithParts, SessionState, ReplacementEntry } from "../state"
import { countTokens } from "./utils"
import { invalidatePruneCache } from "../state/utils"
import { saveSessionState } from "../state/persistence"
import { sendUnifiedNotification } from "../ui/notification"
import { formatDiscardNotification } from "../ui/minimal-notifications"
import type { PruneToolContext } from "./_types"
import { getCurrentParams } from "./utils"

const MIN_MATCH_LENGTH = 30

interface PatternMatch {
    messageId: string
    partIndex: number
    startIndex: number
    endIndex: number
    startPattern: string
    endPattern: string
}

/**
 * Find all pattern matches in messages.
 * Returns matches sorted by position for processing.
 */
function findPatternMatches(
    messages: WithParts[],
    operations: ReplaceOperation[],
): Map<ReplaceOperation, PatternMatch[]> {
    const matches = new Map<ReplaceOperation, PatternMatch[]>()

    for (const operation of operations) {
        const operationMatches: PatternMatch[] = []

        for (let msgIndex = 0; msgIndex < messages.length; msgIndex++) {
            const msg = messages[msgIndex]
            if (!msg || !msg.parts) continue

            for (let partIndex = 0; partIndex < msg.parts.length; partIndex++) {
                const part = msg.parts[partIndex]
                if (!part || part.type !== "text" || !part.text) continue

                const content = part.text
                let searchIndex = 0

                // Find all occurrences of start pattern
                while (true) {
                    const startIdx = content.indexOf(operation.start, searchIndex)
                    if (startIdx === -1) break

                    // Look for end pattern after start
                    const endIdx = content.indexOf(operation.end, startIdx + operation.start.length)
                    if (endIdx === -1) break

                    // Found a complete match
                    operationMatches.push({
                        messageId: msg.info.id,
                        partIndex,
                        startIndex: startIdx,
                        endIndex: endIdx + operation.end.length,
                        startPattern: operation.start,
                        endPattern: operation.end,
                    })

                    searchIndex = endIdx + operation.end.length
                }
            }
        }

        matches.set(operation, operationMatches)
    }

    return matches
}

/**
 * Validate matches against constraints.
 * Throws errors for validation failures.
 */
function validateMatches(matches: Map<ReplaceOperation, PatternMatch[]>): void {
    const errors: string[] = []

    for (const [operation, operationMatches] of matches) {
        if (operationMatches.length === 0) {
            errors.push(
                `Pattern not found: start="${operation.start.substring(0, 20)}..." ` +
                    `end="${operation.end.substring(0, 20)}..."`,
            )
            continue
        }

        if (operationMatches.length > 1) {
            errors.push(
                `Pattern appears ${operationMatches.length} times: ` +
                    `start="${operation.start.substring(0, 20)}...". ` +
                    `Use more specific patterns to match exactly once.`,
            )
            continue
        }

        const match = operationMatches[0]!
        const matchLength = match.endIndex - match.startIndex

        if (matchLength < MIN_MATCH_LENGTH) {
            errors.push(
                `Match too short (${matchLength} chars, minimum ${MIN_MATCH_LENGTH}): ` +
                    `start="${operation.start.substring(0, 20)}..."`,
            )
        }

        // Validate pattern length - start or end must be > 15 chars for specificity
        if (operation.start.length <= 15 && operation.end.length <= 15) {
            errors.push(
                `Pattern too short: start (${operation.start.length}) or end (${operation.end.length}) must be > 15 characters ` +
                    `to ensure unique matching`,
            )
        }
    }

    // Check for overlapping matches
    const allMatches: Array<{ operation: ReplaceOperation; match: PatternMatch }> = []
    for (const [operation, operationMatches] of matches) {
        for (const match of operationMatches) {
            allMatches.push({ operation, match })
        }
    }

    // Sort by message, then by position
    allMatches.sort((a, b) => {
        if (a.match.messageId !== b.match.messageId) {
            return a.match.messageId.localeCompare(b.match.messageId)
        }
        if (a.match.partIndex !== b.match.partIndex) {
            return a.match.partIndex - b.match.partIndex
        }
        return a.match.startIndex - b.match.startIndex
    })

    // Check overlaps
    for (let i = 0; i < allMatches.length - 1; i++) {
        const current = allMatches[i]!
        const next = allMatches[i + 1]!

        if (
            current.match.messageId === next.match.messageId &&
            current.match.partIndex === next.match.partIndex
        ) {
            if (current.match.endIndex > next.match.startIndex) {
                errors.push(
                    `Overlapping patterns detected: "${current.operation.start.substring(0, 20)}..." ` +
                        `overlaps with "${next.operation.start.substring(0, 20)}..."`,
                )
            }
        }
    }

    if (errors.length > 0) {
        throw new Error(`Pattern replacement validation failed:\n${errors.join("\n")}`)
    }
}

/**
 * Convert PatternMatch to ReplacementEntry for state storage.
 */
function createReplacementEntry(
    match: PatternMatch,
    operation: ReplaceOperation,
): ReplacementEntry {
    return {
        messageId: match.messageId,
        partIndex: match.partIndex,
        startIndex: match.startIndex,
        endIndex: match.endIndex,
        replacement: operation.replacement,
        originalLength: match.endIndex - match.startIndex,
    }
}

/**
 * Execute pattern-based replacement operations.
 * Uses state tracking like discard/distill - replacements are stored in state
 * and applied during message processing.
 *
 * @param ctx - Tool context with client, state, logger, config
 * @param toolCtx - Tool execution context with sessionID
 * @param operations - Array of replace operations to perform
 * @returns Result string for display
 */
export async function executeReplace(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    operations: ReplaceOperation[],
): Promise<string> {
    const { client, state, logger, config } = ctx
    const sessionId = toolCtx.sessionID

    if (!operations || operations.length === 0) {
        return "Replace failed: No operations provided"
    }

    // Validate operations
    for (const op of operations) {
        if (!op.start || !op.end || op.replacement === undefined) {
            return "Replace failed: Invalid operation - start, end, and replacement are required"
        }
    }

    // Fetch messages to find pattern matches
    const messagesResponse = await client.session.messages({
        path: { id: sessionId },
    })
    const messages: WithParts[] = (messagesResponse.data || messagesResponse) as WithParts[]

    // Find matches
    const matches = findPatternMatches(messages, operations)

    // Validate matches
    try {
        validateMatches(matches)
    } catch (error) {
        return `Replace failed: ${error instanceof Error ? error.message : String(error)}`
    }

    // Collect all valid matches and create replacement entries
    const replacements: ReplacementEntry[] = []
    const replacementResults: ReplacementResult[] = []

    for (const [operation, operationMatches] of matches) {
        const match = operationMatches[0]!
        const entry = createReplacementEntry(match, operation)
        replacements.push(entry)

        // Calculate tokens saved
        const msg = messages.find((m) => m.info.id === match.messageId)
        const part = msg?.parts?.[match.partIndex]
        let originalTokens = 0
        if (part && part.type === "text" && part.text) {
            originalTokens = countTokens(part.text.substring(match.startIndex, match.endIndex))
        }
        const newTokens = countTokens(operation.replacement)

        replacementResults.push({
            operation,
            messageId: match.messageId,
            partIndex: match.partIndex,
            startIndex: match.startIndex,
            endIndex: match.endIndex,
            originalLength: match.endIndex - match.startIndex,
            newLength: operation.replacement.length,
            tokensSaved: originalTokens - newTokens,
        })
    }

    // Add replacements to state (like how discard/distill add to prune lists)
    state.prune.replacements.push(...replacements)

    // Invalidate cache so replacements are rebuilt on next access
    invalidatePruneCache(state)

    // Update stats
    const totalTokensSaved = replacementResults.reduce((sum, r) => sum + r.tokensSaved, 0)
    state.stats.totalPruneTokens += totalTokensSaved
    state.stats.strategyStats.distillation.count += replacements.length
    state.stats.strategyStats.distillation.tokens += totalTokensSaved

    // Update last discard stats for display
    state.lastDiscardStats = {
        itemCount: replacements.length,
        tokensSaved: totalTokensSaved,
    }

    // Record in discard history
    state.discardHistory.push({
        timestamp: Date.now(),
        hashes: operations.map((op) => `${op.start.substring(0, 10)}...${op.end.substring(0, 10)}`),
        tokensSaved: totalTokensSaved,
        reason: "pattern-replacement",
    })

    // Send notification
    const currentParams = getCurrentParams(state, messages, logger)
    await sendUnifiedNotification(
        client,
        logger,
        config,
        {
            state,
            pruneToolIds: [],
            toolMetadata: new Map(),
            reason: "distillation",
            workingDirectory: ctx.workingDirectory,
            attemptedTargets: operations.map((op) => `${op.start.substring(0, 20)}...`),
            options: { simplified: true },
            itemizedDistilled: replacementResults.map((r) => ({
                type: "message" as const,
                summary: `${r.operation.start.substring(0, 20)}... → ${r.operation.replacement.substring(0, 20)}`,
            })),
        },
        sessionId,
        currentParams,
    )

    // Save state
    saveSessionState(state, logger).catch((err: Error) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    // Build response
    const minimalNotification = formatDiscardNotification(
        replacements.length,
        "distillation",
        operations.map((op) => `${op.start.substring(0, 10)}...`),
        "message",
        state,
        ctx.workingDirectory,
    )

    return minimalNotification
}

/**
 * Apply stored pattern replacements to messages.
 * This function is called during message processing (like prune filtering).
 *
 * @param messages - Messages to process
 * @param state - Session state containing replacement entries
 * @returns Modified messages with replacements applied
 */
export function applyPatternReplacements(messages: WithParts[], state: SessionState): WithParts[] {
    if (!state.prune.replacements || state.prune.replacements.length === 0) {
        return messages
    }

    // Group replacements by message:part for efficient processing
    const replacementsByPart = new Map<string, ReplacementEntry[]>()
    for (const entry of state.prune.replacements) {
        const key = `${entry.messageId}:${entry.partIndex}`
        const list = replacementsByPart.get(key) || []
        list.push(entry)
        replacementsByPart.set(key, list)
    }

    // Process each message
    return messages.map((msg) => {
        const relevantReplacements: Array<{ partIndex: number; entry: ReplacementEntry }> = []

        // Find all replacements for this message
        for (const [key, entries] of replacementsByPart) {
            const [msgId, partIdxStr] = key.split(":")
            if (msgId === msg.info.id) {
                const partIndex = parseInt(partIdxStr!, 10)
                for (const entry of entries) {
                    relevantReplacements.push({ partIndex, entry })
                }
            }
        }

        if (relevantReplacements.length === 0) {
            return msg
        }

        // Clone the message and apply replacements
        const newParts = [...msg.parts]

        // Group by part index
        const byPartIndex = new Map<number, ReplacementEntry[]>()
        for (const { partIndex, entry } of relevantReplacements) {
            const list = byPartIndex.get(partIndex) || []
            list.push(entry)
            byPartIndex.set(partIndex, list)
        }

        // Apply replacements to each part (in reverse order to maintain indices)
        for (const [partIndex, entries] of byPartIndex) {
            const part = newParts[partIndex]
            if (!part || part.type !== "text" || !part.text) continue

            // Sort entries by startIndex descending (bottom-up)
            const sortedEntries = [...entries].sort((a, b) => b.startIndex - a.startIndex)

            let newText = part.text
            for (const entry of sortedEntries) {
                newText =
                    newText.substring(0, entry.startIndex) +
                    entry.replacement +
                    newText.substring(entry.endIndex)
            }

            newParts[partIndex] = {
                ...part,
                text: newText,
            }
        }

        return {
            ...msg,
            parts: newParts,
        }
    })
}

/**
 * Format replacement result for display (legacy compatibility).
 * Now just returns the count since actual work is done in executeReplace.
 */
export function formatReplaceResult(result: ReplaceOperationResult): string {
    if (!result.success) {
        return `Replace failed:\n${result.errors.join("\n")}`
    }

    if (result.replacements.length === 0) {
        return "Replace completed: no changes made"
    }

    const lines: string[] = []
    lines.push(`Replace completed: ${result.replacements.length} replacement(s)`)

    const totalTokensSaved = result.replacements.reduce((sum, r) => sum + r.tokensSaved, 0)
    lines.push(`Tokens saved: ~${totalTokensSaved}`)

    for (const replacement of result.replacements) {
        const startPreview = replacement.operation.start.substring(0, 20)
        const endPreview = replacement.operation.end.substring(0, 20)
        lines.push(
            `  - "${startPreview}..." → "${endPreview}..." ` +
                `(${replacement.originalLength} → ${replacement.newLength} chars)`,
        )
    }

    return lines.join("\n")
}
