/**
 * Real LLM Validation Tests
 *
 * These tests make ACTUAL API calls to validate the ACP plugin
 * with real LLM interactions. They require:
 * - opencode CLI installed and configured
 * - Valid API keys for the configured provider
 *
 * Run with: make test-llm
 * WARNING: This will incur API costs!
 *
 * Test categories:
 * - "Infrastructure" - Quick tests, no LLM calls
 * - "LLM Integration" - Actual LLM calls, slow
 *
 * NOTE: LLM tests do NOT use XDG isolation because they need
 * access to the user's real API keys and config.
 */

import { describe, it, expect, beforeAll } from "vitest"
import { createXDGDirs } from "../fixtures/tmpdir"
import { runOpencode, isOpencodeAvailable, getOpencodeVersion } from "../../scripts/run-opencode"

// Environment check - skip LLM tests if RUN_LLM_TESTS is not set
const RUN_LLM_TESTS = process.env.RUN_LLM_TESTS === "true"

describe("LLM Test Infrastructure", () => {
    it("opencode CLI is available", async () => {
        const available = await isOpencodeAvailable()
        expect(available).toBe(true)
    })

    it("opencode version is detected", async () => {
        const version = await getOpencodeVersion()
        expect(version).toBeTruthy()
        console.log(`opencode version: ${version}`)
    })

    it("can create isolated XDG environment", async () => {
        const xdg = await createXDGDirs("test-infra-")
        try {
            expect(xdg.root).toBeTruthy()
            expect(xdg.data).toContain("share")
            expect(xdg.config).toContain("config")
            expect(xdg.env.XDG_DATA_HOME).toBe(xdg.data)
        } finally {
            await xdg.cleanup()
        }
    })

    it("XDG directories are properly isolated", async () => {
        const xdg1 = await createXDGDirs("iso-1-")
        const xdg2 = await createXDGDirs("iso-2-")
        try {
            expect(xdg1.root).not.toBe(xdg2.root)
            expect(xdg1.data).not.toBe(xdg2.data)
        } finally {
            await xdg1.cleanup()
            await xdg2.cleanup()
        }
    })
})

// These tests make actual LLM calls - only run when explicitly enabled
// NOTE: These tests use the REAL user environment (no XDG isolation)
// because they need access to API keys stored in ~/.config/opencode
describe.skipIf(!RUN_LLM_TESTS)("LLM Integration Tests", () => {
    beforeAll(async () => {
        const available = await isOpencodeAvailable()
        if (!available) {
            throw new Error("opencode CLI not available")
        }
        console.log("LLM Integration tests starting (using real environment)...")
    })

    it("executes simple prompt", async () => {
        // No XDG isolation - use real config with API keys
        // Stream output for visibility during long-running tests
        const result = await runOpencode({
            prompt: 'Respond with exactly: "test-ok"',
            timeout: 60000,
            stream: true,
        })

        console.log("\n--- Test Result ---")
        console.log("exitCode:", result.exitCode)

        expect(result.exitCode).toBe(0)
    }, 120000)

    it("can read a file", async () => {
        const result = await runOpencode({
            prompt: 'Read package.json and respond with "read-ok"',
            timeout: 60000,
            stream: true,
        })

        expect(result.exitCode).toBe(0)
    }, 120000)

    it("context_prune tool is available", async () => {
        const result = await runOpencode({
            prompt: 'If you have a "context_prune" tool available, respond "context-available". Otherwise respond "no-context".',
            timeout: 60000,
            stream: true,
        })

        expect(result.exitCode).toBe(0)
        // Check if context_prune tool is mentioned
        const hasContext =
            result.stdout.toLowerCase().includes("context-available") ||
            result.stdout.toLowerCase().includes("context_prune")
        console.log("\nAgent context optimize tool available:", hasContext)
    }, 120000)
})

// Smoke test - single quick LLM call to verify basic functionality
describe.skipIf(!RUN_LLM_TESTS)("LLM Smoke Test", () => {
    it("basic LLM response works", async () => {
        // No XDG isolation - use real config
        // Stream for visibility
        const result = await runOpencode({
            prompt: 'Say "smoke-test-passed" and nothing else.',
            timeout: 45000,
            stream: true,
        })

        console.log("\nSmoke test result:", {
            exitCode: result.exitCode,
            stdoutLength: result.stdout.length,
            stderrLength: result.stderr.length,
        })

        expect(result.exitCode).toBe(0)
    }, 90000)
})
