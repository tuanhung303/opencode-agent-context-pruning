import type { SessionState, WithParts } from "../state/types"
import type { Logger } from "../logger"
import type { PluginConfig } from "../config"

const REFLECTION_TEMPLATE = `
---
🤖 **Strategic Reflection** (Automata Mode)
Please take a moment to reflect on your current progress and strategy:

1. **Review Progress**: Assess current progress against the plan and identify any gaps.
2. **Discover Objectives**: Proactively find new objectives or features to improve the project.
3. **Re-prioritize**: Re-order or update your tasks based on new context and discoveries.
4. **Suggest Optimizations**: Identify refactoring or optimization opportunities in the codebase.
---
`

/**
 * Detect if automata mode should be activated based on user messages.
 * Once activated, it stays active for the session.
 */
export function detectAutomataActivation(
    state: SessionState,
    messages: WithParts[],
    logger: Logger,
): boolean {
    if (state.automataEnabled) {
        return true
    }

    // Check recent user messages for the keyword
    for (const msg of messages) {
        if (msg.info.role !== "user") continue

        const parts = msg.parts || []
        for (const part of parts) {
            if (part.type === "text" && part.text) {
                if (part.text.toLowerCase().includes("automata")) {
                    state.automataEnabled = true
                    state.lastAutomataTurn = state.currentTurn
                    logger.info(`Automata mode activated at turn ${state.currentTurn}`)
                    return true
                }
            }
        }
    }

    return false
}

/**
 * Inject a strategic reflection message if automata mode is active and conditions are met.
 */
export function injectAutomataReflection(
    state: SessionState,
    config: PluginConfig,
    messages: WithParts[],
    logger: Logger,
): boolean {
    if (!state.automataEnabled || !config.tools?.automataMode?.enabled) {
        return false
    }

    const initialTurns = config.tools.automataMode.initialTurns ?? 8
    const turnsSinceLastAction =
        state.lastReflectionTurn > 0
            ? state.currentTurn - state.lastReflectionTurn
            : state.currentTurn - state.lastAutomataTurn

    if (turnsSinceLastAction < initialTurns) {
        return false
    }

    // Remove any existing reflection message first
    removeAutomataReflection(state, messages, logger)

    // Inject new reflection message
    const reflectionMessage: WithParts = {
        info: {
            id: `automata-reflection-${Date.now()}`,
            role: "user",
            time: { created: Date.now() },
        },
        parts: [
            {
                type: "text",
                text: REFLECTION_TEMPLATE.trim(),
            } as any,
        ],
    } as WithParts

    messages.push(reflectionMessage)
    state.lastReflectionTurn = state.currentTurn
    logger.info(`Injected automata reflection at turn ${state.currentTurn}`)

    return true
}

/**
 * Remove any automata reflection message from the context.
 */
export function removeAutomataReflection(
    state: SessionState,
    messages: WithParts[],
    logger: Logger,
): boolean {
    let removed = false

    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (msg?.info?.role === "user" && isAutomataReflectionMessage(msg)) {
            messages.splice(i, 1)
            removed = true
            logger.info("Removed automata reflection message")
        }
    }

    return removed
}

/**
 * Check if a message is an automata reflection message.
 */
function isAutomataReflectionMessage(message: WithParts): boolean {
    if (!message.parts) return false
    for (const part of message.parts) {
        if (part?.type === "text" && part.text) {
            if (part.text.includes("Strategic Reflection") && part.text.includes("Automata Mode")) {
                return true
            }
        }
    }
    return false
}
