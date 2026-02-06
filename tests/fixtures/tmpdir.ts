import { mkdtemp, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"

export interface TempDir {
    path: string
    cleanup: () => Promise<void>
    [Symbol.asyncDispose]: () => Promise<void>
}

/**
 * Creates an isolated temporary directory for testing.
 * Supports automatic cleanup via `await using` or manual cleanup().
 *
 * @example
 * // Automatic cleanup with await using
 * await using tmp = await createTempDir()
 * console.log(tmp.path) // /tmp/acp-test-xxxxx
 *
 * @example
 * // Manual cleanup
 * const tmp = await createTempDir()
 * try {
 *   // use tmp.path
 * } finally {
 *   await tmp.cleanup()
 * }
 */
export async function createTempDir(prefix = "acp-test-"): Promise<TempDir> {
    const path = await mkdtemp(join(tmpdir(), prefix))

    const cleanup = async () => {
        try {
            await rm(path, { recursive: true, force: true })
        } catch {
            // Ignore cleanup errors
        }
    }

    return {
        path,
        cleanup,
        [Symbol.asyncDispose]: cleanup,
    }
}

/**
 * Creates XDG-compliant directory structure for isolated opencode testing.
 * Sets up data, config, cache, and state directories.
 */
export interface XDGDirs {
    root: string
    data: string
    config: string
    cache: string
    state: string
    cleanup: () => Promise<void>
    [Symbol.asyncDispose]: () => Promise<void>
    env: Record<string, string>
}

export async function createXDGDirs(prefix = "acp-xdg-"): Promise<XDGDirs> {
    const tmp = await createTempDir(prefix)
    const { mkdir } = await import("fs/promises")

    const dirs = {
        data: join(tmp.path, "share"),
        config: join(tmp.path, "config"),
        cache: join(tmp.path, "cache"),
        state: join(tmp.path, "state"),
    }

    // Create all XDG directories
    await Promise.all(Object.values(dirs).map((d) => mkdir(d, { recursive: true })))

    const env = {
        XDG_DATA_HOME: dirs.data,
        XDG_CONFIG_HOME: dirs.config,
        XDG_CACHE_HOME: dirs.cache,
        XDG_STATE_HOME: dirs.state,
        OPENCODE_TEST_HOME: tmp.path,
        OPENCODE_DISABLE_SHARE: "true",
        OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
        OPENCODE_DISABLE_DEFAULT_PLUGINS: "true",
        OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: "true",
    }

    return {
        root: tmp.path,
        ...dirs,
        cleanup: tmp.cleanup,
        [Symbol.asyncDispose]: tmp.cleanup,
        env,
    }
}
