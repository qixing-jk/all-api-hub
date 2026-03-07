import { describe, expect, it } from "vitest"

import { isPlainObject } from "~/utils/core/object"

describe("isPlainObject", () => {
  it("returns true for non-array objects", () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ key: "value" })).toBe(true)
    expect(isPlainObject(new Date("2026-01-01T00:00:00.000Z"))).toBe(true)
    expect(isPlainObject(new Map())).toBe(true)

    class Example {
      value = 1
    }

    const value = Object.create(null) as Record<string, unknown>
    value.key = "value"
    expect(isPlainObject(value)).toBe(true)
    expect(isPlainObject(new Example())).toBe(true)
  })

  it("returns false for arrays and primitives", () => {
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject("value")).toBe(false)
    expect(isPlainObject(123)).toBe(false)
    expect(isPlainObject(true)).toBe(false)
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject(undefined)).toBe(false)
  })
})
