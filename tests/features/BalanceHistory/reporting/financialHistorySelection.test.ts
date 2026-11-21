import { expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import {
  canSumFinancialHistory,
  getFinancialHistoryDayEntries,
} from "~/features/BalanceHistory/reporting/financialHistorySelection"
import { accountBalanceScope } from "~/services/accounts/balanceSnapshot"
import { balancePosition } from "~/services/amounts/balance"
import type { FinancialHistorySeries } from "~/services/history/dailyBalanceHistory/selectors"

it("makes a history total available for independently identified organizations and workspaces", () => {
  for (const identity of ["organizationId", "workspaceId"] as const) {
    const series: FinancialHistorySeries[] = ["one", "two"].map(
      (id, index) => ({
        key: id,
        accountId: id,
        position: balancePosition({
          id: "available",
          scope: accountBalanceScope(
            { accountId: id, baseUrl: "https://vercel.com" },
            { [identity]: id },
          ),
          asset: { kind: "currency", code: CURRENCIES.USD },
          value: String(index + 1),
          observedAt: 1,
          source: {
            adapter: "fixture",
            operation: "balance",
            contractVersion: "1",
            kind: "reported",
          },
        }),
        values: [String(index + 1)],
        observations: [],
      }),
    )
    expect(canSumFinancialHistory(series)).toBe(true)
    expect(getFinancialHistoryDayEntries(series, 0)).toEqual([
      { value: "3", covered: 2, total: 2 },
    ])
    series[1]!.position.scope[identity] = "one"
    expect(canSumFinancialHistory(series)).toBe(false)
    delete series[1]!.position.scope[identity]
    expect(canSumFinancialHistory(series)).toBe(false)
  }
})
