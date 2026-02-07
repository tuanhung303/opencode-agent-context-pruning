/**
 * Core Operations E2E Tests (t1-t12)
 *
 * Tests basic context tool operations:
 * - t1-t3: Basic discard (tool hash, message hash, mixed)
 * - t4-t6: Basic distill operations
 * - t7-t10: Edge cases and validation
 * - t11: Protected tools exclusion
 * - t12: Error handling
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
 * Creates a mock plugin config with full protected tools list.
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

describe("Core Operations (t1-t12)", () => {
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

    describe("t1: Basic Discard - Tool Hash", () => {
        it("discards a single tool by its 6-char hex hash", async () => {
            registerToolCall(mockState, "call_read_1", "abc123", "read")

            const result = await contextTool.execute(
                { action: "discard", targets: [["abc123"]] },
                mockToolCtx,
            )

            expect(result).toContain("discard")
            expect(mockState.prune.toolIds).toContain("call_read_1")
        })

        it("discards multiple tools by hash in sequence", async () => {
            registerToolCall(mockState, "call_read_1", "aaa111", "read")
            registerToolCall(mockState, "call_glob_1", "bbb222", "glob")
            registerToolCall(mockState, "call_grep_1", "ccc333", "grep")

            const result = await contextTool.execute(
                { action: "discard", targets: [["aaa111"], ["bbb222"], ["ccc333"]] },
                mockToolCtx,
            )

            expect(mockState.prune.toolIds).toContain("call_read_1")
            expect(mockState.prune.toolIds).toContain("call_glob_1")
            expect(mockState.prune.toolIds).toContain("call_grep_1")
            expect(mockState.prune.toolIds.length).toBe(3)
        })

        it("updates stats after discard", async () => {
            registerToolCall(mockState, "call_read_1", "def456", "read")

            await contextTool.execute({ action: "discard", targets: [["def456"]] }, mockToolCtx)

            expect(mockState.stats.strategyStats.manualDiscard.tool.count).toBe(1)
        })
    })

    describe("t2: Basic Discard - Message Hash", () => {
        it("discards a message part by its 6-char hex hash", async () => {
            registerMessagePart(mockState, "msg_assistant_1", 0, "fed987")

            const result = await contextTool.execute(
                { action: "discard", targets: [["fed987"]] },
                mockToolCtx,
            )

            expect(result).toContain("discard")
            expect(mockState.prune.messagePartIds).toContain("msg_assistant_1:0")
        })

        it("discards multiple message parts", async () => {
            registerMessagePart(mockState, "msg_1", 0, "aaa111")
            registerMessagePart(mockState, "msg_1", 1, "bbb222")
            registerMessagePart(mockState, "msg_2", 0, "ccc333")

            await contextTool.execute(
                { action: "discard", targets: [["aaa111"], ["bbb222"], ["ccc333"]] },
                mockToolCtx,
            )

            expect(mockState.prune.messagePartIds).toContain("msg_1:0")
            expect(mockState.prune.messagePartIds).toContain("msg_1:1")
            expect(mockState.prune.messagePartIds).toContain("msg_2:0")
        })

        it("updates message stats after discard", async () => {
            registerMessagePart(mockState, "msg_1", 0, "abc123")

            await contextTool.execute({ action: "discard", targets: [["abc123"]] }, mockToolCtx)

            expect(mockState.stats.strategyStats.manualDiscard.message.count).toBe(1)
        })
    })

    describe("t3: Mixed Discard - Tool + Message", () => {
        it("discards both tool and message in single call", async () => {
            registerToolCall(mockState, "call_read_1", "aaa111", "read")
            registerMessagePart(mockState, "msg_1", 0, "bbb222")

            const result = await contextTool.execute(
                { action: "discard", targets: [["aaa111"], ["bbb222"]] },
                mockToolCtx,
            )

            expect(mockState.prune.toolIds).toContain("call_read_1")
            expect(mockState.prune.messagePartIds).toContain("msg_1:0")
        })

        it("handles interleaved tool and message hashes", async () => {
            registerToolCall(mockState, "call_1", "aaa111", "read")
            registerMessagePart(mockState, "msg_1", 0, "bbb222")
            registerToolCall(mockState, "call_2", "ccc333", "glob")
            registerMessagePart(mockState, "msg_2", 0, "ddd444")

            await contextTool.execute(
                {
                    action: "discard",
                    targets: [["aaa111"], ["bbb222"], ["ccc333"], ["ddd444"]],
                },
                mockToolCtx,
            )

            expect(mockState.prune.toolIds.length).toBe(2)
            expect(mockState.prune.messagePartIds.length).toBe(2)
        })

        it("updates both tool and message stats", async () => {
            registerToolCall(mockState, "call_1", "aaa111", "read")
            registerMessagePart(mockState, "msg_1", 0, "bbb222")

            await contextTool.execute(
                { action: "discard", targets: [["aaa111"], ["bbb222"]] },
                mockToolCtx,
            )

            expect(mockState.stats.strategyStats.manualDiscard.tool.count).toBe(1)
            expect(mockState.stats.strategyStats.manualDiscard.message.count).toBe(1)
        })
    })

    describe("t4: Distill Tool Output", () => {
        it("distills a tool output with summary", async () => {
            registerToolCall(mockState, "call_glob_1", "abc123", "glob")

            const result = await contextTool.execute(
                { action: "distill", targets: [["abc123", "Found 8 TypeScript files"]] },
                mockToolCtx,
            )

            expect(result).toContain("distill")
            expect(mockState.prune.toolIds).toContain("call_glob_1")
        })

        it("distills multiple tools with different summaries", async () => {
            registerToolCall(mockState, "call_1", "aaa111", "glob")
            registerToolCall(mockState, "call_2", "bbb222", "grep")

            await contextTool.execute(
                {
                    action: "distill",
                    targets: [
                        ["aaa111", "Found 8 TS files"],
                        ["bbb222", "3 matches in auth module"],
                    ],
                },
                mockToolCtx,
            )

            expect(mockState.prune.toolIds).toContain("call_1")
            expect(mockState.prune.toolIds).toContain("call_2")
        })

        it("updates distillation stats", async () => {
            registerToolCall(mockState, "call_1", "abc123", "read")

            await contextTool.execute(
                { action: "distill", targets: [["abc123", "Config file contents"]] },
                mockToolCtx,
            )

            expect(mockState.stats.strategyStats.distillation.count).toBe(1)
        })
    })

    describe("t5: Distill Message Hash", () => {
        it("distills a message part with summary", async () => {
            registerMessagePart(mockState, "msg_1", 0, "def456")

            const result = await contextTool.execute(
                { action: "distill", targets: [["def456", "Analysis complete"]] },
                mockToolCtx,
            )

            // Distill on message parts may use discard internally
            expect(result).toBeDefined()
            expect(mockState.prune.messagePartIds).toContain("msg_1:0")
        })

        it("distills multiple message parts", async () => {
            registerMessagePart(mockState, "msg_1", 0, "aaa111")
            registerMessagePart(mockState, "msg_2", 0, "bbb222")

            await contextTool.execute(
                {
                    action: "distill",
                    targets: [
                        ["aaa111", "First analysis"],
                        ["bbb222", "Second analysis"],
                    ],
                },
                mockToolCtx,
            )

            expect(mockState.prune.messagePartIds).toContain("msg_1:0")
            expect(mockState.prune.messagePartIds).toContain("msg_2:0")
        })
    })

    describe("t6: Mixed Distill - Tool + Message", () => {
        it("distills both tool and message in single call", async () => {
            registerToolCall(mockState, "call_1", "aaa111", "read")
            registerMessagePart(mockState, "msg_1", 0, "bbb222")

            await contextTool.execute(
                {
                    action: "distill",
                    targets: [
                        ["aaa111", "README contents"],
                        ["bbb222", "Directory listing"],
                    ],
                },
                mockToolCtx,
            )

            expect(mockState.prune.toolIds).toContain("call_1")
            expect(mockState.prune.messagePartIds).toContain("msg_1:0")
        })
    })

    describe("t7: Reasoning/Thinking Block Discard", () => {
        it("discards a reasoning part by valid hex hash", async () => {
            registerReasoningPart(mockState, "msg_1", 0, "abc123")

            const result = await contextTool.execute(
                { action: "discard", targets: [["abc123"]] },
                mockToolCtx,
            )

            expect(result).toContain("discard")
            expect(mockState.prune.reasoningPartIds).toContain("msg_1:0")
        })

        it("updates thinking stats after discard", async () => {
            registerReasoningPart(mockState, "msg_1", 0, "def456")

            await contextTool.execute({ action: "discard", targets: [["def456"]] }, mockToolCtx)

            expect(mockState.stats.strategyStats.manualDiscard.thinking.count).toBe(1)
        })
    })

    describe("t8: Distill Reasoning Block", () => {
        it("distills a reasoning part with summary", async () => {
            registerReasoningPart(mockState, "msg_1", 0, "abc123")

            const result = await contextTool.execute(
                { action: "distill", targets: [["abc123", "Chose JWT over sessions"]] },
                mockToolCtx,
            )

            expect(result).toBeDefined()
            expect(mockState.prune.reasoningPartIds).toContain("msg_1:0")
        })
    })

    describe("t9: Hash Format Validation", () => {
        it("accepts valid 6-char hex hashes", async () => {
            registerToolCall(mockState, "call_1", "abcdef", "read")

            const result = await contextTool.execute(
                { action: "discard", targets: [["abcdef"]] },
                mockToolCtx,
            )

            expect(mockState.prune.toolIds).toContain("call_1")
        })

        it("accepts lowercase hex characters", async () => {
            registerToolCall(mockState, "call_1", "a1b2c3", "read")

            await contextTool.execute({ action: "discard", targets: [["a1b2c3"]] }, mockToolCtx)

            expect(mockState.prune.toolIds).toContain("call_1")
        })

        it("accepts numeric hex hashes", async () => {
            registerToolCall(mockState, "call_1", "123456", "read")

            await contextTool.execute({ action: "discard", targets: [["123456"]] }, mockToolCtx)

            expect(mockState.prune.toolIds).toContain("call_1")
        })

        it("rejects invalid hex characters", async () => {
            // 'z' is not a valid hex character
            await expect(
                contextTool.execute({ action: "discard", targets: [["zzzzzz"]] }, mockToolCtx),
            ).rejects.toThrow("Invalid hash format")
        })

        it("rejects wrong length hashes", async () => {
            await expect(
                contextTool.execute({ action: "discard", targets: [["abc"]] }, mockToolCtx),
            ).rejects.toThrow("Invalid hash format")
        })
    })

    describe("t10: Batch Operations", () => {
        it("handles large batch of discards", async () => {
            // Register 10 tools with valid hex hashes
            for (let i = 0; i < 10; i++) {
                const hash = `aa${i.toString(16).padStart(4, "0")}`
                registerToolCall(mockState, `call_${i}`, hash, "read")
            }

            const targets = Array.from({ length: 10 }, (_, i) => [
                `aa${i.toString(16).padStart(4, "0")}`,
            ])

            await contextTool.execute({ action: "discard", targets }, mockToolCtx)

            expect(mockState.prune.toolIds.length).toBe(10)
        })

        it("handles mixed batch of tools, messages, and reasoning", async () => {
            registerToolCall(mockState, "call_1", "aaa111", "read")
            registerToolCall(mockState, "call_2", "bbb222", "glob")
            registerMessagePart(mockState, "msg_1", 0, "ccc333")
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
            expect(mockState.prune.messagePartIds.length).toBe(2)
            expect(mockState.prune.reasoningPartIds.length).toBe(1)
        })
    })

    describe("t11: Protected Tools Exclusion", () => {
        it("rejects discard of protected 'task' tool", async () => {
            registerToolCall(mockState, "call_task_1", "aaa111", "task")

            await expect(
                contextTool.execute({ action: "discard", targets: [["aaa111"]] }, mockToolCtx),
            ).rejects.toThrow("protected")
        })

        it("rejects discard of protected 'todowrite' tool", async () => {
            registerToolCall(mockState, "call_todo_1", "bbb222", "todowrite")

            await expect(
                contextTool.execute({ action: "discard", targets: [["bbb222"]] }, mockToolCtx),
            ).rejects.toThrow("protected")
        })

        it("rejects discard of protected 'write' tool", async () => {
            registerToolCall(mockState, "call_write_1", "ccc333", "write")

            await expect(
                contextTool.execute({ action: "discard", targets: [["ccc333"]] }, mockToolCtx),
            ).rejects.toThrow("protected")
        })

        it("allows discard of non-protected tools", async () => {
            registerToolCall(mockState, "call_read_1", "ddd444", "read")
            registerToolCall(mockState, "call_glob_1", "eee555", "glob")
            registerToolCall(mockState, "call_grep_1", "fff666", "grep")

            await contextTool.execute(
                { action: "discard", targets: [["ddd444"], ["eee555"], ["fff666"]] },
                mockToolCtx,
            )

            expect(mockState.prune.toolIds).toContain("call_read_1")
            expect(mockState.prune.toolIds).toContain("call_glob_1")
            expect(mockState.prune.toolIds).toContain("call_grep_1")
        })

        it("rejects mixed batch containing protected tool", async () => {
            registerToolCall(mockState, "call_read_1", "aaa111", "read")
            registerToolCall(mockState, "call_task_1", "bbb222", "task")

            await expect(
                contextTool.execute(
                    { action: "discard", targets: [["aaa111"], ["bbb222"]] },
                    mockToolCtx,
                ),
            ).rejects.toThrow("protected")
        })

        it("respects custom protected tools from config", async () => {
            const customConfig = createMockConfig({
                tools: {
                    settings: {
                        protectedTools: ["task", "custom_tool"],
                        enableAssistantMessagePruning: true,
                        enableReasoningPruning: true,
                        enableVisibleAssistantHashes: true,
                    },
                    discard: { enabled: true },
                    distill: { enabled: true },
                },
            })

            const customTool = createContextTool({
                client: mockClient as any,
                state: mockState,
                logger: mockLogger as any,
                config: customConfig as any,
                workingDirectory: "/test",
            })

            registerToolCall(mockState, "call_custom_1", "fff666", "custom_tool")

            await expect(
                customTool.execute({ action: "discard", targets: [["fff666"]] }, mockToolCtx),
            ).rejects.toThrow("protected")
        })
    })

    describe("t12: Error Handling", () => {
        it("throws on invalid hash format (non-hex characters)", async () => {
            await expect(
                contextTool.execute({ action: "discard", targets: [["ghijkl"]] }, mockToolCtx),
            ).rejects.toThrow("Invalid hash format")
        })

        it("throws on empty targets array", async () => {
            await expect(
                contextTool.execute({ action: "discard", targets: [] }, mockToolCtx),
            ).rejects.toThrow("No targets provided")
        })

        it("throws on distill without summary", async () => {
            registerToolCall(mockState, "call_1", "abc123", "read")

            await expect(
                contextTool.execute({ action: "distill", targets: [["abc123", ""]] }, mockToolCtx),
            ).rejects.toThrow("Summary required")
        })

        it("handles already-pruned hash gracefully", async () => {
            registerToolCall(mockState, "call_1", "abc123", "read")

            // First discard
            await contextTool.execute({ action: "discard", targets: [["abc123"]] }, mockToolCtx)

            // Second discard of same hash - should not throw
            const result = await contextTool.execute(
                { action: "discard", targets: [["abc123"]] },
                mockToolCtx,
            )

            expect(result).toBeDefined()
        })

        it("handles mixed valid and non-existent hashes", async () => {
            registerToolCall(mockState, "call_1", "aaa111", "read")
            // bbb222 is not registered but is valid hex format

            const result = await contextTool.execute(
                { action: "discard", targets: [["aaa111"], ["bbb222"]] },
                mockToolCtx,
            )

            // Should process valid hash, skip non-existent
            expect(mockState.prune.toolIds).toContain("call_1")
        })

        it("throws on hash with wrong length", async () => {
            await expect(
                contextTool.execute({ action: "discard", targets: [["abc"]] }, mockToolCtx),
            ).rejects.toThrow("Invalid hash format")
        })
    })

    describe("Edge Cases", () => {
        it("handles concurrent discard operations", async () => {
            registerToolCall(mockState, "call_1", "aaa111", "read")
            registerToolCall(mockState, "call_2", "bbb222", "glob")

            // Simulate concurrent calls
            const [result1, result2] = await Promise.all([
                contextTool.execute({ action: "discard", targets: [["aaa111"]] }, mockToolCtx),
                contextTool.execute({ action: "discard", targets: [["bbb222"]] }, mockToolCtx),
            ])

            expect(result1).toBeDefined()
            expect(result2).toBeDefined()
        })

        it("preserves state consistency after errors", async () => {
            registerToolCall(mockState, "call_1", "aaa111", "read")
            registerToolCall(mockState, "call_task", "bbb222", "task")

            const initialToolCount = mockState.prune.toolIds.length

            try {
                await contextTool.execute({ action: "discard", targets: [["bbb222"]] }, mockToolCtx)
            } catch {
                // Expected to throw for protected tool
            }

            // State should not be corrupted
            expect(mockState.prune.toolIds.length).toBe(initialToolCount)
        })

        it("handles special characters in summary", async () => {
            registerToolCall(mockState, "call_1", "abc123", "read")

            const result = await contextTool.execute(
                {
                    action: "distill",
                    targets: [
                        ["abc123", "Summary with 'quotes' and \"double quotes\" and\nnewlines"],
                    ],
                },
                mockToolCtx,
            )

            expect(result).toBeDefined()
        })

        it("handles unicode in summary", async () => {
            registerToolCall(mockState, "call_1", "abc123", "read")

            const result = await contextTool.execute(
                {
                    action: "distill",
                    targets: [["abc123", "Summary with 日本語 and émojis 🎉"]],
                },
                mockToolCtx,
            )

            expect(result).toBeDefined()
        })
    })
})
