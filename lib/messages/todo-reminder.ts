import type { SessionState, WithParts } from "../state/types"
import type { PluginConfig } from "../config"
import type { Logger } from "../logger"
import { isMessageCompacted } from "../shared-utils"

const REMINDER_TEMPLATE = `
---
📋 **Todo Review Reminder** (not updated for {turns} turns)
Before moving to the next task, please review your todo list and update if needed.
Use \`todoread\` to check status, then \`todowrite\` to mark progress.
---
`

// Regex to match the reminder block (with any number of turns)
const REMINDER_REGEX =
    /\n?---\n📋 \*\*Todo Review Reminder\*\* \(not updated for \d+ turns\)\nBefore moving to the next task, please review your todo list and update if needed\.\nUse `todoread` to check status, then `todowrite` to mark progress\.\n---\n?/g

/**
 * Remove any todo reminder from messages.
 * Called when todowrite is detected to clean up the reminder.
 */
export function removeTodoReminder(
    state: SessionState,
    messages: WithParts[],
    logger: Logger,
): boolean {
    let removed = false

    // Remove reminder from assistant messages (legacy) and user reminder messages
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (!msg || isMessageCompacted(state, msg)) {
            continue
        }

        // Check for user reminder messages (new format) and remove them
        if (msg.info?.role === "user" && isTodoReminderMessage(msg)) {
            messages.splice(i, 1)
            removed = true
            logger.info("Removed todo reminder user message")
            continue
        }

        // Check for legacy reminder in assistant messages
        if (msg.info?.role === "assistant") {
            const parts = Array.isArray(msg.parts) ? msg.parts : []
            for (const part of parts) {
                if (part?.type === "text" && part.text) {
                    const originalText = part.text
                    const newText = originalText.replace(REMINDER_REGEX, "")
                    if (newText !== originalText) {
                        part.text = newText
                        removed = true
                        logger.info("Removed todo reminder from assistant message")
                    }
                }
            }
        }
    }

    return removed
}

/**
 * Inject a todo reminder as a user message if conditions are met.
 * Returns true if a reminder was injected, false otherwise.
 */
export function injectTodoReminder(
    state: SessionState,
    config: PluginConfig,
    messages: WithParts[],
    logger: Logger,
): boolean {
    // Check if feature enabled
    if (!config.tools?.todoReminder?.enabled) {
        return false
    }

    // Check if there are pending/in_progress todos (only skip if todos exist but are all completed)
    const pendingTodos = state.todos.filter(
        (t) => t.status === "pending" || t.status === "in_progress",
    )
    if (state.todos.length > 0 && pendingTodos.length === 0) {
        logger.debug("All todos completed, skipping reminder")
        return false
    }

    // Calculate turns since last todo update
    const turnsSinceTodo = state.currentTurn - state.lastTodoTurn
    const initialTurns = config.tools.todoReminder.initialTurns ?? 6
    const repeatTurns = config.tools.todoReminder.repeatTurns ?? 4

    logger.info(
        `[TODO-REMINDER DEBUG] currentTurn=${state.currentTurn}, lastTodoTurn=${state.lastTodoTurn}, turnsSinceTodo=${turnsSinceTodo}, lastReminderTurn=${state.lastReminderTurn}, initialTurns=${initialTurns}, repeatTurns=${repeatTurns}`,
    )

    // Check if we should remind
    let shouldRemind = false

    if (state.lastReminderTurn === 0) {
        // First reminder: after initialTurns
        shouldRemind = turnsSinceTodo >= initialTurns
    } else {
        // Subsequent reminders: every repeatTurns after last reminder
        const turnsSinceReminder = state.currentTurn - state.lastReminderTurn
        shouldRemind = turnsSinceReminder >= repeatTurns
    }

    if (!shouldRemind) {
        logger.debug(
            `Skipping reminder - turnsSinceTodo: ${turnsSinceTodo}, lastReminderTurn: ${state.lastReminderTurn}`,
        )
        return false
    }

    // Check if we already have a reminder message at the end
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.info.role === "user" && isTodoReminderMessage(lastMessage)) {
        logger.debug("Reminder message already exists at the end")
        return false
    }

    // Create reminder content
    const reminderContent = REMINDER_TEMPLATE.replace("{turns}", String(turnsSinceTodo))

    // Create a new user message with the reminder
    const reminderMessage: WithParts = {
        info: {
            id: `todo-reminder-${Date.now()}`,
            role: "user",
            time: { created: Date.now() },
        },
        parts: [
            {
                type: "text",
                text: reminderContent.trim(),
            } as any,
        ],
    } as WithParts

    // Add the reminder message to the end
    messages.push(reminderMessage)

    // Update state
    state.lastReminderTurn = state.currentTurn

    logger.info(`Injected todo reminder after ${turnsSinceTodo} turns without todo update`)

    return true
}

/**
 * Check if a message is a todo reminder message.
 */
function isTodoReminderMessage(message: WithParts): boolean {
    if (!message.parts) return false
    for (const part of message.parts) {
        if (part?.type === "text" && part.text) {
            if (part.text.includes("Todo Review Reminder")) {
                return true
            }
        }
    }
    return false
}
