import { describe, it, expect, beforeEach, vi } from "vitest"
import { DEFAULT_CONFIG } from "../../lib/config/defaults.js"
import { createSystemPromptHandler } from "../../lib/hooks.js"
import type { SessionState } from "../../lib/state/index.js"
import type { OpenCodeClient } from "../../lib/client.js"

// Mock dependencies
vi.mock("../../lib/prompts", () => ({
    loadPrompt: vi.fn((name: string) => `Mocked prompt: ${name}`),
}))

vi.mock("../../lib/strategies", () => ({
    deduplicate: vi.fn(),
    supersedeWrites: vi.fn(),
    purgeErrors: vi.fn(),
}))

vi.mock("../../lib/messages", () => ({
    prune: vi.fn(),
    injectHashesIntoToolOutputs: vi.fn(),
    injectHashesIntoAssistantMessages: vi.fn(),
    injectTodoReminder: vi.fn(),
}))

const createMockLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    saveContext: vi.fn(),
})

const createMockClient = (): OpenCodeClient =>
    ({
        session: {
            messages: vi.fn().mockResolvedValue({
                data: [],
            }),
        },
    }) as unknown as OpenCodeClient

const createMockState = (): SessionState =>
    ({
        sessionId: "test-session",
        isSubAgent: false,
        prune: {
            toolIds: [],
            messagePartIds: [],
        },
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
            },
        },
        toolParameters: new Map(),
        currentTurn: 0,
        hashToCallId: new Map(),
        callIdToHash: new Map(),
        hashToMessagePart: new Map(),
        messagePartToHash: new Map(),
        hashToReasoningPart: new Map(),
        reasoningPartToHash: new Map(),
        todos: [],
    }) as unknown as SessionState

describe("Integration: Opt-in Defaults", () => {
    let mockState: SessionState
    let mockLogger: ReturnType<typeof createMockLogger>

    beforeEach(() => {
        mockState = createMockState()
        mockLogger = createMockLogger()
        createMockClient() // Called for side effects, result not needed
        vi.clearAllMocks()
    })

    it("should still provide agentic pruning tools in system prompt by default", async () => {
        const handler = createSystemPromptHandler(mockState, mockLogger as any, DEFAULT_CONFIG)
        const output = { system: [] as string[] }

        await handler({}, output)

        expect(output.system).toHaveLength(1)
        expect(output.system[0]).toContain("system/system-prompt-context")
        expect(DEFAULT_CONFIG.tools.discard.enabled).toBe(true)
        expect(DEFAULT_CONFIG.tools.distill.enabled).toBe(true)
    })
})
