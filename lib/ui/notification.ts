import type { Logger } from "../logger"
import type { SessionState } from "../state"
import {
    formatDistilled,
    formatPrunedItemsList,
    formatStatsHeader,
    formatTokenCount,
} from "./utils"
import { ToolParameterEntry } from "../state"
import { PluginConfig } from "../config"
import {
    formatDiscardNotification,
    formatDistillNotification,
    formatRestoreNotification,
} from "./minimal-notifications"

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

function buildMinimalMessage(
    state: SessionState,
    reason: PruneReason | undefined,
    distillation: string[] | undefined,
    showDistillation: boolean,
): string {
    const distilledCount = distillation?.length ?? 0
    let message = formatStatsHeader(
        state.stats.totalPruneTokens,
        state.stats.pruneTokenCounter,
        state.stats.totalPruneMessages,
        state.stats.pruneMessageCounter,
        distilledCount,
    )

    return message + formatDistilled(showDistillation ? distillation : undefined)
}

function buildDetailedMessage(
    state: SessionState,
    reason: PruneReason | undefined,
    pruneToolIds: string[],
    toolMetadata: Map<string, ToolParameterEntry>,
    workingDirectory: string,
    distillation: string[] | undefined,
    showDistillation: boolean,
    simplified: boolean = false,
    pruneMessagePartIds: string[] = [],
): string {
    const distilledCount = distillation?.length ?? 0
    let message = formatStatsHeader(
        state.stats.totalPruneTokens,
        state.stats.pruneTokenCounter,
        state.stats.totalPruneMessages,
        state.stats.pruneMessageCounter,
        distilledCount,
    )

    // Only show pruning details if there are tokens being pruned or distilled
    const hasPruningActivity =
        state.stats.pruneTokenCounter > 0 || (distillation && distillation.length > 0)

    if (hasPruningActivity && (pruneToolIds.length > 0 || pruneMessagePartIds.length > 0)) {
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
    }

    return (message + formatDistilled(showDistillation ? distillation : undefined)).trim()
}

export interface NotifyOptions {
    simplified?: boolean
}

export async function sendUnifiedNotification(
    client: any,
    logger: Logger,
    config: PluginConfig,
    state: SessionState,
    sessionId: string,
    pruneToolIds: string[],
    toolMetadata: Map<string, ToolParameterEntry>,
    reason: PruneReason | undefined,
    params: any,
    workingDirectory: string,
    distillation?: string[],
    options?: NotifyOptions,
    pruneMessagePartIds: string[] = [],
): Promise<boolean> {
    const hasPruned = pruneToolIds.length > 0 || pruneMessagePartIds.length > 0
    if (!hasPruned) {
        return false
    }

    if (config.pruneNotification === "off") {
        return false
    }

    const showDistillation = config.tools.distill.showDistillation
    const simplified = options?.simplified ?? false

    const message =
        config.pruneNotification === "minimal"
            ? buildMinimalMessage(state, reason, distillation, showDistillation)
            : buildDetailedMessage(
                  state,
                  reason,
                  pruneToolIds,
                  toolMetadata,
                  workingDirectory,
                  distillation,
                  showDistillation,
                  simplified,
                  pruneMessagePartIds,
              )

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
