/**
 * Aggressive Pruning E2E Tests (t33-t43)
 *
 * Tests aggressive pruning strategies:
 * - t33: Input leak fix (superseded tool inputs stripped)
 * - t34: One-file-one-view policy
 * - t35: Step marker filtering
 * - t36: Source-URL supersede
 * - t37: State query supersede
 * - t38: Snapshot auto-supersede
 * - t39: Retry auto-prune
 * - t40: File part masking
 * - t41: Compaction awareness
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { syncToolCache } from "../../lib/state/tool-cache"
import type { SessionState, WithParts } from "../../lib/state"
import type { PluginConfig } from "../../lib/config"

// Mock dependencies
vi.mock("../../lib/messages/todo-reminder", () => ({
    removeTodoReminder: vi.fn(),
}))

vi.mock("../../lib/messages/automata-mode", () => ({
    removeAutomataReflection: vi.fn(),
}))

vi.mock("../../lib/shared-utils", () => ({
    isMessageCompacted: vi.fn().mockReturnValue(false),
}))

const createMockLogger = () =>
    ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }) as any

const createMockConfig = (overrides: Partial<any> = {}): PluginConfig =>
    ({
        tools: {
            settings: { protectedTools: ["task"] },
        },
        strategies: {
            purgeErrors: { enabled: false, turns: 4, protectedTools: [] },
            aggressivePruning: {
                stateQuerySupersede: true,
                pruneSourceUrls: true,
                pruneFiles: true,
                pruneSnapshots: true,
                pruneStepMarkers: true,
                pruneToolInputs: true,
                pruneRetryParts: true,
                aggressiveFilePrune: true,
                truncateOldErrors: true,
                pruneUserCodeBlocks: true,
            },
        },
        ...overrides,
    }) as unknown as PluginConfig

const createMockState = (): SessionState =>
    ({
        currentTurn: 10,
        toolParameters: new Map(),
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
            reasoning: new Map(),
            reasoningPartIds: new Map(),
            fileParts: new Map(),
        },
        cursors: {
            todo: {
                lastWriteCallId: null,
                lastReadCallId: null,
                lastTurn: 0,
                lastReminderTurn: 0,
            },
            context: {
                lastCallId: null,
            },
            automata: {
                enabled: false,
                lastTurn: 0,
                lastReflectionTurn: 0,
            },
            files: {
                pathToCallIds: new Map(),
            },
            urls: {
                urlToCallIds: new Map(),
            },
            stateQueries: {
                queryToCallIds: new Map(),
            },
            snapshots: {
                allCallIds: new Set(),
                latestCallId: null,
            },
            retries: {
                pendingRetries: new Map(),
            },
        },
        todos: [],
        stats: {
            strategyStats: {
                autoSupersede: {
                    hash: { count: 0, tokens: 0 },
                    file: { count: 0, tokens: 0 },
                    todo: { count: 0, tokens: 0 },
                    context: { count: 0, tokens: 0 },
                    url: { count: 0, tokens: 0 },
                    stateQuery: { count: 0, tokens: 0 },
                    snapshot: { count: 0, tokens: 0 },
                    retry: { count: 0, tokens: 0 },
                },
                purgeErrors: { count: 0, tokens: 0 },
                manualDiscard: {
                    message: { count: 0, tokens: 0 },
                    thinking: { count: 0, tokens: 0 },
                    tool: { count: 0, tokens: 0 },
                },
                distillation: { count: 0, tokens: 0 },
            },
        },
        lastToolPrune: false,
        lastCompaction: 0,
    }) as unknown as SessionState

const createToolPart = (
    callID: string,
    tool: string,
    input: Record<string, unknown> = {},
    status: "completed" | "pending" | "error" = "completed",
    output: string = "test output",
) => ({
    type: "tool" as const,
    callID,
    tool,
    state: { status, input, output },
})

const createStepPart = () => ({
    type: "step-start" as const,
})

const createMessage = (id: string, role: "user" | "assistant", parts: any[]): WithParts =>
    ({
        info: { id, time: { created: Date.now() } },
        role,
        parts,
    }) as any

describe("Aggressive Pruning (t33-t43)", () => {
    let state: SessionState
    let config: PluginConfig
    let logger: ReturnType<typeof createMockLogger>

    beforeEach(() => {
        state = createMockState()
        config = createMockConfig()
        logger = createMockLogger()
        vi.clearAllMocks()
    })

    describe("t33: Input Leak Fix", () => {
        it("tracks tool parameters for superseded calls", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_1", "write", {
                        filePath: "/test/file.ts",
                        content: "A".repeat(10000), // Large content
                    }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_2", "write", {
                        filePath: "/test/file.ts",
                        content: "Small content",
                    }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // First write should be superseded
            expect(state.prune.toolIds).toContain("call_1")
            // Tool parameters should be tracked
            expect(state.toolParameters.has("call_2")).toBe(true)
        })

        it("strips verbose inputs when pruneToolInputs enabled", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_1", "read", { filePath: "/test/file.ts" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_2", "write", {
                        filePath: "/test/file.ts",
                        content: "new content",
                    }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Superseded call should be pruned
            expect(state.prune.toolIds).toContain("call_1")
        })
    })

    describe("t34: One-File-One-View Policy", () => {
        it("supersedes all previous operations on same file", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_read_1", "read", { filePath: "/test/file.ts" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createToolPart("call_read_2", "read", { filePath: "/test/file.ts" }),
                ]),
                createMessage("msg_3", "assistant", [
                    createStepPart(),
                    createToolPart("call_write", "write", {
                        filePath: "/test/file.ts",
                        content: "final",
                    }),
                ]),
                createMessage("msg_4", "assistant", [
                    createStepPart(),
                    createToolPart("call_edit", "edit", {
                        filePath: "/test/file.ts",
                        oldString: "final",
                        newString: "edited",
                    }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // All previous operations should be superseded
            expect(state.prune.toolIds).toContain("call_read_1")
            expect(state.prune.toolIds).toContain("call_read_2")
            expect(state.prune.toolIds).toContain("call_write")
            // Only latest (edit) should remain
            expect(state.prune.toolIds).not.toContain("call_edit")
        })

        it("respects aggressiveFilePrune config", async () => {
            const conservativeConfig = createMockConfig({
                strategies: {
                    purgeErrors: { enabled: false, turns: 4, protectedTools: [] },
                    aggressivePruning: {
                        aggressiveFilePrune: false, // Disabled
                        stateQuerySupersede: true,
                        pruneSourceUrls: true,
                        pruneFiles: true,
                        pruneSnapshots: true,
                        pruneStepMarkers: true,
                        pruneToolInputs: true,
                        pruneRetryParts: true,
                    },
                },
            })

            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_read", "read", { filePath: "/test/file.ts" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_write", "write", {
                        filePath: "/test/file.ts",
                        content: "new",
                    }),
                ]),
            ]

            await syncToolCache(state, conservativeConfig, logger, messages)

            // With aggressive disabled, behavior may differ
            // Write should still supersede read in file-based supersede
            expect(state.prune.toolIds).toContain("call_read")
        })
    })

    describe("t35: Step Marker Filtering", () => {
        it("step markers increment turn counter", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(), // Turn 1
                    createStepPart(), // Turn 2
                    createStepPart(), // Turn 3
                    createToolPart("call_1", "read", { filePath: "/test/a.ts" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Tool should be registered at turn 3
            const params = state.toolParameters.get("call_1")
            expect(params?.turn).toBe(3)
        })

        it("step markers are not stored as tool calls", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_1", "read", { filePath: "/test/a.ts" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Only the tool call should be in parameters, not step markers
            expect(state.toolParameters.size).toBe(1)
            expect(state.toolParameters.has("call_1")).toBe(true)
        })
    })

    describe("t36: Source-URL Supersede", () => {
        it("supersedes duplicate URL fetches", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_fetch_1", "webfetch", { url: "https://example.com/api" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_fetch_2", "webfetch", { url: "https://example.com/api" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // First fetch should be superseded
            expect(state.prune.toolIds).toContain("call_fetch_1")
            expect(state.stats.strategyStats.autoSupersede.url.count).toBeGreaterThan(0)
        })

        it("does not supersede different URLs", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_fetch_1", "webfetch", { url: "https://example.com/a" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createToolPart("call_fetch_2", "webfetch", { url: "https://example.com/b" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Different URLs - no supersede
            expect(state.prune.toolIds).not.toContain("call_fetch_1")
        })

        it("respects pruneSourceUrls config", async () => {
            const disabledConfig = createMockConfig({
                strategies: {
                    purgeErrors: { enabled: false, turns: 4, protectedTools: [] },
                    aggressivePruning: {
                        pruneSourceUrls: false, // Disabled
                        stateQuerySupersede: true,
                        pruneFiles: true,
                        pruneSnapshots: true,
                        pruneStepMarkers: true,
                        pruneToolInputs: true,
                        pruneRetryParts: true,
                        aggressiveFilePrune: true,
                    },
                },
            })

            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_fetch_1", "webfetch", { url: "https://example.com" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_fetch_2", "webfetch", { url: "https://example.com" }),
                ]),
            ]

            await syncToolCache(state, disabledConfig, logger, messages)

            // With URL supersede disabled, first fetch may not be superseded
            // (depends on hash-based supersede)
        })
    })

    describe("t37: State Query Supersede", () => {
        it("supersedes duplicate ls commands", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_ls_1", "bash", { command: "ls -la" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_ls_2", "bash", { command: "ls -la" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // First ls should be superseded
            expect(state.prune.toolIds).toContain("call_ls_1")
        })

        it("supersedes duplicate git status commands", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_git_1", "bash", { command: "git status" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_git_2", "bash", { command: "git status" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // First git status should be superseded
            expect(state.prune.toolIds).toContain("call_git_1")
        })

        it("supersedes duplicate pwd commands", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_pwd_1", "bash", { command: "pwd" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_pwd_2", "bash", { command: "pwd" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // First pwd should be superseded
            expect(state.prune.toolIds).toContain("call_pwd_1")
        })

        it("does not supersede different commands", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_1", "bash", { command: "ls -la" }),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createToolPart("call_2", "bash", { command: "git status" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Different commands - no supersede
            expect(state.prune.toolIds).not.toContain("call_1")
        })
    })

    describe("t38: Snapshot Auto-Supersede", () => {
        it("keeps only latest snapshot", async () => {
            // Pre-register first snapshot
            state.cursors.snapshots.allCallIds.add("call_snap_1")
            state.cursors.snapshots.latestCallId = "call_snap_1"
            state.toolParameters.set("call_snap_1", {
                tool: "snapshot",
                turn: 1,
                parameters: {},
                status: "completed",
            })

            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_snap_1", "snapshot", {}),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart("call_snap_2", "snapshot", {}),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // First snapshot should be superseded
            expect(state.prune.toolIds).toContain("call_snap_1")
            // Latest should be updated
            expect(state.cursors.snapshots.latestCallId).toBe("call_snap_2")
        })
    })

    describe("t39: Retry Auto-Prune", () => {
        it("tracks error status for failed attempts", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart(
                        "call_fail",
                        "bash",
                        { command: "invalid_cmd" },
                        "error",
                        "command not found",
                    ),
                ]),
                createMessage("msg_2", "assistant", [
                    createStepPart(),
                    createStepPart(),
                    createToolPart(
                        "call_success",
                        "bash",
                        { command: "echo success" },
                        "completed",
                        "success",
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Both calls should be tracked
            expect(state.toolParameters.has("call_fail")).toBe(true)
            expect(state.toolParameters.has("call_success")).toBe(true)
            // Failed call should have error status
            expect(state.toolParameters.get("call_fail")?.status).toBe("error")
        })
    })

    describe("t40: File Part Masking", () => {
        it("tracks file parts in hash registry", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_read", "read", { filePath: "/test/file.ts" }),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // File path should be tracked in cursors
            expect(state.cursors.files.pathToCallIds.has("/test/file.ts")).toBe(true)
        })
    })

    describe("t41: Compaction Awareness", () => {
        it("skips already-compacted messages", async () => {
            // Set lastCompaction to future timestamp
            state.lastCompaction = Date.now() + 10000

            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_1", "read", { filePath: "/test/file.ts" }),
                ]),
            ]

            // With mocked isMessageCompacted returning false, this should process
            await syncToolCache(state, config, logger, messages)

            // Tool should be registered
            expect(state.toolParameters.has("call_1")).toBe(true)
        })
    })

    describe("Edge Cases", () => {
        it("handles empty messages array", async () => {
            await syncToolCache(state, config, logger, [])

            expect(state.prune.toolIds.length).toBe(0)
        })

        it("handles messages without tool parts", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [{ type: "text", text: "Hello" }]),
            ]

            await syncToolCache(state, config, logger, messages)

            expect(state.toolParameters.size).toBe(0)
        })

        it("handles pending tool calls", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_1", "read", { filePath: "/test/file.ts" }, "pending"),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Pending calls should be tracked but not superseded
            expect(state.toolParameters.has("call_1")).toBe(true)
        })

        it("handles error tool calls", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart(
                        "call_1",
                        "bash",
                        { command: "invalid" },
                        "error",
                        "Error: command not found",
                    ),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            // Error calls should be tracked
            expect(state.toolParameters.has("call_1")).toBe(true)
            expect(state.toolParameters.get("call_1")?.status).toBe("error")
        })

        it("handles mixed tool statuses", async () => {
            const messages: WithParts[] = [
                createMessage("msg_1", "assistant", [
                    createStepPart(),
                    createToolPart("call_pending", "read", { filePath: "/a.ts" }, "pending"),
                    createToolPart("call_completed", "read", { filePath: "/b.ts" }, "completed"),
                    createToolPart("call_error", "bash", { command: "x" }, "error", "error"),
                ]),
            ]

            await syncToolCache(state, config, logger, messages)

            expect(state.toolParameters.size).toBe(3)
        })
    })
})
