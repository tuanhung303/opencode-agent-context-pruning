import { readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import type { PluginConfig } from "./config"
import { ConfigService } from "./config"

interface ConfigCacheEntry {
    config: PluginConfig
    mtime: number
    cachedAt: number
}

let configCache: ConfigCacheEntry | null = null
let lastCtx: PluginInput | null = null
let configPaths: string[] = []

/**
 * Get config with caching and hot-reload on file change
 * Singleton pattern - returns cached instance unless config file changed
 */
export function getConfigCached(ctx: PluginInput): PluginConfig {
    const now = Date.now()

    // Check if context changed (different directory)
    if (lastCtx?.directory !== ctx.directory) {
        configCache = null
        configPaths = []
    }
    lastCtx = ctx

    // Get config file paths to watch
    const paths = getConfigPaths(ctx)
    configPaths = [paths.global, paths.configDir, paths.project].filter(
        (p): p is string => p !== null,
    )

    // Check if cache is valid (files unchanged)
    if (configCache) {
        let cacheValid = true
        for (const path of configPaths) {
            try {
                const stats = statSync(path)
                if (stats.mtimeMs > configCache.mtime) {
                    cacheValid = false
                    break
                }
            } catch {
                // File deleted or unreadable
                cacheValid = false
                break
            }
        }

        if (cacheValid) {
            configCache.cachedAt = now
            return configCache.config
        }
    }

    // Load fresh config
    const configService = new ConfigService()
    const config = configService.load(ctx.directory)
    let maxMtime = 0

    for (const path of configPaths) {
        try {
            const stats = statSync(path)
            if (stats.mtimeMs > maxMtime) {
                maxMtime = stats.mtimeMs
            }
        } catch {
            // Ignore
        }
    }

    configCache = {
        config,
        mtime: maxMtime,
        cachedAt: now,
    }

    return config
}

/**
 * Force invalidate config cache
 */
export function invalidateConfigCache(): void {
    configCache = null
}

/**
 * Get config file paths being watched
 */
export function getWatchedConfigPaths(): string[] {
    return [...configPaths]
}

interface ConfigPaths {
    global: string | null
    configDir: string | null
    project: string | null
}

function getConfigPaths(ctx: PluginInput): ConfigPaths {
    // Import from config.ts to reuse path logic
    const { getConfigPaths: originalGetConfigPaths } = require("./config")
    return originalGetConfigPaths(ctx)
}
