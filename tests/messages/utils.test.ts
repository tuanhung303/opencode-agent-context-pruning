import { describe, it, expect } from "vitest"
import {
    createSyntheticUserMessage,
    createSyntheticAssistantMessage,
    createSyntheticToolPart,
    isDeepSeekOrKimi,
    extractParameterKey,
    isIgnoredUserMessage,
    stableStringify,
    generateToolHash,
    groupHashesByToolName,
    formatHashInventory,
    resolveTargetDisplayName,
} from "../../lib/messages/utils"
import type { WithParts } from "../../lib/state"
import { createSessionState } from "../../lib/state"

const createBaseMessage = (): WithParts => ({
    info: {
        id: "msg_test123",
        sessionID: "ses_test123",
        role: "user" as const,
        agent: "code",
        model: { providerID: "anthropic", modelID: "claude-3" },
        time: { created: Date.now() },
    },
    parts: [],
})

describe("createSyntheticUserMessage", () => {
    it("should create message without ignored flag", () => {
        const baseMessage = createBaseMessage()
        const result = createSyntheticUserMessage(baseMessage, "test content")

        expect(result.parts[0]).not.toHaveProperty("ignored")
    })

    it("should have valid message structure for OpenCode", () => {
        const baseMessage = createBaseMessage()
        const result = createSyntheticUserMessage(baseMessage, "test content")

        expect(result.info.role).toBe("user")
        expect(result.parts[0].type).toBe("text")
        expect((result.parts[0] as any).text).toBe("test content")
    })

    it("should preserve sessionID from base message", () => {
        const baseMessage = createBaseMessage()
        const result = createSyntheticUserMessage(baseMessage, "test content")

        expect(result.info.sessionID).toBe("ses_test123")
        expect(result.parts[0].sessionID).toBe("ses_test123")
    })

    it("should include variant when provided", () => {
        const baseMessage = createBaseMessage()
        const result = createSyntheticUserMessage(baseMessage, "test content", "test-variant")

        expect((result.info as any).variant).toBe("test-variant")
    })

    it("should not include variant when not provided", () => {
        const baseMessage = createBaseMessage()
        const result = createSyntheticUserMessage(baseMessage, "test content")

        expect((result.info as any).variant).toBeUndefined()
    })
})

describe("createSyntheticAssistantMessage", () => {
    it("should create message without ignored flag", () => {
        const baseMessage = createBaseMessage()
        const result = createSyntheticAssistantMessage(baseMessage, "test content")

        expect(result.parts[0]).not.toHaveProperty("ignored")
    })

    it("should have valid assistant message structure", () => {
        const baseMessage = createBaseMessage()
        const result = createSyntheticAssistantMessage(baseMessage, "test content")

        expect(result.info.role).toBe("assistant")
        expect(result.parts[0].type).toBe("text")
        expect((result.parts[0] as any).text).toBe("test content")
    })

    it("should include model information", () => {
        const baseMessage = createBaseMessage()
        const result = createSyntheticAssistantMessage(baseMessage, "test content")

        expect((result.info as any).modelID).toBe("claude-3")
        expect((result.info as any).providerID).toBe("anthropic")
    })
})

describe("createSyntheticToolPart", () => {
    it("should create tool part with context_info tool name", () => {
        const baseMessage = createBaseMessage()
        const result = createSyntheticToolPart(baseMessage, "test content")

        expect(result.tool).toBe("context_info")
    })

    it("should have completed status", () => {
        const baseMessage = createBaseMessage()
        const result = createSyntheticToolPart(baseMessage, "test content")

        expect(result.state.status).toBe("completed")
    })

    it("should have type tool", () => {
        const baseMessage = createBaseMessage()
        const result = createSyntheticToolPart(baseMessage, "test content")

        expect(result.type).toBe("tool")
    })

    it("should include content in output", () => {
        const baseMessage = createBaseMessage()
        const result = createSyntheticToolPart(baseMessage, "test content")

        expect(result.state.output).toBe("test content")
    })
})

describe("isDeepSeekOrKimi", () => {
    it("should return true for deepseek provider", () => {
        expect(isDeepSeekOrKimi("deepseek", "some-model")).toBe(true)
    })

    it("should return true for kimi provider", () => {
        expect(isDeepSeekOrKimi("kimi", "some-model")).toBe(true)
    })

    it("should return true for deepseek model", () => {
        expect(isDeepSeekOrKimi("openrouter", "deepseek-chat")).toBe(true)
    })

    it("should return true for kimi model", () => {
        expect(isDeepSeekOrKimi("openrouter", "kimi-k1")).toBe(true)
    })

    it("should return false for other providers/models", () => {
        expect(isDeepSeekOrKimi("anthropic", "claude-3")).toBe(false)
        expect(isDeepSeekOrKimi("openai", "gpt-4")).toBe(false)
    })

    it("should be case insensitive", () => {
        expect(isDeepSeekOrKimi("DeepSeek", "model")).toBe(true)
        expect(isDeepSeekOrKimi("KIMI", "model")).toBe(true)
    })
})

describe("extractParameterKey", () => {
    it("should extract filePath for read tool", () => {
        expect(extractParameterKey("read", { filePath: "/path/to/file.ts" })).toBe(
            "/path/to/file.ts",
        )
    })

    it("should include offset/limit info for read tool", () => {
        expect(extractParameterKey("read", { filePath: "/file.ts", offset: 10, limit: 20 })).toBe(
            "/file.ts (lines 10-30)",
        )
    })

    it("should extract pattern for glob tool", () => {
        expect(extractParameterKey("glob", { pattern: "**/*.ts" })).toBe('"**/*.ts"')
    })

    it("should extract pattern with path for grep tool", () => {
        expect(extractParameterKey("grep", { pattern: "TODO", path: "/src" })).toBe(
            '"TODO" in /src',
        )
    })

    it("should extract description for bash tool", () => {
        expect(extractParameterKey("bash", { description: "Run tests", command: "npm test" })).toBe(
            "Run tests",
        )
    })

    it("should truncate long bash commands", () => {
        const longCommand = "a".repeat(100)
        expect(extractParameterKey("bash", { command: longCommand })).toBe("a".repeat(50) + "...")
    })

    it("should extract url for webfetch tool", () => {
        expect(extractParameterKey("webfetch", { url: "https://example.com" })).toBe(
            "https://example.com",
        )
    })

    it("should return empty string for null parameters", () => {
        expect(extractParameterKey("read", null)).toBe("")
    })
})

describe("isIgnoredUserMessage", () => {
    it("should return true for message with all ignored parts", () => {
        const message: WithParts = {
            info: { id: "msg_1", sessionID: "ses_1", role: "user" as const },
            parts: [{ type: "text", text: "test", ignored: true }],
        } as any

        expect(isIgnoredUserMessage(message)).toBe(true)
    })

    it("should return false for message with non-ignored parts", () => {
        const message: WithParts = {
            info: { id: "msg_1", sessionID: "ses_1", role: "user" as const },
            parts: [{ type: "text", text: "test" }],
        } as any

        expect(isIgnoredUserMessage(message)).toBe(false)
    })

    it("should return true for message with empty parts", () => {
        const message: WithParts = {
            info: { id: "msg_1", sessionID: "ses_1", role: "user" as const },
            parts: [],
        } as any

        expect(isIgnoredUserMessage(message)).toBe(true)
    })

    it("should return false if any part is not ignored", () => {
        const message: WithParts = {
            info: { id: "msg_1", sessionID: "ses_1", role: "user" as const },
            parts: [
                { type: "text", text: "test1", ignored: true },
                { type: "text", text: "test2" },
            ],
        } as any

        expect(isIgnoredUserMessage(message)).toBe(false)
    })
})

describe("stableStringify", () => {
    it("should produce deterministic output regardless of key order", () => {
        const obj1 = { b: 2, a: 1, c: 3 }
        const obj2 = { a: 1, c: 3, b: 2 }
        const obj3 = { c: 3, b: 2, a: 1 }

        expect(stableStringify(obj1)).toBe(stableStringify(obj2))
        expect(stableStringify(obj2)).toBe(stableStringify(obj3))
    })

    it("should handle nested objects with consistent key ordering", () => {
        const obj1 = { outer: { b: 2, a: 1 }, z: 1 }
        const obj2 = { z: 1, outer: { a: 1, b: 2 } }

        expect(stableStringify(obj1)).toBe(stableStringify(obj2))
    })

    it("should handle arrays", () => {
        const obj = { arr: [1, 2, 3] }
        expect(stableStringify(obj)).toBe('{"arr":[1,2,3]}')
    })

    it("should handle null and undefined", () => {
        expect(stableStringify(null)).toBe("null")
        expect(stableStringify(undefined)).toBe(undefined)
    })

    it("should handle primitive values", () => {
        expect(stableStringify("hello")).toBe('"hello"')
        expect(stableStringify(42)).toBe("42")
        expect(stableStringify(true)).toBe("true")
    })

    it("should handle empty objects and arrays", () => {
        expect(stableStringify({})).toBe("{}")
        expect(stableStringify([])).toBe("[]")
    })
})

describe("generateToolHash", () => {
    it("should generate deterministic hashes for same inputs", () => {
        const hash1 = generateToolHash("read", { filePath: "/src/index.ts" })
        const hash2 = generateToolHash("read", { filePath: "/src/index.ts" })

        expect(hash1).toBe(hash2)
    })

    it("should generate different hashes for different params", () => {
        const hash1 = generateToolHash("read", { filePath: "/src/a.ts" })
        const hash2 = generateToolHash("read", { filePath: "/src/b.ts" })

        expect(hash1).not.toBe(hash2)
    })

    it("should generate same hash regardless of key order", () => {
        const hash1 = generateToolHash("read", { filePath: "/a.ts", offset: 0 })
        const hash2 = generateToolHash("read", { offset: 0, filePath: "/a.ts" })

        expect(hash1).toBe(hash2)
    })

    it("should generate 6-char hex hashes without prefix", () => {
        const readHash = generateToolHash("read", { filePath: "/a.ts" })
        const globHash = generateToolHash("glob", { pattern: "**/*.ts" })
        const bashHash = generateToolHash("bash", { command: "npm test" })

        expect(readHash).toMatch(/^[a-f0-9]{6}$/)
        expect(globHash).toMatch(/^[a-f0-9]{6}$/)
        expect(bashHash).toMatch(/^[a-f0-9]{6}$/)
    })

    it("should handle empty params", () => {
        const hash = generateToolHash("read", {})
        expect(hash).toMatch(/^[a-f0-9]{6}$/)
    })

    it("should handle complex nested params", () => {
        const hash1 = generateToolHash("task", {
            description: "test",
            prompt: "do something",
            subagent_type: "general",
        })
        const hash2 = generateToolHash("task", {
            subagent_type: "general",
            description: "test",
            prompt: "do something",
        })

        expect(hash1).toBe(hash2)
        expect(hash1).toMatch(/^[a-f0-9]{6}$/)
    })
})

describe("groupHashesByToolName", () => {
    it("should group hashes by tool name from state", () => {
        const state = createSessionState()

        // Set up hash mappings
        state.hashRegistry.calls.set("abc123", "call_1")
        state.hashRegistry.calls.set("def456", "call_2")
        state.hashRegistry.calls.set("123456", "call_3")
        state.hashRegistry.calls.set("789abc", "call_4")

        state.hashRegistry.callIds.set("call_1", "abc123")
        state.hashRegistry.callIds.set("call_2", "def456")
        state.hashRegistry.callIds.set("call_3", "123456")
        state.hashRegistry.callIds.set("call_4", "789abc")

        // Set up tool parameters
        state.toolParameters.set("call_1", { tool: "read", parameters: {}, turn: 1 })
        state.toolParameters.set("call_2", { tool: "read", parameters: {}, turn: 2 })
        state.toolParameters.set("call_3", { tool: "grep", parameters: {}, turn: 3 })
        state.toolParameters.set("call_4", { tool: "glob", parameters: {}, turn: 4 })

        const grouped = groupHashesByToolName(state)

        expect(grouped.reads).toEqual(["abc123", "def456"])
        expect(grouped.greps).toEqual(["123456"])
        expect(grouped.globs).toEqual(["789abc"])
    })

    it("should exclude pruned hashes", () => {
        const state = createSessionState()

        state.hashRegistry.calls.set("abc123", "call_1")
        state.hashRegistry.calls.set("def456", "call_2")
        state.hashRegistry.callIds.set("call_1", "abc123")
        state.hashRegistry.callIds.set("call_2", "def456")

        state.toolParameters.set("call_1", { tool: "read", parameters: {}, turn: 1 })
        state.toolParameters.set("call_2", { tool: "read", parameters: {}, turn: 2 })

        // Mark call_1 as pruned
        state.prune.toolIds.push("call_1")

        const grouped = groupHashesByToolName(state)

        expect(grouped.reads).toEqual(["def456"])
    })

    it("should return empty object when no hashes", () => {
        const state = createSessionState()
        const grouped = groupHashesByToolName(state)
        expect(grouped).toEqual({})
    })

    it("should skip hashes without tool parameters", () => {
        const state = createSessionState()

        state.hashRegistry.calls.set("abc123", "call_1")
        state.hashRegistry.callIds.set("call_1", "abc123")
        // No toolParameters entry for call_1

        const grouped = groupHashesByToolName(state)
        expect(grouped).toEqual({})
    })

    it("should handle special pluralization for bash", () => {
        const state = createSessionState()

        state.hashRegistry.calls.set("b_12345", "call_1")
        state.hashRegistry.callIds.set("call_1", "b_12345")
        state.toolParameters.set("call_1", { tool: "bash", parameters: {}, turn: 1 })

        const grouped = groupHashesByToolName(state)
        expect(grouped.bashes).toEqual(["b_12345"])
    })

    it("should handle task tool", () => {
        const state = createSessionState()

        state.hashRegistry.calls.set("t_12345", "call_1")
        state.hashRegistry.callIds.set("call_1", "t_12345")
        state.toolParameters.set("call_1", { tool: "task", parameters: {}, turn: 1 })

        const grouped = groupHashesByToolName(state)
        expect(grouped.tasks).toEqual(["t_12345"])
    })
})

describe("formatHashInventory", () => {
    it("should format grouped hashes with tool names", () => {
        const grouped = {
            reads: ["abc123", "def456"],
            greps: ["123456"],
        }

        const result = formatHashInventory(grouped)

        expect(result).toBe("reads: abc123, def456\ngreps: 123456")
    })

    it("should return empty string for empty grouped object", () => {
        const result = formatHashInventory({})
        expect(result).toBe("")
    })

    it("should order tools in preferred order", () => {
        const grouped = {
            tasks: ["t_12345"],
            reads: ["abc123"],
            greps: ["123456"],
            globs: ["789abc"],
        }

        const result = formatHashInventory(grouped)
        const lines = result.split("\n")

        // reads should come before greps, greps before globs, globs before tasks
        expect(lines[0]).toContain("reads:")
        expect(lines[1]).toContain("greps:")
        expect(lines[2]).toContain("globs:")
        expect(lines[3]).toContain("tasks:")
    })

    it("should handle single hash per tool", () => {
        const grouped = {
            reads: ["abc123"],
        }

        const result = formatHashInventory(grouped)
        expect(result).toBe("reads: abc123")
    })

    it("should handle unknown tool types at the end", () => {
        const grouped = {
            reads: ["abc123"],
            unknowns: ["u_12345"],
        }

        const result = formatHashInventory(grouped)
        const lines = result.split("\n")

        expect(lines[0]).toContain("reads:")
        expect(lines[1]).toContain("unknowns:")
    })
})

describe("resolveTargetDisplayName", () => {
    const createMockState = () => {
        const state = createSessionState()
        return state
    }

    it("should resolve tool hash to tool name", () => {
        const state = createMockState()
        state.hashRegistry.calls.set("abc123", "call-id-1")
        state.toolParameters.set("call-id-1", {
            tool: "read",
            parameters: { filePath: "/test.ts" },
            turn: 1,
        })

        const result = resolveTargetDisplayName("abc123", state)
        expect(result).toBe("read")
    })

    it("should resolve message hash to 'message part'", () => {
        const state = createMockState()
        state.hashRegistry.messages.set("def456", "msg-id-1:0")

        const result = resolveTargetDisplayName("def456", state)
        expect(result).toBe("message part")
    })

    it("should resolve reasoning hash to 'thinking block'", () => {
        const state = createMockState()
        state.hashRegistry.reasoning.set("ghi789", "msg-id-2:1")

        const result = resolveTargetDisplayName("ghi789", state)
        expect(result).toBe("thinking block")
    })

    it("should fall back to raw hash for unknown hash", () => {
        const state = createMockState()

        const result = resolveTargetDisplayName("xyz999", state)
        expect(result).toBe("xyz999")
    })

    it("should fall back to raw hash when state is undefined", () => {
        const result = resolveTargetDisplayName("abc123", undefined)
        expect(result).toBe("abc123")
    })

    it("should use targetType hint for message when hash not found", () => {
        const state = createMockState()

        const result = resolveTargetDisplayName("unknown", state, undefined, "message")
        expect(result).toBe("message part")
    })

    it("should use targetType hint for reasoning when hash not found", () => {
        const state = createMockState()

        const result = resolveTargetDisplayName("unknown", state, undefined, "reasoning")
        expect(result).toBe("thinking block")
    })

    it("should fall back to hash when tool hash exists but no metadata", () => {
        const state = createMockState()
        state.hashRegistry.calls.set("abc123", "call-id-1")
        // No toolParameters entry for call-id-1

        const result = resolveTargetDisplayName("abc123", state)
        expect(result).toBe("abc123")
    })
})
