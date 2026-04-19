import { describe, expect, it } from "vitest"

import {
  formatMoneyFixed,
  formatTelemetryMoney,
  getDisplayMoneyValue,
  normalizeMoneyForDisplay,
} from "~/utils/core/money"

describe("money utils", () => {
  it("normalizeMoneyForDisplay should map tiny non-zero values", () => {
    expect(normalizeMoneyForDisplay(0, { minNonZero: 0.01 })).toBe(0)
    expect(normalizeMoneyForDisplay(0.009, { minNonZero: 0.01 })).toBe(0.01)
    expect(normalizeMoneyForDisplay(-0.009, { minNonZero: 0.01 })).toBe(-0.01)
    expect(normalizeMoneyForDisplay(0.01, { minNonZero: 0.01 })).toBe(0.01)
  })

  it("normalizeMoneyForDisplay should treat non-finite values as zero", () => {
    expect(normalizeMoneyForDisplay(Number.NaN, { minNonZero: 0.01 })).toBe(0)
    expect(
      normalizeMoneyForDisplay(Number.POSITIVE_INFINITY, { minNonZero: 0.01 }),
    ).toBe(0)
    expect(
      normalizeMoneyForDisplay(Number.NEGATIVE_INFINITY, { minNonZero: 0.01 }),
    ).toBe(0)
  })

  it("getDisplayMoneyValue should round after mapping", () => {
    expect(getDisplayMoneyValue(0.009)).toBe(0.01)
    expect(getDisplayMoneyValue(0.014)).toBe(0.01)
    expect(getDisplayMoneyValue(0.015)).toBe(0.02)
  })

  it("getDisplayMoneyValue should round to integers when decimals is zero or negative", () => {
    expect(getDisplayMoneyValue(12.6, { decimals: 0, minNonZero: 0.01 })).toBe(
      13,
    )
    expect(getDisplayMoneyValue(12.4, { decimals: -2, minNonZero: 0.01 })).toBe(
      12,
    )
  })

  it("formatMoneyFixed should avoid showing 0.00 for tiny values", () => {
    expect(formatMoneyFixed(0)).toBe("0.00")
    expect(formatMoneyFixed(0.009)).toBe("0.01")
    expect(formatMoneyFixed(-0.009)).toBe("-0.01")
    expect(formatMoneyFixed(12.345)).toBe("12.35")
  })

  it("formatMoneyFixed should honor custom decimals for rounded integer output", () => {
    expect(formatMoneyFixed(12.6, { decimals: 0, minNonZero: 0.01 })).toBe("13")
  })

  it("formatTelemetryMoney should return fallback text for invalid values", () => {
    expect(formatTelemetryMoney(undefined, "USD")).toBe("-")
    expect(formatTelemetryMoney(Number.NaN, "USD")).toBe("-")
  })

  it("formatTelemetryMoney should format USD and CNY values", () => {
    expect(formatTelemetryMoney(12.345, "USD")).toBe("$12.35")
    expect(formatTelemetryMoney(1, "CNY")).toMatch(/^¥/)
  })
})
