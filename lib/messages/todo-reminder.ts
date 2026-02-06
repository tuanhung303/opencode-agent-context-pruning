import type { SessionState, WithParts } from "../state/types"
import type { PluginConfig } from "../config"
import type { Logger } from "../logger"
import { isMessageCompacted } from "../shared-utils"
import { groupHashesByToolName, formatHashInventory } from "./utils"
import { calculateTotalContextTokens, rankPruningCandidates } from "../strategies/utils"

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
{context_pressure}
I've noticed your todo list hasn't been updated for {turns} turns. Before continuing:

### 1. Reflect — What changed? Any new risks or blockers?
### 2. Update — Call \`todowrite\` to sync progress
### 3. Prune — Call \`context\` to discard/distill noise
Use hash tags from outputs (\`<tool_hash>\`, \`<message_hash>\`, \`<reasoning_hash>\`) to target content.
{prunable_hashes}{stuck_task_guidance}
---
`

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

    // Calculate context pressure
    const currentTokens = calculateTotalContextTokens(state, messages)
    const maxTokens = config.tools.todoReminder.maxContextTokens ?? 100000 // Default 100K
    const pressurePercent = Math.min(100, Math.round((currentTokens / maxTokens) * 100))
    const contextPressure = `\n⚡ **Context: ${pressurePercent}%** (${formatTokens(currentTokens)}/${formatTokens(maxTokens)} tokens)\n`

    // Generate ranked pruning suggestions with token estimates
    const protectedTools = config.tools?.settings?.protectedTools ?? []
    const candidates = rankPruningCandidates(state, messages, protectedTools, 5)

    let prunableSection = "\n"
    if (candidates.length > 0) {
        const lines = candidates.map((c) => {
            const target = c.target ? `(${c.target})` : ""
            return `- ${c.toolName}${target}: \`${c.hash}\` (~${formatTokens(c.estimatedTokens)} tokens)`
        })
        const totalSavings = candidates.reduce((sum, c) => sum + c.estimatedTokens, 0)
        prunableSection = `\n**Top Pruning Candidates** (potential savings: ~${formatTokens(totalSavings)} tokens):\n${lines.join("\n")}\n`
    } else {
        // Fallback to simple hash inventory if no ranked candidates
        const grouped = groupHashesByToolName(state)
        const hashInventory = formatHashInventory(grouped)
        if (hashInventory) {
            prunableSection = `\n**Prunable Outputs:**\n${hashInventory}\n`
        }
    }

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
    const reminderContent = REMINDER_TEMPLATE.replace("{turns}", String(turnsSinceTodo))
        .replace("{prunable_hashes}", prunableSection)
        .replace("{stuck_task_guidance}", stuckTaskSection)

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
