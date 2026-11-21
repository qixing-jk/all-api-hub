import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { buildNativeHistorySortOptions } from "~/features/BalanceHistory/reporting/accountSummary"
import { accountBalanceScope } from "~/services/accounts/balanceSnapshot"
import { balancePosition } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import type { FinancialHistorySeries } from "~/services/history/dailyBalanceHistory/selectors"

const series = (
  id: string,
  values: Array<string | null>,
): FinancialHistorySeries => ({
  key: id,
  accountId: id,
  position: balancePosition({
    id: "wallet",
    scope: accountBalanceScope({
      baseUrl: `https://${id}.example`,
      accountId: id,
    }),
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    value: "1",
    observedAt: 1,
    source: {
      adapter: "fixture",
      operation: "balance",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    },
  }),
  values,
  observations: values.map((value, index) => ({
    at: index,
    observedAt: index,
    value,
    status:
      value === null
        ? OBSERVATION_STATUSES.Unknown
        : OBSERVATION_STATUSES.Known,
  })),
})

describe("native history sorting choices", () => {
  it("uses the latest exact amount, includes zero and keeps missing observations out", () => {
    const options = buildNativeHistorySortOptions(
      [
        series("one", ["100", "0"]),
        series("two", ["5", "1.000000000000000001"]),
        series("missing", ["999", null]),
      ],
      [],
      () => "Wallet · USD",
    )
    expect(options.size).toBe(1)
    const [option] = options.values()
    expect(option?.label).toBe("Wallet · USD")
    expect(option?.values).toEqual(
      new Map([
        ["one", "0"],
        ["two", "1.000000000000000001"],
      ]),
    )
  })

  it("does not combine distinct currencies into one sortable amount", () => {
    const usd = series("one", ["2"])
    const cny = series("two", ["5"])
    cny.position.asset = { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY }
    expect(
      buildNativeHistorySortOptions([usd, cny], [], () => "Wallet").size,
    ).toBe(0)
  })

  it("keeps multiple positions from one account separate from cross-account sorting", () => {
    const one = series("one", ["2"])
    const other = series("two", ["5"])
    const duplicate = { ...one, key: "another-wallet" }
    expect(
      buildNativeHistorySortOptions([one, other, duplicate], [], () => "Wallet")
        .size,
    ).toBe(0)
  })
})
