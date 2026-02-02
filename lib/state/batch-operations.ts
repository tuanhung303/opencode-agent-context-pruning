import { hashObject } from "../utils/object"

type OperationType = "read" | "grep" | "glob"

interface BatchEntry<T = unknown> {
    id: string
    type: OperationType
    params: Record<string, unknown>
    timestamp: number
    resolve: (value: T) => void
    reject: (reason: Error) => void
}

interface DeduplicationEntry<T = unknown> {
    result: T
    timestamp: number
    hash: string
}

const pendingBatch = new Map<string, BatchEntry>()
const seenOperations = new Map<string, DeduplicationEntry>()
const BATCH_DEBOUNCE_MS = 50
const DEDUP_WINDOW_MS = 300000 // 5 minutes

let batchTimeout: ReturnType<typeof setTimeout> | null = null

/**
 * Check for duplicate operations within 5 minute window
 */
export function checkDuplicate<T>(
    type: OperationType,
    params: Record<string, unknown>,
): { duplicate: false } | { duplicate: true; result: T } {
    const hash = hashObject(type, params)
    const existing = seenOperations.get(hash)
    const now = Date.now()

    if (existing && now - existing.timestamp < DEDUP_WINDOW_MS) {
        // Update access time for LRU
        existing.timestamp = now
        return { duplicate: true, result: existing.result as T }
    }

    return { duplicate: false }
}

/**
 * Record operation result for deduplication
 */
export function recordOperation<T>(type: string, params: Record<string, unknown>, result: T): void {
    const hash = hashObject(type, params)
    seenOperations.set(hash, {
        result,
        timestamp: Date.now(),
        hash,
    })

    // Clean old entries if cache grows too large
    if (seenOperations.size > 1000) {
        cleanOldOperations()
    }
}

/**
 * Clean operations older than 5 minutes
 */
function cleanOldOperations(): number {
    const now = Date.now()
    let cleaned = 0
    for (const [hash, entry] of seenOperations.entries()) {
        if (now - entry.timestamp > DEDUP_WINDOW_MS) {
            seenOperations.delete(hash)
            cleaned++
        }
    }
    return cleaned
}

/**
 * Queue operation for batching
 */
export function queueBatchOperation<T>(
    id: string,
    type: OperationType,
    params: Record<string, unknown>,
): Promise<T> {
    return new Promise((resolve, reject) => {
        // Check dedup first
        const dedup = checkDuplicate<T>(type, params)
        if (dedup.duplicate) {
            resolve(dedup.result)
            return
        }

        // Add to pending batch
        pendingBatch.set(id, {
            id,
            type,
            params,
            timestamp: Date.now(),
            resolve: resolve as (value: unknown) => void,
            reject: reject as (reason: Error) => void,
        })

        // Schedule batch execution
        scheduleBatchExecution()
    })
}

function scheduleBatchExecution(): void {
    if (batchTimeout) {
        clearTimeout(batchTimeout)
    }

    batchTimeout = setTimeout(() => {
        executeBatch()
    }, BATCH_DEBOUNCE_MS)
}

/**
 * Execute batched operations
 */
async function executeBatch(): Promise<void> {
    if (pendingBatch.size === 0) return

    const batch = Array.from(pendingBatch.values())
    pendingBatch.clear()

    // Group by type for efficient execution
    const byType = new Map<string, BatchEntry[]>()
    for (const entry of batch) {
        const existing = byType.get(entry.type) || []
        existing.push(entry)
        byType.set(entry.type, existing)
    }

    // Execute each group
    for (const [, entries] of byType.entries()) {
        // Execute in parallel
        await Promise.all(
            entries.map(async (entry) => {
                try {
                    // This would call the actual tool implementation
                    // For now, we just resolve with a placeholder
                    // The actual implementation would integrate with the tool system
                    entry.resolve(null)
                } catch (err) {
                    const error = err instanceof Error ? err : new Error(String(err))
                    entry.reject(error)
                }
            }),
        )
    }
}

/**
 * Get deduplication statistics
 */
export function getDeduplicationStats(): {
    pendingBatch: number
    seenOperations: number
} {
    return {
        pendingBatch: pendingBatch.size,
        seenOperations: seenOperations.size,
    }
}

/**
 * Force flush pending batch
 */
export function flushBatch(): Promise<void> {
    if (batchTimeout) {
        clearTimeout(batchTimeout)
        batchTimeout = null
    }
    return executeBatch()
}
