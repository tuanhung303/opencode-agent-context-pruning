import type { SessionState, WithParts } from "../state"

/**
 * Normalizes text for pattern matching:
 * - Trim whitespace
 * - Collapse multiple spaces to single space
 * - Lowercase for case-insensitive matching
 */
function normalizeForMatching(text: string): string {
    return text.trim().replace(/\s+/g, " ").toLowerCase()
}

/**
 * Pattern matching rules for message pruning:
 * - "start...end" → text.startsWith(start) && text.endsWith(end)
 * - "start..."    → text.startsWith(start)
 * - "...end"      → text.endsWith(end)
 * - "exact"       → text.includes(exact) (no ... delimiter)
 */
export function matchesPattern(text: string, pattern: string): boolean {
    const normText = normalizeForMatching(text)
    const normPattern = normalizeForMatching(pattern)

    // Handle exact match (no ... delimiter)
    if (!normPattern.includes("...")) {
        return normText.includes(normPattern)
    }

    // Handle start...end pattern
    if (normPattern.startsWith("...") && normPattern.endsWith("...")) {
        // Pattern is "...middle..." - treat as includes
        const middle = normPattern.slice(3, -3)
        return normText.includes(middle)
    }

    if (normPattern.startsWith("...")) {
        // Pattern is "...end" - match end only
        const endPart = normPattern.slice(3)
        return normText.endsWith(endPart)
    }

    if (normPattern.endsWith("...")) {
        // Pattern is "start..." - match start only
        const startPart = normPattern.slice(0, -3)
        return normText.startsWith(startPart)
    }

    // Pattern is "start...end" - match both
    const parts = normPattern.split("...", 2)
    const startPart = parts[0] ?? ""
    const endPart = parts[1] ?? ""
    return normText.startsWith(startPart) && normText.endsWith(endPart)
}

/**
 * Find assistant messages matching a pattern.
 * Returns array of { messageId, partIndex, content } for matches.
 */
export function findMessagesByPattern(
    messages: WithParts[],
    pattern: string,
): Array<{ messageId: string; partIndex: number; content: string }> {
    const matches: Array<{ messageId: string; partIndex: number; content: string }> = []

    for (const msg of messages) {
        // Only search assistant messages
        if (msg.info.role !== "assistant") {
            continue
        }

        const messageId = msg.info.id
        const parts = Array.isArray(msg.parts) ? msg.parts : []

        for (let partIndex = 0; partIndex < parts.length; partIndex++) {
            const part = parts[partIndex]
            if (!part || part.type !== "text" || !part.text) {
                continue
            }

            if (matchesPattern(part.text, pattern)) {
                matches.push({
                    messageId,
                    partIndex,
                    content: part.text,
                })
            }
        }
    }

    return matches
}

/**
 * Generate a hash for message content pruning.
 * Format: m_xxxxxx (m = message, 6 random chars)
 */
export function generateMessageHash(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
    let hash = ""
    for (let i = 0; i < 6; i++) {
        hash += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return `m_${hash}`
}

/**
 * Store a pattern-to-content mapping for later restore.
 * This enables symmetric restore using the same pattern that was used to discard.
 */
export function storePatternMapping(
    pattern: string,
    content: string,
    partId: string,
    state: SessionState,
): void {
    const normalizedPattern = normalizeForMatching(pattern)
    state.patternToContent.set(normalizedPattern, {
        originalContent: content,
        partId,
        normalizedPattern,
    })
}

/**
 * Restore content by pattern lookup.
 * Returns the stored content and partId if found, null otherwise.
 */
export function restoreByPattern(
    pattern: string,
    state: SessionState,
): { partId: string; content: string } | null {
    const normalizedPattern = normalizeForMatching(pattern)
    const entry = state.patternToContent.get(normalizedPattern)
    if (!entry) {
        return null
    }
    return {
        partId: entry.partId,
        content: entry.originalContent,
    }
}
