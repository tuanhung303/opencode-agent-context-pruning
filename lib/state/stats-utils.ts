/**
 * Shared utility for summing prune statistics across all strategy categories.
 * Single source of truth — used by both formatStatsHeader() and /acp stats command.
 */

import type { SessionStats } from "./types"

/**
 * Sum all auto-supersede categories dynamically.
 * Uses Object.values() so new categories added to SessionStats.autoSupersede
 * are automatically included without code changes.
 *
 * Guards against non-counter properties by checking for numeric .count/.tokens fields.
 */
export function sumAutoSupersede(autoSupersede: SessionStats["strategyStats"]["autoSupersede"]): {
    count: number
    tokens: number
} {
    let count = 0
    let tokens = 0
    for (const entry of Object.values(autoSupersede)) {
        if (
            entry &&
            typeof entry === "object" &&
            typeof entry.count === "number" &&
            typeof entry.tokens === "number"
        ) {
            count += entry.count
            tokens += entry.tokens
        }
    }
    return { count, tokens }
}

/**
 * Sum all tool-related prune stats: manual tool discards + all auto-supersede + purge errors.
 * This is the "⚙️" line in the status bar.
 */
export function sumToolPruneStats(strategyStats: SessionStats["strategyStats"]): {
    count: number
    tokens: number
} {
    const auto = sumAutoSupersede(strategyStats.autoSupersede)
    return {
        count:
            strategyStats.manualDiscard.tool.count + auto.count + strategyStats.purgeErrors.count,
        tokens:
            strategyStats.manualDiscard.tool.tokens +
            auto.tokens +
            strategyStats.purgeErrors.tokens,
    }
}
