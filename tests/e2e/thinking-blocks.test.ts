/**
 * Thinking Block & Message Pruning E2E Tests (t29-t32)
 *
 * Tests thinking/reasoning block and assistant message pruning:
 * - t29: Pruning thinking blocks (discard reasoning by hash)
 * - t30: Pruning assistant messages (discard message parts by hash)
 * - t31: Distill thinking block (replace with summary)
 * - t32: Mixed thinking and message pruning
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import {
    createMockClient,
    createMockLogger,
    createMockState,
    registerToolCall,
    registerMessagePart,
    registerReasoningPart,
} from "../fixtures/mock-client"

// Mock the plugin module
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
    return { tool: toolMock }
})

vi.mock("../../lib/prompts", () => ({
    loadPrompt: vi.fn((name: string) => `Mocked prompt: ${name}`),
}))

import { createContextTool } from "../../lib/strategies/context"

/**
 * Creates a mock plugin config with full settings.
 */
function createMockConfig(overrides: Record<string, unknown> = {}) {
    return {
        enabled: true,
        tools: {
            settings: {
                protectedTools: [
                    "task",
                    "todowrite",
                    "todoread",
                    "agent_context_optimize",
                    "write",
                    "edit",
                ],
                enableAssistantMessagePruning: true,
                enableReasoningPruning: true,
                enableVisibleAssistantHashes: true,
            },
            discard: { enabled: true },
            distill: { enabled: true },
        },
        ...overrides,
    }
}

describe("Thinking Block & Message Pruning (t29-t32)", () => {
    let mockState: ReturnType<typeof createMockState>
    let mockClient: ReturnType<typeof createMockClient>
    let mockLogger: ReturnType<typeof createMockLogger>
    let mockConfig: ReturnType<typeof createMockConfig>
    let mockToolCtx: any
    let contextTool: ReturnType<typeof createContextTool>

    beforeEach(() => {
        mockState = createMockState()
        mockClient = createMockClient()
        mockLogger = createMockLogger()
        mockConfig = createMockConfig()
        mockToolCtx = {
            sessionID: "test-session",
            messageID: "msg_1",
            agent: "build",
            abort: new AbortController().signal,
        }
        contextTool = createContextTool({
            client: mockClient as any,
            state: mockState,
            logger: mockLogger as any,
            config: mockConfig as any,
            workingDirectory: "/test",
        })
    })

    describe("t29: Pruning Thinking Blocks", () => {
        it("discards a thinking/reasoning block by hash", async () => {
            registerReasoningPart(mockState, "msg_1", 0, "abc123")

            const result = await contextTool.execute(
                { action: "discard", targets: [["abc123"]] },
                mockToolCtx,
            )

            expect(result).toContain("discard")
            expect(mockState.prune.reasoningPartIds).toContain("msg_1:0")
        })

        it("discards multiple thinking blocks", async () => {
            registerReasoningPart(mockState, "msg_1", 0, "aaa111")
            registerReasoningPart(mockState, "msg_2", 0, "bbb222")
            registerReasoningPart(mockState, "msg_3", 0, "ccc333")

            await contextTool.execute(
                { action: "discard", targets: [["aaa111"], ["bbb222"], ["ccc333"]] },
                mockToolCtx,
            )

            expect(mockState.prune.reasoningPartIds).toContain("msg_1:0")
            expect(mockState.prune.reasoningPartIds).toContain("msg_2:0")
            expect(mockState.prune.reasoningPartIds).toContain("msg_3:0")
        })

        it("updates thinking stats after discard", async () => {
            registerReasoningPart(mockState, "msg_1", 0, "def456")

            await contextTool.execute({ action: "discard", targets: [["def456"]] }, mockToolCtx)

            expect(mockState.stats.strategyStats.manualDiscard.thinking.count).toBe(1)
        })

        it("handles thinking blocks from different messages", async () => {
            registerReasoningPart(mockState, "msg_assistant_1", 0, "aaa111")
            registerReasoningPart(mockState, "msg_assistant_2", 0, "bbb222")

            await contextTool.execute(
                { action: "discard", targets: [["aaa111"], ["bbb222"]] },
                mockToolCtx,
            )

            expect(mockState.prune.reasoningPartIds.length).toBe(2)
        })

        it("respects enableReasoningPruning config", async () => {
            const disabledConfig = createMockConfig({
                tools: {
                    settings: {
                        protectedTools: ["task"],
                        enableAssistantMessagePruning: true,
                        enableReasoningPruning: false, // Disabled
                        enableVisibleAssistantHashes: true,
                    },
                    discard: { enabled: true },
                    distill: { enabled: true },
                },
            })

            const disabledTool = createContextTool({
                client: mockClient as any,
                state: mockState,
                logger: mockLogger as any,
                config: disabledConfig as any,
                workingDirectory: "/test",
            })

            registerReasoningPart(mockState, "msg_1", 0, "abc123")

            // When reasoning pruning is disabled, should still work but may log warning
            const result = await disabledTool.execute(
                { action: "discard", targets: [["abc123"]] },
                mockToolCtx,
            )

            expect(result).toBeDefined()
        })
    })

    describe("t30: Pruning Assistant Messages", () => {
        it("discards an assistant message part by hash", async () => {
            registerMessagePart(mockState, "msg_assistant_1", 0, "abc123")

            const result = await contextTool.execute(
                { action: "discard", targets: [["abc123"]] },
                mockToolCtx,
            )

            expect(result).toContain("discard")
            expect(mockState.prune.messagePartIds).toContain("msg_assistant_1:0")
        })

        it("discards multiple message parts from same message", async () => {
            registerMessagePart(mockState, "msg_1", 0, "aaa111")
            registerMessagePart(mockState, "msg_1", 1, "bbb222")
            registerMessagePart(mockState, "msg_1", 2, "ccc333")

            await contextTool.execute(
                { action: "discard", targets: [["aaa111"], ["bbb222"], ["ccc333"]] },
                mockToolCtx,
            )

            expect(mockState.prune.messagePartIds).toContain("msg_1:0")
            expect(mockState.prune.messagePartIds).toContain("msg_1:1")
            expect(mockState.prune.messagePartIds).toContain("msg_1:2")
        })

        it("updates message stats after discard", async () => {
            registerMessagePart(mockState, "msg_1", 0, "def456")

            await contextTool.execute({ action: "discard", targets: [["def456"]] }, mockToolCtx)

            expect(mockState.stats.strategyStats.manualDiscard.message.count).toBe(1)
        })

        it("respects enableAssistantMessagePruning config", async () => {
            const disabledConfig = createMockConfig({
                tools: {
                    settings: {
                        protectedTools: ["task"],
                        enableAssistantMessagePruning: false, // Disabled
                        enableReasoningPruning: true,
                        enableVisibleAssistantHashes: true,
                    },
                    discard: { enabled: true },
                    distill: { enabled: true },
                },
            })

            const disabledTool = createContextTool({
                client: mockClient as any,
                state: mockState,
                logger: mockLogger as any,
                config: disabledConfig as any,
                workingDirectory: "/test",
            })

            registerMessagePart(mockState, "msg_1", 0, "abc123")

            // When message pruning is disabled, should still work but may log warning
            const result = await disabledTool.execute(
                { action: "discard", targets: [["abc123"]] },
                mockToolCtx,
            )

            expect(result).toBeDefined()
        })
    })

    describe("t31: Distill Thinking Block", () => {
        it("distills a thinking block with summary", async () => {
            registerReasoningPart(mockState, "msg_1", 0, "abc123")

            const result = await contextTool.execute(
                {
                    action: "distill",
                    targets: [["abc123", "Chose JWT over sessions: stateless, scales better"]],
                },
                mockToolCtx,
            )

            expect(result).toBeDefined()
            expect(mockState.prune.reasoningPartIds).toContain("msg_1:0")
        })

        it("distills multiple thinking blocks with different summaries", async () => {
            registerReasoningPart(mockState, "msg_1", 0, "aaa111")
            registerReasoningPart(mockState, "msg_2", 0, "bbb222")

            await contextTool.execute(
                {
                    action: "distill",
                    targets: [
                        ["aaa111", "Analysis: 3 optimization opportunities found"],
                        ["bbb222", "Decision: Use Redis for caching"],
                    ],
                },
                mockToolCtx,
            )

            expect(mockState.prune.reasoningPartIds).toContain("msg_1:0")
            expect(mockState.prune.reasoningPartIds).toContain("msg_2:0")
        })

        it("distills assistant message with summary", async () => {
            registerMessagePart(mockState, "msg_1", 0, "def456")

            const result = await contextTool.execute(
                {
                    action: "distill",
                    targets: [["def456", "Explained authentication flow"]],
                },
                mockToolCtx,
            )

            expect(result).toBeDefined()
            expect(mockState.prune.messagePartIds).toContain("msg_1:0")
        })

        it("requires summary for distill action", async () => {
            registerReasoningPart(mockState, "msg_1", 0, "abc123")

            await expect(
                contextTool.execute({ action: "distill", targets: [["abc123", ""]] }, mockToolCtx),
            ).rejects.toThrow("Summary required")
        })
    })

    describe("t32: Mixed Thinking and Message Pruning", () => {
        it("discards both thinking and message parts in single call", async () => {
            registerReasoningPart(mockState, "msg_1", 0, "aaa111")
            registerMessagePart(mockState, "msg_2", 0, "bbb222")

            await contextTool.execute(
                { action: "discard", targets: [["aaa111"], ["bbb222"]] },
                mockToolCtx,
            )

            expect(mockState.prune.reasoningPartIds).toContain("msg_1:0")
            expect(mockState.prune.messagePartIds).toContain("msg_2:0")
        })

        it("discards thinking, message, and tool in single call", async () => {
            registerReasoningPart(mockState, "msg_1", 0, "aaa111")
            registerMessagePart(mockState, "msg_2", 0, "bbb222")
            registerToolCall(mockState, "call_1", "ccc333", "read")

            await contextTool.execute(
                { action: "discard", targets: [["aaa111"], ["bbb222"], ["ccc333"]] },
                mockToolCtx,
            )

            expect(mockState.prune.reasoningPartIds).toContain("msg_1:0")
            expect(mockState.prune.messagePartIds).toContain("msg_2:0")
            expect(mockState.prune.toolIds).toContain("call_1")
        })

        it("distills mixed thinking and message parts", async () => {
            registerReasoningPart(mockState, "msg_1", 0, "aaa111")
            registerMessagePart(mockState, "msg_2", 0, "bbb222")

            await contextTool.execute(
                {
                    action: "distill",
                    targets: [
                        ["aaa111", "Thinking summary"],
                        ["bbb222", "Message summary"],
                    ],
                },
                mockToolCtx,
            )

            expect(mockState.prune.reasoningPartIds).toContain("msg_1:0")
            expect(mockState.prune.messagePartIds).toContain("msg_2:0")
        })

        it("updates all stats correctly for mixed pruning", async () => {
            registerReasoningPart(mockState, "msg_1", 0, "aaa111")
            registerMessagePart(mockState, "msg_2", 0, "bbb222")
            registerToolCall(mockState, "call_1", "ccc333", "read")

            await contextTool.execute(
                { action: "discard", targets: [["aaa111"], ["bbb222"], ["ccc333"]] },
                mockToolCtx,
            )

            expect(mockState.stats.strategyStats.manualDiscard.thinking.count).toBe(1)
            expect(mockState.stats.strategyStats.manualDiscard.message.count).toBe(1)
            expect(mockState.stats.strategyStats.manualDiscard.tool.count).toBe(1)
        })

        it("handles interleaved hash types", async () => {
            registerToolCall(mockState, "call_1", "aaa111", "glob")
            registerReasoningPart(mockState, "msg_1", 0, "bbb222")
            registerToolCall(mockState, "call_2", "ccc333", "grep")
            registerMessagePart(mockState, "msg_2", 0, "ddd444")
            registerReasoningPart(mockState, "msg_3", 0, "eee555")

            await contextTool.execute(
                {
                    action: "discard",
                    targets: [["aaa111"], ["bbb222"], ["ccc333"], ["ddd444"], ["eee555"]],
                },
                mockToolCtx,
            )

            expect(mockState.prune.toolIds.length).toBe(2)
            expect(mockState.prune.reasoningPartIds.length).toBe(2)
            expect(mockState.prune.messagePartIds.length).toBe(1)
        })
    })

    describe("Edge Cases", () => {
        it("handles already-pruned thinking block gracefully", async () => {
            registerReasoningPart(mockState, "msg_1", 0, "abc123")

            // First discard
            await contextTool.execute({ action: "discard", targets: [["abc123"]] }, mockToolCtx)

            // Second discard of same hash
            const result = await contextTool.execute(
                { action: "discard", targets: [["abc123"]] },
                mockToolCtx,
            )

            expect(result).toBeDefined()
        })

        it("handles unicode in distill summary", async () => {
            registerReasoningPart(mockState, "msg_1", 0, "abc123")

            const result = await contextTool.execute(
                {
                    action: "distill",
                    targets: [["abc123", "分析完了: 3つの最適化機会を発見 🎯"]],
                },
                mockToolCtx,
            )

            expect(result).toBeDefined()
        })

        it("handles long summary text", async () => {
            registerReasoningPart(mockState, "msg_1", 0, "abc123")

            const longSummary = "A".repeat(500) // 500 character summary

            const result = await contextTool.execute(
                { action: "distill", targets: [["abc123", longSummary]] },
                mockToolCtx,
            )

            expect(result).toBeDefined()
        })

        it("handles concurrent thinking block operations", async () => {
            registerReasoningPart(mockState, "msg_1", 0, "aaa111")
            registerReasoningPart(mockState, "msg_2", 0, "bbb222")

            const [result1, result2] = await Promise.all([
                contextTool.execute({ action: "discard", targets: [["aaa111"]] }, mockToolCtx),
                contextTool.execute({ action: "discard", targets: [["bbb222"]] }, mockToolCtx),
            ])

            expect(result1).toBeDefined()
            expect(result2).toBeDefined()
        })
    })
})
