import * as echarts from "echarts"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { useUsageAnalyticsCharts } from "~/features/UsageAnalytics/charts/useUsageAnalyticsCharts"
import { computeUsageHistoryExport } from "~/services/history/usageHistory/analytics"
import { createEmptyUsageHistoryAccountStore } from "~/services/history/usageHistory/core"
import type { UsageHistoryAggregate } from "~/types/usageHistory"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"
import { buildFinancialPeriodFact } from "~~/tests/test-utils/accountTodayStats"
import { renderHook, waitFor } from "~~/tests/test-utils/render"

function costFilters(costs: string[], referenceOnly = false) {
  const day = getDayKeyFromUnixSeconds(Date.now() / 1000)
  const account = createEmptyUsageHistoryAccountStore()
  const aggregate = (value: string): UsageHistoryAggregate => ({
    requests: 1,
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    ...(referenceOnly
      ? { referenceCostUsd: Number(value) }
      : {
          consumption: [
            buildFinancialPeriodFact({ accountId: "alpha", value }),
          ],
        }),
  })
  account.dailyByModel = Object.fromEntries(
    costs.map((value, index) => [
      ["first", "second"][index] ?? `model-${index}`,
      { [day]: aggregate(value) },
    ]),
  )
  account.daily = {
    [day]: {
      ...aggregate("0"),
      requests: 2,
      totalTokens: 30,
      ...(referenceOnly
        ? {
            referenceCostUsd: costs.reduce(
              (sum, value) => sum + Number(value),
              0,
            ),
          }
        : {
            consumption: costs.map((value) =>
              buildFinancialPeriodFact({ accountId: "alpha", value }),
            ),
          }),
    },
  }
  const exportPreview = computeUsageHistoryExport({
    store: { schemaVersion: 3, accounts: { alpha: account } },
    selection: { accountIds: ["alpha"], startDay: day, endDay: day },
  })
  return {
    exportPreview,
    selectedTokenIds: [],
    accountLabels: {},
    dayKeysInRange: [day],
    minDay: day,
    maxDay: day,
    startDay: day,
    endDay: day,
    setStartDay: () => {},
    setEndDay: () => {},
  }
}

describe("Usage Analytics model cost charts", () => {
  beforeAll(() => {
    // SVG rendering still asks Canvas for font measurement in jsdom.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 8 }),
    } as unknown as CanvasRenderingContext2D)
  })
  afterAll(() => vi.restoreAllMocks())
  it.each([false, true])(
    "preserves a signed tail and determines shares from all native/reference model costs (reference: %s)",
    async (referenceOnly) => {
      const { result } = renderHook(() =>
        useUsageAnalyticsCharts({
          filters: costFilters(
            [...Array<string>(12).fill("1"), "-1"],
            referenceOnly,
          ),
        }),
      )
      await waitFor(() => expect(result.current).not.toBeNull())
      const selected = referenceOnly
        ? result.current.referenceModelCostChart!
        : result.current.modelCostCharts[0]!
      expect(selected.hasShares).toBe(false)
      expect(selected.option).toMatchObject({
        series: [{ type: "bar", data: expect.arrayContaining([-1]) }],
        yAxis: {
          data: expect.arrayContaining(["usageAnalytics:charts.other"]),
        },
      })
      const series = selected.option.series as { data: number[] }[]
      expect(series[0]!.data.reduce((sum, value) => sum + value, 0)).toBe(11)
    },
  )
  it.each([false, true])(
    "retains a zero tail while keeping a cancelling refund ineligible for pie (reference: %s)",
    async (referenceOnly) => {
      const { result } = renderHook(() =>
        useUsageAnalyticsCharts({
          filters: costFilters(
            [...Array<string>(12).fill("1"), "0.5", "-0.5"],
            referenceOnly,
          ),
        }),
      )
      await waitFor(() => expect(result.current).not.toBeNull())
      const selected = referenceOnly
        ? result.current.referenceModelCostChart!
        : result.current.modelCostCharts[0]!
      expect(selected.hasShares).toBe(false)
      expect(selected.option).toMatchObject({
        series: [{ type: "bar", data: expect.arrayContaining([0]) }],
        yAxis: {
          data: expect.arrayContaining(["usageAnalytics:charts.other"]),
        },
      })
      const series = selected.option.series as { data: number[] }[]
      expect(series[0]!.data).toHaveLength(13)
      expect(series[0]!.data.reduce((sum, value) => sum + value, 0)).toBe(12)
    },
  )
  it.each([false, true])(
    "keeps zero native/reference model costs visible without nonzero pie shares (reference: %s)",
    async (referenceOnly) => {
      const { result } = renderHook(() =>
        useUsageAnalyticsCharts({
          filters: costFilters(["0", "0"], referenceOnly),
        }),
      )
      await waitFor(() => expect(result.current).not.toBeNull())
      const selected = referenceOnly
        ? result.current.referenceModelCostChart!
        : result.current.modelCostCharts[0]!
      const chart = echarts.init(null, null, {
        renderer: "svg",
        ssr: true,
        width: 400,
        height: 300,
      })
      try {
        chart.setOption(selected.option)
        expect(chart.getOption()).toMatchObject({
          series: [{ type: "bar", data: [0, 0], label: { show: true } }],
        })
        expect(chart.renderToSVGString()).toContain("first")
        expect(chart.renderToSVGString()).toContain("second")
      } finally {
        chart.dispose()
      }
      expect(selected.hasShares).toBe(false)
      if (!referenceOnly)
        expect(result.current.recordedCosts[0]?.amount.value).toBe("0")
    },
  )
  it.each([false, true])(
    "allows pie shares for positive native/reference costs (reference: %s)",
    async (referenceOnly) => {
      const { result } = renderHook(() =>
        useUsageAnalyticsCharts({
          filters: costFilters(["1", "2"], referenceOnly),
        }),
      )
      await waitFor(() => expect(result.current).not.toBeNull())
      const selected = referenceOnly
        ? result.current.referenceModelCostChart!
        : result.current.modelCostCharts[0]!
      expect(selected.hasShares).toBe(true)
      expect(selected.option).toMatchObject({
        series: [
          {
            type: "pie",
            data: expect.arrayContaining([
              expect.objectContaining({ value: 1 }),
              expect.objectContaining({ value: 2 }),
            ]),
          },
        ],
      })
    },
  )
  it.each([false, true])(
    "keeps signed native/reference costs in a bar chart (reference: %s)",
    async (referenceOnly) => {
      const { result } = renderHook(() =>
        useUsageAnalyticsCharts({
          filters: costFilters(["-1", "2"], referenceOnly),
        }),
      )
      await waitFor(() => expect(result.current).not.toBeNull())
      const selected = referenceOnly
        ? result.current.referenceModelCostChart!
        : result.current.modelCostCharts[0]!
      expect(selected.option).toMatchObject({
        series: [{ type: "bar", data: expect.arrayContaining([-1, 2]) }],
      })
    },
  )
})
