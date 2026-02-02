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
        callIdToHash: hashMappings,
        hashToCallId: new Map([...hashMappings].map(([k, v]) => [v, k])),
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

const createMessage = (id: string, parts: any[]): WithParts =>
    ({
        info: {
            id,
            role: "assistant" as const,
            time: { created: Date.now() }, // Required for isMessageCompacted check
        },
        parts,
    }) as any

describe("prune", () => {
    let mockLogger: ReturnType<typeof createMockLogger>
    let mockConfig: PluginConfig

    beforeEach(() => {
        mockLogger = createMockLogger()
        mockConfig = createMockConfig()
    })

    describe("pruneToolOutputs", () => {
        it("should replace tool output with breadcrumb containing metadata", () => {
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

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toContain("[Output removed")
            expect(output).toContain("read")
            expect(output).toContain("filePath")
            expect(output).toContain("/test/file.ts")
            expect(output).toContain("completed")
        })

        it("should include tool name in breadcrumb", () => {
            const state = createMockState(["call_456"])
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart(
                        "call_456",
                        "glob",
                        "completed",
                        { pattern: "**/*.ts" },
                        "file1.ts\nfile2.ts",
                    ),
                ]),
            ]

            prune(state, mockLogger as any, mockConfig, messages)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toContain("glob")
            expect(output).toContain("pattern")
            expect(output).toContain("**/*.ts")
        })

        it("should not prune tools not in prune list", () => {
            const state = createMockState(["call_other"])
            const originalOutput = "original content"
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart(
                        "call_123",
                        "read",
                        "completed",
                        { filePath: "/test/file.ts" },
                        originalOutput,
                    ),
                ]),
            ]

            prune(state, mockLogger as any, mockConfig, messages)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe(originalOutput)
        })

        it("should not prune question tool outputs", () => {
            const state = createMockState(["call_question"])
            const originalOutput = "user answered: yes"
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart(
                        "call_question",
                        "question",
                        "completed",
                        { questions: [{ header: "Test" }] },
                        originalOutput,
                    ),
                ]),
            ]

            prune(state, mockLogger as any, mockConfig, messages)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe(originalOutput)
        })

        it("should not prune errored tools via pruneToolOutputs", () => {
            const state = createMockState(["call_error"])
            const originalOutput = "error message"
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart(
                        "call_error",
                        "read",
                        "error",
                        { filePath: "/test/file.ts" },
                        originalOutput,
                    ),
                ]),
            ]

            prune(state, mockLogger as any, mockConfig, messages)

            // Output should remain unchanged (pruneToolOutputs only handles completed)
            const output = (messages[0].parts[0] as any).state.output
            expect(output).toBe(originalOutput)
        })
    })

    describe("pruneToolInputs (question tool)", () => {
        it("should prune question tool inputs", () => {
            const state = createMockState(["call_question"])
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

            const input = (messages[0].parts[0] as any).state.input
            expect(input.questions).toBe("[questions removed - see output for user's answers]")
        })
    })

    describe("pruneToolErrors", () => {
        it("should prune string inputs for errored tools", () => {
            const state = createMockState(["call_error"])
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

            const input = (messages[0].parts[0] as any).state.input
            expect(input.command).toBe("[input removed due to failed tool call]")
            expect(input.description).toBe("[input removed due to failed tool call]")
        })
    })

    describe("breadcrumb format", () => {
        it("should truncate long parameter values", () => {
            const state = createMockState(["call_123"])
            const longPath = "/very/long/path/".repeat(10) + "file.ts"
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart(
                        "call_123",
                        "read",
                        "completed",
                        { filePath: longPath },
                        "content",
                    ),
                ]),
            ]

            prune(state, mockLogger as any, mockConfig, messages)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toContain("...")
            expect(output.length).toBeLessThan(longPath.length + 200)
        })

        it("should handle bash tool with description", () => {
            const state = createMockState(["call_bash"])
            const messages: WithParts[] = [
                createMessage("msg_1", [
                    createToolPart(
                        "call_bash",
                        "bash",
                        "completed",
                        { command: "npm test", description: "Run tests" },
                        "All tests passed",
                    ),
                ]),
            ]

            prune(state, mockLogger as any, mockConfig, messages)

            const output = (messages[0].parts[0] as any).state.output
            expect(output).toContain("bash")
            expect(output).toContain("command")
            expect(output).toContain("npm test")
        })
    })

    describe("injectHashesIntoToolOutputs", () => {
        it("should inject hash prefix into tool output", () => {
            const hashMappings = new Map([["call_123", "r_a1b2c"]])
            const state = createMockState([], hashMappings)
            const messages: WithParts[] = [
                createMessage("msg_1", [
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
            expect(output).toBe("r_a1b2c\nfile content here")
        })

        it("should not inject hash if tool is already pruned", () => {
            const hashMappings = new Map([["call_123", "r_a1b2c"]])
            const state = createMockState(["call_123"], hashMappings)
            const originalOutput = "file content here"
            const messages: WithParts[] = [
                createMessage("msg_1", [
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
            const hashMappings = new Map([["call_123", "r_a1b2c"]])
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
                createMessage("msg_1", [
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
            const hashMappings = new Map([["call_123", "r_a1b2c"]])
            const state = createMockState([], hashMappings)
            const alreadyHashedOutput = "r_a1b2c\nfile content here"
            const messages: WithParts[] = [
                createMessage("msg_1", [
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
            const hashMappings = new Map([["call_123", "r_a1b2c"]])
            const state = createMockState([], hashMappings)
            const originalOutput = "error message"
            const messages: WithParts[] = [
                createMessage("msg_1", [
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
                createMessage("msg_1", [
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
                createMessage("msg_1", [
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

            expect((messages[0].parts[0] as any).state.output).toBe("r_abc12\ncontent1")
            expect((messages[0].parts[1] as any).state.output).toBe("g_def34\ncontent2")
            expect((messages[0].parts[2] as any).state.output).toBe("b_ghi56\ncontent3")
        })
    })
})
