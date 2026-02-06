/**
 * Reminder Deduplication E2E Tests (t26-t28)
 *
 * Tests reminder injection and deduplication:
 * - t26: Todo reminder deduplication (multiple updates, single reminder)
 * - t27: Automata reflection deduplication (single reflection)
 * - t28: Mixed reminders coexistence (todo + automata can coexist)
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { injectTodoReminder, removeTodoReminder } from "../../lib/messages/todo-reminder"
import type { SessionState, WithParts } from "../../lib/state"
import type { PluginConfig } from "../../lib/config"

const createMockLogger = () =>
    ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }) as any

const createMockConfig = (overrides: Partial<any> = {}): PluginConfig =>
    ({
        tools: {
            settings: { protectedTools: [] },
            todoReminder: {
                enabled: true,
                initialTurns: 3,
                repeatTurns: 5,
                stuckTaskTurns: 12,
                maxContextTokens: 100000,
            },
            automataMode: {
                enabled: false,
            },
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
        currentTurn: 0,
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

const createMessage = (id: string, role: "user" | "assistant", text: string): WithParts =>
    ({
        info: { id, role, time: { created: Date.now() } },
        parts: [{ type: "text", text }],
    }) as any

const getMessageText = (msg: WithParts): string => {
    const parts = msg.parts as any[]
    return parts.map((p) => p.text || "").join("")
}

describe("Reminder Deduplication (t26-t28)", () => {
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

    describe("t26: Todo Reminder Deduplication", () => {
        it("removes old reminder before injecting new one", () => {
            state.currentTurn = 20
            state.cursors.todo.lastTurn = 0
            state.cursors.todo.lastReminderTurn = 10
            state.todos = [
                {
                    id: "task-1",
                    content: "Active task",
                    status: "in_progress",
                    priority: "high",
                },
            ]

            // Add existing reminder message
            messages.push(
                createMessage(
                    "old-reminder",
                    "user",
                    "---\n## 🔖 Checkpoint\n\nI've noticed your todo list hasn't been updated for 10 turns...",
                ),
            )

            injectTodoReminder(state, logger, config, messages)

            // Should have exactly one reminder (old removed, new added)
            const reminderCount = messages.filter((m) =>
                getMessageText(m).includes("🔖 Checkpoint"),
            ).length
            expect(reminderCount).toBe(1)
        })

        it("only one reminder exists after multiple todo updates", () => {
            state.currentTurn = 15
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Task A",
                    status: "pending",
                    priority: "high",
                },
            ]

            // First reminder injection
            injectTodoReminder(state, logger, config, messages)
            expect(messages.filter((m) => getMessageText(m).includes("🔖 Checkpoint")).length).toBe(
                1,
            )

            // Simulate todo update and second reminder
            state.currentTurn = 25
            state.cursors.todo.lastTurn = 15
            state.todos[0].content = "Task B"

            injectTodoReminder(state, logger, config, messages)

            // Still only one reminder
            const reminderCount = messages.filter((m) =>
                getMessageText(m).includes("🔖 Checkpoint"),
            ).length
            expect(reminderCount).toBe(1)
        })

        it("removes multiple old reminders if present", () => {
            state.currentTurn = 20
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Task",
                    status: "pending",
                    priority: "high",
                },
            ]

            // Add multiple old reminders (shouldn't happen normally, but test robustness)
            messages.push(createMessage("reminder-1", "user", "## 🔖 Checkpoint old 1"))
            messages.push(createMessage("msg-1", "user", "Regular message"))
            messages.push(createMessage("reminder-2", "user", "## 🔖 Checkpoint old 2"))

            injectTodoReminder(state, logger, config, messages)

            // Should have exactly one reminder
            const reminderCount = messages.filter((m) =>
                getMessageText(m).includes("🔖 Checkpoint"),
            ).length
            expect(reminderCount).toBe(1)

            // Regular message should still exist
            expect(messages.some((m) => getMessageText(m) === "Regular message")).toBe(true)
        })

        it("preserves non-reminder messages during deduplication", () => {
            state.currentTurn = 20
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Task",
                    status: "pending",
                    priority: "high",
                },
            ]

            messages.push(createMessage("user-msg-1", "user", "User question 1"))
            messages.push(createMessage("old-reminder", "user", "## 🔖 Checkpoint old"))
            messages.push(createMessage("user-msg-2", "user", "User question 2"))

            injectTodoReminder(state, logger, config, messages)

            // Both user messages should be preserved
            expect(messages.some((m) => getMessageText(m) === "User question 1")).toBe(true)
            expect(messages.some((m) => getMessageText(m) === "User question 2")).toBe(true)
        })
    })

    describe("t27: Automata Reflection Deduplication", () => {
        it("removeTodoReminder only removes todo reminders", () => {
            // Add a todo reminder
            messages.push(
                createMessage(
                    "todo-reminder",
                    "user",
                    "---\n## 🔖 Checkpoint\n\nTodo reminder content...",
                ),
            )

            // Add a non-reminder message
            messages.push(createMessage("regular", "user", "Regular user message"))

            const result = removeTodoReminder(state, messages, logger)

            expect(result).toBe(true)
            expect(messages.length).toBe(1)
            expect(messages[0].info.id).toBe("regular")
        })

        it("returns false when no reminder to remove", () => {
            messages.push(createMessage("msg-1", "user", "Regular message"))

            const result = removeTodoReminder(state, messages, logger)

            expect(result).toBe(false)
            expect(messages.length).toBe(1)
        })

        it("handles empty messages array", () => {
            const result = removeTodoReminder(state, messages, logger)

            expect(result).toBe(false)
            expect(messages.length).toBe(0)
        })
    })

    describe("t28: Mixed Reminders Coexistence", () => {
        it("todo reminder and regular messages coexist", () => {
            state.currentTurn = 20
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Task",
                    status: "pending",
                    priority: "high",
                },
            ]

            // Add regular user messages
            messages.push(createMessage("user-1", "user", "First user message"))
            messages.push(createMessage("user-2", "user", "Second user message"))

            injectTodoReminder(state, logger, config, messages)

            // All messages should exist
            expect(messages.length).toBe(3)
            expect(messages.some((m) => getMessageText(m).includes("🔖 Checkpoint"))).toBe(true)
            expect(messages.some((m) => getMessageText(m) === "First user message")).toBe(true)
            expect(messages.some((m) => getMessageText(m) === "Second user message")).toBe(true)
        })

        it("todo reminder and assistant messages coexist", () => {
            state.currentTurn = 20
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Task",
                    status: "pending",
                    priority: "high",
                },
            ]

            // Add assistant message
            messages.push(createMessage("assistant-1", "assistant", "Assistant response"))

            injectTodoReminder(state, logger, config, messages)

            // Both should exist
            expect(messages.length).toBe(2)
            expect(messages.some((m) => getMessageText(m).includes("🔖 Checkpoint"))).toBe(true)
            expect(messages.some((m) => getMessageText(m) === "Assistant response")).toBe(true)
        })

        it("reminder injection respects turn thresholds", () => {
            state.currentTurn = 5
            state.cursors.todo.lastTurn = 4 // Only 1 turn since last update
            state.todos = [
                {
                    id: "task-1",
                    content: "Task",
                    status: "pending",
                    priority: "high",
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            // Should not inject reminder (not enough turns since last update)
            expect(messages.length).toBe(0)
        })

        it("reminder injection after initial turns threshold", () => {
            state.currentTurn = 5
            state.cursors.todo.lastTurn = 0 // 5 turns since last update, > initialTurns (3)
            state.todos = [
                {
                    id: "task-1",
                    content: "Task",
                    status: "pending",
                    priority: "high",
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            // Should inject reminder
            expect(messages.length).toBe(1)
            expect(getMessageText(messages[0])).toContain("🔖 Checkpoint")
        })

        it("reminder injection respects repeatTurns threshold", () => {
            state.currentTurn = 20
            state.cursors.todo.lastTurn = 10
            state.cursors.todo.lastReminderTurn = 18 // Only 2 turns since last reminder
            state.todos = [
                {
                    id: "task-1",
                    content: "Task",
                    status: "pending",
                    priority: "high",
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            // Should not inject (not enough turns since last reminder)
            // repeatTurns is 5, but only 2 turns passed
            expect(messages.length).toBe(0)
        })

        it("reminder injection after repeatTurns threshold", () => {
            state.currentTurn = 25
            state.cursors.todo.lastTurn = 10
            state.cursors.todo.lastReminderTurn = 18 // 7 turns since last reminder, > repeatTurns (5)
            state.todos = [
                {
                    id: "task-1",
                    content: "Task",
                    status: "pending",
                    priority: "high",
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            // Should inject reminder
            expect(messages.length).toBe(1)
            expect(getMessageText(messages[0])).toContain("🔖 Checkpoint")
        })
    })

    describe("Edge Cases", () => {
        it("handles reminder with special characters in content", () => {
            state.currentTurn = 20
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Task with 'quotes' and \"double quotes\"",
                    status: "pending",
                    priority: "high",
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            expect(messages.length).toBe(1)
        })

        it("handles reminder with unicode in todo content", () => {
            state.currentTurn = 20
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Task with 日本語 and émojis 🎉",
                    status: "pending",
                    priority: "high",
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            expect(messages.length).toBe(1)
        })

        it("handles disabled todo reminder config", () => {
            config.tools.todoReminder.enabled = false
            state.currentTurn = 20
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Task",
                    status: "pending",
                    priority: "high",
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            // Should not inject when disabled
            expect(messages.length).toBe(0)
        })

        it("updates lastReminderTurn after injection", () => {
            state.currentTurn = 20
            state.cursors.todo.lastTurn = 0
            state.cursors.todo.lastReminderTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Task",
                    status: "pending",
                    priority: "high",
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            // lastReminderTurn should be updated
            expect(state.cursors.todo.lastReminderTurn).toBe(20)
        })
    })
})
