import { describe, it, expect, beforeEach, vi } from "vitest"
import { createSessionState, checkSession, countTurns } from "../../lib/state/state"
import type { SessionState, WithParts } from "../../lib/state"

// Mock persistence
vi.mock("../../lib/state/persistence", () => ({
    loadSessionState: vi.fn().mockResolvedValue({
        prune: { toolIds: [], messagePartIds: [] },
        stats: { strategyStats: {} },
    }),
    saveSessionState: vi.fn().mockResolvedValue(undefined),
}))

// Mock isSubAgentSession
vi.mock("../../lib/state/utils", () => ({
    isSubAgentSession: vi.fn().mockResolvedValue(false),
}))

const createMockLogger = () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
})

const createMockClient = () => ({
    session: {
        messages: () => Promise.resolve({ data: [] }),
    },
})

const createToolPart = (
    callID: string,
    tool: string,
    status: "completed" | "error" = "completed",
) => ({
    type: "tool" as const,
    callID,
    tool,
    state: { status, output: "test output" },
})

const createStepPart = () => ({
    type: "step-start" as const,
})

const createMessage = (id: string, role: "user" | "assistant", parts: any[]): WithParts =>
    ({
        info: {
            id,
            role,
            time: { created: Date.now() },
            ...(role === "assistant" ? {} : { sessionID: "test-session" }),
        },
        parts,
    }) as any

describe("createSessionState", () => {
    it("should create a valid initial session state", () => {
        const state = createSessionState()

        expect(state.sessionId).toBeNull()
        expect(state.isSubAgent).toBe(false)
        expect(state.prune.toolIds).toEqual([])
        expect(state.prune.messagePartIds).toEqual([])
        expect(state.currentTurn).toBe(0)
        expect(state.lastCompaction).toBe(0)
    })

    it("should initialize empty maps", () => {
        const state = createSessionState()

        expect(state.toolParameters.size).toBe(0)
        expect(state.hashRegistry.calls.size).toBe(0)
        expect(state.hashRegistry.callIds.size).toBe(0)
        expect(state.hashRegistry.messages.size).toBe(0)
        expect(state.hashRegistry.messagePartIds.size).toBe(0)
        expect(state.softPrunedItems.size).toBe(0)
    })

    it("should initialize stats to zero", () => {
        const state = createSessionState()

        expect(state.stats.pruneTokenCounter).toBe(0)
        expect(state.stats.totalPruneTokens).toBe(0)
        expect(state.stats.pruneMessageCounter).toBe(0)
        expect(state.stats.totalPruneMessages).toBe(0)
    })

    it("should initialize all strategy stats", () => {
        const state = createSessionState()

        expect(state.stats.strategyStats.autoSupersede.hash.count).toBe(0)
        expect(state.stats.strategyStats.autoSupersede.file.count).toBe(0)
        expect(state.stats.strategyStats.autoSupersede.todo.count).toBe(0)
        expect(state.stats.strategyStats.purgeErrors.count).toBe(0)
        expect(state.stats.strategyStats.manualDiscard.message.count).toBe(0)
        expect(state.stats.strategyStats.manualDiscard.thinking.count).toBe(0)
        expect(state.stats.strategyStats.manualDiscard.tool.count).toBe(0)
        expect(state.stats.strategyStats.distillation.count).toBe(0)
        expect(state.stats.strategyStats.truncation.count).toBe(0)
        expect(state.stats.strategyStats.thinkingCompression.count).toBe(0)
    })
})

describe("countTurns", () => {
    let mockState: SessionState

    beforeEach(() => {
        mockState = createSessionState()
    })

    it("should count step-start parts in messages", () => {
        const messages: WithParts[] = [
            createMessage("msg_1", "user", [createStepPart()]),
            createMessage("msg_2", "assistant", [createStepPart()]),
        ]

        const count = countTurns(mockState, messages)

        expect(count).toBe(2)
    })

    it("should return 0 for empty messages", () => {
        const messages: WithParts[] = []

        const count = countTurns(mockState, messages)

        expect(count).toBe(0)
    })

    it("should not count non-step-start parts", () => {
        const messages: WithParts[] = [
            createMessage("msg_1", "user", [createStepPart(), createToolPart("call_1", "read")]),
        ]

        const count = countTurns(mockState, messages)

        expect(count).toBe(1)
    })
})

describe("checkSession", () => {
    let mockState: SessionState
    let mockLogger: ReturnType<typeof createMockLogger>
    let mockClient: ReturnType<typeof createMockClient>

    beforeEach(() => {
        mockState = createSessionState()
        mockLogger = createMockLogger()
        mockClient = createMockClient()
    })

    it("should initialize session on first user message", async () => {
        const messages: WithParts[] = [
            createMessage("msg_1", "user", [{ type: "text", text: "hello" }]),
        ]

        await checkSession(mockClient as any, mockState, mockLogger as any, messages)

        expect(mockState.sessionId).toBe("test-session")
    })

    it("should detect session change", async () => {
        mockState.sessionId = "old-session"
        const messages: WithParts[] = [
            createMessage("msg_1", "user", [{ type: "text", text: "hello" }]),
        ]

        await checkSession(mockClient as any, mockState, mockLogger as any, messages)

        expect(mockState.sessionId).toBe("test-session")
    })

    it("should not change session for same session ID", async () => {
        mockState.sessionId = "test-session"

        const messages: WithParts[] = [
            createMessage("msg_1", "user", [{ type: "text", text: "hello" }]),
        ]

        await checkSession(mockClient as any, mockState, mockLogger as any, messages)

        expect(mockState.sessionId).toBe("test-session")
    })

    it("should detect compaction from summary messages", async () => {
        mockState.lastCompaction = 0
        mockState.toolParameters.set("call_1", { tool: "read", parameters: {}, turn: 1 })
        mockState.prune.toolIds.push("call_1")

        const messages: WithParts[] = [
            createMessage("msg_0", "user", [{ type: "text", text: "init" }]),
            {
                info: {
                    id: "msg_1",
                    role: "assistant",
                    time: { created: 12345 },
                    summary: true,
                },
                parts: [],
            } as any,
        ]

        await checkSession(mockClient as any, mockState, mockLogger as any, messages)

        expect(mockState.lastCompaction).toBe(12345)
        expect(mockState.toolParameters.size).toBe(0)
        expect(mockState.prune.toolIds).toHaveLength(0)
    })

    it("should update current turn count", async () => {
        const messages: WithParts[] = [
            createMessage("msg_1", "user", [createStepPart()]),
            createMessage("msg_2", "assistant", [createStepPart()]),
        ]

        await checkSession(mockClient as any, mockState, mockLogger as any, messages)

        expect(mockState.currentTurn).toBe(2)
    })

    it("should handle empty messages gracefully", async () => {
        const messages: WithParts[] = []

        await checkSession(mockClient as any, mockState, mockLogger as any, messages)

        expect(mockState.sessionId).toBeNull()
    })
})

describe("session state hash maps", () => {
    let mockState: SessionState

    beforeEach(() => {
        mockState = createSessionState()
    })

    it("should track hash to call ID mappings", () => {
        mockState.hashRegistry.calls.set("r_abc123", "call_1")
        mockState.hashRegistry.callIds.set("call_1", "r_abc123")

        expect(mockState.hashRegistry.calls.get("r_abc123")).toBe("call_1")
        expect(mockState.hashRegistry.callIds.get("call_1")).toBe("r_abc123")
    })

    it("should track message part hash mappings", () => {
        mockState.hashRegistry.messages.set("a_xyz789", "msg_1:0")
        mockState.hashRegistry.messagePartIds.set("msg_1:0", "a_xyz789")

        expect(mockState.hashRegistry.messages.get("a_xyz789")).toBe("msg_1:0")
        expect(mockState.hashRegistry.messagePartIds.get("msg_1:0")).toBe("a_xyz789")
    })

    it("should track soft pruned tools", () => {
        mockState.softPrunedItems.set("call_1", {
            type: "tool",
            originalOutput: "original content",
            tool: "read",
            parameters: {},
            prunedAt: Date.now(),
            hash: "r_abc123",
        })

        expect(mockState.softPrunedItems.has("call_1")).toBe(true)
        const item = mockState.softPrunedItems.get("call_1")
        if (item?.type === "tool") {
            expect(item.originalOutput).toBe("original content")
        } else {
            throw new Error("Expected tool item")
        }
    })

    it("should track soft pruned message parts", () => {
        mockState.softPrunedItems.set("msg_1:0", {
            type: "message-part",
            originalText: "original text",
            messageId: "msg_1",
            partIndex: 0,
            prunedAt: Date.now(),
            hash: "a_xyz789",
        })

        expect(mockState.softPrunedItems.has("msg_1:0")).toBe(true)
        const item = mockState.softPrunedItems.get("msg_1:0")
        if (item?.type === "message-part") {
            expect(item.originalText).toBe("original text")
        } else {
            throw new Error("Expected message-part item")
        }
    })
})

describe("session stats", () => {
    let mockState: SessionState

    beforeEach(() => {
        mockState = createSessionState()
    })

    it("should track prune token counter", () => {
        mockState.stats.pruneTokenCounter += 100
        mockState.stats.totalPruneTokens += 100

        expect(mockState.stats.pruneTokenCounter).toBe(100)
        expect(mockState.stats.totalPruneTokens).toBe(100)
    })

    it("should track prune message counter", () => {
        mockState.stats.pruneMessageCounter += 5
        mockState.stats.totalPruneMessages += 5

        expect(mockState.stats.pruneMessageCounter).toBe(5)
        expect(mockState.stats.totalPruneMessages).toBe(5)
    })

    it("should track strategy-specific stats", () => {
        mockState.stats.strategyStats.autoSupersede.hash.count += 1
        mockState.stats.strategyStats.autoSupersede.hash.tokens += 50

        expect(mockState.stats.strategyStats.autoSupersede.hash.count).toBe(1)
        expect(mockState.stats.strategyStats.autoSupersede.hash.tokens).toBe(50)
    })
})
