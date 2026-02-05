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

const createMockConfig = (): PluginConfig =>
    ({
        tools: {
            settings: { protectedTools: [] },
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

describe("tool-cache auto-supersede", () => {
    let state: SessionState
    let config: PluginConfig
    let logger: ReturnType<typeof createMockLogger>

    beforeEach(() => {
        state = createMockState()
        config = createMockConfig()
        logger = createMockLogger()
        vi.clearAllMocks()
    })

    describe("hash-based supersede", () => {
        it("should supersede old tool call when same hash is encountered", async () => {
            // Don't pre-populate - let syncToolCache process both calls
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart("call_001", "read", { filePath: "/src/app.ts" }),
                ]),
                createMessage("msg2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(), // Turn 6
                    createToolPart("call_002", "read", { filePath: "/src/app.ts" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Old call should be pruned
            expect(state.prune.toolIds.includes("call_001")).toBe(true)
            // New call should have the hash
            expect(state.hashRegistry.callIds.get("call_002")).toBeDefined()
            // Stats should be updated
            expect(state.stats.strategyStats.autoSupersede.hash.count).toBe(1)
        })

        it("should not supersede if old call is in same turn", async () => {
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart("call_001", "read", { filePath: "/src/app.ts" }),
                    createToolPart("call_002", "read", { filePath: "/src/app.ts" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Neither should be pruned (same turn)
            expect(state.prune.toolIds.includes("call_001")).toBe(false)
            expect(state.prune.toolIds.includes("call_002")).toBe(false)
        })
    })

    describe("file-based supersede", () => {
        it("should supersede old read when write to same file occurs", async () => {
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart("call_001", "read", { filePath: "/src/app.ts" }),
                ]),
                createMessage("msg2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createStepPart(), // Turn 4
                    createToolPart("call_002", "write", {
                        filePath: "/src/app.ts",
                        content: "new",
                    }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Old read should be superseded
            expect(state.prune.toolIds.includes("call_001")).toBe(true)
            // Stats should be updated
            expect(state.stats.strategyStats.autoSupersede.file.count).toBe(1)
        })

        it("should supersede old read when edit to same file occurs", async () => {
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart("call_001", "read", { filePath: "/src/app.ts" }),
                ]),
                createMessage("msg2", "assistant", [
                    createStepPart(),
                    createStepPart(), // Turn 3
                    createToolPart("call_002", "edit", {
                        filePath: "/src/app.ts",
                        oldString: "a",
                        newString: "b",
                    }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            expect(state.prune.toolIds.includes("call_001")).toBe(true)
            expect(state.stats.strategyStats.autoSupersede.file.count).toBe(1)
        })

        it("should not supersede reads for different files", async () => {
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart("call_001", "read", { filePath: "/src/app.ts" }),
                ]),
                createMessage("msg2", "assistant", [
                    createStepPart(),
                    createStepPart(), // Turn 3
                    createToolPart("call_002", "write", {
                        filePath: "/src/other.ts",
                        content: "new",
                    }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Should NOT be superseded (different file)
            expect(state.prune.toolIds.includes("call_001")).toBe(false)
            expect(state.stats.strategyStats.autoSupersede.file.count).toBe(0)
        })

        it("should handle glob patterns as file keys", async () => {
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart("call_001", "glob", { pattern: "**/*.ts", path: "/src" }),
                ]),
                createMessage("msg2", "assistant", [
                    createStepPart(),
                    createStepPart(), // Turn 3
                    createToolPart("call_002", "glob", { pattern: "**/*.ts", path: "/src" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Hash-based supersede should trigger for identical glob
            expect(state.prune.toolIds.includes("call_001")).toBe(true)
            expect(state.stats.strategyStats.autoSupersede.hash.count).toBe(1)
        })
    })

    describe("todo-based supersede", () => {
        it("should supersede old todowrite calls when new one appears", async () => {
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart(
                        "call_001",
                        "todowrite",
                        { todos: [] },
                        "completed",
                        JSON.stringify([
                            { id: "1", content: "task1", status: "pending", priority: "high" },
                        ]),
                    ),
                ]),
                createMessage("msg2", "assistant", [
                    createStepPart(),
                    createStepPart(), // Turn 3
                    createToolPart(
                        "call_002",
                        "todowrite",
                        { todos: [] },
                        "completed",
                        JSON.stringify([
                            { id: "1", content: "task1", status: "completed", priority: "high" },
                        ]),
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Old todowrite should be superseded
            expect(state.prune.toolIds.includes("call_001")).toBe(true)
            // Latest todowrite should be tracked
            expect(state.cursors.todo.lastWriteCallId).toBe("call_002")
        })

        it("should supersede old todoread calls when new one appears", async () => {
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart("call_001", "todoread", {}, "completed", "[]"),
                ]),
                createMessage("msg2", "assistant", [
                    createStepPart(),
                    createStepPart(), // Turn 3
                    createToolPart("call_002", "todoread", {}, "completed", "[]"),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Old todoread should be superseded
            expect(state.prune.toolIds.includes("call_001")).toBe(true)
            // Latest todoread should be tracked
            expect(state.cursors.todo.lastReadCallId).toBe("call_002")
        })

        it("should update todo state from latest todowrite", async () => {
            const todos = [
                { id: "1", content: "task1", status: "completed", priority: "high" },
                { id: "2", content: "task2", status: "pending", priority: "medium" },
            ]

            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(),
                    createToolPart(
                        "call_001",
                        "todowrite",
                        { todos },
                        "completed",
                        JSON.stringify(todos),
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            expect(state.todos).toEqual(todos)
            expect(state.cursors.todo.lastTurn).toBe(1)
        })

        it("should set inProgressSince when task transitions to in_progress", async () => {
            // Initial state: task is pending
            state.todos = [{ id: "1", content: "task1", status: "pending", priority: "high" }]

            const newTodos = [
                { id: "1", content: "task1", status: "in_progress", priority: "high" },
            ]

            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createStepPart(), // Turn 3
                    createToolPart(
                        "call_001",
                        "todowrite",
                        { todos: newTodos },
                        "completed",
                        JSON.stringify(newTodos),
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            expect(state.todos[0].status).toBe("in_progress")
            expect(state.todos[0].inProgressSince).toBe(3) // Set to turn when todowrite was called
        })

        it("should preserve inProgressSince when task stays in_progress", async () => {
            // Initial state: task already in_progress since turn 2
            state.todos = [
                {
                    id: "1",
                    content: "task1",
                    status: "in_progress",
                    priority: "high",
                    inProgressSince: 2,
                },
            ]

            const newTodos = [
                { id: "1", content: "task1 (updated)", status: "in_progress", priority: "high" },
            ]

            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(), // Turn 5
                    createToolPart(
                        "call_001",
                        "todowrite",
                        { todos: newTodos },
                        "completed",
                        JSON.stringify(newTodos),
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            expect(state.todos[0].status).toBe("in_progress")
            expect(state.todos[0].inProgressSince).toBe(2) // Preserved from original
        })

        it("should not set inProgressSince for non-in_progress tasks", async () => {
            const todos = [
                { id: "1", content: "task1", status: "completed", priority: "high" },
                { id: "2", content: "task2", status: "pending", priority: "medium" },
            ]

            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(),
                    createToolPart(
                        "call_001",
                        "todowrite",
                        { todos },
                        "completed",
                        JSON.stringify(todos),
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            expect(state.todos[0].inProgressSince).toBeUndefined()
            expect(state.todos[1].inProgressSince).toBeUndefined()
        })
    })

    describe("context-based supersede", () => {
        it("should supersede old context calls when new one appears", async () => {
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart(
                        "call_001",
                        "context",
                        { action: "discard", targets: [["abc123"]] },
                        "completed",
                        "Discarded 1 item",
                    ),
                ]),
                createMessage("msg2", "assistant", [
                    createStepPart(),
                    createStepPart(), // Turn 3
                    createToolPart(
                        "call_002",
                        "context",
                        { action: "distill", targets: [["def456", "summary"]] },
                        "completed",
                        "Distilled 1 item",
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Old context should be superseded
            expect(state.prune.toolIds.includes("call_001")).toBe(true)
            // Latest context should be tracked
            expect(state.cursors.context.lastCallId).toBe("call_002")
            // Stats should be updated
            expect(state.stats.strategyStats.autoSupersede.context.count).toBe(1)
        })

        it("should not supersede if only one context call exists", async () => {
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart(
                        "call_001",
                        "context",
                        { action: "discard", targets: [["abc123"]] },
                        "completed",
                        "Discarded 1 item",
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Should not be pruned (only one call)
            expect(state.prune.toolIds.includes("call_001")).toBe(false)
            // Should still track the latest
            expect(state.cursors.context.lastCallId).toBe("call_001")
            expect(state.stats.strategyStats.autoSupersede.context.count).toBe(0)
        })

        it("should supersede multiple old context calls", async () => {
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart(
                        "call_001",
                        "context",
                        { action: "discard", targets: [["abc123"]] },
                        "completed",
                        "Discarded 1 item",
                    ),
                ]),
                createMessage("msg2", "assistant", [
                    createStepPart(), // Turn 2
                    createToolPart(
                        "call_002",
                        "context",
                        { action: "distill", targets: [["def456", "summary"]] },
                        "completed",
                        "Distilled 1 item",
                    ),
                ]),
                createMessage("msg3", "assistant", [
                    createStepPart(), // Turn 3
                    createToolPart(
                        "call_003",
                        "context",
                        { action: "discard", targets: [["ghi789"]] },
                        "completed",
                        "Discarded 1 item",
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Both old context calls should be superseded
            expect(state.prune.toolIds.includes("call_001")).toBe(true)
            expect(state.prune.toolIds.includes("call_002")).toBe(true)
            // Latest should not be pruned
            expect(state.prune.toolIds.includes("call_003")).toBe(false)
            // Latest context should be tracked
            expect(state.cursors.context.lastCallId).toBe("call_003")
            // Stats should reflect both supersedes
            expect(state.stats.strategyStats.autoSupersede.context.count).toBe(2)
        })
    })

    describe("protection rules", () => {
        it("should not supersede protected tools", async () => {
            config.tools.settings.protectedTools = ["read"]

            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(),
                    createToolPart("call_001", "read", { filePath: "/src/app.ts" }),
                ]),
                createMessage("msg2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_002", "read", { filePath: "/src/app.ts" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Protected tools should not be superseded
            expect(state.prune.toolIds.includes("call_001")).toBe(false)
            expect(state.stats.strategyStats.autoSupersede.hash.count).toBe(0)
        })
    })

    describe("URL-based supersede", () => {
        it("should supersede old webfetch for same URL", async () => {
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(), // Turn 1
                    createToolPart("call_001", "webfetch", { url: "https://api.example.com/data" }),
                ]),
                createMessage("msg2", "assistant", [
                    createStepPart(),
                    createStepPart(), // Turn 3
                    createToolPart("call_002", "webfetch", { url: "https://api.example.com/data" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Old webfetch should be superseded
            expect(state.prune.toolIds.includes("call_001")).toBe(true)
            expect(
                state.cursors.urls.urlToCallIds
                    .get("https://api.example.com/data")
                    ?.has("call_002"),
            ).toBe(true)
            expect(state.stats.strategyStats.autoSupersede.url.count).toBe(1)
        })

        it("should not supersede webfetch for different URLs", async () => {
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(),
                    createToolPart("call_001", "webfetch", { url: "https://api1.example.com" }),
                ]),
                createMessage("msg2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_002", "webfetch", { url: "https://api2.example.com" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Should NOT be superseded (different URLs)
            expect(state.prune.toolIds.includes("call_001")).toBe(false)
            expect(state.stats.strategyStats.autoSupersede.url.count).toBe(0)
        })
    })

    describe("state query supersede", () => {
        it("should supersede old state query for same command", async () => {
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(),
                    createToolPart("call_001", "bash", { command: "git status" }),
                ]),
                createMessage("msg2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_002", "bash", { command: "git status" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Old git status should be superseded
            expect(state.prune.toolIds.includes("call_001")).toBe(true)
            // Key format is "bash:git:status" not "git status"
            expect(
                state.cursors.stateQueries.queryToCallIds.get("bash:git:status")?.has("call_002"),
            ).toBe(true)
            expect(state.stats.strategyStats.autoSupersede.stateQuery.count).toBe(1)
        })

        it("should not supersede different state queries", async () => {
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(),
                    createToolPart("call_001", "bash", { command: "git status" }),
                ]),
                createMessage("msg2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_002", "bash", { command: "git log -5" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Should NOT be superseded (different commands)
            expect(state.prune.toolIds.includes("call_001")).toBe(false)
            expect(state.stats.strategyStats.autoSupersede.stateQuery.count).toBe(0)
        })
    })

    describe("snapshot supersede", () => {
        it("should supersede all previous snapshots when new one appears", async () => {
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(),
                    createToolPart("call_001", "snapshot", { name: "snapshot1" }),
                ]),
                createMessage("msg2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_002", "snapshot", { name: "snapshot2" }),
                ]),
                createMessage("msg3", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_003", "snapshot", { name: "snapshot3" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // All old snapshots should be superseded
            expect(state.prune.toolIds.includes("call_001")).toBe(true)
            expect(state.prune.toolIds.includes("call_002")).toBe(true)
            expect(state.prune.toolIds.includes("call_003")).toBe(false)
            // Latest should be tracked
            expect(state.cursors.snapshots.latestCallId).toBe("call_003")
            expect(state.stats.strategyStats.autoSupersede.snapshot.count).toBe(2)
        })

        it("should keep only latest snapshot in allCallIds", async () => {
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(),
                    createToolPart("call_001", "snapshot", {}),
                ]),
                createMessage("msg2", "assistant", [
                    createStepPart(),
                    createToolPart("call_002", "snapshot", {}),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            expect(state.cursors.snapshots.allCallIds.has("call_001")).toBe(false)
            expect(state.cursors.snapshots.allCallIds.has("call_002")).toBe(true)
        })
    })

    describe("retry supersede", () => {
        it("should track failed tool calls for retry tracking", async () => {
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(),
                    createToolPart(
                        "call_001",
                        "read",
                        { filePath: "/test.txt" },
                        "error",
                        "File not found",
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Failed call should be tracked for retry
            expect(state.cursors.retries.pendingRetries.size).toBeGreaterThan(0)
        })

        it("should supersede failed call when retry succeeds", async () => {
            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(),
                    createToolPart("call_001", "read", { filePath: "/test.txt" }, "error", "Error"),
                ]),
                createMessage("msg2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart(
                        "call_002",
                        "read",
                        { filePath: "/test.txt" },
                        "completed",
                        "Content",
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Failed call should be superseded by successful retry
            expect(state.prune.toolIds.includes("call_001")).toBe(true)
            expect(state.stats.strategyStats.autoSupersede.retry.count).toBe(1)
        })
    })

    describe("hash cleanup during eviction", () => {
        it("should remove hash mappings when evicting from cache", async () => {
            // Fill cache to trigger eviction
            for (let i = 0; i < 1100; i++) {
                state.toolParameters.set(`call_${i}`, {
                    tool: "read",
                    parameters: { filePath: `/file${i}.txt` },
                    turn: 1,
                })
            }

            // Add hash mappings
            state.hashRegistry.callIds.set("call_0", "hash_0")
            state.hashRegistry.calls.set("hash_0", "call_0")
            state.hashRegistry.callIds.set("call_1", "hash_1")
            state.hashRegistry.calls.set("hash_1", "call_1")

            const { trimToolParametersCache } = await import("../../lib/state/tool-cache")
            trimToolParametersCache(state)

            // Hash mappings for evicted entries should be cleaned up
            expect(state.hashRegistry.callIds.has("call_0")).toBe(false)
            expect(state.hashRegistry.calls.has("hash_0")).toBe(false)
            expect(state.hashRegistry.callIds.has("call_1")).toBe(false)
            expect(state.hashRegistry.calls.has("hash_1")).toBe(false)
        })
    })

    describe("trimToolParametersCache", () => {
        let state: SessionState

        beforeEach(() => {
            state = createMockState()
        })

        it("should remove entries beyond MAX_TOOL_CACHE_SIZE", async () => {
            const { trimToolParametersCache } = await import("../../lib/state/tool-cache")

            // Add more than MAX_TOOL_CACHE_SIZE entries
            for (let i = 0; i < 2001; i++) {
                state.toolParameters.set(`call-${i}`, {
                    tool: "test",
                    parameters: { index: i },
                    turn: 1,
                })
            }

            trimToolParametersCache(state)

            // Should only keep 1000 newest
            expect(state.toolParameters.size).toBe(1000)
            expect(state.toolParameters.has("call-0")).toBe(false)
            expect(state.toolParameters.has("call-1999")).toBe(true)
        })

        it("should not remove entries when under MAX_TOOL_CACHE_SIZE", async () => {
            const { trimToolParametersCache } = await import("../../lib/state/tool-cache")

            state.toolParameters.set("call-1", { tool: "test", parameters: {}, turn: 1 })
            state.toolParameters.set("call-2", { tool: "test", parameters: {}, turn: 1 })

            trimToolParametersCache(state)

            expect(state.toolParameters.size).toBe(2)
        })

        it("should clean up file cursor references when evicting entries", async () => {
            const { trimToolParametersCache } = await import("../../lib/state/tool-cache")

            // Set up cursor references - add call-old FIRST so it's evicted (FIFO)
            state.cursors.files.pathToCallIds.set(
                "/test/file.ts",
                new Set(["call-old", "call-new"]),
            )
            state.toolParameters.set("call-old", {
                tool: "write",
                parameters: { path: "/test/file.ts" },
                turn: 1,
            })
            // Fill cache to trigger eviction
            for (let i = 0; i < 1001; i++) {
                state.toolParameters.set(`fill-${i}`, { tool: "test", parameters: {}, turn: 1 })
            }
            state.toolParameters.set("call-new", {
                tool: "write",
                parameters: { path: "/test/file.ts" },
                turn: 2,
            })
            state.toolParameters.set("call-new", {
                tool: "write",
                parameters: { path: "/test/file.ts" },
                turn: 2,
            })

            // Force eviction of old entry
            trimToolParametersCache(state)

            // Verify cursor is updated - should only have call-new
            expect(state.cursors.files.pathToCallIds.get("/test/file.ts")?.has("call-old")).toBe(
                false,
            )
            expect(state.cursors.files.pathToCallIds.get("/test/file.ts")?.has("call-new")).toBe(
                true,
            )
        })

        it("should clean up URL cursor references when evicting entries", async () => {
            const { trimToolParametersCache } = await import("../../lib/state/tool-cache")

            // Set up URL cursor references - add call-old FIRST so it's evicted (FIFO)
            state.cursors.urls.urlToCallIds.set(
                "https://example.com",
                new Set(["call-old", "call-new"]),
            )
            state.toolParameters.set("call-old", {
                tool: "webfetch",
                parameters: { url: "https://example.com" },
                turn: 1,
            })
            // Fill cache to trigger eviction
            for (let i = 0; i < 1001; i++) {
                state.toolParameters.set(`fill-${i}`, { tool: "test", parameters: {}, turn: 1 })
            }
            state.toolParameters.set("call-new", {
                tool: "webfetch",
                parameters: { url: "https://example.com" },
                turn: 2,
            })

            // Force eviction
            trimToolParametersCache(state)

            // Verify URL cursor is updated
            expect(
                state.cursors.urls.urlToCallIds.get("https://example.com")?.has("call-old"),
            ).toBe(false)
            expect(
                state.cursors.urls.urlToCallIds.get("https://example.com")?.has("call-new"),
            ).toBe(true)
        })

        it("should clean up state query cursor references when evicting entries", async () => {
            const { trimToolParametersCache } = await import("../../lib/state/tool-cache")

            // Set up state query cursor references - add call-old FIRST so it's evicted (FIFO)
            state.cursors.stateQueries.queryToCallIds.set(
                "git status",
                new Set(["call-old", "call-new"]),
            )
            state.toolParameters.set("call-old", {
                tool: "bash",
                parameters: { command: "git status" },
                turn: 1,
            })
            // Fill cache to trigger eviction
            for (let i = 0; i < 1001; i++) {
                state.toolParameters.set(`fill-${i}`, { tool: "test", parameters: {}, turn: 1 })
            }
            state.toolParameters.set("call-new", {
                tool: "bash",
                parameters: { command: "git status" },
                turn: 2,
            })

            // Force eviction
            trimToolParametersCache(state)

            // Verify state query cursor is updated
            expect(
                state.cursors.stateQueries.queryToCallIds.get("git status")?.has("call-old"),
            ).toBe(false)
            expect(
                state.cursors.stateQueries.queryToCallIds.get("git status")?.has("call-new"),
            ).toBe(true)
        })

        it("should clean up snapshot cursor references when evicting entries", async () => {
            const { trimToolParametersCache } = await import("../../lib/state/tool-cache")

            // Set up snapshot cursor references - add call-old FIRST so it's evicted (FIFO)
            state.cursors.snapshots.allCallIds.add("call-old")
            state.cursors.snapshots.allCallIds.add("call-new")
            state.cursors.snapshots.latestCallId = "call-new"
            state.toolParameters.set("call-old", {
                tool: "snapshot",
                parameters: {},
                turn: 1,
            })
            // Fill cache to trigger eviction
            for (let i = 0; i < 1001; i++) {
                state.toolParameters.set(`fill-${i}`, { tool: "test", parameters: {}, turn: 1 })
            }
            state.toolParameters.set("call-new", {
                tool: "snapshot",
                parameters: {},
                turn: 2,
            })

            // Force eviction
            trimToolParametersCache(state)

            // Verify snapshot cursors are updated
            expect(state.cursors.snapshots.allCallIds.has("call-old")).toBe(false)
            expect(state.cursors.snapshots.allCallIds.has("call-new")).toBe(true)
            expect(state.cursors.snapshots.latestCallId).toBe("call-new")
        })

        it("should update latestCallId when latest snapshot is evicted", async () => {
            const { trimToolParametersCache } = await import("../../lib/state/tool-cache")

            // Set up with multiple snapshots - add call-latest FIRST so it's evicted (FIFO)
            // This tests that latestCallId updates when the latest is evicted
            state.cursors.snapshots.allCallIds.add("call-latest")
            state.cursors.snapshots.allCallIds.add("call-first")
            state.cursors.snapshots.latestCallId = "call-latest"
            state.toolParameters.set("call-latest", {
                tool: "snapshot",
                parameters: {},
                turn: 2,
            })
            // Fill cache to trigger eviction - call-latest will be evicted as oldest
            for (let i = 0; i < 1001; i++) {
                state.toolParameters.set(`fill-${i}`, { tool: "test", parameters: {}, turn: 1 })
            }
            state.toolParameters.set("call-first", {
                tool: "snapshot",
                parameters: {},
                turn: 1,
            })
            state.toolParameters.set("call-latest", {
                tool: "snapshot",
                parameters: {},
                turn: 2,
            })

            // Force eviction of latest
            trimToolParametersCache(state)

            // Verify latestCallId is updated to the remaining snapshot
            expect(state.cursors.snapshots.latestCallId).toBe("call-first")
        })

        it("should clean up context cursor when evicting entries", async () => {
            const { trimToolParametersCache } = await import("../../lib/state/tool-cache")

            // Set up context cursor
            state.cursors.context.lastCallId = "call-old"
            // Add call-old FIRST so it's oldest (FIFO eviction)
            state.toolParameters.set("call-old", {
                tool: "context",
                parameters: {},
                turn: 1,
            })
            // Fill cache to trigger eviction - call-old will be evicted as oldest
            for (let i = 0; i < 1001; i++) {
                state.toolParameters.set(`fill-${i}`, { tool: "test", parameters: {}, turn: 1 })
            }

            // Force eviction
            trimToolParametersCache(state)

            // Verify context cursor is cleared
            expect(state.cursors.context.lastCallId).toBeNull()
        })

        it("should clean up todo cursor when evicting entries", async () => {
            const { trimToolParametersCache } = await import("../../lib/state/tool-cache")

            // Set up todo cursor
            state.cursors.todo.lastWriteCallId = "call-old"
            state.cursors.todo.lastReadCallId = "call-old"
            // Add call-old FIRST so it's oldest (FIFO eviction)
            state.toolParameters.set("call-old", {
                tool: "todowrite",
                parameters: {},
                turn: 1,
            })
            // Fill cache to trigger eviction - call-old will be evicted as oldest
            for (let i = 0; i < 1001; i++) {
                state.toolParameters.set(`fill-${i}`, { tool: "test", parameters: {}, turn: 1 })
            }

            // Force eviction
            trimToolParametersCache(state)

            // Verify todo cursors are cleared
            expect(state.cursors.todo.lastWriteCallId).toBeNull()
            expect(state.cursors.todo.lastReadCallId).toBeNull()
        })

        it("should clean up retry cursor references when evicting entries", async () => {
            const { trimToolParametersCache } = await import("../../lib/state/tool-cache")

            // Set up retry cursor references
            state.cursors.retries.pendingRetries.set("tool-hash-123", ["call-old", "call-new"])
            // Add call-old FIRST so it's oldest (FIFO eviction)
            state.toolParameters.set("call-old", { tool: "retry", parameters: {}, turn: 1 })
            // Fill cache to trigger eviction - call-old will be evicted as oldest
            for (let i = 0; i < 1001; i++) {
                state.toolParameters.set(`fill-${i}`, { tool: "test", parameters: {}, turn: 1 })
            }
            state.toolParameters.set("call-new", { tool: "retry", parameters: {}, turn: 2 })

            // Force eviction
            trimToolParametersCache(state)

            // Verify retry cursor is updated
            expect(state.cursors.retries.pendingRetries.get("tool-hash-123")).not.toContain(
                "call-old",
            )
            expect(state.cursors.retries.pendingRetries.get("tool-hash-123")).toContain("call-new")
        })

        it("should delete empty cursor collections after cleanup", async () => {
            const { trimToolParametersCache } = await import("../../lib/state/tool-cache")

            // Fill cache to trigger eviction (need > 1000 entries)
            for (let i = 0; i < 1001; i++) {
                state.toolParameters.set(`call-${i}`, { tool: "test", parameters: {}, turn: 1 })
            }

            // Set up cursor pointing to first entry (will be evicted)
            state.cursors.files.pathToCallIds.set("/test/file.ts", new Set(["call-0"]))
            state.cursors.urls.urlToCallIds.set("https://example.com", new Set(["call-0"]))
            state.cursors.stateQueries.queryToCallIds.set("git status", new Set(["call-0"]))

            // Force eviction
            trimToolParametersCache(state)

            // Verify empty collections are deleted (call-0 was evicted)
            expect(state.cursors.files.pathToCallIds.has("/test/file.ts")).toBe(false)
            expect(state.cursors.urls.urlToCallIds.has("https://example.com")).toBe(false)
            expect(state.cursors.stateQueries.queryToCallIds.has("git status")).toBe(false)
        })
    })
})
