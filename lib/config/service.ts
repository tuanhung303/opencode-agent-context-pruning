import { DEFAULT_CONFIG } from "./defaults.js"
import { loadConfigFromFile } from "./loader.js"
import type { PluginConfig } from "./schema.js"

/**
 * Configuration Service with explicit lifecycle management.
 *
 * This service handles:
 * - Loading configuration from files
 * - Caching loaded configuration
 * - Providing access to current configuration
 * - Supporting hot-reload scenarios
 *
 * Usage:
 * ```typescript
 * const configService = new ConfigService()
 * await configService.load(workspaceRoot)
 * const config = configService.get()
 * ```
 */
export class ConfigService {
    private config: PluginConfig | null = null
    private workspaceRoot: string | null = null

    /**
     * Load configuration from workspace directory.
     * Loads and merges global + project configs with defaults.
     */
    load(workspaceRoot: string): PluginConfig {
        this.workspaceRoot = workspaceRoot
        const configPath = `${workspaceRoot}/opencode.json`

        this.config = loadConfigFromFile(configPath)

        return this.config
    }

    /**
     * Get current configuration.
     * Throws if load() hasn't been called.
     */
    get(): PluginConfig {
        if (!this.config) {
            throw new Error("ConfigService: Configuration not loaded. Call load() first.")
        }
        return this.config
    }

    /**
     * Get configuration or return defaults if not loaded.
     * Safe for scenarios where config might not be initialized.
     */
    getOrDefault(): PluginConfig {
        return this.config ?? DEFAULT_CONFIG
    }

    /**
     * Check if configuration has been loaded.
     */
    isLoaded(): boolean {
        return this.config !== null
    }

    /**
     * Reload configuration from disk.
     * Useful for hot-reload scenarios.
     */
    reload(): PluginConfig {
        if (!this.workspaceRoot) {
            throw new Error("ConfigService: Cannot reload - workspace root not set")
        }
        return this.load(this.workspaceRoot)
    }

    /**
     * Reset to unloaded state.
     * Useful for testing.
     */
    reset(): void {
        this.config = null
        this.workspaceRoot = null
    }
}

/**
 * Global config service instance for singleton pattern.
 *
 * Note: Prefer injecting ConfigService for testability.
 * This global is provided for convenience in simple scenarios.
 */
let globalConfigService: ConfigService | null = null

/**
 * Get or create global config service instance.
 */
export function getGlobalConfigService(): ConfigService {
    if (!globalConfigService) {
        globalConfigService = new ConfigService()
    }
    return globalConfigService
}

/**
 * Reset global config service (useful for testing).
 */
export function resetGlobalConfigService(): void {
    globalConfigService = null
}
