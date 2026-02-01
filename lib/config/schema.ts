import { z } from "zod"

/**
 * Schema definitions for plugin configuration
 * Extracted from config-schema.ts and config.ts
 */

export const DeduplicationSchema = z.object({
    enabled: z.boolean().default(true),
    protectedTools: z.array(z.string()).default([]),
})

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
    minAssistantTextLength: z.number().positive().default(100),
})

export const TodoReminderSchema = z.object({
    enabled: z.boolean().default(true),
    initialTurns: z.number().positive().default(8),
    repeatTurns: z.number().positive().default(4),
})

export const ToolsSchema = z.object({
    settings: ToolSettingsSchema,
    discard: DiscardToolSchema,
    distill: DistillToolSchema,
    todoReminder: TodoReminderSchema,
})

export const CommandsSchema = z.object({
    enabled: z.boolean().default(true),
    protectedTools: z.array(z.string()).default([]),
})

export const SupersedeWritesSchema = z.object({
    enabled: z.boolean().default(false),
})

export const PurgeErrorsSchema = z.object({
    enabled: z.boolean().default(true),
    turns: z.number().positive().default(4),
    protectedTools: z.array(z.string()).default([]),
})

export const TruncationSchema = z.object({
    enabled: z.boolean().default(true),
    maxTokens: z.number().positive().default(2000),
    headRatio: z.number().min(0).max(1).default(0.4),
    tailRatio: z.number().min(0).max(1).default(0.4),
    minTurnsOld: z.number().positive().default(2),
    targetTools: z.array(z.string()).default(["read", "grep", "glob", "bash"]),
})

export const ThinkingCompressionSchema = z.object({
    enabled: z.boolean().default(true),
    minTurnsOld: z.number().positive().default(3),
    maxTokens: z.number().positive().default(500),
})

export const TurnProtectionSchema = z.object({
    enabled: z.boolean().default(false),
    turns: z.number().positive().default(4),
})

export const StrategiesSchema = z.object({
    deduplication: DeduplicationSchema,
    supersedeWrites: SupersedeWritesSchema,
    purgeErrors: PurgeErrorsSchema,
    truncation: TruncationSchema,
    thinkingCompression: ThinkingCompressionSchema,
})

export const PluginConfigSchema = z.object({
    enabled: z.boolean().default(true),
    debug: z.boolean().default(false),
    pruneNotification: z.enum(["off", "minimal", "detailed"]).default("minimal"),
    autoPruneAfterTool: z.boolean().default(true),
    commands: CommandsSchema,
    turnProtection: TurnProtectionSchema,
    protectedFilePatterns: z.array(z.string()).default([]),
    tools: ToolsSchema,
    strategies: StrategiesSchema,
})

export type Deduplication = z.infer<typeof DeduplicationSchema>
export type DiscardTool = z.infer<typeof DiscardToolSchema>
export type DistillTool = z.infer<typeof DistillToolSchema>
export type ToolSettings = z.infer<typeof ToolSettingsSchema>
export type TodoReminder = z.infer<typeof TodoReminderSchema>
export type Tools = z.infer<typeof ToolsSchema>
export type Commands = z.infer<typeof CommandsSchema>
export type SupersedeWrites = z.infer<typeof SupersedeWritesSchema>
export type PurgeErrors = z.infer<typeof PurgeErrorsSchema>
export type Truncation = z.infer<typeof TruncationSchema>
export type ThinkingCompression = z.infer<typeof ThinkingCompressionSchema>
export type TurnProtection = z.infer<typeof TurnProtectionSchema>
export type Strategies = z.infer<typeof StrategiesSchema>
export type PluginConfig = z.infer<typeof PluginConfigSchema>
