import type { SessionState } from "./types"

/**
 * Generic hash entry supporting any *_hash type
 */
export interface HashEntry {
    type: string // "tool", "message", "reasoning", "thinking", "segment", etc.
    hash: string // 6-char hex value
    id: string // call_xxx or msg_xxx:part
    toolName?: string // For tool_hash: "read", "bash", "glob"
    preview: string // First 15 chars of content for display
    start?: number // For segments: start offset
    end?: number // For segments: end offset
    tagName?: string // For segments: name of the tag
}

/**
 * Unified hash registry supporting any *_hash pattern
 * Uses XML tag validation: <type_hash>xxxxxx</type_hash>
 */
export class UnifiedHashRegistry {
    // Main storage: hash -> entry
    private entries = new Map<string, HashEntry>()

    // Backward-compatible accessors
    get calls(): Map<string, string> {
        const result = new Map<string, string>()
        for (const [hash, entry] of this.entries) {
            if (entry.type === "tool" || entry.type === "tool_hash") {
                result.set(hash, entry.id)
            }
        }
        return result
    }

    get callIds(): Map<string, string> {
        const result = new Map<string, string>()
        for (const [hash, entry] of this.entries) {
            if (entry.type === "tool" || entry.type === "tool_hash") {
                result.set(entry.id, hash)
            }
        }
        return result
    }

    get messages(): Map<string, string> {
        const result = new Map<string, string>()
        for (const [hash, entry] of this.entries) {
            if (entry.type === "message" || entry.type === "message_hash") {
                result.set(hash, entry.id)
            }
        }
        return result
    }

    get messagePartIds(): Map<string, string> {
        const result = new Map<string, string>()
        for (const [hash, entry] of this.entries) {
            if (entry.type === "message" || entry.type === "message_hash") {
                result.set(entry.id, hash)
            }
        }
        return result
    }

    get reasoning(): Map<string, string> {
        const result = new Map<string, string>()
        for (const [hash, entry] of this.entries) {
            if (
                entry.type === "reasoning" ||
                entry.type === "reasoning_hash" ||
                entry.type === "thinking" ||
                entry.type === "thinking_hash"
            ) {
                result.set(hash, entry.id)
            }
        }
        return result
    }

    get reasoningPartIds(): Map<string, string> {
        const result = new Map<string, string>()
        for (const [hash, entry] of this.entries) {
            if (
                entry.type === "reasoning" ||
                entry.type === "reasoning_hash" ||
                entry.type === "thinking" ||
                entry.type === "thinking_hash"
            ) {
                result.set(entry.id, hash)
            }
        }
        return result
    }

    get segments(): Map<string, string> {
        const result = new Map<string, string>()
        for (const [hash, entry] of this.entries) {
            if (entry.type === "segment" || entry.type.endsWith("_segment")) {
                result.set(hash, entry.id)
            }
        }
        return result
    }

    get fileParts(): Map<string, string> {
        // Keep for backward compatibility - not used in new system
        return new Map()
    }

    // Generic methods
    has(hash: string): boolean {
        return this.entries.has(hash)
    }

    get(hash: string): HashEntry | undefined {
        return this.entries.get(hash)
    }

    set(hash: string, entry: HashEntry): void {
        this.entries.set(hash, entry)
    }

    delete(hash: string): boolean {
        return this.entries.delete(hash)
    }

    getAll(): Map<string, HashEntry> {
        return new Map(this.entries)
    }

    /**
     * Get display string for a hash
     * Tool: "🔧 {toolName}"
     * Others: "{icon} {preview}"
     */
    getDisplay(hash: string): string {
        const entry = this.entries.get(hash)
        if (!entry) return hash

        if (entry.toolName) {
            return `🔧 ${entry.toolName}`
        }

        const icon = this.getIconForType(entry.type)
        return `${icon} ${entry.preview}`
    }

    private getIconForType(type: string): string {
        switch (type) {
            case "tool":
            case "tool_hash":
                return "🔧"
            case "message":
            case "message_hash":
                return "💬"
            case "reasoning":
            case "reasoning_hash":
            case "thinking":
            case "thinking_hash":
                return "🧠"
            case "segment":
                return "✂"
            default:
                return "☯" // Generic/unclassified
        }
    }
}

/**
 * ACP hash tag regexes.
 *
 * Two families:
 *   Namespaced (tool/message/reasoning wrappers created by ACP):
 *     <acp:type prunable_hash="xxxxxx">content</acp:type>   (wrapping)
 *     <acp:type prunable_hash="xxxxxx"/>                     (self-closing ref)
 *
 *   Plain attribute (segments — existing XML tags in content):
 *     <file prunable_hash="xxxxxx">content</file>            (attribute on existing tag)
 *
 * Supports collision suffix (_2, _3, etc.) for hash deduplication.
 */

/** Namespaced wrapping: <acp:type prunable_hash="xxxxxx">...</acp:type> */
export const ACP_WRAP_REGEX =
    /<acp:([a-zA-Z_][a-zA-Z0-9_]*)\s+prunable_hash="([a-f0-9]{6}(?:_\d+)?)">([\s\S]*?)<\/acp:\1>/gi

/** Namespaced self-closing: <acp:type prunable_hash="xxxxxx"/> */
export const ACP_REF_REGEX =
    /<acp:([a-zA-Z_][a-zA-Z0-9_]*)\s+prunable_hash="([a-f0-9]{6}(?:_\d+)?)"\s*\/>/gi

/** Plain attribute on existing tags: <tag prunable_hash="xxxxxx">...</tag> (NOT acp: prefixed) */
export const ATTR_HASH_REGEX =
    /<(?!acp:)([a-zA-Z_][a-zA-Z0-9_]*)\s+prunable_hash="([a-f0-9]{6}(?:_\d+)?)">([\s\S]*?)<\/\1>/gi

/** Combined: matches all three formats (for extraction/detection) */
export const ALL_HASH_REGEX =
    /<(?:acp:)?([a-zA-Z_][a-zA-Z0-9_]*)\s+prunable_hash="([a-f0-9]{6}(?:_\d+)?)"(?:\s*\/>|>([\s\S]*?)<\/(?:acp:)?\1>)/gi

/**
 * Strip all hash tags from content.
 * - Namespaced wrappers: unwrapped (inner content preserved, acp tags removed)
 * - Namespaced self-closing refs: removed entirely
 * - Plain attribute tags: attribute removed, tag structure preserved
 */
export function stripHashTags(content: string): string {
    // 1. Unwrap namespaced wrappers: <acp:type prunable_hash="x">content</acp:type> → content
    let result = content.replace(ACP_WRAP_REGEX, "$3")
    // 2. Remove namespaced self-closing refs: <acp:type prunable_hash="x"/> → ""
    result = result.replace(ACP_REF_REGEX, "")
    // 3. Strip attribute from plain tags: <tag prunable_hash="x">content</tag> → <tag>content</tag>
    result = result.replace(ATTR_HASH_REGEX, "<$1>$3</$1>")
    return result
}

/**
 * Strip hash tags from content, but preserve specified types.
 * @param content - The text content to process
 * @param keepTypes - Array of type names to preserve (e.g., ["reasoning", "message"])
 * @returns Content with non-kept hash tags unwrapped/removed
 */
export function stripHashTagsSelective(content: string, keepTypes: string[]): string {
    const keepSet = new Set(keepTypes.map((t) => t.toLowerCase()))
    // 1. Unwrap namespaced wrappers, but preserve kept types entirely
    let result = content.replace(
        ACP_WRAP_REGEX,
        (match, type: string, _hash: string, inner: string) => {
            if (keepSet.has(type.toLowerCase())) return match
            return inner
        },
    )
    // 2. Remove namespaced self-closing refs, but preserve kept types
    result = result.replace(ACP_REF_REGEX, (match, type: string) => {
        if (keepSet.has(type.toLowerCase())) return match
        return ""
    })
    // 3. Strip attribute from plain tags, but preserve kept types
    result = result.replace(ATTR_HASH_REGEX, (match, tag: string, _hash: string, inner: string) => {
        if (keepSet.has(tag.toLowerCase())) return match
        return `<${tag}>${inner}</${tag}>`
    })
    return result
}

/**
 * Extract hash entries from content.
 * Parses all formats: namespaced wrapping, self-closing, and plain attribute tags.
 * Returns array of detected hash entries with type and hash.
 */
export function extractHashTags(
    content: string,
): Array<{ type: string; hash: string; position: number }> {
    const results: Array<{ type: string; hash: string; position: number }> = []

    for (const match of content.matchAll(ALL_HASH_REGEX)) {
        const type = match[1]
        const hash = match[2]
        if (type && hash) {
            results.push({
                type: type.toLowerCase(),
                hash,
                position: match.index!,
            })
        }
    }

    return results
}

/**
 * Convert legacy hash registry to unified registry
 */
export function convertToUnifiedRegistry(state: SessionState): UnifiedHashRegistry {
    const registry = new UnifiedHashRegistry()

    // Convert tool hashes
    for (const [hash, callId] of state.hashRegistry.calls) {
        const toolEntry = state.toolParameters.get(callId)
        registry.set(hash, {
            type: "tool",
            hash,
            id: callId,
            toolName: toolEntry?.tool,
            preview: toolEntry?.tool || "tool",
        })
    }

    // Convert message hashes
    for (const [hash, partId] of state.hashRegistry.messages) {
        registry.set(hash, {
            type: "message",
            hash,
            id: partId,
            preview: "message part",
        })
    }

    // Convert reasoning hashes
    for (const [hash, partId] of state.hashRegistry.reasoning) {
        registry.set(hash, {
            type: "reasoning",
            hash,
            id: partId,
            preview: "thinking block",
        })
    }

    return registry
}

/**
 * Detect target type for any hash in the unified registry
 * Returns the normalized type for the hash
 */
export function detectTargetType(hash: string, registry: UnifiedHashRegistry): string | null {
    const entry = registry.get(hash)
    if (!entry) return null

    // Normalize type
    const type = entry.type.toLowerCase()

    // Map thinking -> reasoning (alias)
    if (type === "thinking" || type === "thinking_hash") {
        return "reasoning_hash"
    }

    // Return normalized type with _hash suffix
    if (!type.endsWith("_hash")) {
        return `${type}_hash`
    }

    return type
}
