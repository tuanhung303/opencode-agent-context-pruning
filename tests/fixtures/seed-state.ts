import { writeFile, readFile, mkdir } from "fs/promises"
import { join } from "path"
import type { SessionState } from "../../lib/state/types"
import { createMockState } from "./mock-client"

/**
 * ACP state file location pattern:
 * {XDG_DATA_HOME}/opencode/storage/plugin/acp/{sessionId}.json
 */
export function getACPStatePath(xdgDataHome: string, sessionId: string): string {
    return join(xdgDataHome, "opencode", "storage", "plugin", "acp", `${sessionId}.json`)
}

/**
 * Ensures the ACP storage directory exists.
 */
export async function ensureACPStorageDir(xdgDataHome: string): Promise<string> {
    const dir = join(xdgDataHome, "opencode", "storage", "plugin", "acp")
    await mkdir(dir, { recursive: true })
    return dir
}

/**
 * Serializes SessionState to JSON, handling Maps and Sets.
 */
export function serializeState(state: SessionState): string {
    return JSON.stringify(
        state,
        (key, value) => {
            if (value instanceof Map) {
                return {
                    __type: "Map",
                    entries: Array.from(value.entries()),
                }
            }
            if (value instanceof Set) {
                return {
                    __type: "Set",
                    values: Array.from(value),
                }
            }
            return value
        },
        2,
    )
}

/**
 * Deserializes JSON back to SessionState, restoring Maps and Sets.
 */
export function deserializeState(json: string): SessionState {
    return JSON.parse(json, (key, value) => {
        if (value && typeof value === "object") {
            if (value.__type === "Map") {
                return new Map(value.entries)
            }
            if (value.__type === "Set") {
                return new Set(value.values)
            }
        }
        return value
    })
}

/**
 * Seeds ACP state to the correct XDG location.
 */
export async function seedACPState(
    xdgDataHome: string,
    sessionId: string,
    stateOverrides: Partial<SessionState> = {},
): Promise<{ path: string; state: SessionState }> {
    await ensureACPStorageDir(xdgDataHome)

    const state = createMockState({
        sessionId,
        ...stateOverrides,
    })

    const path = getACPStatePath(xdgDataHome, sessionId)
    await writeFile(path, serializeState(state), "utf-8")

    return { path, state }
}

/**
 * Reads ACP state from the XDG location.
 */
export async function readACPState(
    xdgDataHome: string,
    sessionId: string,
): Promise<SessionState | null> {
    const path = getACPStatePath(xdgDataHome, sessionId)
    try {
        const json = await readFile(path, "utf-8")
        return deserializeState(json)
    } catch {
        return null
    }
}

/**
 * Seeds state with pre-registered tool calls for testing discard.
 */
export async function seedStateWithTools(
    xdgDataHome: string,
    sessionId: string,
    tools: Array<{ callId: string; hash: string; toolName: string; turn?: number }>,
): Promise<{ path: string; state: SessionState }> {
    const state = createMockState({ sessionId })

    for (const tool of tools) {
        state.hashRegistry.calls.set(tool.hash, tool.callId)
        state.hashRegistry.callIds.set(tool.callId, tool.hash)
        state.toolParameters.set(tool.callId, {
            tool: tool.toolName,
            turn: tool.turn ?? 1,
            parameters: {},
            status: "completed",
        })
    }

    await ensureACPStorageDir(xdgDataHome)
    const path = getACPStatePath(xdgDataHome, sessionId)
    await writeFile(path, serializeState(state), "utf-8")

    return { path, state }
}

/**
 * Seeds state with pre-registered message parts for testing discard.
 */
export async function seedStateWithMessages(
    xdgDataHome: string,
    sessionId: string,
    messages: Array<{ messageId: string; partIndex: number; hash: string }>,
): Promise<{ path: string; state: SessionState }> {
    const state = createMockState({ sessionId })

    for (const msg of messages) {
        const partId = `${msg.messageId}:${msg.partIndex}`
        state.hashRegistry.messages.set(msg.hash, partId)
        state.hashRegistry.messagePartIds.set(partId, msg.hash)
    }

    await ensureACPStorageDir(xdgDataHome)
    const path = getACPStatePath(xdgDataHome, sessionId)
    await writeFile(path, serializeState(state), "utf-8")

    return { path, state }
}
