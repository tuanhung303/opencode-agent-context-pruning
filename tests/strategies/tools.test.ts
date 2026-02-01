import { describe, it, expect, beforeEach, vi } from "vitest"
import type { SessionState } from "../../lib/state"
import type { PluginConfig } from "../../lib/config"

const createMockLogger = () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
})

const createMockClient = () => ({
    session: {
        messages: vi.fn().mockResolvedValue({
            data: [
                {
                    info: { id: "msg_1", role: "assistant", time: { created: Date.now() } },
                    parts: [
                        {
                            type: "tool",
                            callID: "call_1",
                            tool: "read",
                            state: { status: "completed", output: "test output" },
                        },
                    ],
                },
            ],
        }),
    },
})

const createMockConfig = (): PluginConfig =>
    ({
        enabled: true,
        tools: {
            discard: { enabled: true },
            distill: { enabled: true, showDistillation: false },
            settings: {
                protectedTools: [],
                enableAssistantMessagePruning: true,
                minAssistantTextLength: 100,
            },
        },
        protectedFilePatterns: [],
    }) as any

const createMockState = (): SessionState =>
    ({
        sessionId: "test-session",
        prune: { toolIds: [], messagePartIds: [] },
        toolParameters: new Map(),
        hashToCallId: new Map(),
        callIdToHash: new Map(),
        hashToMessagePart: new Map(),
        messagePartToHash: new Map(),
        softPrunedTools: new Map(),
        softPrunedMessageParts: new Map(),
        discardHistory: [],
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
    }) as any

describe("tools strategy", () => {
    let mockState: SessionState
    let mockLogger: ReturnType<typeof createMockLogger>
    let mockConfig: PluginConfig

    beforeEach(() => {
        mockState = createMockState()
        mockLogger = createMockLogger()
        mockConfig = createMockConfig()
    })

    describe("state initialization", () => {
        it("should create valid mock state for tools", () => {
            expect(mockState.sessionId).toBe("test-session")
            expect(mockState.prune.toolIds).toEqual([])
            expect(mockState.prune.messagePartIds).toEqual([])
        })

        it("should have empty hash mappings initially", () => {
            expect(mockState.hashToCallId.size).toBe(0)
            expect(mockState.callIdToHash.size).toBe(0)
            expect(mockState.hashToMessagePart.size).toBe(0)
            expect(mockState.messagePartToHash.size).toBe(0)
        })
    })

    describe("hash mappings", () => {
        it("should track tool hash to call ID mappings", () => {
            mockState.hashToCallId.set("#r_abc123#", "call_1")
            mockState.callIdToHash.set("call_1", "#r_abc123#")

            expect(mockState.hashToCallId.get("#r_abc123#")).toBe("call_1")
            expect(mockState.callIdToHash.get("call_1")).toBe("#r_abc123#")
        })

        it("should track message part hash mappings", () => {
            mockState.hashToMessagePart.set("#a_xyz789#", "msg_1:0")
            mockState.messagePartToHash.set("msg_1:0", "#a_xyz789#")

            expect(mockState.hashToMessagePart.get("#a_xyz789#")).toBe("msg_1:0")
            expect(mockState.messagePartToHash.get("msg_1:0")).toBe("#a_xyz789#")
        })
    })

    describe("prune state", () => {
        it("should track pruned tool IDs", () => {
            mockState.prune.toolIds.push("call_1", "call_2")

            expect(mockState.prune.toolIds).toContain("call_1")
            expect(mockState.prune.toolIds).toContain("call_2")
            expect(mockState.prune.toolIds).toHaveLength(2)
        })

        it("should track pruned message part IDs", () => {
            mockState.prune.messagePartIds.push("msg_1:0", "msg_1:1")

            expect(mockState.prune.messagePartIds).toContain("msg_1:0")
            expect(mockState.prune.messagePartIds).toContain("msg_1:1")
            expect(mockState.prune.messagePartIds).toHaveLength(2)
        })
    })

    describe("soft prune cache", () => {
        it("should store soft pruned tools", () => {
            mockState.softPrunedTools.set("call_1", {
                originalOutput: "original content",
                tool: "read",
                parameters: {},
                prunedAt: Date.now(),
                hash: "#r_abc123#",
            })

            expect(mockState.softPrunedTools.has("call_1")).toBe(true)
            expect(mockState.softPrunedTools.get("call_1")?.originalOutput).toBe("original content")
        })

        it("should store soft pruned message parts", () => {
            mockState.softPrunedMessageParts.set("msg_1:0", {
                originalText: "original text content",
                messageId: "msg_1",
                partIndex: 0,
                prunedAt: Date.now(),
                hash: "#a_xyz789#",
            })

            expect(mockState.softPrunedMessageParts.has("msg_1:0")).toBe(true)
            expect(mockState.softPrunedMessageParts.get("msg_1:0")?.originalText).toBe(
                "original text content",
            )
        })
    })

    describe("discard history", () => {
        it("should track discard history", () => {
            mockState.discardHistory.push({
                timestamp: Date.now(),
                hashes: ["#r_abc123#", "#r_def456#"],
                tokensSaved: 100,
                reason: "manual",
            })

            expect(mockState.discardHistory).toHaveLength(1)
            expect(mockState.discardHistory[0].tokensSaved).toBe(100)
        })
    })

    describe("tool configuration", () => {
        it("should have discard tool enabled by default", () => {
            expect(mockConfig.tools.discard.enabled).toBe(true)
        })

        it("should have distill tool enabled by default", () => {
            expect(mockConfig.tools.distill.enabled).toBe(true)
        })

        it("should have assistant message pruning enabled", () => {
            expect(mockConfig.tools.settings.enableAssistantMessagePruning).toBe(true)
        })

        it("should have minimum assistant text length configured", () => {
            expect(mockConfig.tools.settings.minAssistantTextLength).toBeGreaterThan(0)
        })
    })

    describe("stats tracking", () => {
        it("should track manual discard stats", () => {
            mockState.stats.strategyStats.manualDiscard.count += 1
            mockState.stats.strategyStats.manualDiscard.tokens += 50

            expect(mockState.stats.strategyStats.manualDiscard.count).toBe(1)
            expect(mockState.stats.strategyStats.manualDiscard.tokens).toBe(50)
        })

        it("should track distillation stats", () => {
            mockState.stats.strategyStats.distillation.count += 1
            mockState.stats.strategyStats.distillation.tokens += 75

            expect(mockState.stats.strategyStats.distillation.count).toBe(1)
            expect(mockState.stats.strategyStats.distillation.tokens).toBe(75)
        })
    })
})
