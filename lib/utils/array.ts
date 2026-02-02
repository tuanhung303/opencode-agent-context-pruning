/**
 * Type-safe array utilities to eliminate non-null assertions.
 * Provides safe access patterns that return proper types.
 */

/**
 * Safely gets an element at index, returning undefined if out of bounds.
 * Eliminates need for `array[i]!` assertions.
 */
export function at<T>(array: readonly T[], index: number): T | undefined {
    if (index < 0 || index >= array.length) {
        return undefined
    }
    return array[index]
}

/**
 * Safely gets an element at index with a default value.
 * Useful when you need a guaranteed value.
 */
export function atOr<T>(array: readonly T[], index: number, defaultValue: T): T {
    if (index < 0 || index >= array.length) {
        return defaultValue
    }
    return array[index] ?? defaultValue
}

/**
 * Gets the last element of an array, or undefined if empty.
 */
export function last<T>(array: readonly T[]): T | undefined {
    return array.length > 0 ? array[array.length - 1] : undefined
}

/**
 * Gets the first element of an array, or undefined if empty.
 */
export function first<T>(array: readonly T[]): T | undefined {
    return array.length > 0 ? array[0] : undefined
}

/**
 * Type guard to check if a value is defined (not null or undefined).
 */
export function isDefined<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined
}

/**
 * Filters out null and undefined values with proper type narrowing.
 */
export function filterDefined<T>(array: readonly (T | null | undefined)[]): T[] {
    return array.filter(isDefined)
}

/**
 * Safe map that skips undefined results.
 * Combines map and filter in a single pass.
 */
export function mapDefined<T, U>(
    array: readonly T[],
    fn: (item: T, index: number) => U | undefined,
): U[] {
    const result: U[] = []
    for (let i = 0; i < array.length; i++) {
        const item = array[i]
        if (item !== undefined) {
            const mapped = fn(item, i)
            if (mapped !== undefined) {
                result.push(mapped)
            }
        }
    }
    return result
}

/**
 * Collects first N items that match a predicate.
 * More efficient than filter().slice() for large arrays.
 */
export function takeWhile<T>(
    array: readonly T[],
    predicate: (item: T, index: number) => boolean,
    limit: number,
): T[] {
    const result: T[] = []
    for (let i = 0; i < array.length && result.length < limit; i++) {
        const item = array[i]
        if (item !== undefined && predicate(item, i)) {
            result.push(item)
        }
    }
    return result
}

/**
 * Groups array items by a key function.
 * Returns a Map for type safety.
 */
export function groupBy<T, K>(array: readonly T[], keyFn: (item: T) => K): Map<K, T[]> {
    const map = new Map<K, T[]>()
    for (const item of array) {
        const key = keyFn(item)
        const group = map.get(key)
        if (group) {
            group.push(item)
        } else {
            map.set(key, [item])
        }
    }
    return map
}

/**
 * Safe push to a Map of arrays.
 * Eliminates `map.get(key)!.push(item)` pattern.
 */
export function pushToMapArray<K, V>(map: Map<K, V[]>, key: K, value: V): void {
    const existing = map.get(key)
    if (existing) {
        existing.push(value)
    } else {
        map.set(key, [value])
    }
}
