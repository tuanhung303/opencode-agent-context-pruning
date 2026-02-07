export {
    prune,
    injectHashesIntoToolOutputs,
    injectHashesIntoAssistantMessages,
    injectHashesIntoReasoningBlocks,
    ensureReasoningContentSync,
    stripAllHashTagsFromMessages,
} from "./prune"
export { stripHashTags } from "../state/hash-registry"
export { applyPatternReplacements } from "../strategies/replace"
export { scanAndRegisterHashTags, detectTargetType } from "./utils"
export { insertPruneToolContext } from "./inject"
export { injectTodoReminder, removeTodoReminder } from "./todo-reminder"
export {
    detectAutomataActivation,
    injectAutomataReflection,
    removeAutomataReflection,
} from "./automata-mode"
