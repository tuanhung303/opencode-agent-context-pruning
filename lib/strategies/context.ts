/**
 * Unified context tool - combines discard and distill operations.
 */

import { tool } from "@opencode-ai/plugin"
import type { PruneToolContext, ReplaceOperation } from "./_types"
import type { WithParts } from "../state"
import { ensureSessionInitialized } from "../state"
import { loadPrompt } from "../prompts"
import { detectTargetType, resolveTargetDisplayName } from "../messages/utils"
import { executeContextToolDiscard, executeContextMessageDiscard } from "./discard"
import {
    executeContextToolDistill,
    executeContextMessageDistill,
    executeContextReasoningDistill,
} from "./distill"
import { executeReplace, formatReplaceResult } from "./replace"

const CONTEXT_TOOL_SPEC = loadPrompt("context-spec")

/**
 * Get hash inventory counts from state.
 */
function getHashInventory(state: PruneToolContext["state"]): {
    tools: number
    messages: number
    reasoning: number
    total: number
} {
    // Count unpruned hashes only
    const prunedToolIds = new Set(state.prune.toolIds)
    const prunedMessageIds = new Set(state.prune.messagePartIds)
    const prunedReasoningIds = new Set(state.prune.reasoningPartIds)

    let tools = 0
    for (const [, callId] of state.hashRegistry.calls) {
        if (!prunedToolIds.has(callId)) tools++
    }

    let messages = 0
    for (const [, partId] of state.hashRegistry.messages) {
        if (!prunedMessageIds.has(partId)) messages++
    }

    let reasoning = 0
    for (const [, partId] of state.hashRegistry.reasoning) {
        if (!prunedReasoningIds.has(partId)) reasoning++
    }

    return { tools, messages, reasoning, total: tools + messages + reasoning }
}

/**
 * Format hash inventory for display.
 */
function formatInventoryLine(inventory: ReturnType<typeof getHashInventory>): string {
    if (inventory.total === 0) {
        return "Available: none"
    }
    const parts: string[] = []
    if (inventory.tools > 0) parts.push(`Tools(${inventory.tools})`)
    if (inventory.messages > 0) parts.push(`Messages(${inventory.messages})`)
    if (inventory.reasoning > 0) parts.push(`Reasoning(${inventory.reasoning})`)
    return `Available: ${parts.join(", ")}`
}

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
            `No targets provided. Provide an array of [hash] or [hash, summary] tuples.\n` +
                `Hash format: exactly 6 hex characters (0-9, a-f), e.g., "a1b2c3"`,
        )
    }

    // Validate hash format before processing
    for (const tuple of targets) {
        const target = tuple[0]
        if (!/^[a-f0-9]{6}$/i.test(target)) {
            throw new Error(
                `Invalid hash format: "${target}" (${target.length} chars).\n` +
                    `Expected: exactly 6 hex characters (0-9, a-f), e.g., "a1b2c3"`,
            )
        }
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

    // Get hash inventory for response
    const inventory = getHashInventory(state)
    const inventoryLine = formatInventoryLine(inventory)

    // Report invalid targets if any
    if (invalidTargets.length > 0) {
        // Check if any were already pruned
        const alreadyPruned: string[] = []
        for (const target of invalidTargets) {
            // Check discard history
            const historyEntry = state.discardHistory.find((h) => h.hashes.includes(target))
            if (historyEntry) {
                const turnsAgo =
                    state.currentTurn - Math.floor((Date.now() - historyEntry.timestamp) / 60000)
                alreadyPruned.push(`${target} (pruned ~${Math.max(1, turnsAgo)} turns ago)`)
            }
        }

        let errorMsg = `Hash(es) not found: ${invalidTargets.join(", ")}`
        if (alreadyPruned.length > 0) {
            errorMsg += `\nAlready pruned: ${alreadyPruned.join(", ")}`
        }

        // Add empty context guidance if no hashes available
        if (inventory.total === 0) {
            errorMsg += `\nNo content to prune yet. Run tools first (read, bash, glob, grep).`
        } else {
            errorMsg += `\n${inventoryLine}`
        }
        results.push(errorMsg)
    }

    // Inventory line removed from successful responses per user preference
    return results.join("\n") || `${action} completed: 0 items processed`
}

/**
 * Execute replace action.
 */
async function executeReplaceAction(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    operations: ReplaceOperation[],
): Promise<string> {
    const { logger } = ctx

    logger.info(`Context tool invoked: replace`)
    logger.info(JSON.stringify({ action: "replace", operationCount: operations.length }))

    return executeReplace(ctx, toolCtx, operations)
}

/**
 * Create the unified context tool.
 */
export function createContextTool(ctx: PruneToolContext): ReturnType<typeof tool> {
    return tool({
        description: CONTEXT_TOOL_SPEC,
        args: {
            action: tool.schema
                .enum(["discard", "distill", "replace"])
                .describe("The action to perform: discard, distill, or replace"),
            targets: tool.schema
                .array(
                    tool.schema.union([
                        // Hash-based targets (discard/distill)
                        tool.schema.tuple([
                            tool.schema.string().describe("Target hash (6 hex chars)"),
                        ]),
                        tool.schema.tuple([
                            tool.schema.string().describe("Target hash (6 hex chars)"),
                            tool.schema.string().describe("Summary for distill action"),
                        ]),
                        // Pattern-based replace target [start, end, replacement]
                        tool.schema.tuple([
                            tool.schema.string().describe("Start pattern"),
                            tool.schema.string().describe("End pattern"),
                            tool.schema.string().describe("Replacement text"),
                        ]),
                    ]),
                )
                .describe(
                    "Array of targets: [hash] for discard, [hash, summary] for distill, [start, end, replacement] for replace",
                ),
        },
        async execute(args, toolCtx) {
            const { action, targets } = args

            if (action === "replace") {
                // Parse replace operations from [start, end, replacement] tuples
                const operations: ReplaceOperation[] = []
                for (const target of targets) {
                    if (Array.isArray(target) && target.length === 3) {
                        const [start, end, replacement] = target as [string, string, string]
                        operations.push({ start, end, replacement })
                    }
                }
                return executeReplaceAction(ctx, toolCtx, operations)
            }

            return executeContext(
                ctx,
                toolCtx,
                action,
                targets as Array<[string] | [string, string]>,
            )
        },
    })
}
