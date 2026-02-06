import { spawn, ChildProcess } from "child_process"
import { createXDGDirs, XDGDirs } from "../tests/fixtures/tmpdir"

export interface RunOpencodeOptions {
    prompt: string
    agent?: string
    model?: string
    timeout?: number
    xdg?: XDGDirs
    workdir?: string
    env?: Record<string, string>
    /** Stream output to console in real-time (useful for long-running LLM tests) */
    stream?: boolean
}

export interface RunOpencodeResult {
    stdout: string
    stderr: string
    exitCode: number
    xdg: XDGDirs | null
}

/**
 * Runs opencode CLI with optional XDG isolation for testing.
 * If xdg is provided, uses isolated XDG directories.
 * If xdg is not provided, uses the real user environment (for LLM tests that need API keys).
 */
export async function runOpencode(options: RunOpencodeOptions): Promise<RunOpencodeResult> {
    const xdg = options.xdg ?? null
    const timeout = options.timeout ?? 60000

    const args = ["run"]

    if (options.agent) {
        args.push("--agent", options.agent)
    }

    if (options.model) {
        args.push("-m", options.model)
    }

    args.push("--continue", options.prompt)

    // Only apply XDG isolation if explicitly provided
    const env = {
        ...process.env,
        ...(xdg ? xdg.env : {}),
        ...options.env,
    }

    return new Promise((resolve, reject) => {
        let stdout = ""
        let stderr = ""
        let proc: ChildProcess | null = null

        const timeoutId = setTimeout(() => {
            if (proc) {
                proc.kill("SIGTERM")
                reject(new Error(`opencode timed out after ${timeout}ms`))
            }
        }, timeout)

        proc = spawn("opencode", args, {
            cwd: options.workdir ?? process.cwd(),
            env,
            stdio: ["pipe", "pipe", "pipe"],
        })

        proc.stdout?.on("data", (data) => {
            const chunk = data.toString()
            stdout += chunk
            if (options.stream) {
                process.stdout.write(chunk)
            }
        })

        proc.stderr?.on("data", (data) => {
            const chunk = data.toString()
            stderr += chunk
            if (options.stream) {
                process.stderr.write(chunk)
            }
        })

        proc.on("close", (code) => {
            clearTimeout(timeoutId)
            resolve({
                stdout,
                stderr,
                exitCode: code ?? 1,
                xdg,
            })
        })

        proc.on("error", (err) => {
            clearTimeout(timeoutId)
            reject(err)
        })
    })
}

/**
 * Checks if opencode CLI is available in PATH.
 */
export async function isOpencodeAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
        const proc = spawn("opencode", ["--version"], {
            stdio: ["pipe", "pipe", "pipe"],
        })

        proc.on("close", (code) => {
            resolve(code === 0)
        })

        proc.on("error", () => {
            resolve(false)
        })
    })
}

/**
 * Gets the opencode version.
 */
export async function getOpencodeVersion(): Promise<string | null> {
    return new Promise((resolve) => {
        let stdout = ""
        const proc = spawn("opencode", ["--version"], {
            stdio: ["pipe", "pipe", "pipe"],
        })

        proc.stdout?.on("data", (data) => {
            stdout += data.toString()
        })

        proc.on("close", (code) => {
            if (code === 0) {
                resolve(stdout.trim())
            } else {
                resolve(null)
            }
        })

        proc.on("error", () => {
            resolve(null)
        })
    })
}

/**
 * Creates XDG environment variables for isolated testing.
 */
export function createIsolatedEnv(xdg: XDGDirs): Record<string, string> {
    return {
        ...xdg.env,
        // Disable features that might interfere with testing
        OPENCODE_DISABLE_SHARE: "true",
        OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
        OPENCODE_DISABLE_DEFAULT_PLUGINS: "true",
        OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: "true",
    }
}
