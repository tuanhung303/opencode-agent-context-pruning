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

    // Calculate auto-supersede totals
    const autoSupersede = strategyStats.autoSupersede
    const autoSupersedeTotal = {
        count: autoSupersede.hash.count + autoSupersede.file.count + autoSupersede.todo.count,
        tokens: autoSupersede.hash.tokens + autoSupersede.file.tokens + autoSupersede.todo.tokens,
    }

    const strategies = [
        { name: "Auto-Supersede", data: autoSupersedeTotal, isAutoSupersede: true },
        { name: "Purge Errors", data: strategyStats.purgeErrors, isAutoSupersede: false },
        { name: "Manual Discard", data: strategyStats.manualDiscard, isAutoSupersede: false },
        { name: "Distillation", data: strategyStats.distillation, isAutoSupersede: false },
        { name: "Truncation", data: strategyStats.truncation, isAutoSupersede: false },
        {
            name: "Thinking Compress",
            data: strategyStats.thinkingCompression,
            isAutoSupersede: false,
        },
    ]

    // Sort by token savings (descending)
    strategies.sort((a, b) => b.data.tokens - a.data.tokens)

    for (const strat of strategies) {
        if (strat.data.count > 0) {
            const star = strat === strategies[0] && strat.data.tokens > 0 ? " ⭐" : ""
            lines.push(
                `  ${strat.name.padEnd(18)} ${strat.data.count.toString().padStart(3)} prunes, ~${formatTokenCount(strat.data.tokens)} saved${star}`,
            )

            // Show sub-breakdown for Auto-Supersede
            if (strat.isAutoSupersede) {
                if (autoSupersede.hash.count > 0) {
                    lines.push(
                        `    🔄 hash          ${autoSupersede.hash.count.toString().padStart(3)} prunes, ~${formatTokenCount(autoSupersede.hash.tokens)}`,
                    )
                }
                if (autoSupersede.file.count > 0) {
                    lines.push(
                        `    📁 file          ${autoSupersede.file.count.toString().padStart(3)} prunes, ~${formatTokenCount(autoSupersede.file.tokens)}`,
                    )
                }
                if (autoSupersede.todo.count > 0) {
                    lines.push(
                        `    ✅ todo          ${autoSupersede.todo.count.toString().padStart(3)} prunes, ~${formatTokenCount(autoSupersede.todo.tokens)}`,
                    )
                }
            }
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
