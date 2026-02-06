import { describe, it, expect } from "vitest"
import { existsSync } from "fs"
import { stat, writeFile, readFile } from "fs/promises"
import { join } from "path"
import { createTempDir, createXDGDirs } from "./tmpdir"

describe("createTempDir", () => {
    it("creates a directory that exists", async () => {
        const tmp = await createTempDir()
        try {
            expect(existsSync(tmp.path)).toBe(true)
            const stats = await stat(tmp.path)
            expect(stats.isDirectory()).toBe(true)
        } finally {
            await tmp.cleanup()
        }
    })

    it("creates unique directories on each call", async () => {
        const tmp1 = await createTempDir()
        const tmp2 = await createTempDir()
        try {
            expect(tmp1.path).not.toBe(tmp2.path)
        } finally {
            await tmp1.cleanup()
            await tmp2.cleanup()
        }
    })

    it("cleanup removes the directory", async () => {
        const tmp = await createTempDir()
        const path = tmp.path
        expect(existsSync(path)).toBe(true)

        await tmp.cleanup()
        expect(existsSync(path)).toBe(false)
    })

    it("supports custom prefix", async () => {
        const tmp = await createTempDir("custom-prefix-")
        try {
            expect(tmp.path).toContain("custom-prefix-")
        } finally {
            await tmp.cleanup()
        }
    })

    it("can write and read files in temp directory", async () => {
        const tmp = await createTempDir()
        try {
            const testFile = join(tmp.path, "test.txt")
            await writeFile(testFile, "hello world")
            const content = await readFile(testFile, "utf-8")
            expect(content).toBe("hello world")
        } finally {
            await tmp.cleanup()
        }
    })

    it("cleanup is idempotent (can be called multiple times)", async () => {
        const tmp = await createTempDir()
        await tmp.cleanup()
        // Should not throw
        await tmp.cleanup()
        await tmp.cleanup()
    })
})

describe("createXDGDirs", () => {
    it("creates all XDG directories", async () => {
        const xdg = await createXDGDirs()
        try {
            expect(existsSync(xdg.root)).toBe(true)
            expect(existsSync(xdg.data)).toBe(true)
            expect(existsSync(xdg.config)).toBe(true)
            expect(existsSync(xdg.cache)).toBe(true)
            expect(existsSync(xdg.state)).toBe(true)
        } finally {
            await xdg.cleanup()
        }
    })

    it("provides correct env vars", async () => {
        const xdg = await createXDGDirs()
        try {
            expect(xdg.env.XDG_DATA_HOME).toBe(xdg.data)
            expect(xdg.env.XDG_CONFIG_HOME).toBe(xdg.config)
            expect(xdg.env.XDG_CACHE_HOME).toBe(xdg.cache)
            expect(xdg.env.XDG_STATE_HOME).toBe(xdg.state)
            expect(xdg.env.OPENCODE_TEST_HOME).toBe(xdg.root)
            expect(xdg.env.OPENCODE_DISABLE_SHARE).toBe("true")
        } finally {
            await xdg.cleanup()
        }
    })

    it("cleanup removes all directories", async () => {
        const xdg = await createXDGDirs()
        const root = xdg.root
        expect(existsSync(root)).toBe(true)

        await xdg.cleanup()
        expect(existsSync(root)).toBe(false)
    })

    it("directories are nested under root", async () => {
        const xdg = await createXDGDirs()
        try {
            expect(xdg.data.startsWith(xdg.root)).toBe(true)
            expect(xdg.config.startsWith(xdg.root)).toBe(true)
            expect(xdg.cache.startsWith(xdg.root)).toBe(true)
            expect(xdg.state.startsWith(xdg.root)).toBe(true)
        } finally {
            await xdg.cleanup()
        }
    })
})
