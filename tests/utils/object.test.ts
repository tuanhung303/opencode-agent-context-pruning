import { describe, it, expect } from "vitest"
import {
    sortObjectKeys,
    stableStringify,
    normalizeParams,
    hashObject,
} from "../../lib/utils/object"

describe("object utilities", () => {
    describe("sortObjectKeys", () => {
        it("sorts object keys alphabetically", () => {
            const obj = { c: 1, a: 2, b: 3 }
            const result = sortObjectKeys(obj)
            expect(Object.keys(result)).toEqual(["a", "b", "c"])
        })

        it("handles nested objects", () => {
            const obj = { z: { b: 1, a: 2 }, a: 1 }
            const result = sortObjectKeys(obj)
            expect(Object.keys(result)).toEqual(["a", "z"])
            expect(Object.keys(result.z)).toEqual(["a", "b"])
        })

        it("handles arrays", () => {
            const obj = [
                { b: 1, a: 2 },
                { d: 3, c: 4 },
            ]
            const result = sortObjectKeys(obj)
            expect(Object.keys(result[0]!)).toEqual(["a", "b"])
            expect(Object.keys(result[1]!)).toEqual(["c", "d"])
        })

        it("returns primitives unchanged", () => {
            expect(sortObjectKeys(42)).toBe(42)
            expect(sortObjectKeys("hello")).toBe("hello")
            expect(sortObjectKeys(null)).toBe(null)
            expect(sortObjectKeys(undefined)).toBe(undefined)
        })
    })

    describe("stableStringify", () => {
        it("produces same output regardless of key order", () => {
            const obj1 = { a: 1, b: 2 }
            const obj2 = { b: 2, a: 1 }
            expect(stableStringify(obj1)).toBe(stableStringify(obj2))
        })

        it("handles nested objects", () => {
            const obj1 = { outer: { a: 1, b: 2 } }
            const obj2 = { outer: { b: 2, a: 1 } }
            expect(stableStringify(obj1)).toBe(stableStringify(obj2))
        })

        it("handles arrays", () => {
            const arr = [{ b: 2, a: 1 }]
            expect(stableStringify(arr)).toBe('[{"a":1,"b":2}]')
        })

        it("handles primitives", () => {
            expect(stableStringify(42)).toBe("42")
            expect(stableStringify("hello")).toBe('"hello"')
            expect(stableStringify(null)).toBe("null")
            expect(stableStringify(undefined)).toBe(undefined)
        })
    })

    describe("normalizeParams", () => {
        it("removes null and undefined values", () => {
            const params = { a: 1, b: null, c: undefined, d: 2 }
            const result = normalizeParams(params)
            expect(result).toEqual({ a: 1, d: 2 })
        })

        it("preserves falsy values that are not null/undefined", () => {
            const params = { a: 0, b: "", c: false }
            const result = normalizeParams(params)
            expect(result).toEqual({ a: 0, b: "", c: false })
        })

        it("returns null for null input", () => {
            expect(normalizeParams(null)).toBe(null)
        })

        it("returns null for undefined input", () => {
            expect(normalizeParams(undefined)).toBe(null)
        })
    })

    describe("hashObject", () => {
        it("produces consistent hashes for same input", () => {
            const hash1 = hashObject("read", { path: "/foo" })
            const hash2 = hashObject("read", { path: "/foo" })
            expect(hash1).toBe(hash2)
        })

        it("produces same hash regardless of key order", () => {
            const hash1 = hashObject("read", { a: 1, b: 2 })
            const hash2 = hashObject("read", { b: 2, a: 1 })
            expect(hash1).toBe(hash2)
        })

        it("produces different hashes for different types", () => {
            const hash1 = hashObject("read", { path: "/foo" })
            const hash2 = hashObject("write", { path: "/foo" })
            expect(hash1).not.toBe(hash2)
        })

        it("includes type prefix in hash", () => {
            const hash = hashObject("read", {})
            expect(hash.startsWith("read_")).toBe(true)
        })
    })
})
