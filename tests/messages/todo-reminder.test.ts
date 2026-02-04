import { describe, it, expect, beforeEach, vi } from "vitest"
import { injectTodoReminder, removeTodoReminder } from "../../lib/messages/todo-reminder"
import type { SessionState, WithParts } from "../../lib/state"
import type { PluginConfig } from "../../lib/config"

// Mock dependencies
vi.mock("../../lib/shared-utils", () => ({
    isMessageCompacted: vi.fn().mockReturnValue(false),
}))

vi.mock("../../lib/messages/utils", () => ({
    groupHashesByToolName: vi.fn().mockReturnValue(new Map()),
    formatHashInventory: vi.fn().mockReturnValue(""),
}))

const createMockLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
})

const createMockConfig = (): PluginConfig =>
    ({
        tools: {
            todoReminder: {
                enabled: true,
                initialTurns: 8,
                repeatTurns: 4,
                stuckTaskTurns: 12,
            },
        },
    }) as unknown as PluginConfig

const createMockState = (overrides: Partial<SessionState> = {}): SessionState =>
    ({
        currentTurn: 10,
        todos: [],
        prune: { toolIds: [], messagePartIds: [], reasoningPartIds: [] },
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
                lastTurn: 0,
                lastReminderTurn: 0,
                lastWriteCallId: null,
                lastReadCallId: null,
            },
            context: { lastCallId: null },
            automata: { enabled: false, lastTurn: 0, lastReflectionTurn: 0 },
            files: { pathToCallIds: new Map() },
        },
        stats: {
            strategyStats: {
                autoSupersede: {
                    hash: { count: 0, tokens: 0 },
                    file: { count: 0, tokens: 0 },
                    todo: { count: 0, tokens: 0 },
                    context: { count: 0, tokens: 0 },
                },
            },
        },
        ...overrides,
    }) as unknown as SessionState

const createMessage = (id: string, role: "user" | "assistant", text: string): WithParts =>
    ({
        info: { id, role },
        parts: [{ type: "text", text }],
    }) as unknown as WithParts

const getMessageText = (msg: WithParts): string => {
    const part = msg.parts[0] as any
    return part?.text ?? ""
}

describe("todo-reminder", () => {
    let state: SessionState
    let config: PluginConfig
    let logger: ReturnType<typeof createMockLogger>
    let messages: WithParts[]

    beforeEach(() => {
        state = createMockState()
        config = createMockConfig()
        logger = createMockLogger()
        messages = []
        vi.clearAllMocks()
    })

    describe("injectTodoReminder", () => {
        it("should inject reminder when turns threshold exceeded", () => {
            state.currentTurn = 10
            state.cursors.todo.lastTurn = 0
            state.cursors.todo.lastReminderTurn = 0

            const result = injectTodoReminder(state, logger as any, config, messages)

            expect(result).toBe(true)
            expect(messages.length).toBe(1)
            expect(getMessageText(messages[0])).toContain("🔖 Checkpoint")
        })

        it("should not inject reminder when disabled", () => {
            config.tools.todoReminder.enabled = false

            const result = injectTodoReminder(state, logger as any, config, messages)

            expect(result).toBe(false)
            expect(messages.length).toBe(0)
        })

        it("should not inject reminder when all todos completed", () => {
            state.todos = [{ id: "1", content: "Task 1", status: "completed", priority: "high" }]

            const result = injectTodoReminder(state, logger as any, config, messages)

            expect(result).toBe(false)
        })

        it("should inject reminder when pending todos exist", () => {
            state.currentTurn = 10
            state.cursors.todo.lastTurn = 0
            state.todos = [{ id: "1", content: "Task 1", status: "pending", priority: "high" }]

            const result = injectTodoReminder(state, logger as any, config, messages)

            expect(result).toBe(true)
        })
    })

    describe("stuck task detection", () => {
        it("should include stuck task guidance when task in_progress for too long", () => {
            state.currentTurn = 20
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "1",
                    content: "Complex task",
                    status: "in_progress",
                    priority: "high",
                    inProgressSince: 5, // 20 - 5 = 15 turns, > 12 threshold
                },
            ]

            injectTodoReminder(state, logger as any, config, messages)

            expect(messages.length).toBe(1)
            expect(getMessageText(messages[0])).toContain("Stuck Task Detected")
            expect(getMessageText(messages[0])).toContain("15 turns")
        })

        it("should NOT include stuck task guidance when under threshold", () => {
            state.currentTurn = 15
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "1",
                    content: "Task",
                    status: "in_progress",
                    priority: "high",
                    inProgressSince: 10, // 15 - 10 = 5 turns, < 12 threshold
                },
            ]

            injectTodoReminder(state, logger as any, config, messages)

            expect(messages.length).toBe(1)
            expect(getMessageText(messages[0])).not.toContain("Stuck Task Detected")
        })

        it("should show longest stuck duration when multiple tasks stuck", () => {
            state.currentTurn = 25
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "1",
                    content: "Task A",
                    status: "in_progress",
                    priority: "high",
                    inProgressSince: 5, // 25 - 5 = 20 turns (longest)
                },
                {
                    id: "2",
                    content: "Task B",
                    status: "in_progress",
                    priority: "medium",
                    inProgressSince: 10, // 25 - 10 = 15 turns
                },
            ]

            injectTodoReminder(state, logger as any, config, messages)

            expect(getMessageText(messages[0])).toContain("20 turns")
        })

        it("should NOT detect stuck task without inProgressSince", () => {
            state.currentTurn = 25
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "1",
                    content: "Task without timestamp",
                    status: "in_progress",
                    priority: "high",
                    // No inProgressSince - legacy task
                },
            ]

            injectTodoReminder(state, logger as any, config, messages)

            expect(getMessageText(messages[0])).not.toContain("Stuck Task Detected")
        })

        it("should respect custom stuckTaskTurns config", () => {
            config.tools.todoReminder.stuckTaskTurns = 5 // Lower threshold
            state.currentTurn = 15
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "1",
                    content: "Task",
                    status: "in_progress",
                    priority: "high",
                    inProgressSince: 8, // 15 - 8 = 7 turns, > 5 threshold
                },
            ]

            injectTodoReminder(state, logger as any, config, messages)

            expect(getMessageText(messages[0])).toContain("Stuck Task Detected")
        })
    })

    describe("reminder deduplication", () => {
        it("should remove old reminder before injecting new one", () => {
            state.currentTurn = 20
            state.cursors.todo.lastTurn = 0
            state.cursors.todo.lastReminderTurn = 10

            // Add existing reminder message
            messages.push(
                createMessage(
                    "old-reminder",
                    "user",
                    "---\n## 🔖 Checkpoint\n\nI've noticed your todo list hasn't been updated for 10 turns...",
                ),
            )

            injectTodoReminder(state, logger as any, config, messages)

            // Should have exactly one reminder (old removed, new added)
            const reminderCount = messages.filter((m) =>
                getMessageText(m).includes("🔖 Checkpoint"),
            ).length
            expect(reminderCount).toBe(1)
        })
    })

    describe("removeTodoReminder", () => {
        it("should remove todo reminder user messages", () => {
            messages.push(
                createMessage(
                    "reminder-1",
                    "user",
                    "---\n## 🔖 Checkpoint\n\nI've noticed your todo list hasn't been updated for 5 turns...",
                ),
            )

            const result = removeTodoReminder(state, messages, logger as any)

            expect(result).toBe(true)
            expect(messages.length).toBe(0)
        })

        it("should not remove non-reminder messages", () => {
            messages.push(createMessage("msg-1", "user", "Regular user message"))

            const result = removeTodoReminder(state, messages, logger as any)

            expect(result).toBe(false)
            expect(messages.length).toBe(1)
        })

        it("should remove multiple reminder messages", () => {
            messages.push(createMessage("reminder-1", "user", "## 🔖 Checkpoint old"))
            messages.push(createMessage("msg-1", "user", "Regular message"))
            messages.push(createMessage("reminder-2", "user", "## 🔖 Checkpoint newer"))

            removeTodoReminder(state, messages, logger as any)

            expect(messages.length).toBe(1)
            expect(messages[0].info.id).toBe("msg-1")
        })
    })
})
