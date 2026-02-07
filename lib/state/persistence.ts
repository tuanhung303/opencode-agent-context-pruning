/**
 * State persistence module for ACP plugin.
 * Persists pruned tool IDs across sessions so they survive OpenCode restarts.
 * Storage location: ~/.local/share/opencode/storage/plugin/acp/{sessionId}.json
 *
 * Uses atomic writes (temp file + rename) to prevent data corruption.
 */

import * as fs from "fs/promises"
import { existsSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import type { SessionState, SessionStats, Prune, DiscardStats, TodoItem } from "./types"
import type { Logger } from "../logger"

export interface PersistedSessionState {
    sessionName?: string
    prune: Prune
    stats: SessionStats
    lastUpdated: string

    // Grouped cursors
    cursors?: {
        todo: {
            lastTurn: number
            lastReminderTurn: number
            lastWriteCallId: string | null
            lastReadCallId: string | null
        }
        context: {
            lastCallId: string | null
        }
        automata: {
            enabled: boolean
            lastTurn: number
            lastReflectionTurn: number
        }
        files: {
            pathToCallIds: Record<string, string[]>
        }
    }

    // Unified registry
    hashRegistry?: {
        calls: Record<string, string>
        callIds: Record<string, string>
        messages: Record<string, string>
        messagePartIds: Record<string, string>
        reasoning: Record<string, string>
        reasoningPartIds: Record<string, string>
        fileParts: Record<string, string>
    }

    discardHistory?: DiscardStats[]
    todos?: TodoItem[]

    // Legacy fields for migration check
    lastTodoTurn?: number
    hashToCallId?: Record<string, string>
}

const STORAGE_DIR = join(homedir(), ".local", "share", "opencode", "storage", "plugin", "acp")

// Write lock to prevent concurrent writes to the same file
const writeLocks = new Map<string, Promise<void>>()

async function ensureStorageDir(): Promise<void> {
    if (!existsSync(STORAGE_DIR)) {
        await fs.mkdir(STORAGE_DIR, { recursive: true })
    }
}

function getSessionFilePath(sessionId: string): string {
    return join(STORAGE_DIR, `${sessionId}.json`)
}

/**
 * Atomically write content to a file using temp file + rename pattern.
 * This prevents data corruption from partial writes or crashes.
 */
async function atomicWriteFile(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.tmp`

    try {
        // Write to temp file first
        await fs.writeFile(tempPath, content, "utf-8")

        // Atomic rename (on POSIX systems, rename is atomic)
        await fs.rename(tempPath, filePath)
    } catch (error) {
        // Clean up temp file on failure
        try {
            await fs.unlink(tempPath)
        } catch {
            // Ignore cleanup errors
        }
        throw error
    }
}

/**
 * Acquire a write lock for a specific file path.
 * Ensures only one write operation happens at a time per file.
 */
async function withWriteLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    // Wait for any existing write to complete
    const existingLock = writeLocks.get(filePath)
    if (existingLock) {
        await existingLock.catch(() => {}) // Ignore errors from previous writes
    }

    // Create new lock
    let resolve: () => void
    const lockPromise = new Promise<void>((r) => {
        resolve = r
    })
    writeLocks.set(filePath, lockPromise)

    try {
        return await fn()
    } finally {
        resolve!()
        writeLocks.delete(filePath)
    }
}

export async function saveSessionState(
    sessionState: SessionState,
    logger: Logger,
    sessionName?: string,
): Promise<void> {
    try {
        if (!sessionState.sessionId) {
            return
        }

        await ensureStorageDir()

        const state: PersistedSessionState = {
            sessionName: sessionName,
            prune: sessionState.prune,
            stats: sessionState.stats,
            lastUpdated: new Date().toISOString(),
            hashRegistry: {
                calls: Object.fromEntries(sessionState.hashRegistry.calls),
                callIds: Object.fromEntries(sessionState.hashRegistry.callIds),
                messages: Object.fromEntries(sessionState.hashRegistry.messages),
                messagePartIds: Object.fromEntries(sessionState.hashRegistry.messagePartIds),
                reasoning: Object.fromEntries(sessionState.hashRegistry.reasoning),
                reasoningPartIds: Object.fromEntries(sessionState.hashRegistry.reasoningPartIds),
                fileParts: Object.fromEntries(sessionState.hashRegistry.fileParts),
            },
            cursors: {
                todo: sessionState.cursors.todo,
                context: sessionState.cursors.context,
                automata: sessionState.cursors.automata,
                files: {
                    pathToCallIds: Object.fromEntries(
                        Array.from(sessionState.cursors.files.pathToCallIds.entries()).map(
                            ([k, v]) => [k, Array.from(v)],
                        ),
                    ),
                },
            },
            discardHistory: sessionState.discardHistory,
            todos: sessionState.todos,
        }

        const filePath = getSessionFilePath(sessionState.sessionId)
        const content = JSON.stringify(state, null, 2)

        // Use write lock and atomic write to prevent corruption
        await withWriteLock(filePath, async () => {
            await atomicWriteFile(filePath, content)
        })

        logger.info("Saved session state to disk", {
            sessionId: sessionState.sessionId,
            totalTokensSaved: state.stats.totalPruneTokens,
        })
    } catch (error: any) {
        logger.error("Failed to save session state", {
            sessionId: sessionState.sessionId,
            error: error?.message,
        })
    }
}

export async function loadSessionState(
    sessionId: string,
    logger: Logger,
): Promise<PersistedSessionState | null> {
    try {
        const filePath = getSessionFilePath(sessionId)

        if (!existsSync(filePath)) {
            return null
        }

        const content = await fs.readFile(filePath, "utf-8")
        const state = JSON.parse(content) as PersistedSessionState

        if (!state || !state.prune || !Array.isArray(state.prune.toolIds) || !state.stats) {
            logger.warn("Invalid session state file, ignoring", {
                sessionId: sessionId,
            })
            return null
        }

        logger.info("Loaded session state from disk", {
            sessionId: sessionId,
        })

        return state
    } catch (error: any) {
        logger.warn("Failed to load session state", {
            sessionId: sessionId,
            error: error?.message,
        })
        return null
    }
}

export interface AggregatedStats {
    totalTokens: number
    totalTools: number
    sessionCount: number
}

export async function loadAllSessionStats(logger: Logger): Promise<AggregatedStats> {
    const result: AggregatedStats = {
        totalTokens: 0,
        totalTools: 0,
        sessionCount: 0,
    }

    try {
        if (!existsSync(STORAGE_DIR)) {
            return result
        }

        const files = await fs.readdir(STORAGE_DIR)
        const jsonFiles = files.filter((f) => f.endsWith(".json"))

        for (const file of jsonFiles) {
            try {
                const filePath = join(STORAGE_DIR, file)
                const content = await fs.readFile(filePath, "utf-8")
                const state = JSON.parse(content) as PersistedSessionState

                if (state?.stats?.totalPruneTokens && state?.prune?.toolIds) {
                    result.totalTokens += state.stats.totalPruneTokens
                    result.totalTools += state.prune.toolIds.length
                    result.sessionCount++
                }
            } catch {
                // Skip invalid files
            }
        }

        logger.debug("Loaded all-time stats", result)
    } catch (error: any) {
        logger.warn("Failed to load all-time stats", { error: error?.message })
    }

    return result
}
