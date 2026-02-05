/**
 * Unified context tool - combines discard and distill operations.
 */

import { tool } from "@opencode-ai/plugin"
import type { PruneToolContext } from "./_types"
import type { WithParts } from "../state"
import { ensureSessionInitialized } from "../state"
import { loadPrompt } from "../prompts"
import { detectTargetType } from "../messages/utils"
import { executeContextToolDiscard, executeContextMessageDiscard } from "./discard"
import {
    executeContextToolDistill,
    executeContextMessageDistill,
    executeContextReasoningDistill,
} from "./distill"

const CONTEXT_TOOL_SPEC = loadPrompt("context-spec")

/**
 * Execute context operation (discard, distill) with unified interface.
 * Supports mixed targets: tool hashes and message hashes in single call.
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
    const invalidTargets: string[] = []

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
        } else {
            invalidTargets.push(target)
        }
    }

    // Execute based on action
    let toolResult = ""
    let reasoningResult = ""
    let messageResult = ""

    if (action === "discard") {
        if (toolHashes.length > 0) {
            toolResult = await executeContextToolDiscard(ctx, toolCtx, toolHashes)
        }
        // THINKING MODE SAFETY: Auto-convert reasoning discard to distill with minimal placeholder.
        // When thinking mode is enabled, the API requires reasoning_content to exist on tool-call messages.
        // Discarding would remove it entirely, causing API validation errors.
        // Distilling with "—" preserves the field structure while minimizing token usage.
        if (reasoningHashes.length > 0) {
            logger.info(
                `Auto-converting reasoning discard to distill (thinking mode safety): ${reasoningHashes.length} blocks`,
            )
            const minimalSummaries = reasoningHashes.map(() => "—")
            reasoningResult = await executeContextReasoningDistill(
                ctx,
                toolCtx,
                reasoningHashes.map((h, i) => [h, minimalSummaries[i]!] as [string, string]),
            )
        }
        // THINKING MODE SAFETY: Check if message hashes point to assistant messages with tool calls.
        // If so, auto-convert to distill to preserve reasoning_content required by thinking mode API.
        if (messageHashes.length > 0) {
            const messagesToDistill: string[] = []
            const messagesToDiscard: string[] = []

            for (const hash of messageHashes) {
                const partId = state.hashRegistry.messages.get(hash)
                if (partId) {
                    // Parse messageId:partIndex from partId
                    const [messageId] = partId.split(":")
                    // Find the message
                    const msg = messages.find((m) => m.info.id === messageId)
                    if (msg && msg.info.role === "assistant") {
                        // Check if message has tool calls (internal format uses "tool", SDK format uses "tool-call")
                        const hasToolCalls = msg.parts?.some(
                            (p: any) => p.type === "tool" || p.type === "tool-call",
                        )
                        // Check if message has reasoning_content
                        const hasReasoning =
                            (msg.info as any).reasoning_content ||
                            (msg.info as any).tokens?.reasoning > 0

                        if (hasToolCalls && hasReasoning) {
                            messagesToDistill.push(hash)
                            logger.info(
                                `Auto-converting message discard to distill (thinking mode safety): ${hash}`,
                            )
                        } else {
                            messagesToDiscard.push(hash)
                        }
                    } else {
                        messagesToDiscard.push(hash)
                    }
                }
            }

            if (messagesToDistill.length > 0) {
                const minimalSummaries = messagesToDistill.map(() => "—")
                const distillResult = await executeContextMessageDistill(
                    ctx,
                    toolCtx,
                    messagesToDistill.map((h, i) => [h, minimalSummaries[i]!] as [string, string]),
                )
                messageResult += (messageResult ? "\n" : "") + distillResult
            }

            if (messagesToDiscard.length > 0) {
                const discardResult = await executeContextMessageDiscard(
                    ctx,
                    toolCtx,
                    messagesToDiscard,
                )
                messageResult += (messageResult ? "\n" : "") + discardResult
            }
        }
    } else if (action === "distill") {
        if (toolHashes.length > 0) {
            toolResult = await executeContextToolDistill(ctx, toolCtx, toolHashes, toolSummaries)
        }
        if (reasoningHashes.length > 0) {
            reasoningResult = await executeContextReasoningDistill(
                ctx,
                toolCtx,
                reasoningHashes.map((h, i) => [h, reasoningSummaries[i]!] as [string, string]),
            )
        }
        if (messageHashes.length > 0) {
            messageResult = await executeContextMessageDistill(
                ctx,
                toolCtx,
                messageHashes.map((h, i) => [h, messageSummaries[i]!] as [string, string]),
            )
        }
    }

    // Combine results
    const results = [toolResult, reasoningResult, messageResult].filter(Boolean)

    // Report invalid targets if any
    if (invalidTargets.length > 0) {
        results.push(`Invalid targets (not found in registry): ${invalidTargets.join(", ")}`)
    }

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
                            tool.schema.string().describe("Target hash (6 hex chars)"),
                        ]),
                        tool.schema.tuple([
                            tool.schema.string().describe("Target hash (6 hex chars)"),
                            tool.schema.string().describe("Summary for distill action"),
                        ]),
                    ]),
                )
                .describe(
                    "Array of [hash] or [hash, summary] tuples. Use [hash] for discard, [hash, summary] for distill. " +
                        "Hash format: 6 hex characters (e.g., 'a1b2c3'). " +
                        "Hashes are shown in tool outputs as <tool_hash>xxxxxx</tool_hash>.",
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
