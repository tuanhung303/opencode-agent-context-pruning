/**
 * Type-safe string utilities.
 * Consolidates truncation and formatting logic.
 */

/**
 * Truncates a string to maxLen characters, adding ellipsis if truncated.
 */
export function truncate(str: string, maxLen: number = 60): string {
    if (str.length <= maxLen) return str
    return str.slice(0, maxLen - 3) + "..."
}

/**
 * Formats a token count for display (e.g., 1500 -> "1.5K").
 */
export function formatTokenCount(tokens: number): string {
    if (tokens >= 1000) {
        return `${(tokens / 1000).toFixed(1)}K`.replace(".0K", "K")
    }
    return tokens.toString()
}

/**
 * Shortens a file path by removing the working directory prefix.
 */
export function shortenPath(input: string, workingDirectory?: string): string {
    const inPathMatch = input.match(/^(.+) in (.+)$/)
    if (inPathMatch?.[1] && inPathMatch[2]) {
        const prefix = inPathMatch[1]
        const pathPart = inPathMatch[2]
        const shortenedPath = shortenSinglePath(pathPart, workingDirectory)
        return `${prefix} in ${shortenedPath}`
    }

    return shortenSinglePath(input, workingDirectory)
}

function shortenSinglePath(path: string, workingDirectory?: string): string {
    if (workingDirectory) {
        if (path.startsWith(workingDirectory + "/")) {
            return path.slice(workingDirectory.length + 1)
        }
        if (path === workingDirectory) {
            return "."
        }
    }
    return path
}

/**
 * Extracts the first character of a string, defaulting to 'x'.
 * Useful for generating prefixes.
 */
export function firstChar(str: string, defaultChar: string = "x"): string {
    return str.length > 0 ? str[0]!.toLowerCase() : defaultChar
}
