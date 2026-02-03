import { createHash } from "crypto"
import { isMessageCompacted } from "../shared-utils"
import type { SessionState, WithParts } from "../state"
import type { UserMessage } from "@opencode-ai/sdk/v2"

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
 * Format: x_xxxxx (e.g., r_a1b2c)
 * - First char is tool prefix (first letter of tool name)
 * - 5 hex chars from SHA256 hash of stable-stringified params
 */
export function generateToolHash(tool: string, params: unknown): string {
    const prefix = (tool[0] ?? "x").toLowerCase()
    const paramsStr = stableStringify(params)
    const hash = createHash("sha256").update(paramsStr).digest("hex").substring(0, 5)
    return `${prefix}_${hash}`
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

/**
 * Detect whether a target string is a tool hash, reasoning hash, or a pattern.
 * Tool hashes follow the format: x_xxxxx (e.g., r_a1b2c, g_d4e5f)
 * - First char is tool prefix (first letter of tool name)
 * - 5 hex chars from SHA256 hash
 * Reasoning hashes follow the format: th_xxxxx (th = thinking/reasoning)
 * - "th" prefix
 * - 5 alphanumeric chars
 * Everything else is treated as a pattern for message matching.
 */
export function detectTargetType(target: string): "tool_hash" | "reasoning_hash" | "pattern" {
    // Match format: th_5alphanum (e.g., th_abc12, th_x7y9z) - reasoning hashes
    const reasoningHashPattern = /^th_[a-z0-9]{5}$/i
    if (reasoningHashPattern.test(target)) {
        return "reasoning_hash"
    }
    // Match format: letter_5hexchars (e.g., r_a1b2c, g_d4e5f, t_12345) - tool hashes
    const hashPattern = /^[a-z]_[a-f0-9]{5}$/i
    if (hashPattern.test(target)) {
        return "tool_hash"
    }
    return "pattern"
}
