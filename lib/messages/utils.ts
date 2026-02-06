import { createHash } from "crypto"
import { isMessageCompacted } from "../shared-utils"
import type { SessionState, WithParts } from "../state"
import type { UserMessage } from "@opencode-ai/sdk/v2"
import { getPruneCache } from "../state/utils"
import type { Logger } from "../logger"

const SYNTHETIC_MESSAGE_ID = "msg_01234567890123456789012345"

/**
 * Stable JSON stringify with sorted keys for deterministic hashing.
 * Ensures that {a: 1, b: 2} and {b: 2, a: 1} produce the same string.
 */
export function stableStringify(obj: unknown): string {
    if (obj === null || obj === undefined) {
        return JSON.stringify(obj)
    }
    if (typeof obj !== "object") {
        return JSON.stringify(obj)
    }
    if (Array.isArray(obj)) {
        return "[" + obj.map(stableStringify).join(",") + "]"
    }
    const keys = Object.keys(obj).sort()
    return (
        "{" +
        keys
            .map(
                (k) =>
                    `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`,
            )
            .join(",") +
        "}"
    )
}

/**
 * Generate a short, stable hash for a tool call.
 * Format: xxxxxx (e.g., a1b2c3)
 * - 6 hex chars from SHA256 hash of stable-stringified params
 */
export function generateToolHash(_tool: string, params: unknown): string {
    const paramsStr = stableStringify(params)
    const hash = createHash("sha256").update(paramsStr).digest("hex").substring(0, 6)
    return hash
}
const SYNTHETIC_PART_ID = "prt_01234567890123456789012345"
const SYNTHETIC_CALL_ID = "call_01234567890123456789012345"

export const isDeepSeekOrKimi = (providerID: string, modelID: string): boolean => {
    const lowerProviderID = providerID.toLowerCase()
    const lowerModelID = modelID.toLowerCase()
    return (
        lowerProviderID.includes("deepseek") ||
        lowerProviderID.includes("kimi") ||
        lowerModelID.includes("deepseek") ||
        lowerModelID.includes("kimi")
    )
}

export const createSyntheticUserMessage = (
    baseMessage: WithParts,
    content: string,
    variant?: string,
): WithParts => {
    const userInfo = baseMessage.info as UserMessage
    const now = Date.now()

    return {
        info: {
            id: SYNTHETIC_MESSAGE_ID,
            sessionID: userInfo.sessionID,
            role: "user" as const,
            agent: userInfo.agent || "code",
            model: userInfo.model,
            time: { created: now },
            ...(variant !== undefined && { variant }),
        },
        parts: [
            {
                id: SYNTHETIC_PART_ID,
                sessionID: userInfo.sessionID,
                messageID: SYNTHETIC_MESSAGE_ID,
                type: "text",
                text: content,
            },
        ],
    }
}

export const createSyntheticAssistantMessage = (
    baseMessage: WithParts,
    content: string,
    variant?: string,
): WithParts => {
    const userInfo = baseMessage.info as UserMessage
    const now = Date.now()

    return {
        info: {
            id: SYNTHETIC_MESSAGE_ID,
            sessionID: userInfo.sessionID,
            role: "assistant" as const,
            agent: userInfo.agent || "code",
            parentID: userInfo.id,
            modelID: userInfo.model.modelID,
            providerID: userInfo.model.providerID,
            mode: "default",
            path: {
                cwd: "/",
                root: "/",
            },
            time: { created: now, completed: now },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            ...(variant !== undefined && { variant }),
        },
        parts: [
            {
                id: SYNTHETIC_PART_ID,
                sessionID: userInfo.sessionID,
                messageID: SYNTHETIC_MESSAGE_ID,
                type: "text",
                text: content,
            },
        ],
    }
}

export const createSyntheticToolPart = (baseMessage: WithParts, content: string) => {
    const userInfo = baseMessage.info as UserMessage
    const now = Date.now()

    return {
        id: SYNTHETIC_PART_ID,
        sessionID: userInfo.sessionID,
        messageID: baseMessage.info.id,
        type: "tool" as const,
        callID: SYNTHETIC_CALL_ID,
        tool: "context_info",
        state: {
            status: "completed" as const,
            input: {},
            output: content,
            title: "Context Info",
            metadata: {},
            time: { start: now, end: now },
        },
    }
}

/**
 * Extracts a human-readable key from tool metadata for display purposes.
 */
export const extractParameterKey = (tool: string, parameters: any): string => {
    if (!parameters) return ""

    if (tool === "read" && parameters.filePath) {
        const offset = parameters.offset
        const limit = parameters.limit
        if (offset !== undefined && limit !== undefined) {
            return `${parameters.filePath} (lines ${offset}-${offset + limit})`
        }
        if (offset !== undefined) {
            return `${parameters.filePath} (lines ${offset}+)`
        }
        if (limit !== undefined) {
            return `${parameters.filePath} (lines 0-${limit})`
        }
        return parameters.filePath
    }
    if (tool === "write" && parameters.filePath) {
        return parameters.filePath
    }
    if (tool === "edit" && parameters.filePath) {
        return parameters.filePath
    }

    if (tool === "list") {
        return parameters.path || "(current directory)"
    }
    if (tool === "glob") {
        if (parameters.pattern) {
            const pathInfo = parameters.path ? ` in ${parameters.path}` : ""
            return `"${parameters.pattern}"${pathInfo}`
        }
        return "(unknown pattern)"
    }
    if (tool === "grep") {
        if (parameters.pattern) {
            const pathInfo = parameters.path ? ` in ${parameters.path}` : ""
            return `"${parameters.pattern}"${pathInfo}`
        }
        return "(unknown pattern)"
    }

    if (tool === "bash") {
        if (parameters.description) return parameters.description
        if (parameters.command) {
            return parameters.command.length > 50
                ? parameters.command.substring(0, 50) + "..."
                : parameters.command
        }
    }

    if (tool === "webfetch" && parameters.url) {
        return parameters.url
    }
    if (tool === "websearch" && parameters.query) {
        return `"${parameters.query}"`
    }
    if (tool === "codesearch" && parameters.query) {
        return `"${parameters.query}"`
    }

    if (tool === "todowrite") {
        return `${parameters.todos?.length || 0} todos`
    }
    if (tool === "todoread") {
        return "read todo list"
    }

    if (tool === "task" && parameters.description) {
        return parameters.description
    }
    if (tool === "skill" && parameters.name) {
        return parameters.name
    }

    if (tool === "lsp") {
        const op = parameters.operation || "lsp"
        const path = parameters.filePath || ""
        const line = parameters.line
        const char = parameters.character
        if (path && line !== undefined && char !== undefined) {
            return `${op} ${path}:${line}:${char}`
        }
        if (path) {
            return `${op} ${path}`
        }
        return op
    }

    if (tool === "question") {
        const questions = parameters.questions
        if (Array.isArray(questions) && questions.length > 0) {
            const headers = questions
                .map((q: any) => q.header || "")
                .filter(Boolean)
                .slice(0, 3)

            const count = questions.length
            const plural = count > 1 ? "s" : ""

            if (headers.length > 0) {
                const suffix = count > 3 ? ` (+${count - 3} more)` : ""
                return `${count} question${plural}: ${headers.join(", ")}${suffix}`
            }
            return `${count} question${plural}`
        }
        return "question"
    }

    const paramStr = JSON.stringify(parameters)
    if (paramStr === "{}" || paramStr === "[]" || paramStr === "null") {
        return ""
    }
    return paramStr.substring(0, 50)
}

export function buildToolIdList(state: SessionState, messages: WithParts[]): string[] {
    const toolIds: string[] = []
    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) {
            continue
        }
        const parts = Array.isArray(msg.parts) ? msg.parts : []
        if (parts.length > 0) {
            for (const part of parts) {
                if (part.type === "tool" && part.callID && part.tool) {
                    toolIds.push(part.callID)
                }
            }
        }
    }
    return toolIds
}

export const isIgnoredUserMessage = (message: WithParts): boolean => {
    const parts = Array.isArray(message.parts) ? message.parts : []
    if (parts.length === 0) {
        return true
    }

    for (const part of parts) {
        if (!(part as any).ignored) {
            return false
        }
    }

    return true
}

import type { TargetTypeResult } from "../strategies/_types"
import { extractHashTags } from "../state/hash-registry"

/**
 * Scan messages and register any *_hash tags found
 * This allows detection of non-standard hash types like thinking_hash
 */
export function scanAndRegisterHashTags(
    messages: WithParts[],
    state: SessionState,
    logger: Logger,
): void {
    for (const msg of messages) {
        const parts = Array.isArray(msg.parts) ? msg.parts : []

        for (const part of parts) {
            if (!part) continue

            // Extract content based on part type
            let content = ""
            if (part.type === "text" && part.text) {
                content = part.text
            } else if (part.type === "reasoning" && (part as any).text) {
                content = (part as any).text
            } else if (part.type === "tool" && part.state?.status === "completed") {
                content = (part.state as any).output || ""
            }

            if (!content) continue

            // Extract all hash tags from content
            const hashes = extractHashTags(content)

            for (const { type, hash } of hashes) {
                // Skip if already registered in standard registries
                if (
                    state.hashRegistry.calls.has(hash) ||
                    state.hashRegistry.messages.has(hash) ||
                    state.hashRegistry.reasoning.has(hash)
                ) {
                    continue
                }

                // Register based on type
                const messageId = msg.info.id

                if (type === "thinking" || type === "thinking_hash") {
                    // Map thinking_hash to reasoning_hash
                    const partId = `${messageId}:reasoning`
                    state.hashRegistry.reasoning.set(hash, partId)
                    state.hashRegistry.reasoningPartIds.set(partId, hash)
                    logger.debug(`Registered thinking_hash ${hash} as reasoning_hash for ${partId}`)
                } else if (type === "custom" || type === "custom_hash") {
                    // Register custom hashes as reasoning (safest default)
                    const partId = `${messageId}:custom`
                    state.hashRegistry.reasoning.set(hash, partId)
                    state.hashRegistry.reasoningPartIds.set(partId, hash)
                    logger.debug(`Registered custom_hash ${hash} as reasoning_hash for ${partId}`)
                } else if (
                    type !== "tool" &&
                    type !== "tool_hash" &&
                    type !== "message" &&
                    type !== "message_hash" &&
                    type !== "reasoning" &&
                    type !== "reasoning_hash"
                ) {
                    // Unknown type - register as reasoning for safety
                    const partId = `${messageId}:${type}`
                    state.hashRegistry.reasoning.set(hash, partId)
                    state.hashRegistry.reasoningPartIds.set(partId, hash)
                    logger.debug(
                        `Registered unknown hash type ${type} (${hash}) as reasoning for ${partId}`,
                    )
                }
            }
        }
    }
}

/**
 * Detect target type using state map lookups (no prefix-based detection).
 * Supports: tool_hash, message_hash, reasoning_hash, and any registered hash
 * Format: 6 hex chars (e.g., a1b2c3) for all hash types
 */
export function detectTargetType(target: string, state: SessionState): TargetTypeResult {
    // Lookup-based detection (no prefix required)
    if (state.hashRegistry.calls.has(target)) {
        return "tool_hash"
    }
    if (state.hashRegistry.messages.has(target)) {
        return "message_hash"
    }
    if (state.hashRegistry.reasoning.has(target)) {
        return "reasoning_hash"
    }

    // For unknown targets, return "unknown_hash" to allow flexible handling
    // The caller should decide how to handle unknown hashes
    return "unknown_hash"
}

/**
 * Resolve a hash to a human-readable display name for status bar notifications.
 * For tool hashes: returns tool name (e.g., "read", "bash")
 * For message hashes: returns "message part"
 * For reasoning hashes: returns "thinking block"
 * Falls back to raw hash if resolution fails.
 *
 * @param hash - The 6-char hash to resolve
 * @param state - Session state containing hash registry and tool parameters
 * @param workingDirectory - Optional working directory for path shortening (reserved for future use)
 * @param targetType - Optional hint for target type when hash lookup fails
 * @returns Human-readable display name or raw hash as fallback
 */
export function resolveTargetDisplayName(
    hash: string,
    state?: SessionState,
    workingDirectory?: string,
    targetType?: "tool" | "message" | "reasoning",
): string {
    // If no state provided, return raw hash
    if (!state) {
        return hash
    }

    // Try tool hash first (most common case)
    const callId = state.hashRegistry.calls.get(hash)
    if (callId) {
        const toolEntry = state.toolParameters.get(callId)
        if (toolEntry) {
            return toolEntry.tool
        }
    }

    // Try message hash
    if (state.hashRegistry.messages.has(hash)) {
        return "message part"
    }

    // Try reasoning hash
    if (state.hashRegistry.reasoning.has(hash)) {
        return "thinking block"
    }

    // Use targetType hint if provided
    if (targetType === "message") {
        return "message part"
    }
    if (targetType === "reasoning") {
        return "thinking block"
    }

    // Fallback to raw hash
    return hash
}

/**
 * Pluralize a tool name for display.
 * read → reads, grep → greps, glob → globs, task → tasks, etc.
 */
function pluralizeToolName(tool: string): string {
    // Handle special cases
    if (tool === "bash") return "bashes"
    if (tool === "webfetch") return "fetches"
    if (tool === "websearch" || tool === "codesearch") return "searches"
    // Default: add 's'
    return `${tool}s`
}

/**
 * Group hashes by their tool name, looking up from state.
 * Returns a map of pluralized tool names to arrays of hashes.
 * Only includes unpruned hashes (excludes those in state.prune.toolIds).
 */
export function groupHashesByToolName(state: SessionState): Record<string, string[]> {
    const grouped: Record<string, string[]> = {}

    // Use cached Set for O(1) lookup
    const { prunedToolIds } = getPruneCache(state)

    // Iterate through all known hashes
    for (const [hash, callId] of state.hashRegistry.calls.entries()) {
        // Skip if already pruned
        if (prunedToolIds.has(callId)) {
            continue
        }

        // Look up tool name from toolParameters
        const toolEntry = state.toolParameters.get(callId)
        if (!toolEntry) {
            continue // Skip if no metadata available
        }

        const toolName = pluralizeToolName(toolEntry.tool)

        // Group by tool name
        if (!grouped[toolName]) {
            grouped[toolName] = []
        }
        grouped[toolName].push(hash)
    }

    return grouped
}

/**
 * Format grouped hashes into a display string for the reminder.
 * Output format: "reads: a1b2c3, d4e5f6\ngreps: 123abc\nglobs: 67890a"
 * Returns empty string if no hashes.
 */
export function formatHashInventory(grouped: Record<string, string[]>): string {
    const toolOrder = [
        "reads",
        "edits",
        "writes",
        "greps",
        "globs",
        "bashes",
        "tasks",
        "fetches",
        "searches",
    ]
    const lines: string[] = []

    // First, add tools in preferred order
    for (const toolName of toolOrder) {
        if (grouped[toolName] && grouped[toolName].length > 0) {
            lines.push(`${toolName}: ${grouped[toolName].join(", ")}`)
        }
    }

    // Then add any remaining tools not in the preferred order
    for (const [toolName, hashes] of Object.entries(grouped)) {
        if (!toolOrder.includes(toolName) && hashes.length > 0) {
            lines.push(`${toolName}: ${hashes.join(", ")}`)
        }
    }

    return lines.join("\n")
}

/**
 * Result of internal tag detection
 */
export interface DetectedTag {
    tagName: string
    content: string
    start: number
    end: number
}

/**
 * Find internal XML-like tags in content for segment-level hashing.
 * Matches <tag>...</tag> patterns, excluding standard *_hash tags.
 */
export function findInternalTags(content: string): DetectedTag[] {
    const results: DetectedTag[] = []
    // Match <tag>...</tag> where tag is NOT *_hash
    // Use non-greedy match for content to avoid capturing multiple tags as one
    const tagRegex = /<([a-zA-Z][a-zA-Z0-9_]*)>(.*?)<\/\1>/gs

    for (const match of content.matchAll(tagRegex)) {
        const tagName = match[1]
        const tagContent = match[2]

        if (!tagName || tagContent === undefined) {
            continue
        }

        // Skip standard *_hash tags and common structural tags
        if (
            tagName.endsWith("_hash") ||
            tagName === "message" ||
            tagName === "part" ||
            tagName === "tool" ||
            tagName === "thought" // Already handled by reasoning blocks in many cases
        ) {
            continue
        }

        results.push({
            tagName,
            content: tagContent,
            start: match.index!,
            end: match.index! + match[0].length,
        })
    }

    return results
}
