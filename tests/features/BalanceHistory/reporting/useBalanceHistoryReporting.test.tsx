import { describe, expect, it, onTestFinished } from "vitest"

import { CURRENCIES } from "~/constants/money"
import {
  BALANCE_HISTORY_BREAKDOWN_CHART_TYPES,
  BALANCE_HISTORY_TREND_CHART_TYPES,
  BALANCE_HISTORY_TREND_SERIES_SCOPES,
} from "~/features/BalanceHistory/contracts"
import { BalanceHistoryBreakdown } from "~/features/BalanceHistory/reporting/BalanceHistoryBreakdown"
import { buildNativeHistoryEstimates } from "~/features/BalanceHistory/reporting/nativeHistoryActivity"
import { useBalanceHistoryReporting } from "~/features/BalanceHistory/reporting/useBalanceHistoryReporting"
import balanceHistoryLocale from "~/locales/en/balanceHistory.json"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_ROLES,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
  INCOME_CLASSIFICATIONS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { NEW_API_FINANCIAL_CONTRACT_VERSIONS } from "~/services/apiService/newApiFamily/financialContractVersions"
import { DAILY_BALANCE_HISTORY_METRICS } from "~/services/history/dailyBalanceHistory/constants"
import { DAILY_BALANCE_HISTORY_CAPTURE_SOURCES } from "~/types/dailyBalanceHistory"
import { testI18n } from "~~/tests/test-utils/i18n"
import { render, renderHook, screen, waitFor } from "~~/tests/test-utils/render"

type ReportingOptions = Parameters<typeof useBalanceHistoryReporting>[0]

function buildOptions(
  overrides: Partial<ReportingOptions> = {},
): ReportingOptions {
  return {
    asOf: new Date(2026, 9, 2).getTime(),
    store: {
      schemaVersion: 4,
      referenceSnapshotsByAccountId: {
        alpha: {
          "2026-10-01": {
            balanceUsd: 2,
            incomeUsd: 0,
            consumptionUsd: 0,
            capturedAt: 1,
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
          },
        },
        beta: {
          "2026-10-01": {
            balanceUsd: 3,
            incomeUsd: 0,
            consumptionUsd: 0,
            capturedAt: 1,
            source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
          },
        },
      },
    },
    effectiveAccountIds: ["alpha", "beta"],
    effectiveRange: { startDayKey: "2026-10-01", endDayKey: "2026-10-02" },
    currencyType: CURRENCIES.USD,
    exchangeRateByAccountId: new Map(),
    estimatedTodayIncomeEnabled: false,
    manualBalanceAccountIds: new Set(),
    effectiveTrendMetric: DAILY_BALANCE_HISTORY_METRICS.Balance,
    trendScope: BALANCE_HISTORY_TREND_SERIES_SCOPES.Total,
    accountDisplayLabelById: new Map([
      ["alpha", "Alpha"],
      ["beta", "Beta"],
    ]),
    trendChartType: BALANCE_HISTORY_TREND_CHART_TYPES.Line,
    currencySymbol: "$",
    formatAxisMoneyValue: String,
    formatTooltipMoneyValue: String,
    effectiveBreakdownMetric: DAILY_BALANCE_HISTORY_METRICS.Balance,
    breakdownBalanceDayKey: "2026-10-01",
    breakdownChartType: BALANCE_HISTORY_BREAKDOWN_CHART_TYPES.Pie,
    ...overrides,
  }
}

describe("useBalanceHistoryReporting", () => {
  it.each([
    ["valid", new Date(2026, 9, 2, 15).getTime(), true],
    ["out-of-range", 9_000_000_000_000_000, false],
  ])(
    "formats an archived estimate with a %s capture timestamp",
    async (_, capturedAt, showsInterval) => {
      const from = new Date(2026, 9, 1, 15).getTime()
      const source = DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh
      const options = buildOptions({
        store: {
          schemaVersion: 4,
          referenceSnapshotsByAccountId: {
            alpha: {
              "2026-10-01": {
                balanceUsd: 10,
                incomeUsd: 0,
                consumptionUsd: 0,
                capturedAt: from,
                source,
              },
              "2026-10-02": {
                balanceUsd: 12,
                incomeUsd: 0.5,
                consumptionUsd: 1,
                capturedAt,
                source,
              },
            },
          },
        },
        effectiveAccountIds: ["alpha"],
        estimatedTodayIncomeEnabled: true,
        trendScope: BALANCE_HISTORY_TREND_SERIES_SCOPES.Accounts,
        effectiveTrendMetric: DAILY_BALANCE_HISTORY_METRICS.EstimatedIncome,
        trendBalanceKey: "reference:estimatedIncome",
      })

      const { result } = renderHook(() => useBalanceHistoryReporting(options))
      await waitFor(() =>
        expect(result.current?.trendOption.series).toHaveLength(1),
      )
      const [series] = result.current.trendOption.series as Array<{
        data: Array<number | null>
        tooltip: { valueFormatter: (value: number, index: number) => string }
      }>
      expect(series?.data).toEqual([null, 3])
      const tooltip = series?.tooltip.valueFormatter(3, 1)
      if (showsInterval) {
        expect(tooltip).toMatch(/^3 \u00b7 .+2026/)
      } else {
        expect(tooltip).toBe("3")
      }
    },
  )

  it("counts a cumulative estimate once when its revised observation ends on another local date", () => {
    const boundary = new Date(2026, 9, 2).getTime()
    const hour = 3600_000
    const scope = accountBalanceScope({
      accountId: "alpha",
      baseUrl: "https://example.com",
    })
    const asset = { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD } as const
    const source = {
      adapter: "fixture",
      operation: "wallet",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Derived,
    }
    const position = balancePosition({
      id: "wallet",
      scope,
      asset,
      source,
      value: "10",
      observedAt: boundary - 3 * hour,
    })
    const observation = (value: string, start: number, end: number) => ({
      at: end,
      observedAt: end,
      value: "10",
      status: OBSERVATION_STATUSES.Known,
      netInflow: {
        status: "available" as const,
        classification: "unclassified-net-change" as const,
        amount: { asset, value },
        scope,
        source,
        window: { start, end, timeZone: "UTC" },
      },
    })
    expect(
      buildNativeHistoryEstimates(
        [
          {
            key: "alpha-wallet",
            accountId: "alpha",
            position,
            values: ["10", "10"],
            observations: [
              observation("4", boundary - 3 * hour, boundary - hour),
              observation("7", boundary - 3 * hour, boundary + hour),
              observation("3", boundary + hour, boundary + 2 * hour),
            ],
          },
        ],
        ["2026-10-01", "2026-10-02"],
      ),
    ).toMatchObject([
      { total: "10", values: [null, "10"], recordedDays: ["2026-10-02"] },
    ])
  })

  it("keeps duplicate native wallet balances readable without offering pie shares", async () => {
    const at = new Date(2026, 9, 1, 12).getTime()
    const options = buildOptions({ asOf: at, trendBalanceKey: null })
    options.store = {
      schemaVersion: 4,
      referenceSnapshotsByAccountId: {},
      financialSnapshotsByAccountId: Object.fromEntries(
        ["alpha", "beta"].map((accountId) => {
          const scope = accountBalanceScope(
            { baseUrl: "https://shared.invalid", accountId },
            { walletId: "same-upstream-user" },
          )
          return [
            accountId,
            [
              {
                source: "refresh",
                balance: accountBalanceSnapshot(
                  scope,
                  [
                    balancePosition({
                      id: "wallet",
                      scope,
                      asset: {
                        kind: ASSET_KINDS.Currency,
                        code: CURRENCIES.USD,
                      },
                      role: BALANCE_ROLES.Available,
                      value: "10",
                      observedAt: at,
                      source: {
                        adapter: "new-api",
                        operation: "/api/user/self:quota",
                        contractVersion:
                          NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd,
                        kind: EVIDENCE_KINDS.Reported,
                      },
                    }),
                  ],
                  at,
                  "complete",
                ),
              },
            ],
          ]
        }),
      ),
    }
    const { result } = renderHook(() => useBalanceHistoryReporting(options))
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current.breakdownData).toMatchObject({
      values: [10, 10],
      canUsePie: false,
    })
    expect(result.current.breakdownOption).toBeNull()
    render(
      <BalanceHistoryBreakdown
        model={{
          ...options,
          ...result.current,
          selectBreakdownMetric: () => {},
          setBreakdownChartType: () => {},
          setBreakdownBalanceDayKey: () => {},
        }}
      />,
    )
    expect(
      await screen.findByRole("button", {
        name: "balanceHistory:breakdown.chartTypes.pie",
      }),
    ).toBeDisabled()
    expect(screen.getByText("Alpha")).toBeVisible()
    expect(screen.getByText("Beta")).toBeVisible()
  })

  it.each([
    ["0", "0", false],
    ["0", "5", true],
    ["-1", "5", false],
  ] as const)(
    "offers native pie shares only for nonnegative balances with a positive amount (%s, %s)",
    async (alpha, beta, canUsePie) => {
      const at = new Date(2026, 9, 1, 12).getTime()
      const options = buildOptions({ asOf: at, trendBalanceKey: null })
      options.store = {
        schemaVersion: 4,
        referenceSnapshotsByAccountId: {},
        financialSnapshotsByAccountId: Object.fromEntries(
          ["alpha", "beta"].map((accountId, index) => {
            const scope = accountBalanceScope({
              baseUrl: `https://${accountId}.invalid`,
              accountId,
            })
            return [
              accountId,
              [
                {
                  source: "refresh",
                  balance: accountBalanceSnapshot(
                    scope,
                    [
                      balancePosition({
                        id: "wallet",
                        scope,
                        asset: {
                          kind: ASSET_KINDS.Currency,
                          code: CURRENCIES.USD,
                        },
                        role: BALANCE_ROLES.Available,
                        value: index ? beta : alpha,
                        observedAt: at,
                        source: {
                          adapter: "new-api",
                          operation: "/api/user/self:quota",
                          contractVersion:
                            NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd,
                          kind: EVIDENCE_KINDS.Reported,
                        },
                      }),
                    ],
                    at,
                    "complete",
                  ),
                },
              ],
            ]
          }),
        ),
      }
      const { result } = renderHook(() => useBalanceHistoryReporting(options))
      await waitFor(() => expect(result.current).not.toBeNull())
      expect(result.current.nativeTrendCanSum).toBe(false)
      if (canUsePie) {
        expect(result.current.breakdownOption).not.toBeNull()
      } else {
        expect(result.current.breakdownOption).toBeNull()
      }
      render(
        <BalanceHistoryBreakdown
          model={{
            ...options,
            ...result.current,
            breakdownOption: null,
            selectBreakdownMetric: () => {},
            setBreakdownChartType: () => {},
            setBreakdownBalanceDayKey: () => {},
          }}
        />,
      )
      const pie = await screen.findByRole("button", {
        name: "balanceHistory:breakdown.chartTypes.pie",
      })
      if (canUsePie) expect(pie).toBeEnabled()
      else {
        expect(pie).toBeDisabled()
        expect(screen.getByText("Alpha")).toBeVisible()
        expect(screen.getByText("Beta")).toBeVisible()
      }
    },
  )
  it.each([
    [DAILY_BALANCE_HISTORY_METRICS.Income, 4],
    [DAILY_BALANCE_HISTORY_METRICS.Outcome, 2],
  ] as const)(
    "shows collected native amounts through the existing %s selection",
    async (metric, expected) => {
      const start = new Date(2026, 9, 1).getTime()
      const at = start + 12 * 3_600_000
      const scope = accountBalanceScope({
        baseUrl: "https://alpha.invalid",
        accountId: "alpha",
      })
      const observation = {
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD } as const,
        scope,
        window: {
          start,
          end: at,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        coverage: "complete" as const,
      }
      const amount = (value: string) =>
        observeAmount(
          value,
          {
            adapter: "new-api",
            operation: "fixture:cashflow",
            contractVersion: NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd,
            kind: EVIDENCE_KINDS.Reported,
          },
          at,
        )
      const { result } = renderHook(() =>
        useBalanceHistoryReporting(
          buildOptions({
            asOf: at,
            effectiveAccountIds: ["alpha"],
            effectiveTrendMetric: metric,
            effectiveBreakdownMetric: metric,
            trendBalanceKey: null,
            breakdownBalanceKey: null,
            store: {
              schemaVersion: 4,
              referenceSnapshotsByAccountId: {},
              financialSnapshotsByAccountId: {
                alpha: [
                  {
                    source: "refresh",
                    reportedIncome: [
                      {
                        ...observation,
                        amount: amount("4"),
                        classification: INCOME_CLASSIFICATIONS.Unclassified,
                      },
                    ],
                    settledConsumption: [
                      {
                        ...observation,
                        amount: amount("2"),
                        settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
                      },
                    ],
                  },
                ],
              },
            },
          }),
        ),
      )
      await waitFor(() => expect(result.current).not.toBeNull())
      expect(result.current.trendOption.series).toContainEqual(
        expect.objectContaining({ data: [expected] }),
      )
      expect(result.current.breakdownData.entries).toEqual([
        expect.objectContaining({ name: "Alpha", value: expected }),
      ])
    },
  )
  it.each([
    ["sub2api", "/api/v1/auth/me:balance", "usd/v1"],
    [
      "new-api",
      "/api/user/self:quota",
      NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd,
    ],
  ] as const)(
    "keeps the %s native wallet separate from anonymous release history",
    async (adapter, operation, contractVersion) => {
      const at = new Date(2026, 9, 2, 10).getTime()
      const scope = accountBalanceScope({
        baseUrl: "https://alpha.invalid",
        accountId: "alpha",
      })
      const options = buildOptions({
        asOf: at,
        trendScope: BALANCE_HISTORY_TREND_SERIES_SCOPES.Accounts,
      })
      const { result } = renderHook(() =>
        useBalanceHistoryReporting({
          ...options,
          store: {
            ...options.store!,
            financialSnapshotsByAccountId: {
              alpha: [
                {
                  source: "refresh",
                  balance: accountBalanceSnapshot(
                    scope,
                    [
                      balancePosition({
                        id: "wallet",
                        scope,
                        source: {
                          kind: EVIDENCE_KINDS.Reported,
                          adapter,
                          operation,
                          contractVersion,
                        },
                        asset: {
                          kind: ASSET_KINDS.Currency,
                          code: CURRENCIES.USD,
                        },
                        value: "15",
                        observedAt: at,
                      }),
                    ],
                    at,
                    "complete",
                  ),
                },
              ],
            },
          },
        }),
      )
      await waitFor(() =>
        expect(result.current.nativeTrend).toMatchObject({
          currencyCode: "USD",
        }),
      )
      expect(result.current.nativeBreakdown).toMatchObject({
        currencyCode: "USD",
      })
      expect(result.current.trendOption.series).toEqual([
        expect.objectContaining({ name: "Alpha", data: [15] }),
      ])
    },
  )
  it("keeps anonymous archived balances out of the native total view", async () => {
    const at = new Date(2026, 9, 2, 10).getTime()
    const options = buildOptions({ asOf: at })
    options.store!.financialSnapshotsByAccountId = Object.fromEntries(
      ["alpha", "beta"].map((accountId, index) => {
        const scope = accountBalanceScope({
          baseUrl: `https://${accountId}.invalid`,
          accountId,
        })
        return [
          accountId,
          [
            {
              source: "refresh",
              balance: accountBalanceSnapshot(
                scope,
                [
                  balancePosition({
                    id: "quota",
                    scope,
                    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
                    value: index ? "7" : "15",
                    observedAt: at,
                    source: {
                      kind: EVIDENCE_KINDS.Reported,
                      adapter: "new-api",
                      operation: "/api/user/self:quota",
                      contractVersion:
                        NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd,
                    },
                  }),
                ],
                at,
                "complete",
              ),
            },
          ],
        ]
      }),
    )
    const { result } = renderHook(() => useBalanceHistoryReporting(options))
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current.trendOption.series).toEqual([
      expect.objectContaining({
        name: "balanceHistory:trend.scopes.total",
        data: [22],
      }),
    ])
  })

  it("shows an estimate from partially covered native use in the chart, distribution and account summary", async () => {
    const start = new Date(2026, 9, 2).getTime()
    const end = start + 2 * 3_600_000
    const scope = accountBalanceScope({
      baseUrl: "https://alpha.invalid",
      accountId: "alpha",
    })
    const asset = { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD } as const
    const source = {
      kind: EVIDENCE_KINDS.Reported,
      adapter: "fixture",
      operation: DAILY_BALANCE_HISTORY_METRICS.Balance,
      contractVersion: "1",
    } as const
    const balance = (value: string, at: number) =>
      accountBalanceSnapshot(
        scope,
        [
          balancePosition({
            asset,
            id: "wallet",
            role: BALANCE_ROLES.Ledger,
            observedAt: at,
            scope,
            source,
            value,
          }),
        ],
        at,
        "complete",
      )
    const options = buildOptions({
      asOf: end,
      estimatedTodayIncomeEnabled: true,
      effectiveAccountIds: ["alpha"],
      store: {
        schemaVersion: 4,
        referenceSnapshotsByAccountId: {},
        financialSnapshotsByAccountId: {
          alpha: [
            { source: "refresh", balance: balance("10", start) },
            {
              source: "refresh",
              balance: balance("8", end),
              settledConsumption: [
                {
                  scope,
                  asset,
                  amount: observeAmount(
                    "3.5",
                    { ...source, operation: "charges" },
                    end,
                  ),
                  window: {
                    start: start + 5 * 60_000,
                    end,
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  },
                  coverage: FINANCIAL_COVERAGE.Partial,
                  settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
                },
              ],
            },
          ],
        },
      },
    })
    const { result, rerender } = renderHook(
      ({ key }: { key?: string }) =>
        useBalanceHistoryReporting({
          ...options,
          trendBalanceKey: key,
          breakdownBalanceKey: key,
        }),
      { initialProps: {} },
    )
    await waitFor(() =>
      expect(result.current?.nativeMetrics.length).toBeGreaterThan(0),
    )
    const estimate = result.current.nativeMetrics.find(({ label }) =>
      label.includes(DAILY_BALANCE_HISTORY_METRICS.EstimatedIncome),
    )
    expect(estimate?.label).toContain("USD")
    const key = estimate!.key
    rerender({ key })
    expect(result.current.trendOption.series).toEqual([
      expect.objectContaining({ name: "Alpha", data: [1.5] }),
    ])
    expect(result.current.breakdownData.values).toEqual([1.5])
    expect(result.current.tableRows[0]?.nativeActivity).toContainEqual(
      expect.objectContaining({
        kind: "estimate",
        amount: "1.5 USD",
        partial: true,
      }),
    )
  })

  it("reports native credits and spending alongside legacy figures without counting cumulative refreshes twice", async () => {
    const start = new Date(2026, 9, 1).getTime()
    const end = new Date(2026, 9, 2).getTime()
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const scope = {
      ...accountBalanceScope({
        baseUrl: "https://alpha.invalid",
        accountId: "alpha",
      }),
      projects: { kind: "all" as const },
      keys: { kind: "all" as const },
      groups: { kind: "all" as const },
      models: { kind: "all" as const },
    }
    const asset = { kind: "currency" as const, code: CURRENCIES.USD }
    const source = {
      adapter: "fixture",
      operation: "spending",
      contractVersion: "1",
      kind: "reported" as const,
    }
    const spending = (value: string, until: number) => ({
      asset,
      scope,
      window: { start, end: until, timeZone },
      amount: observeAmount(value, source, until),
      settlement: "settled" as const,
      coverage: "complete" as const,
    })
    const options = buildOptions()
    const { result, rerender } = renderHook(
      ({
        trendBalanceKey,
        trendMetric,
      }: {
        trendBalanceKey?: string
        trendMetric?: ReportingOptions["effectiveTrendMetric"]
      }) =>
        useBalanceHistoryReporting({
          ...options,
          asOf: end + 60_000,
          trendBalanceKey,
          effectiveTrendMetric: trendMetric ?? options.effectiveTrendMetric,
          store: {
            ...options.store!,
            financialSnapshotsByAccountId: {
              alpha: [
                {
                  source: "refresh",
                  settledConsumption: [spending("2.3", start + 1000)],
                },
                {
                  source: "refresh",
                  settledConsumption: [spending("3.45", end)],
                  reportedIncome: [
                    {
                      ...spending("1.29", end),
                      classification: "unclassified" as const,
                    },
                  ],
                },
              ],
              beta: [
                {
                  source: "refresh",
                  settledConsumption: [
                    {
                      ...spending("5", end + 60_000),
                      window: { start: end, end: end + 60_000, timeZone },
                      coverage: FINANCIAL_COVERAGE.Partial,
                      scope: {
                        ...scope,
                        authority: "https://beta.invalid",
                        subject: { kind: "account", accountId: "beta" },
                      },
                    },
                  ],
                },
              ],
            },
          },
        }),
      { initialProps: {} },
    )
    await waitFor(() =>
      expect(result.current?.nativeActivity).toEqual([
        expect.objectContaining({
          kind: "income",
          amount: "1.29 USD",
          covered: 1,
        }),
        expect.objectContaining({
          kind: "consumption",
          amount: "8.45 USD",
          covered: 2,
        }),
        expect.objectContaining({
          kind: "change",
          amount: "-2.16 USD",
          covered: 1,
        }),
      ]),
    )
    expect(result.current.overviewTotals.outcomeTotal).toBe(0)
    expect(
      result.current.tableRows.find(({ id }) => id === "alpha")?.nativeActivity,
    ).toContainEqual(
      expect.objectContaining({ kind: "net", amount: "-2.16 USD" }),
    )
    const spendingMetric = result.current.nativeMetrics.find(
      ({ kind }) => kind === "consumption",
    )!
    rerender({ trendBalanceKey: spendingMetric.key })
    expect(result.current.nativeTrendCanSum).toBe(true)
    expect(result.current.trendOption.series).toEqual([
      expect.objectContaining({
        name: "balanceHistory:trend.scopes.total",
        data: [3.45, 5],
      }),
    ])
    const [spendingSeries] = result.current.trendOption.series as Array<{
      tooltip: { valueFormatter: (value: number, index: number) => string }
    }>
    expect(spendingSeries?.tooltip.valueFormatter(3.45, 0)).toContain(
      "3.45 USD",
    )
    expect(spendingSeries?.tooltip.valueFormatter(3.45, 0)).not.toContain(
      "financial.partial",
    )
    expect(spendingSeries?.tooltip.valueFormatter(5, 1)).toContain(
      "financial.partial",
    )

    rerender({ trendMetric: DAILY_BALANCE_HISTORY_METRICS.Net })
    expect(result.current.nativeTrend?.label).toContain(
      "balanceHistory:metrics.net",
    )
    expect(result.current.trendOption.series).toEqual([
      expect.objectContaining({ data: [-2.16] }),
    ])
  })

  it.each([false, true])(
    "sums independent wallets and keeps overlapping wallets separate (independent: %s)",
    async (independent) => {
      const options = buildOptions()
      const now = new Date(2026, 9, 2, 12).getTime()
      const financialSnapshotsByAccountId = Object.fromEntries(
        options.effectiveAccountIds.map((accountId, index) => {
          const scope = accountBalanceScope(
            {
              baseUrl: independent
                ? `https://${accountId}.invalid`
                : "https://shared.invalid",
              accountId,
            },
            { walletId: "shared" },
          )
          const position = balancePosition({
            id: DAILY_BALANCE_HISTORY_METRICS.Balance,
            role: BALANCE_ROLES.Ledger,
            scope,
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            value: index === 0 ? "0" : "3.75",
            observedAt: now,
            source: {
              adapter: "fixture",
              operation: DAILY_BALANCE_HISTORY_METRICS.Balance,
              contractVersion: "1",
              kind: EVIDENCE_KINDS.Reported,
            },
          })
          return [
            accountId,
            [
              {
                source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
                balance: accountBalanceSnapshot(
                  scope,
                  [position],
                  now,
                  "complete",
                ),
              },
            ],
          ]
        }),
      )
      const { result, rerender } = renderHook(
        ({ trendBalanceKey }: { trendBalanceKey?: string }) =>
          useBalanceHistoryReporting({
            ...options,
            store: { ...options.store!, financialSnapshotsByAccountId },
            asOf: now,
            trendBalanceKey,
          }),
        { initialProps: {} },
      )
      await waitFor(() => expect(result.current?.nativeMetrics).toHaveLength(1))
      expect(result.current.nativeMetrics[0]?.overviewEntries).toEqual(
        independent
          ? [
              expect.objectContaining({
                amount: "3.75 USD",
                covered: 2,
                total: 2,
              }),
            ]
          : [
              expect.objectContaining({
                accountLabel: "Alpha",
                amount: "0 USD",
              }),
              expect.objectContaining({
                accountLabel: "Beta",
                amount: "3.75 USD",
              }),
            ],
      )
      rerender({ trendBalanceKey: result.current.nativeMetrics[0]!.key })
      expect(result.current.nativeTrendCanSum).toBe(independent)
      expect(result.current.trendOption.series).toEqual(
        independent
          ? [
              expect.objectContaining({
                name: "balanceHistory:trend.scopes.total",
                data: [3.75],
              }),
            ]
          : [
              expect.objectContaining({ name: "Alpha", data: [0] }),
              expect.objectContaining({ name: "Beta", data: [3.75] }),
            ],
      )
    },
  )

  it("keeps anonymous archived balances on the reference axis and falls back when the archive is filtered out", async () => {
    const options = buildOptions()
    const at = new Date(2026, 9, 2, 12).getTime()
    const scope = accountBalanceScope(
      {
        baseUrl: "https://alpha.invalid",
        accountId: "alpha",
      },
      { walletId: "replacement" },
    )
    const position = balancePosition({
      id: "balance",
      role: BALANCE_ROLES.Available,
      scope,
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      value: "4",
      observedAt: at,
      source: {
        adapter: "new-api",
        operation: "/api/user/self:quota",
        contractVersion: NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd,
        kind: EVIDENCE_KINDS.Reported,
      },
    })
    const { result, rerender } = renderHook(
      ({ key, startDayKey }) =>
        useBalanceHistoryReporting({
          ...options,
          store: {
            ...options.store!,
            financialSnapshotsByAccountId: {
              alpha: [
                {
                  source: "refresh",
                  balance: accountBalanceSnapshot(
                    scope,
                    [position],
                    at,
                    "complete",
                  ),
                },
              ],
            },
          },
          effectiveAccountIds: ["alpha"],
          asOf: at,
          effectiveRange: { startDayKey, endDayKey: "2026-10-02" },
          trendBalanceKey: key,
          breakdownBalanceKey: key,
          breakdownBalanceDayKey: "2026-10-02",
        }),
      { initialProps: { key: "reference:balance", startDayKey: "2026-10-01" } },
    )
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current.trendOption.series).toEqual([
      expect.objectContaining({ data: [2, null] }),
    ])
    const nativeKey = result.current.nativeMetrics[0]!.key
    rerender({ key: nativeKey, startDayKey: "2026-10-01" })
    expect(result.current.trendOption.series).toEqual([
      expect.objectContaining({ data: [4] }),
    ])
    rerender({ key: "reference:balance", startDayKey: "2026-10-02" })
    expect(result.current.nativeTrend?.key).toBe(nativeKey)
    expect(result.current.nativeBreakdown?.key).toBe(nativeKey)
    expect(result.current.trendOption.series).toEqual([
      expect.objectContaining({ data: [4] }),
    ])
  })

  it("keeps the selected source after another wallet is filtered out", async () => {
    testI18n.addResourceBundle("en", "balanceHistory", {
      native: {
        sources: { numbered: balanceHistoryLocale.native.sources.numbered },
      },
    })
    onTestFinished(() => {
      testI18n.removeResourceBundle("en", "balanceHistory")
    })
    const scope = accountBalanceScope({
      baseUrl: "https://kimi.example",
      accountId: "alpha",
    })
    const firstDay = new Date(2026, 9, 1, 12).getTime()
    const lastDay = new Date(2026, 9, 2, 12).getTime()
    const wallet = (
      operation: string,
      value: string,
      observedAt: number,
      code: "USD" | "CNY" = "USD",
      id = operation,
    ) =>
      balancePosition({
        id,
        scope,
        asset: { kind: ASSET_KINDS.Currency, code },
        value,
        observedAt,
        source: {
          adapter: "kimi",
          operation,
          contractVersion: "2",
          kind: EVIDENCE_KINDS.Reported,
        },
      })
    const options = buildOptions({
      asOf: lastDay,
      effectiveAccountIds: ["alpha"],
      store: {
        schemaVersion: 4,
        referenceSnapshotsByAccountId: {},
        financialSnapshotsByAccountId: {
          alpha: [
            {
              source: "refresh",
              balance: accountBalanceSnapshot(
                scope,
                [wallet("console", "4", firstDay)],
                firstDay,
                "complete",
              ),
            },
            {
              source: "refresh",
              balance: accountBalanceSnapshot(
                scope,
                [
                  wallet("extra", "13", lastDay, "CNY"),
                  wallet("inference", "7", lastDay),
                  wallet("other-console", "3", lastDay, "USD", "fallback-a"),
                  wallet("other-console", "5", lastDay, "USD", "fallback-b"),
                ],
                lastDay,
                "complete",
              ),
            },
          ],
        },
      },
    })
    const { result, rerender } = renderHook(
      ({ key, startDayKey }: { key?: string; startDayKey: string }) =>
        useBalanceHistoryReporting({
          ...options,
          effectiveRange: { startDayKey, endDayKey: "2026-10-02" },
          trendBalanceKey: key,
        }),
      {
        initialProps: {
          key: undefined as string | undefined,
          startDayKey: "2026-10-01",
        },
      },
    )

    await waitFor(() => expect(result.current?.nativeMetrics).toHaveLength(5))
    const sources = result.current.nativeMetrics.filter(
      ({ currencyCode }) => currencyCode === "USD",
    )
    expect(sources.map(({ label }) => label)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("balanceHistory:native.sources.console"),
        expect.stringContaining("balanceHistory:native.sources.inference"),
        expect.stringContaining("Source 1"),
        expect.stringContaining("Source 2"),
      ]),
    )
    const selected = sources.find(({ label }) =>
      label.includes("balanceHistory:native.sources.inference"),
    )!
    rerender({ key: selected.key, startDayKey: "2026-10-02" })
    expect(result.current.nativeTrend?.currencyCode).toBe("USD")
    expect(result.current.trendOption.series).toEqual([
      expect.objectContaining({ data: [7] }),
    ])
  })

  it("uses the raw quota unit for every observation when one scaled value exceeds precision", async () => {
    const options = buildOptions({
      trendScope: BALANCE_HISTORY_TREND_SERIES_SCOPES.Accounts,
    })
    const scope = accountBalanceScope({
      baseUrl: "https://alpha.invalid",
      accountId: "alpha",
    })
    const tiny = "0." + "0".repeat(253) + "1"
    const snapshot = (value: string, at: number) => ({
      source: "refresh" as const,
      balance: accountBalanceSnapshot(
        scope,
        [
          balancePosition({
            id: "credits",
            scope,
            role: BALANCE_ROLES.Available,
            asset: {
              kind: "quota",
              id: "raw-credits",
              label: "credits",
              displayLabel: "decacredits",
              displayScale: 10,
            },
            value,
            observedAt: at,
            source: {
              adapter: "fixture",
              operation: "balance",
              kind: EVIDENCE_KINDS.Reported,
              contractVersion: "1",
            },
          }),
        ],
        at,
        "complete",
      ),
    })
    const { result } = renderHook(() =>
      useBalanceHistoryReporting({
        ...options,
        store: {
          schemaVersion: 4,
          referenceSnapshotsByAccountId: {},
          financialSnapshotsByAccountId: {
            alpha: [
              snapshot("20", new Date(2026, 9, 1, 12).getTime()),
              snapshot(tiny, new Date(2026, 9, 2, 12).getTime()),
            ],
          },
        },
        effectiveAccountIds: ["alpha"],
        asOf: new Date(2026, 9, 2, 14).getTime(),
      }),
    )
    await waitFor(() =>
      expect(result.current?.nativeTrend?.unit).toBe("credits"),
    )
    expect(result.current.trendOption.series).toMatchObject([
      { data: [20, Number(tiny)] },
    ])
  })

  it("preserves reference dates and shows scaled native allowances on their own axis", async () => {
    const options = buildOptions()
    const now = new Date(2026, 9, 2, 12).getTime()
    const scope = accountBalanceScope({
      baseUrl: "https://alpha.invalid",
      accountId: "alpha",
    })
    const position = balancePosition({
      id: "tokens",
      role: BALANCE_ROLES.Allowance,
      scope,
      asset: {
        kind: ASSET_KINDS.Quota,
        id: "alpha-tokens",
        label: "Token",
        displayScale: 1_000_000,
        displayLabel: "M Token",
      },
      value: "2500000",
      observedAt: now,
      source: {
        adapter: "fixture",
        operation: DAILY_BALANCE_HISTORY_METRICS.Balance,
        contractVersion: "1",
        kind: EVIDENCE_KINDS.Reported,
      },
    })
    const store = {
      ...options.store!,
      financialSnapshotsByAccountId: {
        alpha: [
          {
            source: "refresh" as const,
            balance: accountBalanceSnapshot(scope, [position], now, "complete"),
          },
        ],
      },
    }
    const { result, rerender } = renderHook(
      ({ key }: { key?: string }) =>
        useBalanceHistoryReporting({
          ...options,
          store,
          asOf: now,
          trendBalanceKey: key,
          breakdownBalanceKey: key,
          breakdownBalanceDayKey: key
            ? "2026-10-02"
            : options.breakdownBalanceDayKey,
          trendChartType: BALANCE_HISTORY_TREND_CHART_TYPES.Bar,
        }),
      { initialProps: {} },
    )
    await waitFor(() =>
      expect(result.current?.trendOption.series).toEqual([
        expect.objectContaining({ data: [5, null], type: "bar" }),
      ]),
    )
    expect(result.current.nativeMetrics[0]?.overviewEntries).toEqual([
      expect.objectContaining({ amount: "2.5 M Token", covered: 1, total: 1 }),
    ])
    rerender({ key: result.current.nativeMetrics[0]!.key })
    await waitFor(() =>
      expect(result.current.trendOption.series).toEqual([
        expect.objectContaining({
          name: "Alpha",
          data: [2.5],
          type: "bar",
        }),
      ]),
    )
    expect(result.current.trendOption.yAxis).toEqual(
      expect.objectContaining({ name: "M Token", scale: false }),
    )
    expect(result.current.breakdownData).toMatchObject({
      entries: [{ name: "Alpha", value: 2.5, formattedValue: "2.5 M Token" }],
    })

    const later = new Date(2026, 9, 4, 12).getTime()
    const laterPosition = balancePosition({
      ...position,
      value: "3250000",
      observedAt: later,
      source: position.amount.source,
    })
    const widerRange = renderHook(() =>
      useBalanceHistoryReporting({
        ...options,
        trendBalanceKey: result.current.nativeMetrics[0]!.key,
        store: {
          ...store,
          financialSnapshotsByAccountId: {
            alpha: [
              ...store.financialSnapshotsByAccountId.alpha,
              {
                source: "refresh",
                balance: accountBalanceSnapshot(
                  scope,
                  [laterPosition],
                  later,
                  "complete",
                ),
              },
            ],
          },
        },
        asOf: new Date(2026, 9, 5, 12).getTime(),
        effectiveRange: {
          startDayKey: "2026-10-01",
          endDayKey: "2026-10-05",
        },
      }),
    )
    await waitFor(() =>
      expect(
        widerRange.result.current?.nativeMetrics[0]?.overviewEntries,
      ).toEqual([
        expect.objectContaining({ amount: undefined, covered: 0, total: 1 }),
      ]),
    )
    const chart = widerRange.result.current.trendOption
    expect(chart.xAxis).toMatchObject({
      data: ["2026-10-02", "2026-10-03", "2026-10-04"],
    })
    expect(chart.yAxis).toMatchObject({ scale: true })
    const [line] = chart.series as Array<{
      data: Array<number | null>
      tooltip: { valueFormatter(value: number, index: number): string }
    }>
    expect(line?.data).toEqual([2.5, null, 3.25])
    expect(line?.tooltip.valueFormatter(3.25, 2)).toBe("3.25 M Token")
  })

  it("aggregates total balances and preserves days without snapshots as gaps", async () => {
    const { result } = renderHook(() =>
      useBalanceHistoryReporting(buildOptions()),
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current.totalTrendValues).toEqual([5, null])
    expect(result.current.trendOption.series).toEqual([
      expect.objectContaining({
        name: "balanceHistory:trend.scopes.total",
        data: [5, null],
      }),
    ])
    expect(result.current.breakdownData).toEqual(
      expect.objectContaining({
        categories: ["Beta", "Alpha"],
        values: [3, 2],
      }),
    )
  })

  it("omits total chart series when no selected account has history", async () => {
    const { result } = renderHook(() =>
      useBalanceHistoryReporting(buildOptions({ store: null })),
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current.totalTrendValues).toEqual([null, null])
    expect(result.current.trendOption.series).toEqual([])
    expect(result.current.breakdownData.values).toEqual([])
  })

  it("leaves balance breakdown empty when its reference day is outside the report range", async () => {
    const { result, rerender } = renderHook(
      ({ day }) =>
        useBalanceHistoryReporting(
          buildOptions({ breakdownBalanceDayKey: day }),
        ),
      { initialProps: { day: "2026-10-01" } },
    )
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current.breakdownData.values).toEqual([3, 2])

    rerender({ day: "2026-09-01" })

    expect(result.current.breakdownData.values).toEqual([])
  })
})
