import { describe, expect, it } from "vitest"

import {
  formatAssetAmount,
  formatBalanceAmount,
  formatCompactAssetAmount,
  formatMoneyFixed,
  formatTelemetryMoney,
  getAssetLabel,
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

describe("native financial display", () => {
  const nanos = { kind: "crypto", id: "XNO" } as const
  const tokens = {
    kind: "quota",
    id: "test:token",
    label: "Token",
    displayScale: 1000000,
    displayLabel: "M Token",
  } as const

  it("preserves the unit and exact amount for native assets", () => {
    expect(getAssetLabel(nanos)).toBe("XNO")
    expect(getAssetLabel({ kind: "unknown" }, "Unknown")).toBe("Unknown")
    expect(
      formatAssetAmount({ value: "0.000001", asset: nanos }, "en-US"),
    ).toBe("0.000001 XNO")
    expect(
      formatCompactAssetAmount({ value: "-0.000001", asset: nanos }, "en-US"),
    ).toBe(">-0.01 XNO")
    expect(
      formatBalanceAmount({ value: "23", asset: tokens }, "en-US", "USD"),
    ).toBe("23 Token")
  })

  it("keeps atomic units when a display scale has no exact decimal conversion", () => {
    expect(
      formatAssetAmount(
        {
          value: "10",
          asset: { ...tokens, displayScale: 3 },
        },
        "en-US",
      ),
    ).toBe("10 Token")
  })

  it("bounds large summary labels while preserving the exact amount for display in detail", () => {
    const asset = { kind: "currency", code: "USD" } as const
    const options = { maximumIntegerDigits: 4 }
    expect(
      formatCompactAssetAmount({ value: "-1200000", asset }, "en-US", options),
    ).toMatch(/-.*1\.2M/)
    const huge = { value: "12345678901234567890123456.789", asset }
    expect(formatCompactAssetAmount(huge, "en-US", options)).toMatch(/1\.23E25/)
    expect(formatAssetAmount(huge, "en-US")).toMatch(
      /12,345,678,901,234,567,890,123,456\.789/,
    )
  })

  it("converts a configured monetary pair without coercing an unsupported currency", () => {
    expect(
      formatBalanceAmount(
        { value: "14", asset: { kind: "currency", code: "CNY" } },
        "en-US",
        "USD",
        7,
      ),
    ).toBe("$2.00")
    expect(
      formatBalanceAmount(
        { value: "14", asset: { kind: "currency", code: "EUR" } },
        "en-US",
        "USD",
        7,
      ),
    ).toMatch(/^EUR\s14\.00$/)
  })

  it.each([
    ["0." + "0".repeat(253) + "1", "<¥0.01"],
    ["-0." + "0".repeat(252) + "1", ">-¥0.01"],
  ])(
    "retains the original nonzero balance when conversion underflows: %s",
    (value, expected) => {
      expect(
        formatBalanceAmount(
          { value, asset: { kind: "currency", code: "CNY" } },
          "en-US",
          "USD",
          7,
        ),
      ).toBe(expected)
    },
  )
})
