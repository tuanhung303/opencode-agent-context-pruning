import { tool } from "@opencode-ai/plugin"
import type { SessionState, ToolParameterEntry, WithParts } from "../state"
import type { PluginConfig } from "../config"
import { PruneReason, sendUnifiedNotification } from "../ui/notification"
import { formatDiscardNotification, formatRestoreNotification } from "../ui/minimal-notifications"
import { formatPruningResultForTool } from "../ui/utils"
import { ensureSessionInitialized } from "../state"
import { saveSessionState } from "../state/persistence"
import type { Logger } from "../logger"
import { loadPrompt } from "../prompts"
import { calculateTokensSaved, getCurrentParams } from "./utils"
import { getFilePathFromParameters, isProtectedFilePath } from "../protected-file-patterns"

const DISCARD_TOOL_DESCRIPTION = loadPrompt("discard-tool-spec")
const DISTILL_TOOL_DESCRIPTION = loadPrompt("distill-tool-spec")
const RESTORE_TOOL_DESCRIPTION = loadPrompt("restore-tool-spec")

export interface PruneToolContext {
    client: any
    state: SessionState
    logger: Logger
    config: PluginConfig
    workingDirectory: string
}

/**
 * Execute a prune operation using call IDs directly.
 * This is the hash-based version that works with resolved call IDs and message part IDs.
 */
async function executePruneOperationByCallIds(
    ctx: PruneToolContext,
    toolCtx: { sessionID: string },
    callIds: string[],
    hashes: string[],
    reason: PruneReason,
    toolName: string,
    distillation?: string[],
    messagePartIds: string[] = [],
): Promise<string> {
    const { client, state, logger, config, workingDirectory } = ctx
    const sessionId = toolCtx.sessionID

    logger.info(`${toolName} tool invoked`)
    logger.info(JSON.stringify({ hashes, reason, messagePartIds }))

    if ((!callIds || callIds.length === 0) && (!messagePartIds || messagePartIds.length === 0)) {
        logger.debug(`${toolName} tool called but no valid call IDs or message part IDs resolved`)
        throw new Error(
            `No valid hashes provided. Use hashes from tool outputs (e.g., #r_a1b2c#) or assistant messages (e.g., #a_xxxxx#).`,
        )
    }

    // Fetch messages to calculate tokens
    const messagesResponse = await client.session.messages({
        path: { id: sessionId },
    })
    const messages: WithParts[] = messagesResponse.data || messagesResponse

    await ensureSessionInitialized(ctx.client, state, sessionId, logger, messages)

    const currentParams = getCurrentParams(state, messages, logger)

    // Validate that all call IDs exist in cache and aren't protected
    for (const callId of callIds) {
        const metadata = state.toolParameters.get(callId)
        if (!metadata) {
            const hash = state.callIdToHash.get(callId) || "unknown"
            logger.debug("Rejecting prune request - call ID not in cache", { callId, hash })
            throw new Error(`Invalid hash provided. The tool may have already been discarded.`)
        }

        const allProtectedTools = config.tools.settings.protectedTools
        if (allProtectedTools.includes(metadata.tool)) {
            const hash = state.callIdToHash.get(callId) || "unknown"
            logger.debug("Rejecting prune request - protected tool", {
                callId,
                hash,
                tool: metadata.tool,
            })
            throw new Error(
                `Cannot discard: '${metadata.tool}' is a protected tool.\n` +
                    `Protected tools: ${allProtectedTools.join(", ")}\n` +
                    `To modify protection, update 'tools.settings.protectedTools' in your ACP config.`,
            )
        }

        const filePath = getFilePathFromParameters(metadata.parameters)
        if (isProtectedFilePath(filePath, config.protectedFilePatterns)) {
            const hash = state.callIdToHash.get(callId) || "unknown"
            logger.debug("Rejecting prune request - protected file path", {
                callId,
                hash,
                tool: metadata.tool,
                filePath,
            })
            const protectedPatterns =
                config.protectedFilePatterns.length > 0
                    ? `\nProtected patterns: ${config.protectedFilePatterns.join(", ")}`
                    : ""
            throw new Error(
                `Cannot discard: ${filePath} is a protected file path.${protectedPatterns}\n` +
                    `To modify protection, update 'protectedFilePatterns' in your ACP config.`,
            )
        }
    }

    // Add to prune lists
    state.prune.toolIds.push(...callIds)
    state.prune.messagePartIds.push(...messagePartIds)

    // Collect metadata for notification
    const toolMetadata = new Map<string, ToolParameterEntry>()
    for (const callId of callIds) {
        const toolParameters = state.toolParameters.get(callId)
        if (toolParameters) {
            toolMetadata.set(callId, toolParameters)
        } else {
            logger.debug("No metadata found for call ID", { callId })
        }
    }

    // Calculate token savings
    const tokensSaved = calculateTokensSaved(state, messages, callIds, messagePartIds)
    state.stats.pruneTokenCounter += tokensSaved
    const totalItems = callIds.length + messagePartIds.length
    state.stats.pruneMessageCounter += totalItems

    // Track strategy effectiveness
    if (toolName === "Discard") {
        state.stats.strategyStats.manualDiscard.count += totalItems
        state.stats.strategyStats.manualDiscard.tokens += tokensSaved
    } else if (toolName === "Distill") {
        state.stats.strategyStats.distillation.count += totalItems
        state.stats.strategyStats.distillation.tokens += tokensSaved
    }

    // Store stats for display
    state.lastDiscardStats = {
        itemCount: totalItems,
        tokensSaved: state.stats.pruneTokenCounter,
    }

    // Record in discard history
    state.discardHistory.push({
        timestamp: Date.now(),
        hashes,
        tokensSaved,
        reason,
    })

    await sendUnifiedNotification(
        client,
        logger,
        config,
        state,
        sessionId,
        callIds,
        toolMetadata,
        reason,
        currentParams,
        workingDirectory,
        distillation,
        { simplified: true },
        messagePartIds,
    )

    state.stats.totalPruneTokens += state.stats.pruneTokenCounter
    state.stats.pruneTokenCounter = 0
    state.stats.totalPruneMessages += state.stats.pruneMessageCounter
    state.stats.pruneMessageCounter = 0

    saveSessionState(state, logger).catch((err) =>
        logger.error("Failed to persist state", { error: err.message }),
    )

    // Return minimal single-line notification
    const totalCount = callIds.length + messagePartIds.length
    return formatDiscardNotification(totalCount, reason)
}

export function createDiscardTool(ctx: PruneToolContext): ReturnType<typeof tool> {
    return tool({
        description: DISCARD_TOOL_DESCRIPTION,
        args: {
            reason: tool.schema
                .string()
                .describe(
                    "Why you're discarding: 'noise' | 'completion' | 'superseded' | 'exploration' | 'duplicate'",
                ),
            hashes: tool.schema
                .array(tool.schema.string())
                .describe(
                    "Hash identifiers from tool outputs (e.g., #r_a1b2c#) or assistant messages (e.g., #a_xxxxx#)",
                ),
        },
        async execute(args, toolCtx) {
            const { state, logger } = ctx

            // Validate reason
            const validReasons = [
                "completion",
                "noise",
                "superseded",
                "exploration",
                "duplicate",
            ] as const
            if (!args.reason || !validReasons.includes(args.reason as any)) {
                logger.debug("Invalid discard reason provided: " + args.reason)
                throw new Error(
                    `Invalid reason '${args.reason}'. Use one of: ${validReasons.join(", ")}`,
                )
            }

            // Validate hashes provided
            if (!args.hashes || args.hashes.length === 0) {
                throw new Error(
                    "No hashes provided. Use hash identifiers from tool outputs or assistant messages.",
                )
            }

            // Resolve hashes
            const callIds: string[] = []
            const messagePartIds: string[] = []
            const validHashes: string[] = []
            const unknownHashes: string[] = []

            for (const hash of args.hashes) {
                // Check if it's a tool hash
                const callId = state.hashToCallId.get(hash)
                if (callId) {
                    if (!state.prune.toolIds.includes(callId)) {
                        callIds.push(callId)
                        validHashes.push(hash)
                    } else {
                        logger.debug(`Hash ${hash} already pruned, skipping`)
                    }
                    continue
                }

                // Check if it's an assistant message part hash
                const messagePartId = state.hashToMessagePart.get(hash)
                if (messagePartId) {
                    if (!state.prune.messagePartIds.includes(messagePartId)) {
                        messagePartIds.push(messagePartId)
                        validHashes.push(hash)
                    } else {
                        logger.debug(`Hash ${hash} already pruned, skipping`)
                    }
                    continue
                }

                unknownHashes.push(hash)
                logger.warn(`Unknown hash: ${hash}`)
            }

            if (unknownHashes.length > 0 && validHashes.length === 0) {
                throw new Error(
                    `Unknown hashes: ${unknownHashes.join(", ")}. Use hash identifiers from tool outputs or assistant messages.`,
                )
            }

            if (validHashes.length === 0) {
                throw new Error(
                    "No valid hashes to discard. Content may have already been discarded.",
                )
            }

            logger.info(
                `Discard: ${validHashes.length} hashes resolved to ${callIds.length} tool(s) and ${messagePartIds.length} message part(s)`,
            )

            return executePruneOperationByCallIds(
                ctx,
                toolCtx,
                callIds,
                validHashes,
                args.reason as PruneReason,
                "Discard",
                undefined,
                messagePartIds,
            )
        },
    })
}

export interface DistillEntry {
    hash: string
    replace_content: string
}

export function createDistillTool(ctx: PruneToolContext): ReturnType<typeof tool> {
    return tool({
        description: DISTILL_TOOL_DESCRIPTION,
        args: {
            entries: tool.schema
                .array(
                    tool.schema.object({
                        hash: tool.schema
                            .string()
                            .describe(
                                "Hash identifier from tool outputs (e.g., #r_a1b2c#) or assistant messages (e.g., #a_xxxxx#)",
                            ),
                        replace_content: tool.schema
                            .string()
                            .describe("The distilled content to replace the raw output with"),
                    }),
                )
                .describe(
                    "Array of entries to distill, each with a hash and its replacement content",
                ),
        },
        async execute(args, toolCtx) {
            const { state, logger } = ctx

            if (!args.entries || args.entries.length === 0) {
                throw new Error(
                    "No entries provided. Provide an array of {hash, replace_content} objects.",
                )
            }

            // Extract hashes and distillation content from entries
            const hashes: string[] = args.entries.map((e: DistillEntry) => e.hash)
            const distillation: string[] = args.entries.map((e: DistillEntry) => e.replace_content)

            // Resolve hashes
            const callIds: string[] = []
            const messagePartIds: string[] = []
            const validHashes: string[] = []
            const validDistillation: string[] = []

            for (const entry of args.entries) {
                const hash = entry.hash

                // Tool hash
                const callId = state.hashToCallId.get(hash)
                if (callId) {
                    if (!state.prune.toolIds.includes(callId)) {
                        callIds.push(callId)
                        validHashes.push(hash)
                        validDistillation.push(entry.replace_content)
                    }
                    continue
                }

                // Assistant message part hash
                const messagePartId = state.hashToMessagePart.get(hash)
                if (messagePartId) {
                    if (!state.prune.messagePartIds.includes(messagePartId)) {
                        messagePartIds.push(messagePartId)
                        validHashes.push(hash)
                        validDistillation.push(entry.replace_content)
                    }
                    continue
                }

                logger.warn(`Unknown or already pruned hash: ${hash}`)
            }

            if (validHashes.length === 0) {
                throw new Error(
                    "No valid hashes to distill. Content may have already been discarded.",
                )
            }

            // Log the distillation for debugging/analysis
            logger.info("Distillation data received:")
            logger.info(JSON.stringify(validDistillation, null, 2))

            return executePruneOperationByCallIds(
                ctx,
                toolCtx,
                callIds,
                validHashes,
                "distillation" as PruneReason,
                "Distill",
                validDistillation,
                messagePartIds,
            )
        },
    })
}

export function createRestoreTool(ctx: PruneToolContext): ReturnType<typeof tool> {
    return tool({
        description: RESTORE_TOOL_DESCRIPTION,
        args: {
            hashes: tool.schema
                .array(tool.schema.string())
                .describe("Hash identifiers from pruned content (e.g., #r_a1b2c# or #a_xxxxx#)"),
        },
        async execute(args, toolCtx) {
            const { state, logger } = ctx
            const sessionId = toolCtx.sessionID

            if (!args.hashes || args.hashes.length === 0) {
                throw new Error("No hashes provided. Use hash identifiers from pruned content.")
            }

            // Resolve hashes to call IDs and restore
            const restored: string[] = []
            const notFound: string[] = []
            const notPruned: string[] = []

            for (const hash of args.hashes) {
                // Tool hash
                const callId = state.hashToCallId.get(hash)
                if (callId) {
                    const pruneIndex = state.prune.toolIds.indexOf(callId)
                    if (pruneIndex !== -1) {
                        state.prune.toolIds.splice(pruneIndex, 1)
                        restored.push(hash)
                        logger.info(`Restored tool with hash ${hash} (callId: ${callId})`)
                    } else {
                        notPruned.push(hash)
                    }
                    continue
                }

                // Assistant message part hash
                const messagePartId = state.hashToMessagePart.get(hash)
                if (messagePartId) {
                    const pruneIndex = state.prune.messagePartIds.indexOf(messagePartId)
                    if (pruneIndex !== -1) {
                        state.prune.messagePartIds.splice(pruneIndex, 1)
                        restored.push(hash)
                        logger.info(
                            `Restored message part with hash ${hash} (partId: ${messagePartId})`,
                        )
                    } else {
                        notPruned.push(hash)
                    }
                    continue
                }

                notFound.push(hash)
            }

            // Save state
            saveSessionState(state, logger).catch((err) =>
                logger.error("Failed to persist state", { error: err.message }),
            )

            // Return minimal notification
            const totalRestored = restored.length
            return formatRestoreNotification(totalRestored)
        },
    })
}
