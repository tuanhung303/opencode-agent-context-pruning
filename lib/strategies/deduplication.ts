import { PluginConfig } from "../config"
import { Logger } from "../logger"
import type { SessionState, WithParts } from "../state"
import { buildToolIdList } from "../messages/utils"
import { getFilePathFromParameters, isProtectedFilePath } from "../protected-file-patterns"
import { calculateTokensSaved } from "./utils"

/**
 * Represents a file read operation with offset/limit for overlap detection.
 */
interface FileReadRange {
    id: string
    filePath: string
    offset: number
    limit: number | undefined
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
    const allToolIds = buildToolIdList(state, messages, logger)
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

    // Group by signature (tool name + normalized parameters)
    const signatureMap = new Map<string, string[]>()

    for (const id of unprunedIds) {
        const metadata = state.toolParameters.get(id)
        if (!metadata) {
            // logger.warn(`Missing metadata for tool call ID: ${id}`)
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
        if (!signatureMap.has(signature)) {
            signatureMap.set(signature, [])
        }
        signatureMap.get(signature)!.push(id)
    }

    // Find duplicates - keep only the most recent (last) in each group
    const newPruneIds: string[] = []

    for (const [, ids] of signatureMap.entries()) {
        if (ids.length > 1) {
            // All except last (most recent) should be pruned
            const idsToRemove = ids.slice(0, -1)
            newPruneIds.push(...idsToRemove)
        }
    }

    const tokensSaved = calculateTokensSaved(state, messages, newPruneIds)
    state.stats.totalPruneTokens += tokensSaved

    const allDeduplicatedIds: string[] = [...newPruneIds]

    // Phase 2: Fuzzy deduplication for overlapping file reads
    const overlappingReads = findOverlappingReads(state, unprunedIds, protectedTools, config)
    if (overlappingReads.length > 0) {
        allDeduplicatedIds.push(...overlappingReads)
        logger.debug(`Marked ${overlappingReads.length} overlapping file reads for pruning`)
    }

    if (allDeduplicatedIds.length > 0) {
        state.prune.toolIds.push(...allDeduplicatedIds)
        state.stats.totalPruneMessages += allDeduplicatedIds.length
        const tokensSaved = calculateTokensSaved(state, messages, allDeduplicatedIds)
        state.stats.totalPruneTokens += tokensSaved
        state.stats.strategyStats.deduplication.count += allDeduplicatedIds.length
        state.stats.strategyStats.deduplication.tokens += tokensSaved
        logger.debug(`Marked ${allDeduplicatedIds.length} duplicate tool calls for pruning`)
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
    for (const id of toolIds) {
        const metadata = state.toolParameters.get(id)
        if (!metadata || metadata.tool !== "read") continue
        if (protectedTools.includes(metadata.tool)) continue

        const filePath = getFilePathFromParameters(metadata.parameters)
        if (!filePath || isProtectedFilePath(filePath, config.protectedFilePatterns)) continue

        const params = metadata.parameters || {}
        const offset = typeof params.offset === "number" ? params.offset : 0
        const limit = typeof params.limit === "number" ? params.limit : undefined

        if (!fileReads.has(filePath)) {
            fileReads.set(filePath, [])
        }
        fileReads.get(filePath)!.push({ id, filePath, offset, limit })
    }

    const toPrune: string[] = []

    // For each file, check for overlapping ranges
    for (const [, reads] of fileReads.entries()) {
        if (reads.length < 2) continue

        // Sort by offset (ascending), then by limit (descending for same offset)
        reads.sort((a, b) => {
            if (a.offset !== b.offset) return a.offset - b.offset
            // If same offset, prefer the one with larger limit (or undefined = unlimited)
            if (a.limit === undefined) return 1
            if (b.limit === undefined) return -1
            return b.limit - a.limit
        })

        // Check each read against later reads (which are more recent due to chronological order)
        for (let i = 0; i < reads.length - 1; i++) {
            const older = reads[i]!
            const newer = reads[reads.length - 1]! // Most recent read of this file

            if (older.id === newer.id) continue

            // Check if older read is fully contained within newer read
            if (isRangeContained(older, newer)) {
                toPrune.push(older.id)
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

function createToolSignature(tool: string, parameters?: any): string {
    if (!parameters) {
        return tool
    }
    const normalized = normalizeParameters(parameters)
    const sorted = sortObjectKeys(normalized)
    return `${tool}::${JSON.stringify(sorted)}`
}

function normalizeParameters(params: any): any {
    if (typeof params !== "object" || params === null) return params
    if (Array.isArray(params)) return params

    const normalized: any = {}
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            normalized[key] = value
        }
    }
    return normalized
}

function sortObjectKeys(obj: any): any {
    if (typeof obj !== "object" || obj === null) return obj
    if (Array.isArray(obj)) return obj.map(sortObjectKeys)

    const sorted: any = {}
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = sortObjectKeys(obj[key])
    }
    return sorted
}
