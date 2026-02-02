/**
 * @deprecated This function is no longer used. Hash-based discarding embeds
 * hashes directly into tool outputs instead of injecting a prunable-tools list.
 * Kept for backward compatibility but does nothing.
 */
export const insertPruneToolContext = (): void => {
    // No-op: Hash-based discarding doesn't need list injection.
    // Hashes are embedded directly into tool outputs via injectHashesIntoToolOutputs()
}
