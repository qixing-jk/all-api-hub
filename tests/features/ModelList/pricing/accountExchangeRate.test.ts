import { describe, expect, it } from "vitest"

import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import {
  resolveAccountExchangeRate,
  resolveKnownAccountExchangeRate,
} from "~/features/ModelList/pricing/accountExchangeRate"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

describe("account exchange rate", () => {
  it("does not treat a legacy balance ratio as an evidenced exchange rate", () => {
    const account = buildDisplaySiteData({ balance: { USD: 2, CNY: 20 } })
    expect(resolveKnownAccountExchangeRate(account)).toBeUndefined()
    expect(resolveAccountExchangeRate(account)).toBe(DEFAULT_USD_TO_CNY_RATE)
  })
  it("uses an explicit rate independently of zero or contradictory legacy balances", () => {
    for (const balance of [
      { USD: 0, CNY: 0 },
      { USD: 2, CNY: 20 },
    ]) {
      const account = buildDisplaySiteData({ exchangeRate: 7.5, balance })
      expect(resolveKnownAccountExchangeRate(account)).toBe(7.5)
      expect(resolveAccountExchangeRate(account)).toBe(7.5)
    }
  })
  it.each([undefined, 0, -1, NaN, Infinity])(
    "uses the display default without reporting an evidenced rate for %s",
    (exchangeRate) => {
      const account = buildDisplaySiteData({ exchangeRate })
      expect(resolveKnownAccountExchangeRate(account)).toBeUndefined()
      expect(resolveAccountExchangeRate(account)).toBe(DEFAULT_USD_TO_CNY_RATE)
    },
  )
})
