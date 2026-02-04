import { describe, it, expect, beforeEach } from "vitest"
import { collectAllReasoningHashes, detectTargetType } from "../../lib/messages/utils"
import type { SessionState } from "../../lib/state"

const createMockLogger = () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
})

describe("bulk thinking operations", () => {
    let mockState: SessionState
    let logger: ReturnType<typeof createMockLogger>

    beforeEach(() => {
        mockState = {
            sessionId: "test-session",
            isSubAgent: false,
            currentTurn: 5,
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
                reasoning: new Map([
                    ["abc123", "reasoning-1"],
                    ["def456", "reasoning-2"],
                    ["ghi789", "reasoning-3"],
                ]),
                reasoningPartIds: new Map(),
            },
            toolParameters: new Map(),
            config: {
                enabled: true,
                tools: {
                    settings: {
                        protectedTools: ["task"],
                        enableAssistantMessagePruning: true,
                    },
                },
            },
            stats: {
                pruneTokenCounter: 0,
                pruneMessageCounter: 0,
                strategyStats: {
                    manualDiscard: {
                        thinking: { count: 0, tokens: 0 },
                    },
                },
            },
            lastDiscardStats: { itemCount: 0, tokensSaved: 0 },
        } as SessionState
        logger = createMockLogger()
    })

    describe("collectAllReasoningHashes", () => {
        it("should collect all reasoning hashes from hashRegistry", () => {
            const hashes = collectAllReasoningHashes(mockState)
            expect(hashes).toHaveLength(3)
            expect(hashes).toContain("abc123")
            expect(hashes).toContain("def456")
            expect(hashes).toContain("ghi789")
        })

        it("should return empty array when no reasoning hashes exist", () => {
            mockState.hashRegistry.reasoning = new Map()
            const hashes = collectAllReasoningHashes(mockState)
            expect(hashes).toHaveLength(0)
        })
    })

    describe("detectTargetType", () => {
        it("should detect [thinking] bulk pattern", () => {
            const result = detectTargetType("[thinking]", mockState)
            expect(result).toBe("bulk_thinking")
        })

        it("should detect [tools] bulk pattern", () => {
            const result = detectTargetType("[tools]", mockState)
            expect(result).toBe("bulk_tools")
        })

        it("should detect [messages] bulk pattern", () => {
            const result = detectTargetType("[messages]", mockState)
            expect(result).toBe("bulk_messages")
        })

        it("should detect [*] bulk pattern", () => {
            const result = detectTargetType("[*]", mockState)
            expect(result).toBe("bulk_all")
        })

        it("should detect [all] bulk pattern", () => {
            const result = detectTargetType("[all]", mockState)
            expect(result).toBe("bulk_all")
        })

        it("should detect reasoning hash", () => {
            const result = detectTargetType("abc123", mockState)
            expect(result).toBe("reasoning_hash")
        })

        it("should detect tool hash from registry", () => {
            mockState.hashRegistry.calls.set("xyz789", "tool-1")
            const result = detectTargetType("xyz789", mockState)
            expect(result).toBe("tool_hash")
        })

        it("should detect message hash from registry", () => {
            mockState.hashRegistry.messages.set("uvw456", "msg-1")
            const result = detectTargetType("uvw456", mockState)
            expect(result).toBe("message_hash")
        })
    })
})
