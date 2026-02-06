import { describe, it, expect } from "vitest"
import { existsSync } from "fs"
import { join } from "path"
import { createTempDir } from "./tmpdir"
import {
    getACPStatePath,
    ensureACPStorageDir,
    serializeState,
    deserializeState,
    seedACPState,
    readACPState,
    seedStateWithTools,
    seedStateWithMessages,
} from "./seed-state"
import { createMockState } from "./mock-client"

describe("getACPStatePath", () => {
    it("returns correct path structure", () => {
        const path = getACPStatePath("/home/user/.local/share", "session_123")
        expect(path).toBe("/home/user/.local/share/opencode/storage/plugin/acp/session_123.json")
    })
})

describe("ensureACPStorageDir", () => {
    it("creates the directory structure", async () => {
        const tmp = await createTempDir()
        try {
            const dir = await ensureACPStorageDir(tmp.path)
            expect(existsSync(dir)).toBe(true)
            expect(dir).toContain("opencode/storage/plugin/acp")
        } finally {
            await tmp.cleanup()
        }
    })

    it("is idempotent", async () => {
        const tmp = await createTempDir()
        try {
            const dir1 = await ensureACPStorageDir(tmp.path)
            const dir2 = await ensureACPStorageDir(tmp.path)
            expect(dir1).toBe(dir2)
            expect(existsSync(dir1)).toBe(true)
        } finally {
            await tmp.cleanup()
        }
    })
})

describe("serializeState / deserializeState", () => {
    it("round-trips a basic state", () => {
        const state = createMockState({ sessionId: "test-123" })
        const json = serializeState(state)
        const restored = deserializeState(json)

        expect(restored.sessionId).toBe("test-123")
        expect(restored.prune.toolIds).toEqual([])
    })

    it("preserves Map contents", () => {
        const state = createMockState()
        state.hashRegistry.calls.set("abc123", "call_1")
        state.hashRegistry.calls.set("def456", "call_2")

        const json = serializeState(state)
        const restored = deserializeState(json)

        expect(restored.hashRegistry.calls).toBeInstanceOf(Map)
        expect(restored.hashRegistry.calls.get("abc123")).toBe("call_1")
        expect(restored.hashRegistry.calls.get("def456")).toBe("call_2")
    })

    it("preserves Set contents", () => {
        const state = createMockState()
        state.cursors.snapshots.allCallIds.add("snap_1")
        state.cursors.snapshots.allCallIds.add("snap_2")

        const json = serializeState(state)
        const restored = deserializeState(json)

        expect(restored.cursors.snapshots.allCallIds).toBeInstanceOf(Set)
        expect(restored.cursors.snapshots.allCallIds.has("snap_1")).toBe(true)
        expect(restored.cursors.snapshots.allCallIds.has("snap_2")).toBe(true)
    })

    it("preserves nested Maps in cursors", () => {
        const state = createMockState()
        state.cursors.files.pathToCallIds.set("/test/file.ts", new Set(["call_1", "call_2"]))

        const json = serializeState(state)
        const restored = deserializeState(json)

        expect(restored.cursors.files.pathToCallIds).toBeInstanceOf(Map)
        const fileSet = restored.cursors.files.pathToCallIds.get("/test/file.ts")
        expect(fileSet).toBeInstanceOf(Set)
        expect(fileSet?.has("call_1")).toBe(true)
        expect(fileSet?.has("call_2")).toBe(true)
    })
})

describe("seedACPState", () => {
    it("creates state file at correct location", async () => {
        const tmp = await createTempDir()
        try {
            const { path, state } = await seedACPState(tmp.path, "test-session")

            expect(existsSync(path)).toBe(true)
            expect(state.sessionId).toBe("test-session")
            expect(path).toContain("test-session.json")
        } finally {
            await tmp.cleanup()
        }
    })

    it("accepts state overrides", async () => {
        const tmp = await createTempDir()
        try {
            const { state } = await seedACPState(tmp.path, "test-session", {
                currentTurn: 10,
                isSubAgent: true,
            })

            expect(state.currentTurn).toBe(10)
            expect(state.isSubAgent).toBe(true)
        } finally {
            await tmp.cleanup()
        }
    })
})

describe("readACPState", () => {
    it("reads back seeded state", async () => {
        const tmp = await createTempDir()
        try {
            await seedACPState(tmp.path, "read-test", { currentTurn: 5 })
            const state = await readACPState(tmp.path, "read-test")

            expect(state).not.toBeNull()
            expect(state?.sessionId).toBe("read-test")
            expect(state?.currentTurn).toBe(5)
        } finally {
            await tmp.cleanup()
        }
    })

    it("returns null for non-existent session", async () => {
        const tmp = await createTempDir()
        try {
            const state = await readACPState(tmp.path, "non-existent")
            expect(state).toBeNull()
        } finally {
            await tmp.cleanup()
        }
    })

    it("preserves Maps after read", async () => {
        const tmp = await createTempDir()
        try {
            const { state: original } = await seedACPState(tmp.path, "map-test")
            original.hashRegistry.calls.set("hash1", "call_1")

            // Re-seed with the modified state
            await seedACPState(tmp.path, "map-test", {
                hashRegistry: original.hashRegistry,
            })

            const restored = await readACPState(tmp.path, "map-test")
            expect(restored?.hashRegistry.calls).toBeInstanceOf(Map)
        } finally {
            await tmp.cleanup()
        }
    })
})

describe("seedStateWithTools", () => {
    it("registers tools with hashes", async () => {
        const tmp = await createTempDir()
        try {
            const { state } = await seedStateWithTools(tmp.path, "tool-test", [
                { callId: "call_1", hash: "abc123", toolName: "read" },
                { callId: "call_2", hash: "def456", toolName: "grep", turn: 2 },
            ])

            expect(state.hashRegistry.calls.get("abc123")).toBe("call_1")
            expect(state.hashRegistry.calls.get("def456")).toBe("call_2")
            expect(state.hashRegistry.callIds.get("call_1")).toBe("abc123")
            expect(state.toolParameters.get("call_1")?.tool).toBe("read")
            expect(state.toolParameters.get("call_2")?.turn).toBe(2)
        } finally {
            await tmp.cleanup()
        }
    })

    it("persists to file and can be read back", async () => {
        const tmp = await createTempDir()
        try {
            await seedStateWithTools(tmp.path, "persist-test", [
                { callId: "call_x", hash: "xyz789", toolName: "write" },
            ])

            const restored = await readACPState(tmp.path, "persist-test")
            expect(restored?.hashRegistry.calls.get("xyz789")).toBe("call_x")
        } finally {
            await tmp.cleanup()
        }
    })
})

describe("seedStateWithMessages", () => {
    it("registers message parts with hashes", async () => {
        const tmp = await createTempDir()
        try {
            const { state } = await seedStateWithMessages(tmp.path, "msg-test", [
                { messageId: "msg_1", partIndex: 0, hash: "aaa111" },
                { messageId: "msg_1", partIndex: 1, hash: "bbb222" },
                { messageId: "msg_2", partIndex: 0, hash: "ccc333" },
            ])

            expect(state.hashRegistry.messages.get("aaa111")).toBe("msg_1:0")
            expect(state.hashRegistry.messages.get("bbb222")).toBe("msg_1:1")
            expect(state.hashRegistry.messages.get("ccc333")).toBe("msg_2:0")
            expect(state.hashRegistry.messagePartIds.get("msg_1:0")).toBe("aaa111")
        } finally {
            await tmp.cleanup()
        }
    })

    it("persists to file and can be read back", async () => {
        const tmp = await createTempDir()
        try {
            await seedStateWithMessages(tmp.path, "msg-persist", [
                { messageId: "msg_x", partIndex: 0, hash: "hash_x" },
            ])

            const restored = await readACPState(tmp.path, "msg-persist")
            expect(restored?.hashRegistry.messages.get("hash_x")).toBe("msg_x:0")
        } finally {
            await tmp.cleanup()
        }
    })
})
