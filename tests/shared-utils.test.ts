import { describe, it, expect } from "vitest"
import { isSyntheticMessage, getLastUserMessage } from "../lib/shared-utils"
import { WithParts } from "../lib/state"

describe("shared-utils", () => {
    describe("isSyntheticMessage", () => {
        it("returns true for messages starting with ::synth::", () => {
            const msg = {
                info: { role: "user" },
                parts: [{ type: "text", text: "::synth::\nSome content" }]
            } as any
            expect(isSyntheticMessage(msg)).toBe(true)
        })

        it("returns false for normal user messages", () => {
            const msg = {
                info: { role: "user" },
                parts: [{ type: "text", text: "Hello world" }]
            } as any
            expect(isSyntheticMessage(msg)).toBe(false)
        })

        it("returns false for assistant messages even if they contain ::synth::", () => {
            const msg = {
                info: { role: "assistant" },
                parts: [{ type: "text", text: "::synth:: content" }]
            } as any
            expect(isSyntheticMessage(msg)).toBe(false)
        })

        it("returns false for messages with no text parts", () => {
            const msg = {
                info: { role: "user" },
                parts: [{ type: "tool", tool: "ls" }]
            } as any
            expect(isSyntheticMessage(msg)).toBe(false)
        })
    })

    describe("getLastUserMessage", () => {
        it("ignores synthetic messages", () => {
            const messages = [
                { info: { role: "user", id: "1" }, parts: [{ type: "text", text: "Real 1" }] },
                { info: { role: "user", id: "2" }, parts: [{ type: "text", text: "::synth:: Synthetic" }] },
            ] as any[]
            
            const last = getLastUserMessage(messages)
            expect(last?.info.id).toBe("1")
        })

        it("returns the latest real user message", () => {
             const messages = [
                { info: { role: "user", id: "1" }, parts: [{ type: "text", text: "Real 1" }] },
                { info: { role: "user", id: "2" }, parts: [{ type: "text", text: "::synth:: Synthetic" }] },
                { info: { role: "user", id: "3" }, parts: [{ type: "text", text: "Real 2" }] },
            ] as any[]
            
            const last = getLastUserMessage(messages)
            expect(last?.info.id).toBe("3")
        })
    })
})
