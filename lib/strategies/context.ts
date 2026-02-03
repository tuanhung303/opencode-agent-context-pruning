/**
 * Unified context tool - combines discard, distill, and restore operations.
 */

import { tool } from "@opencode-ai/plugin"
import type { PruneToolContext } from "./_types"
import type { WithParts } from "../state"
import { ensureSessionInitialized } from "../state"
import { loadPrompt } from "../prompts"
import { detectTargetType } from "../messages/utils"
import { executeContextToolDiscard, executeContextMessageDiscard } from "./discard"
import { executeContextToolDistill, executeContextMessageDistill } from "./distill"
import { executeContextToolRestore, executeContextMessageRestore } from "./restore"

const CONTEXT_TOOL_SPEC = loadPrompt("context-spec")

/**
 * Execute context operation (discard, distill, restore) with unified interface.
 * Supports mixed targets: tool hashes and message patterns in single call.
 */
export async function executeContext(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    action: "discard" | "distill" | "restore",
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
    const messagePatterns: string[] = []
    const messageSummaries: string[] = []

    for (const tuple of targets) {
        const target = tuple[0]
        const summary = tuple[1]

        const targetType = detectTargetType(target)
        if (targetType === "tool_hash") {
            toolHashes.push(target)
            if (action === "distill") {
                if (!summary) {
                    throw new Error(`Summary required for distill action on target: ${target}`)
                }
                toolSummaries.push(summary)
            }
        } else {
            messagePatterns.push(target)
            if (action === "distill") {
                if (!summary) {
                    throw new Error(`Summary required for distill action on pattern: ${target}`)
                }
                messageSummaries.push(summary)
            }
        }
    }

    // Execute based on action
    let toolResult = ""
    let messageResult = ""

    if (action === "discard") {
        if (toolHashes.length > 0) {
            toolResult = await executeContextToolDiscard(ctx, toolCtx, toolHashes)
        }
        if (messagePatterns.length > 0) {
            messageResult = await executeContextMessageDiscard(
                ctx,
                toolCtx,
                messagePatterns,
                messages,
            )
        }
    } else if (action === "distill") {
        if (toolHashes.length > 0) {
            toolResult = await executeContextToolDistill(ctx, toolCtx, toolHashes, toolSummaries)
        }
        if (messagePatterns.length > 0) {
            messageResult = await executeContextMessageDistill(
                ctx,
                toolCtx,
                messagePatterns.map((p, i) => [p, messageSummaries[i]!] as [string, string]),
                messages,
            )
        }
    } else if (action === "restore") {
        if (toolHashes.length > 0) {
            toolResult = await executeContextToolRestore(ctx, toolHashes)
        }
        if (messagePatterns.length > 0) {
            messageResult = await executeContextMessageRestore(ctx, messagePatterns)
        }
    }

    // Combine results
    const results = [toolResult, messageResult].filter(Boolean)
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
                .enum(["discard", "distill", "restore"])
                .describe("The action to perform: discard, distill, or restore"),
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
                    "Array of [target] or [target, summary] tuples. Use [target] for discard/restore, [target, summary] for distill.",
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
