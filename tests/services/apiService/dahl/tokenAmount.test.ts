import { describe, expect, it } from "vitest"

import { parseDahlTokenAmount } from "~/services/apiService/dahl/tokenAmount"

describe("Dahl token shorthand", () => {
  it.each([
    ["1.001K", 1001],
    ["1.000001M", 1000001],
    ["0.000001M", 1],
    ["1,001k", 1001],
    ["1.0000000M", 1000000],
    ["9007199254740991", Number.MAX_SAFE_INTEGER],
    ["1.0000000000000001", null],
    ["1.0000000000000001K", null],
    ["0.0000001M", null],
    ["9007199254740992", null],
    ["0", null],
    ["1e3", null],
  ])("parses %s without floating-point rounding", (input, expected) => {
    expect(parseDahlTokenAmount(input)).toBe(expected)
  })
})
