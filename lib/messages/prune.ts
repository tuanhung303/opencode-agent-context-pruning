import type { SessionState, WithParts } from "../state"
import type { Part } from "@opencode-ai/sdk/v2"
import type { Logger } from "../logger"
import type { PluginConfig } from "../config"
import { isMessageCompacted, isMessageCompleted } from "../shared-utils"
import { generatePartHash } from "../utils/hash"
import { getPruneCache } from "../state/utils"

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

// Reserved for future use - keeping for API consistency
const _PRUNED_TOOL_ERROR_INPUT_REPLACEMENT = "[input removed due to failed tool call]"
const _PRUNED_QUESTION_INPUT_REPLACEMENT = "[questions removed - see output for user's answers]"
const _PRUNED_FILE_PART_REPLACEMENT = "[File attachment masked to save context]"
void _PRUNED_TOOL_ERROR_INPUT_REPLACEMENT
void _PRUNED_QUESTION_INPUT_REPLACEMENT
void _PRUNED_FILE_PART_REPLACEMENT

/** Preview length for pruned content placeholders */
const PREVIEW_LENGTH = 20
const PRUNED_SUFFIX = "...[pruned]"

/**
 * Create a pruned placeholder with content preview for traceability.
 * Format: "The quick brown fox...[pruned]"
 */
function createPrunedPlaceholder(originalText: string): string {
    const preview = originalText.slice(0, PREVIEW_LENGTH).replace(/\n/g, " ")
    return `${preview}${PRUNED_SUFFIX}`
}

/**
 * Create a pruned tool placeholder showing tool name for layout consistency.
 * Format: "[read() output pruned]" or "[glob() output pruned]"
 */
function createPrunedToolPlaceholder(toolName: string): string {
    return `[${toolName}() output pruned]`
}
// Hash tag names for trailing format
const TOOL_HASH_TAG = "tool_hash"
const MESSAGE_HASH_TAG = "message_hash"
const REASONING_HASH_TAG = "reasoning_hash"

/** Create trailing hash tag */
const createHashTag = (tagName: string, hash: string): string =>
    `\n<${tagName}>${hash}</${tagName}>`

/** Check if content already has hash tag with specific hash anywhere in content */
const hasHashTag = (content: string, tagName: string, hash: string): boolean => {
    const regex = new RegExp(`<${tagName}>${hash}</${tagName}>`, "i")
    return regex.test(content)
}

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
 * @internal Reserved for future use in input stripping strategies
 */
function _stripInputToMetadata(
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
void _stripInputToMetadata

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

        // Skip messages still streaming - only inject into completed messages
        if (!isMessageCompleted(msg)) {
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
            // Skip if already has this specific hash tag anywhere in content
            if (part.state.output && hasHashTag(part.state.output, TOOL_HASH_TAG, hash)) {
                continue
            }

            // Append trailing hash tag
            if (part.state.output) {
                part.state.output = `${part.state.output}${createHashTag(TOOL_HASH_TAG, hash)}`
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

        // Skip messages still streaming - only inject into completed messages
        if (!isMessageCompleted(msg)) {
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

            // Skip if this specific hash is already in the content
            if (hasHashTag(part.text, MESSAGE_HASH_TAG, hash)) {
                continue
            }

            // Inject hash tag if enabled (default: true)
            if (config.tools?.settings?.enableVisibleAssistantHashes !== false) {
                part.text = `${part.text}${createHashTag(MESSAGE_HASH_TAG, hash)}`
                logger.debug(`Injected hash ${hash} into assistant text part`)
            } else {
                logger.debug(`Registered hash ${hash} for assistant text part (no injection)`)
            }
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

        // Skip messages still streaming - only inject into completed messages
        if (!isMessageCompleted(msg)) {
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

            // Skip if this specific hash is already in the content
            if (hasHashTag(part.text, REASONING_HASH_TAG, hash)) {
                continue
            }

            // Append trailing hash tag
            part.text = `${part.text}${createHashTag(REASONING_HASH_TAG, hash)}`
            logger.debug(`Injected hash ${hash} into reasoning part`)
        }
    }
}

/**
 * Ensures reasoning_content is synced on all assistant messages with tool calls.
 * CRITICAL for thinking mode API compatibility (DeepSeek, Kimi, etc.)
 *
 * When thinking mode is enabled, APIs require reasoning_content to exist on ALL
 * assistant messages that have tool calls. This function ensures the field is
 * populated from reasoning parts, regardless of whether pruning is active.
 */
export const ensureReasoningContentSync = (
    state: SessionState,
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

        const parts = Array.isArray(msg.parts) ? msg.parts : []

        // Check if message has tool calls
        const hasToolCalls = parts.some((p: any) => p.type === "tool" && p.callID)
        if (!hasToolCalls) {
            continue
        }

        // Skip if reasoning_content already exists
        if ((msg.info as any).reasoning_content) {
            continue
        }

        // Find reasoning content from parts
        const reasoningPart = parts.find((p: any) => p.type === "reasoning" && p.text)
        if (reasoningPart && (reasoningPart as any).text) {
            ;(msg.info as any).reasoning_content = (reasoningPart as any).text
            logger.debug(`Synced reasoning_content for assistant message: ${msg.info.id}`)
        }
    }
}

/**
 * Creates a compact breadcrumb string for pruned tool outputs.
 * Format: [Output removed...] tool({param: "value"}) → status
 *
 * This preserves key metadata so the agent can understand what was pruned
 * without needing to re-read the content.
 * @internal Reserved for future use in breadcrumb generation
 */
const _createPrunedOutputBreadcrumb = (
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
void _createPrunedOutputBreadcrumb

export const prune = (
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
    messages: WithParts[],
): void => {
    // Use cached Sets for O(1) lookup
    const { prunedToolIds, prunedMessagePartIds, prunedReasoningPartIds } = getPruneCache(state)

    // Early exit if nothing to prune
    if (
        prunedToolIds.size === 0 &&
        prunedMessagePartIds.size === 0 &&
        prunedReasoningPartIds.size === 0
    ) {
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

        // Track if this message has/had tool calls (for thinking mode API compatibility)
        let messageHasToolCalls = false
        let reasoningContent: string | undefined

        for (let partIndex = 0; partIndex < parts.length; partIndex++) {
            const part = parts[partIndex]
            if (!part) continue

            // Track tool calls (internal format uses "tool" with callID)
            if (part.type === "tool" && (part as any).callID) {
                messageHasToolCalls = true
            }

            // Capture reasoning content for later use
            if (isAssistant && part.type === "reasoning" && part.text) {
                reasoningContent = part.text
            }

            // Handle pruned tool parts - replace with placeholder for layout consistency
            if (part.type === "tool" && part.callID && prunedToolIds.has(part.callID)) {
                const toolName = part.tool || "tool"
                const placeholder = createPrunedToolPlaceholder(toolName)
                // Replace the tool part with a text placeholder part
                parts[partIndex] = {
                    type: "text" as const,
                    text: placeholder,
                } as any
                logger.debug(`Pruned tool part ${part.callID} (${toolName})`)
                continue
            }

            // Handle assistant text parts - keep preview for traceability
            if (isAssistant && part.type === "text" && prunedMessagePartIds.size > 0) {
                const partId = `${messageId}:${partIndex}`
                if (prunedMessagePartIds.has(partId)) {
                    const originalText = part.text || ""
                    part.text = createPrunedPlaceholder(originalText)
                    logger.debug(`Pruned assistant message part ${partId}`)
                }
            }

            // Handle reasoning parts - keep preview for traceability
            // CRITICAL: Also sync msg.info.reasoning_content for thinking mode API compatibility
            if (isAssistant && part.type === "reasoning" && prunedReasoningPartIds.size > 0) {
                const partId = `${messageId}:${partIndex}`
                if (prunedReasoningPartIds.has(partId)) {
                    const originalText = part.text || ""
                    const placeholder = createPrunedPlaceholder(originalText)
                    part.text = placeholder
                    reasoningContent = placeholder // Update captured content
                    logger.debug(`Pruned reasoning part ${partId}`)
                }
            }
        }

        // CRITICAL: Ensure reasoning_content is set on assistant messages with tool calls
        // When thinking mode is enabled, API requires reasoning_content on ALL assistant messages
        // that have tool calls. This must be done AFTER processing all parts.
        if (isAssistant && messageHasToolCalls && reasoningContent) {
            if (!(msg.info as any).reasoning_content) {
                ;(msg.info as any).reasoning_content = reasoningContent
                logger.debug(
                    `Set reasoning_content on assistant message with tool calls: ${messageId}`,
                )
            }
        }
    }
}

/**
 * Regex for matching any *_hash XML tag pattern
 * Matches: <anything_hash>xxxxxx</anything_hash> or <anything_hash>xxxxxx_N</anything_hash>
 * Supports collision suffix (_2, _3, etc.) for hash deduplication
 */
const HASH_TAG_REGEX = /<([a-zA-Z_][a-zA-Z0-9_]*)_hash>[a-f0-9]{6}(?:_\d+)?<\/\1_hash>/gi

/**
 * Strip all *_hash tags from a string
 */
export function stripHashTags(content: string): string {
    return content.replace(HASH_TAG_REGEX, "")
}

/**
 * Strip all hash tags from all message parts before output
 * NOTE: We intentionally DO NOT strip from tool outputs - the LLM needs to see
 * hash tags to use the context tool for pruning. Only strip from text/reasoning
 * parts that might leak to user-facing UI.
 */
export function stripAllHashTagsFromMessages(
    messages: WithParts[],
    _state: SessionState,
    logger: Logger,
): void {
    let totalStripped = 0

    for (const msg of messages) {
        const parts = Array.isArray(msg.parts) ? msg.parts : []

        for (const part of parts) {
            if (!part) continue

            // Strip from text parts (user-facing)
            if (part.type === "text" && part.text) {
                const original = part.text
                part.text = stripHashTags(part.text)
                if (part.text !== original) {
                    totalStripped++
                }
            }

            // DO NOT strip from tool outputs - LLM needs to see hashes for context tool
            // The hashes in tool outputs are how the LLM knows what to prune

            // Strip from reasoning parts (user-facing in some UIs)
            if (part.type === "reasoning" && part.text) {
                const original = part.text
                part.text = stripHashTags(part.text)
                if (part.text !== original) {
                    totalStripped++
                }
            }
        }
    }

    if (totalStripped > 0) {
        logger.debug(`Stripped ${totalStripped} hash tag(s) from text/reasoning parts`)
    }
}
