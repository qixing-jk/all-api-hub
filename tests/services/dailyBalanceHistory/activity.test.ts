import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { accountBalanceScope } from "~/services/accounts/balanceSnapshot"
import { observeAmount } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
  INCOME_CLASSIFICATIONS,
} from "~/services/amounts/financialConstants"
import type { FinancialIncomeFact } from "~/services/amounts/income"
import type { FinancialConsumptionFact } from "~/services/amounts/usage"
import { NEW_API_FINANCIAL_CONTRACT_VERSIONS } from "~/services/apiService/newApiFamily/financialContractVersions"
import { buildFinancialHistoryActivity } from "~/services/history/dailyBalanceHistory/activity"

describe("recorded financial history activity", () => {
  const day = Date.UTC(2026, 10, 1)
  const dayAfter = Date.UTC(2026, 10, 2)
  const scope = accountBalanceScope({
    baseUrl: "https://fixture.invalid",
    accountId: "alpha",
  })
  const spend = (
    start: number,
    end: number,
    value: string,
    operation: string,
  ): FinancialConsumptionFact => ({
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    scope,
    window: { start, end, timeZone: "UTC" },
    amount: observeAmount(
      value,
      {
        adapter: "fixture",
        operation,
        kind: EVIDENCE_KINDS.Reported,
        contractVersion: "1",
      },
      end,
    ),
    settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
    coverage: FINANCIAL_COVERAGE.Complete,
  })

  it("restores signed net amounts only for complete, same-asset and same-window cashflow", () => {
    const income = (
      start: number,
      end: number,
      value: string,
    ): FinancialIncomeFact => {
      const { amount, asset, coverage, scope, window } = spend(
        start,
        end,
        value,
        "income",
      )
      return {
        amount,
        asset,
        coverage,
        scope,
        window,
        classification: INCOME_CLASSIFICATIONS.Unclassified,
      }
    }
    const firstEnd = day + 3_600_000
    const secondEnd = dayAfter + 3_600_000
    const flows = buildFinancialHistoryActivity({
      store: {
        schemaVersion: 4,
        referenceSnapshotsByAccountId: {},
        financialSnapshotsByAccountId: {
          alpha: [
            {
              source: "refresh",
              reportedIncome: [
                income(day, firstEnd, "4"),
                income(dayAfter, secondEnd + 60_000, "11"),
              ],
              settledConsumption: [
                spend(day, firstEnd, "7", "spend"),
                spend(dayAfter, secondEnd, "2", "spend"),
              ],
            },
          ],
        },
      },
      accountIds: ["alpha"],
      dayKeys: ["2026-11-01", "2026-11-02"],
      asOf: secondEnd + 60_000,
    })

    expect(flows).toContainEqual(
      expect.objectContaining({
        kind: "net",
        total: "-3",
        values: ["-3", null],
      }),
    )
  })

  it("preserves a recorded zero in a disjoint window when another day has conflicting sources", () => {
    const flows = buildFinancialHistoryActivity({
      store: {
        schemaVersion: 4,
        referenceSnapshotsByAccountId: {},
        financialSnapshotsByAccountId: {
          alpha: [
            {
              source: "refresh",
              settledConsumption: [
                spend(day, day + 3_600_000, "7", "ledger"),
                spend(day + 1_800_000, day + 7_200_000, "9", "dashboard"),
                spend(dayAfter, dayAfter + 3_600_000, "0", "ledger"),
              ],
            },
          ],
        },
      },
      accountIds: ["alpha"],
      dayKeys: ["2026-11-01", "2026-11-02"],
      asOf: dayAfter + 3_600_000,
    })
    expect(flows).toEqual([
      expect.objectContaining({
        total: "0",
        values: [null, "0"],
        recordedDays: ["2026-11-02"],
      }),
    ])
  })

  it("keeps the latest compatible New API spend when statistics switch to logs", () => {
    const charge = (value: string, operation: string, hour: number) => {
      const fact = spend(day, dayAfter, value, operation)
      fact.amount = observeAmount(
        value,
        {
          ...fact.amount.source,
          adapter: "new-api",
          contractVersion: NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd,
        },
        day + hour * 3_600_000,
      )
      return fact
    }
    expect(
      buildFinancialHistoryActivity({
        store: {
          schemaVersion: 4,
          referenceSnapshotsByAccountId: {},
          financialSnapshotsByAccountId: {
            alpha: [
              {
                source: "refresh",
                settledConsumption: [
                  charge("3", "/api/log/self/stat:quota", 12),
                ],
              },
              {
                source: "refresh",
                settledConsumption: [
                  charge("4", "/api/log/self:consumption", 13),
                ],
              },
            ],
          },
        },
        accountIds: ["alpha"],
        dayKeys: ["2026-11-01"],
        asOf: dayAfter,
      }),
    ).toEqual([
      expect.objectContaining({
        kind: "consumption",
        total: "4",
        values: ["4"],
      }),
    ])
  })

  it("shows a site-day cost using the latest observation instead of adding daily counters", () => {
    const cost = (value: string, hour: number) => {
      const { amount, asset } = spend(
        day,
        day + hour * 3_600_000,
        value,
        "site-day",
      )
      return { dayKey: "2026-11-01", asset, amount, scope }
    }
    expect(
      buildFinancialHistoryActivity({
        store: {
          schemaVersion: 4,
          referenceSnapshotsByAccountId: {},
          financialSnapshotsByAccountId: {
            alpha: [
              { source: "refresh", reportedDayCosts: [cost("3", 12)] },
              { source: "refresh", reportedDayCosts: [cost("4", 13)] },
            ],
          },
        },
        accountIds: ["alpha"],
        dayKeys: ["2026-11-01"],
        asOf: dayAfter,
      }),
    ).toEqual([
      expect.objectContaining({
        kind: "consumption",
        siteDay: true,
        partial: true,
        total: "4",
        values: ["4"],
      }),
    ])
  })

  it("shows the latest undated site-day cost without counting a browser midnight as a reset", () => {
    const midnight = new Date(2026, 10, 2).getTime()
    const cost = (value: string, at: number) => {
      const { amount, asset } = spend(at - 1, at, value, "site-day")
      return { asset, amount, scope }
    }
    const result = buildFinancialHistoryActivity({
      store: {
        schemaVersion: 4,
        referenceSnapshotsByAccountId: {},
        financialSnapshotsByAccountId: {
          alpha: [
            {
              source: "refresh",
              reportedDayCosts: [cost("10", midnight - 300_000)],
            },
            {
              source: "refresh",
              reportedDayCosts: [cost("11", midnight + 300_000)],
            },
          ],
        },
      },
      accountIds: ["alpha"],
      dayKeys: ["2026-11-01", "2026-11-02"],
      asOf: midnight + 600_000,
    })

    expect(result).toEqual([
      expect.objectContaining({
        siteDay: true,
        partial: true,
        total: "11",
        values: [null, "11"],
      }),
    ])
  })
})
