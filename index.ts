import type { Plugin } from "@opencode-ai/plugin"
import { getConfig } from "./lib/config"
import { Logger } from "./lib/logger"
import { createSessionState } from "./lib/state"
import {
    createDiscardTool,
    createDiscardMsgTool,
    createDistillTool,
    createDistillMsgTool,
    createRestoreTool,
    createRestoreMsgTool,
} from "./lib/strategies"
import {
    createChatMessageTransformHandler,
    createCommandExecuteHandler,
    createSystemPromptHandler,
    createToolExecuteAfterHandler,
} from "./lib/hooks"

const plugin: Plugin = (async (ctx) => {
    const config = getConfig(ctx)

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
        "chat.message": async (
            input: {
                sessionID: string
                agent?: string
                model?: { providerID: string; modelID: string }
                messageID?: string
                variant?: string
            },
            _output: any,
        ) => {
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
            ...(config.tools.discard.enabled && {
                discard_tool: createDiscardTool({
                    client: ctx.client,
                    state,
                    logger,
                    config,
                    workingDirectory: ctx.directory,
                }),
                discard_msg: createDiscardMsgTool({
                    client: ctx.client,
                    state,
                    logger,
                    config,
                    workingDirectory: ctx.directory,
                }),
            }),
            ...(config.tools.distill.enabled && {
                distill_tool: createDistillTool({
                    client: ctx.client,
                    state,
                    logger,
                    config,
                    workingDirectory: ctx.directory,
                }),
                distill_msg: createDistillMsgTool({
                    client: ctx.client,
                    state,
                    logger,
                    config,
                    workingDirectory: ctx.directory,
                }),
            }),
            restore_tool: createRestoreTool({
                client: ctx.client,
                state,
                logger,
                config,
                workingDirectory: ctx.directory,
            }),
            restore_msg: createRestoreMsgTool({
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

            const toolsToAdd: string[] = []
            if (config.tools.discard.enabled) {
                toolsToAdd.push("discard_tool", "discard_msg")
            }
            if (config.tools.distill.enabled) {
                toolsToAdd.push("distill_tool", "distill_msg")
            }
            toolsToAdd.push("restore_tool", "restore_msg")

            if (toolsToAdd.length > 0) {
                const existingPrimaryTools = opencodeConfig.experimental?.primary_tools ?? []
                opencodeConfig.experimental = {
                    ...opencodeConfig.experimental,
                    primary_tools: [...existingPrimaryTools, ...toolsToAdd],
                }
                logger.info(
                    `Added ${toolsToAdd.map((t) => `'${t}'`).join(", ")} to experimental.primary_tools via config mutation`,
                )
            }
        },
    }
}) satisfies Plugin

export default plugin
