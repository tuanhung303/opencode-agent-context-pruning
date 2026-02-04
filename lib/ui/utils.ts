import { ToolParameterEntry, SessionState } from "../state"
import { extractParameterKey } from "../messages/utils"
import { countTokens } from "../strategies/utils"
import { formatTokenCount, truncate, shortenPath } from "../utils/string"

// Re-export for backwards compatibility
export { formatTokenCount, truncate, shortenPath }

// Category emojis for prune notifications
export const PRUNE_CATEGORY_ICONS = {
    message: "💬",
    thinking: "🧠",
    tool: "⚙️",
    distill: "✨",
} as const

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

export function formatStatsHeader(strategyStats: SessionState["stats"]["strategyStats"]): string {
    // Build the categorized status format:
    // 「 💬 2(1.2K) ▼ + 🧠 1(3.5K) ▼ + 🔧 5(8.1K) ▼ + ✨ 3(500) 」
    const parts: string[] = []

    const { manualDiscard, autoSupersede, distillation } = strategyStats

    // 💬 Message discard (with ▼)
    if (manualDiscard.message.count > 0) {
        parts.push(
            `${PRUNE_CATEGORY_ICONS.message} ${manualDiscard.message.count}(${formatTokenCount(manualDiscard.message.tokens)}) ▼`,
        )
    }

    // 🧠 Thinking discard (with ▼)
    if (manualDiscard.thinking.count > 0) {
        parts.push(
            `${PRUNE_CATEGORY_ICONS.thinking} ${manualDiscard.thinking.count}(${formatTokenCount(manualDiscard.thinking.tokens)}) ▼`,
        )
    }

    // 🔧 Tool discard = manual tool + all auto-supersede (with ▼)
    const toolCount =
        manualDiscard.tool.count +
        autoSupersede.hash.count +
        autoSupersede.file.count +
        autoSupersede.todo.count +
        autoSupersede.context.count
    const toolTokens =
        manualDiscard.tool.tokens +
        autoSupersede.hash.tokens +
        autoSupersede.file.tokens +
        autoSupersede.todo.tokens +
        autoSupersede.context.tokens

    if (toolCount > 0) {
        parts.push(`${PRUNE_CATEGORY_ICONS.tool} ${toolCount}(${formatTokenCount(toolTokens)}) ▼`)
    }

    // ✨ Distillation (no ▼ - transformation, not removal)
    if (distillation.count > 0) {
        parts.push(
            `${PRUNE_CATEGORY_ICONS.distill} ${distillation.count}(${formatTokenCount(distillation.tokens)})`,
        )
    }

    if (parts.length === 0) {
        return "「 acp 」"
    }

    // Join with + separator
    return `「 ${parts.join(" + ")} 」`
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
