/**
 * ACP Help command handler.
 * Shows available ACP commands and their descriptions.
 */

import type { Logger } from "../logger"
import type { SessionState, WithParts } from "../state"
import { sendIgnoredMessage } from "../ui/notification"
import { getCurrentParams } from "../strategies/utils"

export interface HelpCommandContext {
    client: any
    state: SessionState
    logger: Logger
    sessionId: string
    messages: WithParts[]
}

function formatHelpMessage(): string {
    const lines: string[] = []

    lines.push("╭───────────────────────────────────────────────────────────╮")
    lines.push("│                      ACP Commands                         │")
    lines.push("╰───────────────────────────────────────────────────────────╯")
    lines.push("")
    lines.push("  /acp context      Show token usage breakdown for current session")
    lines.push("  /acp stats        Show ACP pruning statistics")
    lines.push("  /acp sweep [n]    Prune tools since last user message, or last n tools")
    lines.push("  /acp protected    Show protected tools and file patterns")
    lines.push("  /acp budget       Show context budget and recommendations")
    lines.push("  /acp suggest      Show ranked pruning candidates with token estimates")
    lines.push("")

    return lines.join("\n")
}

export async function handleHelpCommand(ctx: HelpCommandContext): Promise<void> {
    const { client, state, logger, sessionId, messages } = ctx

    const message = formatHelpMessage()

    const params = getCurrentParams(state, messages, logger)
    await sendIgnoredMessage(client, sessionId, message, params, logger)

    logger.info("Help command executed")
}
