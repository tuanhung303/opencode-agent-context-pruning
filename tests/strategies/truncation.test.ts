import { describe, it, expect, beforeEach } from "vitest"
import { truncateLargeOutputs, estimateTruncationSavings } from "../../lib/strategies/truncation"
import type { SessionState, WithParts } from "../../lib/state"
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
        strategies: {
            truncation: {
                enabled: true,
                maxTokens: 100, // Low threshold for testing
                headRatio: 0.4,
                tailRatio: 0.4,
                minTurnsOld: 2,
                targetTools: ["read", "grep", "glob", "bash"],
            },
            ...overrides?.strategies,
        },
    }) as any

const createMockState = (currentTurn: number = 5): SessionState =>
    ({
        currentTurn,
        prune: {
            toolIds: [],
        },
        compactedMessageIds: new Set<string>(),
        lastCompaction: 0,
        toolParameters: new Map(),
        stats: {
            strategyStats: {
                truncation: { count: 0, tokens: 0 },
                thinkingCompression: { count: 0, tokens: 0 },
                deduplication: { count: 0, tokens: 0 },
                supersedeWrites: { count: 0, tokens: 0 },
                purgeErrors: { count: 0, tokens: 0 },
            },
        },
    }) as any

const createToolPart = (
    callID: string,
    tool: string,
    status: "completed" | "error",
    output: string,
) => ({
    type: "tool" as const,
    callID,
    tool,
    state: {
        status,
        output,
    },
})

const createMessage = (id: string, parts: any[]): WithParts =>
    ({
        info: {
            id,
            role: "assistant" as const,
            time: { created: Date.now() },
        },
        parts,
    }) as any

describe("truncateLargeOutputs", () => {
    let mockLogger: ReturnType<typeof createMockLogger>
    let mockConfig: PluginConfig
    let mockState: SessionState

    beforeEach(() => {
        mockLogger = createMockLogger()
        mockConfig = createMockConfig()
        mockState = createMockState(5)
    })

    describe("basic truncation", () => {
        it("should truncate large tool outputs", () => {
            // Create content that will exceed 2000 tokens
            const largeContent = "line content here\n".repeat(500)

            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart("call_123", "read", "completed", largeContent),
                ]),
            ]

            // Set tool age to be old enough (turn 1, current turn 5 = age 4)
            mockState.toolParameters.set("call_123", { turn: 1, tool: "read", parameters: {} })

            truncateLargeOutputs(mockState, mockLogger as any, mockConfig, messages)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toContain("[...")
            expect(output).toContain("lines truncated")
            expect(output.length).toBeLessThan(largeContent.length)
        })

        it("should not truncate small outputs", () => {
            const smallContent = "small content"
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart("call_123", "read", "completed", smallContent),
                ]),
            ]

            mockState.toolParameters.set("call_123", { turn: 1, tool: "read", parameters: {} })

            truncateLargeOutputs(mockState, mockLogger as any, mockConfig, messages)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe(smallContent)
            expect(output).not.toContain("truncated")
        })

        it("should not truncate recent tools (less than minTurnsOld)", () => {
            const largeContent = "line content here\n".repeat(500)
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart("call_123", "read", "completed", largeContent),
                ]),
            ]

            // Tool from turn 4, current turn 5 = age 1 (less than minTurnsOld: 2)
            mockState.toolParameters.set("call_123", { turn: 4, tool: "read", parameters: {} })

            truncateLargeOutputs(mockState, mockLogger as any, mockConfig, messages)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe(largeContent)
            expect(output).not.toContain("truncated")
        })
    })

    describe("target tools", () => {
        it("should truncate read tool outputs", () => {
            const largeContent = "line content here\n".repeat(500)
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart("call_123", "read", "completed", largeContent),
                ]),
            ]

            mockState.toolParameters.set("call_123", { turn: 1, tool: "read", parameters: {} })
            truncateLargeOutputs(mockState, mockLogger as any, mockConfig, messages)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toContain("truncated")
        })

        it("should truncate glob tool outputs", () => {
            const largeContent = "file1.ts\nfile2.ts\n".repeat(100)
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart("call_123", "glob", "completed", largeContent),
                ]),
            ]

            mockState.toolParameters.set("call_123", { turn: 1, tool: "glob", parameters: {} })
            truncateLargeOutputs(mockState, mockLogger as any, mockConfig, messages)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toContain("truncated")
        })

        it("should truncate bash tool outputs", () => {
            const largeContent = "output line\n".repeat(500)
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart("call_123", "bash", "completed", largeContent),
                ]),
            ]

            mockState.toolParameters.set("call_123", { turn: 1, tool: "bash", parameters: {} })
            truncateLargeOutputs(mockState, mockLogger as any, mockConfig, messages)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toContain("truncated")
        })

        it("should not truncate non-target tools", () => {
            const largeContent = "line content here\n".repeat(500)
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart("call_123", "edit", "completed", largeContent),
                ]),
            ]

            mockState.toolParameters.set("call_123", { turn: 1, tool: "edit", parameters: {} })
            truncateLargeOutputs(mockState, mockLogger as any, mockConfig, messages)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe(largeContent)
            expect(output).not.toContain("truncated")
        })
    })

    describe("status filtering", () => {
        it("should not truncate errored tools", () => {
            const largeContent = "line content here\n".repeat(500)
            const messages: WithParts[] = [
                createMessage("msg_1", [createToolPart("call_123", "read", "error", largeContent)]),
            ]

            mockState.toolParameters.set("call_123", { turn: 1, tool: "read", parameters: {} })
            truncateLargeOutputs(mockState, mockLogger as any, mockConfig, messages)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe(largeContent)
            expect(output).not.toContain("truncated")
        })
    })

    describe("already truncated", () => {
        it("should not truncate already truncated content", () => {
            const alreadyTruncated =
                "head\n\n[... middle content truncated to save context ...]\n\ntail"
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart("call_123", "read", "completed", alreadyTruncated),
                ]),
            ]

            mockState.toolParameters.set("call_123", { turn: 1, tool: "read", parameters: {} })
            truncateLargeOutputs(mockState, mockLogger as any, mockConfig, messages)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe(alreadyTruncated)
        })
    })

    describe("pruned tools", () => {
        it("should not truncate already pruned tools", () => {
            const largeContent = "line content here\n".repeat(500)
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart("call_123", "read", "completed", largeContent),
                ]),
            ]

            mockState.prune.toolIds.push("call_123")
            mockState.toolParameters.set("call_123", { turn: 1, tool: "read", parameters: {} })
            truncateLargeOutputs(mockState, mockLogger as any, mockConfig, messages)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe(largeContent)
        })
    })

    describe("disabled strategy", () => {
        it("should not truncate when strategy is disabled", () => {
            const largeContent = "line content here\n".repeat(500)
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart("call_123", "read", "completed", largeContent),
                ]),
            ]

            mockState.toolParameters.set("call_123", { turn: 1, tool: "read", parameters: {} })

            const disabledConfig = createMockConfig({
                strategies: {
                    truncation: {
                        enabled: false,
                        maxTokens: 2000,
                        headRatio: 0.4,
                        tailRatio: 0.4,
                        minTurnsOld: 2,
                        targetTools: ["read", "grep", "glob", "bash"],
                    },
                },
            } as any)

            truncateLargeOutputs(mockState, mockLogger as any, disabledConfig, messages)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe(largeContent)
        })
    })

    describe("stats tracking", () => {
        it("should update stats when truncating", () => {
            const largeContent = "line content here\n".repeat(500)
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart("call_123", "read", "completed", largeContent),
                ]),
            ]

            mockState.toolParameters.set("call_123", { turn: 1, tool: "read", parameters: {} })
            truncateLargeOutputs(mockState, mockLogger as any, mockConfig, messages)

            expect(mockState.stats.strategyStats.truncation.count).toBeGreaterThan(0)
            expect(mockState.stats.strategyStats.truncation.tokens).toBeGreaterThan(0)
        })
    })
})

describe("estimateTruncationSavings", () => {
    it("should estimate savings for large content", () => {
        const largeContent = "line content here\n".repeat(500)
        const result = estimateTruncationSavings(largeContent, 100)

        expect(result.wouldTruncate).toBe(true)
        expect(result.estimatedSavings).toBeGreaterThan(0)
    })

    it("should not estimate savings for small content", () => {
        const smallContent = "small content"
        const result = estimateTruncationSavings(smallContent, 100)

        expect(result.wouldTruncate).toBe(false)
        expect(result.estimatedSavings).toBe(0)
    })

    it("should handle empty content", () => {
        const result = estimateTruncationSavings("", 100)
        expect(result.wouldTruncate).toBe(false)
        expect(result.estimatedSavings).toBe(0)
    })

    it("should handle non-string content", () => {
        const result = estimateTruncationSavings(null as any, 100)
        expect(result.wouldTruncate).toBe(false)
        expect(result.estimatedSavings).toBe(0)
    })
})
