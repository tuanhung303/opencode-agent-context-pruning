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
            },
            toolParameters: new Map(),
            hashToCallId: new Map(),
            callIdToHash: new Map(),
            hashToMessagePart: new Map(),
            messagePartToHash: new Map(),
            hashToReasoningPart: new Map(),
            reasoningPartToHash: new Map(),
            softPrunedTools: new Set(),
            softPrunedMessageParts: new Set(),
            softPrunedMessages: new Set(),
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
                    },
                    purgeErrors: { count: 0, tokens: 0 },
                    manualDiscard: {
                        message: { count: 0, tokens: 0 },
                        thinking: { count: 0, tokens: 0 },
                        tool: { count: 0, tokens: 0 },
                    },
                    distillation: { count: 0, tokens: 0 },
                    truncation: { count: 0, tokens: 0 },
                    thinkingCompression: { count: 0, tokens: 0 },
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

    it("should discard a message by hash and then restore it symmetrically", async () => {
        // Setup: Pre-inject a hash for the message
        mockState.hashToMessagePart.set("a1b2c3", "msg_1:0")
        mockState.messagePartToHash.set("msg_1:0", "a1b2c3")

        const tool = createContextTool({
            client: mockClient,
            state: mockState,
            logger: mockLogger,
            config: mockConfig,
            workingDirectory: "/test",
        })

        // 1. Discard by hash
        const discardResult = await tool.execute(
            {
                action: "discard",
                targets: [["a1b2c3"]],
            },
            mockToolCtx,
        )

        expect(discardResult).toContain("Discarded 1 message(s)")
        expect(mockState.prune.messagePartIds).toContain("msg_1:0")

        // 2. Restore by hash
        const restoreResult = await tool.execute(
            {
                action: "restore",
                targets: [["a1b2c3"]],
            },
            mockToolCtx,
        )

        expect(restoreResult).toContain("Restored 1 message(s)")
        expect(mockState.prune.messagePartIds).not.toContain("msg_1:0")
    })

    it("should handle mixed targets (tool hash + message hash) in a single call", async () => {
        // Setup a tool in state
        mockState.hashToCallId.set("abc123", "call_1")
        mockState.callIdToHash.set("call_1", "abc123")
        mockState.toolParameters.set("call_1", { tool: "read", turn: 1, parameters: {} } as any)

        // Setup a message hash
        mockState.hashToMessagePart.set("d4e5f6", "msg_1:0")
        mockState.messagePartToHash.set("msg_1:0", "d4e5f6")

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
        expect(result).toContain("Discarded 1 message(s)")
        expect(mockState.prune.toolIds).toContain("call_1")
        expect(mockState.prune.messagePartIds).toContain("msg_1:0")
    })

    it("should discard all tools using bulk pattern [tools]", async () => {
        // Setup multiple tools in state (task is protected, so use other tools)
        mockState.hashToCallId.set("abc123", "call_1")
        mockState.hashToCallId.set("def456", "call_2")
        mockState.hashToCallId.set("567890", "call_3")
        mockState.callIdToHash.set("call_1", "abc123")
        mockState.callIdToHash.set("call_2", "def456")
        mockState.callIdToHash.set("call_3", "w_56789")
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
                targets: [["[tools]"]],
            },
            mockToolCtx,
        )

        expect(result).toContain("discard")
        expect(mockState.prune.toolIds).toContain("call_1")
        expect(mockState.prune.toolIds).toContain("call_2")
        expect(mockState.prune.toolIds).toContain("call_3")
    })

    it("should distill all tools using bulk pattern [tools] with summary", async () => {
        // Setup multiple tools in state
        mockState.hashToCallId.set("abc123", "call_1")
        mockState.hashToCallId.set("def456", "call_2")
        mockState.callIdToHash.set("call_1", "abc123")
        mockState.callIdToHash.set("call_2", "def456")
        mockState.toolParameters.set("call_1", { tool: "read", turn: 1, parameters: {} } as any)
        mockState.toolParameters.set("call_2", { tool: "grep", turn: 2, parameters: {} } as any)

        const tool = createContextTool({
            client: mockClient,
            state: mockState,
            logger: mockLogger,
            config: mockConfig,
            workingDirectory: "/test",
        })

        const result = await tool.execute(
            {
                action: "distill",
                targets: [["[tools]", "Research complete"]],
            },
            mockToolCtx,
        )

        expect(result).toContain("distill")
        expect(mockState.prune.toolIds).toContain("call_1")
        expect(mockState.prune.toolIds).toContain("call_2")
    })

    it("should exclude protected tools from bulk operations", async () => {
        // Setup tools including a protected one
        mockState.hashToCallId.set("abc123", "call_1")
        mockState.hashToCallId.set("t_def34", "call_2") // task is protected
        mockState.callIdToHash.set("call_1", "abc123")
        mockState.callIdToHash.set("call_2", "t_def34")
        mockState.toolParameters.set("call_1", { tool: "read", turn: 1, parameters: {} } as any)
        mockState.toolParameters.set("call_2", { tool: "task", turn: 2, parameters: {} } as any)

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
                targets: [["[tools]"]],
            },
            mockToolCtx,
        )

        expect(result).toContain("discard")
        expect(mockState.prune.toolIds).toContain("call_1")
        expect(mockState.prune.toolIds).not.toContain("call_2") // Protected tool excluded
    })

    it("should handle bulk all pattern [*] for discard", async () => {
        // Setup tools and messages
        mockState.hashToCallId.set("abc123", "call_1")
        mockState.callIdToHash.set("call_1", "abc123")
        mockState.toolParameters.set("call_1", { tool: "read", turn: 1, parameters: {} } as any)
        mockState.hashToMessagePart = new Map()
        mockState.hashToMessagePart.set("a_xyz12", "msg_1:0")

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
                targets: [["[*]"]],
            },
            mockToolCtx,
        )

        expect(result).toContain("discard")
        expect(mockState.prune.toolIds).toContain("call_1")
        expect(mockState.prune.messagePartIds).toContain("msg_1:0")
    })
})
