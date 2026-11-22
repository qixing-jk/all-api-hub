import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { getBalancePortfolioPresentation } from "~/features/AccountManagement/components/balancePortfolioPresentation"
import type { Amount } from "~/services/amounts/balance"
import { ASSET_KINDS } from "~/services/amounts/financialConstants"

const usd: Amount = {
  asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
  value: "2",
}
const cny: Amount = {
  asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
  value: "14.4",
}
const quota: Amount = {
  asset: {
    kind: ASSET_KINDS.Quota,
    id: "provider-token",
    label: "Token",
    displayScale: 1000,
    displayLabel: "K Token",
  },
  value: "3000",
}
const crypto: Amount = {
  asset: { kind: ASSET_KINDS.Crypto, id: "XNO" },
  value: "5",
}

describe("balance portfolio presentation", () => {
  it("orders native assets without mutating the portfolio or losing nonmonetary groups", () => {
    const amounts = [quota, cny, crypto, usd]
    const portfolio = {
      amounts,
      convertedCurrencyTotals: { USD: "4", CNY: "28.8" },
    }
    const result = getBalancePortfolioPresentation(portfolio, undefined, true)
    expect(result.amounts).toEqual([usd, cny, crypto, quota])
    expect(result.primaryAmount).toBe(usd)
    expect(result.useConvertedPrimary).toBe(false)
    expect(result.hasAdditionalAssetGroups).toBe(true)
    expect(result.canToggleCurrency).toBe(true)
    expect(portfolio.amounts).toEqual([quota, cny, crypto, usd])
  })

  it("uses the complete per-account conversion while retaining the native breakdown", () => {
    const result = getBalancePortfolioPresentation(
      { amounts: [cny, usd], convertedCurrencyTotals: { CNY: "28.8" } },
      CURRENCIES.CNY,
      true,
    )
    expect(result.primaryAmount).toEqual({
      asset: { kind: "currency", code: "CNY" },
      value: "28.8",
    })
    expect(result.amounts).toEqual([usd, cny])
    expect(result.useConvertedPrimary).toBe(true)
    expect(result.hasAdditionalAssetGroups).toBe(false)
  })

  it("does not hide quota or invent a missing converted subtotal", () => {
    const mixed = {
      amounts: [cny, usd, quota],
      convertedCurrencyTotals: { USD: "4" },
    }
    expect(
      getBalancePortfolioPresentation(mixed, CURRENCIES.USD, true)
        .hasAdditionalAssetGroups,
    ).toBe(true)
    const unavailable = getBalancePortfolioPresentation(
      mixed,
      CURRENCIES.CNY,
      true,
    )
    expect(unavailable.primaryAmount).toBe(usd)
    expect(unavailable.useConvertedPrimary).toBe(false)
    expect(unavailable.hasAdditionalAssetGroups).toBe(true)
  })

  it("keeps zero, empty and noncurrency portfolios distinct", () => {
    const zero = getBalancePortfolioPresentation(
      { amounts: [cny], convertedCurrencyTotals: { USD: "0" } },
      CURRENCIES.USD,
      false,
    )
    expect(zero.primaryAmount?.value).toBe("0")
    expect(zero.canToggleCurrency).toBe(false)
    const empty = getBalancePortfolioPresentation(
      { amounts: [], convertedCurrencyTotals: {} },
      CURRENCIES.USD,
      true,
    )
    expect(empty.primaryAmount).toBeUndefined()
    expect(empty.hasAdditionalAssetGroups).toBe(false)
    const noncurrency = getBalancePortfolioPresentation(
      { amounts: [quota], convertedCurrencyTotals: { USD: "9" } },
      CURRENCIES.USD,
      true,
    )
    expect(noncurrency.primaryAmount).toBe(quota)
    expect(noncurrency.canToggleCurrency).toBe(false)
  })
})
