import { describe, it, expect } from "vitest"
import { createXDGDirs } from "../fixtures/tmpdir"
import {
    isOpencodeAvailable,
    getOpencodeVersion,
    createIsolatedEnv,
} from "../../scripts/run-opencode"

describe("isOpencodeAvailable", () => {
    it("returns boolean indicating if opencode is in PATH", async () => {
        const result = await isOpencodeAvailable()
        expect(typeof result).toBe("boolean")
    })
})

describe("getOpencodeVersion", () => {
    it("returns version string or null", async () => {
        const result = await getOpencodeVersion()
        // Either a version string or null if not installed
        expect(result === null || typeof result === "string").toBe(true)
    })
})

describe("createIsolatedEnv", () => {
    it("creates env with all XDG variables", async () => {
        const xdg = await createXDGDirs()
        try {
            const env = createIsolatedEnv(xdg)

            expect(env.XDG_DATA_HOME).toBe(xdg.data)
            expect(env.XDG_CONFIG_HOME).toBe(xdg.config)
            expect(env.XDG_CACHE_HOME).toBe(xdg.cache)
            expect(env.XDG_STATE_HOME).toBe(xdg.state)
            expect(env.OPENCODE_TEST_HOME).toBe(xdg.root)
        } finally {
            await xdg.cleanup()
        }
    })

    it("includes disable flags for testing", async () => {
        const xdg = await createXDGDirs()
        try {
            const env = createIsolatedEnv(xdg)

            expect(env.OPENCODE_DISABLE_SHARE).toBe("true")
            expect(env.OPENCODE_DISABLE_LSP_DOWNLOAD).toBe("true")
            expect(env.OPENCODE_DISABLE_DEFAULT_PLUGINS).toBe("true")
            expect(env.OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER).toBe("true")
        } finally {
            await xdg.cleanup()
        }
    })
})

// Note: runOpencode tests are skipped by default as they require opencode CLI
// and make actual LLM calls. Run with: npm test -- --run scripts/run-opencode.test.ts
describe.skip("runOpencode (requires opencode CLI)", () => {
    it("runs opencode with isolated XDG dirs", async () => {
        // This test would actually run opencode
        // Skipped by default to avoid LLM costs
    })
})
