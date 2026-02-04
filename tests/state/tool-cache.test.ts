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
})
