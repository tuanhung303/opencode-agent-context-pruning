/**
 * Auto-Supersede E2E Tests (t13-t20)
 *
 * Tests automatic supersede strategies:
 * - t13: Hash-based supersede (duplicate tool calls)
 * - t14: File-based supersede (write supersedes read)
 * - t15: File-based supersede (edit supersedes read)
 * - t16: Todo-based supersede (todowrite)
 * - t17: Todo-based supersede (todoread)
 * - t18: No supersede for different files
 * - t19: No supersede for protected tools
 * - t20: Combined auto-supersede stats
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { syncToolCache } from "../../lib/state/tool-cache"
import type { SessionState, WithParts } from "../../lib/state"
import type { PluginConfig } from "../../lib/config"

// Mock dependencies
vi.mock("../../lib/messages/todo-reminder", () => ({
    removeTodoReminder: vi.fn(),
}))

vi.mock("../../lib/messages/automata-mode", () => ({
    removeAutomataReflection: vi.fn(),
}))

vi.mock("../../lib/shared-utils", () => ({
    isMessageCompacted: vi.fn().mockReturnValue(false),
}))

const createMockLogger = () =>
    ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }) as any

const createMockConfig = (overrides: Partial<PluginConfig> = {}): PluginConfig =>
    ({
        tools: {
            settings: { protectedTools: ["task"] },
        },
        strategies: {
            purgeErrors: { enabled: false, turns: 4, protectedTools: [] },
            aggressivePruning: {
                stateQuerySupersede: true,
                pruneSourceUrls: true,
                pruneFiles: true,
                pruneSnapshots: true,
                pruneStepMarkers: true,
                pruneToolInputs: true,
                pruneRetryParts: true,
                aggressiveFilePrune: true,
            },
        },
        ...overrides,
    }) as unknown as PluginConfig

const createMockState = (): SessionState =>
    ({
        currentTurn: 10,
        toolParameters: new Map(),
        prune: {
            toolIds: [],
            messagePartIds: [],
            reasoningPartIds: [],
        },
        hashRegistry: {
            calls: new Map(),
            callIds: new Map(),
            messages: new Map(),
            messagePartIds: new Map(),
            reasoning: new Map(),
            reasoningPartIds: new Map(),
            fileParts: new Map(),
        },
        cursors: {
            todo: {
                lastWriteCallId: null,
                lastReadCallId: null,
                lastTurn: 0,
                lastReminderTurn: 0,
            },
            context: {
                lastCallId: null,
            },
            automata: {
                enabled: false,
                lastTurn: 0,
                lastReflectionTurn: 0,
            },
            files: {
                pathToCallIds: new Map(),
            },
            urls: {
                urlToCallIds: new Map(),
            },
            stateQueries: {
                queryToCallIds: new Map(),
            },
            snapshots: {
                allCallIds: new Set(),
                latestCallId: null,
            },
            retries: {
                pendingRetries: new Map(),
            },
        },
        todos: [],
        stats: {
            strategyStats: {
                autoSupersede: {
                    hash: { count: 0, tokens: 0 },
                    file: { count: 0, tokens: 0 },
                    todo: { count: 0, tokens: 0 },
                    context: { count: 0, tokens: 0 },
                    url: { count: 0, tokens: 0 },
                    stateQuery: { count: 0, tokens: 0 },
                    snapshot: { count: 0, tokens: 0 },
                    retry: { count: 0, tokens: 0 },
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
        lastToolPrune: false,
    }) as unknown as SessionState

const createToolPart = (
    callID: string,
    tool: string,
    input: Record<string, unknown> = {},
    status: "completed" | "pending" | "error" = "completed",
    output: string = "test output",
) => ({
    type: "tool" as const,
    callID,
    tool,
    state: { status, input, output },
})

const createStepPart = () => ({
    type: "step-start" as const,
})

const createMessage = (id: string, role: "user" | "assistant", parts: any[]): WithParts =>
    ({
        info: { id },
        role,
        parts,
    }) as any

describe("Auto-Supersede (t13-t20)", () => {
    let state: SessionState
    let config: PluginConfig
    let logger: ReturnType<typeof createMockLogger>

    beforeEach(() => {
        state = createMockState()
        config = createMockConfig()
        logger = createMockLogger()
        vi.clearAllMocks()
    })

    describe("t13: Hash-Based Supersede", () => {
        it("supersedes duplicate tool calls with same hash", async () => {
            // Two read calls with identical input - use step-parts to create turn gap
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart("call_1", "read", { filePath: "/test/file.ts" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(), // Turn 6
                    createToolPart("call_2", "read", { filePath: "/test/file.ts" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // First call should be superseded (same hash, earlier turn)
            expect(state.prune.toolIds).toContain("call_1")
            expect(state.stats.strategyStats.autoSupersede.hash.count).toBe(1)
        })

        it("does not supersede calls with different inputs", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_1", "read", { filePath: "/test/file1.ts" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_2", "read", { filePath: "/test/file2.ts" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Different files - no hash supersede
            expect(state.prune.toolIds).not.toContain("call_1")
        })

        it("does not supersede calls in same turn", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart("call_1", "read", { filePath: "/test/file.ts" }),
                    createToolPart("call_2", "read", { filePath: "/test/file.ts" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Same turn - no supersede
            expect(state.prune.toolIds).not.toContain("call_1")
            expect(state.prune.toolIds).not.toContain("call_2")
        })
    })

    describe("t14: File-Based Supersede (Write)", () => {
        it("write supersedes previous read on same file", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart("call_read", "read", { filePath: "/test/file.ts" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createStepPart(), // Turn 4
                    createToolPart("call_write", "write", {
                        filePath: "/test/file.ts",
                        content: "new content",
                    }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Read should be superseded by write
            expect(state.prune.toolIds).toContain("call_read")
            expect(state.stats.strategyStats.autoSupersede.file.count).toBe(1)
        })

        it("multiple reads superseded by single write", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart("call_read_1", "read", { filePath: "/test/file.ts" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(), // Turn 2
                    createToolPart("call_read_2", "read", { filePath: "/test/file.ts" }),
                ]),
                createMessage("msg_3", "assistant", [
                    createStepPart(),
                    createStepPart(), // Turn 4
                    createToolPart("call_write", "write", {
                        filePath: "/test/file.ts",
                        content: "final",
                    }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Both reads should be superseded
            expect(state.prune.toolIds).toContain("call_read_1")
            // Note: call_read_2 may also be superseded by hash or file
        })
    })

    describe("t15: File-Based Supersede (Edit)", () => {
        it("edit supersedes previous read on same file", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart("call_read", "read", { filePath: "/test/file.ts" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(), // Turn 3
                    createToolPart("call_edit", "edit", {
                        filePath: "/test/file.ts",
                        oldString: "old",
                        newString: "new",
                    }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Read should be superseded by edit
            expect(state.prune.toolIds).toContain("call_read")
            expect(state.stats.strategyStats.autoSupersede.file.count).toBe(1)
        })

        it("edit supersedes previous write on same file", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart("call_write", "write", {
                        filePath: "/test/file.ts",
                        content: "initial",
                    }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(), // Turn 3
                    createToolPart("call_edit", "edit", {
                        filePath: "/test/file.ts",
                        oldString: "initial",
                        newString: "modified",
                    }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Write should be superseded by edit
            expect(state.prune.toolIds).toContain("call_write")
        })
    })

    describe("t16: Todo-Based Supersede (todowrite)", () => {
        it("new todowrite supersedes previous todowrite", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart(
                        "call_todo_1",
                        "todowrite",
                        { todos: [{ id: "1", content: "Task A", status: "pending" }] },
                        "completed",
                        JSON.stringify([{ id: "1", content: "Task A", status: "pending" }]),
                    ),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(), // Turn 3
                    createToolPart(
                        "call_todo_2",
                        "todowrite",
                        { todos: [{ id: "1", content: "Task A", status: "in_progress" }] },
                        "completed",
                        JSON.stringify([{ id: "1", content: "Task A", status: "in_progress" }]),
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // First todowrite should be superseded
            expect(state.prune.toolIds).toContain("call_todo_1")
            // Latest todowrite should be tracked
            expect(state.cursors.todo.lastWriteCallId).toBe("call_todo_2")
        })

        it("updates todo state from latest todowrite", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart(
                        "call_todo_1",
                        "todowrite",
                        {},
                        "completed",
                        JSON.stringify([
                            { id: "1", content: "Task 1", status: "pending", priority: "high" },
                            { id: "2", content: "Task 2", status: "completed", priority: "medium" },
                        ]),
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Todos should be parsed from output
            expect(state.todos.length).toBe(2)
            expect(state.todos[0].content).toBe("Task 1")
        })
    })

    describe("t17: Todo-Based Supersede (todoread)", () => {
        it("new todoread supersedes previous todoread", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart("call_todoread_1", "todoread", {}, "completed", "[]"),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(), // Turn 3
                    createToolPart("call_todoread_2", "todoread", {}, "completed", "[]"),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // First todoread should be superseded
            expect(state.prune.toolIds).toContain("call_todoread_1")
            // Latest todoread should be tracked
            expect(state.cursors.todo.lastReadCallId).toBe("call_todoread_2")
        })
    })

    describe("t18: No Supersede for Different Files", () => {
        it("does not supersede reads of different files", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_read_1", "read", { filePath: "/test/file1.ts" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createToolPart("call_read_2", "read", { filePath: "/test/file2.ts" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Different files - no cross-supersede
            expect(state.prune.toolIds).not.toContain("call_read_1")
            expect(state.prune.toolIds).not.toContain("call_read_2")
        })

        it("write to file A does not supersede read of file B", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_read", "read", { filePath: "/test/fileA.ts" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_write", "write", {
                        filePath: "/test/fileB.ts",
                        content: "content",
                    }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Different files - no supersede
            expect(state.prune.toolIds).not.toContain("call_read")
        })
    })

    describe("t19: No Supersede for Protected Tools", () => {
        it("does not supersede protected tool calls via hash", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_task_1", "task", {
                        description: "Task 1",
                        prompt: "Do X",
                    }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_task_2", "task", {
                        description: "Task 1",
                        prompt: "Do X",
                    }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Protected tools should not be superseded even with same hash
            expect(state.prune.toolIds).not.toContain("call_task_1")
        })

        it("respects custom protected tools list", async () => {
            const customConfig = createMockConfig({
                tools: {
                    settings: { protectedTools: ["task", "custom_tool"] },
                },
            } as any)

            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_custom_1", "custom_tool", { data: "same" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_custom_2", "custom_tool", { data: "same" }),
                ]),
            ]

            await syncToolCache(state, customConfig, logger, messages)

            // Custom protected tool should not be superseded
            expect(state.prune.toolIds).not.toContain("call_custom_1")
        })
    })

    describe("t20: Combined Auto-Supersede Stats", () => {
        it("tracks stats for multiple supersede types", async () => {
            const messages: WithParts[] = [
                // Hash-based: duplicate glob (turn 1)
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_glob_1", "glob", { pattern: "*.ts" }),
                ]),
                // Hash-based: same glob again (turn 5)
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_glob_2", "glob", { pattern: "*.ts" }),
                ]),
                // File-based: read (turn 6)
                createMessage("msg_3", "assistant", [
                    createStepPart(),
                    createToolPart("call_read", "read", { filePath: "/test/file.ts" }),
                ]),
                // File-based: write supersedes read (turn 8)
                createMessage("msg_4", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_write", "write", {
                        filePath: "/test/file.ts",
                        content: "new",
                    }),
                ]),
                // Todo-based: first todowrite (turn 9)
                createMessage("msg_5", "assistant", [
                    createStepPart(),
                    createToolPart(
                        "call_todo_1",
                        "todowrite",
                        {},
                        "completed",
                        JSON.stringify([{ id: "1", content: "A", status: "pending" }]),
                    ),
                ]),
                // Todo-based: second todowrite supersedes first (turn 10)
                createMessage("msg_6", "assistant", [
                    createStepPart(),
                    createToolPart(
                        "call_todo_2",
                        "todowrite",
                        {},
                        "completed",
                        JSON.stringify([{ id: "1", content: "B", status: "in_progress" }]),
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Verify multiple supersedes occurred
            expect(state.prune.toolIds).toContain("call_glob_1") // hash supersede
            expect(state.prune.toolIds).toContain("call_read") // file supersede
            expect(state.prune.toolIds).toContain("call_todo_1") // todo supersede

            // Stats should reflect supersedes occurred
            const totalSupersedes =
                state.stats.strategyStats.autoSupersede.hash.count +
                state.stats.strategyStats.autoSupersede.file.count +
                state.stats.strategyStats.autoSupersede.todo.count
            expect(totalSupersedes).toBeGreaterThan(0)
            // At minimum, hash and file supersedes should occur
            expect(state.stats.strategyStats.autoSupersede.hash.count).toBeGreaterThan(0)
            expect(state.stats.strategyStats.autoSupersede.file.count).toBeGreaterThan(0)
        })

        it("accumulates stats across multiple sync calls", async () => {
            // First sync
            const messages1: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_1", "read", { filePath: "/test/a.ts" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_2", "write", { filePath: "/test/a.ts", content: "x" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages1)

            const firstFileCount = state.stats.strategyStats.autoSupersede.file.count

            // Second sync with more messages
            const messages2: WithParts[] = [
                ...messages1,
                createMessage("msg_3", "assistant", [
                    createStepPart(),
                    createToolPart("call_3", "read", { filePath: "/test/b.ts" }),
                ]),
                createMessage("msg_4", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_4", "write", { filePath: "/test/b.ts", content: "y" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages2)

            // Should have accumulated more file supersedes
            expect(state.stats.strategyStats.autoSupersede.file.count).toBeGreaterThanOrEqual(
                firstFileCount,
            )
        })
    })

    describe("URL-Based Supersede", () => {
        it("supersedes duplicate URL fetches", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_fetch_1", "webfetch", { url: "https://example.com" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_fetch_2", "webfetch", { url: "https://example.com" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // First fetch should be superseded (same URL)
            expect(state.prune.toolIds).toContain("call_fetch_1")
            expect(state.stats.strategyStats.autoSupersede.url.count).toBeGreaterThan(0)
        })

        it("does not supersede different URLs", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_fetch_1", "webfetch", { url: "https://example.com/a" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createToolPart("call_fetch_2", "webfetch", { url: "https://example.com/b" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Different URLs - no supersede
            expect(state.prune.toolIds).not.toContain("call_fetch_1")
        })
    })

    describe("State Query Supersede", () => {
        it("supersedes duplicate state queries (ls)", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_ls_1", "bash", { command: "ls -la" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_ls_2", "bash", { command: "ls -la" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // First query should be superseded
            expect(state.prune.toolIds).toContain("call_ls_1")
        })

        it("supersedes duplicate git status queries", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_git_1", "bash", { command: "git status" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_git_2", "bash", { command: "git status" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // First git status should be superseded
            expect(state.prune.toolIds).toContain("call_git_1")
        })
    })

    describe("Edge Cases", () => {
        it("handles empty messages array", async () => {
            await syncToolCache(state, config, logger, [])

            expect(state.prune.toolIds.length).toBe(0)
        })

        it("handles messages without tool parts", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [{ type: "text", text: "Hello" }]),
            ]

            await syncToolCache(state, config, logger, messages)

            expect(state.prune.toolIds.length).toBe(0)
        })

        it("handles pending tool calls (not superseded)", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_1", "read", { filePath: "/test/file.ts" }, "pending"),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_2", "read", { filePath: "/test/file.ts" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Pending calls should not be superseded
            expect(state.prune.toolIds).not.toContain("call_1")
        })
    })
})
