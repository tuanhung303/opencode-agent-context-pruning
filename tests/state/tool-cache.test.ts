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
        turnProtection: { enabled: false, turns: 0 },
        tools: {
            settings: { protectedTools: [] },
        },
        strategies: {
            purgeErrors: { enabled: false, turns: 4, protectedTools: [] },
            truncation: { enabled: false },
            thinkingCompression: { enabled: false },
        },
    }) as unknown as PluginConfig

const createMockState = (): SessionState =>
    ({
        currentTurn: 10,
        toolParameters: new Map(),
        hashToCallId: new Map(),
        callIdToHash: new Map(),
        softPrunedTools: new Map(),
        filePathToCallIds: new Map(),
        lastTodowriteCallId: null,
        lastTodoreadCallId: null,
        lastTodoTurn: 0,
        lastReminderTurn: 0,
        todos: [],
        stats: {
            strategyStats: {
                autoSupersede: {
                    hash: { count: 0, tokens: 0 },
                    file: { count: 0, tokens: 0 },
                    todo: { count: 0, tokens: 0 },
                },
                purgeErrors: { count: 0, tokens: 0 },
                manualDiscard: { count: 0, tokens: 0 },
                distillation: { count: 0, tokens: 0 },
                truncation: { count: 0, tokens: 0 },
                thinkingCompression: { count: 0, tokens: 0 },
            },
        },
        softPrunedMessageParts: new Map(),
        softPrunedMessages: new Map(),
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

            // Old call should be soft pruned
            expect(state.softPrunedTools.has("call_001")).toBe(true)
            // New call should have the hash
            expect(state.callIdToHash.get("call_002")).toBeDefined()
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
            expect(state.softPrunedTools.has("call_001")).toBe(false)
            expect(state.softPrunedTools.has("call_002")).toBe(false)
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
            expect(state.softPrunedTools.has("call_001")).toBe(true)
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

            expect(state.softPrunedTools.has("call_001")).toBe(true)
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
            expect(state.softPrunedTools.has("call_001")).toBe(false)
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
            expect(state.softPrunedTools.has("call_001")).toBe(true)
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
            expect(state.softPrunedTools.has("call_001")).toBe(true)
            // Latest todowrite should be tracked
            expect(state.lastTodowriteCallId).toBe("call_002")
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
            expect(state.softPrunedTools.has("call_001")).toBe(true)
            // Latest todoread should be tracked
            expect(state.lastTodoreadCallId).toBe("call_002")
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
            expect(state.lastTodoTurn).toBe(1)
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
            expect(state.softPrunedTools.has("call_001")).toBe(false)
            expect(state.stats.strategyStats.autoSupersede.hash.count).toBe(0)
        })

        it("should not supersede turn-protected tools", async () => {
            config.turnProtection.enabled = true
            config.turnProtection.turns = 3
            state.currentTurn = 5

            const messages: WithParts[] = [
                createMessage("msg1", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createStepPart(), // Turn 3
                    createToolPart("call_001", "read", { filePath: "/src/app.ts" }),
                ]),
                createMessage("msg2", "assistant", [
                    createStepPart(),
                    createStepPart(), // Turn 5
                    createToolPart("call_002", "read", { filePath: "/src/app.ts" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Turn-protected tools should not be cached/superseded
            expect(state.toolParameters.has("call_001")).toBe(false)
            expect(state.toolParameters.has("call_002")).toBe(false)
        })
    })
})
