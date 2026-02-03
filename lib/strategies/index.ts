// Core types
export { PruneToolContext } from "./_types"

// Strategy implementations
export { deduplicate } from "./deduplication"
export { supersedeWrites } from "./supersede-writes"
export { purgeErrors } from "./purge-errors"
export { truncateLargeOutputs } from "./truncation"
export { compressThinkingBlocks } from "./thinking-compression"

// Tool operations
export {
    executeToolPrune,
    executeContextToolDiscard,
    executeContextMessageDiscard,
} from "./discard"
export {
    executeToolDistill,
    executeContextToolDistill,
    executeContextMessageDistill,
} from "./distill"
export { executeContextToolRestore, executeContextMessageRestore } from "./restore"

// Unified context tool
export { createContextTool, executeContext } from "./context"

// Utilities
export { calculateTokensSaved, getCurrentParams } from "./utils"
