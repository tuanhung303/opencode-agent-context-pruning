import type { SessionState, WithParts } from "../state"
import type { Part } from "@opencode-ai/sdk/v2"
import type { Logger } from "../logger"
import type { PluginConfig } from "../config"
import { isMessageCompacted } from "../shared-utils"
import { generatePartHash } from "../utils/hash"

/**
 * Filter out step-start and step-finish parts from messages.
 * These are structural markers that consume tokens but provide no semantic value.
 * Should be called during context rendering when pruneStepMarkers is enabled.
 */
export const filterStepMarkers = (
    messages: WithParts[],
    config: PluginConfig,
    logger: Logger,
): void => {
    if (!config.strategies.aggressivePruning?.pruneStepMarkers) {
        return
    }

    let totalRemoved = 0
    for (const msg of messages) {
        const parts = Array.isArray(msg.parts) ? msg.parts : []
        const originalLength = parts.length

        msg.parts = parts.filter((part) => {
            if (part.type === "step-start" || part.type === "step-finish") {
                return false
            }
            return true
        })

        totalRemoved += originalLength - msg.parts.length
    }

    if (totalRemoved > 0) {
        logger.debug(`Filtered ${totalRemoved} step marker parts`)
    }
}

const PRUNED_TOOL_ERROR_INPUT_REPLACEMENT = "[input removed due to failed tool call]"
const PRUNED_QUESTION_INPUT_REPLACEMENT = "[questions removed - see output for user's answers]"
const PRUNED_MESSAGE_PART_REPLACEMENT = "[Assistant message part removed to save context]"
const PRUNED_REASONING_REPLACEMENT = "[Reasoning redacted to save context]"
const PRUNED_FILE_PART_REPLACEMENT = "[File attachment masked to save context]"

/**
 * Check if a part is a file attachment part.
 * File parts contain binary or large data that can be masked.
 */
function isFilePart(part: Part): boolean {
    return (
        part.type === "file" ||
        (part.type === "tool" &&
            part.state?.status === "completed" &&
            (part.state as any).attachments !== undefined)
    )
}

/**
 * Create a breadcrumb for a file part.
 * Returns a short summary like "[File: image.png, 12KB]" or "[2 attachments]"
 */
function createFilePartBreadcrumb(part: Part): string {
    if (part.type === "file") {
        const filePart = part as any
        const name = filePart.name || filePart.url || "unnamed"
        const size = filePart.size ? `${Math.round(filePart.size / 1024)}KB` : "unknown size"
        return `[File: ${name}, ${size}]`
    }

    if (part.type === "tool" && (part.state as any)?.attachments) {
        const attachments = (part.state as any).attachments
        const count = Array.isArray(attachments) ? attachments.length : 1
        return `[${count} file attachment${count > 1 ? "s" : ""}]`
    }

    return "[file]"
}

/**
 * Mask file parts in messages to save context.
 * Replaces file attachments with breadcrumbs.
 * Should be called during context rendering when pruneFiles is enabled.
 */
export const maskFileParts = (
    messages: WithParts[],
    config: PluginConfig,
    logger: Logger,
    state: SessionState,
): void => {
    if (!config.strategies.aggressivePruning?.pruneFiles) {
        return
    }

    let totalMasked = 0
    for (const msg of messages) {
        const parts = Array.isArray(msg.parts) ? msg.parts : []
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i]
            if (part && isFilePart(part)) {
                const breadcrumb = createFilePartBreadcrumb(part)
                const hash = generatePartHash(JSON.stringify(part))

                // Store the masked part hash in registry
                state.hashRegistry.fileParts.set(hash, breadcrumb)

                // Replace with breadcrumb part
                parts[i] = {
                    type: "text" as const,
                    text: breadcrumb,
                } as any

                totalMasked++
            }
        }
    }

    if (totalMasked > 0) {
        logger.debug(`Masked ${totalMasked} file parts`)
    }
}

/** Keys to preserve when stripping tool inputs (metadata only) */
const INPUT_METADATA_KEYS: Record<string, string[]> = {
    read: ["filePath", "offset", "limit"],
    write: ["filePath"],
    edit: ["filePath"],
    glob: ["pattern", "path"],
    grep: ["pattern", "path", "include"],
    bash: ["command", "description", "workdir"],
    webfetch: ["url", "format"],
    websearch: ["query"],
    task: ["description", "subagent_type"],
    skill: ["name"],
    todowrite: [],
    todoread: [],
}

/**
 * Strip tool input to metadata-only object.
 * Removes verbose content like file contents, keeping only key identifiers.
 */
function stripInputToMetadata(
    tool: string,
    input: Record<string, unknown>,
): Record<string, unknown> {
    const keysToKeep = INPUT_METADATA_KEYS[tool] || Object.keys(input).slice(0, 3)
    const stripped: Record<string, unknown> = {}

    for (const key of keysToKeep) {
        if (input[key] !== undefined) {
            const value = input[key]
            if (typeof value === "string" && value.length > 100) {
                stripped[key] = value.slice(0, 97) + "..."
            } else {
                stripped[key] = value
            }
        }
    }

    return stripped
}

/**
 * Generates a deterministic hash for message parts.
 * Format: xxxxxx (6 hex chars from SHA256 of content)
 */
function generateMessagePartHash(content: string): string {
    return generatePartHash(content)
}

/**
 * Injects hash identifiers into tool outputs for hash-based discarding.
 * Format: xxxxxx\n<original output> (6 hex chars from SHA256, no prefix)
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

            // Skip if already compacted by OpenCode (check time.compacted field)
            if (part.state.time?.compacted) {
                continue
            }

            const hash = state.hashRegistry.callIds.get(part.callID)
            if (!hash) {
                continue
            }

            // Skip if already has hash prefix (format: xxxxxx - 6 hex chars)
            if (part.state.output && /^[a-f0-9]{6}/i.test(part.state.output)) {
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
 * Format: xxxxxx\n<original text> (6 hex chars from SHA256, no prefix)
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

            // Skip if already has hash prefix (format: xxxxxx - 6 hex chars)
            if (/^[a-f0-9]{6}/i.test(part.text)) {
                continue
            }

            const partId = `${messageId}:${partIndex}`

            // Skip if already pruned
            if (state.prune.messagePartIds.includes(partId)) {
                continue
            }

            // Check if we already have a hash for this part
            let hash = state.hashRegistry.messagePartIds.get(partId)
            if (!hash) {
                // Generate new hash from content with collision handling
                const baseHash = generateMessagePartHash(part.text)
                let finalHash = baseHash
                let seq = 2
                while (state.hashRegistry.messages.has(finalHash)) {
                    finalHash = `${baseHash}_${seq}`
                    seq++
                }
                hash = finalHash
                state.hashRegistry.messages.set(hash, partId)
                state.hashRegistry.messagePartIds.set(partId, hash)
                logger.debug(`Generated hash ${hash} for assistant text part ${partId}`)
            }

            // Prepend hash to text
            part.text = `${hash}\n${part.text}`
            logger.debug(`Injected hash ${hash} into assistant text part`)
        }
    }
}

/**
 * Generates a deterministic hash for reasoning parts.
 * Format: xxxxxx (6 hex chars from SHA256 of content)
 */
function generateReasoningPartHash(content: string): string {
    return generatePartHash(content)
}

/**
 * Injects hash identifiers into reasoning blocks for hash-based discarding.
 * Format: xxxxxx\n<original reasoning> (6 hex chars from SHA256, no prefix)
 *
 * This allows agents to discard their own thinking/reasoning blocks when they're
 * no longer needed, saving significant tokens in long conversations.
 */
export const injectHashesIntoReasoningBlocks = (
    state: SessionState,
    config: PluginConfig,
    messages: WithParts[],
    logger: Logger,
): void => {
    // Skip if feature is disabled
    if (!config.tools?.settings?.enableReasoningPruning) {
        return
    }

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

            // Only process reasoning parts
            if (part.type !== "reasoning" || !part.text) {
                continue
            }

            // Skip if already has hash prefix (format: xxxxxx - 6 hex chars)
            if (/^[a-f0-9]{6}/i.test(part.text)) {
                continue
            }

            const partId = `${messageId}:${partIndex}`

            // Skip if already pruned
            if (state.prune.reasoningPartIds.includes(partId)) {
                continue
            }

            // Check if we already have a hash for this part
            let hash = state.hashRegistry.reasoningPartIds.get(partId)
            if (!hash) {
                // Generate new hash from content with collision handling
                const baseHash = generateReasoningPartHash(part.text)
                let finalHash = baseHash
                let seq = 2
                while (state.hashRegistry.reasoning.has(finalHash)) {
                    finalHash = `${baseHash}_${seq}`
                    seq++
                }
                hash = finalHash
                state.hashRegistry.reasoning.set(hash, partId)
                state.hashRegistry.reasoningPartIds.set(partId, hash)
                logger.debug(`Generated hash ${hash} for reasoning part ${partId}`)
            }

            // Prepend hash to text
            part.text = `${hash}\n${part.text}`
            logger.debug(`Injected hash ${hash} into reasoning part`)
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
    const prunedReasoningPartIds = new Set(state.prune.reasoningPartIds)

    // Early exit if nothing to prune
    if (
        prunedToolIds.size === 0 &&
        prunedMessagePartIds.size === 0 &&
        prunedReasoningPartIds.size === 0
    ) {
        return
    }

    const fullyForget = config.tools.discard.fullyForget ?? true

    // Single pass over all messages and parts
    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) {
            continue
        }

        const parts = Array.isArray(msg.parts) ? msg.parts : []
        const messageId = msg.info.id
        const isAssistant = msg.info.role === "assistant"

        // Filter out parts if fullyForget is enabled
        if (fullyForget && prunedToolIds.size > 0) {
            const originalLength = parts.length
            msg.parts = parts.filter((part) => {
                if (part.type === "tool" && part.callID && prunedToolIds.has(part.callID)) {
                    logger.debug(`Fully forgot tool part ${part.callID} (${part.tool})`)
                    return false
                }
                return true
            })
            const removedCount = originalLength - msg.parts.length
            if (removedCount > 0) {
                logger.debug(`Removed ${removedCount} tool parts via fullyForget`)
            }
            // Continue with remaining parts for message/reasoning pruning
        }

        for (let partIndex = 0; partIndex < parts.length; partIndex++) {
            const part = parts[partIndex]
            if (!part) continue

            // Handle tool parts (only if fullyForget is disabled)
            if (
                !fullyForget &&
                part.type === "tool" &&
                part.callID &&
                prunedToolIds.has(part.callID)
            ) {
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
                        // FIX INPUT LEAK: Strip input to metadata-only
                        if (part.state.input && typeof part.state.input === "object") {
                            part.state.input = stripInputToMetadata(
                                part.tool,
                                part.state.input as Record<string, unknown>,
                            )
                        }
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

            // Handle reasoning parts
            if (isAssistant && part.type === "reasoning" && prunedReasoningPartIds.size > 0) {
                const partId = `${messageId}:${partIndex}`
                if (prunedReasoningPartIds.has(partId)) {
                    part.text = PRUNED_REASONING_REPLACEMENT
                    logger.debug(`Pruned reasoning part ${partId}`)
                }
            }
        }
    }
}
