/**
 * Smoke Test for ACP E2E Infrastructure
 *
 * This test verifies that the E2E test infrastructure works correctly
 * WITHOUT making actual LLM calls. It tests:
 * 1. XDG isolation setup
 * 2. State seeding and reading
 * 3. State verification functions
 * 4. Context tool execution with mocked client
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { createTempDir, createXDGDirs } from "../fixtures/tmpdir"
import {
    createMockClient,
    createMockLogger,
    createMockConfig,
    createMockState,
    registerToolCall,
    registerMessagePart,
} from "../fixtures/mock-client"
import { seedACPState, seedStateWithTools, readACPState } from "../fixtures/seed-state"
import { verifyACPState, verifyE2EState, listACPSessions } from "../../scripts/verify-state"

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

import { createContextTool } from "../../lib/strategies/context"

describe("E2E Smoke Test", () => {
    describe("Infrastructure Verification", () => {
        it("creates isolated XDG directories", async () => {
            const xdg = await createXDGDirs()
            try {
                expect(xdg.root).toBeTruthy()
                expect(xdg.data).toContain("share")
                expect(xdg.config).toContain("config")
                expect(xdg.env.XDG_DATA_HOME).toBe(xdg.data)
                expect(xdg.env.OPENCODE_DISABLE_SHARE).toBe("true")
            } finally {
                await xdg.cleanup()
            }
        })

        it("seeds and reads ACP state correctly", async () => {
            const tmp = await createTempDir()
            try {
                // Seed state
                const { state: seeded } = await seedACPState(tmp.path, "smoke-test", {
                    currentTurn: 5,
                })

                // Read it back
                const read = await readACPState(tmp.path, "smoke-test")

                expect(read).not.toBeNull()
                expect(read?.sessionId).toBe("smoke-test")
                expect(read?.currentTurn).toBe(5)
            } finally {
                await tmp.cleanup()
            }
        })

        it("seeds state with pre-registered tools", async () => {
            const tmp = await createTempDir()
            try {
                const { state } = await seedStateWithTools(tmp.path, "tool-test", [
                    { callId: "call_1", hash: "abc123", toolName: "read" },
                    { callId: "call_2", hash: "def456", toolName: "grep" },
                ])

                expect(state.hashRegistry.calls.get("abc123")).toBe("call_1")
                expect(state.hashRegistry.calls.get("def456")).toBe("call_2")
                expect(state.toolParameters.get("call_1")?.tool).toBe("read")
            } finally {
                await tmp.cleanup()
            }
        })

        it("verifies state correctly", async () => {
            const tmp = await createTempDir()
            try {
                await seedACPState(tmp.path, "verify-test")
                const result = await verifyACPState(tmp.path, "verify-test")

                expect(result.valid).toBe(true)
                expect(result.state).not.toBeNull()
            } finally {
                await tmp.cleanup()
            }
        })

        it("lists multiple sessions", async () => {
            const tmp = await createTempDir()
            try {
                await seedACPState(tmp.path, "session-a")
                await seedACPState(tmp.path, "session-b")

                const sessions = await listACPSessions(tmp.path)

                expect(sessions).toContain("session-a")
                expect(sessions).toContain("session-b")
            } finally {
                await tmp.cleanup()
            }
        })
    })

    describe("Context Tool Integration", () => {
        let mockState: ReturnType<typeof createMockState>
        let mockClient: ReturnType<typeof createMockClient>
        let mockLogger: ReturnType<typeof createMockLogger>
        let mockConfig: ReturnType<typeof createMockConfig>
        let mockToolCtx: any

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
        })

        it("creates context tool with mock dependencies", () => {
            const tool = createContextTool({
                client: mockClient as any,
                state: mockState,
                logger: mockLogger as any,
                config: mockConfig as any,
                workingDirectory: "/test",
            })

            expect(tool).toBeDefined()
            expect(tool.execute).toBeDefined()
        })

        it("discards tool by hash", async () => {
            // Register a tool
            registerToolCall(mockState, "call_1", "abc123", "read")

            const tool = createContextTool({
                client: mockClient as any,
                state: mockState,
                logger: mockLogger as any,
                config: mockConfig as any,
                workingDirectory: "/test",
            })

            const result = await tool.execute(
                { action: "discard", targets: [["abc123"]] },
                mockToolCtx,
            )

            expect(result).toContain("discard")
            expect(mockState.prune.toolIds).toContain("call_1")
        })

        it("discards message part by hash", async () => {
            // Register a message part
            registerMessagePart(mockState, "msg_1", 0, "def456")

            const tool = createContextTool({
                client: mockClient as any,
                state: mockState,
                logger: mockLogger as any,
                config: mockConfig as any,
                workingDirectory: "/test",
            })

            const result = await tool.execute(
                { action: "discard", targets: [["def456"]] },
                mockToolCtx,
            )

            expect(result).toContain("discard")
            expect(mockState.prune.messagePartIds).toContain("msg_1:0")
        })

        it("rejects protected tools", async () => {
            // Register a protected tool (task) with valid 6-char hex hash
            registerToolCall(mockState, "call_task", "aaa111", "task")

            const tool = createContextTool({
                client: mockClient as any,
                state: mockState,
                logger: mockLogger as any,
                config: mockConfig as any,
                workingDirectory: "/test",
            })

            await expect(
                tool.execute({ action: "discard", targets: [["aaa111"]] }, mockToolCtx),
            ).rejects.toThrow("protected")
        })

        it("handles mixed targets (tool + message)", async () => {
            registerToolCall(mockState, "call_1", "bbb222", "read")
            registerMessagePart(mockState, "msg_1", 0, "ccc333")

            const tool = createContextTool({
                client: mockClient as any,
                state: mockState,
                logger: mockLogger as any,
                config: mockConfig as any,
                workingDirectory: "/test",
            })

            const result = await tool.execute(
                { action: "discard", targets: [["bbb222"], ["ccc333"]] },
                mockToolCtx,
            )

            expect(mockState.prune.toolIds).toContain("call_1")
            expect(mockState.prune.messagePartIds).toContain("msg_1:0")
        })
    })

    describe("E2E Verification Functions", () => {
        it("verifies pruned tools correctly", () => {
            const state = createMockState()
            state.prune.toolIds = ["call_1", "call_2"]

            const result = verifyE2EState(state, {
                prunedTools: ["call_1", "call_2"],
            })

            expect(result.pass).toBe(true)
        })

        it("verifies pruned messages correctly", () => {
            const state = createMockState()
            state.prune.messagePartIds = ["msg_1:0", "msg_2:0"]

            const result = verifyE2EState(state, {
                prunedMessages: ["msg_1:0"],
            })

            expect(result.pass).toBe(true)
        })

        it("verifies registered hashes correctly", () => {
            const state = createMockState()
            state.hashRegistry.calls.set("abc123", "call_1")
            state.hashRegistry.messages.set("def456", "msg_1:0")

            const result = verifyE2EState(state, {
                registeredHashes: [
                    { hash: "abc123", type: "tool" },
                    { hash: "def456", type: "message" },
                ],
            })

            expect(result.pass).toBe(true)
        })

        it("verifies todos correctly", () => {
            const state = createMockState()
            state.todos = [
                { id: "1", content: "Task 1", status: "completed", priority: "high" },
                { id: "2", content: "Task 2", status: "in_progress", priority: "medium" },
            ]

            const result = verifyE2EState(state, {
                todos: { count: 2, hasInProgress: true, completedCount: 1 },
            })

            expect(result.pass).toBe(true)
        })

        it("collects errors for failed verifications", () => {
            const state = createMockState()

            const result = verifyE2EState(state, {
                prunedTools: ["missing_call"],
                todos: { count: 5 },
            })

            expect(result.pass).toBe(false)
            expect(result.errors.length).toBeGreaterThan(0)
        })
    })
})
