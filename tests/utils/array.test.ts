import { describe, it, expect } from "vitest"
import {
    at,
    atOr,
    last,
    first,
    isDefined,
    filterDefined,
    mapDefined,
    takeWhile,
    groupBy,
    pushToMapArray,
} from "../../lib/utils/array"

describe("array utilities", () => {
    describe("at", () => {
        it("returns element at valid index", () => {
            const arr = ["a", "b", "c"]
            expect(at(arr, 0)).toBe("a")
            expect(at(arr, 1)).toBe("b")
            expect(at(arr, 2)).toBe("c")
        })

        it("returns undefined for out of bounds", () => {
            const arr = ["a", "b", "c"]
            expect(at(arr, -1)).toBeUndefined()
            expect(at(arr, 3)).toBeUndefined()
            expect(at(arr, 100)).toBeUndefined()
        })

        it("returns undefined for empty array", () => {
            expect(at([], 0)).toBeUndefined()
        })
    })

    describe("atOr", () => {
        it("returns element at valid index", () => {
            const arr = ["a", "b", "c"]
            expect(atOr(arr, 1, "default")).toBe("b")
        })

        it("returns default for out of bounds", () => {
            const arr = ["a", "b", "c"]
            expect(atOr(arr, 5, "default")).toBe("default")
            expect(atOr(arr, -1, "default")).toBe("default")
        })
    })

    describe("last", () => {
        it("returns last element", () => {
            expect(last([1, 2, 3])).toBe(3)
            expect(last(["a"])).toBe("a")
        })

        it("returns undefined for empty array", () => {
            expect(last([])).toBeUndefined()
        })
    })

    describe("first", () => {
        it("returns first element", () => {
            expect(first([1, 2, 3])).toBe(1)
            expect(first(["a"])).toBe("a")
        })

        it("returns undefined for empty array", () => {
            expect(first([])).toBeUndefined()
        })
    })

    describe("isDefined", () => {
        it("returns true for defined values", () => {
            expect(isDefined(0)).toBe(true)
            expect(isDefined("")).toBe(true)
            expect(isDefined(false)).toBe(true)
            expect(isDefined({})).toBe(true)
        })

        it("returns false for null and undefined", () => {
            expect(isDefined(null)).toBe(false)
            expect(isDefined(undefined)).toBe(false)
        })
    })

    describe("filterDefined", () => {
        it("removes null and undefined values", () => {
            const arr = [1, null, 2, undefined, 3]
            expect(filterDefined(arr)).toEqual([1, 2, 3])
        })

        it("preserves falsy values that are defined", () => {
            const arr = [0, null, "", undefined, false]
            expect(filterDefined(arr)).toEqual([0, "", false])
        })
    })

    describe("mapDefined", () => {
        it("maps and filters in single pass", () => {
            const arr = [1, 2, 3, 4, 5]
            const result = mapDefined(arr, (x) => (x % 2 === 0 ? x * 2 : undefined))
            expect(result).toEqual([4, 8])
        })

        it("handles empty array", () => {
            expect(mapDefined([], (x) => x)).toEqual([])
        })
    })

    describe("takeWhile", () => {
        it("takes first N matching items", () => {
            const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
            const result = takeWhile(arr, (x) => x % 2 === 0, 3)
            expect(result).toEqual([2, 4, 6])
        })

        it("returns fewer if not enough matches", () => {
            const arr = [1, 2, 3]
            const result = takeWhile(arr, (x) => x % 2 === 0, 5)
            expect(result).toEqual([2])
        })

        it("returns empty for no matches", () => {
            const arr = [1, 3, 5]
            const result = takeWhile(arr, (x) => x % 2 === 0, 3)
            expect(result).toEqual([])
        })
    })

    describe("groupBy", () => {
        it("groups items by key function", () => {
            const arr = [
                { type: "a", value: 1 },
                { type: "b", value: 2 },
                { type: "a", value: 3 },
            ]
            const result = groupBy(arr, (x) => x.type)
            expect(result.get("a")).toEqual([
                { type: "a", value: 1 },
                { type: "a", value: 3 },
            ])
            expect(result.get("b")).toEqual([{ type: "b", value: 2 }])
        })

        it("handles empty array", () => {
            const result = groupBy([], (x: string) => x)
            expect(result.size).toBe(0)
        })
    })

    describe("pushToMapArray", () => {
        it("creates new array if key does not exist", () => {
            const map = new Map<string, number[]>()
            pushToMapArray(map, "key", 1)
            expect(map.get("key")).toEqual([1])
        })

        it("appends to existing array", () => {
            const map = new Map<string, number[]>()
            map.set("key", [1, 2])
            pushToMapArray(map, "key", 3)
            expect(map.get("key")).toEqual([1, 2, 3])
        })
    })
})
