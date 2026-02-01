import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "fs"
import { join, dirname } from "path"
import { homedir } from "os"
import { parse } from "jsonc-parser"
import type { PluginInput } from "@opencode-ai/plugin"
import { validateConfig, getUnknownKeys } from "./config-schema"

export interface Deduplication {
    enabled: boolean
    protectedTools: string[]
}

export interface DiscardTool {
    enabled: boolean
}

export interface ExtractTool {
    enabled: boolean
    showDistillation: boolean
}

export interface ToolSettings {
    protectedTools: string[]
    /** Enable assistant message part pruning (default: true) */
    enableAssistantMessagePruning: boolean
    /** Minimum text length for assistant parts to get hashes (default: 100) */
    minAssistantTextLength: number
}

export interface Tools {
    settings: ToolSettings
    discard: DiscardTool
    extract: ExtractTool
}

export interface Commands {
    enabled: boolean
    protectedTools: string[]
}

export interface SupersedeWrites {
    enabled: boolean
}

export interface PurgeErrors {
    enabled: boolean
    turns: number
    protectedTools: string[]
}

export interface Truncation {
    enabled: boolean
    /** Maximum tokens before truncation kicks in (default: 2000) */
    maxTokens: number
    /** Ratio of content to keep at the head (default: 0.4) */
    headRatio: number
    /** Ratio of content to keep at the tail (default: 0.4) */
    tailRatio: number
    /** Minimum turns old before truncating (default: 2) */
    minTurnsOld: number
    /** Tools to apply truncation to (default: ["read", "grep", "glob", "bash"]) */
    targetTools: string[]
}

export interface ThinkingCompression {
    enabled: boolean
    /** Minimum turns old before compressing thinking blocks (default: 3) */
    minTurnsOld: number
    /** Maximum tokens to keep from thinking block (default: 500) */
    maxTokens: number
}

export interface TurnProtection {
    enabled: boolean
    turns: number
}

export interface PluginConfig {
    enabled: boolean
    debug: boolean
    pruneNotification: "off" | "minimal" | "detailed"
    /**
     * Enable auto-pruning after each tool execution.
     * Lightweight strategies run immediately after tools complete,
     * keeping context clean throughout the conversation.
     * @default true
     */
    autoPruneAfterTool: boolean
    commands: Commands
    turnProtection: TurnProtection
    protectedFilePatterns: string[]
    tools: Tools
    strategies: {
        deduplication: Deduplication
        supersedeWrites: SupersedeWrites
        purgeErrors: PurgeErrors
        truncation: Truncation
        thinkingCompression: ThinkingCompression
    }
}

/**
 * Tools that should never be pruned.
 *
 * - `context_info`: Synthetic tool used to inject prunable-tools context
 *   for DeepSeek/Kimi models. Must be protected to prevent self-pruning
 *   which would break the context management feedback loop.
 *   See lib/messages/utils.ts createSyntheticToolPart()
 */
const DEFAULT_PROTECTED_TOOLS = [
    "context_info", // Synthetic tool for context injection
    "task",
    "todowrite",
    "todoread",
    "discard",
    "extract",
    "batch",
    "write",
    "edit",
    "plan_enter",
    "plan_exit",
]

// Show validation warnings for a config file using Zod schema
function showConfigValidationWarnings(
    ctx: PluginInput,
    configPath: string,
    configData: Record<string, any>,
    isProject: boolean,
): void {
    const validationErrors = validateConfig(configData)
    const unknownKeys = getUnknownKeys(configData)

    if (validationErrors.length === 0 && unknownKeys.length === 0) {
        return
    }

    const configType = isProject ? "project config" : "config"
    const messages: string[] = []

    if (unknownKeys.length > 0) {
        const keyList = unknownKeys.slice(0, 3).join(", ")
        const suffix = unknownKeys.length > 3 ? ` (+${unknownKeys.length - 3} more)` : ""
        messages.push(`Unknown keys: ${keyList}${suffix}`)
    }

    if (validationErrors.length > 0) {
        for (const err of validationErrors.slice(0, 2)) {
            messages.push(err)
        }
        if (validationErrors.length > 2) {
            messages.push(`(+${validationErrors.length - 2} more validation errors)`)
        }
    }

    setTimeout(() => {
        try {
            ctx.client.tui.showToast({
                body: {
                    title: `ACP: Invalid ${configType}`,
                    message: `${configPath}\n${messages.join("\n")}`,
                    variant: "warning",
                    duration: 7000,
                },
            })
        } catch {}
    }, 7000)
}

const defaultConfig: PluginConfig = {
    enabled: true,
    debug: false,
    pruneNotification: "detailed",
    autoPruneAfterTool: true,
    commands: {
        enabled: true,
        protectedTools: [...DEFAULT_PROTECTED_TOOLS],
    },
    turnProtection: {
        enabled: false,
        turns: 4,
    },
    protectedFilePatterns: [
        // Environment and secrets
        "**/.env",
        "**/.env.*",
        "**/credentials.json",
        "**/secrets.json",
        "**/*.pem",
        "**/*.key",
        // Config files users likely want to keep visible
        "**/package.json",
        "**/tsconfig.json",
        "**/pyproject.toml",
        "**/Cargo.toml",
    ],
    tools: {
        settings: {
            protectedTools: [...DEFAULT_PROTECTED_TOOLS],
            enableAssistantMessagePruning: true,
            minAssistantTextLength: 100,
        },
        discard: {
            enabled: true,
        },
        extract: {
            enabled: true,
            showDistillation: false,
        },
    },
    strategies: {
        deduplication: {
            enabled: true,
            protectedTools: [],
        },
        supersedeWrites: {
            enabled: false,
        },
        purgeErrors: {
            enabled: true,
            turns: 4,
            protectedTools: [],
        },
        truncation: {
            enabled: true,
            maxTokens: 2000,
            headRatio: 0.4,
            tailRatio: 0.4,
            minTurnsOld: 2,
            targetTools: ["read", "grep", "glob", "bash"],
        },
        thinkingCompression: {
            enabled: true,
            minTurnsOld: 3,
            maxTokens: 500,
        },
    },
}

const GLOBAL_CONFIG_DIR = join(homedir(), ".config", "opencode")
const GLOBAL_CONFIG_PATH_JSONC = join(GLOBAL_CONFIG_DIR, "acp.jsonc")
const GLOBAL_CONFIG_PATH_JSON = join(GLOBAL_CONFIG_DIR, "acp.json")

function findOpencodeDir(startDir: string): string | null {
    let current = startDir
    while (current !== "/") {
        const candidate = join(current, ".opencode")
        if (existsSync(candidate) && statSync(candidate).isDirectory()) {
            return candidate
        }
        const parent = dirname(current)
        if (parent === current) break
        current = parent
    }
    return null
}

function getConfigPaths(ctx?: PluginInput): {
    global: string | null
    configDir: string | null
    project: string | null
} {
    // Global: ~/.config/opencode/acp.jsonc|json
    let globalPath: string | null = null
    if (existsSync(GLOBAL_CONFIG_PATH_JSONC)) {
        globalPath = GLOBAL_CONFIG_PATH_JSONC
    } else if (existsSync(GLOBAL_CONFIG_PATH_JSON)) {
        globalPath = GLOBAL_CONFIG_PATH_JSON
    }

    // Custom config directory: $OPENCODE_CONFIG_DIR/acp.jsonc|json
    let configDirPath: string | null = null
    const opencodeConfigDir = process.env.OPENCODE_CONFIG_DIR
    if (opencodeConfigDir) {
        const configJsonc = join(opencodeConfigDir, "acp.jsonc")
        const configJson = join(opencodeConfigDir, "acp.json")
        if (existsSync(configJsonc)) {
            configDirPath = configJsonc
        } else if (existsSync(configJson)) {
            configDirPath = configJson
        }
    }

    // Project: <project>/.opencode/acp.jsonc|json
    let projectPath: string | null = null
    if (ctx?.directory) {
        const opencodeDir = findOpencodeDir(ctx.directory)
        if (opencodeDir) {
            const projectJsonc = join(opencodeDir, "acp.jsonc")
            const projectJson = join(opencodeDir, "acp.json")
            if (existsSync(projectJsonc)) {
                projectPath = projectJsonc
            } else if (existsSync(projectJson)) {
                projectPath = projectJson
            }
        }
    }

    return { global: globalPath, configDir: configDirPath, project: projectPath }
}

function createDefaultConfig(): void {
    if (!existsSync(GLOBAL_CONFIG_DIR)) {
        mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true })
    }

    const configContent = `{
  "$schema": "https://raw.githubusercontent.com/opencode-acp/opencode-acp/master/acp.schema.json"
}
`
    writeFileSync(GLOBAL_CONFIG_PATH_JSONC, configContent, "utf-8")
}

interface ConfigLoadResult {
    data: Record<string, any> | null
    parseError?: string
}

function loadConfigFile(configPath: string): ConfigLoadResult {
    let fileContent: string
    try {
        fileContent = readFileSync(configPath, "utf-8")
    } catch {
        // File doesn't exist or can't be read - not a parse error
        return { data: null }
    }

    try {
        const parsed = parse(fileContent)
        if (parsed === undefined || parsed === null) {
            return { data: null, parseError: "Config file is empty or invalid" }
        }
        return { data: parsed }
    } catch (error: any) {
        return { data: null, parseError: error.message || "Failed to parse config" }
    }
}

function mergeStrategies(
    base: PluginConfig["strategies"],
    override?: Partial<PluginConfig["strategies"]>,
): PluginConfig["strategies"] {
    if (!override) return base

    return {
        deduplication: {
            enabled: override.deduplication?.enabled ?? base.deduplication.enabled,
            protectedTools: [
                ...new Set([
                    ...base.deduplication.protectedTools,
                    ...(override.deduplication?.protectedTools ?? []),
                ]),
            ],
        },
        supersedeWrites: {
            enabled: override.supersedeWrites?.enabled ?? base.supersedeWrites.enabled,
        },
        purgeErrors: {
            enabled: override.purgeErrors?.enabled ?? base.purgeErrors.enabled,
            turns: override.purgeErrors?.turns ?? base.purgeErrors.turns,
            protectedTools: [
                ...new Set([
                    ...base.purgeErrors.protectedTools,
                    ...(override.purgeErrors?.protectedTools ?? []),
                ]),
            ],
        },
        truncation: {
            enabled: override.truncation?.enabled ?? base.truncation.enabled,
            maxTokens: override.truncation?.maxTokens ?? base.truncation.maxTokens,
            headRatio: override.truncation?.headRatio ?? base.truncation.headRatio,
            tailRatio: override.truncation?.tailRatio ?? base.truncation.tailRatio,
            minTurnsOld: override.truncation?.minTurnsOld ?? base.truncation.minTurnsOld,
            targetTools: override.truncation?.targetTools ?? base.truncation.targetTools,
        },
        thinkingCompression: {
            enabled: override.thinkingCompression?.enabled ?? base.thinkingCompression.enabled,
            minTurnsOld:
                override.thinkingCompression?.minTurnsOld ?? base.thinkingCompression.minTurnsOld,
            maxTokens:
                override.thinkingCompression?.maxTokens ?? base.thinkingCompression.maxTokens,
        },
    }
}

function mergeTools(
    base: PluginConfig["tools"],
    override?: Partial<PluginConfig["tools"]>,
): PluginConfig["tools"] {
    if (!override) return base

    return {
        settings: {
            protectedTools: [
                ...new Set([
                    ...base.settings.protectedTools,
                    ...(override.settings?.protectedTools ?? []),
                ]),
            ],
            enableAssistantMessagePruning:
                override.settings?.enableAssistantMessagePruning ??
                base.settings.enableAssistantMessagePruning,
            minAssistantTextLength:
                override.settings?.minAssistantTextLength ?? base.settings.minAssistantTextLength,
        },
        discard: {
            enabled: override.discard?.enabled ?? base.discard.enabled,
        },
        extract: {
            enabled: override.extract?.enabled ?? base.extract.enabled,
            showDistillation: override.extract?.showDistillation ?? base.extract.showDistillation,
        },
    }
}

function mergeCommands(
    base: PluginConfig["commands"],
    override?: Partial<PluginConfig["commands"]>,
): PluginConfig["commands"] {
    if (override === undefined) return base

    return {
        enabled: override.enabled ?? base.enabled,
        protectedTools: [...new Set([...base.protectedTools, ...(override.protectedTools ?? [])])],
    }
}

function deepCloneConfig(config: PluginConfig): PluginConfig {
    return {
        ...config,
        commands: {
            enabled: config.commands.enabled,
            protectedTools: [...config.commands.protectedTools],
        },
        turnProtection: { ...config.turnProtection },
        protectedFilePatterns: [...config.protectedFilePatterns],
        tools: {
            settings: {
                protectedTools: [...config.tools.settings.protectedTools],
                enableAssistantMessagePruning: config.tools.settings.enableAssistantMessagePruning,
                minAssistantTextLength: config.tools.settings.minAssistantTextLength,
            },
            discard: { ...config.tools.discard },
            extract: { ...config.tools.extract },
        },
        strategies: {
            deduplication: {
                ...config.strategies.deduplication,
                protectedTools: [...config.strategies.deduplication.protectedTools],
            },
            supersedeWrites: {
                ...config.strategies.supersedeWrites,
            },
            purgeErrors: {
                ...config.strategies.purgeErrors,
                protectedTools: [...config.strategies.purgeErrors.protectedTools],
            },
            truncation: {
                ...config.strategies.truncation,
                targetTools: [...config.strategies.truncation.targetTools],
            },
            thinkingCompression: {
                ...config.strategies.thinkingCompression,
            },
        },
    }
}

export function getConfig(ctx: PluginInput): PluginConfig {
    let config = deepCloneConfig(defaultConfig)
    const configPaths = getConfigPaths(ctx)

    // Load and merge global config
    if (configPaths.global) {
        const result = loadConfigFile(configPaths.global)
        if (result.parseError) {
            setTimeout(async () => {
                try {
                    ctx.client.tui.showToast({
                        body: {
                            title: "ACP: Invalid config",
                            message: `${configPaths.global}\n${result.parseError}\nUsing default values`,
                            variant: "warning",
                            duration: 7000,
                        },
                    })
                } catch {}
            }, 7000)
        } else if (result.data) {
            // Validate config keys and types
            showConfigValidationWarnings(ctx, configPaths.global, result.data, false)
            config = {
                enabled: result.data.enabled ?? config.enabled,
                debug: result.data.debug ?? config.debug,
                pruneNotification: result.data.pruneNotification ?? config.pruneNotification,
                autoPruneAfterTool: result.data.autoPruneAfterTool ?? config.autoPruneAfterTool,
                commands: mergeCommands(config.commands, result.data.commands as any),
                turnProtection: {
                    enabled: result.data.turnProtection?.enabled ?? config.turnProtection.enabled,
                    turns: result.data.turnProtection?.turns ?? config.turnProtection.turns,
                },
                protectedFilePatterns: [
                    ...new Set([
                        ...config.protectedFilePatterns,
                        ...(result.data.protectedFilePatterns ?? []),
                    ]),
                ],
                tools: mergeTools(config.tools, result.data.tools as any),
                strategies: mergeStrategies(config.strategies, result.data.strategies as any),
            }
        }
    } else {
        // No config exists, create default
        createDefaultConfig()
    }

    // Load and merge $OPENCODE_CONFIG_DIR/acp.jsonc|json (overrides global)
    if (configPaths.configDir) {
        const result = loadConfigFile(configPaths.configDir)
        if (result.parseError) {
            setTimeout(async () => {
                try {
                    ctx.client.tui.showToast({
                        body: {
                            title: "ACP: Invalid configDir config",
                            message: `${configPaths.configDir}\n${result.parseError}\nUsing global/default values`,
                            variant: "warning",
                            duration: 7000,
                        },
                    })
                } catch {}
            }, 7000)
        } else if (result.data) {
            // Validate config keys and types
            showConfigValidationWarnings(ctx, configPaths.configDir, result.data, true)
            config = {
                enabled: result.data.enabled ?? config.enabled,
                debug: result.data.debug ?? config.debug,
                pruneNotification: result.data.pruneNotification ?? config.pruneNotification,
                autoPruneAfterTool: result.data.autoPruneAfterTool ?? config.autoPruneAfterTool,
                commands: mergeCommands(config.commands, result.data.commands as any),
                turnProtection: {
                    enabled: result.data.turnProtection?.enabled ?? config.turnProtection.enabled,
                    turns: result.data.turnProtection?.turns ?? config.turnProtection.turns,
                },
                protectedFilePatterns: [
                    ...new Set([
                        ...config.protectedFilePatterns,
                        ...(result.data.protectedFilePatterns ?? []),
                    ]),
                ],
                tools: mergeTools(config.tools, result.data.tools as any),
                strategies: mergeStrategies(config.strategies, result.data.strategies as any),
            }
        }
    }

    // Load and merge project config (overrides global)
    if (configPaths.project) {
        const result = loadConfigFile(configPaths.project)
        if (result.parseError) {
            setTimeout(async () => {
                try {
                    ctx.client.tui.showToast({
                        body: {
                            title: "ACP: Invalid project config",
                            message: `${configPaths.project}\n${result.parseError}\nUsing global/default values`,
                            variant: "warning",
                            duration: 7000,
                        },
                    })
                } catch {}
            }, 7000)
        } else if (result.data) {
            // Validate config keys and types
            showConfigValidationWarnings(ctx, configPaths.project, result.data, true)
            config = {
                enabled: result.data.enabled ?? config.enabled,
                debug: result.data.debug ?? config.debug,
                pruneNotification: result.data.pruneNotification ?? config.pruneNotification,
                autoPruneAfterTool: result.data.autoPruneAfterTool ?? config.autoPruneAfterTool,
                commands: mergeCommands(config.commands, result.data.commands as any),
                turnProtection: {
                    enabled: result.data.turnProtection?.enabled ?? config.turnProtection.enabled,
                    turns: result.data.turnProtection?.turns ?? config.turnProtection.turns,
                },
                protectedFilePatterns: [
                    ...new Set([
                        ...config.protectedFilePatterns,
                        ...(result.data.protectedFilePatterns ?? []),
                    ]),
                ],
                tools: mergeTools(config.tools, result.data.tools as any),
                strategies: mergeStrategies(config.strategies, result.data.strategies as any),
            }
        }
    }

    return config
}
