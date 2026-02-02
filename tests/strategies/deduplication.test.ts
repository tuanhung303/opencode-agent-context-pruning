import { describe, it, expect, beforeEach } from "vitest"
import { deduplicate } from "../../lib/strategies/deduplication"
import type { SessionState, WithParts, ToolParameterEntry } from "../../lib/state"
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
        protectedFilePatterns: [],
        strategies: {
            deduplication: {
                enabled: true,
                protectedTools: [],
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
        toolParameters: new Map<string, ToolParameterEntry>(),
        stats: {
            totalPruneTokens: 0,
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
    }) as any

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

const createMessage = (id: string, parts: any[]): WithParts =>
    ({
        info: {
            id,
            role: "assistant" as const,
            time: { created: Date.now() },
        },
        parts,
    }) as any

describe("deduplicate", () => {
    let mockLogger: ReturnType<typeof createMockLogger>
    let mockConfig: PluginConfig
    let mockState: SessionState

    beforeEach(() => {
        mockLogger = createMockLogger()
        mockConfig = createMockConfig()
        mockState = createMockState()
    })

    describe("exact signature deduplication", () => {
        it("should prune duplicate tool calls with identical parameters", () => {
            const messages: WithParts[] = [
                createMessage("msg_1", [createToolPart("call_1", "read")]),
                createMessage("msg_2", [createToolPart("call_2", "read")]),
            ]

            // Same parameters for both calls
            mockState.toolParameters.set("call_1", {
                tool: "read",
                parameters: { filePath: "/test/file.ts" },
                turn: 1,
            })
            mockState.toolParameters.set("call_2", {
                tool: "read",
                parameters: { filePath: "/test/file.ts" },
                turn: 2,
            })

            deduplicate(mockState, mockLogger as any, mockConfig, messages)

            expect(mockState.prune.toolIds).toContain("call_1")
            expect(mockState.prune.toolIds).not.toContain("call_2")
        })

        it("should keep only the most recent duplicate", () => {
            const messages: WithParts[] = [
                createMessage("msg_1", [createToolPart("call_1", "read")]),
                createMessage("msg_2", [createToolPart("call_2", "read")]),
                createMessage("msg_3", [createToolPart("call_3", "read")]),
            ]

            // All three have same parameters
            mockState.toolParameters.set("call_1", {
                tool: "read",
                parameters: { filePath: "/test/file.ts" },
                turn: 1,
            })
            mockState.toolParameters.set("call_2", {
                tool: "read",
                parameters: { filePath: "/test/file.ts" },
                turn: 2,
            })
            mockState.toolParameters.set("call_3", {
                tool: "read",
                parameters: { filePath: "/test/file.ts" },
                turn: 3,
            })

            deduplicate(mockState, mockLogger as any, mockConfig, messages)

            expect(mockState.prune.toolIds).toContain("call_1")
            expect(mockState.prune.toolIds).toContain("call_2")
            expect(mockState.prune.toolIds).not.toContain("call_3")
        })

        it("should not prune different tools with same parameters", () => {
            const messages: WithParts[] = [
                createMessage("msg_1", [createToolPart("call_1", "read")]),
                createMessage("msg_2", [createToolPart("call_2", "glob")]),
            ]

            mockState.toolParameters.set("call_1", {
                tool: "read",
                parameters: { pattern: "*.ts" },
                turn: 1,
            })
            mockState.toolParameters.set("call_2", {
                tool: "glob",
                parameters: { pattern: "*.ts" },
                turn: 2,
            })

            deduplicate(mockState, mockLogger as any, mockConfig, messages)

            expect(mockState.prune.toolIds).toHaveLength(0)
        })

        it("should not prune same tool with different parameters", () => {
            const messages: WithParts[] = [
                createMessage("msg_1", [createToolPart("call_1", "read")]),
                createMessage("msg_2", [createToolPart("call_2", "read")]),
            ]

            mockState.toolParameters.set("call_1", {
                tool: "read",
                parameters: { filePath: "/test/file1.ts" },
                turn: 1,
            })
            mockState.toolParameters.set("call_2", {
                tool: "read",
                parameters: { filePath: "/test/file2.ts" },
                turn: 2,
            })

            deduplicate(mockState, mockLogger as any, mockConfig, messages)

            expect(mockState.prune.toolIds).toHaveLength(0)
        })
    })

    describe("protected tools", () => {
        it("should not prune protected tools", () => {
            mockConfig = createMockConfig({
                strategies: {
                    deduplication: {
                        enabled: true,
                        protectedTools: ["read"],
                    },
                },
            } as any)

            const messages: WithParts[] = [
                createMessage("msg_1", [createToolPart("call_1", "read")]),
                createMessage("msg_2", [createToolPart("call_2", "read")]),
            ]

            mockState.toolParameters.set("call_1", {
                tool: "read",
                parameters: { filePath: "/test/file.ts" },
                turn: 1,
            })
            mockState.toolParameters.set("call_2", {
                tool: "read",
                parameters: { filePath: "/test/file.ts" },
                turn: 2,
            })

            deduplicate(mockState, mockLogger as any, mockConfig, messages)

            expect(mockState.prune.toolIds).toHaveLength(0)
        })
    })

    describe("already pruned tools", () => {
        it("should not re-prune already pruned tools", () => {
            mockState.prune.toolIds.push("call_1")

            const messages: WithParts[] = [
                createMessage("msg_1", [createToolPart("call_1", "read")]),
                createMessage("msg_2", [createToolPart("call_2", "read")]),
            ]

            mockState.toolParameters.set("call_1", {
                tool: "read",
                parameters: { filePath: "/test/file.ts" },
                turn: 1,
            })
            mockState.toolParameters.set("call_2", {
                tool: "read",
                parameters: { filePath: "/test/file.ts" },
                turn: 2,
            })

            deduplicate(mockState, mockLogger as any, mockConfig, messages)

            // call_1 is already pruned, call_2 should not be pruned (only one instance left)
            expect(mockState.prune.toolIds).toEqual(["call_1"])
        })
    })

    describe("fuzzy deduplication - overlapping file reads", () => {
        it("should prune older reads fully contained in newer reads", () => {
            const messages: WithParts[] = [
                createMessage("msg_1", [createToolPart("call_1", "read")]),
                createMessage("msg_2", [createToolPart("call_2", "read")]),
            ]

            // Older read: offset 0, limit 50
            mockState.toolParameters.set("call_1", {
                tool: "read",
                parameters: { filePath: "/test/file.ts", offset: 0, limit: 50 },
                turn: 1,
            })
            // Newer read: offset 0, limit 100 (contains the older read)
            mockState.toolParameters.set("call_2", {
                tool: "read",
                parameters: { filePath: "/test/file.ts", offset: 0, limit: 100 },
                turn: 2,
            })

            deduplicate(mockState, mockLogger as any, mockConfig, messages)

            expect(mockState.prune.toolIds).toContain("call_1")
            expect(mockState.prune.toolIds).not.toContain("call_2")
        })

        it("should not prune when ranges do not overlap", () => {
            const messages: WithParts[] = [
                createMessage("msg_1", [createToolPart("call_1", "read")]),
                createMessage("msg_2", [createToolPart("call_2", "read")]),
            ]

            mockState.toolParameters.set("call_1", {
                tool: "read",
                parameters: { filePath: "/test/file.ts", offset: 0, limit: 50 },
                turn: 1,
            })
            mockState.toolParameters.set("call_2", {
                tool: "read",
                parameters: { filePath: "/test/file.ts", offset: 100, limit: 50 },
                turn: 2,
            })

            deduplicate(mockState, mockLogger as any, mockConfig, messages)

            expect(mockState.prune.toolIds).toHaveLength(0)
        })

        it("should handle unlimited reads (no limit parameter)", () => {
            const messages: WithParts[] = [
                createMessage("msg_1", [createToolPart("call_1", "read")]),
                createMessage("msg_2", [createToolPart("call_2", "read")]),
            ]

            // Older: limited read
            mockState.toolParameters.set("call_1", {
                tool: "read",
                parameters: { filePath: "/test/file.ts", offset: 0, limit: 50 },
                turn: 1,
            })
            // Newer: unlimited read (contains everything)
            mockState.toolParameters.set("call_2", {
                tool: "read",
                parameters: { filePath: "/test/file.ts", offset: 0 },
                turn: 2,
            })

            deduplicate(mockState, mockLogger as any, mockConfig, messages)

            expect(mockState.prune.toolIds).toContain("call_1")
        })

        it("should not prune when older read is unlimited but newer is limited", () => {
            const messages: WithParts[] = [
                createMessage("msg_1", [createToolPart("call_1", "read")]),
                createMessage("msg_2", [createToolPart("call_2", "read")]),
            ]

            // Older: unlimited read
            mockState.toolParameters.set("call_1", {
                tool: "read",
                parameters: { filePath: "/test/file.ts", offset: 0 },
                turn: 1,
            })
            // Newer: limited read
            mockState.toolParameters.set("call_2", {
                tool: "read",
                parameters: { filePath: "/test/file.ts", offset: 0, limit: 50 },
                turn: 2,
            })

            deduplicate(mockState, mockLogger as any, mockConfig, messages)

            // Older unlimited read might have more content than newer limited read
            expect(mockState.prune.toolIds).toHaveLength(0)
        })
    })

    describe("disabled strategy", () => {
        it("should not deduplicate when strategy is disabled", () => {
            mockConfig = createMockConfig({
                strategies: {
                    deduplication: {
                        enabled: false,
                        protectedTools: [],
                    },
                },
            } as any)

            const messages: WithParts[] = [
                createMessage("msg_1", [createToolPart("call_1", "read")]),
                createMessage("msg_2", [createToolPart("call_2", "read")]),
            ]

            mockState.toolParameters.set("call_1", {
                tool: "read",
                parameters: { filePath: "/test/file.ts" },
                turn: 1,
            })
            mockState.toolParameters.set("call_2", {
                tool: "read",
                parameters: { filePath: "/test/file.ts" },
                turn: 2,
            })

            deduplicate(mockState, mockLogger as any, mockConfig, messages)

            expect(mockState.prune.toolIds).toHaveLength(0)
        })
    })

    describe("stats tracking", () => {
        it("should update stats when deduplicating", () => {
            const messages: WithParts[] = [
                createMessage("msg_1", [createToolPart("call_1", "read")]),
                createMessage("msg_2", [createToolPart("call_2", "read")]),
                createMessage("msg_3", [createToolPart("call_3", "read")]),
            ]

            mockState.toolParameters.set("call_1", {
                tool: "read",
                parameters: { filePath: "/test/file.ts" },
                turn: 1,
            })
            mockState.toolParameters.set("call_2", {
                tool: "read",
                parameters: { filePath: "/test/file.ts" },
                turn: 2,
            })
            mockState.toolParameters.set("call_3", {
                tool: "read",
                parameters: { filePath: "/test/file.ts" },
                turn: 3,
            })

            deduplicate(mockState, mockLogger as any, mockConfig, messages)

            expect(mockState.stats.strategyStats.deduplication.count).toBeGreaterThan(0)
        })
    })

    describe("missing metadata", () => {
        it("should skip tools with missing metadata", () => {
            const messages: WithParts[] = [
                createMessage("msg_1", [createToolPart("call_1", "read")]),
                createMessage("msg_2", [createToolPart("call_2", "read")]),
            ]

            // Only set metadata for call_2
            mockState.toolParameters.set("call_2", {
                tool: "read",
                parameters: { filePath: "/test/file.ts" },
                turn: 2,
            })

            deduplicate(mockState, mockLogger as any, mockConfig, messages)

            // call_1 has no metadata, so it shouldn't cause issues
            expect(mockState.prune.toolIds).toHaveLength(0)
        })
    })
})
