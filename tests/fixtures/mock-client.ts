import { vi } from "vitest"
import type { SessionState, ToolParameterEntry } from "../../lib/state/types"

/**
 * Creates a mock opencode SDK client for testing.
 * All methods return controlled responses that can be customized.
 */
export interface MockClientOptions {
    messages?: Array<{
        info: { id: string; role: string; time: { created: number } }
        parts: Array<{ type: string; text?: string; toolCallId?: string }>
    }>
}

export function createMockClient(options: MockClientOptions = {}) {
    const defaultMessages = options.messages ?? [
        {
            info: { id: "msg_1", role: "assistant", time: { created: Date.now() } },
            parts: [{ type: "text", text: "Test response" }],
        },
    ]

    return {
        session: {
            messages: vi.fn().mockResolvedValue({ data: defaultMessages }),
            get: vi.fn().mockResolvedValue({
                data: { id: "test-session", time: { created: Date.now() } },
            }),
            create: vi.fn().mockResolvedValue({
                data: { id: "new-session", time: { created: Date.now() } },
            }),
        },
        config: {
            providers: vi.fn().mockResolvedValue({
                data: {
                    providers: [
                        {
                            id: "test-provider",
                            name: "Test Provider",
                            models: { "test-model": { id: "test-model", name: "Test Model" } },
                        },
                    ],
                },
            }),
        },
        permission: {
            respond: vi.fn().mockResolvedValue({ data: true }),
            reply: vi.fn().mockResolvedValue({ data: true }),
        },
        app: {
            agents: vi.fn().mockResolvedValue({
                data: [{ name: "build", description: "build", mode: "agent" }],
            }),
        },
        command: {
            list: vi.fn().mockResolvedValue({ data: [] }),
        },
        mcp: {
            add: vi.fn().mockResolvedValue({ data: true }),
        },
    }
}

/**
 * Creates a mock logger for testing.
 */
export function createMockLogger() {
    return {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }
}

/**
 * Creates a minimal mock plugin config for testing.
 */
export function createMockConfig(overrides: Record<string, unknown> = {}) {
    return {
        enabled: true,
        tools: {
            settings: {
                protectedTools: ["task"],
                enableAssistantMessagePruning: true,
                enableReasoningPruning: true,
                enableVisibleAssistantHashes: true,
            },
            discard: { enabled: true },
            distill: { enabled: true },
        },
        ...overrides,
    }
}

/**
 * Creates a fresh session state for testing.
 */
export function createMockState(overrides: Partial<SessionState> = {}): SessionState {
    return {
        sessionId: "test-session",
        isSubAgent: false,
        prune: {
            toolIds: [],
            messagePartIds: [],
            reasoningPartIds: [],
            segmentIds: [],
            replacements: [],
        },
        stats: {
            pruneTokenCounter: 0,
            totalPruneTokens: 0,
            pruneMessageCounter: 0,
            totalPruneMessages: 0,
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
        toolParameters: new Map<string, ToolParameterEntry>(),
        lastToolPrune: false,
        lastCompaction: 0,
        currentTurn: 0,
        lastDiscardStats: null,
        lastUserMessageId: null,
        lastPrunedContent: null,
        hashRegistry: {
            calls: new Map<string, string>(),
            callIds: new Map<string, string>(),
            messages: new Map<string, string>(),
            messagePartIds: new Map<string, string>(),
            reasoning: new Map<string, string>(),
            reasoningPartIds: new Map<string, string>(),
            fileParts: new Map<string, string>(),
            segments: new Map<string, string>(),
        },
        discardHistory: [],
        cursors: {
            todo: {
                lastTurn: 0,
                lastReminderTurn: 0,
                lastWriteCallId: null,
                lastReadCallId: null,
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
                pathToCallIds: new Map<string, Set<string>>(),
            },
            urls: {
                urlToCallIds: new Map<string, Set<string>>(),
            },
            stateQueries: {
                queryToCallIds: new Map<string, Set<string>>(),
            },
            snapshots: {
                allCallIds: new Set<string>(),
                latestCallId: null,
            },
            retries: {
                pendingRetries: new Map<string, string[]>(),
            },
        },
        todos: [],
        ...overrides,
    }
}

/**
 * Helper to register a tool call in state with its hash.
 */
export function registerToolCall(
    state: SessionState,
    callId: string,
    hash: string,
    toolName: string,
    turn = 1,
    parameters: Record<string, unknown> = {},
) {
    state.hashRegistry.calls.set(hash, callId)
    state.hashRegistry.callIds.set(callId, hash)
    state.toolParameters.set(callId, {
        tool: toolName,
        turn,
        parameters,
        status: "completed",
    })
}

/**
 * Helper to register a message part in state with its hash.
 */
export function registerMessagePart(
    state: SessionState,
    messageId: string,
    partIndex: number,
    hash: string,
) {
    const partId = `${messageId}:${partIndex}`
    state.hashRegistry.messages.set(hash, partId)
    state.hashRegistry.messagePartIds.set(partId, hash)
}

/**
 * Helper to register a reasoning part in state with its hash.
 */
export function registerReasoningPart(
    state: SessionState,
    messageId: string,
    partIndex: number,
    hash: string,
) {
    const partId = `${messageId}:${partIndex}`
    state.hashRegistry.reasoning.set(hash, partId)
    state.hashRegistry.reasoningPartIds.set(partId, hash)
}
