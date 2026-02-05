import type { OpenCodeClient } from "../client"
import type { SessionState, RuntimeCache } from "./types"

interface SessionData {
    parentID?: string
}

export async function isSubAgentSession(
    client: OpenCodeClient,
    sessionID: string,
): Promise<boolean> {
    try {
        const result = await client.session.get({ path: { id: sessionID } })
        const data = result.data as SessionData | undefined
        return !!data?.parentID
    } catch {
        return false
    }
}

/**
 * Get or create the runtime cache for O(1) prune lookups.
 * Cache is lazily initialized and invalidated when prune arrays change.
 */
export function getPruneCache(state: SessionState): RuntimeCache {
    if (!state._cache) {
        state._cache = {
            prunedToolIds: new Set(state.prune.toolIds),
            prunedMessagePartIds: new Set(state.prune.messagePartIds),
            prunedReasoningPartIds: new Set(state.prune.reasoningPartIds),
        }
    }
    return state._cache
}

/**
 * Invalidate the runtime cache. Call this after modifying prune arrays.
 */
export function invalidatePruneCache(state: SessionState): void {
    state._cache = undefined
}

/**
 * Check if a tool ID is marked for pruning. O(1) lookup.
 */
export function isToolPruned(state: SessionState, toolId: string): boolean {
    return getPruneCache(state).prunedToolIds.has(toolId)
}

/**
 * Check if a message part ID is marked for pruning. O(1) lookup.
 */
export function isMessagePartPruned(state: SessionState, partId: string): boolean {
    return getPruneCache(state).prunedMessagePartIds.has(partId)
}

/**
 * Check if a reasoning part ID is marked for pruning. O(1) lookup.
 */
export function isReasoningPartPruned(state: SessionState, partId: string): boolean {
    return getPruneCache(state).prunedReasoningPartIds.has(partId)
}

/**
 * Add a tool ID to the prune list and update cache.
 */
export function markToolForPruning(state: SessionState, toolId: string): void {
    if (!state.prune.toolIds.includes(toolId)) {
        state.prune.toolIds.push(toolId)
        if (state._cache) {
            state._cache.prunedToolIds.add(toolId)
        }
    }
}

/**
 * Add a message part ID to the prune list and update cache.
 */
export function markMessagePartForPruning(state: SessionState, partId: string): void {
    if (!state.prune.messagePartIds.includes(partId)) {
        state.prune.messagePartIds.push(partId)
        if (state._cache) {
            state._cache.prunedMessagePartIds.add(partId)
        }
    }
}

/**
 * Add a reasoning part ID to the prune list and update cache.
 */
export function markReasoningPartForPruning(state: SessionState, partId: string): void {
    if (!state.prune.reasoningPartIds.includes(partId)) {
        state.prune.reasoningPartIds.push(partId)
        if (state._cache) {
            state._cache.prunedReasoningPartIds.add(partId)
        }
    }
}
