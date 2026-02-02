import { describe, it, expect, beforeEach } from "vitest"
import { compressThinkingBlocks } from "../../lib/strategies/thinking-compression"
import type { SessionState, WithParts } from "../../lib/state"
import type { PluginConfig } from "../../lib/config"

const createMockLogger = () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
})

const createMockConfig = (overrides?: any): PluginConfig =>
    ({
        enabled: true,
        strategies: {
            thinkingCompression: {
                enabled: true,
                minTurnsOld: 3,
                maxTokens: 50, // Small threshold for testing
                ...overrides?.strategies?.thinkingCompression,
            },
        },
    }) as any

const createMockState = (currentTurn: number = 10): SessionState =>
    ({
        currentTurn,
        lastCompaction: 0,
        stats: {
            totalPruneTokens: 0,
            totalPruneMessages: 0,
            strategyStats: {
                thinkingCompression: { count: 0, tokens: 0 },
            },
        },
    }) as any

const createMessage = (id: string, role: "user" | "assistant", parts: any[]): WithParts =>
    ({
        info: {
            id,
            role,
            time: { created: Date.now() },
        },
        parts,
    }) as any

describe("compressThinkingBlocks", () => {
    let mockLogger: any
    let mockConfig: PluginConfig
    let mockState: SessionState

    beforeEach(() => {
        mockLogger = createMockLogger()
        mockConfig = createMockConfig()
        mockState = createMockState()
    })

    it("should not compress if strategy is disabled", () => {
        mockConfig.strategies.thinkingCompression.enabled = false
        const largeReasoning = "word ".repeat(100)
        const messages: WithParts[] = [
            createMessage("msg_1", "assistant", [
                { type: "reasoning", text: largeReasoning } as any,
            ]),
        ]

        compressThinkingBlocks(mockState, mockLogger, mockConfig, messages)

        expect((messages[0].parts[0] as any).text).toBe(largeReasoning)
    })

    it("should not compress recent messages", () => {
        // currentTurn = 10, msgTurn = 10, age = 0 < 3
        const largeReasoning = "word ".repeat(100)
        const messages: WithParts[] = [
            createMessage("msg_1", "assistant", [
                { type: "step-start" } as any, // Turn 1
                { type: "reasoning", text: largeReasoning } as any,
            ]),
        ]
        mockState.currentTurn = 1

        compressThinkingBlocks(mockState, mockLogger, mockConfig, messages)

        expect((messages[0].parts[1] as any).text).toBe(largeReasoning)
    })

    it("should compress old messages with large reasoning", () => {
        // currentTurn = 10, msgTurn = 1, age = 9 > 3
        const largeReasoning =
            "This is a very long reasoning block that should be compressed because it exceeds the fifty tokens threshold and is from an older turn.\n".repeat(
                10,
            )
        const messages: WithParts[] = [
            createMessage("msg_1", "assistant", [
                { type: "step-start" } as any, // Turn 1
                { type: "reasoning", text: largeReasoning } as any,
            ]),
        ]
        mockState.currentTurn = 10

        compressThinkingBlocks(mockState, mockLogger, mockConfig, messages)

        const compressedText = (messages[0].parts[1] as any).text
        expect(compressedText).toContain("[Thinking compressed to save context")
        expect(compressedText.length).toBeLessThan(largeReasoning.length)
    })

    it("should preserve key phrases during compression", () => {
        const largeReasoning =
            "Starting the reasoning process here.\n" +
            "Intermediate step that might be removed.\n".repeat(20) +
            "The conclusion is that we should proceed with the plan.\n" +
            "In summary, this is the best approach."

        const messages: WithParts[] = [
            createMessage("msg_1", "assistant", [
                { type: "step-start" } as any,
                { type: "reasoning", text: largeReasoning } as any,
            ]),
        ]
        mockState.currentTurn = 10

        compressThinkingBlocks(mockState, mockLogger, mockConfig, messages)

        const compressedText = (messages[0].parts[1] as any).text
        expect(compressedText.toLowerCase()).toContain("conclusion")
        expect(compressedText.toLowerCase()).toContain("summary")
        expect(compressedText).toContain("Starting the reasoning")
    })

    it("should update stats when compressing", () => {
        const largeReasoning = "word\n".repeat(200)
        const messages: WithParts[] = [
            createMessage("msg_1", "assistant", [
                { type: "step-start" } as any,
                { type: "reasoning", text: largeReasoning } as any,
            ]),
        ]
        mockState.currentTurn = 10

        compressThinkingBlocks(mockState, mockLogger, mockConfig, messages)

        expect(mockState.stats.strategyStats.thinkingCompression.count).toBe(1)
        expect(mockState.stats.strategyStats.thinkingCompression.tokens).toBeGreaterThan(0)
    })

    it("should skip already compressed blocks", () => {
        const compressedReasoning =
            "Some text [Thinking compressed to save context - key points preserved above]"
        const messages: WithParts[] = [
            createMessage("msg_1", "assistant", [
                { type: "step-start" } as any,
                { type: "reasoning", text: compressedReasoning } as any,
            ]),
        ]
        mockState.currentTurn = 10

        compressThinkingBlocks(mockState, mockLogger, mockConfig, messages)

        expect((messages[0].parts[1] as any).text).toBe(compressedReasoning)
        expect(mockState.stats.strategyStats.thinkingCompression.count).toBe(0)
    })
})
