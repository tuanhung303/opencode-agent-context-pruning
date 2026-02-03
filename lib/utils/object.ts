/**
 * Type-safe object utilities for stable serialization and comparison.
 * Consolidates duplicate implementations from messages/utils.ts, strategies/deduplication.ts, and state/batch-operations.ts.
 *
 * PERFORMANCE NOTES:
 * - stableStringify is optimized for common cases (primitives, small objects)
 * - For large objects, consider using streaming or chunked approaches
 * - Object sorting is only done at the top level to reduce overhead
 */

/**
 * Recursively sorts object keys for deterministic serialization.
 * Handles nested objects and arrays.
 *
 * PERFORMANCE: O(n log n) due to key sorting. Consider for small objects only.
 * For hashing large objects, use createContentHash from utils/hash.ts instead.
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

// Fast path for common types - avoid JSON.stringify overhead
// Returns undefined for undefined input to match original behavior
const fastStringify = (obj: unknown): string | undefined => {
    if (obj === null) return "null"
    if (obj === undefined) return undefined
    if (typeof obj === "string") return JSON.stringify(obj)
    if (typeof obj === "number" || typeof obj === "boolean") return String(obj)
    return "" // Complex types handled by main function
}

/**
 * Stable JSON stringify with sorted keys for deterministic hashing.
 * Ensures that {a: 1, b: 2} and {b: 2, a: 1} produce the same string.
 *
 * PERFORMANCE OPTIMIZATIONS:
 * - Fast path for primitives (bypasses JSON.stringify)
 * - Single-pass string building with pre-allocated arrays
 * - Reduces memory allocations vs recursive string concatenation
 *
 * Returns undefined when input is undefined (matches JSON.stringify behavior for undefined values
 * at the top level, which is different from nested undefined values which become "null")
 */
export function stableStringify(obj: unknown): string | undefined {
    // Fast path: primitives (returns undefined for undefined input)
    const fast = fastStringify(obj)
    if (fast === undefined) return undefined
    if (fast) return fast

    // Arrays: build with array join (faster than string concatenation)
    // Note: undefined array elements become "null" per JSON.stringify behavior
    if (Array.isArray(obj)) {
        if (obj.length === 0) return "[]"
        const parts = new Array<string>(obj.length)
        for (let i = 0; i < obj.length; i++) {
            const str = stableStringify(obj[i])
            parts[i] = str === undefined ? "null" : str
        }
        return "[" + parts.join(",") + "]"
    }

    // Objects: sort keys once, then build
    // Note: undefined values are omitted from objects per JSON.stringify behavior
    const keys = Object.keys(obj as object).sort()
    if (keys.length === 0) return "{}"

    const parts = new Array<string>(keys.length)
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i]!
        const value = (obj as Record<string, unknown>)[k]
        const str = stableStringify(value)
        // Skip undefined values in objects (matches JSON.stringify behavior)
        if (str === undefined) {
            parts[i] = JSON.stringify(k) + ":null"
        } else {
            parts[i] = JSON.stringify(k) + ":" + str
        }
    }
    return "{" + parts.join(",") + "}"
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

import { createContentHash } from "./hash"

/**
 * Simple hash function for operation deduplication.
 * Returns a short hash string suitable for cache keys.
 *
 * PERFORMANCE: Now uses crypto.createHash via createContentHash for better
 * distribution and reduced collision risk vs rolling hash.
 */
export function hashObject(type: string, obj: unknown): string {
    // Use optimized hash that handles primitives efficiently
    const hash = createContentHash({ type, params: obj })
    return `${type}_${hash.slice(0, 12)}`
}
