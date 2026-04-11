import { describe, expect, it } from "vitest"

import {
  normalizeList,
  parseDelimitedList,
  trimToNull,
} from "~/utils/core/string"

describe("string utils", () => {
  it("trimToNull returns null for blank or non-string values", () => {
    expect(trimToNull("  value  ")).toBe("value")
    expect(trimToNull("   ")).toBeNull()
    expect(trimToNull(null)).toBeNull()
    expect(trimToNull(42)).toBeNull()
  })

  it("parseDelimitedList trims items and drops blanks", () => {
    expect(parseDelimitedList(" alpha, , beta ,  gamma  ")).toEqual([
      "alpha",
      "beta",
      "gamma",
    ])
    expect(parseDelimitedList("")).toEqual([])
    expect(parseDelimitedList("   ")).toEqual([])
    expect(parseDelimitedList(null)).toEqual([])
    expect(parseDelimitedList(undefined)).toEqual([])
  })

  it("normalizeList trims, removes blanks, and de-duplicates values", () => {
    expect(normalizeList([" alpha ", "", "beta", "alpha", " beta "])).toEqual([
      "alpha",
      "beta",
    ])
    expect(normalizeList([])).toEqual([])
    expect(normalizeList(["", "  "])).toEqual([])
    expect(normalizeList([" alpha ", " ", "beta", "alpha", " beta "])).toEqual([
      "alpha",
      "beta",
    ])
  })
})
