import { describe, expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import {
  balancePosition,
  type BalancePosition,
} from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_ROLES,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import type { FinancialConsumptionFact } from "~/services/amounts/usage"
import { getFinancialSeriesKey } from "~/services/history/dailyBalanceHistory/identity"
import {
  buildFinancialHistorySeries,
  FINANCIAL_HISTORY_LIFECYCLE_STATUSES,
} from "~/services/history/dailyBalanceHistory/selectors"
import { AuthTypeEnum } from "~/types"
import type { DailyBalanceHistoryStore } from "~/types/dailyBalanceHistory"
import { DAILY_BALANCE_HISTORY_CAPTURE_SOURCES } from "~/types/dailyBalanceHistory"

const first = new Date(2026, 1, 7, 12).getTime()
const second = new Date(2026, 1, 8, 12).getTime()
const scope = accountBalanceScope({
  baseUrl: "https://fixture.invalid",
  accountId: "a1",
  auth: { authType: AuthTypeEnum.AccessToken },
})
const source = {
  adapter: "fixture",
  operation: "console",
  contractVersion: "1",
  kind: EVIDENCE_KINDS.Reported,
}
const position = (value = "1.000000000000000001", observedAt = first) =>
  balancePosition({
    id: "wallet",
    scope,
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
    value,
    observedAt,
    source,
  })
const query = (store: DailyBalanceHistoryStore) =>
  buildFinancialHistorySeries({
    store,
    asOf: new Date(2026, 1, 10).getTime(),
    accountIds: ["a1"],
    startDayKey: "2026-02-07",
    endDayKey: "2026-02-09",
  })
const billingScope = {
  ...scope,
  walletId: "main",
  projects: { kind: SCOPE_SELECTION_KINDS.All },
  keys: { kind: SCOPE_SELECTION_KINDS.All },
  models: { kind: SCOPE_SELECTION_KINDS.All },
  groups: { kind: SCOPE_SELECTION_KINDS.All },
}

it("keeps a later receipt and its ending outside an as-of report", () => {
  const known = position("7", first)
  const [series] = buildFinancialHistorySeries({
    store: {
      schemaVersion: 4,
      referenceSnapshotsByAccountId: {},
      financialSnapshotsByAccountId: {
        a1: [
          {
            balance: accountBalanceSnapshot(scope, [known], first),
            source: "refresh",
          },
          {
            balance: accountBalanceSnapshot(
              scope,
              [position("14", second)],
              second,
            ),
            endedPositionKeys: [getFinancialSeriesKey(known)],
            source: "refresh",
          },
        ],
      },
    },
    asOf: first,
    accountIds: ["a1"],
    startDayKey: "2026-02-07",
    endDayKey: "2026-02-09",
  }).series

  expect(series?.observations).toEqual([
    expect.objectContaining({ at: first, status: "known", value: "7" }),
  ])
})
const ledger = (
  value: string,
  at: number,
  asset: BalancePosition["asset"] = position().asset,
): BalancePosition => ({
  ...position(value, at),
  role: BALANCE_ROLES.Ledger,
  scope: billingScope,
  asset,
})
const cumulativeCharge = (
  value: string,
  observedAt: number,
  start: number,
  asset: BalancePosition["asset"] = position().asset,
) =>
  ({
    asset,
    amount: {
      status: OBSERVATION_STATUSES.Known,
      value,
      observedAt,
      source: { ...source, operation: "usage" },
    },
    scope: billingScope,
    window: { start, end: start + 86_400_000, timeZone: "UTC" },
    cumulative: true,
    coverage: FINANCIAL_COVERAGE.Complete,
    settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
  }) satisfies FinancialConsumptionFact
const receipt = (
  at: number,
  positions: BalancePosition[],
  settledConsumption?: FinancialConsumptionFact[],
) => ({
  source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
  balance: accountBalanceSnapshot(
    scope,
    positions,
    at,
    FINANCIAL_COVERAGE.Complete,
  ),
  settledConsumption,
})

describe("native financial history reporting", () => {
  it("keeps a successful daily balance after a later failed refresh", () => {
    const known = position("5")
    const stale = {
      ...known,
      amount: {
        ...known.amount,
        status: OBSERVATION_STATUSES.Stale,
        value: "5",
        observedAt: first,
        reason: "refresh failed",
      },
    }
    const result = query({
      schemaVersion: 4,
      referenceSnapshotsByAccountId: {},
      financialSnapshotsByAccountId: {
        a1: [
          {
            source: "refresh",
            balance: accountBalanceSnapshot(scope, [known], first, "complete"),
          },
          {
            source: "refresh",
            balance: accountBalanceSnapshot(
              scope,
              [stale],
              first + 60_000,
              "partial",
            ),
          },
        ],
      },
    })

    expect(result.series[0]?.values).toEqual(["5", null, null])
    expect(result.series[0]?.observations.at(-1)).toMatchObject({
      observedAt: first,
      value: "5",
      status: "stale",
    })
    expect(result.series[0]?.observations.at(-1)?.netInflow).toBeUndefined()
  })

  it("keeps a later accepted removal after a wall-clock rollback instead of reviving an older daily value", () => {
    const known = position("5", first + 2000)
    const result = query({
      schemaVersion: 4,
      referenceSnapshotsByAccountId: {},
      financialSnapshotsByAccountId: {
        a1: [
          {
            generation: 2,
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            balance: accountBalanceSnapshot(
              scope,
              [],
              first,
              FINANCIAL_COVERAGE.Complete,
            ),
            endedPositionKeys: [getFinancialSeriesKey(known)],
          },
          {
            generation: 1,
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            balance: accountBalanceSnapshot(
              scope,
              [known],
              first + 2000,
              FINANCIAL_COVERAGE.Complete,
            ),
          },
        ],
      },
    })
    expect(result.series[0]?.values).toEqual([null, null, null])
    expect(
      result.series[0]?.observations.map((item) => [item.status, item.at]),
    ).toEqual([
      ["ended", first],
      ["known", first + 2000],
    ])
  })

  it("keeps equal-time reappearance after removal in accepted generation order", () => {
    const known = position("5")
    const result = query({
      schemaVersion: 4,
      referenceSnapshotsByAccountId: {},
      financialSnapshotsByAccountId: {
        a1: [
          {
            generation: 3,
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            balance: accountBalanceSnapshot(
              scope,
              [known],
              first,
              FINANCIAL_COVERAGE.Complete,
            ),
          },
          {
            generation: 1,
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            balance: accountBalanceSnapshot(
              scope,
              [known],
              first,
              FINANCIAL_COVERAGE.Complete,
            ),
          },
          {
            generation: 2,
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            balance: accountBalanceSnapshot(
              scope,
              [],
              first,
              FINANCIAL_COVERAGE.Complete,
            ),
            endedPositionKeys: [getFinancialSeriesKey(known)],
          },
        ],
      },
    })
    expect(result.series[0]?.values).toEqual(["5", null, null])
    expect(result.series[0]?.observations.map((item) => item.status)).toEqual([
      "known",
      "ended",
      "known",
    ])
  })
  it("does not report a superseded expiration after an observed renewal", () => {
    const initial = {
      ...position("10"),
      validity: { kind: BALANCE_VALIDITY_KINDS.Expires, at: second },
    }
    const renewed = {
      ...position("10", first + 1000),
      validity: {
        kind: BALANCE_VALIDITY_KINDS.Expires,
        at: second + 86_400_000,
      },
    }
    const result = query({
      schemaVersion: 4,
      referenceSnapshotsByAccountId: {},
      financialSnapshotsByAccountId: {
        a1: [
          {
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            balance: accountBalanceSnapshot(
              scope,
              [initial],
              first,
              FINANCIAL_COVERAGE.Complete,
            ),
          },
          {
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            balance: accountBalanceSnapshot(
              scope,
              [renewed],
              first + 1000,
              FINANCIAL_COVERAGE.Complete,
            ),
          },
        ],
      },
    })
    expect(
      result.series[0]?.observations.filter(
        (item) => item.status === FINANCIAL_HISTORY_LIFECYCLE_STATUSES.Expired,
      ),
    ).toEqual([{ at: second + 86_400_000, value: null, status: "expired" }])
    expect(result.series[0]?.position.validity).toEqual({
      kind: "expires",
      at: second + 86_400_000,
    })
  })
  it("keeps exact native units and independent console, inference and token series", () => {
    const console = position()
    const inference = {
      ...position("2"),
      amount: {
        ...position("2").amount,
        source: { ...source, operation: "inference" },
      },
    }
    const token = {
      ...position("4500"),
      asset: {
        kind: ASSET_KINDS.Quota,
        id: "fixture:tokens",
        label: "Token",
        displayScale: 1,
        displayLabel: "Token",
      },
    }
    const result = query({
      schemaVersion: 4,
      referenceSnapshotsByAccountId: {},
      financialSnapshotsByAccountId: {
        a1: [
          {
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            balance: accountBalanceSnapshot(
              scope,
              [console, inference, token],
              first,
              FINANCIAL_COVERAGE.Complete,
            ),
          },
        ],
      },
    })
    expect(result.series).toHaveLength(3)
    expect(result.series.map((s) => s.values)).toEqual([
      ["1.000000000000000001", null, null],
      ["2", null, null],
      ["4500", null, null],
    ])
    expect(result.series[0]?.position.asset).toEqual({
      kind: "currency",
      code: "CNY",
    })
    expect(result.series[1]?.position.amount.source.operation).toBe("inference")
  })

  it("keeps the original observation clock, deduplicates retained values, and breaks stale and ended series", () => {
    const known = position("5")
    const stale = {
      ...known,
      amount: {
        ...known.amount,
        status: OBSERVATION_STATUSES.Stale,
        value: "5",
        observedAt: first,
        reason: "refresh failed",
      },
    }
    const result = query({
      schemaVersion: 4,
      referenceSnapshotsByAccountId: {},
      financialSnapshotsByAccountId: {
        a1: [
          {
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            balance: accountBalanceSnapshot(
              scope,
              [known],
              first,
              FINANCIAL_COVERAGE.Complete,
            ),
          },
          {
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            balance: accountBalanceSnapshot(
              scope,
              [known],
              first + 1000,
              FINANCIAL_COVERAGE.Partial,
            ),
          },
          {
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            balance: accountBalanceSnapshot(
              scope,
              [stale],
              second,
              FINANCIAL_COVERAGE.Partial,
            ),
          },
          {
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            balance: accountBalanceSnapshot(
              scope,
              [],
              second + 1000,
              FINANCIAL_COVERAGE.Partial,
            ),
            endedPositionKeys: [getFinancialSeriesKey(known)],
          },
        ],
      },
    })
    expect(result.series[0]?.values).toEqual(["5", null, null])
    expect(result.series[0]?.observations).toEqual([
      { at: first, observedAt: first, value: "5", status: "known" },
      { at: second, observedAt: first, value: "5", status: "stale" },
      { at: second + 1000, value: null, status: "ended" },
    ])
  })

  it("marks expiry and reset without zero balances and separates contract and restriction changes", () => {
    const expires = {
      ...position("10"),
      validity: { kind: BALANCE_VALIDITY_KINDS.Expires, at: second },
    }
    const resets = {
      ...position("7"),
      id: "plan",
      window: { start: first, end: second, resetsAt: second, timeZone: "UTC" },
    }
    const newContract = {
      ...position("12", second),
      amount: {
        ...position("12", second).amount,
        source: { ...source, contractVersion: "2" },
      },
    }
    const restricted = {
      ...position("3", second),
      scope: {
        ...scope,
        projects: { kind: SCOPE_SELECTION_KINDS.Restricted, ids: ["project"] },
      },
    }
    const result = query({
      schemaVersion: 4,
      referenceSnapshotsByAccountId: {},
      financialSnapshotsByAccountId: {
        a1: [
          {
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            balance: accountBalanceSnapshot(
              scope,
              [expires, resets],
              first,
              FINANCIAL_COVERAGE.Complete,
            ),
          },
          {
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            balance: accountBalanceSnapshot(
              scope,
              [newContract, restricted],
              second,
              FINANCIAL_COVERAGE.Complete,
            ),
          },
        ],
      },
    })
    expect(result.series).toHaveLength(4)
    expect(result.series[0]?.observations.at(-1)).toEqual({
      at: second,
      value: null,
      status: "expired",
    })
    expect(result.series[1]?.observations.at(-1)).toEqual({
      at: second,
      value: null,
      status: "reset",
    })
    expect(result.series[0]?.values).toEqual(["10", null, null])
  })

  it("exposes an interval-matched negative net inflow separately from the balance value", () => {
    const billingScope = {
      ...scope,
      walletId: "main",
      projects: { kind: SCOPE_SELECTION_KINDS.All },
      keys: { kind: SCOPE_SELECTION_KINDS.All },
      models: { kind: SCOPE_SELECTION_KINDS.All },
      groups: { kind: SCOPE_SELECTION_KINDS.All },
    }
    const start = {
      ...position("10"),
      role: BALANCE_ROLES.Ledger,
      scope: billingScope,
    }
    const end = {
      ...position("5", second),
      role: BALANCE_ROLES.Ledger,
      scope: billingScope,
    }
    const result = query({
      schemaVersion: 4,
      referenceSnapshotsByAccountId: {},
      financialSnapshotsByAccountId: {
        a1: [
          {
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            balance: accountBalanceSnapshot(
              scope,
              [start],
              first,
              FINANCIAL_COVERAGE.Complete,
            ),
          },
          {
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            balance: accountBalanceSnapshot(
              scope,
              [end],
              second,
              FINANCIAL_COVERAGE.Complete,
            ),
            settledConsumption: [
              {
                asset: end.asset,
                amount: {
                  status: OBSERVATION_STATUSES.Known,
                  value: "2",
                  observedAt: second,
                  source: { ...source, operation: "usage" },
                },
                scope: billingScope,
                window: { start: first, end: second, timeZone: "UTC" },
                coverage: FINANCIAL_COVERAGE.Complete,
                settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
              },
            ],
          },
          {
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
            balance: accountBalanceSnapshot(
              scope,
              [end],
              second + 1000,
              FINANCIAL_COVERAGE.Partial,
            ),
          },
        ],
      },
    })
    expect(result.series[0]?.observations.at(-1)?.netInflow).toMatchObject({
      status: "available",
      amount: { value: "-3", asset: { kind: "currency", code: "CNY" } },
      classification: "unclassified-net-change",
    })
    expect(result.series[0]?.values).toEqual(["10", "5", null])
    expect(result.series[0]?.observations).toHaveLength(2)
  })

  it.each([OBSERVATION_STATUSES.Known, OBSERVATION_STATUSES.Stale])(
    "recovers cumulative net inflow from a declared billing boundary without an initial charge reading after %s consumption",
    (status) => {
      // Local noon is deliberately distinct from the host's midnight. The
      // declared UTC billing interval is valid without changing Date or Intl.
      const boundary = first
      const recoveredAt = boundary + 7 * 3_600_000
      const observedCharge = cumulativeCharge(
        "3.5",
        boundary + 6 * 3_600_000,
        boundary,
      )
      const result = query({
        schemaVersion: 4,
        referenceSnapshotsByAccountId: {},
        financialSnapshotsByAccountId: {
          a1: [
            {
              source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
              balance: accountBalanceSnapshot(
                scope,
                [ledger("20", boundary + 60_000)],
                boundary + 60_000,
                FINANCIAL_COVERAGE.Complete,
              ),
            },
            {
              source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
              balance: accountBalanceSnapshot(
                scope,
                [ledger("22", boundary + 6 * 3_600_000 + 60_000)],
                boundary + 6 * 3_600_000 + 60_000,
                FINANCIAL_COVERAGE.Complete,
              ),
              settledConsumption: [
                {
                  ...observedCharge,
                  amount:
                    status === OBSERVATION_STATUSES.Stale
                      ? {
                          ...observedCharge.amount,
                          status,
                          reason: "charge request failed",
                        }
                      : observedCharge.amount,
                },
              ],
            },
            {
              source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
              balance: accountBalanceSnapshot(
                scope,
                [ledger("23", recoveredAt)],
                recoveredAt,
                FINANCIAL_COVERAGE.Complete,
              ),
              settledConsumption: [
                cumulativeCharge("4", recoveredAt, boundary),
              ],
            },
          ],
        },
      })

      expect(result.series[0]?.values).toEqual(["23", null, null])
      expect(result.series[0]?.observations[1]?.netInflow).toMatchObject(
        status === OBSERVATION_STATUSES.Stale
          ? { status: "unavailable", reason: "consumption-unavailable" }
          : { status: "available", amount: { value: "5.5" } },
      )
      expect(result.series[0]?.observations.at(-1)?.netInflow).toMatchObject({
        status: "available",
        amount: { value: "7", asset: { kind: "currency", code: "CNY" } },
        window: {
          start: boundary + 60_000,
          end: recoveredAt,
          timeZone: "UTC",
        },
        partial: true,
      })
    },
  )

  it.each(["asset", "wallet", "contract"] as const)(
    "matches independent cumulative periods to each native %s instead of the first charge's period",
    (scenario) => {
      const usd = {
        kind: ASSET_KINDS.Currency,
        code: scenario === "asset" ? CURRENCIES.USD : CURRENCIES.CNY,
      } as const
      const secondaryScope =
        scenario === "wallet"
          ? { ...billingScope, walletId: "secondary" }
          : billingScope
      const secondarySource = {
        ...source,
        contractVersion: scenario === "contract" ? "2" : "1",
      }
      const secondaryLedger = (value: string, at: number) => {
        const balance = ledger(value, at, usd)
        return {
          ...balance,
          scope: secondaryScope,
          amount: { ...balance.amount, source: secondarySource },
        }
      }
      const usdBoundary = first + 5 * 60_000
      const later = first + 6 * 3_600_000
      const end = first + 7 * 3_600_000
      const initialCny = ledger("20", first + 60_000)
      const result = query({
        schemaVersion: 4,
        referenceSnapshotsByAccountId: {},
        financialSnapshotsByAccountId: {
          a1: [
            receipt(first + 60_000, [
              initialCny,
              secondaryLedger("8", first + 60_000),
            ]),
            receipt(usdBoundary + 60_000, [
              initialCny,
              secondaryLedger("10", usdBoundary + 60_000),
            ]),
            receipt(later, [ledger("22", later), secondaryLedger("12", later)]),
            receipt(
              end,
              [ledger("23", end), secondaryLedger("13", end)],
              [
                cumulativeCharge("4", end, first),
                {
                  ...cumulativeCharge("2", end, usdBoundary, usd),
                  scope: secondaryScope,
                  amount: {
                    ...cumulativeCharge("2", end, usdBoundary, usd).amount,
                    source: { ...secondarySource, operation: "usage" },
                  },
                },
              ],
            ),
          ],
        },
      })

      expect(result.series).toHaveLength(2)
      expect(
        result.series.map((series) => series.observations.at(-1)?.netInflow),
      ).toMatchObject([
        { status: "available", amount: { asset: { code: "CNY" }, value: "7" } },
        {
          status: "available",
          amount: { asset: { code: usd.code }, value: "5" },
        },
      ])
    },
  )

  it.each(["missing-boundary", "stale-balance", "removed-position"] as const)(
    "keeps known balance history without inventing a cumulative baseline after %s",
    (scenario) => {
      const later = first + 6 * 3_600_000
      const end = first + 7 * 3_600_000
      const initial = ledger(
        "20",
        first + (scenario === "missing-boundary" ? 11 : 1) * 60_000,
      )
      const middle =
        scenario === "removed-position"
          ? {
              ...receipt(later, []),
              endedPositionKeys: [getFinancialSeriesKey(initial)],
            }
          : receipt(later, [
              scenario === "stale-balance"
                ? {
                    ...initial,
                    amount: {
                      ...initial.amount,
                      status: OBSERVATION_STATUSES.Stale,
                      value: "20",
                      observedAt: first + 60_000,
                      reason: "balance request failed",
                    },
                  }
                : ledger("22", later),
            ])
      const result = query({
        schemaVersion: 4,
        referenceSnapshotsByAccountId: {},
        financialSnapshotsByAccountId: {
          a1: [
            receipt(first + 11 * 60_000, [initial]),
            middle,
            receipt(
              end,
              [ledger("23", end)],
              [cumulativeCharge("4", end, first)],
            ),
          ],
        },
      })

      expect(result.series[0]?.values).toEqual(["23", null, null])
      expect(result.series[0]?.observations.at(-1)?.netInflow?.status).not.toBe(
        "available",
      )
    },
  )
})
