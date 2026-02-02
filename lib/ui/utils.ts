import { ToolParameterEntry } from "../state"
import { extractParameterKey } from "../messages/utils"
import { countTokens } from "../strategies/utils"
import { formatTokenCount, truncate, shortenPath } from "../utils/string"

// Re-export for backwards compatibility
export { formatTokenCount, truncate, shortenPath }

export function countDistillationTokens(distillation?: string[]): number {
    if (!distillation || distillation.length === 0) return 0
    return countTokens(distillation.join("\n"))
}

export function formatDistilled(distillation?: string[]): string {
    if (!distillation || distillation.length === 0) {
        return ""
    }
    return ""
}

export function formatStatsHeader(
    totalTokensSaved: number,
    pruneTokenCounter: number,
    totalMessagesPruned: number,
    messagesPruned: number,
    distilledCount?: number,
): string {
    const totalMessages = totalMessagesPruned + messagesPruned
    const totalTokens = totalTokensSaved + pruneTokenCounter

    // Build the beautiful status format: 「 ▼ 7.8K 🌑 ₊ ▼ 3 🌊 ₊ 2 ✨ 」
    const parts: string[] = []

    // Tokens saved (▼ indicates reduction)
    if (totalTokens > 0) {
        parts.push(`▼ ${formatTokenCount(totalTokens)} 🌑`)
    }

    // Messages pruned (▼ indicates reduction)
    if (totalMessages > 0) {
        parts.push(`▼ ${totalMessages} 🌊`)
    }

    // Distilled count (✨ no ▼ since it's transformation, not pure removal)
    if (distilledCount && distilledCount > 0) {
        parts.push(`✨ ${distilledCount}`)
    }

    if (parts.length === 0) {
        return "「 acp 」"
    }

    // Join with ₊ separator between items (not at the start)
    return `「 ${parts.join(" ₊ ")} 」`
}

export function formatPrunedItemsList(
    pruneToolIds: string[],
    toolMetadata: Map<string, ToolParameterEntry>,
    workingDirectory?: string,
    simplified: boolean = false,
): string[] {
    const lines: string[] = []

    for (const id of pruneToolIds) {
        const metadata = toolMetadata.get(id)

        if (metadata) {
            const paramKey = extractParameterKey(metadata.tool, metadata.parameters)
            if (paramKey) {
                // Use 60 char limit to match notification style
                const displayKey = truncate(shortenPath(paramKey, workingDirectory), 60)
                if (simplified) {
                    lines.push(displayKey)
                } else {
                    lines.push(`→ ${metadata.tool}: ${displayKey}`)
                }
            } else {
                if (simplified) {
                    lines.push(metadata.tool)
                } else {
                    lines.push(`→ ${metadata.tool}`)
                }
            }
        }
    }

    const knownCount = pruneToolIds.filter((id) => toolMetadata.has(id)).length
    const unknownCount = pruneToolIds.length - knownCount

    if (unknownCount > 0) {
        if (simplified) {
            lines.push(`(${unknownCount} tool${unknownCount > 1 ? "s" : ""} with unknown metadata)`)
        } else {
            lines.push(
                `→ (${unknownCount} tool${unknownCount > 1 ? "s" : ""} with unknown metadata)`,
            )
        }
    }

    return lines
}

export function formatPruningResultForTool(
    prunedIds: string[],
    toolMetadata: Map<string, ToolParameterEntry>,
    workingDirectory?: string,
    simplified: boolean = false,
    messagePartCount: number = 0,
): string {
    const lines: string[] = []
    const totalCount = prunedIds.length + messagePartCount

    // Build summary message
    const parts: string[] = []
    if (prunedIds.length > 0) {
        parts.push(`${prunedIds.length} tool output${prunedIds.length !== 1 ? "s" : ""}`)
    }
    if (messagePartCount > 0) {
        parts.push(`${messagePartCount} assistant message${messagePartCount !== 1 ? "s" : ""}`)
    }

    if (totalCount === 0) {
        lines.push("Context pruning complete. Nothing to prune.")
    } else {
        lines.push(`Context pruning complete. Pruned ${parts.join(" and ")}.`)
    }
    lines.push("")

    if (prunedIds.length > 0) {
        lines.push(`Semantically pruned (${prunedIds.length}):`)
        lines.push(...formatPrunedItemsList(prunedIds, toolMetadata, workingDirectory, simplified))
    }

    return lines.join("\n").trim()
}
