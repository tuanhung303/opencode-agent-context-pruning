import type { PluginConfig } from "./schema.js"

/**
 * Default configuration values
 * Extracted from config.ts
 */

/**
 * Tools that should never be pruned.
 *
 * - `context_info`: Synthetic tool used to inject prunable-tools context
 *   for DeepSeek/Kimi models. Must be protected to prevent self-pruning
 *   which would break the context management feedback loop.
 *   See lib/messages/utils.ts createSyntheticToolPart()
 */
export const DEFAULT_PROTECTED_TOOLS = [
    "context_info", // Synthetic tool for context injection
    "task",
    "todowrite",
    "todoread",
    "discard_tool",
    "discard_msg",
    "distill_tool",
    "distill_msg",
    "restore_tool",
    "restore_msg",
    "context",
    "batch",
    "write",
    "edit",
    "plan_enter",
    "plan_exit",
] as const

export const DEFAULT_CONFIG: PluginConfig = {
    enabled: true,
    debug: false,
    pruneNotification: "minimal",
    autoPruneAfterTool: false,
    commands: {
        enabled: true,
        protectedTools: [...DEFAULT_PROTECTED_TOOLS],
    },
    turnProtection: {
        enabled: false,
        turns: 4,
    },
    protectedFilePatterns: [
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
    ],
    tools: {
        settings: {
            protectedTools: [...DEFAULT_PROTECTED_TOOLS],
            enableAssistantMessagePruning: true,
            enableReasoningPruning: true,
        },
        discard: {
            enabled: true,
        },
        distill: {
            enabled: true,
            showDistillation: false,
        },
        todoReminder: {
            enabled: true,
            initialTurns: 8,
            repeatTurns: 4,
            stuckTaskTurns: 12,
        },
        automataMode: {
            enabled: true,
            initialTurns: 8,
        },
    },
    strategies: {
        purgeErrors: {
            enabled: false,
            turns: 4,
            protectedTools: [],
        },
        truncation: {
            enabled: false,
            maxTokens: 2000,
            headRatio: 0.4,
            tailRatio: 0.4,
            minTurnsOld: 2,
            targetTools: ["read", "grep", "glob", "bash"],
        },
        thinkingCompression: {
            enabled: false,
            minTurnsOld: 3,
            maxTokens: 500,
        },
    },
}
