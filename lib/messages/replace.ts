/**
 * Utility functions for pattern-based message replacement.
 */

import type { ReplaceOperation } from "../strategies/_types"
import type { WithParts } from "../state"

/**
 * Find the first occurrence of start pattern in message content.
 * Returns the index and the message/part where found.
 */
export function findPatternStart(
    messages: WithParts[],
    pattern: string,
): Array<{
    messageId: string
    partIndex: number
    charIndex: number
}> {
    const results: ReturnType<typeof findPatternStart> = []

    for (const msg of messages) {
        if (!msg.parts) continue

        for (let partIndex = 0; partIndex < msg.parts.length; partIndex++) {
            const part = msg.parts[partIndex]
            if (!part || part.type !== "text" || !part.text) continue

            const index = part.text.indexOf(pattern)
            if (index !== -1) {
                results.push({
                    messageId: msg.info.id,
                    partIndex,
                    charIndex: index,
                })
            }
        }
    }

    return results
}

/**
 * Check if a pattern would produce a valid match (>= 30 chars, exactly one occurrence).
 */
export function validatePattern(
    messages: WithParts[],
    operation: ReplaceOperation,
): {
    valid: boolean
    occurrences: number
    matchLength: number
    error?: string
} {
    const startMatches = findPatternStart(messages, operation.start)

    if (startMatches.length === 0) {
        return {
            valid: false,
            occurrences: 0,
            matchLength: 0,
            error: `Start pattern not found: "${operation.start.substring(0, 30)}..."`,
        }
    }

    if (startMatches.length > 1) {
        return {
            valid: false,
            occurrences: startMatches.length,
            matchLength: 0,
            error: `Start pattern appears ${startMatches.length} times. Use a more specific pattern.`,
        }
    }

    const startMatch = startMatches[0]!
    const msg = messages.find((m) => m.info.id === startMatch.messageId)
    if (!msg || !msg.parts) {
        return {
            valid: false,
            occurrences: 0,
            matchLength: 0,
            error: "Message not found",
        }
    }

    const part = msg.parts[startMatch.partIndex]
    if (!part || part.type !== "text" || !part.text) {
        return {
            valid: false,
            occurrences: 0,
            matchLength: 0,
            error: "Invalid message part",
        }
    }

    const content = part.text
    const endIndex = content.indexOf(operation.end, startMatch.charIndex + operation.start.length)

    if (endIndex === -1) {
        return {
            valid: false,
            occurrences: 0,
            matchLength: 0,
            error: `End pattern not found after start: "${operation.end.substring(0, 30)}..."`,
        }
    }

    const matchLength = endIndex + operation.end.length - startMatch.charIndex

    if (matchLength < 30) {
        return {
            valid: false,
            occurrences: 1,
            matchLength,
            error: `Match too short (${matchLength} chars, minimum 30)`,
        }
    }

    return {
        valid: true,
        occurrences: 1,
        matchLength,
    }
}

/**
 * Preview what a replacement would look like without applying it.
 */
export function previewReplacement(
    messages: WithParts[],
    operation: ReplaceOperation,
): {
    canReplace: boolean
    preview?: string
    error?: string
} {
    const validation = validatePattern(messages, operation)

    if (!validation.valid) {
        return {
            canReplace: false,
            error: validation.error,
        }
    }

    const startMatches = findPatternStart(messages, operation.start)
    const startMatch = startMatches[0]!
    const msg = messages.find((m) => m.info.id === startMatch.messageId)!
    const part = msg.parts![startMatch.partIndex]

    if (!part || part.type !== "text" || !part.text) {
        return {
            canReplace: false,
            error: "Invalid message part",
        }
    }

    const content = part.text
    const endIndex = content.indexOf(operation.end, startMatch.charIndex + operation.start.length)

    const beforeMatch = content.substring(
        Math.max(0, startMatch.charIndex - 50),
        startMatch.charIndex,
    )
    const afterMatch = content.substring(
        endIndex + operation.end.length,
        Math.min(content.length, endIndex + operation.end.length + 50),
    )

    const preview = `${beforeMatch}[${operation.replacement}]${afterMatch}`

    return {
        canReplace: true,
        preview,
    }
}

/**
 * Count total replacements that could be performed across all operations.
 */
export function countValidReplacements(
    messages: WithParts[],
    operations: ReplaceOperation[],
): {
    valid: number
    invalid: number
    totalTokensSaved: number
} {
    let valid = 0
    let invalid = 0
    let totalTokensSaved = 0

    for (const operation of operations) {
        const validation = validatePattern(messages, operation)

        if (validation.valid) {
            valid++
            // Rough estimation: ~4 chars per token
            const tokensSaved = Math.floor(
                (validation.matchLength - operation.replacement.length) / 4,
            )
            totalTokensSaved += Math.max(0, tokensSaved)
        } else {
            invalid++
        }
    }

    return { valid, invalid, totalTokensSaved }
}
