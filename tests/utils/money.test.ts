import { describe, expect, it } from "vitest"

import {
  formatMoneyFixed,
  getDisplayMoneyValue,
  normalizeMoneyForDisplay,
} from "~/utils/money"

describe("money utils", () => {
  it("normalizeMoneyForDisplay should map tiny non-zero values", () => {
    expect(normalizeMoneyForDisplay(0, { minNonZero: 0.01 })).toBe(0)
    expect(normalizeMoneyForDisplay(0.009, { minNonZero: 0.01 })).toBe(0.01)
    expect(normalizeMoneyForDisplay(-0.009, { minNonZero: 0.01 })).toBe(-0.01)
    expect(normalizeMoneyForDisplay(0.01, { minNonZero: 0.01 })).toBe(0.01)
  })

  it("getDisplayMoneyValue should round after mapping", () => {
    expect(getDisplayMoneyValue(0.009)).toBe(0.01)
    expect(getDisplayMoneyValue(0.014)).toBe(0.01)
    expect(getDisplayMoneyValue(0.015)).toBe(0.02)
  })

  it("formatMoneyFixed should avoid showing 0.00 for tiny values", () => {
    expect(formatMoneyFixed(0)).toBe("0.00")
    expect(formatMoneyFixed(0.009)).toBe("0.01")
    expect(formatMoneyFixed(-0.009)).toBe("-0.01")
    expect(formatMoneyFixed(12.345)).toBe("12.35")
  })
})
