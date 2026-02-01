import { describe, it, expect, beforeEach, vi } from "vitest"
import type { SessionState, WithParts } from "../../lib/state"
import type { PluginConfig } from "../../lib/config"

const createMockLogger = () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    saveContext: vi.fn(),
})

const createMockConfig = (overrides?: Partial<PluginConfig>): PluginConfig =>
    ({
        enabled: true,
        commands: { enabled: true, protectedTools: [] },
        tools: {
            discard: { enabled: true },
            distill: { enabled: true, showDistillation: false },
            settings: {
                protectedTools: [],
                enableAssistantMessagePruning: true,
                minAssistantTextLength: 100,
            },
        },
        strategies: {
            deduplication: { enabled: true, protectedTools: [] },
            supersedeWrites: { enabled: true },
            purgeErrors: { enabled: true, turns: 3, protectedTools: [] },
            truncation: {
                enabled: true,
                maxTokens: 2000,
                headRatio: 0.4,
                tailRatio: 0.4,
                minTurnsOld: 2,
                targetTools: ["read", "grep", "glob", "bash"],
            },
            thinkingCompression: { enabled: true, minTurnsOld: 3, maxTokens: 500 },
        },
        protectedFilePatterns: [],
        ...overrides,
    }) as any

const createMockState = (): SessionState =>
    ({
        sessionId: "test-session",
        isSubAgent: false,
        prune: { toolIds: [], messagePartIds: [] },
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
        toolParameters: new Map(),
        hashToCallId: new Map(),
        callIdToHash: new Map(),
        hashToMessagePart: new Map(),
        messagePartToHash: new Map(),
        softPrunedTools: new Map(),
        softPrunedMessageParts: new Map(),
        discardHistory: [],
        lastUserMessageId: null,
        lastCompaction: 0,
        currentTurn: 0,
    }) as any

const createMockClient = () => ({
    session: {
        messages: vi.fn().mockResolvedValue({ data: [] }),
    },
})

describe("hooks", () => {
    let mockState: SessionState
    let mockLogger: ReturnType<typeof createMockLogger>
    let mockConfig: PluginConfig

    beforeEach(() => {
        mockState = createMockState()
        mockLogger = createMockLogger()
        mockConfig = createMockConfig()
    })

    describe("state initialization", () => {
        it("should create valid mock state", () => {
            expect(mockState.sessionId).toBe("test-session")
            expect(mockState.isSubAgent).toBe(false)
            expect(mockState.prune.toolIds).toEqual([])
            expect(mockState.prune.messagePartIds).toEqual([])
        })

        it("should create valid mock config", () => {
            expect(mockConfig.enabled).toBe(true)
            expect(mockConfig.tools.discard.enabled).toBe(true)
            expect(mockConfig.tools.distill.enabled).toBe(true)
        })
    })

    describe("sub-agent detection", () => {
        it("should identify sub-agent state", () => {
            mockState.isSubAgent = true
            expect(mockState.isSubAgent).toBe(true)
        })

        it("should identify non-sub-agent state", () => {
            expect(mockState.isSubAgent).toBe(false)
        })
    })

    describe("tool configuration", () => {
        it("should have discard tool enabled by default", () => {
            expect(mockConfig.tools.discard.enabled).toBe(true)
        })

        it("should have distill tool enabled by default", () => {
            expect(mockConfig.tools.distill.enabled).toBe(true)
        })

        it("should respect tool configuration overrides", () => {
            const disabledConfig = createMockConfig({
                tools: {
                    ...mockConfig.tools,
                    discard: { enabled: false },
                },
            })
            expect(disabledConfig.tools.discard.enabled).toBe(false)
        })
    })

    describe("strategy configuration", () => {
        it("should have all strategies enabled by default", () => {
            expect(mockConfig.strategies.deduplication.enabled).toBe(true)
            expect(mockConfig.strategies.supersedeWrites.enabled).toBe(true)
            expect(mockConfig.strategies.purgeErrors.enabled).toBe(true)
            expect(mockConfig.strategies.truncation.enabled).toBe(true)
            expect(mockConfig.strategies.thinkingCompression.enabled).toBe(true)
        })

        it("should allow disabling individual strategies", () => {
            const disabledConfig = createMockConfig({
                strategies: {
                    ...mockConfig.strategies,
                    deduplication: { enabled: false, protectedTools: [] },
                },
            })
            expect(disabledConfig.strategies.deduplication.enabled).toBe(false)
        })
    })

    describe("state hash maps", () => {
        it("should track hash to call ID mappings", () => {
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

    describe("protected file patterns", () => {
        it("should support protected file patterns", () => {
            const protectedConfig = createMockConfig({
                protectedFilePatterns: ["*.secret", "**/.env"],
            })
            expect(protectedConfig.protectedFilePatterns).toContain("*.secret")
            expect(protectedConfig.protectedFilePatterns).toContain("**/.env")
        })
    })
})
