/**
 * ACP Budget command handler.
 * Shows context budget, usage, and recommendations.
 */

import type { Logger } from "../logger"
import type { SessionState, WithParts } from "../state"
import { sendIgnoredMessage } from "../ui/notification"
import { formatTokenCount } from "../ui/utils"
import { getCurrentParams } from "../strategies/utils"

export interface BudgetCommandContext {
    client: any
    state: SessionState
    logger: Logger
    sessionId: string
    messages: WithParts[]
}

// Estimate tokens from message content (rough approximation)
function estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4)
}

function calculateContextStats(messages: WithParts[]): {
    totalTokens: number
    systemTokens: number
    userTokens: number
    assistantTokens: number
    toolTokens: number
    toolCount: number
} {
    let systemTokens = 0
    let userTokens = 0
    let assistantTokens = 0
    let toolTokens = 0
    let toolCount = 0

    for (const msg of messages) {
        const role = msg.info.role
        const parts = msg.parts || []

        for (const part of parts) {
            let text = ""
            if (part.type === "text" && "text" in part && part.text) {
                text = part.text
            } else if (
                part.type === "tool" &&
                "state" in part &&
                part.state &&
                "output" in part.state &&
                part.state.output
            ) {
                text = part.state.output as string
                toolCount++
                toolTokens += estimateTokens(text)
                continue
            }

            const tokens = estimateTokens(text)
            if (role === "user") {
                userTokens += tokens
            } else if (role === "assistant") {
                assistantTokens += tokens
            }
        }
    }

    return {
        totalTokens: systemTokens + userTokens + assistantTokens + toolTokens,
        systemTokens,
        userTokens,
        assistantTokens,
        toolTokens,
        toolCount,
    }
}

function getBatchRecommendation(toolCount: number): string {
    if (toolCount < 20) {
        return "Discard individually as needed"
    } else if (toolCount < 50) {
        return "Batch 5-10 tools at a time"
    } else {
        return "Batch 10-20 tools at a time"
    }
}

function getPruningRecommendation(stats: ReturnType<typeof calculateContextStats>): string {
    const toolRatio = stats.toolCount > 0 ? stats.toolTokens / stats.totalTokens : 0

    if (toolRatio > 0.6) {
        return "⚠️ Tools dominate context. Consider pruning 10+ tools."
    } else if (stats.totalTokens > 10000) {
        return "💡 Large context. Prune completed tasks to improve performance."
    } else if (stats.toolCount > 30) {
        return "💡 Many tools in context. Review for pruning candidates."
    }
    return "✅ Context size is healthy."
}

function formatBudgetMessage(state: SessionState, messages: WithParts[]): string {
    const lines: string[] = []
    const stats = calculateContextStats(messages)

    lines.push("╭───────────────────────────────────────────────────────────╮")
    lines.push("│                    Context Budget                         │")
    lines.push("╰───────────────────────────────────────────────────────────╯")
    lines.push("")

    // Current usage breakdown
    lines.push("📊 Current Usage:")
    lines.push(`   Total:     ${formatTokenCount(stats.totalTokens)} tokens`)
    lines.push(`   System:    ${formatTokenCount(stats.systemTokens)} tokens`)
    lines.push(`   User:      ${formatTokenCount(stats.userTokens)} tokens`)
    lines.push(`   Assistant: ${formatTokenCount(stats.assistantTokens)} tokens`)
    lines.push(
        `   Tools:     ${formatTokenCount(stats.toolTokens)} tokens (${stats.toolCount} tools)`,
    )
    lines.push("")

    // Pruning history
    lines.push("✂️  Pruning History:")
    lines.push(`   Total tokens saved: ${formatTokenCount(state.stats.totalPruneTokens)}`)
    lines.push(`   Total tools pruned: ${state.stats.totalPruneMessages}`)
    lines.push(`   Recent discards: ${state.discardHistory.length}`)
    lines.push("")

    // Recommendations
    lines.push("💡 Recommendations:")
    lines.push(`   ${getPruningRecommendation(stats)}`)
    lines.push(`   Batch size guide: ${getBatchRecommendation(stats.toolCount)}`)
    lines.push("")

    // Quick actions
    lines.push("⚡ Quick Actions:")
    lines.push("   • Run '/acp sweep' to prune since last message")
    lines.push("   • Run '/acp context' for detailed breakdown")
    lines.push("   • Use discard({hashes: [...], reason: 'completion'})")
    lines.push("")

    return lines.join("\n")
}

export async function handleBudgetCommand(ctx: BudgetCommandContext): Promise<void> {
    const { client, state, logger, sessionId, messages } = ctx

    const message = formatBudgetMessage(state, messages)

    const params = getCurrentParams(state, messages, logger)
    await sendIgnoredMessage(client, sessionId, message, params, logger)

    logger.info("Budget command executed")
}
