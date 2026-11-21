import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { ASSET_KINDS } from "~/services/amounts/financialConstants"
import {
  convertCurrencyAmount,
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
  it.each([
    [`0.${"0".repeat(253)}1`, 100],
    [`-0.${"0".repeat(252)}1`, 10],
  ])(
    "retains the original nonzero amount when its conversion cannot fit the decimal bound (%s)",
    (value, rate) => {
      const amount = {
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
        value,
      } as const
      expect(convertCurrencyAmount(amount, "USD", rate)).toEqual(amount)
    },
  )

  it("keeps a representable nonzero conversion when both the native fraction and configured rate are large", () => {
    expect(
      convertCurrencyAmount(
        {
          asset: { kind: ASSET_KINDS.Currency, code: "CNY" },
          value: `0.${"0".repeat(139)}1`,
        },
        "USD",
        1e100,
      ),
    ).toEqual({
      asset: { kind: ASSET_KINDS.Currency, code: "USD" },
      value: `0.${"0".repeat(239)}1`,
    })
  })

  it("converts a bounded tiny yuan amount instead of retaining yuan because of excessive display precision", () => {
    const amount = {
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
      value: `0.${"0".repeat(245)}1`,
    } as const
    expect(convertCurrencyAmount(amount, "USD", 0.1)).toEqual({
      asset: { kind: ASSET_KINDS.Currency, code: "USD" },
      value: `0.${"0".repeat(244)}1`,
    })
  })

  it("honors both selected currencies and preserves original units when no currency is selected", () => {
    const yuan = {
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
      value: "8",
    } as const
    expect(formatBalanceAmount(yuan, "en-US", "USD", 7)).toBe("$1.14")
    expect(formatBalanceAmount(yuan, "en-US", "CNY", 7)).toBe("¥8.00")
    expect(formatBalanceAmount(yuan, "en-US", undefined, 7)).toBe("¥8.00")
    expect(
      formatBalanceAmount({ ...yuan, value: "-8" }, "en-US", "USD", 7),
    ).toBe("-$1.14")
    expect(
      formatBalanceAmount(
        { ...yuan, value: "0.00000000000000000001" },
        "en-US",
        "USD",
        7,
      ),
    ).toBe("<$0.01")
    expect(yuan.value).toBe("8")
  })
  it("bounds large account summaries by magnitude without changing exact native amounts", () => {
    const amount = {
      value: "1234567.891",
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    } as const
    expect(
      formatBalanceAmount(amount, "en-US", "USD", 7.3, {
        maximumIntegerDigits: 4,
      }),
    ).toBe("$1.23M")
    expect(formatAssetAmount(amount, "en-US")).toContain("1,234,567.891")
    expect(amount.value).toBe("1234567.891")
  })
  it("bounds native quota and crypto summaries without repeating the Token scale", () => {
    const options = { maximumIntegerDigits: 4 }
    expect(
      formatBalanceAmount(
        {
          value: "5000000",
          asset: {
            kind: "quota",
            id: "unknown",
            label: "quota",
            displayScale: 1,
            displayLabel: "quota",
          },
        },
        "en-US",
        undefined,
        undefined,
        options,
      ),
    ).toBe("5M quota")
    expect(
      formatBalanceAmount(
        {
          value: "5299832500000",
          asset: {
            kind: "quota",
            id: "tokens",
            label: "Token",
            displayScale: 1000000,
            displayLabel: "M Token",
          },
        },
        "en-US",
        undefined,
        undefined,
        options,
      ),
    ).toBe("5.3T Token")
    expect(
      formatBalanceAmount(
        {
          value: "9999995000",
          asset: {
            kind: "quota",
            id: "tokens",
            label: "Token",
            displayScale: 1000000,
            displayLabel: "M Token",
          },
        },
        "en-US",
        undefined,
        undefined,
        options,
      ),
    ).toBe("10B Token")
    expect(
      formatBalanceAmount(
        {
          value: "1234567.89",
          asset: {
            kind: "crypto",
            id: "XNO",
          },
        },
        "en-US",
        undefined,
        undefined,
        options,
      ),
    ).toBe("1.23M XNO")
  })
  it("keeps localized and extreme summaries bounded at rounding boundaries", () => {
    const asset = { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD } as const
    const options = { maximumIntegerDigits: 4 }
    const format = (value: string, locale = "en-US") =>
      formatBalanceAmount(
        { value, asset },
        locale,
        CURRENCIES.USD,
        7.3,
        options,
      )
    expect(format("9999.995")).toBe("$10K")
    expect(format("-1234567.89")).toBe("-$1.23M")
    expect(format("1234567.89", "zh-CN")).toBe("$123万")
    expect(format("123456789012345678901234567890.99")).toBe("$1.23E29")
    expect(format("0.000000000001")).toBe("<$0.01")
    expect(format("-0.000000000001")).toBe(">-$0.01")
    expect(format("0")).toBe("$0.00")
    expect(
      formatBalanceAmount(
        { value: "12345.6789", asset },
        "en-US",
        "CNY",
        7.3,
        options,
      ),
    ).toBe("¥90.1K")
  })
  it("bounds native balance precision while retaining exact amounts for details", () => {
    const asset = {
      kind: ASSET_KINDS.Quota,
      id: "emrank",
      label: "Token",
      displayScale: 1000000,
      displayLabel: "M Token",
    } as const
    const amount = { value: "52998325", asset }
    expect(formatBalanceAmount(amount, "en-US")).toBe("53 M Token")
    expect(formatBalanceAmount({ value: "32765432", asset }, "en-US")).toBe(
      "32.77 M Token",
    )
    expect(formatBalanceAmount({ value: "1000", asset }, "en-US")).toBe(
      "1,000 Token",
    )
    expect(
      formatBalanceAmount(
        { value: "1.123456789012345", asset: { kind: "crypto", id: "XNO" } },
        "en-US",
      ),
    ).toBe("1.12 XNO")
    expect(formatAssetAmount(amount, "en-US")).toBe("52.998325 M Token")
    expect(amount.value).toBe("52998325")
  })
  it("matches ordinary native console currency precision without losing stored decimal amounts", () => {
    const amount = {
      value: "3671.208938",
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    } as const
    expect(formatBalanceAmount(amount, "en-US")).toBe("$3,671.21")
    expect(
      formatBalanceAmount(
        { value: "3.9775790838", asset: amount.asset },
        "en-US",
      ),
    ).toBe("$3.98")
    expect(
      formatBalanceAmount({ value: "-1.995", asset: amount.asset }, "en-US"),
    ).toBe("-$2.00")
    expect(
      formatBalanceAmount(
        { value: "9007199254740993.005", asset: amount.asset },
        "en-US",
      ),
    ).toBe("$9,007,199,254,740,993.01")
    expect(amount.value).toBe("3671.208938")
    expect(formatAssetAmount(amount, "en-US")).toContain("3,671.208938")
  })
  it("switches a standard USD balance to CNY without converting native Tokens", () => {
    expect(
      formatBalanceAmount(
        { value: "10", asset: { kind: "currency", code: "USD" } },
        "en-US",
        "USD",
        7.3,
      ),
    ).toBe("$10.00")
    expect(
      formatBalanceAmount(
        { value: "10", asset: { kind: "currency", code: "USD" } },
        "en-US",
        "CNY",
        7.3,
      ),
    ).toBe("¥73.00")
    expect(
      formatBalanceAmount(
        {
          value: "3000000",
          asset: {
            kind: "quota",
            id: "emrank",
            label: "Token",
            displayScale: 1000000,
            displayLabel: "M Token",
          },
        },
        "en-US",
        "CNY",
        7.3,
      ),
    ).toBe("3 M Token")
  })
  it("bounds currency summaries and distinguishes tiny signed balances from zero", () => {
    expect(
      formatBalanceAmount(
        { value: "8", asset: { kind: "currency", code: "CNY" } },
        "en-US",
        "USD",
      ),
    ).toBe("$1.11")
    expect(
      formatBalanceAmount(
        { value: "0.1", asset: { kind: "currency", code: "USD" } },
        "en-US",
        "USD",
      ),
    ).toBe("$0.10")
    expect(
      formatBalanceAmount(
        { value: "-0.00001", asset: { kind: "currency", code: "USD" } },
        "en-US",
        "USD",
      ),
    ).toBe(">-$0.01")
    expect(
      formatBalanceAmount(
        {
          value: "0.000000000000000001",
          asset: { kind: "currency", code: "USD" },
        },
        "en-US",
      ),
    ).toBe("<$0.01")
    expect(
      formatBalanceAmount(
        { value: "0", asset: { kind: "currency", code: "USD" } },
        "en-US",
        "USD",
      ),
    ).toBe("$0.00")
  })
  it("preserves exact native decimals, large integers, and negative fractional currency values", () => {
    expect(
      formatAssetAmount(
        {
          value: "6.000000000000000001",
          asset: { kind: "currency", code: "USD" },
        },
        "en-US",
      ),
    ).toContain("6.000000000000000001")
    expect(
      formatAssetAmount(
        {
          value: "-0.000000000000000001",
          asset: { kind: "currency", code: "EUR" },
        },
        "de-DE",
      ),
    ).toContain("-0,000000000000000001")
    expect(
      formatAssetAmount(
        { value: "9007199254740993.001", asset: { kind: "crypto", id: "XNO" } },
        "en-US",
      ),
    ).toBe("9,007,199,254,740,993.001 XNO")
    expect(
      formatAssetAmount(
        {
          value: "9007199254740993",
          asset: {
            kind: "quota",
            id: "tokens",
            label: "Token",
            displayScale: 1000000,
            displayLabel: "M Token",
          },
        },
        "en-US",
      ),
    ).toBe("9,007,199,254.740993 M Token")
  })
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
