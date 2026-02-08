import type { SessionState, WithParts } from "../state/types"
import type { PluginConfig } from "../config"
import type { Logger } from "../logger"
import { isMessageCompacted } from "../shared-utils"

/**
 * Format token count for display (e.g., 1234 -> "1.2K", 12345 -> "12.3K")
 */
function formatTokens(tokens: number): string {
    if (tokens < 1000) return String(tokens)
    return `${(tokens / 1000).toFixed(1)}K`
}

const REMINDER_TEMPLATE = `::synth::
---
## 🔖 Checkpoint
{context_section}

### 1. Reflect — What changed? Any new risks or blockers?
### 2. Update — Call \`todowrite\` to sync progress
### 3. Prune — Call \`context\` to discard/distill noise
Use prunable_hash values from \`<acp:tool>\`, \`<acp:message>\`, \`<acp:reasoning>\` tags to target content.
{stuck_task_guidance}
---
`

const CONTEXT_SECTION_TEMPLATE = `
⚡ **Context: {percent}% {status_emoji} {status_label}** — {remaining} tokens remaining
📋 {current_tokens} / {raw_window} ({raw_window} context window)
{model_line}
{savings_line}
`

const MODEL_LINE_TEMPLATE = `🤖 Model: {model_name} ({raw_window} context)`
const SAVINGS_LINE_TEMPLATE = `💾 Savings: {saved_tokens} tokens reclaimed via pruning`

const STUCK_TASK_GUIDANCE = `
### ⚠️ Stuck Task Detected

I've noticed a task has been in progress for {stuck_turns} turns. If you're finding it difficult to complete, consider:
- Breaking it into smaller, more specific subtasks
- Identifying blockers or dependencies that need resolution first
- Marking it as blocked and moving to another task

Use \`todowrite\` to split the task or update its status.
`

// Regex to match the reminder block (with any number of turns and optional prunable hashes)
// Updated to match optional ::synth:: prefix
// Note: Using [^\n]+ for hash lines to avoid catastrophic backtracking
const REMINDER_REGEX =
    /(?:^|\n)(?:::synth::\n)?---\n## 🔖 Checkpoint\n\nI've noticed your todo list hasn't been updated for \d+ turns\. Before continuing:\n\n### 1\. Reflect — What changed\? Any new risks or blockers\?\n### 2\. Update — Call `todowrite` to sync progress\n### 3\. Prune — Call `context` to discard\/distill noise\n(?:\n\*\*Prunable Outputs:\*\*\n(?:[a-z]+: [^\n]+\n)+)?\n?(?:### ⚠️ Stuck Task Detected\n\nI've noticed a task has been in progress for \d+ turns\. If you're finding it difficult to complete, consider:\n- Breaking it into smaller, more specific subtasks\n- Identifying blockers or dependencies that need resolution first\n- Marking it as blocked and moving to another task\n\nUse `todowrite` to split the task or update its status\.\n)?---\n?/g

/**
 * Build the context pressure section for the reminder.
 * Uses pre-computed state.contextPressure from hooks.ts.
 */
function buildContextSection(state: SessionState, config: PluginConfig): string {
    const cp = state.contextPressure
    const todoConfig = config.tools.todoReminder

    // Get raw window size for display
    const rawWindow = cp.effectiveLimit > 0 ? cp.effectiveLimit : todoConfig.fallbackContextWindow

    // Build model line (only if we detected a model)
    let modelLine = ""
    if (cp.modelMatch) {
        modelLine = MODEL_LINE_TEMPLATE.replace("{model_name}", cp.modelMatch).replace(
            "{raw_window}",
            formatTokens(rawWindow),
        )
    }

    // Build savings line (only if we've saved tokens)
    let savingsLine = ""
    if (cp.totalSaved > 0) {
        savingsLine = SAVINGS_LINE_TEMPLATE.replace("{saved_tokens}", formatTokens(cp.totalSaved))
    }

    return CONTEXT_SECTION_TEMPLATE.replace("{percent}", String(cp.contextPercent))
        .replace("{status_emoji}", cp.statusEmoji)
        .replace("{status_label}", cp.statusLabel)
        .replace("{remaining}", formatTokens(cp.remaining))
        .replace("{current_tokens}", formatTokens(cp.contextTokens))
        .replace("{raw_window}", formatTokens(rawWindow))
        .replace("{model_line}", modelLine)
        .replace("{savings_line}", savingsLine)
        .trim()
}

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
                if (part?.type === "text" && (part as any).text) {
                    const originalText = (part as any).text
                    const newText = originalText.replace(REMINDER_REGEX, "")
                    if (newText !== originalText) {
                        ;(part as any).text = newText
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
    logger: Logger,
    config: PluginConfig,
    messages: WithParts[],
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
    const turnsSinceTodo = state.currentTurn - state.cursors.todo.lastTurn
    const initialTurns = config.tools.todoReminder.initialTurns ?? 6
    const repeatTurns = config.tools.todoReminder.repeatTurns ?? 4

    logger.info(
        `[TODO-REMINDER DEBUG] currentTurn=${state.currentTurn}, lastTodoTurn=${state.cursors.todo.lastTurn}, turnsSinceTodo=${turnsSinceTodo}, lastReminderTurn=${state.cursors.todo.lastReminderTurn}, initialTurns=${initialTurns}, repeatTurns=${repeatTurns}`,
    )

    // Check if we should remind
    let shouldRemind = false

    if (state.cursors.todo.lastReminderTurn === 0) {
        // First reminder: after initialTurns
        shouldRemind = turnsSinceTodo >= initialTurns
    } else {
        // Subsequent reminders: every repeatTurns after last reminder
        const turnsSinceReminder = state.currentTurn - state.cursors.todo.lastReminderTurn
        shouldRemind = turnsSinceReminder >= repeatTurns
    }

    if (!shouldRemind) {
        logger.debug(
            `Skipping reminder - turnsSinceTodo: ${turnsSinceTodo}, lastReminderTurn: ${state.cursors.todo.lastReminderTurn}`,
        )
        return false
    }

    // Remove any existing reminder messages first (ensure only one exists)
    removeTodoReminder(state, messages, logger)

    // Build context pressure section from pre-computed state
    const contextSection = buildContextSection(state, config)

    // Detect stuck tasks (in_progress for too long)
    const stuckTaskTurns = config.tools.todoReminder.stuckTaskTurns ?? 12
    const stuckTasks = state.todos.filter(
        (t) =>
            t.status === "in_progress" &&
            t.inProgressSince !== undefined &&
            state.currentTurn - (t.inProgressSince as number) >= stuckTaskTurns,
    )

    // Generate stuck task guidance if any task is stuck
    let stuckTaskSection = ""
    if (stuckTasks.length > 0) {
        const longestStuck = Math.max(
            ...stuckTasks.map(
                (t) => state.currentTurn - ((t.inProgressSince as number) ?? state.currentTurn),
            ),
        )
        stuckTaskSection = STUCK_TASK_GUIDANCE.replace("{stuck_turns}", String(longestStuck))
        logger.info(`Detected ${stuckTasks.length} stuck task(s), longest: ${longestStuck} turns`)
    }

    // Create reminder content
    const reminderContent = REMINDER_TEMPLATE.replace("{context_section}", contextSection).replace(
        "{stuck_task_guidance}",
        stuckTaskSection,
    )

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
    state.cursors.todo.lastReminderTurn = state.currentTurn

    logger.info(`Injected todo reminder after ${turnsSinceTodo} turns without todo update`)

    return true
}

/**
 * Check if a message is a todo reminder message.
 */
function isTodoReminderMessage(message: WithParts): boolean {
    if (!message.parts) return false
    for (const part of message.parts) {
        if (part?.type === "text" && (part as any).text) {
            if ((part as any).text.includes("🔖 Checkpoint")) {
                return true
            }
        }
    }
    return false
}
