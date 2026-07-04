import { describe, expect, it } from "vitest"

import { normalizePlasmoStorageJsonValue } from "~~/e2e/utils/extensionState"

describe("normalizePlasmoStorageJsonValue", () => {
  it("parses JSON-stringified storage values", () => {
    expect(
      normalizePlasmoStorageJsonValue<{ enabled: boolean }>(
        JSON.stringify({ enabled: true }),
      ),
    ).toEqual({ enabled: true })
  })

  it("passes through raw object and primitive storage values", () => {
    expect(
      normalizePlasmoStorageJsonValue<{ count: number }>({ count: 2 }),
    ).toEqual({ count: 2 })
    expect(normalizePlasmoStorageJsonValue<boolean>(true)).toBe(true)
    expect(normalizePlasmoStorageJsonValue<number>(0)).toBe(0)
  })

  it("returns null for missing or invalid string values", () => {
    expect(normalizePlasmoStorageJsonValue<unknown>(undefined)).toBeNull()
    expect(normalizePlasmoStorageJsonValue<unknown>(null)).toBeNull()
    expect(normalizePlasmoStorageJsonValue<unknown>("not json")).toBeNull()
  })
})
