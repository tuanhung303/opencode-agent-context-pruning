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
            context: createContextTool({
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
                primary_tools: [...existingPrimaryTools, "context"],
            }
            logger.info("Added 'context' to experimental.primary_tools via config mutation")
        },
    }
}) satisfies Plugin

export default plugin
