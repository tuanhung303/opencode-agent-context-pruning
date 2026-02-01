import type { SessionState } from "./types"

interface BatchEntry {
    id: string
    type: "read" | "grep" | "glob"
    params: any
    timestamp: number
    resolve: (value: any) => void
    reject: (reason: any) => void
}

interface DeduplicationEntry {
    result: any
    timestamp: number
    hash: string
}

const pendingBatch = new Map<string, BatchEntry>()
const seenOperations = new Map<string, DeduplicationEntry>()
const BATCH_DEBOUNCE_MS = 50
const DEDUP_WINDOW_MS = 300000 // 5 minutes

let batchTimeout: ReturnType<typeof setTimeout> | null = null

/**
 * Generate hash for operation deduplication
 */
function hashOperation(type: string, params: any): string {
    const normalized = JSON.stringify({ type, params: sortKeys(params) })
    let hash = 0
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i)
        hash = ((hash << 5) - hash + char) | 0
    }
    return `${type}_${hash.toString(36)}`
}

function sortKeys(obj: any): any {
    if (obj === null || typeof obj !== "object") return obj
    if (Array.isArray(obj)) return obj.map(sortKeys)
    return Object.keys(obj)
        .sort()
        .reduce((acc, key) => {
            acc[key] = sortKeys(obj[key])
            return acc
        }, {} as any)
}

/**
 * Check for duplicate operations within 5 minute window
 */
export function checkDuplicate<T>(
    type: "read" | "grep" | "glob",
    params: any,
): { duplicate: false } | { duplicate: true; result: T } {
    const hash = hashOperation(type, params)
    const existing = seenOperations.get(hash)
    const now = Date.now()

    if (existing && now - existing.timestamp < DEDUP_WINDOW_MS) {
        // Update access time for LRU
        existing.timestamp = now
        return { duplicate: true, result: existing.result }
    }

    return { duplicate: false }
}

/**
 * Record operation result for deduplication
 */
export function recordOperation<T>(type: string, params: any, result: T): void {
    const hash = hashOperation(type, params)
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
    type: "read" | "grep" | "glob",
    params: any,
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
            resolve,
            reject,
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
    for (const [type, entries] of byType.entries()) {
        // Execute in parallel
        await Promise.all(
            entries.map(async (entry) => {
                try {
                    // This would call the actual tool implementation
                    // For now, we just resolve with a placeholder
                    // The actual implementation would integrate with the tool system
                    entry.resolve(null)
                } catch (error) {
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
