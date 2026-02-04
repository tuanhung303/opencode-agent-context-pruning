import { describe, it, expect, beforeEach, vi } from "vitest"
import { createChatMessageTransformHandler } from "../../lib/hooks"
import { createSessionState } from "../../lib/state/state"
import * as stateModule from "../../lib/state/state"

describe("Integration: Automata Hook", () => {
    let state: any
    let logger: any
    let config: any
    let client: any

    beforeEach(() => {
        state = createSessionState()
        logger = {
            info: vi.fn(),
            debug: vi.fn(),
            error: vi.fn(),
            saveContext: vi.fn().mockResolvedValue(undefined),
        }
        config = {
            enabled: true,
            tools: {
                settings: { protectedTools: [] },
                discard: { enabled: true },
                distill: { enabled: true },
                todoReminder: { enabled: true, initialTurns: 2, repeatTurns: 2 },
                automataMode: { enabled: true, initialTurns: 2 },
            },
            strategies: {
                deduplication: { enabled: false },
                supersedeWrites: { enabled: false },
                purgeErrors: { enabled: false },
                truncation: { enabled: false },
                thinkingCompression: { enabled: false },
            },
        }
        client = {
            session: {
                messages: vi.fn().mockResolvedValue({ data: [] }),
            },
        }
    })

    it("should inject both todo reminder and automata reflection in correct order", async () => {
        // Mock checkSession to prevent it from resetting state
        vi.spyOn(stateModule, "checkSession").mockResolvedValue(undefined)

        state.sessionId = "test-session"
        state.cursors.automata.enabled = true
        state.currentTurn = 4
        state.todos = [{ id: "1", content: "Test", status: "pending", priority: "high" }]
        state.cursors.todo.lastTurn = 0
        state.cursors.automata.lastTurn = 0

        const output = {
            messages: [
                {
                    info: {
                        id: "msg1",
                        role: "user",
                        sessionID: "test-session",
                        time: { created: 100 },
                    },
                    parts: [{ type: "text", text: "Hello" }],
                },
            ],
        }

        const handler = createChatMessageTransformHandler(client, state, logger, config)
        await handler({}, output)

        // Final message count: 1 original + 1 todo reminder + 1 automata reflection = 3
        expect(output.messages.length).toBe(3)

        // Verify order: Original -> Todo Reminder -> Automata Reflection
        expect(output.messages[1].parts[0].text).toContain("🔖 Checkpoint")
        expect(output.messages[2].parts[0].text).toContain("Strategic Reflection")
    })
})
