import { z } from "zod"

/**
 * Schema definitions for plugin configuration
 * Extracted from config-schema.ts and config.ts
 */

export const DiscardToolSchema = z.object({
    enabled: z.boolean().default(true),
})

export const DistillToolSchema = z.object({
    enabled: z.boolean().default(true),
    showDistillation: z.boolean().default(false),
})

export const ToolSettingsSchema = z.object({
    protectedTools: z.array(z.string()).default([]),
    enableAssistantMessagePruning: z.boolean().default(true),
    enableReasoningPruning: z.boolean().default(true),
})

export const TodoReminderSchema = z.object({
    enabled: z.boolean().default(true),
    initialTurns: z.number().positive().default(8),
    repeatTurns: z.number().positive().default(4),
    stuckTaskTurns: z.number().positive().default(12),
})

export const AutomataModeSchema = z.object({
    enabled: z.boolean().default(true),
    initialTurns: z.number().positive().default(8),
})

export const ToolsSchema = z.object({
    settings: ToolSettingsSchema,
    discard: DiscardToolSchema,
    distill: DistillToolSchema,
    todoReminder: TodoReminderSchema,
    automataMode: AutomataModeSchema,
})

export const CommandsSchema = z.object({
    enabled: z.boolean().default(true),
    protectedTools: z.array(z.string()).default([]),
})

export const PurgeErrorsSchema = z.object({
    enabled: z.boolean().default(false),
    turns: z.number().positive().default(4),
    protectedTools: z.array(z.string()).default([]),
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
    preset: z.enum(["compact", "balanced", "verbose"]).optional(),
    /** Prune source-url parts (web search citations) */
    pruneSourceUrls: z.boolean().default(true),
    /** Prune file attachment parts (images, documents) */
    pruneFiles: z.boolean().default(true),
    /** Prune snapshot parts, keeping only the latest */
    pruneSnapshots: z.boolean().default(true),
    /** Filter out step-start/step-finish markers entirely */
    pruneStepMarkers: z.boolean().default(true),
    /** Strip verbose tool inputs (write/edit content) on supersede */
    pruneToolInputs: z.boolean().default(true),
    /** Auto-prune retry parts after successful completion */
    pruneRetryParts: z.boolean().default(true),
    /** Truncate large code blocks in old user messages */
    pruneUserCodeBlocks: z.boolean().default(true),
    /** One-file-one-view: any file op supersedes ALL previous ops on same file */
    aggressiveFilePrune: z.boolean().default(true),
    /** State query supersede: ls, find, pwd, git status - keep only latest */
    stateQuerySupersede: z.boolean().default(true),
    /** Truncate old error outputs to first line only */
    truncateOldErrors: z.boolean().default(true),
})

export const StrategiesSchema = z.object({
    purgeErrors: PurgeErrorsSchema,
    aggressivePruning: AggressivePruningSchema,
})

export const PluginConfigSchema = z.object({
    enabled: z.boolean().default(true),
    debug: z.boolean().default(false),
    pruneNotification: z.enum(["off", "minimal", "detailed"]).default("minimal"),
    commands: CommandsSchema,
    protectedFilePatterns: z.array(z.string()).default([]),
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
