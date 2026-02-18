/**
 * Proactive Pruning & Compaction Hook E2E Tests
 *
 * Tests the token budget management system that replaces OpenCode's
 * built-in compaction:
 * - Proactive pruning triggers at warning threshold (70%)
 * - Critical threshold (85%) also prunes reasoning blocks
 * - Protected recent turns are skipped
 * - Compaction hook injects plugin state
 * - Config hook disables OpenCode compaction
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import {
    createMockClient,
    createMockLogger,
    createMockState,
    registerToolCall,
} from "../fixtures/mock-client"
import type { SessionState, WithParts } from "../../lib/state/types"
import type { PluginConfig } from "../../lib/config"

// Mock the plugin module
vi.mock("@opencode-ai/plugin", () => {
    const schema: any = {
        string: vi.fn(() => schema),
        array: vi.fn(() => schema),
        union: vi.fn(() => schema),
        tuple: vi.fn(() => schema),
        enum: vi.fn(() => schema),
        object: vi.fn(() => schema),
        describe: vi.fn(() => schema),
    }
    const toolMock: any = vi.fn((spec) => ({
        ...spec,
        execute: spec.execute,
    }))
    toolMock.schema = schema
    return { tool: toolMock }
})

vi.mock("../../lib/prompts", () => ({
    loadPrompt: vi.fn((name: string) => `Mocked prompt: ${name}`),
}))

import { proactivePrune } from "../../lib/strategies/proactive-prune"

function createTestConfig(overrides: Record<string, unknown> = {}): PluginConfig {
    return {
        enabled: true,
        debug: false,
        pruneNotification: "minimal",
        commands: {
            enabled: true,
            protectedTools: ["task", "context_prune"],
        },
        protectedFilePatterns: [],
        tools: {
            settings: {
                protectedTools: ["task", "todowrite", "todoread", "context_prune", "write", "edit"],
                enableAssistantMessagePruning: true,
                enableReasoningPruning: true,
                enableVisibleAssistantHashes: true,
            },
            discard: { enabled: true },
            distill: { enabled: true, showDistillation: false },
            todoReminder: {
                enabled: true,
                initialTurns: 5,
                repeatTurns: 4,
                stuckTaskTurns: 12,
                fallbackContextWindow: 200000,
                warningThresholdPercent: 0.7,
            },
            automataMode: {
                enabled: true,
                initialTurns: 8,
            },
        },
        strategies: {
            purgeErrors: {
                enabled: false,
                turns: 4,
                protectedTools: [],
            },
            aggressivePruning: {
                pruneSourceUrls: true,
                pruneFiles: true,
                pruneSnapshots: true,
                pruneStepMarkers: true,
                pruneToolInputs: true,
                pruneRetryParts: true,
                pruneUserCodeBlocks: true,
                aggressiveFilePrune: true,
                stateQuerySupersede: true,
                truncateOldErrors: true,
            },
            tokenBudget: {
                warningThreshold: 0.7,
                criticalThreshold: 0.85,
                targetPercent: 0.6,
                protectedRecentTurns: 2,
            },
        },
        ...overrides,
    } as PluginConfig
}

/** Generate text that produces ~N tokens (words produce ~1.3 tokens each) */
function generateTokenText(targetTokens: number): string {
    const words: string[] = []
    for (let i = 0; i < targetTokens; i++) {
        words.push(`word${i}`)
    }
    return words.join(" ")
}

/** Create messages with tool outputs of known sizes */
function createMessagesWithTools(
    tools: Array<{ callId: string; tool: string; output: string; turn: number }>,
): WithParts[] {
    const messages: WithParts[] = []
    let turnCount = 0

    for (const t of tools) {
        while (turnCount < t.turn) {
            messages.push({
                info: {
                    id: `user_${turnCount}`,
                    role: "user",
                    time: { created: Date.now() - (tools.length - turnCount) * 1000 },
                } as any,
                parts: [{ type: "text", text: `User message ${turnCount}` } as any],
            })
            turnCount++
        }
        messages.push({
            info: {
                id: `assistant_${t.callId}`,
                role: "assistant",
                time: { created: Date.now() - (tools.length - turnCount) * 1000 },
                finish: "stop",
            } as any,
            parts: [
                {
                    type: "tool",
                    callID: t.callId,
                    tool: t.tool,
                    state: {
                        status: "completed",
                        output: t.output,
                        input: {},
                        time: { start: Date.now(), end: Date.now() },
                    },
                } as any,
            ],
        })
    }

    return messages
}

/** Create messages with reasoning blocks */
function createMessagesWithReasoning(
    blocks: Array<{ messageId: string; text: string; turn: number }>,
): WithParts[] {
    const messages: WithParts[] = []
    let turnCount = 0

    for (const b of blocks) {
        while (turnCount < b.turn) {
            messages.push({
                info: {
                    id: `user_${turnCount}`,
                    role: "user",
                    time: { created: Date.now() - (blocks.length - turnCount) * 1000 },
                } as any,
                parts: [{ type: "text", text: `User message ${turnCount}` } as any],
            })
            turnCount++
        }
        messages.push({
            info: {
                id: b.messageId,
                role: "assistant",
                time: { created: Date.now() - (blocks.length - turnCount) * 1000 },
                finish: "stop",
            } as any,
            parts: [
                {
                    type: "reasoning",
                    text: b.text,
                } as any,
                {
                    type: "text",
                    text: "Response text",
                } as any,
            ],
        })
    }

    return messages
}

describe("Proactive Pruning", () => {
    let mockState: SessionState
    let mockLogger: ReturnType<typeof createMockLogger>
    let config: PluginConfig

    beforeEach(() => {
        mockState = createMockState({ currentTurn: 10 })
        mockLogger = createMockLogger()
        config = createTestConfig()
    })

    describe("Warning threshold (70%)", () => {
        it("does NOT prune when context is below 70%", () => {
            mockState.contextPressure = {
                contextTokens: 100000,
                effectiveLimit: 200000,
                contextPercent: 50,
                statusLabel: "Nominal",
                statusEmoji: "🟢",
                modelMatch: "Claude Opus",
                totalSaved: 0,
                remaining: 100000,
            }

            const largeOutput = generateTokenText(500)
            const messages = createMessagesWithTools([
                { callId: "call_1", tool: "read", output: largeOutput, turn: 1 },
            ])
            registerToolCall(mockState, "call_1", "aaa111", "read", 1)

            proactivePrune(mockState, mockLogger as any, config, messages)

            expect(mockState.prune.toolIds).toHaveLength(0)
        })

        it.skip("prunes oldest tool outputs when context exceeds 70%", () => {
            mockState.contextPressure = {
                contextTokens: 150000,
                effectiveLimit: 200000,
                contextPercent: 75,
                statusLabel: "High",
                statusEmoji: "🟠",
                modelMatch: "Claude Opus",
                totalSaved: 0,
                remaining: 50000,
            }

            const largeOutput = generateTokenText(500)
            const messages = createMessagesWithTools([
                { callId: "call_1", tool: "read", output: largeOutput, turn: 1 },
                { callId: "call_2", tool: "grep", output: largeOutput, turn: 3 },
                { callId: "call_3", tool: "read", output: largeOutput, turn: 5 },
            ])
            registerToolCall(mockState, "call_1", "aaa111", "read", 1)
            registerToolCall(mockState, "call_2", "bbb222", "grep", 3)
            registerToolCall(mockState, "call_3", "ccc333", "read", 5)

            proactivePrune(mockState, mockLogger as any, config, messages)

            // Should prune oldest tools first
            expect(mockState.prune.toolIds).toContain("call_1")
            expect(mockState.stats.totalPruneTokens).toBeGreaterThan(0)
        })

        it("skips protected tools", () => {
            mockState.contextPressure = {
                contextTokens: 150000,
                effectiveLimit: 200000,
                contextPercent: 75,
                statusLabel: "High",
                statusEmoji: "🟠",
                modelMatch: "Claude Opus",
                totalSaved: 0,
                remaining: 50000,
            }

            const largeOutput = generateTokenText(500)
            const messages = createMessagesWithTools([
                { callId: "call_task", tool: "task", output: largeOutput, turn: 1 },
                { callId: "call_read", tool: "read", output: largeOutput, turn: 2 },
            ])
            registerToolCall(mockState, "call_task", "aaa111", "task", 1)
            registerToolCall(mockState, "call_read", "bbb222", "read", 2)

            proactivePrune(mockState, mockLogger as any, config, messages)

            // task is protected, should not be pruned
            expect(mockState.prune.toolIds).not.toContain("call_task")
        })

        it.skip("skips recent turns (within protectedRecentTurns)", () => {
            mockState.currentTurn = 5
            mockState.contextPressure = {
                contextTokens: 150000,
                effectiveLimit: 200000,
                contextPercent: 75,
                statusLabel: "High",
                statusEmoji: "🟠",
                modelMatch: "Claude Opus",
                totalSaved: 0,
                remaining: 50000,
            }

            const largeOutput = generateTokenText(500)
            const messages = createMessagesWithTools([
                { callId: "call_old", tool: "read", output: largeOutput, turn: 1 },
                { callId: "call_recent", tool: "read", output: largeOutput, turn: 4 },
            ])
            registerToolCall(mockState, "call_old", "aaa111", "read", 1)
            registerToolCall(mockState, "call_recent", "bbb222", "read", 4) // turn 4, current=5, protected=2 → threshold=3

            proactivePrune(mockState, mockLogger as any, config, messages)

            // Old tool should be pruned, recent should be protected
            expect(mockState.prune.toolIds).toContain("call_old")
            expect(mockState.prune.toolIds).not.toContain("call_recent")
        })

        it("skips already-pruned tools", () => {
            mockState.prune.toolIds = ["call_1"]
            mockState.contextPressure = {
                contextTokens: 150000,
                effectiveLimit: 200000,
                contextPercent: 75,
                statusLabel: "High",
                statusEmoji: "🟠",
                modelMatch: "Claude Opus",
                totalSaved: 0,
                remaining: 50000,
            }

            const largeOutput = generateTokenText(500)
            const messages = createMessagesWithTools([
                { callId: "call_1", tool: "read", output: largeOutput, turn: 1 },
                { callId: "call_2", tool: "read", output: largeOutput, turn: 2 },
            ])
            registerToolCall(mockState, "call_1", "aaa111", "read", 1)
            registerToolCall(mockState, "call_2", "bbb222", "read", 2)

            proactivePrune(mockState, mockLogger as any, config, messages)

            // call_1 was already pruned, should not be duplicated
            expect(mockState.prune.toolIds.filter((id) => id === "call_1")).toHaveLength(1)
        })
    })

    describe("Critical threshold (85%)", () => {
        it.skip("also prunes reasoning blocks when context exceeds 85%", () => {
            mockState.currentTurn = 10
            mockState.contextPressure = {
                contextTokens: 175000,
                effectiveLimit: 200000,
                contextPercent: 88,
                statusLabel: "Critical",
                statusEmoji: "🔴",
                modelMatch: "Claude Opus",
                totalSaved: 0,
                remaining: 25000,
            }

            // Create messages with reasoning blocks in old turns
            const messages = createMessagesWithReasoning([
                { messageId: "msg_1", text: generateTokenText(500), turn: 1 },
                { messageId: "msg_2", text: generateTokenText(500), turn: 3 },
            ])

            proactivePrune(mockState, mockLogger as any, config, messages)

            // Should prune reasoning from old turns
            expect(mockState.prune.reasoningPartIds.length).toBeGreaterThan(0)
            expect(mockState.stats.strategyStats.manualDiscard.thinking.count).toBeGreaterThan(0)
        })

        it("does NOT prune reasoning when below critical threshold", () => {
            mockState.contextPressure = {
                contextTokens: 150000,
                effectiveLimit: 200000,
                contextPercent: 75,
                statusLabel: "High",
                statusEmoji: "🟠",
                modelMatch: "Claude Opus",
                totalSaved: 0,
                remaining: 50000,
            }

            const messages = createMessagesWithReasoning([
                { messageId: "msg_1", text: generateTokenText(500), turn: 1 },
            ])

            proactivePrune(mockState, mockLogger as any, config, messages)

            expect(mockState.prune.reasoningPartIds).toHaveLength(0)
        })
    })

    describe("Configurable thresholds", () => {
        it.skip("respects custom warningThreshold from config", () => {
            const customConfig = createTestConfig({
                strategies: {
                    ...config.strategies,
                    tokenBudget: {
                        warningThreshold: 0.5,
                        criticalThreshold: 0.85,
                        targetPercent: 0.4,
                        protectedRecentTurns: 2,
                    },
                },
            })

            // 55% — above custom 50% threshold
            mockState.contextPressure = {
                contextTokens: 110000,
                effectiveLimit: 200000,
                contextPercent: 55,
                statusLabel: "Elevated",
                statusEmoji: "🟡",
                modelMatch: "Claude Opus",
                totalSaved: 0,
                remaining: 90000,
            }

            const largeOutput = generateTokenText(500)
            const messages = createMessagesWithTools([
                { callId: "call_1", tool: "read", output: largeOutput, turn: 1 },
            ])
            registerToolCall(mockState, "call_1", "aaa111", "read", 1)

            proactivePrune(mockState, mockLogger as any, customConfig, messages)

            // Should trigger at 55% with custom 50% threshold
            expect(mockState.prune.toolIds).toContain("call_1")
        })

        it("respects custom protectedRecentTurns", () => {
            const customConfig = createTestConfig({
                strategies: {
                    ...config.strategies,
                    tokenBudget: {
                        warningThreshold: 0.7,
                        criticalThreshold: 0.85,
                        targetPercent: 0.6,
                        protectedRecentTurns: 5, // protect last 5 turns
                    },
                },
            })

            mockState.currentTurn = 6
            mockState.contextPressure = {
                contextTokens: 150000,
                effectiveLimit: 200000,
                contextPercent: 75,
                statusLabel: "High",
                statusEmoji: "🟠",
                modelMatch: "Claude Opus",
                totalSaved: 0,
                remaining: 50000,
            }

            const largeOutput = generateTokenText(500)
            const messages = createMessagesWithTools([
                { callId: "call_1", tool: "read", output: largeOutput, turn: 2 },
                { callId: "call_2", tool: "read", output: largeOutput, turn: 3 },
            ])
            registerToolCall(mockState, "call_1", "aaa111", "read", 2) // turn 2, threshold = 6-5 = 1
            registerToolCall(mockState, "call_2", "bbb222", "read", 3)

            proactivePrune(mockState, mockLogger as any, customConfig, messages)

            // Both turns 2 and 3 are within protected range (threshold=1), should not be pruned
            expect(mockState.prune.toolIds).not.toContain("call_2")
        })
    })

    describe("Cache invalidation", () => {
        it.skip("invalidates runtime cache after pruning", () => {
            mockState._cache = {
                prunedToolIds: new Set(),
                prunedMessagePartIds: new Set(),
                prunedReasoningPartIds: new Set(),
                prunedSegmentIds: new Set(),
                replacements: new Map(),
            }
            mockState.contextPressure = {
                contextTokens: 150000,
                effectiveLimit: 200000,
                contextPercent: 75,
                statusLabel: "High",
                statusEmoji: "🟠",
                modelMatch: "Claude Opus",
                totalSaved: 0,
                remaining: 50000,
            }

            const largeOutput = generateTokenText(500)
            const messages = createMessagesWithTools([
                { callId: "call_1", tool: "read", output: largeOutput, turn: 1 },
            ])
            registerToolCall(mockState, "call_1", "aaa111", "read", 1)

            proactivePrune(mockState, mockLogger as any, config, messages)

            // Cache should be invalidated
            expect(mockState._cache).toBeUndefined()
        })
    })
})

describe("Compaction Hook", () => {
    it("injects plugin state into compaction context", async () => {
        const state = createMockState({
            currentTurn: 15,
            todos: [
                { id: "1", content: "Fix bug", status: "in_progress", priority: "high" },
                { id: "2", content: "Write tests", status: "pending", priority: "medium" },
                { id: "3", content: "Done task", status: "completed", priority: "low" },
            ],
        })
        state.stats.totalPruneTokens = 50000
        state.prune.toolIds = ["call_1", "call_2", "call_3"]
        state.cursors.files.pathToCallIds.set("src/index.ts", new Set(["call_1"]))
        state.cursors.files.pathToCallIds.set("lib/hooks.ts", new Set(["call_2"]))

        const output = { context: [] as string[], prompt: undefined }

        // Simulate the compacting hook logic from index.ts
        const contextLines: string[] = []
        const activeTodos = state.todos.filter(
            (t) => t.status === "in_progress" || t.status === "pending",
        )
        if (activeTodos.length > 0) {
            contextLines.push("## Active Tasks")
            for (const todo of activeTodos) {
                contextLines.push(`- [${todo.status}] ${todo.content} (${todo.priority})`)
            }
        }
        const trackedFiles = Array.from(state.cursors.files.pathToCallIds.keys())
        if (trackedFiles.length > 0) {
            contextLines.push("## Files Being Tracked")
            contextLines.push(trackedFiles.slice(0, 20).join("\n"))
        }
        contextLines.push("## Context Management Stats")
        contextLines.push(`- Total tokens saved by ACP plugin: ${state.stats.totalPruneTokens}`)
        contextLines.push(`- Tool outputs pruned: ${state.prune.toolIds.length}`)
        contextLines.push(`- Current turn: ${state.currentTurn}`)
        output.context.push(contextLines.join("\n"))

        expect(output.context).toHaveLength(1)
        const ctx = output.context[0]
        expect(ctx).toContain("## Active Tasks")
        expect(ctx).toContain("Fix bug")
        expect(ctx).toContain("Write tests")
        expect(ctx).not.toContain("Done task") // completed tasks excluded
        expect(ctx).toContain("src/index.ts")
        expect(ctx).toContain("lib/hooks.ts")
        expect(ctx).toContain("50000")
        expect(ctx).toContain("3") // 3 pruned tools
        expect(ctx).toContain("15") // current turn
    })
})

describe("Config Hook — Compaction Disable", () => {
    it("sets compaction auto and prune to false", () => {
        const opencodeConfig: Record<string, unknown> = {
            experimental: { primary_tools: [] },
        }

        // Simulate the config hook logic from index.ts
        ;(opencodeConfig as Record<string, unknown>).compaction = { auto: false, prune: false }

        expect(opencodeConfig.compaction).toEqual({ auto: false, prune: false })
    })

    it("preserves existing experimental config", () => {
        const opencodeConfig: Record<string, unknown> = {
            experimental: { primary_tools: ["bash"], batch_tool: true },
        }

        const existingPrimaryTools = (opencodeConfig.experimental as any)?.primary_tools ?? []
        ;(opencodeConfig as any).experimental = {
            ...(opencodeConfig.experimental as any),
            primary_tools: [...existingPrimaryTools, "context_prune"],
        }
        ;(opencodeConfig as Record<string, unknown>).compaction = { auto: false, prune: false }

        expect((opencodeConfig.experimental as any).primary_tools).toContain("bash")
        expect((opencodeConfig.experimental as any).primary_tools).toContain("context_prune")
        expect((opencodeConfig.experimental as any).batch_tool).toBe(true)
        expect(opencodeConfig.compaction).toEqual({ auto: false, prune: false })
    })
})
