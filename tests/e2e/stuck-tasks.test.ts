/**
 * Stuck Task Detection E2E Tests (t21-t25)
 *
 * Tests stuck task detection and timestamp tracking:
 * - t21: Stuck task detection basic (in_progress for >= 12 turns)
 * - t22: Timestamp preservation (inProgressSince kept on content update)
 * - t23: New task transition (pending → in_progress sets timestamp)
 * - t24: Multiple stuck tasks (shows longest duration)
 * - t25: Completed task clears (no warning after completion)
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { injectTodoReminder } from "../../lib/messages/todo-reminder"
import { syncToolCache } from "../../lib/state/tool-cache"
import type { SessionState, WithParts } from "../../lib/state"
import type { PluginConfig } from "../../lib/config"

// Mock dependencies
vi.mock("../../lib/shared-utils", () => ({
    isMessageCompacted: vi.fn().mockReturnValue(false),
}))

vi.mock("../../lib/messages/automata-mode", () => ({
    removeAutomataReflection: vi.fn(),
}))

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

const getMessageText = (msg: WithParts): string => {
    const parts = msg.parts as any[]
    return parts.map((p) => p.text || "").join("")
}

describe("Stuck Task Detection (t21-t25)", () => {
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

    describe("t21: Stuck Task Detection - Basic", () => {
        it("detects task stuck for >= 12 turns (default threshold)", () => {
            state.currentTurn = 20
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "stuck-1",
                    content: "Complex implementation task",
                    status: "in_progress",
                    priority: "high",
                    inProgressSince: 5, // 20 - 5 = 15 turns, >= 12 threshold
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            expect(messages.length).toBe(1)
            expect(getMessageText(messages[0])).toContain("Stuck Task Detected")
            expect(getMessageText(messages[0])).toContain("15 turns")
        })

        it("does NOT detect task under threshold", () => {
            state.currentTurn = 15
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Normal task",
                    status: "in_progress",
                    priority: "high",
                    inProgressSince: 10, // 15 - 10 = 5 turns, < 12 threshold
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            expect(messages.length).toBe(1)
            expect(getMessageText(messages[0])).not.toContain("Stuck Task Detected")
        })

        it("detects task at exactly threshold", () => {
            state.currentTurn = 17
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Task at threshold",
                    status: "in_progress",
                    priority: "high",
                    inProgressSince: 5, // 17 - 5 = 12 turns, == 12 threshold
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            expect(messages.length).toBe(1)
            expect(getMessageText(messages[0])).toContain("Stuck Task Detected")
        })

        it("respects custom stuckTaskTurns config", () => {
            config.tools.todoReminder.stuckTaskTurns = 5 // Lower threshold
            state.currentTurn = 15
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Task",
                    status: "in_progress",
                    priority: "high",
                    inProgressSince: 8, // 15 - 8 = 7 turns, >= 5 threshold
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            expect(getMessageText(messages[0])).toContain("Stuck Task Detected")
            expect(getMessageText(messages[0])).toContain("7 turns")
        })

        it("does NOT detect pending tasks as stuck", () => {
            state.currentTurn = 25
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Pending task",
                    status: "pending",
                    priority: "high",
                    // Even if it had inProgressSince, pending tasks shouldn't be detected
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            expect(messages.length).toBe(1)
            expect(getMessageText(messages[0])).not.toContain("Stuck Task Detected")
        })

        it("does NOT detect completed tasks as stuck", () => {
            state.currentTurn = 25
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Completed task",
                    status: "completed",
                    priority: "high",
                    inProgressSince: 5, // Would be 20 turns if still in_progress
                },
                {
                    id: "task-2",
                    content: "Pending task to trigger reminder",
                    status: "pending",
                    priority: "medium",
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            expect(messages.length).toBe(1)
            expect(getMessageText(messages[0])).not.toContain("Stuck Task Detected")
        })
    })

    describe("t22: Timestamp Preservation", () => {
        it("preserves inProgressSince when content is updated", async () => {
            // First todowrite - task becomes in_progress at turn 5
            const messages1: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(), // Turn 5
                    createToolPart(
                        "call_todo_1",
                        "todowrite",
                        {},
                        "completed",
                        JSON.stringify([
                            {
                                id: "task-1",
                                content: "Original content",
                                status: "in_progress",
                                priority: "high",
                            },
                        ]),
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages1)

            // Task should have inProgressSince = 5
            expect(state.todos[0].inProgressSince).toBe(5)

            // Second todowrite - update content but keep status
            const messages2: WithParts[] = [
                ...messages1,
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createStepPart(), // Turn 8
                    createToolPart(
                        "call_todo_2",
                        "todowrite",
                        {},
                        "completed",
                        JSON.stringify([
                            {
                                id: "task-1",
                                content: "Updated content", // Changed
                                status: "in_progress", // Same
                                priority: "high",
                            },
                        ]),
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages2)

            // inProgressSince should still be 5, not reset to 8
            expect(state.todos[0].inProgressSince).toBe(5)
            expect(state.todos[0].content).toBe("Updated content")
        })

        it("preserves timestamp across multiple updates", async () => {
            // Initial state with task in_progress since turn 3
            state.todos = [
                {
                    id: "task-1",
                    content: "Task",
                    status: "in_progress",
                    priority: "high",
                    inProgressSince: 3,
                },
            ]

            // Update 1 at turn 10
            const messages1: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(), // Turn 10
                    createToolPart(
                        "call_todo_1",
                        "todowrite",
                        {},
                        "completed",
                        JSON.stringify([
                            {
                                id: "task-1",
                                content: "Update 1",
                                status: "in_progress",
                                priority: "high",
                            },
                        ]),
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages1)

            // Should preserve original timestamp
            expect(state.todos[0].inProgressSince).toBe(3)
        })
    })

    describe("t23: New Task Transition", () => {
        it("sets inProgressSince when task transitions pending → in_progress", async () => {
            // First: task is pending
            state.todos = [
                {
                    id: "task-1",
                    content: "Task",
                    status: "pending",
                    priority: "high",
                },
            ]

            // Transition to in_progress at turn 6
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createStepPart(), // Turn 6
                    createToolPart(
                        "call_todo_1",
                        "todowrite",
                        {},
                        "completed",
                        JSON.stringify([
                            {
                                id: "task-1",
                                content: "Task",
                                status: "in_progress",
                                priority: "high",
                            },
                        ]),
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // inProgressSince should be set to turn 6
            expect(state.todos[0].inProgressSince).toBe(6)
        })

        it("calculates stuck from transition turn, not creation turn", async () => {
            // Task created at turn 0, transitions to in_progress at turn 10
            state.todos = [
                {
                    id: "task-1",
                    content: "Task",
                    status: "pending",
                    priority: "high",
                },
            ]

            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    // 10 step parts = turn 10
                    ...Array(10)
                        .fill(null)
                        .map(() => createStepPart()),
                    createToolPart(
                        "call_todo_1",
                        "todowrite",
                        {},
                        "completed",
                        JSON.stringify([
                            {
                                id: "task-1",
                                content: "Task",
                                status: "in_progress",
                                priority: "high",
                            },
                        ]),
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Now at turn 20, check if stuck
            state.currentTurn = 20
            state.cursors.todo.lastTurn = 0

            const reminderMessages: WithParts[] = []
            injectTodoReminder(state, logger, config, reminderMessages)

            // 20 - 10 = 10 turns, < 12 threshold - NOT stuck
            expect(getMessageText(reminderMessages[0])).not.toContain("Stuck Task Detected")

            // At turn 25: 25 - 10 = 15 turns, >= 12 threshold - IS stuck
            state.currentTurn = 25
            const reminderMessages2: WithParts[] = []
            injectTodoReminder(state, logger, config, reminderMessages2)

            expect(getMessageText(reminderMessages2[0])).toContain("Stuck Task Detected")
            expect(getMessageText(reminderMessages2[0])).toContain("15 turns")
        })
    })

    describe("t24: Multiple Stuck Tasks", () => {
        it("shows longest stuck duration when multiple tasks stuck", () => {
            state.currentTurn = 25
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Task A - longest stuck",
                    status: "in_progress",
                    priority: "high",
                    inProgressSince: 5, // 25 - 5 = 20 turns (longest)
                },
                {
                    id: "task-2",
                    content: "Task B - medium stuck",
                    status: "in_progress",
                    priority: "medium",
                    inProgressSince: 10, // 25 - 10 = 15 turns
                },
                {
                    id: "task-3",
                    content: "Task C - just stuck",
                    status: "in_progress",
                    priority: "low",
                    inProgressSince: 12, // 25 - 12 = 13 turns
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            // Should show longest duration (20 turns)
            expect(getMessageText(messages[0])).toContain("Stuck Task Detected")
            expect(getMessageText(messages[0])).toContain("20 turns")
        })

        it("only counts tasks that exceed threshold", () => {
            state.currentTurn = 20
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Stuck task",
                    status: "in_progress",
                    priority: "high",
                    inProgressSince: 5, // 20 - 5 = 15 turns, stuck
                },
                {
                    id: "task-2",
                    content: "Not stuck task",
                    status: "in_progress",
                    priority: "medium",
                    inProgressSince: 15, // 20 - 15 = 5 turns, not stuck
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            // Should show 15 turns (only the stuck one)
            expect(getMessageText(messages[0])).toContain("15 turns")
        })

        it("logs count of stuck tasks", () => {
            state.currentTurn = 30
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Stuck 1",
                    status: "in_progress",
                    priority: "high",
                    inProgressSince: 5,
                },
                {
                    id: "task-2",
                    content: "Stuck 2",
                    status: "in_progress",
                    priority: "medium",
                    inProgressSince: 10,
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            // Logger should be called with stuck task info
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("2 stuck task"))
        })
    })

    describe("t25: Completed Task Clears", () => {
        it("no stuck warning after task is completed", async () => {
            // Task in_progress since turn 5
            state.todos = [
                {
                    id: "task-1",
                    content: "Task",
                    status: "in_progress",
                    priority: "high",
                    inProgressSince: 5,
                },
            ]

            // At turn 20, task would be stuck (15 turns)
            state.currentTurn = 20
            state.cursors.todo.lastTurn = 0

            // Verify it's stuck before completion
            const beforeMessages: WithParts[] = []
            injectTodoReminder(state, logger, config, beforeMessages)
            expect(getMessageText(beforeMessages[0])).toContain("Stuck Task Detected")

            // Complete the task
            const completeMessages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    ...Array(20)
                        .fill(null)
                        .map(() => createStepPart()),
                    createToolPart(
                        "call_todo_1",
                        "todowrite",
                        {},
                        "completed",
                        JSON.stringify([
                            {
                                id: "task-1",
                                content: "Task",
                                status: "completed",
                                priority: "high",
                            },
                        ]),
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, completeMessages)

            // At turn 25, no stuck warning (task is completed)
            // When all tasks are completed, reminder may not inject at all
            state.currentTurn = 25
            state.cursors.todo.lastTurn = 0
            const afterMessages: WithParts[] = []
            injectTodoReminder(state, logger, config, afterMessages)

            // Either no message injected, or message without stuck warning
            if (afterMessages.length > 0) {
                expect(getMessageText(afterMessages[0])).not.toContain("Stuck Task Detected")
            }
        })

        it("cancelled task does not trigger stuck warning", () => {
            state.currentTurn = 25
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Cancelled task",
                    status: "cancelled",
                    priority: "high",
                    inProgressSince: 5, // Would be 20 turns if still in_progress
                },
                {
                    id: "task-2",
                    content: "Pending task to trigger reminder",
                    status: "pending",
                    priority: "medium",
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            // Reminder should be injected but without stuck warning
            if (messages.length > 0) {
                expect(getMessageText(messages[0])).not.toContain("Stuck Task Detected")
            }
        })

        it("mix of completed and stuck tasks only warns about stuck", () => {
            state.currentTurn = 25
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Completed task",
                    status: "completed",
                    priority: "high",
                    inProgressSince: 2, // Would be 23 turns
                },
                {
                    id: "task-2",
                    content: "Still stuck task",
                    status: "in_progress",
                    priority: "medium",
                    inProgressSince: 10, // 15 turns, stuck
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            // Should warn about task-2 (15 turns), not task-1
            expect(getMessageText(messages[0])).toContain("Stuck Task Detected")
            expect(getMessageText(messages[0])).toContain("15 turns")
        })
    })

    describe("Edge Cases", () => {
        it("handles task without inProgressSince (legacy)", () => {
            state.currentTurn = 25
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Legacy task without timestamp",
                    status: "in_progress",
                    priority: "high",
                    // No inProgressSince - legacy task
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            // Should NOT detect as stuck (no timestamp to calculate from)
            expect(getMessageText(messages[0])).not.toContain("Stuck Task Detected")
        })

        it("handles empty todos array", () => {
            state.currentTurn = 25
            state.cursors.todo.lastTurn = 0
            state.todos = []

            injectTodoReminder(state, logger, config, messages)

            expect(getMessageText(messages[0])).not.toContain("Stuck Task Detected")
        })

        it("handles inProgressSince of 0", () => {
            state.currentTurn = 15
            state.cursors.todo.lastTurn = 0
            state.todos = [
                {
                    id: "task-1",
                    content: "Task from turn 0",
                    status: "in_progress",
                    priority: "high",
                    inProgressSince: 0, // 15 - 0 = 15 turns, stuck
                },
            ]

            injectTodoReminder(state, logger, config, messages)

            expect(getMessageText(messages[0])).toContain("Stuck Task Detected")
            expect(getMessageText(messages[0])).toContain("15 turns")
        })
    })
})
