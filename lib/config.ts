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
    Deduplication,
    DiscardTool,
    DistillTool,
    ToolSettings,
    TodoReminder,
    Tools,
    Commands,
    SupersedeWrites,
    PurgeErrors,
    Truncation,
    ThinkingCompression,
} from "./config/index.js"
