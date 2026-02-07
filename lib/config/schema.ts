import { z } from "zod"

/**
 * Schema definitions for plugin configuration
 * Extracted from config-schema.ts and config.ts
 */

/**
 * Tools that should never be pruned.
 * Includes context_info (synthetic tool for DeepSeek/Kimi models) and core tools.
 */
export const DEFAULT_PROTECTED_TOOLS = [
    "context_info", // Synthetic tool for context injection
    "task",
    "todowrite",
    "todoread",
    "agent_context_optimize",
    "batch",
    "write",
    "edit",
    "plan_enter",
    "plan_exit",
] as const

export const DiscardToolSchema = z.object({
    enabled: z
        .boolean()
        .default(true)
        .describe(
            "Enable the discard tool for manually removing specific tool outputs from context",
        ),
})

export const DistillToolSchema = z.object({
    enabled: z
        .boolean()
        .default(true)
        .describe("Enable the distill tool for summarizing tool outputs"),
    showDistillation: z
        .boolean()
        .default(false)
        .describe("Show distillation output in the UI for debugging"),
})

export const ToolSettingsSchema = z.object({
    protectedTools: z
        .array(z.string())
        .default([...DEFAULT_PROTECTED_TOOLS])
        .describe(
            "Tool names that should be protected from automatic pruning. Default includes context_info, task, todowrite, todoread, agent_context_optimize, batch, write, edit, plan_enter, and plan_exit",
        ),
    enableAssistantMessagePruning: z
        .boolean()
        .default(true)
        .describe("Enable pruning of large assistant messages to reduce context size"),
    enableReasoningPruning: z
        .boolean()
        .default(true)
        .describe("Enable pruning of reasoning/thinking blocks from assistant messages"),
    enableVisibleAssistantHashes: z
        .boolean()
        .default(true)
        .describe("Show visible hash markers when assistant messages are pruned for transparency"),
})

export const TodoReminderSchema = z.object({
    enabled: z
        .boolean()
        .default(true)
        .describe(
            "Enable todo reminder injection to remind agent to review/update todo list when stale",
        ),
    initialTurns: z
        .number()
        .positive()
        .default(5)
        .describe("Number of turns before the first todo reminder is shown"),
    repeatTurns: z
        .number()
        .positive()
        .default(4)
        .describe("Number of turns between subsequent todo reminders"),
    stuckTaskTurns: z
        .number()
        .positive()
        .default(12)
        .describe("Number of turns a task can be in_progress before suggesting breakdown"),
    maxContextTokens: z
        .number()
        .positive()
        .default(100000)
        .describe("Maximum context token threshold for todo reminders"),
})

export const AutomataModeSchema = z.object({
    enabled: z
        .boolean()
        .default(true)
        .describe("Enable automata mode reflection injection for autonomous strategic prompts"),
    initialTurns: z
        .number()
        .positive()
        .default(8)
        .describe("Number of turns of continuous work before first reflection prompt"),
})

export const ToolsSchema = z.object({
    settings: ToolSettingsSchema,
    discard: DiscardToolSchema,
    distill: DistillToolSchema,
    todoReminder: TodoReminderSchema,
    automataMode: AutomataModeSchema,
})

export const CommandsSchema = z.object({
    enabled: z
        .boolean()
        .default(true)
        .describe("Enable ACP slash commands (/acp) for manual pruning control"),
    protectedTools: z
        .array(z.string())
        .default([...DEFAULT_PROTECTED_TOOLS])
        .describe("Additional tool names to protect from pruning via commands (e.g., /acp sweep)"),
})

export const PurgeErrorsSchema = z.object({
    enabled: z
        .boolean()
        .default(false)
        .describe("Enable automatic purging of tool outputs that resulted in errors"),
    turns: z
        .number()
        .positive()
        .default(4)
        .describe("Number of turns after which error outputs are purged"),
    protectedTools: z
        .array(z.string())
        .default([])
        .describe("Tool names excluded from error purging"),
})

/**
 * Pruning preset definitions.
 * - compact: Maximum cleanup for long sessions
 * - balanced: Default - good for most use cases
 * - verbose: Minimal cleanup for debugging/audit
 */
export const PRUNING_PRESETS = {
    compact: {
        pruneSourceUrls: true,
        pruneFiles: true,
        pruneSnapshots: true,
        pruneStepMarkers: true,
        pruneToolInputs: true,
        pruneRetryParts: true,
        pruneUserCodeBlocks: true,
        aggressiveFilePrune: true,
        stateQuerySupersede: true,
        truncateOldErrors: true,
    },
    balanced: {
        pruneSourceUrls: true,
        pruneFiles: true,
        pruneSnapshots: true,
        pruneStepMarkers: true,
        pruneToolInputs: true,
        pruneRetryParts: true,
        pruneUserCodeBlocks: false,
        aggressiveFilePrune: true,
        stateQuerySupersede: true,
        truncateOldErrors: false,
    },
    verbose: {
        pruneSourceUrls: false,
        pruneFiles: false,
        pruneSnapshots: false,
        pruneStepMarkers: false,
        pruneToolInputs: false,
        pruneRetryParts: false,
        pruneUserCodeBlocks: false,
        aggressiveFilePrune: false,
        stateQuerySupersede: false,
        truncateOldErrors: false,
    },
} as const

export type PruningPreset = keyof typeof PRUNING_PRESETS

export const AggressivePruningSchema = z.object({
    /** Preset to use as base configuration. Individual flags override preset values. */
    preset: z
        .enum(["compact", "balanced", "verbose"])
        .optional()
        .describe(
            "Preset configuration to use as base. Options: compact (maximum cleanup), balanced (good for most use cases), verbose (minimal cleanup). Individual flags override preset values",
        ),
    /** Prune source-url parts (web search citations) */
    pruneSourceUrls: z
        .boolean()
        .default(true)
        .describe("Prune source-url parts (web search citations) to reduce context size"),
    /** Prune file attachment parts (images, documents) */
    pruneFiles: z
        .boolean()
        .default(true)
        .describe("Prune file attachment parts (images, documents) from old messages"),
    /** Prune snapshot parts, keeping only the latest */
    pruneSnapshots: z
        .boolean()
        .default(true)
        .describe("Prune snapshot parts, keeping only the latest snapshot per file"),
    /** Filter out step-start/step-finish markers entirely */
    pruneStepMarkers: z
        .boolean()
        .default(true)
        .describe("Filter out step-start/step-finish markers entirely from context"),
    /** Strip verbose tool inputs (write/edit content) on supersede */
    pruneToolInputs: z
        .boolean()
        .default(true)
        .describe(
            "Strip verbose tool inputs (write/edit content) when superseded by newer operations",
        ),
    /** Auto-prune retry parts after successful completion */
    pruneRetryParts: z
        .boolean()
        .default(true)
        .describe("Auto-prune retry parts after successful completion of the operation"),
    /** Truncate large code blocks in old user messages */
    pruneUserCodeBlocks: z
        .boolean()
        .default(true)
        .describe("Truncate large code blocks in old user messages to save tokens"),
    /** One-file-one-view: any file op supersedes ALL previous ops on same file */
    aggressiveFilePrune: z
        .boolean()
        .default(true)
        .describe(
            "One-file-one-view: any file operation supersedes ALL previous operations on the same file",
        ),
    /** State query supersede: ls, find, pwd, git status - keep only latest */
    stateQuerySupersede: z
        .boolean()
        .default(true)
        .describe(
            "State query supersede: ls, find, pwd, git status - keep only the latest execution",
        ),
    /** Truncate old error outputs to first line only */
    truncateOldErrors: z
        .boolean()
        .default(true)
        .describe("Truncate old error outputs to first line only, removing stack traces"),
})

export const StrategiesSchema = z.object({
    purgeErrors: PurgeErrorsSchema,
    aggressivePruning: AggressivePruningSchema,
})

export const PluginConfigSchema = z.object({
    enabled: z.boolean().default(true).describe("Enable or disable the ACP plugin entirely"),
    debug: z.boolean().default(false).describe("Enable debug logging for troubleshooting"),
    pruneNotification: z
        .enum(["off", "minimal", "detailed"])
        .default("minimal")
        .describe(
            "Level of notification shown when pruning occurs: off (silent), minimal (summary), detailed (verbose)",
        ),
    commands: CommandsSchema,
    protectedFilePatterns: z
        .array(z.string())
        .default([
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
        ])
        .describe(
            "Glob patterns for files that should be protected from pruning (e.g., '**/*.config.ts'). Default includes env files, credentials, and config files",
        ),
    tools: ToolsSchema,
    strategies: StrategiesSchema,
})

export type DiscardTool = z.infer<typeof DiscardToolSchema>
export type DistillTool = z.infer<typeof DistillToolSchema>
export type ToolSettings = z.infer<typeof ToolSettingsSchema>
export type TodoReminder = z.infer<typeof TodoReminderSchema>
export type AutomataMode = z.infer<typeof AutomataModeSchema>
export type Tools = z.infer<typeof ToolsSchema>
export type Commands = z.infer<typeof CommandsSchema>
export type PurgeErrors = z.infer<typeof PurgeErrorsSchema>
export type AggressivePruning = z.infer<typeof AggressivePruningSchema>
export type Strategies = z.infer<typeof StrategiesSchema>
export type PluginConfig = z.infer<typeof PluginConfigSchema>
