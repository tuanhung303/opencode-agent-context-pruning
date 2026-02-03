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

import { createContextTool } from "../../lib/strategies/tools"
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
            prune: {
                toolIds: [],
                messagePartIds: [],
            },
            toolParameters: new Map(),
            hashToCallId: new Map(),
            callIdToHash: new Map(),
            patternToContent: new Map(),
            discardHistory: [],
            stats: {
                pruneTokenCounter: 0,
                totalPruneTokens: 0,
                pruneMessageCounter: 0,
                totalPruneMessages: 0,
                strategyStats: {
                    manualDiscard: { count: 0, tokens: 0 },
                    distillation: { count: 0, tokens: 0 },
                },
            },
        } as any

        mockClient = {
            session: {
                messages: vi.fn().mockResolvedValue({
                    data: [
                        {
                            info: { id: "msg_1", role: "assistant" },
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

    it("should discard a message by pattern and then restore it symmetrically", async () => {
        const tool = createContextTool({
            client: mockClient,
            state: mockState,
            logger: mockLogger,
            config: mockConfig,
            workingDirectory: "/test",
        })

        // 1. Discard
        const discardResult = await tool.execute(
            {
                action: "discard",
                targets: [["Let me explain...detail"]],
            },
            mockToolCtx,
        )

        expect(discardResult).toContain("Discarded 1 message(s)")
        expect(mockState.prune.messagePartIds).toContain("msg_1:0")
        expect(mockState.patternToContent.has("let me explain detail")).toBe(true)

        // 2. Restore
        const restoreResult = await tool.execute(
            {
                action: "restore",
                targets: [["Let me explain...detail"]],
            },
            mockToolCtx,
        )

        expect(restoreResult).toContain("Restored 1 message(s)")
        expect(mockState.prune.messagePartIds).not.toContain("msg_1:0")
    })

    it("should handle mixed targets (tool hash + message pattern) in a single call", async () => {
        // Setup a tool in state
        mockState.hashToCallId.set("r_abc12", "call_1")
        mockState.callIdToHash.set("call_1", "r_abc12")
        mockState.toolParameters.set("call_1", { tool: "read", turn: 1, parameters: {} } as any)

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
                targets: [["r_abc12"], ["Let me explain...detail"]],
            },
            mockToolCtx,
        )

        expect(result).toContain("Discarded 1 tool(s)")
        expect(result).toContain("Discarded 1 message(s)")
        expect(mockState.prune.toolIds).toContain("call_1")
        expect(mockState.prune.messagePartIds).toContain("msg_1:0")
    })
})
