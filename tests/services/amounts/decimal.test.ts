import { expect, it } from "vitest"

import {
  addDecimal,
  divideDecimal,
  divideDecimalByInteger,
  floorDecimal,
  normalizeDecimalUnits,
  parseDecimal,
  scaleDecimal,
} from "~/services/amounts/decimal"

it.each([0.5, 101, -101, NaN])(
  "rejects invalid decimal scale %s before changing an amount",
  (places) => {
    expect(() => scaleDecimal("10", places)).toThrow("invalid_decimal_scale")
  },
)

it("parses small and large serialized amounts without lossy Number conversion", () => {
  expect(scaleDecimal("0.125", 3)).toBe("125")
  expect(scaleDecimal("1.25", 4)).toBe("12500")
  expect(scaleDecimal("12500", -4)).toBe("1.25")
  expect(parseDecimal("1e-9")).toBe("0.000000001")
  expect(parseDecimal("-0.000e2")).toBe("0")
  expect(parseDecimal("9007199254740993")).toBe("9007199254740993")
  expect(parseDecimal(9007199254740992)).toBeUndefined()
  expect(parseDecimal("1e101")).toBeUndefined()
  expect(parseDecimal(`${"1".repeat(240)}e20`)).toBeUndefined()
  expect(() => addDecimal("9".repeat(256), "1")).toThrow("decimal_overflow")
})

it("rounds halves away from zero and floors only at the final settlement boundary", () => {
  expect(divideDecimal("-1", "8", 2)).toBe("-0.13")
  expect(divideDecimal("1.125", "1", 1)).toBe("1.1")
  expect(divideDecimal("1", "6", 2)).toBe("0.17")
  expect(floorDecimal("-2.01")).toBe("-3")
  expect(floorDecimal("-2")).toBe("-2")
})

it("rejects unsupported precision or divisors without treating the amount as zero", () => {
  expect(() => divideDecimal("1", "3", 0.5)).toThrow("invalid_decimal_scale")
  expect(() => divideDecimal("1", "0", 2)).toThrow("invalid_decimal_divisor")
  expect(() => divideDecimalByInteger("1", 0)).toThrow(
    "invalid_decimal_divisor",
  )
  expect(() => divideDecimalByInteger("1", 3)).toThrow(
    "non_terminating_decimal",
  )
  expect(normalizeDecimalUnits("1", 3)).toBeUndefined()
})
