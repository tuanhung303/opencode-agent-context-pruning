import type { SessionState } from "./types"

/**
 * Generic hash entry supporting any *_hash type
 */
export interface HashEntry {
    type: string // "tool", "message", "reasoning", "thinking", etc.
    hash: string // 6-char hex value
    id: string // call_xxx or msg_xxx:part
    toolName?: string // For tool_hash: "read", "bash", "glob"
    preview: string // First 15 chars of content for display
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
            default:
                return "☯" // Generic/unclassified
        }
    }
}

/**
 * Regex for detecting any *_hash XML tag pattern
 * Matches: <anything_hash>xxxxxx</anything_hash>
 * Captures: type and hash value
 */
export const HASH_TAG_REGEX = /<([a-zA-Z_][a-zA-Z0-9_]*)_hash>([a-f0-9]{6})<\/\1_hash>/gi

/**
 * Strip all *_hash tags from content
 */
export function stripHashTags(content: string): string {
    return content.replace(HASH_TAG_REGEX, "")
}

/**
 * Extract hash entries from content
 * Returns array of detected hash entries with type and hash
 */
export function extractHashTags(
    content: string,
): Array<{ type: string; hash: string; position: number }> {
    const results: Array<{ type: string; hash: string; position: number }> = []

    for (const match of content.matchAll(HASH_TAG_REGEX)) {
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
