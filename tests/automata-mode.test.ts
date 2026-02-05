import { describe, it, expect, beforeEach, vi } from "vitest"
import {
    detectAutomataActivation,
    injectAutomataReflection,
    removeAutomataReflection,
} from "../lib/messages/automata-mode"
import { createSessionState } from "../lib/state/state"

describe("Automata Mode: Activation", () => {
    let state: any
    let logger: any

    beforeEach(() => {
        state = createSessionState()
        logger = {
            info: vi.fn(),
            debug: vi.fn(),
            error: vi.fn(),
        }
    })

    it("should activate when 'automata' keyword is present (case-insensitive)", () => {
        const messages: any[] = [
            {
                info: { role: "user" },
                parts: [{ type: "text", text: "Please help me with this automata task" }],
            },
        ]
        state.currentTurn = 1

        const activated = detectAutomataActivation(state, messages, logger)

        expect(activated).toBe(true)
        expect(state.cursors.automata.enabled).toBe(true)
        expect(state.cursors.automata.lastTurn).toBe(1)
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Automata mode activated"))
    })

    it("should not activate when keyword is missing", () => {
        const messages: any[] = [
            {
                info: { role: "user" },
                parts: [{ type: "text", text: "Regular task description" }],
            },
        ]

        const activated = detectAutomataActivation(state, messages, logger)

        expect(activated).toBe(false)
        expect(state.cursors.automata.enabled).toBe(false)
    })

    it("should remain active once activated even if keyword is missing in later messages", () => {
        state.cursors.automata.enabled = true
        state.cursors.automata.lastTurn = 1

        const messages: any[] = [
            {
                info: { role: "user" },
                parts: [{ type: "text", text: "Regular task description" }],
            },
        ]

        const activated = detectAutomataActivation(state, messages, logger)

        expect(activated).toBe(true)
        expect(state.cursors.automata.enabled).toBe(true)
    })
})

describe("Automata Mode: Injection", () => {
    let state: any
    let logger: any
    let config: any

    beforeEach(() => {
        state = createSessionState()
        logger = {
            info: vi.fn(),
            debug: vi.fn(),
            error: vi.fn(),
        }
        config = {
            tools: {
                automataMode: {
                    enabled: true,
                    initialTurns: 8,
                },
            },
        }
    })

    it("should inject reflection message when threshold is met", () => {
        state.cursors.automata.enabled = true
        state.currentTurn = 8
        state.cursors.automata.lastTurn = 0
        state.cursors.automata.lastReflectionTurn = 0

        const messages: any[] = []
        const injected = injectAutomataReflection(state, logger, config, messages)

        expect(injected).toBe(true)
        expect(messages.length).toBe(1)
        expect(messages[0].parts[0].text).toContain("Strategic Reflection")
        expect(state.cursors.automata.lastReflectionTurn).toBe(8)
    })

    it("should not inject if not enabled in config", () => {
        config.tools.automataMode.enabled = false
        state.cursors.automata.enabled = true
        state.currentTurn = 8

        const messages: any[] = []
        const injected = injectAutomataReflection(state, logger, config, messages)

        expect(injected).toBe(false)
    })

    it("should not inject if automata mode not activated via keyword", () => {
        state.cursors.automata.enabled = false
        state.currentTurn = 8

        const messages: any[] = []
        const injected = injectAutomataReflection(state, logger, config, messages)

        expect(injected).toBe(false)
    })

    it("should replace previous reflection message with new one", () => {
        state.cursors.automata.enabled = true
        state.currentTurn = 16
        state.cursors.automata.lastReflectionTurn = 8

        const messages: any[] = [
            {
                info: { id: "old-reflection", role: "user" },
                parts: [{ type: "text", text: "Strategic Reflection (Automata Mode)" }],
            },
        ]

        const injected = injectAutomataReflection(state, logger, config, messages)

        expect(injected).toBe(true)
        expect(messages.length).toBe(1)
        expect(messages[0].info.id).not.toBe("old-reflection")
    })
})

describe("Automata Mode: Removal", () => {
    let state: any
    let logger: any

    beforeEach(() => {
        state = createSessionState()
        logger = {
            info: vi.fn(),
            debug: vi.fn(),
            error: vi.fn(),
        }
    })

    it("should remove reflection message when requested", () => {
        const messages: any[] = [
            {
                info: { id: "reflection", role: "user" },
                parts: [{ type: "text", text: "Strategic Reflection (Automata Mode)" }],
            },
            {
                info: { id: "other", role: "user" },
                parts: [{ type: "text", text: "Regular message" }],
            },
        ]

        const removed = removeAutomataReflection(state, messages, logger)

        expect(removed).toBe(true)
        expect(messages.length).toBe(1)
        expect(messages[0].info.id).toBe("other")
    })
})
