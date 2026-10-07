import { describe, expect, it } from "vitest"

import { QUOTA_PER_USD } from "~/constants/money"
import { useBalanceHistoryReporting } from "~/features/BalanceHistory/hooks/useBalanceHistoryReporting"
import { renderHook, waitFor } from "~~/tests/test-utils/render"

type ReportingOptions = Parameters<typeof useBalanceHistoryReporting>[0]

function buildOptions(
  overrides: Partial<ReportingOptions> = {},
): ReportingOptions {
  return {
    store: {
      schemaVersion: 1,
      snapshotsByAccountId: {
        alpha: {
          "2026-10-01": {
            quota: 2 * QUOTA_PER_USD,
            today_income: 0,
            today_quota_consumption: 0,
            capturedAt: 1,
            source: "refresh",
          },
        },
        beta: {
          "2026-10-01": {
            quota: 3 * QUOTA_PER_USD,
            today_income: 0,
            today_quota_consumption: 0,
            capturedAt: 1,
            source: "refresh",
          },
        },
      },
    },
    effectiveAccountIds: ["alpha", "beta"],
    effectiveRange: { startDayKey: "2026-10-01", endDayKey: "2026-10-02" },
    currencyType: "USD",
    exchangeRateByAccountId: new Map(),
    estimatedTodayIncomeEnabled: false,
    manualBalanceAccountIds: new Set(),
    effectiveTrendMetric: "balance",
    trendScope: "total",
    accountDisplayLabelById: new Map([
      ["alpha", "Alpha"],
      ["beta", "Beta"],
    ]),
    trendChartType: "line",
    currencySymbol: "$",
    formatAxisMoneyValue: String,
    formatTooltipMoneyValue: String,
    effectiveBreakdownMetric: "balance",
    breakdownBalanceDayKey: "2026-10-01",
    breakdownChartType: "pie",
    ...overrides,
  }
}

describe("useBalanceHistoryReporting", () => {
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
