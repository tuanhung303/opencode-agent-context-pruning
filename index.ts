import type { Plugin } from "@opencode-ai/plugin"
import { ConfigService } from "./lib/config"
import { Logger } from "./lib/logger"
import { createSessionState } from "./lib/state"
import { createContextTool } from "./lib/strategies"
import {
    createChatMessageTransformHandler,
    createCommandExecuteHandler,
    createSystemPromptHandler,
    createToolExecuteAfterHandler,
} from "./lib/hooks"

const plugin: Plugin = (async (ctx) => {
    const configService = new ConfigService()
    const config = configService.load(ctx.directory)

    if (!config.enabled) {
        return {}
    }

    const logger = new Logger(config.debug)
    const state = createSessionState()

    logger.info("ACP initialized", {
        strategies: config.strategies,
    })

    return {
        "experimental.chat.system.transform": createSystemPromptHandler(state, logger, config),

        "experimental.chat.messages.transform": createChatMessageTransformHandler(
            ctx.client,
            state,
            logger,
            config,
        ),
        "chat.message": async (input: {
            sessionID: string
            agent?: string
            model?: { providerID: string; modelID: string }
            messageID?: string
            variant?: string
        }) => {
            // Cache variant from real user messages (not synthetic)
            // This avoids scanning all messages to find variant
            state.variant = input.variant
            logger.debug("Cached variant from chat.message hook", { variant: input.variant })
        },
        "command.execute.before": createCommandExecuteHandler(
            ctx.client,
            state,
            logger,
            config,
            ctx.directory,
        ),
        "tool.execute.after": createToolExecuteAfterHandler(
            ctx.client,
            state,
            logger,
            config,
            ctx.directory,
        ),
        tool: {
            context_prune: createContextTool({
                client: ctx.client,
                state,
                logger,
                config,
                workingDirectory: ctx.directory,
            }),
        },
        config: async (opencodeConfig) => {
            if (config.commands.enabled) {
                opencodeConfig.command ??= {}
                opencodeConfig.command["acp"] = {
                    template: "",
                    description: "Show available ACP commands",
                }
            }

            const existingPrimaryTools = opencodeConfig.experimental?.primary_tools ?? []
            opencodeConfig.experimental = {
                ...opencodeConfig.experimental,
                primary_tools: [...existingPrimaryTools, "context_prune"],
            }
            logger.info("Added 'context_prune' to experimental.primary_tools via config mutation")

            // Disable OpenCode's built-in compaction and tool output pruning.
            // ACP plugin takes full ownership of context management via the
            // experimental.chat.messages.transform hook. Without this, OpenCode's
            // own compaction (summarize + drop history) and pruning (replace old
            // tool outputs with "[Old tool result content cleared]") conflict with
            // the plugin's more granular pruning strategies.
            ;(opencodeConfig as Record<string, unknown>).compaction = { auto: false, prune: false }
            logger.info("Disabled OpenCode built-in compaction — ACP manages context")
        },
        // Last-resort safety net: if compaction triggers despite being disabled
        // (e.g., user re-enables it in their config), inject plugin state so the
        // summary preserves critical context about what we've been tracking.
        "experimental.session.compacting": async (
            _input: { sessionID: string },
            output: { context: string[]; prompt?: string },
        ) => {
            const contextLines: string[] = []

            // Inject active todo state
            const activeTodos = state.todos.filter(
                (t) => t.status === "in_progress" || t.status === "pending",
            )
            if (activeTodos.length > 0) {
                contextLines.push("## Active Tasks")
                for (const todo of activeTodos) {
                    contextLines.push(`- [${todo.status}] ${todo.content} (${todo.priority})`)
                }
            }

            // Inject tracked file paths
            const trackedFiles = Array.from(state.cursors.files.pathToCallIds.keys())
            if (trackedFiles.length > 0) {
                contextLines.push("## Files Being Tracked")
                contextLines.push(trackedFiles.slice(0, 20).join("\n"))
            }

            // Inject pruning stats
            contextLines.push("## Context Management Stats")
            contextLines.push(`- Total tokens saved by ACP plugin: ${state.stats.totalPruneTokens}`)
            contextLines.push(`- Tool outputs pruned: ${state.prune.toolIds.length}`)
            contextLines.push(`- Current turn: ${state.currentTurn}`)

            if (state.contextPressure) {
                contextLines.push(
                    `- Context pressure: ${state.contextPressure.contextPercent}% (${state.contextPressure.statusLabel})`,
                )
            }

            output.context.push(contextLines.join("\n"))
            logger.info("Injected ACP state into compaction context", {
                activeTodos: activeTodos.length,
                trackedFiles: trackedFiles.length,
            })
        },
    }
}) satisfies Plugin

export default plugin
