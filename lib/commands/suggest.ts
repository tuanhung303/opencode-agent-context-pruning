/**
 * ACP Suggest command handler.
 * Shows ranked pruning candidates with token estimates.
 */

import type { Logger } from "../logger"
import type { SessionState, WithParts } from "../state"
import type { PluginConfig } from "../config"
import { sendIgnoredMessage } from "../ui/notification"
import { getCurrentParams, rankPruningCandidates } from "../strategies/utils"

export interface SuggestCommandContext {
    client: any
    state: SessionState
    logger: Logger
    config: PluginConfig
    sessionId: string
    messages: WithParts[]
    args: string[]
}

/**
 * Format token count for display (e.g., 1234 -> "1.2K", 12345 -> "12.3K")
 */
function formatTokens(tokens: number): string {
    if (tokens < 1000) return String(tokens)
    return `${(tokens / 1000).toFixed(1)}K`
}

/**
 * Parse command arguments for --top and --min-tokens flags.
 */
function parseArgs(args: string[]): { top: number; minTokens: number } {
    let top = 5
    let minTokens = 100

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        const nextArg = args[i + 1]
        if (arg === "--top" && nextArg) {
            const val = parseInt(nextArg, 10)
            if (!isNaN(val) && val > 0) {
                top = val
            }
            i++
        } else if (arg === "--min-tokens" && nextArg) {
            const val = parseInt(nextArg, 10)
            if (!isNaN(val) && val >= 0) {
                minTokens = val
            }
            i++
        }
    }

    return { top, minTokens }
}

function formatSuggestMessage(
    state: SessionState,
    messages: WithParts[],
    config: PluginConfig,
    options: { top: number; minTokens: number },
): string {
    const lines: string[] = []
    const protectedTools = config.tools.settings.protectedTools

    // Get ranked candidates
    const candidates = rankPruningCandidates(state, messages, protectedTools, options.top)

    lines.push("╭───────────────────────────────────────────────────────────╮")
    lines.push("│                  Pruning Suggestions                      │")
    lines.push("╰───────────────────────────────────────────────────────────╯")
    lines.push("")

    if (candidates.length === 0) {
        lines.push("✅ No pruning candidates found.")
        lines.push("")
        lines.push("   All tool outputs are either:")
        lines.push("   • Below minimum token threshold")
        lines.push("   • Protected tools")
        lines.push("   • Already pruned")
        lines.push("")
        return lines.join("\n")
    }

    // Calculate total potential savings
    const totalSavings = candidates.reduce((sum, c) => sum + c.estimatedTokens, 0)

    lines.push(
        `📊 Top ${candidates.length} Pruning Candidates (potential savings: ~${formatTokens(totalSavings)} tokens)`,
    )
    lines.push("")

    // List candidates
    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i]
        if (!c) continue
        const target = c.target ? `(${c.target})` : ""
        const rank = String(i + 1).padStart(2, " ")
        lines.push(`   ${rank}. ${c.toolName}${target}`)
        lines.push(`       Hash: ${c.hash}  |  ~${formatTokens(c.estimatedTokens)} tokens`)
    }
    lines.push("")

    // Usage hint
    lines.push("💡 To prune these, use:")
    const hashList = candidates
        .slice(0, 3)
        .map((c) => `["${c.hash}"]`)
        .join(", ")
    lines.push(`   context({ action: "discard", targets: [${hashList}] })`)
    lines.push("")

    // Batch suggestion
    if (candidates.length >= 3) {
        const allHashes = candidates.map((c) => `["${c.hash}"]`).join(", ")
        lines.push("⚡ Prune all at once:")
        lines.push(`   context({ action: "discard", targets: [${allHashes}] })`)
        lines.push("")
    }

    return lines.join("\n")
}

export async function handleSuggestCommand(ctx: SuggestCommandContext): Promise<void> {
    const { client, state, logger, config, sessionId, messages, args } = ctx

    const options = parseArgs(args)
    const message = formatSuggestMessage(state, messages, config, options)

    const params = getCurrentParams(state, messages, logger)
    await sendIgnoredMessage(client, sessionId, message, params, logger)

    logger.info(`Suggest command executed (top=${options.top}, minTokens=${options.minTokens})`)
}
