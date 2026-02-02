import { vi } from "vitest"

// Mock the @opencode-ai/plugin module which has a broken dist path
vi.mock("@opencode-ai/plugin", () => ({
    definePlugin: vi.fn(),
    defineTool: vi.fn(),
}))
