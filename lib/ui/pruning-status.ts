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
