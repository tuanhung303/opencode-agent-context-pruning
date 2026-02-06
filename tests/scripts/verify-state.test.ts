import { describe, it, expect } from "vitest"
import { createTempDir } from "../fixtures/tmpdir"
import { seedACPState, seedStateWithTools, seedStateWithMessages } from "../fixtures/seed-state"
import { createMockState } from "../fixtures/mock-client"
import {
    verifyACPState,
    listACPSessions,
    verifyToolsPruned,
    verifyMessagePartsPruned,
    verifyReasoningPartsPruned,
    verifyHashRegistry,
    verifyTodos,
    verifyStats,
    verifyE2EState,
} from "../../scripts/verify-state"

describe("verifyACPState", () => {
    it("returns valid for properly seeded state", async () => {
        const tmp = await createTempDir()
        try {
            await seedACPState(tmp.path, "test-session")
            const result = await verifyACPState(tmp.path, "test-session")

            expect(result.valid).toBe(true)
            expect(result.errors).toHaveLength(0)
            expect(result.state).not.toBeNull()
            expect(result.state?.sessionId).toBe("test-session")
        } finally {
            await tmp.cleanup()
        }
    })

    it("returns invalid for non-existent session", async () => {
        const tmp = await createTempDir()
        try {
            const result = await verifyACPState(tmp.path, "non-existent")

            expect(result.valid).toBe(false)
            expect(result.errors.length).toBeGreaterThan(0)
            expect(result.state).toBeNull()
        } finally {
            await tmp.cleanup()
        }
    })
})

describe("listACPSessions", () => {
    it("lists all seeded sessions", async () => {
        const tmp = await createTempDir()
        try {
            await seedACPState(tmp.path, "session-1")
            await seedACPState(tmp.path, "session-2")
            await seedACPState(tmp.path, "session-3")

            const sessions = await listACPSessions(tmp.path)

            expect(sessions).toContain("session-1")
            expect(sessions).toContain("session-2")
            expect(sessions).toContain("session-3")
            expect(sessions).toHaveLength(3)
        } finally {
            await tmp.cleanup()
        }
    })

    it("returns empty array for non-existent directory", async () => {
        const tmp = await createTempDir()
        try {
            const sessions = await listACPSessions(tmp.path)
            expect(sessions).toEqual([])
        } finally {
            await tmp.cleanup()
        }
    })
})

describe("verifyToolsPruned", () => {
    it("passes when all expected tools are pruned", () => {
        const state = createMockState()
        state.prune.toolIds = ["call_1", "call_2", "call_3"]

        const result = verifyToolsPruned(state, ["call_1", "call_2"])

        expect(result.pass).toBe(true)
        expect(result.missing).toHaveLength(0)
    })

    it("fails when some tools are not pruned", () => {
        const state = createMockState()
        state.prune.toolIds = ["call_1"]

        const result = verifyToolsPruned(state, ["call_1", "call_2", "call_3"])

        expect(result.pass).toBe(false)
        expect(result.missing).toContain("call_2")
        expect(result.missing).toContain("call_3")
    })
})

describe("verifyMessagePartsPruned", () => {
    it("passes when all expected message parts are pruned", () => {
        const state = createMockState()
        state.prune.messagePartIds = ["msg_1:0", "msg_1:1", "msg_2:0"]

        const result = verifyMessagePartsPruned(state, ["msg_1:0", "msg_2:0"])

        expect(result.pass).toBe(true)
        expect(result.missing).toHaveLength(0)
    })

    it("fails when some message parts are not pruned", () => {
        const state = createMockState()
        state.prune.messagePartIds = ["msg_1:0"]

        const result = verifyMessagePartsPruned(state, ["msg_1:0", "msg_1:1"])

        expect(result.pass).toBe(false)
        expect(result.missing).toContain("msg_1:1")
    })
})

describe("verifyReasoningPartsPruned", () => {
    it("passes when all expected reasoning parts are pruned", () => {
        const state = createMockState()
        state.prune.reasoningPartIds = ["msg_1:0", "msg_2:0"]

        const result = verifyReasoningPartsPruned(state, ["msg_1:0"])

        expect(result.pass).toBe(true)
    })

    it("fails when some reasoning parts are not pruned", () => {
        const state = createMockState()
        state.prune.reasoningPartIds = []

        const result = verifyReasoningPartsPruned(state, ["msg_1:0"])

        expect(result.pass).toBe(false)
        expect(result.missing).toContain("msg_1:0")
    })
})

describe("verifyHashRegistry", () => {
    it("passes when all expected hashes are registered", () => {
        const state = createMockState()
        state.hashRegistry.calls.set("abc123", "call_1")
        state.hashRegistry.messages.set("def456", "msg_1:0")
        state.hashRegistry.reasoning.set("ghi789", "msg_2:0")

        const result = verifyHashRegistry(state, [
            { hash: "abc123", type: "tool" },
            { hash: "def456", type: "message" },
            { hash: "ghi789", type: "reasoning" },
        ])

        expect(result.pass).toBe(true)
        expect(result.missing).toHaveLength(0)
    })

    it("fails when some hashes are missing", () => {
        const state = createMockState()
        state.hashRegistry.calls.set("abc123", "call_1")

        const result = verifyHashRegistry(state, [
            { hash: "abc123", type: "tool" },
            { hash: "missing", type: "tool" },
        ])

        expect(result.pass).toBe(false)
        expect(result.missing).toContainEqual({ hash: "missing", type: "tool" })
    })
})

describe("verifyTodos", () => {
    it("passes when todo count matches", () => {
        const state = createMockState()
        state.todos = [
            { id: "1", content: "Task 1", status: "pending", priority: "high" },
            { id: "2", content: "Task 2", status: "completed", priority: "medium" },
        ]

        const result = verifyTodos(state, { count: 2 })

        expect(result.pass).toBe(true)
    })

    it("fails when todo count does not match", () => {
        const state = createMockState()
        state.todos = [{ id: "1", content: "Task 1", status: "pending", priority: "high" }]

        const result = verifyTodos(state, { count: 3 })

        expect(result.pass).toBe(false)
        expect(result.errors[0]).toContain("Expected 3 todos")
    })

    it("verifies hasInProgress correctly", () => {
        const state = createMockState()
        state.todos = [{ id: "1", content: "Task 1", status: "in_progress", priority: "high" }]

        const result = verifyTodos(state, { hasInProgress: true })

        expect(result.pass).toBe(true)
    })

    it("verifies completedCount correctly", () => {
        const state = createMockState()
        state.todos = [
            { id: "1", content: "Task 1", status: "completed", priority: "high" },
            { id: "2", content: "Task 2", status: "completed", priority: "medium" },
            { id: "3", content: "Task 3", status: "pending", priority: "low" },
        ]

        const result = verifyTodos(state, { completedCount: 2 })

        expect(result.pass).toBe(true)
    })
})

describe("verifyStats", () => {
    it("passes when stats meet minimum thresholds", () => {
        const state = createMockState()
        state.stats.totalPruneTokens = 1000
        state.stats.totalPruneMessages = 5

        const result = verifyStats(state, { minPruneTokens: 500, minPruneMessages: 3 })

        expect(result.pass).toBe(true)
    })

    it("fails when stats below minimum thresholds", () => {
        const state = createMockState()
        state.stats.totalPruneTokens = 100
        state.stats.totalPruneMessages = 1

        const result = verifyStats(state, { minPruneTokens: 500, minPruneMessages: 3 })

        expect(result.pass).toBe(false)
        expect(result.errors).toHaveLength(2)
    })
})

describe("verifyE2EState", () => {
    it("performs comprehensive verification", () => {
        const state = createMockState()
        state.prune.toolIds = ["call_1", "call_2"]
        state.prune.messagePartIds = ["msg_1:0"]
        state.hashRegistry.calls.set("abc123", "call_1")
        state.todos = [
            { id: "1", content: "Task 1", status: "completed", priority: "high" },
            { id: "2", content: "Task 2", status: "in_progress", priority: "medium" },
        ]
        state.stats.totalPruneTokens = 500

        const result = verifyE2EState(state, {
            prunedTools: ["call_1"],
            prunedMessages: ["msg_1:0"],
            registeredHashes: [{ hash: "abc123", type: "tool" }],
            todos: { count: 2, hasInProgress: true, completedCount: 1 },
            stats: { minPruneTokens: 100 },
        })

        expect(result.pass).toBe(true)
        expect(result.errors).toHaveLength(0)
    })

    it("collects all errors from failed verifications", () => {
        const state = createMockState()

        const result = verifyE2EState(state, {
            prunedTools: ["missing_call"],
            prunedMessages: ["missing_msg"],
            todos: { count: 5 },
            stats: { minPruneTokens: 1000 },
        })

        expect(result.pass).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
    })
})
