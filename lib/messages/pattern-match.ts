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
 * Both start and end parts must be non-empty.
 */
export function matchesPattern(text: string, pattern: string): boolean {
    const normText = normalizeForMatching(text)
    const normPattern = normalizeForMatching(pattern)

    // Only support "start...end" pattern format (both parts required)
    const parts = normPattern.split("...", 2)
    const startPart = parts[0] ?? ""
    const endPart = parts[1] ?? ""

    // Both start and end must be non-empty
    if (!startPart || !endPart) {
        return false
    }

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
