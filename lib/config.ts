// Re-export from modular config structure
export {
    ConfigService,
    getGlobalConfigService,
    resetGlobalConfigService,
    loadConfigFromFile,
    loadConfig,
    validateConfig,
    DEFAULT_CONFIG,
} from "./config/index.js"

export type {
    PluginConfig,
    DiscardTool,
    DistillTool,
    ToolSettings,
    TodoReminder,
    Tools,
    Commands,
    PurgeErrors,
} from "./config/index.js"
