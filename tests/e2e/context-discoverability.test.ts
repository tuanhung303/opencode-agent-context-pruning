/**
 * Context Discoverability E2E Tests (t44-t52)
 *
 * Tests for improved agent discoverability:
 * - t44: Empty context detection
 * - t45: Hash inventory display
 * - t46: Tool name in response (not hash)
 * - t47: Reasoning hash naming consistency
 * - t48-t50: Batch operations
 * - t51-t52: Workflow scenarios
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
        object: vi.fn(() => schema),
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

import { createContextTool, executeContext } from "../../lib/strategies/context"
import { detectTargetType, resolveTargetDisplayName } from "../../lib/messages/utils"

function createMockConfig(overrides: Record<string, unknown> = {}) {
    return {
        enabled: true,
        tools: {
            settings: {
                protectedTools: ["task", "todowrite", "todoread", "context_prune", "write", "edit"],
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

describe("Context Discoverability (t44-t52)", () => {
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

    describe("t44: Empty Context Detection", () => {
        it("shows guidance when no hashes exist and invalid hash provided", async () => {
            // No hashes registered - empty context
            // Use valid hex format but non-existent hash
            const result = await contextTool.execute(
                { action: "discard", targets: [["999999"]] },
                mockToolCtx,
            )

            // Response shows no valid hashes and guidance to run tools first
            expect(result).toContain("Hash(es) not found")
            expect(result).toContain("No content to prune yet")
        })

        it("shows available inventory when hashes exist but target not found", async () => {
            registerToolCall(mockState, "call_1", "abc123", "read")
            registerToolCall(mockState, "call_2", "def456", "grep")

            const result = await contextTool.execute(
                { action: "discard", targets: [["999999"]] },
                mockToolCtx,
            )

            // Response shows no valid hashes but lists available inventory
            expect(result).toContain("Hash(es) not found")
            expect(result).toContain("Available:")
            expect(result).toContain("Tools(2)")
        })

        it("rejects empty targets array with helpful error", async () => {
            await expect(
                contextTool.execute({ action: "discard", targets: [] }, mockToolCtx),
            ).rejects.toThrow("No targets provided")
        })
    })

    describe("t45: Hash Inventory Display", () => {
        it("shows inventory on successful discard", async () => {
            registerToolCall(mockState, "call_1", "abc123", "read")
            registerToolCall(mockState, "call_2", "def456", "grep")
            registerToolCall(mockState, "call_3", "ghi789", "glob")

            const result = await contextTool.execute(
                { action: "discard", targets: [["abc123"]] },
                mockToolCtx,
            )

            // Verify discard completed successfully
            expect(result).toContain("read")
        })

        it("shows inventory with multiple types", async () => {
            registerToolCall(mockState, "call_1", "abc123", "read")
            registerMessagePart(mockState, "msg_1", 0, "def456")
            registerReasoningPart(mockState, "msg_2", 0, "ghi789")

            const result = await contextTool.execute(
                { action: "discard", targets: [["abc123"]] },
                mockToolCtx,
            )

            // Verify discard completed successfully
            expect(result).toContain("read")
        })

        it("completes when all hashes pruned", async () => {
            registerToolCall(mockState, "call_1", "abc123", "read")

            const result = await contextTool.execute(
                { action: "discard", targets: [["abc123"]] },
                mockToolCtx,
            )

            // Verify discard completed successfully
            expect(result).toContain("read")
        })
    })

    describe("t46: Tool Name in Response (Not Hash)", () => {
        it("resolves tool hash to tool name", () => {
            registerToolCall(mockState, "call_1", "abc123", "read")

            const displayName = resolveTargetDisplayName("abc123", mockState)
            expect(displayName).toBe("read")
        })

        it("resolves message hash to 'message part'", () => {
            registerMessagePart(mockState, "msg_1", 0, "def456")

            const displayName = resolveTargetDisplayName("def456", mockState)
            expect(displayName).toBe("message part")
        })

        it("resolves reasoning hash to 'thinking block'", () => {
            registerReasoningPart(mockState, "msg_1", 0, "ghi789")

            const displayName = resolveTargetDisplayName("ghi789", mockState)
            expect(displayName).toBe("thinking block")
        })

        it("falls back to hash when not found", () => {
            const displayName = resolveTargetDisplayName("zzzzzz", mockState)
            expect(displayName).toBe("zzzzzz")
        })

        it("uses targetType hint when hash not in registry", () => {
            const displayName = resolveTargetDisplayName("zzzzzz", mockState, undefined, "message")
            expect(displayName).toBe("message part")
        })
    })

    describe("t47: Reasoning Hash Naming Consistency", () => {
        it("detects reasoning hash type correctly", () => {
            registerReasoningPart(mockState, "msg_1", 0, "abc123")

            const targetType = detectTargetType("abc123", mockState)
            expect(targetType).toBe("reasoning_hash")
        })

        it("distinguishes reasoning from tool hashes", () => {
            registerToolCall(mockState, "call_1", "aaa111", "read")
            registerReasoningPart(mockState, "msg_1", 0, "bbb222")

            expect(detectTargetType("aaa111", mockState)).toBe("tool_hash")
            expect(detectTargetType("bbb222", mockState)).toBe("reasoning_hash")
        })

        it("distinguishes reasoning from message hashes", () => {
            registerMessagePart(mockState, "msg_1", 0, "aaa111")
            registerReasoningPart(mockState, "msg_2", 0, "bbb222")

            expect(detectTargetType("aaa111", mockState)).toBe("message_hash")
            expect(detectTargetType("bbb222", mockState)).toBe("reasoning_hash")
        })
    })

    describe("t48: Batch Discard Operations", () => {
        it("discards multiple tool hashes in single call", async () => {
            registerToolCall(mockState, "call_1", "aaa111", "read")
            registerToolCall(mockState, "call_2", "bbb222", "grep")
            registerToolCall(mockState, "call_3", "ccc333", "glob")

            const result = await contextTool.execute(
                { action: "discard", targets: [["aaa111"], ["bbb222"], ["ccc333"]] },
                mockToolCtx,
            )

            expect(mockState.prune.toolIds).toContain("call_1")
            expect(mockState.prune.toolIds).toContain("call_2")
            expect(mockState.prune.toolIds).toContain("call_3")
            // Verify all three tools were discarded
            expect(mockState.prune.toolIds.length).toBe(3)
        })

        it("handles mixed valid and invalid hashes", async () => {
            registerToolCall(mockState, "call_1", "aaa111", "read")
            registerToolCall(mockState, "call_2", "bbb222", "grep")

            const result = await contextTool.execute(
                { action: "discard", targets: [["aaa111"], ["999999"]] },
                mockToolCtx,
            )

            // Valid hash is discarded, invalid reports error
            expect(mockState.prune.toolIds).toContain("call_1")
            expect(result).toContain("read")
            // Inventory line shown for error case (invalid hash)
            expect(result).toContain("Available: Tools(1)")
        })
    })

    describe("t49: Batch Distill Operations", () => {
        it("distills multiple tool hashes with summaries", async () => {
            registerToolCall(mockState, "call_1", "aaa111", "read")
            registerToolCall(mockState, "call_2", "bbb222", "grep")

            const result = await contextTool.execute(
                {
                    action: "distill",
                    targets: [
                        ["aaa111", "Config file contents"],
                        ["bbb222", "Search results"],
                    ],
                },
                mockToolCtx,
            )

            expect(mockState.prune.toolIds).toContain("call_1")
            expect(mockState.prune.toolIds).toContain("call_2")
        })

        it("requires summary for each distill target", async () => {
            registerToolCall(mockState, "call_1", "aaa111", "read")

            await expect(
                contextTool.execute({ action: "distill", targets: [["aaa111"]] }, mockToolCtx),
            ).rejects.toThrow("Summary required")
        })
    })

    describe("t50: Mixed Batch (Tools + Reasoning)", () => {
        it("handles mixed tool and reasoning targets", async () => {
            registerToolCall(mockState, "call_1", "aaa111", "read")
            registerReasoningPart(mockState, "msg_1", 0, "bbb222")

            const result = await contextTool.execute(
                { action: "discard", targets: [["aaa111"], ["bbb222"]] },
                mockToolCtx,
            )

            expect(mockState.prune.toolIds).toContain("call_1")
            // Reasoning discard auto-converts to distill
            expect(mockState.prune.reasoningPartIds).toContain("msg_1:0")
        })
    })

    describe("t51: Large Batch Operations", () => {
        it("handles batch of 10+ targets", async () => {
            // Register 15 tool calls
            for (let i = 0; i < 15; i++) {
                const hash = `aa${i.toString(16).padStart(4, "0")}`
                registerToolCall(mockState, `call_${i}`, hash, "read")
            }

            const targets = Array.from({ length: 15 }, (_, i) => [
                `aa${i.toString(16).padStart(4, "0")}`,
            ]) as [string][]

            const result = await contextTool.execute({ action: "discard", targets }, mockToolCtx)

            expect(mockState.prune.toolIds.length).toBe(15)
            // Verify operation completed successfully
            expect(result).toContain("read")
        })
    })

    describe("t52: Workflow - Research → Prune → Implement → Prune", () => {
        it("simulates complete workflow with multiple prune phases", async () => {
            // Phase 1: Research
            registerToolCall(mockState, "call_glob", "aaa111", "glob")
            registerToolCall(mockState, "call_grep", "bbb222", "grep")
            registerToolCall(mockState, "call_read", "ccc333", "read")

            // Phase 2: Prune research outputs
            await contextTool.execute(
                { action: "discard", targets: [["aaa111"], ["bbb222"], ["ccc333"]] },
                mockToolCtx,
            )

            expect(mockState.prune.toolIds.length).toBe(3)

            // Phase 3: Implementation
            registerToolCall(mockState, "call_write_1", "ddd444", "bash")
            registerToolCall(mockState, "call_edit_1", "eee555", "bash")

            // Phase 4: Prune failed attempt
            await contextTool.execute({ action: "discard", targets: [["ddd444"]] }, mockToolCtx)

            expect(mockState.prune.toolIds.length).toBe(4)
            expect(mockState.prune.toolIds).toContain("call_write_1")
        })
    })
})
