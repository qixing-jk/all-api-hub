import { describe, expect, it } from "vitest"

import { toOptionalFiniteNumber } from "~/utils/core/number"

describe("toOptionalFiniteNumber", () => {
  it.each([
    [0, 0],
    [1.25, 1.25],
    [" 2.5 ", 2.5],
    ["", undefined],
    ["   ", undefined],
    ["invalid", undefined],
    [Number.NaN, undefined],
    [Number.POSITIVE_INFINITY, undefined],
    [{}, undefined],
    [undefined, undefined],
  ])("normalizes %j to %j", (value, expected) => {
    expect(toOptionalFiniteNumber(value)).toBe(expected)
  })
})
