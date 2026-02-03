import { PluginConfig } from "../config"
import { Logger } from "../logger"
import type { SessionState, WithParts } from "../state"
import { buildToolIdList } from "../messages/utils"
import { getFilePathFromParameters, isProtectedFilePath } from "../protected-file-patterns"
import { calculateTokensSaved } from "./utils"
import { normalizeParams } from "../utils/object"
import { createContentHash } from "../utils/hash"
import { at, pushToMapArray } from "../utils/array"

/**
 * Represents a file read operation with offset/limit for overlap detection.
 */
interface FileReadRange {
    id: string
    filePath: string
    offset: number
    limit: number | undefined
    index: number // chronological index
}

/**
 * Deduplication strategy - prunes older tool calls that have identical
 * tool name and parameters, keeping only the most recent occurrence.
 * Also handles fuzzy deduplication for overlapping file reads.
 * Modifies the session state in place to add pruned tool call IDs.
 */
export const deduplicate = (
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
    messages: WithParts[],
): void => {
    if (!config.strategies.deduplication.enabled) {
        return
    }

    // Build list of all tool call IDs from messages (chronological order)
    const allToolIds = buildToolIdList(state, messages)
    if (allToolIds.length === 0) {
        return
    }

    // Filter out IDs already pruned
    const alreadyPruned = new Set(state.prune.toolIds)
    const unprunedIds = allToolIds.filter((id) => !alreadyPruned.has(id))

    if (unprunedIds.length === 0) {
        return
    }

    const protectedTools = config.strategies.deduplication.protectedTools

    // Set to collect all IDs to prune in this pass
    const toPruneIds = new Set<string>()

    // Group by signature (tool name + normalized parameters) for exact matching
    const signatureMap = new Map<string, string[]>()

    for (const id of unprunedIds) {
        const metadata = state.toolParameters.get(id)
        if (!metadata) {
            continue
        }

        // Skip protected tools
        if (protectedTools.includes(metadata.tool)) {
            continue
        }

        const filePath = getFilePathFromParameters(metadata.parameters)
        if (isProtectedFilePath(filePath, config.protectedFilePatterns)) {
            continue
        }

        const signature = createToolSignature(metadata.tool, metadata.parameters)
        pushToMapArray(signatureMap, signature, id)
    }

    // Phase 1: Exact duplicates - keep only the most recent (last) in each group
    for (const [, ids] of signatureMap.entries()) {
        if (ids.length > 1) {
            // All except last (most recent) should be pruned
            for (let i = 0; i < ids.length - 1; i++) {
                const id = at(ids, i)
                if (id) toPruneIds.add(id)
            }
        }
    }

    // Phase 2: Fuzzy deduplication for overlapping file reads
    // Pass unprunedIds that haven't been marked for pruning in Phase 1
    const phase2Ids = unprunedIds.filter((id) => !toPruneIds.has(id))
    const overlappingReads = findOverlappingReads(state, phase2Ids, protectedTools, config)
    for (const id of overlappingReads) {
        toPruneIds.add(id)
    }

    if (toPruneIds.size > 0) {
        const finalPruneIds = Array.from(toPruneIds)
        state.prune.toolIds.push(...finalPruneIds)

        const tokensSaved = calculateTokensSaved(state, messages, finalPruneIds)
        state.stats.totalPruneMessages += finalPruneIds.length
        state.stats.totalPruneTokens += tokensSaved
        state.stats.strategyStats.deduplication.count += finalPruneIds.length
        state.stats.strategyStats.deduplication.tokens += tokensSaved

        logger.debug(
            `Marked ${finalPruneIds.length} duplicate/overlapping tool calls for pruning`,
            {
                tokensSaved,
            },
        )
    }
}

/**
 * Find overlapping file reads that can be safely pruned.
 * If a file is read with overlapping ranges, older reads that are
 * fully contained within newer reads can be pruned.
 */
function findOverlappingReads(
    state: SessionState,
    toolIds: string[],
    protectedTools: string[],
    config: PluginConfig,
): string[] {
    const fileReads = new Map<string, FileReadRange[]>()

    // Collect all read operations with file paths
    for (let i = 0; i < toolIds.length; i++) {
        const id = at(toolIds, i)
        if (!id) continue
        const metadata = state.toolParameters.get(id)
        if (!metadata || metadata.tool !== "read") continue
        if (protectedTools.includes(metadata.tool)) continue

        const filePath = getFilePathFromParameters(metadata.parameters)
        if (!filePath || isProtectedFilePath(filePath, config.protectedFilePatterns)) continue

        const params = metadata.parameters || {}
        const offset = typeof params.offset === "number" ? params.offset : 0
        const limit = typeof params.limit === "number" ? params.limit : undefined

        pushToMapArray(fileReads, filePath, { id, filePath, offset, limit, index: i })
    }

    const toPrune: string[] = []

    // For each file, check for overlapping ranges
    for (const [, reads] of fileReads.entries()) {
        if (reads.length < 2) continue

        // Check each read against every other read for containment
        for (let i = 0; i < reads.length; i++) {
            const a = at(reads, i)
            if (!a) continue
            for (let j = 0; j < reads.length; j++) {
                if (i === j) continue
                const b = at(reads, j)
                if (!b) continue

                // If a is fully contained within b, a is potentially redundant
                if (isRangeContained(a, b)) {
                    // Safety for identical ranges: only prune the older one
                    const isIdentical = areRangesIdentical(a, b)
                    if (isIdentical) {
                        if (a.index < b.index) {
                            toPrune.push(a.id)
                            break
                        }
                    } else {
                        // a is strictly contained in b.
                        // Only prune if the container (b) is MORE RECENT than the contained (a).
                        // This prevents pruning a newer limited read just because an older unlimited read exists,
                        // which might be desirable if we prefer keeping newer context.
                        if (a.index < b.index) {
                            toPrune.push(a.id)
                            break
                        }
                    }
                }
            }
        }
    }

    return toPrune
}

/**
 * Check if range A is fully contained within range B.
 */
function isRangeContained(a: FileReadRange, b: FileReadRange): boolean {
    // If b has no limit (read entire file), it contains everything
    if (b.limit === undefined) {
        return a.offset >= b.offset
    }

    // If a has no limit but b does, a might be larger
    if (a.limit === undefined) {
        return false
    }

    const aEnd = a.offset + a.limit
    const bEnd = b.offset + b.limit

    // A is contained in B if A starts at or after B and ends at or before B
    return a.offset >= b.offset && aEnd <= bEnd
}

/**
 * Check if two ranges are identical.
 */
function areRangesIdentical(a: FileReadRange, b: FileReadRange): boolean {
    return a.offset === b.offset && a.limit === b.limit
}

/**
 * Create a deterministic signature for tool deduplication.
 * Uses optimized hashing for better performance vs JSON.stringify + sort.
 *
 * PERFORMANCE: createContentHash handles key sorting internally and uses
 * crypto.createHash for better distribution and reduced collision risk.
 */
function createToolSignature(tool: string, parameters?: Record<string, unknown>): string {
    if (!parameters) {
        return tool
    }
    const normalized = normalizeParams(parameters)
    // Use optimized hash instead of JSON.stringify for ~5-10x performance gain
    const paramHash = createContentHash(normalized)
    return `${tool}::${paramHash}`
}
