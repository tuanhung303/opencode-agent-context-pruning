export type PruneReason =
    | "noise"
    | "completion"
    | "superseded"
    | "exploration"
    | "duplicate"
    | "distillation"
    | "manual"

export interface PruneOperation {
    hash: string
    reason: PruneReason
    tokens?: number
}

export interface MinimalNotification {
    type: "build" | "test" | "npm" | "protected" | "distill" | "discard" | "restore"
    status: "success" | "error" | "warning"
    message: string
    count?: number
    details?: string
}

const TYPE_ICONS: Record<MinimalNotification["type"], string> = {
    build: "🔨",
    test: "🧪",
    npm: "📦",
    protected: "⚠️",
    distill: "✨",
    discard: "🗑️",
    restore: "↩️",
}

const STATUS_ICONS: Record<MinimalNotification["status"], string> = {
    success: "✓",
    error: "✗",
    warning: "⚠",
}

/**
 * Format a minimal one-line notification
 * 「 Build ✓ 47 files 」
 * 「 Tests ✗ 3 failed 」
 * 「 npm ✓ published v2.7.2 」
 */
export function formatMinimalNotification(n: MinimalNotification): string {
    const icon = TYPE_ICONS[n.type]
    const status = STATUS_ICONS[n.status]
    const count = n.count !== undefined ? ` ${n.count}` : ""
    return `「 ${icon} ${n.type} ${status}${count}${n.message ? " " + n.message : ""} 」`
}

/**
 * Format build output summary
 * Input: tsc output with 47 lines
 * Output: 「 Build ✓ 47 files 」
 */
export function formatBuildOutput(output: string): string {
    const lines = output.split("\n").filter((l) => l.trim())
    const fileCount = lines.filter((l) => l.includes(".ts") || l.includes(".js")).length
    const hasError = output.toLowerCase().includes("error")

    return formatMinimalNotification({
        type: "build",
        status: hasError ? "error" : "success",
        message: hasError ? "failed" : `${fileCount} files`,
        count: hasError ? undefined : fileCount,
    })
}

/**
 * Format test output summary
 * Input: vitest JSON or text output
 * Output: 「 Tests ✓ 74 passed 」 or 「 Tests ✗ 3 failed 」
 */
export function formatTestOutput(output: string): string {
    // Try to parse vitest JSON output
    try {
        const json = JSON.parse(output)
        const passed = json.numPassedTests || 0
        const failed = json.numFailedTests || 0

        if (failed > 0) {
            return formatMinimalNotification({
                type: "test",
                status: "error",
                message: `${failed} failed`,
                count: failed,
                details: output,
            })
        }

        return formatMinimalNotification({
            type: "test",
            status: "success",
            message: `${passed} passed`,
            count: passed,
        })
    } catch {
        // Fall back to text parsing
        const passedMatch = output.match(/(\d+)\s+passed/i)
        const failedMatch = output.match(/(\d+)\s+failed/i)
        const passed = passedMatch ? parseInt(passedMatch[1]!, 10) : 0
        const failed = failedMatch ? parseInt(failedMatch[1]!, 10) : 0

        if (failed > 0) {
            return formatMinimalNotification({
                type: "test",
                status: "error",
                message: `${failed} failed`,
                count: failed,
                details: output,
            })
        }

        return formatMinimalNotification({
            type: "test",
            status: "success",
            message: `${passed} passed`,
            count: passed,
        })
    }
}

/**
 * Format grep results with truncation indicator
 * Input: 100 matches
 * Output: First N matches + "+X more"
 */
export function formatGrepResults(
    matches: Array<{ file: string; line: number; content: string }>,
    limit = 10,
): string {
    if (matches.length === 0) {
        return formatMinimalNotification({
            type: "test", // Using test icon for search
            status: "success",
            message: "0 matches",
        })
    }

    const shown = matches.slice(0, limit)
    const remaining = matches.length - limit

    let result = shown.map((m) => `${m.file}:${m.line}: ${m.content}`).join("\n")

    if (remaining > 0) {
        result += `\n「 +${remaining} more matches 」`
    }

    return result
}

/**
 * Format protected file error
 * Input: Full 6-line error with pattern list
 * Output: 「 ⚠️ protected: package.json 」
 */
export function formatProtectedError(filePath: string): string {
    return formatMinimalNotification({
        type: "protected",
        status: "warning",
        message: filePath,
    })
}

/**
 * Format npm publish output
 * Input: Full npm error stack
 * Output: 「 npm ✗ version conflict 」 or 「 npm ✓ published v2.7.2 」
 */
export function formatNpmOutput(output: string, version?: string): string {
    const isError =
        output.toLowerCase().includes("error") ||
        output.toLowerCase().includes("err!") ||
        output.toLowerCase().includes("e403")

    if (isError) {
        // Extract error type
        let errorType = "failed"
        if (output.includes("E403")) errorType = "version conflict"
        if (output.includes("ENEEDAUTH")) errorType = "auth required"
        if (output.includes("ENOTFOUND")) errorType = "network error"

        return formatMinimalNotification({
            type: "npm",
            status: "error",
            message: errorType,
            details: output,
        })
    }

    return formatMinimalNotification({
        type: "npm",
        status: "success",
        message: version ? `published v${version}` : "published",
    })
}

/**
 * Format distill notification
 * 「 💧 distill ✓ 3 items 」
 */
export function formatDistillNotification(operations: PruneOperation[]): string {
    return formatMinimalNotification({
        type: "distill",
        status: "success",
        message: "items",
        count: operations.length,
    })
}

/**
 * Format discard notification
 * 「 🗑️ discard ✓ 7 items 」
 */
export function formatDiscardNotification(count: number, reason: PruneReason): string {
    return formatMinimalNotification({
        type: "discard",
        status: "success",
        message: reason,
        count,
    })
}

/**
 * Format restore notification
 * 「 ↩️ restore ✓ 3 items 」
 */
export function formatRestoreNotification(count: number): string {
    return formatMinimalNotification({
        type: "restore",
        status: "success",
        message: "items",
        count,
    })
}

/**
 * Unified stats header format
 * 「 ▼ 7.8K 🌑 ₊ ▼ 9 🌊 ₊ ✨ 7 」
 */
export function formatUnifiedStats(params: {
    tokensRemoved: number
    messagesRemoved: number
    distillCount: number
}): string {
    const tokensK = (params.tokensRemoved / 1000).toFixed(1)
    return `「 ▼ ${tokensK}K 🌑 ₊ ▼ ${params.messagesRemoved} 🌊 ₊ ✨ ${params.distillCount} 」`
}
