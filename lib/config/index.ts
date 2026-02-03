import { ConfigService, getGlobalConfigService, resetGlobalConfigService } from "./service.js"
import { DEFAULT_CONFIG } from "./defaults.js"
import { loadConfigFromFile, loadConfigFromDir, validateConfig } from "./loader.js"
import type { PluginConfig } from "./schema.js"

// Re-export everything for backward compatibility and new patterns
export {
    // Service pattern (new)
    ConfigService,
    getGlobalConfigService,
    resetGlobalConfigService,

    // Legacy loader functions
    loadConfigFromFile,
    loadConfigFromDir as loadConfig,
    validateConfig,

    // Constants
    DEFAULT_CONFIG,
}

export type { PluginConfig }

// Legacy type aliases for backward compatibility
export type DiscardTool = import("./schema.js").DiscardTool
export type DistillTool = import("./schema.js").DistillTool
export type ToolSettings = import("./schema.js").ToolSettings
export type TodoReminder = import("./schema.js").TodoReminder
export type Tools = import("./schema.js").Tools
export type Commands = import("./schema.js").Commands
export type PurgeErrors = import("./schema.js").PurgeErrors
export type Truncation = import("./schema.js").Truncation
export type ThinkingCompression = import("./schema.js").ThinkingCompression
