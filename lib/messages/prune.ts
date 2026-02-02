import type { SessionState, WithParts } from "../state"
import type { Logger } from "../logger"
import type { PluginConfig } from "../config"
import { isMessageCompacted } from "../shared-utils"

const PRUNED_TOOL_ERROR_INPUT_REPLACEMENT = "[input removed due to failed tool call]"
const PRUNED_QUESTION_INPUT_REPLACEMENT = "[questions removed - see output for user's answers]"
const PRUNED_MESSAGE_PART_REPLACEMENT = "[Assistant message part removed to save context]"

/**
 * Generates a short hash for message parts.
 * Format: a_xxxxx (a = assistant text)
 */
function generateMessagePartHash(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
    let hash = ""
    for (let i = 0; i < 5; i++) {
        hash += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return `a_${hash}`
}

/**
 * Injects hash identifiers into tool outputs for hash-based discarding.
 * Format: x_xxxxx\n<original output>
 *
 * This allows agents to reference tools by their stable hash when discarding,
 * eliminating the need for a separate prunable-tools list.
 */
export const injectHashesIntoToolOutputs = (
    state: SessionState,
    config: PluginConfig,
    messages: WithParts[],
    logger: Logger,
): void => {
    const protectedTools = config.tools.settings.protectedTools

    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) {
            continue
        }

        const parts = Array.isArray(msg.parts) ? msg.parts : []
        for (const part of parts) {
            if (part.type !== "tool" || !part.callID) {
                continue
            }

            // Skip protected tools - they don't get hashes
            if (protectedTools.includes(part.tool)) {
                continue
            }

            // Skip if already pruned
            if (state.prune.toolIds.includes(part.callID)) {
                continue
            }

            // Only inject into completed tools that have output
            if (part.state.status !== "completed") {
                continue
            }

            const hash = state.callIdToHash.get(part.callID)
            if (!hash) {
                continue
            }

            // Skip if already has hash prefix (format: x_xxxxx where x is tool prefix)
            if (part.state.output && /^[a-z]_[a-z0-9]{5}/i.test(part.state.output)) {
                continue
            }

            // Prepend hash to output
            if (part.state.output) {
                part.state.output = `${hash}\n${part.state.output}`
                logger.debug(`Injected hash ${hash} into ${part.tool} output`)
            }
        }
    }
}

/**
 * Injects hash identifiers into assistant text parts for hash-based discarding.
 * Format: a_xxxxx\n<original text>
 *
 * This allows agents to discard their own verbose explanations or outdated responses.
 * Only injects into text parts that are substantial (>100 chars) and not already hashed.
 */
export const injectHashesIntoAssistantMessages = (
    state: SessionState,
    config: PluginConfig,
    messages: WithParts[],
    logger: Logger,
): void => {
    // Skip if feature is disabled
    if (!config.tools?.settings?.enableAssistantMessagePruning) {
        return
    }

    const minTextLength = config.tools?.settings?.minAssistantTextLength ?? 100

    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) {
            continue
        }

        // Only process assistant messages
        if (msg.info.role !== "assistant") {
            continue
        }

        const messageId = msg.info.id
        const parts = Array.isArray(msg.parts) ? msg.parts : []

        for (let partIndex = 0; partIndex < parts.length; partIndex++) {
            const part = parts[partIndex]
            if (!part) {
                continue
            }

            // Only process text parts
            if (part.type !== "text" || !part.text) {
                continue
            }

            // Skip short text parts
            if (part.text.length < minTextLength) {
                continue
            }

            // Skip if already has hash prefix (format: a_xxxxx)
            if (/^a_[a-z0-9]{5}/i.test(part.text)) {
                continue
            }

            const partId = `${messageId}:${partIndex}`

            // Skip if already pruned
            if (state.prune.messagePartIds.includes(partId)) {
                continue
            }

            // Check if we already have a hash for this part
            let hash = state.messagePartToHash.get(partId)
            if (!hash) {
                // Generate new hash
                hash = generateMessagePartHash()
                state.hashToMessagePart.set(hash, partId)
                state.messagePartToHash.set(partId, hash)
                logger.debug(`Generated hash ${hash} for assistant text part ${partId}`)
            }

            // Prepend hash to text
            part.text = `${hash}\n${part.text}`
            logger.debug(`Injected hash ${hash} into assistant text part`)
        }
    }
}

/**
 * Creates a compact breadcrumb string for pruned tool outputs.
 * Format: [Output removed...] tool({param: "value"}) → status
 *
 * This preserves key metadata so the agent can understand what was pruned
 * without needing to re-read the content.
 */
const createPrunedOutputBreadcrumb = (
    tool: string,
    input: Record<string, unknown> | undefined,
    status: string,
): string => {
    let paramsStr = ""
    if (input && typeof input === "object") {
        // Extract key parameters for common tools
        const keyParams: Record<string, string[]> = {
            read: ["filePath"],
            write: ["filePath"],
            edit: ["filePath"],
            glob: ["pattern", "path"],
            grep: ["pattern", "include", "path"],
            bash: ["command", "description"],
            webfetch: ["url"],
            task: ["description"],
        }

        const relevantKeys = keyParams[tool] || Object.keys(input).slice(0, 2)
        const params: string[] = []

        for (const key of relevantKeys) {
            if (input[key] !== undefined) {
                const value = input[key]
                if (typeof value === "string") {
                    // Truncate long strings
                    const truncated = value.length > 50 ? value.slice(0, 47) + "..." : value
                    params.push(`${key}: "${truncated}"`)
                } else if (typeof value === "number" || typeof value === "boolean") {
                    params.push(`${key}: ${value}`)
                }
            }
        }

        if (params.length > 0) {
            paramsStr = `{${params.join(", ")}}`
        }
    }

    return `[Output removed to save context - information superseded or no longer needed]\n${tool}(${paramsStr}) → ${status}`
}

export const prune = (
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
    messages: WithParts[],
): void => {
    // Convert to Set for O(1) lookup instead of O(n) array.includes()
    const prunedToolIds = new Set(state.prune.toolIds)
    const prunedMessagePartIds = new Set(state.prune.messagePartIds)

    // Early exit if nothing to prune
    if (prunedToolIds.size === 0 && prunedMessagePartIds.size === 0) {
        return
    }

    // Single pass over all messages and parts
    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) {
            continue
        }

        const parts = Array.isArray(msg.parts) ? msg.parts : []
        const messageId = msg.info.id
        const isAssistant = msg.info.role === "assistant"

        for (let partIndex = 0; partIndex < parts.length; partIndex++) {
            const part = parts[partIndex]
            if (!part) continue

            // Handle tool parts
            if (part.type === "tool" && part.callID && prunedToolIds.has(part.callID)) {
                const status = part.state?.status

                if (status === "completed") {
                    if (part.tool === "question") {
                        // Prune question inputs
                        if (part.state.input?.questions !== undefined) {
                            part.state.input.questions = PRUNED_QUESTION_INPUT_REPLACEMENT
                        }
                    } else {
                        // Prune tool outputs
                        part.state.output = createPrunedOutputBreadcrumb(
                            part.tool,
                            part.state.input,
                            status,
                        )
                    }
                } else if (status === "error") {
                    // Prune error inputs
                    const input = part.state.input
                    if (input && typeof input === "object") {
                        for (const key of Object.keys(input)) {
                            if (typeof input[key] === "string") {
                                input[key] = PRUNED_TOOL_ERROR_INPUT_REPLACEMENT
                            }
                        }
                    }
                }
            }

            // Handle assistant text parts
            if (isAssistant && part.type === "text" && prunedMessagePartIds.size > 0) {
                const partId = `${messageId}:${partIndex}`
                if (prunedMessagePartIds.has(partId)) {
                    part.text = PRUNED_MESSAGE_PART_REPLACEMENT
                    logger.debug(`Pruned assistant message part ${partId}`)
                }
            }
        }
    }
}
