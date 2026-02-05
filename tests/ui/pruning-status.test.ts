import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
    formatPrunedTools,
    formatDistilledContent,
    formatPruningStatus,
    formatItemizedDetails,
    dimText,
    supportsAnsiColors,
} from "../../lib/ui/pruning-status"

describe("formatPrunedTools", () => {
    it("should format single tool", () => {
        const result = formatPrunedTools(["read"])
        expect(result).toBe("pruned: read")
    })

    it("should format exactly 3 tools", () => {
        const result = formatPrunedTools(["read", "grep", "glob"])
        expect(result).toBe("pruned: read, grep, glob")
    })

    it("should show overflow indicator when more than 3 tools", () => {
        const result = formatPrunedTools(["read", "grep", "glob", "bash", "edit"])
        expect(result).toBe("pruned: read, grep, glob...")
    })

    it("should return empty string for empty array", () => {
        const result = formatPrunedTools([])
        expect(result).toBe("")
    })

    it("should return empty string for undefined", () => {
        const result = formatPrunedTools(undefined as unknown as string[])
        expect(result).toBe("")
    })

    it("should format 2 tools without overflow", () => {
        const result = formatPrunedTools(["read", "grep"])
        expect(result).toBe("pruned: read, grep")
    })
})

describe("formatDistilledContent", () => {
    it("should format content preview with first 5 and last 5 chars", () => {
        const result = formatDistilledContent(["authentication token validation"])
        expect(result).toBe("distilled: authe...ation")
    })

    it("should show full content for short strings (< 10 chars)", () => {
        const result = formatDistilledContent(["hello"])
        expect(result).toBe("distilled: hello")
    })

    it("should format exactly 3 items with previews", () => {
        const contents = ["authentication token", "user permissions data", "session management"]
        const result = formatDistilledContent(contents)
        // "authentication token" (20 chars) -> "authe" + "..." + "token" = "authe...token"
        // "user permissions data" (21 chars) -> "user " + "..." + " data" = "user ... data"
        // "session management" (18 chars) -> "sessi" + "..." + "ement" = "sessi...ement"
        expect(result).toBe("distilled: authe...token, user ... data, sessi...ement")
    })

    it("should show overflow indicator when more than 3 items", () => {
        const contents = [
            "authentication token",
            "user permissions data",
            "session management",
            "logging configuration",
        ]
        const result = formatDistilledContent(contents)
        expect(result).toBe("distilled: authe...token, user ... data, sessi...ement...")
    })

    it("should return empty string for empty array", () => {
        const result = formatDistilledContent([])
        expect(result).toBe("")
    })

    it("should return empty string for undefined", () => {
        const result = formatDistilledContent(undefined as unknown as string[])
        expect(result).toBe("")
    })

    it("should show full content for exactly 10 character content", () => {
        // Content with exactly 10 chars should show full content (not <= 10)
        const result = formatDistilledContent(["1234567890"])
        expect(result).toBe("distilled: 1234567890")
    })

    it("should handle 11 character content", () => {
        // Content with 11 chars should show preview: first 5 + ... + last 5
        // "12345678901" -> "12345" + "..." + "78901" = "12345...78901"
        const result = formatDistilledContent(["12345678901"])
        expect(result).toBe("distilled: 12345...78901")
    })
})

describe("formatPruningStatus", () => {
    it("should format pruned only", () => {
        const result = formatPruningStatus(["read", "grep"], [])
        expect(result).toBe("pruned: read, grep")
    })

    it("should format distilled only", () => {
        const result = formatPruningStatus([], ["authentication token"])
        // "authentication token" (20 chars) -> "authe...token"
        expect(result).toBe("distilled: authe...token")
    })

    it("should format combined with | separator", () => {
        const result = formatPruningStatus(["read", "grep"], ["authentication token"])
        expect(result).toBe("pruned: read, grep | distilled: authe...token")
    })

    it("should return empty string when both are empty", () => {
        const result = formatPruningStatus([], [])
        expect(result).toBe("")
    })

    it("should return empty string when both are undefined", () => {
        const result = formatPruningStatus(
            undefined as unknown as string[],
            undefined as unknown as string[],
        )
        expect(result).toBe("")
    })

    it("should handle pruned overflow with distilled", () => {
        const result = formatPruningStatus(["read", "grep", "glob", "bash"], ["auth token"])
        expect(result).toBe("pruned: read, grep, glob... | distilled: auth token")
    })

    it("should handle distilled overflow with pruned", () => {
        const result = formatPruningStatus(
            ["read"],
            ["auth token", "user perms", "session", "config"],
        )
        expect(result).toBe("pruned: read | distilled: auth token, user perms, session...")
    })
})

describe("supportsAnsiColors", () => {
    let originalNoColor: string | undefined
    let originalIsTTY: boolean | undefined

    beforeEach(() => {
        originalNoColor = process.env.NO_COLOR
        originalIsTTY = process.stdout.isTTY
    })

    afterEach(() => {
        if (originalNoColor === undefined) {
            delete process.env.NO_COLOR
        } else {
            process.env.NO_COLOR = originalNoColor
        }
        // Restore isTTY
        Object.defineProperty(process.stdout, "isTTY", {
            value: originalIsTTY,
            writable: true,
            configurable: true,
        })
    })

    it("should return false when NO_COLOR is set", () => {
        process.env.NO_COLOR = "1"
        expect(supportsAnsiColors()).toBe(false)
    })

    it("should return false when stdout is not TTY", () => {
        Object.defineProperty(process.stdout, "isTTY", {
            value: false,
            writable: true,
            configurable: true,
        })
        expect(supportsAnsiColors()).toBe(false)
    })

    it("should return true when TTY and NO_COLOR not set", () => {
        Object.defineProperty(process.stdout, "isTTY", {
            value: true,
            writable: true,
            configurable: true,
        })
        delete process.env.NO_COLOR
        expect(supportsAnsiColors()).toBe(true)
    })
})

describe("dimText", () => {
    let originalNoColor: string | undefined
    let originalIsTTY: boolean | undefined

    beforeEach(() => {
        originalNoColor = process.env.NO_COLOR
        originalIsTTY = process.stdout.isTTY
    })

    afterEach(() => {
        if (originalNoColor === undefined) {
            delete process.env.NO_COLOR
        } else {
            process.env.NO_COLOR = originalNoColor
        }
        Object.defineProperty(process.stdout, "isTTY", {
            value: originalIsTTY,
            writable: true,
            configurable: true,
        })
    })

    it("should apply ANSI dim code when colors supported", () => {
        Object.defineProperty(process.stdout, "isTTY", {
            value: true,
            writable: true,
            configurable: true,
        })
        delete process.env.NO_COLOR
        const result = dimText("test message")
        expect(result).toBe("\x1b[2mtest message\x1b[0m")
    })

    it("should return plain text when NO_COLOR is set", () => {
        process.env.NO_COLOR = "1"
        const result = dimText("test message")
        expect(result).toBe("test message")
    })

    it("should return plain text when not TTY", () => {
        Object.defineProperty(process.stdout, "isTTY", {
            value: false,
            writable: true,
            configurable: true,
        })
        const result = dimText("test message")
        expect(result).toBe("test message")
    })

    it("should return empty string for empty input", () => {
        expect(dimText("")).toBe("")
    })

    it("should return empty string for undefined input", () => {
        expect(dimText(undefined as unknown as string)).toBe(undefined)
    })
})

describe("formatItemizedDetails", () => {
    it("should format single tool without count suffix", () => {
        const result = formatItemizedDetails([{ type: "tool", name: "bash" }], [])
        expect(result).toBe("⚙️ bash")
    })

    it("should collapse repeated tools with (xN) suffix", () => {
        const items = Array(6).fill({ type: "tool", name: "bash" })
        const result = formatItemizedDetails(items, [])
        expect(result).toBe("⚙️ bash (x6)")
    })

    it("should group mixed tools preserving first-occurrence order", () => {
        const items = [
            { type: "tool" as const, name: "bash" },
            { type: "tool" as const, name: "grep" },
            { type: "tool" as const, name: "bash" },
            { type: "tool" as const, name: "grep" },
            { type: "tool" as const, name: "bash" },
        ]
        const result = formatItemizedDetails(items, [])
        expect(result).toBe("⚙️ bash (x3) ₊ ⚙️ grep (x2)")
    })

    it("should handle mixed types (tools, messages, reasoning)", () => {
        const pruned = [
            { type: "tool" as const, name: "bash" },
            { type: "tool" as const, name: "bash" },
            { type: "message" as const, name: "msg1" },
            { type: "reasoning" as const, name: "think1" },
        ]
        const result = formatItemizedDetails(pruned, [])
        expect(result).toBe("⚙️ bash (x2) ₊ 💬 msg1 ₊ 🧠 think1")
    })

    it("should group distilled items with same summary", () => {
        const distilled = [
            { type: "message" as const, summary: "Auth flow" },
            { type: "message" as const, summary: "Auth flow" },
            { type: "message" as const, summary: "Auth flow" },
        ]
        const result = formatItemizedDetails([], distilled)
        expect(result).toBe('💬 "Auth flow" (x3)')
    })

    it("should combine pruned and distilled with grouping", () => {
        const pruned = [
            { type: "tool" as const, name: "read" },
            { type: "tool" as const, name: "read" },
        ]
        const distilled = [{ type: "reasoning" as const, summary: "Analysis complete" }]
        const result = formatItemizedDetails(pruned, distilled)
        expect(result).toBe('⚙️ read (x2) ₊ 🧠 "Analysis comple..."')
    })

    it("should return empty string for empty arrays", () => {
        const result = formatItemizedDetails([], [])
        expect(result).toBe("")
    })

    it("should handle null/undefined gracefully", () => {
        const result = formatItemizedDetails(
            null as unknown as any[],
            undefined as unknown as any[],
        )
        expect(result).toBe("")
    })

    it("should not add suffix for count of 1", () => {
        const items = [
            { type: "tool" as const, name: "bash" },
            { type: "tool" as const, name: "grep" },
            { type: "tool" as const, name: "read" },
        ]
        const result = formatItemizedDetails(items, [])
        expect(result).toBe("⚙️ bash ₊ ⚙️ grep ₊ ⚙️ read")
    })
})
