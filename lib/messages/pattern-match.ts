import type { WithParts } from "../state"

/**
 * Pattern matching rules for message pruning:
 * - "start...end" → text.startsWith(start) && text.endsWith(end)
 * - "start..."    → text.startsWith(start)
 * - "...end"      → text.endsWith(end)
 * - "exact"       → text.includes(exact) (no ... delimiter)
 */
export function matchesPattern(text: string, pattern: string): boolean {
    // Handle exact match (no ... delimiter)
    if (!pattern.includes("...")) {
        return text.includes(pattern)
    }

    // Handle start...end pattern
    if (pattern.startsWith("...") && pattern.endsWith("...")) {
        // Pattern is "...middle..." - treat as includes
        const middle = pattern.slice(3, -3)
        return text.includes(middle)
    }

    if (pattern.startsWith("...")) {
        // Pattern is "...end" - match end only
        const endPart = pattern.slice(3)
        return text.endsWith(endPart)
    }

    if (pattern.endsWith("...")) {
        // Pattern is "start..." - match start only
        const startPart = pattern.slice(0, -3)
        return text.startsWith(startPart)
    }

    // Pattern is "start...end" - match both
    const parts = pattern.split("...", 2)
    const startPart = parts[0] ?? ""
    const endPart = parts[1] ?? ""
    return text.startsWith(startPart) && text.endsWith(endPart)
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
