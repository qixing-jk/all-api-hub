import { describe, expect, it } from "vitest"

import { deepOverride, isArraysEqual, isNotEmptyArray } from "~/utils"

describe("utils index exports", () => {
  describe("isNotEmptyArray", () => {
    it("returns true only for arrays with at least one element", () => {
      expect(isNotEmptyArray([1])).toBe(true)
      expect(isNotEmptyArray([])).toBe(false)
      expect(isNotEmptyArray(null)).toBe(false)
      expect(isNotEmptyArray(undefined)).toBe(false)
    })
  })

  describe("isArraysEqual", () => {
    it("compares arrays by element frequency regardless of order", () => {
      expect(isArraysEqual([1, 2, 2], [2, 1, 2])).toBe(true)
      expect(isArraysEqual([1, 2], [1, 2, 3])).toBe(false)
      expect(isArraysEqual(["a", "b"], ["b", "a"])).toBe(true)
    })

    it("returns false when frequency differs", () => {
      expect(isArraysEqual([1, 1, 2], [1, 2, 2])).toBe(false)
    })
  })

  describe("deepOverride", () => {
    it("merges objects but replaces arrays", () => {
      const target = {
        name: "base",
        flags: ["a", "b"],
        nested: {
          count: 1,
          items: [1, 2],
        },
      }

      const source = {
        flags: ["c"],
        nested: {
          count: 2,
          items: [3],
        },
        extra: true,
      }

      const result = deepOverride(target, source)

      expect(result).toEqual({
        name: "base",
        flags: ["c"],
        nested: { count: 2, items: [3] },
        extra: true,
      })
      expect(result.flags).toEqual(["c"]) // ensure arrays were replaced
      expect(target.flags).toEqual(["a", "b"]) // ensure immutability
    })

    it("ignores null or undefined sources and supports multiple overrides", () => {
      const target: {
        info: { retries: number; enabled: boolean }
        tags: string[]
        another?: string
      } = { info: { retries: 1, enabled: false }, tags: ["x"] }
      const result = deepOverride(target, null, undefined, {
        info: { retries: 3, enabled: true },
        tags: ["y"],
        another: "field",
      })

      expect(result).toEqual({
        info: { retries: 3, enabled: true },
        tags: ["y"],
        another: "field",
      })
    })
  })
})
