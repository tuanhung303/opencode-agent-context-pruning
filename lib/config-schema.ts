/**
 * Zod schema for ACP plugin configuration.
 * Provides runtime validation with clear error messages.
 */

import { z } from "zod"

export const DeduplicationSchema = z.object({
    enabled: z.boolean().optional(),
    protectedTools: z.array(z.string()).optional(),
})

export const DiscardToolSchema = z.object({
    enabled: z.boolean().optional(),
})

export const DistillToolSchema = z.object({
    enabled: z.boolean().optional(),
    showDistillation: z.boolean().optional(),
})

export const ToolSettingsSchema = z.object({
    protectedTools: z.array(z.string()).optional(),
})

export const ToolsSchema = z.object({
    settings: ToolSettingsSchema.optional(),
    discard: DiscardToolSchema.optional(),
    distill: DistillToolSchema.optional(),
})

export const CommandsSchema = z.object({
    enabled: z.boolean().optional(),
    protectedTools: z.array(z.string()).optional(),
})

export const SupersedeWritesSchema = z.object({
    enabled: z.boolean().optional(),
})

export const PurgeErrorsSchema = z.object({
    enabled: z.boolean().optional(),
    turns: z.number().int().positive().optional(),
    protectedTools: z.array(z.string()).optional(),
})

export const TurnProtectionSchema = z.object({
    enabled: z.boolean().optional(),
    turns: z.number().int().positive().optional(),
})

export const StrategiesSchema = z.object({
    deduplication: DeduplicationSchema.optional(),
    supersedeWrites: SupersedeWritesSchema.optional(),
    purgeErrors: PurgeErrorsSchema.optional(),
})

export const PluginConfigSchema = z.object({
    $schema: z.string().optional(),
    enabled: z.boolean().optional(),
    debug: z.boolean().optional(),
    showUpdateToasts: z.boolean().optional(), // Deprecated but kept for backwards compatibility
    pruneNotification: z.enum(["off", "minimal", "detailed"]).optional(),
    commands: CommandsSchema.optional(),
    turnProtection: TurnProtectionSchema.optional(),
    protectedFilePatterns: z.array(z.string()).optional(),
    tools: ToolsSchema.optional(),
    strategies: StrategiesSchema.optional(),
})

export type PluginConfigInput = z.infer<typeof PluginConfigSchema>

/**
 * Validate a config object and return formatted error messages.
 * Returns empty array if valid.
 */
export function validateConfig(config: unknown): string[] {
    const result = PluginConfigSchema.safeParse(config)

    if (result.success) {
        return []
    }

    return result.error.issues.map((issue) => {
        const path = issue.path.join(".")
        return `${path || "root"}: ${issue.message}`
    })
}

/**
 * Get unknown keys that aren't in the schema.
 * Useful for warning about typos in config files.
 */
export function getUnknownKeys(config: Record<string, unknown>): string[] {
    const knownKeys = new Set([
        "$schema",
        "enabled",
        "debug",
        "showUpdateToasts",
        "pruneNotification",
        "commands",
        "turnProtection",
        "protectedFilePatterns",
        "tools",
        "strategies",
    ])

    const unknownKeys: string[] = []

    for (const key of Object.keys(config)) {
        if (!knownKeys.has(key)) {
            unknownKeys.push(key)
        }
    }

    return unknownKeys
}
