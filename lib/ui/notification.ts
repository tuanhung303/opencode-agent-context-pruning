import type { Logger } from "../logger"
import type { SessionState, ToolParameterEntry } from "../state"
import {
    formatDistilled,
    formatPrunedItemsList,
    formatStatsHeader,
    formatTokenCount,
} from "./utils"
import { formatNoOpNotification } from "./minimal-notifications"
import { PluginConfig } from "../config"

export type PruneReason =
    | "completion"
    | "noise"
    | "superseded"
    | "exploration"
    | "duplicate"
    | "distillation"
    | "manual"

export const PRUNE_REASON_LABELS: Record<PruneReason, string> = {
    completion: "Task Complete",
    noise: "Noise Removal",
    superseded: "Superseded",
    exploration: "Dead-end Exploration",
    duplicate: "Duplicate Content",
    distillation: "Distillation",
    manual: "Manual Prune",
}

export interface NotificationContext {
    state: SessionState
    reason?: PruneReason
    pruneToolIds: string[]
    toolMetadata: Map<string, ToolParameterEntry>
    workingDirectory: string
    distillation?: string[]
    pruneMessagePartIds?: string[]
    pruneReasoningPartIds?: string[]
    attemptedTargets?: string[]
    options?: {
        simplified?: boolean
    }
}

function buildMinimalMessage(
    state: SessionState,
    distillation: string[] | undefined,
    showDistillation: boolean,
    attemptedTargets?: string[],
    reason?: PruneReason,
): string {
    const statsMessage = formatStatsHeader(state.stats.strategyStats)

    // Build the action notification with attempted targets
    if (attemptedTargets && attemptedTargets.length > 0) {
        const isDistill = reason === "distillation"
        const actionMessage = formatNoOpNotification(
            isDistill ? "distill" : "discard",
            attemptedTargets,
        )
        // Extract just the details part after the box
        const details = actionMessage.replace(/^「 .*? 」- /, "").trim()
        return `${statsMessage}- ${details}`
    }

    return statsMessage + formatDistilled(showDistillation ? distillation : undefined)
}

function buildDetailedMessage(ctx: NotificationContext, showDistillation: boolean): string {
    const {
        state,
        reason,
        pruneToolIds,
        toolMetadata,
        workingDirectory,
        distillation,
        pruneMessagePartIds = [],
        pruneReasoningPartIds = [],
        options,
    } = ctx
    const simplified = options?.simplified ?? false

    let message = formatStatsHeader(state.stats.strategyStats)

    // Only show pruning details if there are tokens being pruned or distilled
    const hasPruningActivity =
        state.stats.pruneTokenCounter > 0 || (distillation && distillation.length > 0)

    if (
        hasPruningActivity &&
        (pruneToolIds.length > 0 ||
            pruneMessagePartIds.length > 0 ||
            pruneReasoningPartIds.length > 0)
    ) {
        const pruneTokenCounterStr = `▼ ${formatTokenCount(state.stats.pruneTokenCounter)}`
        const reasonLabel = reason ? ` — ${PRUNE_REASON_LABELS[reason]}` : ""
        message += `\n\n▣ Pruning (${pruneTokenCounterStr})${reasonLabel}`

        if (pruneToolIds.length > 0) {
            const itemLines = formatPrunedItemsList(
                pruneToolIds,
                toolMetadata,
                workingDirectory,
                simplified,
            )
            message += "\n" + itemLines.join("\n")
        }

        if (pruneMessagePartIds.length > 0) {
            message += `\n  - ${pruneMessagePartIds.length} assistant message part(s)`
        }

        if (pruneReasoningPartIds.length > 0) {
            message += `\n  - ${pruneReasoningPartIds.length} thinking block(s)`
        }
    }

    return (message + formatDistilled(showDistillation ? distillation : undefined)).trim()
}

export async function sendUnifiedNotification(
    client: any,
    logger: Logger,
    config: PluginConfig,
    ctx: NotificationContext,
    sessionId: string,
    params: any,
): Promise<boolean> {
    const {
        pruneToolIds,
        pruneMessagePartIds = [],
        pruneReasoningPartIds = [],
        state,
        reason,
        distillation,
    } = ctx

    const hasPruned =
        pruneToolIds.length > 0 ||
        pruneMessagePartIds.length > 0 ||
        pruneReasoningPartIds.length > 0

    if (config.pruneNotification === "off") {
        return false
    }

    const showDistillation = config.tools.distill.showDistillation

    const message =
        config.pruneNotification === "minimal"
            ? buildMinimalMessage(
                  state,
                  distillation,
                  showDistillation,
                  ctx.attemptedTargets,
                  reason,
              )
            : buildDetailedMessage(ctx, showDistillation)

    await sendIgnoredMessage(client, sessionId, message, params, logger)
    return true
}

/**
 * Send notification for attempted pruning (no-op cases)
 * Always shows notification even when nothing was actually pruned
 */
export async function sendAttemptedNotification(
    client: any,
    logger: Logger,
    config: PluginConfig,
    type: "discard" | "distill",
    attemptedTargets: string[],
    sessionId: string,
    params: any,
): Promise<boolean> {
    if (config.pruneNotification === "off") {
        return false
    }

    const message = formatNoOpNotification(type, attemptedTargets)
    await sendIgnoredMessage(client, sessionId, message, params, logger)
    return true
}

export async function sendIgnoredMessage(
    client: any,
    sessionID: string,
    text: string,
    params: any,
    logger: Logger,
): Promise<void> {
    const agent = params.agent || undefined
    const variant = params.variant || undefined
    const model =
        params.providerId && params.modelId
            ? {
                  providerID: params.providerId,
                  modelID: params.modelId,
              }
            : undefined

    try {
        await client.session.prompt({
            path: {
                id: sessionID,
            },
            body: {
                noReply: true,
                agent: agent,
                model: model,
                variant: variant,
                parts: [
                    {
                        type: "text",
                        text: text,
                        ignored: true,
                    },
                ],
            },
        })
    } catch (error: any) {
        logger.error("Failed to send notification", { error: error.message })
    }
}
