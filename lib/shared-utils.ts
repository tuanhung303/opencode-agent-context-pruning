import { SessionState, WithParts } from "./state/types"
import { isIgnoredUserMessage } from "./messages/utils"

export const isMessageCompacted = (state: SessionState, msg: WithParts): boolean => {
    return msg.info.time.created < state.lastCompaction
}

/**
 * Check if an assistant message has finished streaming.
 * Returns true only when time.completed is set to a positive timestamp.
 * Used to prevent hash injection into messages that are still being generated.
 */
export const isMessageCompleted = (msg: WithParts): boolean => {
    return (msg.info.time as any)?.completed > 0
}

export const isSyntheticMessage = (msg: WithParts): boolean => {
    if (msg.info.role !== "user") return false
    const parts = Array.isArray(msg.parts) ? msg.parts : []
    for (const part of parts) {
        if (
            part.type === "text" &&
            (part as any).text &&
            (part as any).text.startsWith("::synth::")
        ) {
            return true
        }
    }
    return false
}

export const getLastUserMessage = (messages: WithParts[]): WithParts | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (
            msg &&
            msg.info.role === "user" &&
            !isIgnoredUserMessage(msg) &&
            !isSyntheticMessage(msg)
        ) {
            return msg
        }
    }
    return null
}
