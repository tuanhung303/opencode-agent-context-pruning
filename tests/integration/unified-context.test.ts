import { describe, it, expect, beforeEach, vi } from "vitest"

// Mock dependencies
vi.mock("@opencode-ai/plugin", () => {
    const schema: any = {
        string: vi.fn(() => schema),
        array: vi.fn(() => schema),
        union: vi.fn(() => schema),
        tuple: vi.fn(() => schema),
        enum: vi.fn(() => schema),
        describe: vi.fn(() => schema),
    }
    const toolMock: any = vi.fn((spec) => ({
        ...spec,
        execute: spec.execute,
    }))
    toolMock.schema = schema
    return {
        tool: toolMock,
    }
})

vi.mock("../../lib/prompts", () => ({
    loadPrompt: vi.fn((name: string) => `Mocked prompt: ${name}`),
}))

import { createContextTool } from "../../lib/strategies/context"
import type { SessionState } from "../../lib/state/types"
import type { PluginConfig } from "../../lib/config"

describe("Unified Context Tool Integration", () => {
    let mockState: SessionState
    let mockLogger: any
    let mockConfig: PluginConfig
    let mockClient: any
    let mockToolCtx: any

    beforeEach(() => {
        mockLogger = {
            info: vi.fn(),
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        }

        mockConfig = {
            enabled: true,
            tools: {
                settings: {
                    protectedTools: ["task"],
                },
                discard: { enabled: true },
                distill: { enabled: true },
            },
        } as any

        mockState = {
            sessionId: "test-session",
            prune: {
                toolIds: [],
                messagePartIds: [],
                reasoningPartIds: [],
            },
            toolParameters: new Map(),
            hashRegistry: {
                calls: new Map(),
                callIds: new Map(),
                messages: new Map(),
                messagePartIds: new Map(),
                reasoning: new Map(),
                reasoningPartIds: new Map(),
            },
            discardHistory: [],
            lastCompaction: 0,
            stats: {
                pruneTokenCounter: 0,
                totalPruneTokens: 0,
                pruneMessageCounter: 0,
                totalPruneMessages: 0,
                strategyStats: {
                    autoSupersede: {
                        hash: { count: 0, tokens: 0 },
                        file: { count: 0, tokens: 0 },
                        todo: { count: 0, tokens: 0 },
                        context: { count: 0, tokens: 0 },
                    },
                    purgeErrors: { count: 0, tokens: 0 },
                    manualDiscard: {
                        message: { count: 0, tokens: 0 },
                        thinking: { count: 0, tokens: 0 },
                        tool: { count: 0, tokens: 0 },
                    },
                    distillation: { count: 0, tokens: 0 },
                },
            },
        } as any

        mockClient = {
            session: {
                messages: vi.fn().mockResolvedValue({
                    data: [
                        {
                            info: { id: "msg_1", role: "assistant", time: { created: Date.now() } },
                            parts: [
                                {
                                    type: "text",
                                    text: "Let me explain the architecture in detail.",
                                },
                            ],
                        },
                    ],
                }),
            },
        }

        mockToolCtx = { sessionID: "test-session" }
    })

    it("should discard a message by hash", async () => {
        // Setup: Pre-inject a hash for the message
        mockState.hashRegistry.messages.set("a1b2c3", "msg_1:0")
        mockState.hashRegistry.messagePartIds.set("msg_1:0", "a1b2c3")

        const tool = createContextTool({
            client: mockClient,
            state: mockState,
            logger: mockLogger,
            config: mockConfig,
            workingDirectory: "/test",
        })

        // Discard by hash
        const discardResult = await tool.execute(
            {
                action: "discard",
                targets: [["a1b2c3"]],
            },
            mockToolCtx,
        )

        expect(discardResult).toContain("💬")
        expect(mockState.prune.messagePartIds).toContain("msg_1:0")
    })

    it("should handle mixed targets (tool hash + message hash) in a single call", async () => {
        // Setup a tool in state
        mockState.hashRegistry.calls.set("abc123", "call_1")
        mockState.hashRegistry.callIds.set("call_1", "abc123")
        mockState.toolParameters.set("call_1", { tool: "read", turn: 1, parameters: {} } as any)

        // Setup a message hash
        mockState.hashRegistry.messages.set("d4e5f6", "msg_1:0")
        mockState.hashRegistry.messagePartIds.set("msg_1:0", "d4e5f6")

        const tool = createContextTool({
            client: mockClient,
            state: mockState,
            logger: mockLogger,
            config: mockConfig,
            workingDirectory: "/test",
        })

        const result = await tool.execute(
            {
                action: "discard",
                targets: [["abc123"], ["d4e5f6"]],
            },
            mockToolCtx,
        )

        expect(result).toContain("discard")
        expect(result).toContain("💬")
        expect(mockState.prune.toolIds).toContain("call_1")
        expect(mockState.prune.messagePartIds).toContain("msg_1:0")
    })

    it("should discard multiple tools by individual hashes", async () => {
        // Setup multiple tools in state
        mockState.hashRegistry.calls.set("abc123", "call_1")
        mockState.hashRegistry.calls.set("def456", "call_2")
        mockState.hashRegistry.calls.set("567890", "call_3")
        mockState.hashRegistry.callIds.set("call_1", "abc123")
        mockState.hashRegistry.callIds.set("call_2", "def456")
        mockState.hashRegistry.callIds.set("call_3", "567890")
        mockState.toolParameters.set("call_1", { tool: "read", turn: 1, parameters: {} } as any)
        mockState.toolParameters.set("call_2", { tool: "grep", turn: 2, parameters: {} } as any)
        mockState.toolParameters.set("call_3", { tool: "write", turn: 3, parameters: {} } as any)

        const tool = createContextTool({
            client: mockClient,
            state: mockState,
            logger: mockLogger,
            config: mockConfig,
            workingDirectory: "/test",
        })

        const result = await tool.execute(
            {
                action: "discard",
                targets: [["abc123"], ["def456"], ["567890"]],
            },
            mockToolCtx,
        )

        expect(result).toContain("discard")
        expect(mockState.prune.toolIds).toContain("call_1")
        expect(mockState.prune.toolIds).toContain("call_2")
        expect(mockState.prune.toolIds).toContain("call_3")
    })

    it("should reject protected tools", async () => {
        // Setup a protected tool
        mockState.hashRegistry.calls.set("abc123", "call_1")
        mockState.hashRegistry.callIds.set("call_1", "abc123")
        mockState.toolParameters.set("call_1", { tool: "task", turn: 1, parameters: {} } as any)

        const tool = createContextTool({
            client: mockClient,
            state: mockState,
            logger: mockLogger,
            config: mockConfig,
            workingDirectory: "/test",
        })

        await expect(
            tool.execute(
                {
                    action: "discard",
                    targets: [["abc123"]],
                },
                mockToolCtx,
            ),
        ).rejects.toThrow("protected tool")
    })

    it("should report invalid targets not found in registry", async () => {
        const tool = createContextTool({
            client: mockClient,
            state: mockState,
            logger: mockLogger,
            config: mockConfig,
            workingDirectory: "/test",
        })

        const result = await tool.execute(
            {
                action: "discard",
                targets: [["aaaaaa"]], // Valid format but doesn't exist
            },
            mockToolCtx,
        )

        expect(result).toContain("No valid tool hashes to discard")
    })
})
