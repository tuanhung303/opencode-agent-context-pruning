/**
 * ACP Protected command handler.
 * Shows protected tools and file patterns.
 */

import type { Logger } from "../logger"
import type { SessionState, WithParts } from "../state"
import { sendIgnoredMessage } from "../ui/notification"
import { getCurrentParams } from "../strategies/utils"
import type { PluginConfig } from "../config"

export interface ProtectedCommandContext {
    client: any
    state: SessionState
    logger: Logger
    sessionId: string
    messages: WithParts[]
    config: PluginConfig
}

function formatProtectedMessage(config: PluginConfig): string {
    const lines: string[] = []

    lines.push("╭───────────────────────────────────────────────────────────╮")
    lines.push("│                   Protected from Pruning                  │")
    lines.push("╰───────────────────────────────────────────────────────────╯")
    lines.push("")

    // Protected tools
    lines.push("📋 Protected Tools:")
    lines.push("   These tools cannot be discarded:")
    const protectedTools = config.tools.settings.protectedTools
    for (const tool of protectedTools) {
        lines.push(`   • ${tool}`)
    }
    lines.push("")

    // Protected file patterns
    lines.push("📁 Protected File Patterns:")
    if (config.protectedFilePatterns.length === 0) {
        lines.push("   No file patterns are protected.")
    } else {
        lines.push("   Files matching these patterns cannot be discarded:")
        for (const pattern of config.protectedFilePatterns) {
            lines.push(`   • ${pattern}`)
        }
    }
    lines.push("")

    // Strategy-specific protected tools
    lines.push("🔧 Strategy-Specific Protection:")
    lines.push(
        `   Deduplication: ${config.strategies.deduplication.protectedTools.join(", ") || "none"}`,
    )
    lines.push(
        `   Purge Errors: ${config.strategies.purgeErrors.protectedTools.join(", ") || "none"}`,
    )
    lines.push("")

    lines.push("💡 To modify protection, update your ACP config:")
    lines.push("   ~/.config/opencode/acp.jsonc")
    lines.push("")

    return lines.join("\n")
}

export async function handleProtectedCommand(ctx: ProtectedCommandContext): Promise<void> {
    const { client, state, logger, sessionId, messages, config } = ctx

    const message = formatProtectedMessage(config)

    const params = getCurrentParams(state, messages, logger)
    await sendIgnoredMessage(client, sessionId, message, params, logger)

    logger.info("Protected command executed")
}
