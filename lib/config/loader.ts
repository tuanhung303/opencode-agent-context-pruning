import { z } from "zod"
import { PluginConfigSchema, type PluginConfig } from "./schema.js"
import { DEFAULT_CONFIG } from "./defaults.js"
import { Logger } from "../logger.js"

const logger = new Logger(false)

/**
 * Configuration loader with validation
 * Extracted from config.ts
 */

const CONFIG_FILE_NAME = "opencode.json"

let configCache: PluginConfig | null = null

/**
 * Load and validate configuration from a file path
 */
export async function loadConfigFromFile(configPath: string): Promise<PluginConfig> {
    try {
        const configModule = await import(configPath)
        const rawConfig = configModule.default || configModule
        return validateConfig(rawConfig)
    } catch (error) {
        logger.warn(`Failed to load config from ${configPath}, using defaults`)
        return DEFAULT_CONFIG
    }
}

/**
 * Load configuration from a directory
 */
export async function loadConfigFromDir(workspaceRoot: string): Promise<PluginConfig> {
    const configPath = `${workspaceRoot}/${CONFIG_FILE_NAME}`
    return loadConfigFromFile(configPath)
}

/**
 * Validate raw configuration against schema
 */
export function validateConfig(rawConfig: unknown): PluginConfig {
    try {
        return PluginConfigSchema.parse(rawConfig)
    } catch (error) {
        if (error instanceof z.ZodError) {
            const issues = error.issues
                .map((e: z.ZodIssue) => `${e.path.join(".")}: ${e.message}`)
                .join(", ")
            logger.warn(`Config validation failed: ${issues}`)
        } else {
            logger.warn(`Config validation failed: ${String(error)}`)
        }
        return DEFAULT_CONFIG
    }
}

/**
 * Get cached configuration
 */
export function getConfig(): PluginConfig {
    if (!configCache) {
        configCache = DEFAULT_CONFIG
    }
    return configCache
}

/**
 * Set cached configuration
 */
export function setConfig(config: PluginConfig): void {
    configCache = config
}

/**
 * Invalidate configuration cache
 */
export function invalidateConfig(): void {
    configCache = null
}
