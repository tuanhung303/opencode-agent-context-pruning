/**
 * Pruning Status TUI Display Module
 *
 * Provides inline terminal UI notifications for context pruning operations.
 * Displays brief, non-intrusive status updates after discard/distill actions.
 *
 * Display Format:
 * - Pruned only:  "pruned: read, grep, glob..."
 * - Distilled:    "distilled: authe...oken, user...data..."
 * - Combined:     "pruned: read, grep | distilled: authe...oken"
 *
 * Features:
 * - Maximum 3 items displayed per category with "..." overflow
 * - Content previews show first 5 + "..." + last 5 characters
 * - ANSI dim/muted styling for subtlety (respects NO_COLOR)
 * - Graceful fallback to plain text for non-TTY terminals
 *
 * @module lib/ui/pruning-status
 */

import { PRUNE_CATEGORY_ICONS } from "./utils"

/**
 * Item representing a pruned item with its type
 */
export interface ItemizedPrunedItem {
    type: "tool" | "message" | "reasoning"
    name: string
}

/**
 * Item representing a distilled item with its type and summary
 */
export interface ItemizedDistilledItem {
    type: "tool" | "message" | "reasoning"
    summary: string
}

/**
 * Format pruned tools list for display
 * Format: "pruned: tool1, tool2, tool3..."
 * Shows up to 3 tool names with overflow indicator
 *
 * @param tools - Array of tool names that were pruned
 * @returns Formatted string or empty string if no tools
 */
export function formatPrunedTools(tools: string[]): string {
    if (!tools || tools.length === 0) {
        return ""
    }

    const displayTools = tools.slice(0, 3)
    let result = `pruned: ${displayTools.join(", ")}`

    if (tools.length > 3) {
        result += "..."
    }

    return result
}

/**
 * Create a preview of content showing first 5 and last 5 characters
 * For content shorter than 10 chars, show full content
 *
 * @param content - The content string to preview
 * @returns Preview string (e.g., "authe...oken" for "authentication token")
 */
function createContentPreview(content: string): string {
    if (content.length <= 10) {
        return content
    }
    return `${content.slice(0, 5)}...${content.slice(-5)}`
}

/**
 * Format distilled content list for display
 * Format: "distilled: preview1, preview2, preview3..."
 * Each preview shows first 5 + "..." + last 5 characters
 * Shows up to 3 items with overflow indicator
 *
 * @param contents - Array of distilled content strings
 * @returns Formatted string or empty string if no contents
 */
export function formatDistilledContent(contents: string[]): string {
    if (!contents || contents.length === 0) {
        return ""
    }

    const displayContents = contents.slice(0, 3).map(createContentPreview)
    let result = `distilled: ${displayContents.join(", ")}`

    if (contents.length > 3) {
        result += "..."
    }

    return result
}

/**
 * Format combined pruning status display
 * Shows both pruned tools and distilled content separated by " | "
 * Returns empty string if both are empty
 *
 * @param prunedTools - Array of tool names that were pruned
 * @param distilledContents - Array of distilled content strings
 * @returns Combined formatted string or empty string if nothing to display
 *
 * @example
 * formatPruningStatus(["read", "grep"], ["auth token"])
 * // Returns: "pruned: read, grep | distilled: auth token"
 */
export function formatPruningStatus(prunedTools: string[], distilledContents: string[]): string {
    const pruned = formatPrunedTools(prunedTools)
    const distilled = formatDistilledContent(distilledContents)

    if (pruned && distilled) {
        return `${pruned} | ${distilled}`
    }

    return pruned || distilled
}

// ANSI color codes
const ANSI_DIM = "\x1b[2m"
const ANSI_RESET = "\x1b[0m"

/**
 * Check if terminal supports ANSI colors
 * Respects NO_COLOR environment variable and non-TTY streams
 *
 * @returns true if terminal supports ANSI colors, false otherwise
 *
 * Returns false when:
 * - NO_COLOR environment variable is set
 * - stdout is not a TTY (e.g., piped output)
 */
export function supportsAnsiColors(): boolean {
    // Respect NO_COLOR environment variable
    if (process.env.NO_COLOR) {
        return false
    }

    // Check if stdout is TTY
    if (process.stdout && !process.stdout.isTTY) {
        return false
    }

    return true
}

/**
 * Apply dim/muted styling to text using ANSI codes
 * Gracefully falls back to plain text if terminal doesn't support colors
 *
 * @param text - The text to style
 * @returns Styled text with ANSI dim codes, or plain text if colors not supported
 *
 * @example
 * dimText("pruned: read, grep")
 * // Returns: "\x1b[2mpruned: read, grep\x1b[0m" (with color support)
 * // Returns: "pruned: read, grep" (without color support)
 */
export function dimText(text: string): string {
    if (!text) {
        return text
    }

    if (!supportsAnsiColors()) {
        return text
    }

    return `${ANSI_DIM}${text}${ANSI_RESET}`
}

/**
 * Groups items by a key function while preserving first-occurrence order.
 * Used to collapse repeated items like "bash, bash, bash" into "bash (x3)".
 *
 * @param items - Array of items to group
 * @param keyFn - Function to extract grouping key from each item
 * @returns Array of grouped items with counts
 */
function groupItems<T>(items: T[], keyFn: (item: T) => string): { item: T; count: number }[] {
    const groups = new Map<string, { item: T; count: number }>()
    for (const item of items) {
        const key = keyFn(item)
        const existing = groups.get(key)
        if (existing) {
            existing.count++
        } else {
            groups.set(key, { item, count: 1 })
        }
    }
    return Array.from(groups.values())
}

/**
 * Get the icon for a prune item type
 */
function getPruneItemIcon(type: "tool" | "message" | "reasoning"): string {
    switch (type) {
        case "tool":
            return PRUNE_CATEGORY_ICONS.tool
        case "message":
            return PRUNE_CATEGORY_ICONS.message
        case "reasoning":
            return PRUNE_CATEGORY_ICONS.thinking
    }
}

/**
 * Truncate content for display with quotes
 * Shows first N characters followed by "..." if truncated
 *
 * @param content - The content to truncate
 * @param maxLength - Maximum length before truncation (default: 15)
 * @returns Truncated string with quotes
 *
 * @example
 * truncateWithQuotes("Analysis summary content", 15)
 * // Returns: ""Analysis summary...""
 */
function truncateWithQuotes(content: string, maxLength: number = 15): string {
    if (content.length <= maxLength) {
        return `"${content}"`
    }
    return `"${content.slice(0, maxLength)}..."`
}

/**
 * Format itemized details with icons
 * Creates detailed line showing each pruned/distilled item with type icon
 *
 * Format: "⚙️ tool_name ₊ ⚙️ tool_name ₊ 💬 \"summary...\" ₊ 🧠 \"reasoning...\""
 *
 * @param prunedItems - Array of pruned items with types
 * @param distilledItems - Array of distilled items with types and summaries
 * @param maxContentLength - Maximum length for content previews (default: 15)
 * @returns Formatted string or empty string if no items
 *
 * @example
 * formatItemizedDetails(
 *   [{ type: "tool", name: "bash" }, { type: "tool", name: "bash" }, { type: "tool", name: "grep" }],
 *   [{ type: "message", summary: "Analysis summary" }]
 * )
 * // Returns: "⚙️ bash (x2) ₊ ⚙️ grep ₊ 💬 \"Analysis summa...\""
 */
export function formatItemizedDetails(
    prunedItems: ItemizedPrunedItem[],
    distilledItems: ItemizedDistilledItem[],
    maxContentLength: number = 15,
): string {
    const parts: string[] = []

    // Add grouped pruned items with icons (collapses "bash, bash, bash" → "bash (x3)")
    const groupedPruned = groupItems(prunedItems || [], (i) => `${i.type}:${i.name}`)
    for (const { item, count } of groupedPruned) {
        const icon = getPruneItemIcon(item.type)
        const countSuffix = count > 1 ? ` (x${count})` : ""
        parts.push(`${icon} ${item.name}${countSuffix}`)
    }

    // Add grouped distilled items with icons and quoted summaries
    const groupedDistilled = groupItems(distilledItems || [], (i) => `${i.type}:${i.summary}`)
    for (const { item, count } of groupedDistilled) {
        const icon = getPruneItemIcon(item.type)
        const summary = truncateWithQuotes(item.summary, maxContentLength)
        const countSuffix = count > 1 ? ` (x${count})` : ""
        parts.push(`${icon} ${summary}${countSuffix}`)
    }

    if (parts.length === 0) {
        return ""
    }

    // Join with ₊ separator (matching summary style)
    return parts.join(" ₊ ")
}
