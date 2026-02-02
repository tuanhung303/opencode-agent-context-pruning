import { statSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

interface CacheEntry {
    content: string
    mtime: number
    size: number
    cachedAt: number
}

const fileCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 30000 // 30 seconds

/**
 * Read file with caching - 30s TTL, invalidated on file change
 * Returns cached content if mtime and size match
 */
export function readFileCached(filePath: string): string {
    const resolvedPath = resolve(filePath)
    const now = Date.now()
    const cached = fileCache.get(resolvedPath)

    // Check cache validity
    if (cached) {
        const stats = statSync(resolvedPath, { throwIfNoEntry: false })
        if (stats && stats.mtimeMs === cached.mtime && stats.size === cached.size) {
            // Update access time for LRU tracking
            cached.cachedAt = now
            return cached.content
        }
        // Cache invalid - file changed
        fileCache.delete(resolvedPath)
    }

    // Read fresh content
    const stats = statSync(resolvedPath, { throwIfNoEntry: false })
    if (!stats) {
        throw new Error(`File not found: ${filePath}`)
    }

    const content = readFileSync(resolvedPath, "utf-8")

    fileCache.set(resolvedPath, {
        content,
        mtime: stats.mtimeMs,
        size: stats.size,
        cachedAt: now,
    })

    return content
}

/**
 * Invalidate a specific file from cache
 */
export function invalidateFileCache(filePath: string): void {
    const resolvedPath = resolve(filePath)
    fileCache.delete(resolvedPath)
}

/**
 * Clear all cached files
 */
export function clearFileCache(): void {
    fileCache.clear()
}

/**
 * Get cache statistics
 */
export function getFileCacheStats(): { entries: number; totalSize: number } {
    let totalSize = 0
    for (const entry of fileCache.values()) {
        totalSize += entry.size
    }
    return { entries: fileCache.size, totalSize }
}

/**
 * Clean expired cache entries (older than TTL)
 */
export function cleanExpiredCache(): number {
    const now = Date.now()
    let cleaned = 0

    for (const [path, entry] of fileCache.entries()) {
        if (now - entry.cachedAt > CACHE_TTL_MS) {
            fileCache.delete(path)
            cleaned++
        }
    }

    return cleaned
}
