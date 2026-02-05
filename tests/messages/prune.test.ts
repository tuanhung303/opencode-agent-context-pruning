import { describe, it, expect, beforeEach } from "vitest"
import { prune, injectHashesIntoToolOutputs } from "../../lib/messages/prune"
import type { SessionState, WithParts } from "../../lib/state"
import type { PluginConfig } from "../../lib/config"

const createMockLogger = () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
})

const createMockConfig = (): PluginConfig =>
    ({
        tools: {
            settings: {
                protectedTools: [],
            },
            discard: {
                enabled: true,
            },
        },
    }) as any

const createMockState = (
    prunedToolIds: string[] = [],
    hashMappings: Map<string, string> = new Map(),
): SessionState =>
    ({
        prune: {
            toolIds: prunedToolIds,
        },
        compactedMessageIds: new Set<string>(),
        lastCompaction: 0, // No compaction, so all messages are processed
        hashRegistry: {
            calls: new Map([...hashMappings].map(([k, v]) => [v, k])),
            callIds: hashMappings,
            messages: new Map(),
            messagePartIds: new Map(),
            reasoning: new Map(),
            reasoningPartIds: new Map(),
        },
    }) as any

const createToolPart = (
    callID: string,
    tool: string,
    status: "completed" | "error",
    input: Record<string, unknown>,
    output: string,
) => ({
    type: "tool" as const,
    callID,
    tool,
    state: {
        status,
        input,
        output,
    },
})

const createMessage = (id: string, parts: any[], completed?: number): WithParts =>
    ({
        info: {
            id,
            role: "assistant" as const,
            time:
                completed !== undefined
                    ? { created: Date.now(), completed }
                    : { created: Date.now() }, // Omit completed for streaming state
        },
        parts,
    }) as any

/** Create a message that is still streaming (no completed timestamp) */
const createStreamingMessage = (id: string, parts: any[]): WithParts => createMessage(id, parts) // No completed field

/** Create a completed message */
const createCompletedMessage = (id: string, parts: any[]): WithParts =>
    createMessage(id, parts, Date.now())

describe("prune", () => {
    let mockLogger: ReturnType<typeof createMockLogger>
    let mockConfig: PluginConfig

    beforeEach(() => {
        mockLogger = createMockLogger()
        mockConfig = createMockConfig()
    })

    describe("pruneToolOutputs", () => {
        it("should replace pruned tool parts with placeholder", () => {
            const state = createMockState(["call_123"])
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart(
                        "call_123",
                        "read",
                        "completed",
                        { filePath: "/test/file.ts" },
                        "original content here...",
                    ),
                ]),
            ]

            prune(state, mockLogger as any, mockConfig, messages)

            // Tool part should be replaced with text placeholder for layout consistency
            expect(messages[0].parts.length).toBe(1)
            expect((messages[0].parts[0] as any).type).toBe("text")
            expect((messages[0].parts[0] as any).text).toBe("[read() output pruned]")
        })

        it("should keep non-pruned tool parts", () => {
            const state = createMockState(["call_123"])
            const originalOutput = "original content"
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart(
                        "call_456", // Not in prune list
                        "read",
                        "completed",
                        { filePath: "/test/file.ts" },
                        originalOutput,
                    ),
                ]),
            ]

            prune(state, mockLogger as any, mockConfig, messages)

            // Part should remain unchanged
            expect(messages[0].parts.length).toBe(1)
            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe(originalOutput)
        })

        it("should replace errored tools in prune list with placeholder", () => {
            const state = createMockState(["call_error"])
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart(
                        "call_error",
                        "read",
                        "error",
                        { filePath: "/test/file.ts" },
                        "error message",
                    ),
                ]),
            ]

            prune(state, mockLogger as any, mockConfig, messages)

            // Errored tools in prune list are replaced with placeholder
            expect(messages[0].parts.length).toBe(1)
            expect((messages[0].parts[0] as any).type).toBe("text")
            expect((messages[0].parts[0] as any).text).toBe("[read() output pruned]")
        })
    })

    describe("pruneToolInputs (question tool)", () => {
        it("should prune question tool inputs", () => {
            const state = createMockState([]) // Empty prune list - part won't be removed
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart(
                        "call_question",
                        "question",
                        "completed",
                        { questions: [{ header: "Test", question: "What?" }] },
                        "user answered: yes",
                    ),
                ]),
            ]

            prune(state, mockLogger as any, mockConfig, messages)

            // Part should still exist, but inputs are not pruned (question tool pruning removed)
            expect(messages[0].parts.length).toBe(1)
        })
    })

    describe("pruneToolErrors", () => {
        it("should keep errored tools not in prune list", () => {
            const state = createMockState([]) // Empty prune list
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart(
                        "call_error",
                        "bash",
                        "error",
                        { command: "rm -rf /", description: "Delete everything" },
                        "Permission denied",
                    ),
                ]),
            ]

            prune(state, mockLogger as any, mockConfig, messages)

            // Part should still exist
            expect(messages[0].parts.length).toBe(1)
        })
    })

    describe("injectHashesIntoToolOutputs", () => {
        it("should inject hash prefix into tool output", () => {
            const hashMappings = new Map([["call_123", "abc123"]])
            const state = createMockState([], hashMappings)
            const messages: WithParts[] = [
                createCompletedMessage("msg_1", [
                    createToolPart(
                        "call_123",
                        "read",
                        "completed",
                        { filePath: "/test/file.ts" },
                        "file content here",
                    ),
                ]),
            ]

            injectHashesIntoToolOutputs(state, mockConfig, messages, mockLogger as any)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe("file content here\n<tool_hash>abc123</tool_hash>")
        })

        it("should not inject hash if tool is already pruned", () => {
            const hashMappings = new Map([["call_123", "abc123"]])
            const state = createMockState(["call_123"], hashMappings)
            const originalOutput = "file content here"
            const messages: WithParts[] = [
                createCompletedMessage("msg_1", [
                    createToolPart(
                        "call_123",
                        "read",
                        "completed",
                        { filePath: "/test/file.ts" },
                        originalOutput,
                    ),
                ]),
            ]

            injectHashesIntoToolOutputs(state, mockConfig, messages, mockLogger as any)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe(originalOutput)
        })

        it("should not inject hash if tool is protected", () => {
            const hashMappings = new Map([["call_123", "abc123"]])
            const state = createMockState([], hashMappings)
            const protectedConfig = {
                ...mockConfig,
                tools: {
                    ...mockConfig.tools,
                    settings: {
                        ...mockConfig.tools.settings,
                        protectedTools: ["read"],
                    },
                },
            } as PluginConfig
            const originalOutput = "file content here"
            const messages: WithParts[] = [
                createCompletedMessage("msg_1", [
                    createToolPart(
                        "call_123",
                        "read",
                        "completed",
                        { filePath: "/test/file.ts" },
                        originalOutput,
                    ),
                ]),
            ]

            injectHashesIntoToolOutputs(state, protectedConfig, messages, mockLogger as any)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe(originalOutput)
        })

        it("should not inject hash if output already has hash prefix", () => {
            const hashMappings = new Map([["call_123", "abc123"]])
            const state = createMockState([], hashMappings)
            const alreadyHashedOutput = "file content here\n<tool_hash>abc123</tool_hash>"
            const messages: WithParts[] = [
                createCompletedMessage("msg_1", [
                    createToolPart(
                        "call_123",
                        "read",
                        "completed",
                        { filePath: "/test/file.ts" },
                        alreadyHashedOutput,
                    ),
                ]),
            ]

            injectHashesIntoToolOutputs(state, mockConfig, messages, mockLogger as any)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe(alreadyHashedOutput)
        })

        it("should not inject hash for errored tools", () => {
            const hashMappings = new Map([["call_123", "abc123"]])
            const state = createMockState([], hashMappings)
            const originalOutput = "error message"
            const messages: WithParts[] = [
                createCompletedMessage("msg_1", [
                    createToolPart(
                        "call_123",
                        "read",
                        "error",
                        { filePath: "/test/file.ts" },
                        originalOutput,
                    ),
                ]),
            ]

            injectHashesIntoToolOutputs(state, mockConfig, messages, mockLogger as any)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe(originalOutput)
        })

        it("should not inject hash if no hash mapping exists", () => {
            const state = createMockState([], new Map())
            const originalOutput = "file content here"
            const messages: WithParts[] = [
                createCompletedMessage("msg_1", [
                    createToolPart(
                        "call_123",
                        "read",
                        "completed",
                        { filePath: "/test/file.ts" },
                        originalOutput,
                    ),
                ]),
            ]

            injectHashesIntoToolOutputs(state, mockConfig, messages, mockLogger as any)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe(originalOutput)
        })

        it("should inject different hashes for different tool types", () => {
            const hashMappings = new Map([
                ["call_read", "r_abc12"],
                ["call_glob", "g_def34"],
                ["call_bash", "b_ghi56"],
            ])
            const state = createMockState([], hashMappings)
            const messages: WithParts[] = [
                createCompletedMessage("msg_1", [
                    createToolPart(
                        "call_read",
                        "read",
                        "completed",
                        { filePath: "/test/file.ts" },
                        "content1",
                    ),
                    createToolPart(
                        "call_glob",
                        "glob",
                        "completed",
                        { pattern: "**/*.ts" },
                        "content2",
                    ),
                    createToolPart("call_bash", "bash", "completed", { command: "ls" }, "content3"),
                ]),
            ]

            injectHashesIntoToolOutputs(state, mockConfig, messages, mockLogger as any)

            expect((messages[0].parts[0] as any).state.output).toBe(
                "content1\n<tool_hash>r_abc12</tool_hash>",
            )
            expect((messages[0].parts[1] as any).state.output).toBe(
                "content2\n<tool_hash>g_def34</tool_hash>",
            )
            expect((messages[0].parts[2] as any).state.output).toBe(
                "content3\n<tool_hash>b_ghi56</tool_hash>",
            )
        })

        it("should NOT inject hash into streaming (incomplete) messages", () => {
            const hashMappings = new Map([["call_123", "abc123"]])
            const state = createMockState([], hashMappings)
            const originalOutput = "file content here"
            const messages: WithParts[] = [
                createStreamingMessage("msg_1", [
                    createToolPart(
                        "call_123",
                        "read",
                        "completed",
                        { filePath: "/test/file.ts" },
                        originalOutput,
                    ),
                ]),
            ]

            injectHashesIntoToolOutputs(state, mockConfig, messages, mockLogger as any)

            // Output should remain unchanged - no hash injected
            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe(originalOutput)
        })

        it("should NOT inject hash when completed timestamp is 0", () => {
            const hashMappings = new Map([["call_123", "abc123"]])
            const state = createMockState([], hashMappings)
            const originalOutput = "file content here"
            const messages: WithParts[] = [
                createMessage(
                    "msg_1",
                    [
                        createToolPart(
                            "call_123",
                            "read",
                            "completed",
                            { filePath: "/test/file.ts" },
                            originalOutput,
                        ),
                    ],
                    0,
                ), // completed = 0 means still streaming
            ]

            injectHashesIntoToolOutputs(state, mockConfig, messages, mockLogger as any)

            // Output should remain unchanged - no hash injected
            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe(originalOutput)
        })

        it("should inject hash when message is completed (positive timestamp)", () => {
            const hashMappings = new Map([["call_123", "abc123"]])
            const state = createMockState([], hashMappings)
            const messages: WithParts[] = [
                createMessage(
                    "msg_1",
                    [
                        createToolPart(
                            "call_123",
                            "read",
                            "completed",
                            { filePath: "/test/file.ts" },
                            "file content here",
                        ),
                    ],
                    Date.now(),
                ), // completed = positive timestamp
            ]

            injectHashesIntoToolOutputs(state, mockConfig, messages, mockLogger as any)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe("file content here\n<tool_hash>abc123</tool_hash>")
        })
    })
})
