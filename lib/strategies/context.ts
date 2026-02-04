/**
 * Unified context tool - combines discard and distill operations.
 */

import { tool } from "@opencode-ai/plugin"
import type { PruneToolContext } from "./_types"
import type { WithParts } from "../state"
import { ensureSessionInitialized } from "../state"
import { loadPrompt } from "../prompts"
import { detectTargetType } from "../messages/utils"
import {
    executeContextToolDiscard,
    executeContextMessageDiscard,
    executeContextReasoningDiscard,
    executeBulkDiscard,
} from "./discard"
import {
    executeContextToolDistill,
    executeContextMessageDistill,
    executeBulkDistill,
} from "./distill"

const CONTEXT_TOOL_SPEC = loadPrompt("context-spec")

/**
 * Execute context operation (discard, distill) with unified interface.
 * Supports mixed targets: tool hashes and message patterns in single call.
 */
export async function executeContext(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    action: "discard" | "distill",
    targets: Array<[string] | [string, string]>,
): Promise<string> {
    const { client, state, logger } = ctx
    const sessionId = toolCtx.sessionID

    logger.info(`Context tool invoked: ${action}`)
    logger.info(JSON.stringify({ action, targetCount: targets.length }))

    if (!targets || targets.length === 0) {
        throw new Error(
            `No targets provided. Provide an array of [target] or [target, summary] tuples.`,
        )
    }

    const messagesResponse = await client.session.messages({
        path: { id: sessionId },
    })
    const messages: WithParts[] = (messagesResponse.data || messagesResponse) as WithParts[]

    await ensureSessionInitialized(ctx.client, state, sessionId, logger, messages)

    // Separate targets by type
    const toolHashes: string[] = []
    const toolSummaries: string[] = []
    const reasoningHashes: string[] = []
    const reasoningSummaries: string[] = []
    const messageHashes: string[] = []
    const messageSummaries: string[] = []
    // Track bulk operations
    const bulkTargets: Array<{
        type: "bulk_tools" | "bulk_messages" | "bulk_thinking" | "bulk_all"
        summary?: string
    }> = []

    for (const tuple of targets) {
        const target = tuple[0]
        const summary = tuple[1]

        const targetType = detectTargetType(target, state)
        if (targetType === "tool_hash") {
            toolHashes.push(target)
            if (action === "distill") {
                if (!summary) {
                    throw new Error(`Summary required for distill action on target: ${target}`)
                }
                toolSummaries.push(summary)
            }
        } else if (targetType === "message_hash") {
            messageHashes.push(target)
            if (action === "distill") {
                if (!summary) {
                    throw new Error(`Summary required for distill action on message: ${target}`)
                }
                messageSummaries.push(summary)
            }
        } else if (targetType === "reasoning_hash") {
            reasoningHashes.push(target)
            if (action === "distill") {
                if (!summary) {
                    throw new Error(
                        `Summary required for distill action on reasoning target: ${target}`,
                    )
                }
                reasoningSummaries.push(summary)
            }
        } else if (
            targetType === "bulk_tools" ||
            targetType === "bulk_messages" ||
            targetType === "bulk_thinking" ||
            targetType === "bulk_all"
        ) {
            // Bulk operations - validate summary requirement for distill
            if (action === "distill" && !summary) {
                throw new Error(`Summary required for distill action on bulk target: ${target}`)
            }
            bulkTargets.push({ type: targetType, summary })
        }
    }

    // Execute based on action
    let toolResult = ""
    let reasoningResult = ""
    let messageResult = ""

    // Track bulk operation results
    const bulkResults: string[] = []

    if (action === "discard") {
        if (toolHashes.length > 0) {
            toolResult = await executeContextToolDiscard(ctx, toolCtx, toolHashes)
        }
        if (reasoningHashes.length > 0) {
            reasoningResult = await executeContextReasoningDiscard(ctx, toolCtx, reasoningHashes)
        }
        if (messageHashes.length > 0) {
            messageResult = await executeContextMessageDiscard(ctx, toolCtx, messageHashes)
        }
        // Execute bulk discard operations
        for (const bulkTarget of bulkTargets) {
            const bulkResult = await executeBulkDiscard(ctx, toolCtx, bulkTarget.type)
            bulkResults.push(bulkResult)
        }
    } else if (action === "distill") {
        if (toolHashes.length > 0) {
            toolResult = await executeContextToolDistill(ctx, toolCtx, toolHashes, toolSummaries)
        }
        if (messageHashes.length > 0) {
            messageResult = await executeContextMessageDistill(
                ctx,
                toolCtx,
                messageHashes.map((h, i) => [h, messageSummaries[i]!] as [string, string]),
            )
        }
        // Execute bulk distill operations
        for (const bulkTarget of bulkTargets) {
            const bulkResult = await executeBulkDistill(
                ctx,
                toolCtx,
                bulkTarget.type,
                bulkTarget.summary || "",
            )
            bulkResults.push(bulkResult)
        }
    }

    // Combine results
    const results = [toolResult, reasoningResult, messageResult, ...bulkResults].filter(Boolean)
    return results.join("\n") || `${action} completed: 0 items processed`
}

/**
 * Create the unified context tool.
 */
export function createContextTool(ctx: PruneToolContext): ReturnType<typeof tool> {
    return tool({
        description: CONTEXT_TOOL_SPEC,
        args: {
            action: tool.schema
                .enum(["discard", "distill"])
                .describe("The action to perform: discard or distill"),
            targets: tool.schema
                .array(
                    tool.schema.union([
                        tool.schema.tuple([
                            tool.schema.string().describe("Target identifier (hash or pattern)"),
                        ]),
                        tool.schema.tuple([
                            tool.schema.string().describe("Target identifier (hash or pattern)"),
                            tool.schema.string().describe("Summary for distill action"),
                        ]),
                    ]),
                )
                .describe(
                    "Array of [target] or [target, summary] tuples. Use [target] for discard, [target, summary] for distill. " +
                        "Bulk patterns: use '[tools]' to target all tool outputs, '[messages]' for all assistant messages, " +
                        "'[thinking]' for all reasoning/thinking blocks (highest value target, ~2000+ tokens each), " +
                        "or '[*]'/'[all]' for all eligible items. " +
                        "Example: [['[tools]', 'Research complete']] for bulk distill of all tool outputs.",
                ),
        },
        async execute(args, toolCtx) {
            const { action, targets } = args
            return executeContext(
                ctx,
                toolCtx,
                action,
                targets as Array<[string] | [string, string]>,
            )
        },
    })
}
