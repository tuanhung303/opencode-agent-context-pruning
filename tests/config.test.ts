import { describe, it, expect, beforeEach, vi } from "vitest"
import type { PluginConfig } from "../../lib/config"

// Mock fs and path modules
vi.mock("fs", () => ({
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn(),
}))

vi.mock("path", () => ({
    join: vi.fn((...args: string[]) => args.join("/")),
    dirname: vi.fn((p: string) => p.split("/").slice(0, -1).join("/")),
}))

vi.mock("os", () => ({
    homedir: vi.fn(() => "/home/user"),
}))

const createMockLogger = () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
})

const createMockContext = () => ({
    client: {
        tui: {
            showToast: vi.fn(),
        },
    },
    logger: createMockLogger(),
})

describe("config", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("should return default config when no files exist", async () => {
        const { existsSync } = await import("fs")
        const { getConfig } = await import("../../lib/config")
        vi.mocked(existsSync).mockReturnValue(false)

        const mockContext = createMockContext()
        const config = getConfig(mockContext as any)

        expect(config.enabled).toBe(true)
        expect(config.pruneNotification).toBe("minimal")
    })

    it("should merge global config when it exists", async () => {
        const { existsSync, readFileSync } = await import("fs")
        const { getConfig } = await import("../../lib/config")
        vi.mocked(existsSync).mockReturnValue(true)
        vi.mocked(readFileSync).mockReturnValue(
            JSON.stringify({
                enabled: false,
                pruneNotification: "detailed",
            }),
        )

        const mockContext = createMockContext()
        const config = getConfig(mockContext as any)

        expect(config.enabled).toBe(false)
        expect(config.pruneNotification).toBe("detailed")
    })

    it("should handle invalid JSON gracefully", async () => {
        const { existsSync, readFileSync } = await import("fs")
        const { getConfig } = await import("../../lib/config")
        vi.mocked(existsSync).mockReturnValue(true)
        vi.mocked(readFileSync).mockReturnValue("invalid json")

        const mockContext = createMockContext()
        const config = getConfig(mockContext as any)

        // Should fall back to defaults
        expect(config.enabled).toBe(true)
    })

    it("should deep merge strategy settings", async () => {
        const { existsSync, readFileSync } = await import("fs")
        const { getConfig } = await import("../../lib/config")
        vi.mocked(existsSync).mockReturnValue(true)
        vi.mocked(readFileSync).mockReturnValue(
            JSON.stringify({
                strategies: {
                    truncation: {
                        enabled: false,
                        maxTokens: 5000,
                    },
                },
            }),
        )

        const mockContext = createMockContext()
        const config = getConfig(mockContext as any)

        expect(config.strategies.truncation.enabled).toBe(false)
        expect(config.strategies.truncation.maxTokens).toBe(5000)
        // Other truncation settings should remain from defaults
        expect(config.strategies.truncation.headRatio).toBeGreaterThan(0)
    })

    it("should merge protected file patterns", async () => {
        const { existsSync, readFileSync } = await import("fs")
        const { getConfig } = await import("../../lib/config")
        vi.mocked(existsSync).mockReturnValue(true)
        vi.mocked(readFileSync).mockReturnValue(
            JSON.stringify({
                protectedFilePatterns: ["*.secret"],
            }),
        )

        const mockContext = createMockContext()
        const config = getConfig(mockContext as any)

        expect(config.protectedFilePatterns).toContain("*.secret")
        // Should also contain defaults
        expect(config.protectedFilePatterns.length).toBeGreaterThan(1)
    })

    it("should deduplicate protected file patterns", async () => {
        const { existsSync, readFileSync } = await import("fs")
        const { getConfig } = await import("../../lib/config")
        vi.mocked(existsSync).mockReturnValue(true)
        vi.mocked(readFileSync).mockReturnValue(
            JSON.stringify({
                protectedFilePatterns: ["package.json", "package.json"],
            }),
        )

        const mockContext = createMockContext()
        const config = getConfig(mockContext as any)

        const packageJsonCount = config.protectedFilePatterns.filter(
            (p) => p === "package.json",
        ).length
        expect(packageJsonCount).toBe(1)
    })

    it("should have truncation settings in defaults", async () => {
        const { existsSync } = await import("fs")
        const { getConfig } = await import("../../lib/config")
        vi.mocked(existsSync).mockReturnValue(false)

        const mockContext = createMockContext()
        const config = getConfig(mockContext as any)

        expect(config.strategies.truncation.maxTokens).toBeGreaterThan(0)
        expect(config.strategies.truncation.headRatio).toBeGreaterThan(0)
        expect(config.strategies.truncation.tailRatio).toBeGreaterThan(0)
    })

    it("should have protected tools defined", async () => {
        const { existsSync } = await import("fs")
        const { getConfig } = await import("../../lib/config")
        vi.mocked(existsSync).mockReturnValue(false)

        const mockContext = createMockContext()
        const config = getConfig(mockContext as any)

        expect(config.tools.settings.protectedTools.length).toBeGreaterThan(0)
    })
})
