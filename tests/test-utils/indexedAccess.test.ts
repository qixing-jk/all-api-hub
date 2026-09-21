import { describe, expect, it } from "vitest"

import { atIndex } from "~~/tests/test-utils/indexedAccess"

describe("atIndex", () => {
  it("returns the addressed element and undefined when that element is absent", () => {
    expect(atIndex(["alpha", "beta"], 1)).toBe("beta")
    expect(atIndex(["alpha"], 3)).toBeUndefined()
  })

  it("returns a record field and a typed-array element", () => {
    expect(atIndex({ "api-key": "secret", weight: 2 }, "api-key")).toBe(
      "secret",
    )
    expect(atIndex(new Uint8ClampedArray([4, 5]), 0)).toBe(4)
  })

  it("throws when the collection itself is missing, like an unguarded index", () => {
    expect(() => atIndex(undefined, 0)).toThrow(TypeError)
    expect(() => atIndex(null, "api-key")).toThrow(TypeError)
  })
})

function assertIndexedReads(
  rows: Array<{ id: string; name: string }> | undefined,
  fields: { platform?: string; notes: string } | undefined,
  record: { "api-key": string; weight: number },
  tuple: [string, number],
  indexed: Record<string, { name: string }>,
  mixed: Array<string | undefined>,
) {
  const row: { id: string; name: string } = { ...atIndex(rows, 0), name: "b" }
  const platform: string = atIndex(fields, "platform")
  const notes: string = atIndex(fields, "notes")
  const key: string = atIndex(record, "api-key")
  const nested: string = atIndex(atIndex([record], 0), "api-key")
  const first: string = atIndex(tuple, 0)
  const second: number = atIndex(tuple, 1)
  const named: { name: string } = atIndex(indexed, "missing")
  const preserved: string | undefined = atIndex(mixed, 0)
  return { row, platform, notes, key, nested, first, second, named, preserved }
}

void assertIndexedReads
