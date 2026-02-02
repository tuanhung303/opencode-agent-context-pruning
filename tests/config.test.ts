import { describe, it, expect, beforeEach, vi } from "vitest"
import { ConfigService, getGlobalConfigService, resetGlobalConfigService } from "../lib/config.js"
import * as loader from "../lib/config/loader.js"
import { DEFAULT_CONFIG } from "../lib/config/defaults.js"

// Mock the loader module directly
vi.mock("../lib/config/loader.js", () => ({
    loadConfigFromFile: vi.fn(),
    validateConfig: vi.fn((c) => c),
    getConfig: vi.fn(),
    setConfig: vi.fn(),
    invalidateConfig: vi.fn(),
}))

describe("ConfigService", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resetGlobalConfigService()
    })

    describe("load", () => {
        it("should return default config when loader returns defaults", () => {
            vi.mocked(loader.loadConfigFromFile).mockReturnValue(DEFAULT_CONFIG)

            const service = new ConfigService()
            const config = service.load("/test/workspace")

            expect(config.enabled).toBe(true)
            expect(config.pruneNotification).toBe("minimal")
        })

        it("should load and merge config when loader returns custom config", () => {
            const customConfig = {
                ...DEFAULT_CONFIG,
                enabled: false,
                pruneNotification: "detailed" as const,
            }
            vi.mocked(loader.loadConfigFromFile).mockReturnValue(customConfig)

            const service = new ConfigService()
            const config = service.load("/test/workspace")

            expect(config.enabled).toBe(false)
            expect(config.pruneNotification).toBe("detailed")
        })

        it("should deep merge strategy settings (handled by loader, verified by service)", () => {
            const customConfig = {
                ...DEFAULT_CONFIG,
                strategies: {
                    ...DEFAULT_CONFIG.strategies,
                    truncation: {
                        ...DEFAULT_CONFIG.strategies.truncation,
                        enabled: false,
                        maxTokens: 5000,
                    },
                },
            }
            vi.mocked(loader.loadConfigFromFile).mockReturnValue(customConfig)

            const service = new ConfigService()
            const config = service.load("/test/workspace")

            expect(config.strategies.truncation.enabled).toBe(false)
            expect(config.strategies.truncation.maxTokens).toBe(5000)
        })
    })

    describe("get", () => {
        it("should throw if config not loaded", () => {
            const service = new ConfigService()
            expect(() => service.get()).toThrow("ConfigService: Configuration not loaded")
        })

        it("should return loaded config", () => {
            vi.mocked(loader.loadConfigFromFile).mockReturnValue(DEFAULT_CONFIG)

            const service = new ConfigService()
            service.load("/test/workspace")

            const config = service.get()
            expect(config.enabled).toBe(true)
        })
    })

    describe("getOrDefault", () => {
        it("should return defaults if not loaded", () => {
            const service = new ConfigService()
            const config = service.getOrDefault()

            expect(config.enabled).toBe(true)
        })

        it("should return loaded config if available", () => {
            const customConfig = { ...DEFAULT_CONFIG, enabled: false }
            vi.mocked(loader.loadConfigFromFile).mockReturnValue(customConfig)

            const service = new ConfigService()
            service.load("/test/workspace")

            const config = service.getOrDefault()
            expect(config.enabled).toBe(false)
        })
    })

    describe("isLoaded", () => {
        it("should return false before loading", () => {
            const service = new ConfigService()
            expect(service.isLoaded()).toBe(false)
        })

        it("should return true after loading", () => {
            vi.mocked(loader.loadConfigFromFile).mockReturnValue(DEFAULT_CONFIG)

            const service = new ConfigService()
            service.load("/test/workspace")

            expect(service.isLoaded()).toBe(true)
        })
    })

    describe("reload", () => {
        it("should reload config from disk", () => {
            const customConfig1 = { ...DEFAULT_CONFIG, enabled: false }
            const customConfig2 = { ...DEFAULT_CONFIG, enabled: true }

            vi.mocked(loader.loadConfigFromFile)
                .mockReturnValueOnce(customConfig1)
                .mockReturnValueOnce(customConfig2)

            const service = new ConfigService()
            service.load("/test/workspace")
            expect(service.get().enabled).toBe(false)

            service.reload()
            expect(service.get().enabled).toBe(true)
        })

        it("should throw if reload called before load", () => {
            const service = new ConfigService()
            expect(() => service.reload()).toThrow("workspace root not set")
        })
    })

    describe("reset", () => {
        it("should reset to unloaded state", () => {
            vi.mocked(loader.loadConfigFromFile).mockReturnValue(DEFAULT_CONFIG)

            const service = new ConfigService()
            service.load("/test/workspace")
            expect(service.isLoaded()).toBe(true)

            service.reset()
            expect(service.isLoaded()).toBe(false)
        })
    })
})

describe("Global Config Service", () => {
    beforeEach(() => {
        resetGlobalConfigService()
    })

    it("should create singleton instance", () => {
        const service1 = getGlobalConfigService()
        const service2 = getGlobalConfigService()
        expect(service1).toBe(service2)
    })

    it("should reset global instance", () => {
        const service1 = getGlobalConfigService()
        resetGlobalConfigService()
        const service2 = getGlobalConfigService()
        expect(service1).not.toBe(service2)
    })
})

describe("Config Defaults", () => {
    it("should have truncation settings in defaults (direct check)", async () => {
        // Import defaults directly for this check
        const { DEFAULT_CONFIG: actualDefaults } = await import("../lib/config/defaults.js")

        expect(actualDefaults.strategies.truncation.maxTokens).toBeGreaterThan(0)
        expect(actualDefaults.strategies.truncation.headRatio).toBeGreaterThan(0)
        expect(actualDefaults.strategies.truncation.tailRatio).toBeGreaterThan(0)
    })

    it("should have protected tools defined", async () => {
        const { DEFAULT_CONFIG: actualDefaults } = await import("../lib/config/defaults.js")

        expect(actualDefaults.tools.settings.protectedTools.length).toBeGreaterThan(0)
    })

    it("should have deduplication disabled by default", async () => {
        const { DEFAULT_CONFIG: actualDefaults } = await import("../lib/config/defaults.js")

        expect(actualDefaults.strategies.deduplication.enabled).toBe(false)
    })
})
