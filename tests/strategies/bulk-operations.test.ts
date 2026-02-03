import { describe, it, expect, beforeEach } from "vitest"
import {
    collectAllToolHashes,
    collectAllMessageHashes,
    detectTargetType,
} from "../../lib/messages/utils"
import type { SessionState, ToolParameterEntry } from "../../lib/state"
import type { PluginConfig } from "../../lib/config"

const createMockLogger = () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
})

const createMockConfig = (overrides?: Partial<PluginConfig>): PluginConfig =>
    ({
        enabled: true,
        turnProtection: {
            enabled: true,
            turns: 1,
        },
        tools: {
            settings: {
                protectedTools: ["question", "todowrite"],
                enableAssistantMessagePruning: true,
            },
        },
        ...overrides,
    }) as any

const createMockState = (currentTurn: number = 5): SessionState =>
    ({
        sessionId: "test-session",
        isSubAgent: false,
        currentTurn,
        prune: {
            toolIds: [],
            messagePartIds: [],
            reasoningPartIds: [],
        },
        toolParameters: new Map<string, ToolParameterEntry>(),
        hashToCallId: new Map<string, string>(),
        callIdToHash: new Map<string, string>(),
        hashToMessagePart: new Map<string, string>(),
        messagePartToHash: new Map<string, string>(),
        hashToReasoningPart: new Map<string, string>(),
        reasoningPartToHash: new Map<string, string>(),
        stats: {
            pruneTokenCounter: 0,
            totalPruneTokens: 0,
            pruneMessageCounter: 0,
            totalPruneMessages: 0,
            strategyStats: {
                deduplication: { count: 0, tokens: 0 },
                supersedeWrites: { count: 0, tokens: 0 },
                purgeErrors: { count: 0, tokens: 0 },
                manualDiscard: { count: 0, tokens: 0 },
                distillation: { count: 0, tokens: 0 },
                truncation: { count: 0, tokens: 0 },
                thinkingCompression: { count: 0, tokens: 0 },
            },
        },
        lastDiscardStats: null,
        lastToolPrune: false,
        lastCompaction: 0,
        lastUserMessageId: null,
        discardHistory: [],
        softPrunedTools: new Map(),
        softPrunedMessageParts: new Map(),
        softPrunedReasoningParts: new Map(),
        softPrunedMessages: new Map(),
        lastTodoTurn: 0,
        lastReminderTurn: 0,
        lastTodowriteCallId: null,
        todos: [],
        automataEnabled: false,
        lastAutomataTurn: 0,
        lastReflectionTurn: 0,
    }) as any

describe("detectTargetType", () => {
    it("should detect tool hashes via state lookup", () => {
        const state = createMockState()
        state.hashToCallId.set("a1b2c3", "call_1")
        state.hashToCallId.set("d4e5f6", "call_2")
        expect(detectTargetType("a1b2c3", state)).toBe("tool_hash")
        expect(detectTargetType("d4e5f6", state)).toBe("tool_hash")
    })

    it("should detect message hashes via state lookup", () => {
        const state = createMockState()
        state.hashToMessagePart.set("abc123", "msg_1:0")
        state.hashToMessagePart.set("def456", "msg_2:0")
        expect(detectTargetType("abc123", state)).toBe("message_hash")
        expect(detectTargetType("def456", state)).toBe("message_hash")
    })

    it("should detect reasoning hashes via state lookup", () => {
        const state = createMockState()
        state.hashToReasoningPart.set("789abc", "reason_1:0")
        state.hashToReasoningPart.set("012345", "reason_2:0")
        expect(detectTargetType("789abc", state)).toBe("reasoning_hash")
        expect(detectTargetType("012345", state)).toBe("reasoning_hash")
    })

    it("should detect bulk patterns", () => {
        const state = createMockState()
        expect(detectTargetType("[tools]", state)).toBe("bulk_tools")
        expect(detectTargetType("[messages]", state)).toBe("bulk_messages")
        expect(detectTargetType("[*]", state)).toBe("bulk_all")
        expect(detectTargetType("[all]", state)).toBe("bulk_all")
    })

    it("should default to tool_hash for unknown targets", () => {
        const state = createMockState()
        expect(detectTargetType("unknown_hash", state)).toBe("tool_hash")
    })
})

describe("collectAllToolHashes", () => {
    let state: SessionState
    let config: PluginConfig

    beforeEach(() => {
        state = createMockState()
        config = createMockConfig()
    })

    it("should return all eligible tool hashes", () => {
        // Setup: Add some tools with hashes (6 hex chars, no prefix)
        state.hashToCallId.set("abc123", "call_001")
        state.hashToCallId.set("def456", "call_002")
        state.callIdToHash.set("call_001", "abc123")
        state.callIdToHash.set("call_002", "def456")

        state.toolParameters.set("call_001", {
            tool: "read",
            parameters: { filePath: "/test.txt" },
            turn: 1,
        })
        state.toolParameters.set("call_002", {
            tool: "grep",
            parameters: { pattern: "foo" },
            turn: 2,
        })

        const result = collectAllToolHashes(state, config)

        expect(result).toHaveLength(2)
        expect(result).toContain("abc123")
        expect(result).toContain("def456")
    })

    it("should exclude already pruned tools", () => {
        // Setup: Add tools, one already pruned
        state.hashToCallId.set("abc123", "call_001")
        state.hashToCallId.set("def456", "call_002")
        state.callIdToHash.set("call_001", "abc123")
        state.callIdToHash.set("call_002", "def456")

        state.toolParameters.set("call_001", {
            tool: "read",
            parameters: { filePath: "/test.txt" },
            turn: 1,
        })
        state.toolParameters.set("call_002", {
            tool: "grep",
            parameters: { pattern: "foo" },
            turn: 2,
        })

        // Mark one as pruned
        state.prune.toolIds.push("call_001")

        const result = collectAllToolHashes(state, config)

        expect(result).toHaveLength(1)
        expect(result).toContain("def456")
        expect(result).not.toContain("abc123")
    })

    it("should exclude protected tools", () => {
        // Setup: Add tools, one is protected
        state.hashToCallId.set("abc123", "call_001")
        state.hashToCallId.set("def789", "call_002")
        state.callIdToHash.set("call_001", "abc123")
        state.callIdToHash.set("call_002", "def789")

        state.toolParameters.set("call_001", {
            tool: "read",
            parameters: { filePath: "/test.txt" },
            turn: 1,
        })
        state.toolParameters.set("call_002", {
            tool: "question",
            parameters: { questions: ["test?"] },
            turn: 2,
        })

        const result = collectAllToolHashes(state, config)

        expect(result).toHaveLength(1)
        expect(result).toContain("abc123")
        expect(result).not.toContain("def789")
    })

    it("should return empty array when no tools exist", () => {
        const result = collectAllToolHashes(state, config)
        expect(result).toHaveLength(0)
    })

    it("should exclude tools without hashes (turn protection)", () => {
        // Setup: Add tools where one doesn't have a hash (simulating turn protection)
        state.hashToCallId.set("abc123", "call_001")
        state.callIdToHash.set("call_001", "abc123")
        // call_002 exists in toolParameters but has no hash (protected by turn)
        state.toolParameters.set("call_001", {
            tool: "read",
            parameters: { filePath: "/test.txt" },
            turn: 1,
        })
        state.toolParameters.set("call_002", {
            tool: "grep",
            parameters: { pattern: "foo" },
            turn: 5, // Current turn - no hash assigned due to turn protection
        })

        const result = collectAllToolHashes(state, config)

        // Only the tool with a hash should be collected
        expect(result).toHaveLength(1)
        expect(result).toContain("abc123")
    })
})

describe("collectAllMessageHashes", () => {
    let state: SessionState

    beforeEach(() => {
        state = createMockState()
    })

    it("should return all message hashes", () => {
        // Setup: Add some message hashes
        state.hashToMessagePart.set("abc123", "msg_001:0")
        state.hashToMessagePart.set("def456", "msg_002:0")

        const result = collectAllMessageHashes(state)

        expect(result).toHaveLength(2)
        expect(result).toContain("abc123")
        expect(result).toContain("def456")
    })

    it("should exclude already pruned message parts", () => {
        // Setup: Add message hashes, one already pruned
        state.hashToMessagePart.set("abc123", "msg_001:0")
        state.hashToMessagePart.set("def456", "msg_002:0")

        // Mark one as pruned
        state.prune.messagePartIds.push("msg_001:0")

        const result = collectAllMessageHashes(state)

        expect(result).toHaveLength(1)
        expect(result).toContain("def456")
        expect(result).not.toContain("abc123")
    })

    it("should return empty array when no message hashes exist", () => {
        const result = collectAllMessageHashes(state)
        expect(result).toHaveLength(0)
    })
})
