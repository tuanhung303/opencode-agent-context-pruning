/**
 * LRU (Least Recently Used) Cache implementation with size limits.
 * Provides O(1) get/set operations and automatic eviction of least recently used items.
 *
 * PERFORMANCE CHARACTERISTICS:
 * - get: O(1)
 * - set: O(1)
 * - delete: O(1)
 * - Memory overhead: ~3x the storage of a plain Map (due to doubly-linked list)
 *
 * Use this when you need:
 * - Bounded memory usage
 * - Access-pattern-aware eviction (LRU vs FIFO)
 * - Automatic cleanup of stale entries
 */

interface LRUCacheEntry<V> {
    value: V
    prev: LRUCacheEntry<V> | null
    next: LRUCacheEntry<V> | null
    key: string
}

export class LRUCache<V> {
    private cache: Map<string, LRUCacheEntry<V>>
    private head: LRUCacheEntry<V> | null = null
    private tail: LRUCacheEntry<V> | null = null
    private maxSize: number
    private currentSize = 0

    /**
     * Stats for monitoring cache performance
     */
    public stats = {
        hits: 0,
        misses: 0,
        evictions: 0,
    }

    constructor(maxSize: number) {
        if (maxSize <= 0) {
            throw new Error("LRUCache maxSize must be positive")
        }
        this.maxSize = maxSize
        this.cache = new Map()
    }

    /**
     * Get value from cache and mark as recently used.
     * Returns undefined if key not found.
     */
    get(key: string): V | undefined {
        const entry = this.cache.get(key)
        if (!entry) {
            this.stats.misses++
            return undefined
        }

        this.stats.hits++
        this.moveToHead(entry)
        return entry.value
    }

    /**
     * Set value in cache. If key exists, updates value and marks as recently used.
     * If cache is at capacity, evicts least recently used entry.
     */
    set(key: string, value: V): void {
        let entry = this.cache.get(key)

        if (entry) {
            // Update existing entry
            entry.value = value
            this.moveToHead(entry)
            return
        }

        // Create new entry
        entry = {
            value,
            key,
            prev: null,
            next: null,
        }

        this.cache.set(key, entry)
        this.addToHead(entry)
        this.currentSize++

        // Evict if over capacity
        if (this.currentSize > this.maxSize) {
            this.evictLRU()
        }
    }

    /**
     * Check if key exists in cache (without updating access order).
     * Use has() + get() pattern when you want to conditionally update.
     */
    has(key: string): boolean {
        return this.cache.has(key)
    }

    /**
     * Delete entry from cache.
     * Returns true if entry existed and was deleted.
     */
    delete(key: string): boolean {
        const entry = this.cache.get(key)
        if (!entry) {
            return false
        }

        this.removeFromList(entry)
        this.cache.delete(key)
        this.currentSize--
        return true
    }

    /**
     * Get current cache size.
     */
    get size(): number {
        return this.currentSize
    }

    /**
     * Get all keys in order from most recent to least recent.
     */
    keys(): string[] {
        const keys: string[] = []
        let current = this.head
        while (current) {
            keys.push(current.key)
            current = current.next
        }
        return keys
    }

    /**
     * Get all values in order from most recent to least recent.
     */
    values(): V[] {
        const values: V[] = []
        let current = this.head
        while (current) {
            values.push(current.value)
            current = current.next
        }
        return values
    }

    /**
     * Get hit rate as a percentage (0-100).
     */
    get hitRate(): number {
        const total = this.stats.hits + this.stats.misses
        if (total === 0) return 0
        return (this.stats.hits / total) * 100
    }

    /**
     * Clear all entries and reset stats.
     */
    clear(): void {
        this.cache.clear()
        this.head = null
        this.tail = null
        this.currentSize = 0
        this.stats = { hits: 0, misses: 0, evictions: 0 }
    }

    /**
     * Iterate over entries from most recent to least recent.
     * Yields [key, value] pairs.
     */
    *[Symbol.iterator](): Generator<[string, V]> {
        let current = this.head
        while (current) {
            yield [current.key, current.value]
            current = current.next
        }
    }

    private moveToHead(entry: LRUCacheEntry<V>): void {
        if (entry === this.head) {
            return
        }
        this.removeFromList(entry)
        this.addToHead(entry)
    }

    private addToHead(entry: LRUCacheEntry<V>): void {
        entry.prev = null
        entry.next = this.head

        if (this.head) {
            this.head.prev = entry
        }
        this.head = entry

        if (!this.tail) {
            this.tail = entry
        }
    }

    private removeFromList(entry: LRUCacheEntry<V>): void {
        if (entry.prev) {
            entry.prev.next = entry.next
        } else {
            this.head = entry.next
        }

        if (entry.next) {
            entry.next.prev = entry.prev
        } else {
            this.tail = entry.prev
        }
    }

    private evictLRU(): void {
        if (!this.tail) {
            return
        }

        const keyToEvict = this.tail.key
        this.removeFromList(this.tail)
        this.cache.delete(keyToEvict)
        this.currentSize--
        this.stats.evictions++
    }
}

/**
 * Simple TTL (Time-To-Live) cache with automatic expiration.
 * Good for short-lived caches where entries become stale after a fixed time.
 */
export class TTLCache<V> {
    private cache: Map<string, { value: V; expiresAt: number }>
    private ttlMs: number

    constructor(ttlMs: number) {
        this.ttlMs = ttlMs
        this.cache = new Map()
    }

    get(key: string): V | undefined {
        const entry = this.cache.get(key)
        if (!entry) {
            return undefined
        }

        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key)
            return undefined
        }

        return entry.value
    }

    set(key: string, value: V, customTtl?: number): void {
        const ttl = customTtl ?? this.ttlMs
        this.cache.set(key, {
            value,
            expiresAt: Date.now() + ttl,
        })
    }

    has(key: string): boolean {
        const entry = this.cache.get(key)
        if (!entry) return false
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key)
            return false
        }
        return true
    }

    delete(key: string): boolean {
        return this.cache.delete(key)
    }

    clear(): void {
        this.cache.clear()
    }

    get size(): number {
        return this.cache.size
    }
}
