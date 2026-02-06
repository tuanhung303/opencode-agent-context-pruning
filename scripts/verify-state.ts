import { readFile, readdir } from "fs/promises"
import { join } from "path"
import type { SessionState } from "../lib/state/types"
import { deserializeState, getACPStatePath } from "../tests/fixtures/seed-state"

export interface VerifyResult {
    valid: boolean
    errors: string[]
    state: SessionState | null
}

/**
 * Reads and verifies ACP state from XDG location.
 */
export async function verifyACPState(
    xdgDataHome: string,
    sessionId: string,
): Promise<VerifyResult> {
    const errors: string[] = []
    const path = getACPStatePath(xdgDataHome, sessionId)

    try {
        const json = await readFile(path, "utf-8")
        const state = deserializeState(json)

        // Basic structure validation
        if (!state.sessionId) {
            errors.push("Missing sessionId")
        }
        if (!state.prune) {
            errors.push("Missing prune object")
        }
        if (!state.hashRegistry) {
            errors.push("Missing hashRegistry")
        }

        return {
            valid: errors.length === 0,
            errors,
            state,
        }
    } catch (err) {
        return {
            valid: false,
            errors: [`Failed to read state: ${err}`],
            state: null,
        }
    }
}

/**
 * Lists all ACP session state files in XDG location.
 */
export async function listACPSessions(xdgDataHome: string): Promise<string[]> {
    const dir = join(xdgDataHome, "opencode", "storage", "plugin", "acp")
    try {
        const files = await readdir(dir)
        return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""))
    } catch {
        return []
    }
}

/**
 * Verifies that specific tool calls have been pruned.
 */
export function verifyToolsPruned(
    state: SessionState,
    expectedCallIds: string[],
): { pass: boolean; missing: string[] } {
    const missing = expectedCallIds.filter((id) => !state.prune.toolIds.includes(id))
    return {
        pass: missing.length === 0,
        missing,
    }
}

/**
 * Verifies that specific message parts have been pruned.
 */
export function verifyMessagePartsPruned(
    state: SessionState,
    expectedPartIds: string[],
): { pass: boolean; missing: string[] } {
    const missing = expectedPartIds.filter((id) => !state.prune.messagePartIds.includes(id))
    return {
        pass: missing.length === 0,
        missing,
    }
}

/**
 * Verifies that specific reasoning parts have been pruned.
 */
export function verifyReasoningPartsPruned(
    state: SessionState,
    expectedPartIds: string[],
): { pass: boolean; missing: string[] } {
    const missing = expectedPartIds.filter((id) => !state.prune.reasoningPartIds.includes(id))
    return {
        pass: missing.length === 0,
        missing,
    }
}

/**
 * Verifies hash registry contains expected mappings.
 */
export function verifyHashRegistry(
    state: SessionState,
    expectedHashes: Array<{ hash: string; type: "tool" | "message" | "reasoning" }>,
): { pass: boolean; missing: Array<{ hash: string; type: string }> } {
    const missing: Array<{ hash: string; type: string }> = []

    for (const { hash, type } of expectedHashes) {
        if (type === "tool" && !state.hashRegistry.calls.has(hash)) {
            missing.push({ hash, type })
        }
        if (type === "message" && !state.hashRegistry.messages.has(hash)) {
            missing.push({ hash, type })
        }
        if (type === "reasoning" && !state.hashRegistry.reasoning.has(hash)) {
            missing.push({ hash, type })
        }
    }

    return {
        pass: missing.length === 0,
        missing,
    }
}

/**
 * Verifies todo list state.
 */
export function verifyTodos(
    state: SessionState,
    expected: {
        count?: number
        hasInProgress?: boolean
        completedCount?: number
    },
): { pass: boolean; errors: string[] } {
    const errors: string[] = []

    if (expected.count !== undefined && state.todos.length !== expected.count) {
        errors.push(`Expected ${expected.count} todos, got ${state.todos.length}`)
    }

    if (expected.hasInProgress !== undefined) {
        const hasInProgress = state.todos.some((t) => t.status === "in_progress")
        if (hasInProgress !== expected.hasInProgress) {
            errors.push(`Expected hasInProgress=${expected.hasInProgress}, got ${hasInProgress}`)
        }
    }

    if (expected.completedCount !== undefined) {
        const completed = state.todos.filter((t) => t.status === "completed").length
        if (completed !== expected.completedCount) {
            errors.push(`Expected ${expected.completedCount} completed todos, got ${completed}`)
        }
    }

    return {
        pass: errors.length === 0,
        errors,
    }
}

/**
 * Verifies stats have been updated.
 */
export function verifyStats(
    state: SessionState,
    expected: {
        minPruneTokens?: number
        minPruneMessages?: number
    },
): { pass: boolean; errors: string[] } {
    const errors: string[] = []

    if (
        expected.minPruneTokens !== undefined &&
        state.stats.totalPruneTokens < expected.minPruneTokens
    ) {
        errors.push(
            `Expected at least ${expected.minPruneTokens} prune tokens, got ${state.stats.totalPruneTokens}`,
        )
    }

    if (
        expected.minPruneMessages !== undefined &&
        state.stats.totalPruneMessages < expected.minPruneMessages
    ) {
        errors.push(
            `Expected at least ${expected.minPruneMessages} prune messages, got ${state.stats.totalPruneMessages}`,
        )
    }

    return {
        pass: errors.length === 0,
        errors,
    }
}

/**
 * Comprehensive state verification for E2E tests.
 */
export interface E2EVerification {
    prunedTools?: string[]
    prunedMessages?: string[]
    prunedReasoning?: string[]
    registeredHashes?: Array<{ hash: string; type: "tool" | "message" | "reasoning" }>
    todos?: { count?: number; hasInProgress?: boolean; completedCount?: number }
    stats?: { minPruneTokens?: number; minPruneMessages?: number }
}

export function verifyE2EState(
    state: SessionState,
    expected: E2EVerification,
): { pass: boolean; errors: string[] } {
    const errors: string[] = []

    if (expected.prunedTools) {
        const result = verifyToolsPruned(state, expected.prunedTools)
        if (!result.pass) {
            errors.push(`Missing pruned tools: ${result.missing.join(", ")}`)
        }
    }

    if (expected.prunedMessages) {
        const result = verifyMessagePartsPruned(state, expected.prunedMessages)
        if (!result.pass) {
            errors.push(`Missing pruned messages: ${result.missing.join(", ")}`)
        }
    }

    if (expected.prunedReasoning) {
        const result = verifyReasoningPartsPruned(state, expected.prunedReasoning)
        if (!result.pass) {
            errors.push(`Missing pruned reasoning: ${result.missing.join(", ")}`)
        }
    }

    if (expected.registeredHashes) {
        const result = verifyHashRegistry(state, expected.registeredHashes)
        if (!result.pass) {
            errors.push(
                `Missing hashes: ${result.missing.map((m) => `${m.type}:${m.hash}`).join(", ")}`,
            )
        }
    }

    if (expected.todos) {
        const result = verifyTodos(state, expected.todos)
        errors.push(...result.errors)
    }

    if (expected.stats) {
        const result = verifyStats(state, expected.stats)
        errors.push(...result.errors)
    }

    return {
        pass: errors.length === 0,
        errors,
    }
}
