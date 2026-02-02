import { describe, it, expect, beforeEach, vi } from "vitest"
import type { SessionState, WithParts } from "../lib/state/index.js"
import type { PluginConfig } from "../lib/config.js"
import type { OpenCodeClient } from "../lib/client.js"
import {
    createSystemPromptHandler,
    createChatMessageTransformHandler,
    createToolExecuteAfterHandler,
} from "../lib/hooks.js"

// Mock dependencies
vi.mock("../lib/prompts", () => ({
    loadPrompt: vi.fn((name: string) => `Mocked prompt: ${name}`),
}))

vi.mock("../lib/strategies", () => ({
    deduplicate: vi.fn(),
    supersedeWrites: vi.fn(),
    purgeErrors: vi.fn(),
    truncateLargeOutputs: vi.fn(),
    compressThinkingBlocks: vi.fn(),
}))

vi.mock("../lib/messages", () => ({
    prune: vi.fn(),
    injectHashesIntoToolOutputs: vi.fn(),
    injectHashesIntoAssistantMessages: vi.fn(),
    injectTodoReminder: vi.fn(),
}))

vi.mock("../lib/state", () => ({
    checkSession: vi.fn(),
    ensureSessionInitialized: vi.fn(),
}))

vi.mock("../lib/state/tool-cache", () => ({
    syncToolCache: vi.fn(),
}))

vi.mock("../lib/state/persistence", () => ({
    saveSessionState: vi.fn(),
}))

vi.mock("../lib/ui/notification", () => ({
    sendUnifiedNotification: vi.fn(),
}))

vi.mock("../lib/strategies/utils", () => ({
    getCurrentParams: vi.fn(() => ({})),
}))

const createMockLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    saveContext: vi.fn(),
})

const createMockClient = (): OpenCodeClient => ({
    session: {
        messages: vi.fn().mockResolvedValue({
            data: [],
        }),
    },
})

const createMockConfig = (): PluginConfig => ({
    enabled: true,
    debug: false,
    pruneNotification: "minimal",
    autoPruneAfterTool: true,
    commands: {
        enabled: true,
        protectedTools: [],
    },
    turnProtection: {
        enabled: false,
        turns: 4,
    },
    protectedFilePatterns: [],
    tools: {
        settings: {
            protectedTools: [],
            enableAssistantMessagePruning: true,
            minAssistantTextLength: 100,
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
        },
    },
    strategies: {
        deduplication: {
            enabled: true,
            protectedTools: [],
        },
        supersedeWrites: {
            enabled: false,
        },
        purgeErrors: {
            enabled: true,
            turns: 4,
            protectedTools: [],
        },
        truncation: {
            enabled: true,
            maxTokens: 2000,
            headRatio: 0.4,
            tailRatio: 0.4,
            minTurnsOld: 2,
            targetTools: ["read", "grep", "glob", "bash"],
        },
        thinkingCompression: {
            enabled: true,
            minTurnsOld: 3,
            maxTokens: 500,
        },
    },
})

const createMockState = (): SessionState => ({
    sessionId: null,
    isSubAgent: false,
    prune: {
        toolIds: [],
        messagePartIds: [],
    },
    stats: {
        pruneTokenCounter: 0,
        totalPruneTokens: 0,
        pruneMessageCounter: 0,
        totalPruneMessages: 0,
        strategyStats: {
            deduplication: { count: 0, tokens: 0 },
            supersedeWrites: { count: 0, tokens: 0 },
            purgeErrors: { count: 0, tokens: 0 },
            manualDiscard: { count: 0, tokens: 0 },
            distillation: { count: 0, tokens: 0 },
            truncation: { count: 0, tokens: 0 },
            thinkingCompression: { count: 0, tokens: 0 },
        },
    },
    toolParameters: new Map(),
    lastToolPrune: false,
    lastCompaction: 0,
    currentTurn: 0,
    lastDiscardStats: null,
    lastUserMessageId: null,
    hashToCallId: new Map(),
    callIdToHash: new Map(),
    discardHistory: [],
    hashToMessagePart: new Map(),
    messagePartToHash: new Map(),
    softPrunedTools: new Map(),
    softPrunedMessageParts: new Map(),
    softPrunedMessages: new Map(),
    lastTodoTurn: 0,
    lastReminderTurn: 0,
    lastTodowriteCallId: null,
    todos: [],
})

describe("createSystemPromptHandler", () => {
    let mockState: SessionState
    let mockLogger: ReturnType<typeof createMockLogger>
    let mockConfig: PluginConfig

    beforeEach(() => {
        mockState = createMockState()
        mockLogger = createMockLogger()
        mockConfig = createMockConfig()
        vi.clearAllMocks()
    })

    it("should skip injection for sub-agents", async () => {
        mockState.isSubAgent = true
        const handler = createSystemPromptHandler(
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
        )
        const output = { system: [] }

        await handler({}, output)

        expect(output.system).toHaveLength(0)
    })

    it("should skip injection for internal agents", async () => {
        const handler = createSystemPromptHandler(
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
        )
        const output = { system: ["You are a title generator"] }

        await handler({}, output)

        expect(output.system).toHaveLength(1)
        expect(mockLogger.info).toHaveBeenCalledWith(
            "Skipping ACP system prompt injection for internal agent",
        )
    })

    it("should add both prompt when both tools enabled", async () => {
        const handler = createSystemPromptHandler(
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
        )
        const output = { system: [] }

        await handler({}, output)

        expect(output.system).toHaveLength(1)
        expect(output.system[0]).toContain("system/system-prompt-both")
    })

    it("should add discard-only prompt when only discard enabled", async () => {
        mockConfig.tools.distill.enabled = false
        const handler = createSystemPromptHandler(
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
        )
        const output = { system: [] }

        await handler({}, output)

        expect(output.system).toHaveLength(1)
        expect(output.system[0]).toContain("system/system-prompt-discard")
    })

    it("should add distill-only prompt when only distill enabled", async () => {
        mockConfig.tools.discard.enabled = false
        const handler = createSystemPromptHandler(
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
        )
        const output = { system: [] }

        await handler({}, output)

        expect(output.system).toHaveLength(1)
        expect(output.system[0]).toContain("system/system-prompt-distill")
    })

    it("should not add prompt when both tools disabled", async () => {
        mockConfig.tools.discard.enabled = false
        mockConfig.tools.distill.enabled = false
        const handler = createSystemPromptHandler(
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
        )
        const output = { system: [] }

        await handler({}, output)

        expect(output.system).toHaveLength(0)
    })
})

describe("createChatMessageTransformHandler", () => {
    let mockClient: OpenCodeClient
    let mockState: SessionState
    let mockLogger: ReturnType<typeof createMockLogger>
    let mockConfig: PluginConfig

    beforeEach(() => {
        mockClient = createMockClient()
        mockState = createMockState()
        mockLogger = createMockLogger()
        mockConfig = createMockConfig()
        vi.clearAllMocks()
    })

    it("should check session on message transform", async () => {
        const { checkSession } = await import("../lib/state/index.js")
        const handler = createChatMessageTransformHandler(
            mockClient,
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
        )
        const output = { messages: [] }

        await handler({}, output)

        expect(checkSession).toHaveBeenCalledWith(
            mockClient,
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            output.messages,
        )
    })

    it("should skip processing for sub-agents", async () => {
        mockState.isSubAgent = true
        const { checkSession } = await import("../lib/state/index.js")
        const handler = createChatMessageTransformHandler(
            mockClient,
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
        )
        const output = { messages: [] }

        await handler({}, output)

        expect(checkSession).toHaveBeenCalled()
        // Should not process further for sub-agents
    })

    it("should save context after processing", async () => {
        mockState.sessionId = "test-session"
        const handler = createChatMessageTransformHandler(
            mockClient,
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
        )
        const output = { messages: [] }

        await handler({}, output)

        expect(mockLogger.saveContext).toHaveBeenCalledWith("test-session", output.messages)
    })
})

describe("createToolExecuteAfterHandler", () => {
    let mockClient: OpenCodeClient
    let mockState: SessionState
    let mockLogger: ReturnType<typeof createMockLogger>
    let mockConfig: PluginConfig

    beforeEach(() => {
        mockClient = createMockClient()
        mockState = createMockState()
        mockLogger = createMockLogger()
        mockConfig = createMockConfig()
        vi.clearAllMocks()
    })

    it("should return early when plugin disabled", async () => {
        mockConfig.enabled = false
        const handler = createToolExecuteAfterHandler(
            mockClient,
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
            "/test",
        )

        await handler(
            { tool: "read", sessionID: "test-session", callID: "call_1" },
            { title: "", output: "", metadata: {} },
        )

        expect(mockClient.session.messages).not.toHaveBeenCalled()
    })

    it("should return early when autoPruneAfterTool disabled", async () => {
        mockConfig.autoPruneAfterTool = false
        const handler = createToolExecuteAfterHandler(
            mockClient,
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
            "/test",
        )

        await handler(
            { tool: "read", sessionID: "test-session", callID: "call_1" },
            { title: "", output: "", metadata: {} },
        )

        expect(mockClient.session.messages).not.toHaveBeenCalled()
    })

    it("should return early for sub-agents", async () => {
        mockState.isSubAgent = true
        const handler = createToolExecuteAfterHandler(
            mockClient,
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
            "/test",
        )

        await handler(
            { tool: "read", sessionID: "test-session", callID: "call_1" },
            { title: "", output: "", metadata: {} },
        )

        expect(mockClient.session.messages).not.toHaveBeenCalled()
    })

    it("should fetch messages and run strategies", async () => {
        const handler = createToolExecuteAfterHandler(
            mockClient,
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
            "/test",
        )

        await handler(
            { tool: "read", sessionID: "test-session", callID: "call_1" },
            { title: "", output: "", metadata: {} },
        )

        expect(mockClient.session.messages).toHaveBeenCalledWith({
            path: { id: "test-session" },
        })
    })

    it("should handle errors gracefully", async () => {
        mockClient.session.messages = vi.fn().mockRejectedValue(new Error("Network error"))
        const handler = createToolExecuteAfterHandler(
            mockClient,
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
            "/test",
        )

        await handler(
            { tool: "read", sessionID: "test-session", callID: "call_1" },
            { title: "", output: "", metadata: {} },
        )

        expect(mockLogger.error).toHaveBeenCalledWith("Error in tool.execute.after handler", {
            error: "Network error",
        })
    })
})

describe("Integration: Message Pipeline", () => {
    let mockClient: OpenCodeClient
    let mockState: SessionState
    let mockLogger: ReturnType<typeof createMockLogger>
    let mockConfig: PluginConfig

    beforeEach(() => {
        mockClient = createMockClient()
        mockState = createMockState()
        mockLogger = createMockLogger()
        mockConfig = createMockConfig()
        vi.clearAllMocks()
    })

    it("should process full message pipeline from system prompt to tool execution", async () => {
        // Step 1: System prompt handler adds context
        const systemHandler = createSystemPromptHandler(
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
        )
        const systemOutput = { system: [] }
        await systemHandler({}, systemOutput)
        expect(systemOutput.system).toHaveLength(1)

        // Step 2: Chat message transform processes messages
        const { checkSession } = await import("../lib/state/index.js")
        const chatHandler = createChatMessageTransformHandler(
            mockClient,
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
        )
        const chatOutput = { messages: [] }
        await chatHandler({}, chatOutput)
        expect(checkSession).toHaveBeenCalled()

        // Step 3: Tool execution after handler runs auto-pruning
        const toolHandler = createToolExecuteAfterHandler(
            mockClient,
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
            "/test",
        )
        await toolHandler(
            { tool: "read", sessionID: "test-session", callID: "call_1" },
            { title: "", output: "", metadata: {} },
        )
        expect(mockClient.session.messages).toHaveBeenCalled()
    })

    it("should handle disabled plugin gracefully", async () => {
        mockConfig.enabled = false

        // System prompt should still work
        const systemHandler = createSystemPromptHandler(
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
        )
        const systemOutput = { system: [] }
        await systemHandler({}, systemOutput)
        expect(systemOutput.system).toHaveLength(1) // Still adds prompt

        // Chat transform should still work
        const chatHandler = createChatMessageTransformHandler(
            mockClient,
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
        )
        const chatOutput = { messages: [] }
        await chatHandler({}, chatOutput)

        // Tool execution should skip
        const toolHandler = createToolExecuteAfterHandler(
            mockClient,
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
            "/test",
        )
        await toolHandler(
            { tool: "read", sessionID: "test-session", callID: "call_1" },
            { title: "", output: "", metadata: {} },
        )
        expect(mockClient.session.messages).not.toHaveBeenCalled()
    })

    it("should handle sub-agent context correctly", async () => {
        mockState.isSubAgent = true

        // System prompt should skip
        const systemHandler = createSystemPromptHandler(
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
        )
        const systemOutput = { system: [] }
        await systemHandler({}, systemOutput)
        expect(systemOutput.system).toHaveLength(0)

        // Tool execution should skip
        const toolHandler = createToolExecuteAfterHandler(
            mockClient,
            mockState,
            mockLogger as unknown as import("../lib/logger.js").Logger,
            mockConfig,
            "/test",
        )
        await toolHandler(
            { tool: "read", sessionID: "test-session", callID: "call_1" },
            { title: "", output: "", metadata: {} },
        )
        expect(mockClient.session.messages).not.toHaveBeenCalled()
    })
})
