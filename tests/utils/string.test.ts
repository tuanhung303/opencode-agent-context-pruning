import { describe, it, expect } from "vitest"
import { truncate, formatTokenCount, shortenPath, firstChar } from "../../lib/utils/string"

describe("string utilities", () => {
    describe("truncate", () => {
        it("returns string unchanged if within limit", () => {
            expect(truncate("hello", 10)).toBe("hello")
            expect(truncate("hello", 5)).toBe("hello")
        })

        it("truncates and adds ellipsis if over limit", () => {
            expect(truncate("hello world", 8)).toBe("hello...")
        })

        it("uses default limit of 60", () => {
            const longStr = "a".repeat(100)
            const result = truncate(longStr)
            expect(result.length).toBe(60)
            expect(result.endsWith("...")).toBe(true)
        })
    })

    describe("formatTokenCount", () => {
        it("formats small numbers as-is", () => {
            expect(formatTokenCount(0)).toBe("0")
            expect(formatTokenCount(500)).toBe("500")
            expect(formatTokenCount(999)).toBe("999")
        })

        it("formats thousands with K suffix", () => {
            expect(formatTokenCount(1000)).toBe("1K")
            expect(formatTokenCount(1500)).toBe("1.5K")
            expect(formatTokenCount(10000)).toBe("10K")
            expect(formatTokenCount(12345)).toBe("12.3K")
        })

        it("removes .0 from round thousands", () => {
            expect(formatTokenCount(2000)).toBe("2K")
            expect(formatTokenCount(5000)).toBe("5K")
        })
    })

    describe("shortenPath", () => {
        it("removes working directory prefix", () => {
            expect(shortenPath("/home/user/project/file.ts", "/home/user/project")).toBe("file.ts")
        })

        it("handles nested paths", () => {
            expect(shortenPath("/home/user/project/src/lib/file.ts", "/home/user/project")).toBe(
                "src/lib/file.ts",
            )
        })

        it("returns . for exact match", () => {
            expect(shortenPath("/home/user/project", "/home/user/project")).toBe(".")
        })

        it("handles 'in' pattern", () => {
            expect(shortenPath('"*.ts" in /home/user/project/src', "/home/user/project")).toBe(
                '"*.ts" in src',
            )
        })

        it("returns unchanged if no working directory", () => {
            expect(shortenPath("/home/user/project/file.ts")).toBe("/home/user/project/file.ts")
        })
    })

    describe("firstChar", () => {
        it("returns first character lowercase", () => {
            expect(firstChar("Read")).toBe("r")
            expect(firstChar("write")).toBe("w")
        })

        it("returns default for empty string", () => {
            expect(firstChar("")).toBe("x")
            expect(firstChar("", "z")).toBe("z")
        })
    })
})
