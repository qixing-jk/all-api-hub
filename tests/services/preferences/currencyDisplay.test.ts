import { describe, expect, it } from "vitest"

import {
  CURRENCIES,
  CURRENCY_DISPLAY_MODES,
  CURRENCY_DISPLAY_TYPES,
  CURRENCY_TYPES,
  isSupportedCurrency,
} from "~/constants/money"
import {
  getCurrencyDisplayUpdates,
  getDisplayCurrency,
  getNextCurrencyDisplay,
} from "~/services/preferences/currencyDisplay"
import {
  CURRENCY_TYPES as compatibilityCurrencies,
  CURRENCY_DISPLAY_TYPES as compatibilityModes,
} from "~/types"

describe("currency display policy", () => {
  it("preserves the released runtime values, order and compatibility exports", () => {
    expect(CURRENCY_TYPES).toEqual(["USD", "CNY"])
    expect(CURRENCY_DISPLAY_TYPES).toEqual(["original", "USD", "CNY"])
    expect(compatibilityCurrencies).toBe(CURRENCY_TYPES)
    expect(compatibilityModes).toBe(CURRENCY_DISPLAY_TYPES)
  })

  it("keeps original mode independent from the saved reference currency", () => {
    for (const currency of CURRENCY_TYPES) {
      expect(
        getDisplayCurrency(CURRENCY_DISPLAY_MODES.Original, currency),
      ).toBeUndefined()
      expect(getDisplayCurrency(undefined, currency)).toBe(currency)
    }
    expect(getDisplayCurrency(CURRENCY_DISPLAY_MODES.CNY, CURRENCIES.USD)).toBe(
      "CNY",
    )
    expect(getDisplayCurrency(CURRENCY_DISPLAY_MODES.USD, CURRENCIES.CNY)).toBe(
      "USD",
    )
    expect(getCurrencyDisplayUpdates(CURRENCY_DISPLAY_MODES.Original)).toEqual({
      currencyDisplay: "original",
    })
    expect(getCurrencyDisplayUpdates(CURRENCY_DISPLAY_MODES.CNY)).toEqual({
      currencyDisplay: "CNY",
      currencyType: "CNY",
    })
    expect(getCurrencyDisplayUpdates(CURRENCY_DISPLAY_MODES.USD)).toEqual({
      currencyDisplay: "USD",
      currencyType: "USD",
    })
  })

  it("cycles all modes and recognizes only the exact supported monetary pair", () => {
    const cycle = CURRENCY_DISPLAY_TYPES.map(getNextCurrencyDisplay)
    expect(cycle).toEqual(["USD", "CNY", "original"])
    for (const currency of CURRENCY_TYPES)
      expect(isSupportedCurrency(currency)).toBe(true)
    for (const value of [
      "usd",
      "EUR",
      "original",
      "XNO",
      "",
      null,
      undefined,
      0,
    ])
      expect(isSupportedCurrency(value)).toBe(false)
  })
})
