import { describe, it, expect } from "vitest"
import {
    createMockClient,
    createMockLogger,
    createMockConfig,
    createMockState,
    registerToolCall,
    registerMessagePart,
    registerReasoningPart,
} from "./mock-client"

describe("createMockClient", () => {
    it("returns a client with all required SDK methods", () => {
        const client = createMockClient()

        // Session methods
        expect(client.session.messages).toBeDefined()
        expect(client.session.get).toBeDefined()
        expect(client.session.create).toBeDefined()

        // Config methods
        expect(client.config.providers).toBeDefined()

        // Permission methods
        expect(client.permission.respond).toBeDefined()
        expect(client.permission.reply).toBeDefined()

        // App methods
        expect(client.app.agents).toBeDefined()

        // Command methods
        expect(client.command.list).toBeDefined()

        // MCP methods
        expect(client.mcp.add).toBeDefined()
    })

    it("session.messages returns default messages", async () => {
        const client = createMockClient()
        const result = await client.session.messages({ sessionID: "test" })

        expect(result.data).toHaveLength(1)
        expect(result.data[0].info.role).toBe("assistant")
        expect(result.data[0].parts[0].type).toBe("text")
    })

    it("accepts custom messages", async () => {
        const customMessages = [
            {
                info: { id: "custom_1", role: "user", time: { created: 123 } },
                parts: [{ type: "text", text: "Custom message" }],
            },
            {
                info: { id: "custom_2", role: "assistant", time: { created: 456 } },
                parts: [{ type: "text", text: "Custom response" }],
            },
        ]

        const client = createMockClient({ messages: customMessages })
        const result = await client.session.messages({ sessionID: "test" })

        expect(result.data).toHaveLength(2)
        expect(result.data[0].info.id).toBe("custom_1")
        expect(result.data[1].parts[0].text).toBe("Custom response")
    })

    it("methods are callable and return promises", async () => {
        const client = createMockClient()

        const sessionResult = await client.session.get({ sessionID: "test" })
        expect(sessionResult.data.id).toBe("test-session")

        const createResult = await client.session.create({})
        expect(createResult.data.id).toBe("new-session")

        const providersResult = await client.config.providers()
        expect(providersResult.data.providers).toHaveLength(1)

        const agentsResult = await client.app.agents()
        expect(agentsResult.data[0].name).toBe("build")
    })
})

describe("createMockLogger", () => {
    it("returns a logger with all log levels", () => {
        const logger = createMockLogger()

        expect(logger.info).toBeDefined()
        expect(logger.debug).toBeDefined()
        expect(logger.warn).toBeDefined()
        expect(logger.error).toBeDefined()
    })

    it("log methods are callable", () => {
        const logger = createMockLogger()

        // Should not throw
        logger.info("test info")
        logger.debug("test debug")
        logger.warn("test warn")
        logger.error("test error")

        expect(logger.info).toHaveBeenCalledWith("test info")
        expect(logger.debug).toHaveBeenCalledWith("test debug")
        expect(logger.warn).toHaveBeenCalledWith("test warn")
        expect(logger.error).toHaveBeenCalledWith("test error")
    })
})

describe("createMockConfig", () => {
    it("returns default config with required fields", () => {
        const config = createMockConfig()

        expect(config.enabled).toBe(true)
        expect(config.tools.settings.protectedTools).toContain("task")
        expect(config.tools.discard.enabled).toBe(true)
        expect(config.tools.distill.enabled).toBe(true)
    })

    it("accepts overrides", () => {
        const config = createMockConfig({ enabled: false })

        expect(config.enabled).toBe(false)
        expect(config.tools.settings.protectedTools).toContain("task")
    })
})

describe("createMockState", () => {
    it("returns a valid SessionState with all required fields", () => {
        const state = createMockState()

        expect(state.sessionId).toBe("test-session")
        expect(state.isSubAgent).toBe(false)
        expect(state.prune.toolIds).toEqual([])
        expect(state.prune.messagePartIds).toEqual([])
        expect(state.prune.reasoningPartIds).toEqual([])
        expect(state.toolParameters).toBeInstanceOf(Map)
        expect(state.hashRegistry.calls).toBeInstanceOf(Map)
        expect(state.hashRegistry.callIds).toBeInstanceOf(Map)
        expect(state.hashRegistry.messages).toBeInstanceOf(Map)
        expect(state.hashRegistry.messagePartIds).toBeInstanceOf(Map)
        expect(state.hashRegistry.reasoning).toBeInstanceOf(Map)
        expect(state.hashRegistry.reasoningPartIds).toBeInstanceOf(Map)
        expect(state.hashRegistry.fileParts).toBeInstanceOf(Map)
        expect(state.cursors.todo).toBeDefined()
        expect(state.cursors.context).toBeDefined()
        expect(state.cursors.automata).toBeDefined()
        expect(state.cursors.files).toBeDefined()
        expect(state.cursors.urls).toBeDefined()
        expect(state.cursors.stateQueries).toBeDefined()
        expect(state.cursors.snapshots).toBeDefined()
        expect(state.cursors.retries).toBeDefined()
        expect(state.todos).toEqual([])
    })

    it("accepts overrides", () => {
        const state = createMockState({
            sessionId: "custom-session",
            isSubAgent: true,
            currentTurn: 5,
        })

        expect(state.sessionId).toBe("custom-session")
        expect(state.isSubAgent).toBe(true)
        expect(state.currentTurn).toBe(5)
    })

    it("has correct stats structure", () => {
        const state = createMockState()

        expect(state.stats.strategyStats.autoSupersede.hash).toEqual({ count: 0, tokens: 0 })
        expect(state.stats.strategyStats.autoSupersede.file).toEqual({ count: 0, tokens: 0 })
        expect(state.stats.strategyStats.autoSupersede.todo).toEqual({ count: 0, tokens: 0 })
        expect(state.stats.strategyStats.autoSupersede.context).toEqual({ count: 0, tokens: 0 })
        expect(state.stats.strategyStats.autoSupersede.url).toEqual({ count: 0, tokens: 0 })
        expect(state.stats.strategyStats.autoSupersede.stateQuery).toEqual({ count: 0, tokens: 0 })
        expect(state.stats.strategyStats.autoSupersede.snapshot).toEqual({ count: 0, tokens: 0 })
        expect(state.stats.strategyStats.autoSupersede.retry).toEqual({ count: 0, tokens: 0 })
        expect(state.stats.strategyStats.manualDiscard.message).toEqual({ count: 0, tokens: 0 })
        expect(state.stats.strategyStats.manualDiscard.thinking).toEqual({ count: 0, tokens: 0 })
        expect(state.stats.strategyStats.manualDiscard.tool).toEqual({ count: 0, tokens: 0 })
    })
})

describe("registerToolCall", () => {
    it("registers a tool call with hash in state", () => {
        const state = createMockState()

        registerToolCall(state, "call_123", "abc123", "read", 1, { filePath: "/test" })

        expect(state.hashRegistry.calls.get("abc123")).toBe("call_123")
        expect(state.hashRegistry.callIds.get("call_123")).toBe("abc123")
        expect(state.toolParameters.get("call_123")).toEqual({
            tool: "read",
            turn: 1,
            parameters: { filePath: "/test" },
            status: "completed",
        })
    })

    it("uses default turn and parameters", () => {
        const state = createMockState()

        registerToolCall(state, "call_456", "def456", "grep")

        const entry = state.toolParameters.get("call_456")
        expect(entry?.turn).toBe(1)
        expect(entry?.parameters).toEqual({})
    })
})

describe("registerMessagePart", () => {
    it("registers a message part with hash in state", () => {
        const state = createMockState()

        registerMessagePart(state, "msg_1", 0, "aaa111")

        expect(state.hashRegistry.messages.get("aaa111")).toBe("msg_1:0")
        expect(state.hashRegistry.messagePartIds.get("msg_1:0")).toBe("aaa111")
    })

    it("handles multiple parts in same message", () => {
        const state = createMockState()

        registerMessagePart(state, "msg_1", 0, "part0hash")
        registerMessagePart(state, "msg_1", 1, "part1hash")
        registerMessagePart(state, "msg_1", 2, "part2hash")

        expect(state.hashRegistry.messages.get("part0hash")).toBe("msg_1:0")
        expect(state.hashRegistry.messages.get("part1hash")).toBe("msg_1:1")
        expect(state.hashRegistry.messages.get("part2hash")).toBe("msg_1:2")
    })
})

describe("registerReasoningPart", () => {
    it("registers a reasoning part with hash in state", () => {
        const state = createMockState()

        registerReasoningPart(state, "msg_1", 0, "think123")

        expect(state.hashRegistry.reasoning.get("think123")).toBe("msg_1:0")
        expect(state.hashRegistry.reasoningPartIds.get("msg_1:0")).toBe("think123")
    })
})
