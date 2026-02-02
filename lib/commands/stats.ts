/**
 * ACP Stats command handler.
 * Shows pruning statistics for the current session and all-time totals.
 */

import type { Logger } from "../logger"
import type { SessionState, WithParts } from "../state"
import { sendIgnoredMessage } from "../ui/notification"
import { formatTokenCount } from "../ui/utils"
import { loadAllSessionStats, type AggregatedStats } from "../state/persistence"
import { getCurrentParams } from "../strategies/utils"

export interface StatsCommandContext {
    client: any
    state: SessionState
    logger: Logger
    sessionId: string
    messages: WithParts[]
}

function formatStatsMessage(
    sessionTokens: number,
    sessionTools: number,
    allTime: AggregatedStats,
    strategyStats: SessionState["stats"]["strategyStats"],
): string {
    const lines: string[] = []

    lines.push("╭───────────────────────────────────────────────────────────╮")
    lines.push("│                    ACP Statistics                         │")
    lines.push("╰───────────────────────────────────────────────────────────╯")
    lines.push("")
    lines.push("Session:")
    lines.push("─".repeat(60))
    lines.push(`  Tokens pruned: ~${formatTokenCount(sessionTokens)}`)
    lines.push(`  Tools pruned:   ${sessionTools}`)
    lines.push("")

    // Strategy effectiveness
    lines.push("Strategy Effectiveness:")
    lines.push("─".repeat(60))
    const strategies = [
        { name: "Deduplication", data: strategyStats.deduplication },
        { name: "Supersede Writes", data: strategyStats.supersedeWrites },
        { name: "Purge Errors", data: strategyStats.purgeErrors },
        { name: "Manual Discard", data: strategyStats.manualDiscard },
        { name: "Distillation", data: strategyStats.distillation },
        { name: "Truncation", data: strategyStats.truncation },
        { name: "Thinking Compress", data: strategyStats.thinkingCompression },
    ]

    // Sort by token savings (descending)
    strategies.sort((a, b) => b.data.tokens - a.data.tokens)

    for (const strat of strategies) {
        if (strat.data.count > 0) {
            const avgTokens = Math.round(strat.data.tokens / strat.data.count)
            const star = strat === strategies[0] && strat.data.tokens > 0 ? " ⭐" : ""
            lines.push(
                `  ${strat.name.padEnd(18)} ${strat.data.count.toString().padStart(3)} prunes, ~${formatTokenCount(strat.data.tokens)} saved${star}`,
            )
        }
    }
    lines.push("")

    lines.push("All-time:")
    lines.push("─".repeat(60))
    lines.push(`  Tokens saved:  ~${formatTokenCount(allTime.totalTokens)}`)
    lines.push(`  Tools pruned:   ${allTime.totalTools}`)
    lines.push(`  Sessions:       ${allTime.sessionCount}`)

    return lines.join("\n")
}

export async function handleStatsCommand(ctx: StatsCommandContext): Promise<void> {
    const { client, state, logger, sessionId, messages } = ctx

    // Session stats from in-memory state
    const sessionTokens = state.stats.totalPruneTokens
    const sessionTools = state.prune.toolIds.length

    // All-time stats from storage files
    const allTime = await loadAllSessionStats(logger)

    const message = formatStatsMessage(
        sessionTokens,
        sessionTools,
        allTime,
        state.stats.strategyStats,
    )

    const params = getCurrentParams(state, messages, logger)
    await sendIgnoredMessage(client, sessionId, message, params, logger)

    logger.info("Stats command executed", {
        sessionTokens,
        sessionTools,
        allTimeTokens: allTime.totalTokens,
        allTimeTools: allTime.totalTools,
    })
}
