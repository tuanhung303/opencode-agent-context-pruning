import { describe, it, expect } from "vitest"
import { matchesPattern } from "../../lib/messages/pattern-match"

describe("matchesPattern", () => {
    it("should match valid start...end patterns", () => {
        const text = "Let me explain the architecture in detail."
        expect(matchesPattern(text, "Let me explain...detail.")).toBe(true)
        expect(matchesPattern(text, "let me explain...DETAIL.")).toBe(true) // Case-insensitive
    })

    it("should ignore whitespace and newlines", () => {
        const text = "  ARCHITECTURE  \n OVERVIEW  "
        expect(matchesPattern(text, "architecture...overview")).toBe(true)
    })

    it("should return false for single-sided patterns", () => {
        const text = "Let me explain the architecture in detail."
        expect(matchesPattern(text, "Let me explain...")).toBe(false)
        expect(matchesPattern(text, "...detail.")).toBe(false)
        expect(matchesPattern(text, "...")).toBe(false)
    })

    it("should return false if text does not start with startPart", () => {
        const text = "Let me explain the architecture in detail."
        expect(matchesPattern(text, "architecture...detail.")).toBe(false)
    })

    it("should return false if text does not end with endPart", () => {
        const text = "Let me explain the architecture in detail."
        expect(matchesPattern(text, "Let me explain...architecture")).toBe(false)
    })

    it("should return false if pattern does not contain '...'", () => {
        const text = "Let me explain"
        expect(matchesPattern(text, "Let me explain")).toBe(false)
    })
})
