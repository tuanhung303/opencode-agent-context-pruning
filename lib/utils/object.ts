/**
 * Type-safe object utilities for stable serialization and comparison.
 * Consolidates duplicate implementations from messages/utils.ts, strategies/deduplication.ts, and state/batch-operations.ts.
 */

/**
 * Recursively sorts object keys for deterministic serialization.
 * Handles nested objects and arrays.
 */
export function sortObjectKeys<T>(obj: T): T {
    if (obj === null || obj === undefined) {
        return obj
    }
    if (typeof obj !== "object") {
        return obj
    }
    if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys) as T
    }
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key])
    }
    return sorted as T
}

/**
 * Stable JSON stringify with sorted keys for deterministic hashing.
 * Ensures that {a: 1, b: 2} and {b: 2, a: 1} produce the same string.
 */
export function stableStringify(obj: unknown): string {
    if (obj === null || obj === undefined) {
        return JSON.stringify(obj)
    }
    if (typeof obj !== "object") {
        return JSON.stringify(obj)
    }
    if (Array.isArray(obj)) {
        return "[" + obj.map(stableStringify).join(",") + "]"
    }
    const keys = Object.keys(obj).sort()
    return (
        "{" +
        keys
            .map(
                (k) =>
                    `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`,
            )
            .join(",") +
        "}"
    )
}

/**
 * Normalizes parameters by removing undefined/null values.
 * Useful for creating consistent signatures.
 */
export function normalizeParams<T extends Record<string, unknown>>(
    params: T | null | undefined,
): Partial<T> | null {
    if (params === null || params === undefined) {
        return null
    }
    if (typeof params !== "object" || Array.isArray(params)) {
        return params as Partial<T>
    }
    const normalized: Partial<T> = {}
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            ;(normalized as Record<string, unknown>)[key] = value
        }
    }
    return normalized
}

/**
 * Simple hash function for operation deduplication.
 * Returns a short hash string suitable for cache keys.
 */
export function hashObject(type: string, obj: unknown): string {
    const normalized = stableStringify({ type, params: obj })
    let hash = 0
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i)
        hash = ((hash << 5) - hash + char) | 0
    }
    return `${type}_${hash.toString(36)}`
}
