import { describe, it, expect } from "vitest"
import { getRealTokenCount } from "../../lib/strategies/utils"
import type { WithParts } from "../../lib/state"

const createAssistantMsg = (id: string, tokens?: any, parts: any[] = []): WithParts =>
    ({
        info: {
            id,
            role: "assistant" as const,
            time: { created: Date.now(), completed: Date.now() },
            ...(tokens ? { tokens } : {}),
        },
        parts,
    }) as any

const createUserMsg = (id: string): WithParts =>
    ({
        info: { id, role: "user" as const, time: { created: Date.now() } },
        parts: [{ type: "text", text: "hello" }],
    }) as any

describe("getRealTokenCount", () => {
    it("should return real token count from last assistant message", () => {
        const messages: WithParts[] = [
            createUserMsg("u1"),
            createAssistantMsg("a1", {
                input: 5000,
                output: 1000,
                reasoning: 500,
                cache: { read: 2000, write: 1000 },
            }),
        ]

        // Formula: input + cache.read + output = 5000 + 2000 + 1000 = 8000
        expect(getRealTokenCount(messages)).toBe(8000)
    })

    it("should use the LAST assistant message with tokens", () => {
        const messages: WithParts[] = [
            createUserMsg("u1"),
            createAssistantMsg("a1", {
                input: 1000,
                output: 500,
                reasoning: 0,
                cache: { read: 0, write: 0 },
            }),
            createUserMsg("u2"),
            createAssistantMsg("a2", {
                input: 8000,
                output: 2000,
                reasoning: 1000,
                cache: { read: 3000, write: 500 },
            }),
        ]

        // Should use a2: 8000 + 3000 + 2000 = 13000
        expect(getRealTokenCount(messages)).toBe(13000)
    })

    it("should return null when no assistant messages exist", () => {
        const messages: WithParts[] = [createUserMsg("u1")]
        expect(getRealTokenCount(messages)).toBeNull()
    })

    it("should return null when assistant messages have no tokens field", () => {
        const messages: WithParts[] = [
            createUserMsg("u1"),
            createAssistantMsg("a1"), // no tokens
        ]
        expect(getRealTokenCount(messages)).toBeNull()
    })

    it("should handle missing cache gracefully", () => {
        const messages: WithParts[] = [
            createAssistantMsg("a1", {
                input: 5000,
                output: 1000,
                reasoning: 0,
                // no cache field
            }),
        ]

        // 5000 + 0 (no cache.read) + 1000 = 6000
        expect(getRealTokenCount(messages)).toBe(6000)
    })

    it("should skip assistant messages without valid tokens.input", () => {
        const messages: WithParts[] = [
            createAssistantMsg("a1", {
                input: 3000,
                output: 500,
                cache: { read: 1000, write: 0 },
            }),
            createUserMsg("u1"),
            createAssistantMsg("a2", { foo: "bar" }), // invalid tokens
        ]

        // Should skip a2, use a1: 3000 + 1000 + 500 = 4500
        expect(getRealTokenCount(messages)).toBe(4500)
    })

    it("should return null for empty messages array", () => {
        expect(getRealTokenCount([])).toBeNull()
    })
})
