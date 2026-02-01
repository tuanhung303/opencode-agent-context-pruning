import type { SessionState, WithParts, ToolParameterEntry } from "./state"
import type { Logger } from "./logger"
import type { PluginConfig } from "./config"
import { syncToolCache } from "./state/tool-cache"
import {
    deduplicate,
    supersedeWrites,
    purgeErrors,
    truncateLargeOutputs,
    compressThinkingBlocks,
} from "./strategies"
import {
    prune,
    injectHashesIntoToolOutputs,
    injectHashesIntoAssistantMessages,
    injectTodoReminder,
} from "./messages"
import { checkSession, ensureSessionInitialized } from "./state"
import { loadPrompt } from "./prompts"
import { handleStatsCommand } from "./commands/stats"
import { handleContextCommand } from "./commands/context"
import { handleHelpCommand } from "./commands/help"
import { handleSweepCommand } from "./commands/sweep"
import { handleProtectedCommand } from "./commands/protected"
import { handleBudgetCommand } from "./commands/budget"
import { safeExecute } from "./safe-execute"
import { sendUnifiedNotification } from "./ui/notification"
import { getCurrentParams } from "./strategies/utils"
import { saveSessionState } from "./state/persistence"

const INTERNAL_AGENT_SIGNATURES = [
    "You are a title generator",
    "You are a helpful AI assistant tasked with summarizing conversations",
    "Summarize what was done in this conversation",
]

export function createSystemPromptHandler(
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
) {
    return async (_input: unknown, output: { system: string[] }) => {
        if (state.isSubAgent) {
            return
        }

        const systemText = output.system.join("\n")
        if (INTERNAL_AGENT_SIGNATURES.some((sig) => systemText.includes(sig))) {
            logger.info("Skipping ACP system prompt injection for internal agent")
            return
        }

        const discardEnabled = config.tools.discard.enabled
        const distillEnabled = config.tools.distill.enabled

        let promptName: string
        if (discardEnabled && distillEnabled) {
            promptName = "system/system-prompt-both"
        } else if (discardEnabled) {
            promptName = "system/system-prompt-discard"
        } else if (distillEnabled) {
            promptName = "system/system-prompt-distill"
        } else {
            return
        }

        const syntheticPrompt = loadPrompt(promptName)
        output.system.push(syntheticPrompt)
    }
}

export function createChatMessageTransformHandler(
    client: any,
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
) {
    return async (input: {}, output: { messages: WithParts[] }) => {
        await checkSession(client, state, logger, output.messages)

        if (state.isSubAgent) {
            return
        }

        const initialMessageCount = output.messages.length
        logger.debug("Transform starting", {
            messageCount: initialMessageCount,
            prunedToolIds: state.prune.toolIds.length,
        })

        // Detect new user message
        const lastUserMessage = [...output.messages].reverse().find((m) => m.info.role === "user")
        if (lastUserMessage && lastUserMessage.info.id !== state.lastUserMessageId) {
            state.lastUserMessageId = lastUserMessage.info.id
            logger.info(`New user message detected (id: ${lastUserMessage.info.id})`)
        }

        syncToolCache(state, config, logger, output.messages)

        // Inject hashes into tool outputs (before any pruning)
        safeExecute(
            () => injectHashesIntoToolOutputs(state, config, output.messages, logger),
            logger,
            "injectHashesIntoToolOutputs",
        )

        // Inject hashes into assistant messages
        safeExecute(
            () => injectHashesIntoAssistantMessages(state, config, output.messages, logger),
            logger,
            "injectHashesIntoAssistantMessages",
        )

        // Run pruning strategies with error boundaries to prevent crashes
        safeExecute(
            () => deduplicate(state, logger, config, output.messages),
            logger,
            "deduplicate",
        )
        safeExecute(
            () => supersedeWrites(state, logger, config, output.messages),
            logger,
            "supersedeWrites",
        )
        safeExecute(
            () => purgeErrors(state, logger, config, output.messages),
            logger,
            "purgeErrors",
        )
        safeExecute(
            () => truncateLargeOutputs(state, logger, config, output.messages),
            logger,
            "truncateLargeOutputs",
        )
        safeExecute(
            () => compressThinkingBlocks(state, logger, config, output.messages),
            logger,
            "compressThinkingBlocks",
        )

        safeExecute(() => prune(state, logger, config, output.messages), logger, "prune")

        // Inject todo reminder if needed (after all other strategies)
        safeExecute(
            () => injectTodoReminder(state, config, output.messages, logger),
            logger,
            "injectTodoReminder",
        )

        // NOTE: insertPruneToolContext removed - hashes are now embedded in tool outputs

        logger.debug("Transform complete", {
            initialMessageCount,
            finalMessageCount: output.messages.length,
            messagesAdded: output.messages.length - initialMessageCount,
            lastMessageRole: output.messages[output.messages.length - 1]?.info.role,
        })

        if (state.sessionId) {
            await logger.saveContext(state.sessionId, output.messages)
        }
    }
}

export function createCommandExecuteHandler(
    client: any,
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
    workingDirectory: string,
) {
    return async (
        input: { command: string; sessionID: string; arguments: string },
        _output: { parts: any[] },
    ) => {
        if (!config.commands.enabled) {
            return
        }

        if (input.command === "acp") {
            const args = (input.arguments || "").trim().split(/\s+/).filter(Boolean)
            const subcommand = args[0]?.toLowerCase() || ""
            const _subArgs = args.slice(1)

            const messagesResponse = await client.session.messages({
                path: { id: input.sessionID },
            })
            const messages = (messagesResponse.data || messagesResponse) as WithParts[]

            if (subcommand === "context") {
                await handleContextCommand({
                    client,
                    state,
                    logger,
                    sessionId: input.sessionID,
                    messages,
                })
                throw new Error("__ACP_CONTEXT_HANDLED__")
            }

            if (subcommand === "stats") {
                await handleStatsCommand({
                    client,
                    state,
                    logger,
                    sessionId: input.sessionID,
                    messages,
                })
                throw new Error("__ACP_STATS_HANDLED__")
            }

            if (subcommand === "sweep") {
                await handleSweepCommand({
                    client,
                    state,
                    config,
                    logger,
                    sessionId: input.sessionID,
                    messages,
                    args: _subArgs,
                    workingDirectory,
                })
                throw new Error("__ACP_SWEEP_HANDLED__")
            }

            if (subcommand === "protected") {
                await handleProtectedCommand({
                    client,
                    state,
                    config,
                    logger,
                    sessionId: input.sessionID,
                    messages,
                })
                throw new Error("__ACP_PROTECTED_HANDLED__")
            }

            if (subcommand === "budget") {
                await handleBudgetCommand({
                    client,
                    state,
                    logger,
                    sessionId: input.sessionID,
                    messages,
                })
                throw new Error("__ACP_BUDGET_HANDLED__")
            }

            await handleHelpCommand({
                client,
                state,
                logger,
                sessionId: input.sessionID,
                messages,
            })
            throw new Error("__ACP_HELP_HANDLED__")
        }
    }
}

/**
 * Handler for tool.execute.after hook.
 * Runs lightweight pruning strategies immediately after each tool execution
 * to keep context clean throughout the conversation.
 */
export function createToolExecuteAfterHandler(
    client: any,
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
    workingDirectory: string,
) {
    return async (
        input: { tool: string; sessionID: string; callID: string },
        _output: { title: string; output: string; metadata: any },
    ) => {
        if (!config.enabled) {
            return
        }

        if (!config.autoPruneAfterTool) {
            return
        }

        if (state.isSubAgent) {
            return
        }

        const sessionId = input.sessionID

        try {
            // Fetch current messages
            const messagesResponse = await client.session.messages({
                path: { id: sessionId },
            })
            const messages: WithParts[] = messagesResponse.data || messagesResponse

            // Ensure session is initialized
            await ensureSessionInitialized(client, state, sessionId, logger, messages)

            // Sync tool cache to pick up the just-executed tool
            syncToolCache(state, config, logger, messages)

            // Inject hashes into assistant messages
            safeExecute(
                () => injectHashesIntoAssistantMessages(state, config, messages, logger),
                logger,
                "injectHashesIntoAssistantMessages",
            )

            // Store initial prune count to detect changes
            const initialPruneCount = state.prune.toolIds.length + state.prune.messagePartIds.length

            // Run lightweight strategies
            safeExecute(() => deduplicate(state, logger, config, messages), logger, "deduplicate")
            safeExecute(
                () => supersedeWrites(state, logger, config, messages),
                logger,
                "supersedeWrites",
            )
            safeExecute(() => purgeErrors(state, logger, config, messages), logger, "purgeErrors")
            safeExecute(
                () => truncateLargeOutputs(state, logger, config, messages),
                logger,
                "truncateLargeOutputs",
            )
            safeExecute(
                () => compressThinkingBlocks(state, logger, config, messages),
                logger,
                "compressThinkingBlocks",
            )

            // Apply pruning
            safeExecute(() => prune(state, logger, config, messages), logger, "prune")

            // Check if anything was pruned
            const newPruneCount = state.prune.toolIds.length + state.prune.messagePartIds.length
            const newlyPrunedCount = newPruneCount - initialPruneCount

            if (newlyPrunedCount > 0) {
                // Get the newly pruned IDs
                const newlyPrunedIds = state.prune.toolIds.slice(-newlyPrunedCount)

                // Collect metadata for notification
                const toolMetadata = new Map<string, ToolParameterEntry>()
                for (const callId of newlyPrunedIds) {
                    const toolParameters = state.toolParameters.get(callId)
                    if (toolParameters) {
                        toolMetadata.set(callId, toolParameters)
                    }
                }

                const currentParams = getCurrentParams(state, messages, logger)

                // Send simplified notification
                await sendUnifiedNotification(
                    client,
                    logger,
                    config,
                    state,
                    sessionId,
                    newlyPrunedIds,
                    toolMetadata,
                    undefined,
                    currentParams,
                    workingDirectory,
                    undefined,
                    { simplified: true },
                )

                // Save state
                await saveSessionState(state, logger)

                logger.debug(`Auto-pruned ${newlyPrunedCount} tool(s) after ${input.tool}`, {
                    toolName: input.tool,
                    prunedCount: newlyPrunedCount,
                })
            }
        } catch (error: any) {
            logger.error("Error in tool.execute.after handler", { error: error.message })
        }
    }
}
