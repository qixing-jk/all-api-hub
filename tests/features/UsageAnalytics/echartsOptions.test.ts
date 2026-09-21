import { describe, expect, it } from "vitest"

import {
  buildDailyOverviewOption,
  buildHeatmapOption,
  buildHorizontalBarOption,
  buildLatencyHistogramOption,
  buildLatencyTrendOption,
  buildPieOption,
  getAccountTotalsRows,
  getModelTotalsRows,
  getSlowModelRows,
  getSlowTokenRows,
  resolveFusedDailyByModelForTokens,
  resolveFusedDailyForTokens,
  resolveFusedHourlyForTokens,
  resolveLatencyAggregateForSelection,
  resolveLatencyDailyForTokens,
  topNWithOther,
} from "~/features/UsageAnalytics/charts/echartsOptions"
import { computeUsageHistoryExport } from "~/services/history/usageHistory/analytics"
import {
  createEmptyUsageHistoryAccountStore,
  createEmptyUsageHistoryLatencyAggregate,
} from "~/services/history/usageHistory/core"
import type { UsageHistoryStore } from "~/types/usageHistory"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

/**
 * Builds exported analytics data for a single synthetic day selection.
 */
function buildExportData(
  accounts: UsageHistoryStore["accounts"],
  dayKey = "2026-01-01",
) {
  return computeUsageHistoryExport({
    store: {
      schemaVersion: 1,
      accounts,
    },
    selection: {
      accountIds: Object.keys(accounts),
      startDay: dayKey,
      endDay: dayKey,
    },
  })
}

describe("feature UsageAnalytics echartsOptions", () => {
  it("aggregates all rows into Other when topN is negative", () => {
    expect(
      topNWithOther(
        [
          { key: "a", value: 3 },
          { key: "b", value: 2 },
        ],
        -1,
        "Other",
      ),
    ).toEqual([{ key: "Other", value: 5 }])
  })

  it("merges latencyDaily for the full selection and returns an empty model aggregate when nothing matches", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()
    const firstDay = createEmptyUsageHistoryLatencyAggregate()
    firstDay.count = 2
    firstDay.sum = 3
    firstDay.max = 2
    firstDay.slowCount = 1
    firstDay.buckets[0] = 1
    firstDay.buckets[2] = 1

    const secondDay = createEmptyUsageHistoryLatencyAggregate()
    secondDay.count = 1
    secondDay.sum = 4
    secondDay.max = 4
    secondDay.slowCount = 0
    secondDay.buckets[3] = 1

    accountStore.latencyDaily["2026-01-01"] = firstDay
    accountStore.latencyDaily["2026-01-02"] = secondDay
    const exportData = computeUsageHistoryExport({
      store: {
        schemaVersion: 1,
        accounts: { account: accountStore },
      },
      selection: {
        accountIds: ["account"],
        startDay: "2026-01-01",
        endDay: "2026-01-02",
      },
    })

    const fullSelection = resolveLatencyAggregateForSelection({
      exportData,
      tokenIds: [],
    })
    expect(fullSelection).toMatchObject({
      count: 3,
      sum: 7,
      max: 4,
      slowCount: 1,
    })
    expect(fullSelection.buckets[0]).toBe(1)
    expect(fullSelection.buckets[2]).toBe(1)
    expect(fullSelection.buckets[3]).toBe(1)

    const missingModel = resolveLatencyAggregateForSelection({
      exportData,
      tokenIds: ["missing-token"],
      modelName: "missing-model",
    })
    expect(missingModel).toEqual(createEmptyUsageHistoryLatencyAggregate())
  })

  it("ignores missing token ids across token-filtered aggregate helpers", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()
    const dayKey = "2026-01-01"

    accountStore.dailyByToken["token-1"] = {
      [dayKey]: {
        requests: 2,
        promptTokens: 1,
        completionTokens: 3,
        totalTokens: 4,
        quotaConsumed: 2,
      },
    }
    accountStore.hourlyByToken["token-1"] = {
      [dayKey]: {
        "09": {
          requests: 2,
          promptTokens: 1,
          completionTokens: 3,
          totalTokens: 4,
          quotaConsumed: 2,
        },
      },
    }
    accountStore.dailyByTokenByModel["token-1"] = {
      "gpt-4": {
        [dayKey]: {
          requests: 2,
          promptTokens: 1,
          completionTokens: 3,
          totalTokens: 4,
          quotaConsumed: 2,
        },
      },
    }

    const latency = createEmptyUsageHistoryLatencyAggregate()
    latency.count = 1
    latency.sum = 2
    latency.max = 2
    latency.slowCount = 1
    latency.buckets = [0, 1]

    accountStore.latencyDailyByToken["token-1"] = { [dayKey]: latency }
    accountStore.latencyDailyByTokenByModel["token-1"] = {
      "gpt-4": { [dayKey]: latency },
    }

    const exportData = buildExportData({ account: accountStore }, dayKey)

    expect(
      resolveFusedDailyForTokens(exportData, ["missing-token", "token-1"]),
    ).toMatchObject({
      [dayKey]: { requests: 2, totalTokens: 4, quotaConsumed: 2 },
    })
    expect(
      resolveFusedHourlyForTokens(exportData, ["missing-token", "token-1"]),
    ).toMatchObject({
      [dayKey]: { "09": { requests: 2, totalTokens: 4 } },
    })
    expect(
      resolveFusedDailyByModelForTokens(exportData, [
        "missing-token",
        "token-1",
      ]),
    ).toMatchObject({
      "gpt-4": { [dayKey]: { requests: 2, totalTokens: 4 } },
    })
    expect(
      resolveLatencyAggregateForSelection({
        exportData,
        tokenIds: ["missing-token", "token-1"],
        modelName: "gpt-4",
      }),
    ).toMatchObject({
      count: 1,
      sum: 2,
      max: 2,
      slowCount: 1,
    })
    expect(
      resolveLatencyDailyForTokens(exportData, ["missing-token", "token-1"]),
    ).toMatchObject({
      [dayKey]: { count: 1, sum: 2, max: 2, slowCount: 1 },
    })
  })

  it("pads merged latency histograms when later token buckets are longer", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()
    const dayKey = "2026-01-01"

    const shortBuckets = createEmptyUsageHistoryLatencyAggregate()
    shortBuckets.count = 1
    shortBuckets.sum = 1
    shortBuckets.max = 1
    shortBuckets.buckets = [1]

    const longBuckets = createEmptyUsageHistoryLatencyAggregate()
    longBuckets.count = 2
    longBuckets.sum = 5
    longBuckets.max = 4
    longBuckets.slowCount = 1
    longBuckets.buckets = [0, 1, 1]

    accountStore.latencyDailyByToken["token-1"] = { [dayKey]: shortBuckets }
    accountStore.latencyDailyByToken["token-2"] = { [dayKey]: longBuckets }

    const exportData = buildExportData({ account: accountStore }, dayKey)
    const merged = atIndex(
      resolveLatencyDailyForTokens(exportData, ["token-1", "token-2"]),
      dayKey,
    )

    expect(merged).toMatchObject({
      count: 3,
      sum: 6,
      max: 4,
      slowCount: 1,
    })
    expect(merged.buckets.slice(0, 3)).toEqual([1, 1, 1])
    expect(merged.buckets.slice(3).every((value) => value === 0)).toBe(true)
  })

  it("builds slow rows with token filters and a stable Other bucket", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()
    const dayKey = "2026-01-01"

    const gpt4 = createEmptyUsageHistoryLatencyAggregate()
    gpt4.count = 10
    gpt4.slowCount = 4

    const claude = createEmptyUsageHistoryLatencyAggregate()
    claude.count = 6
    claude.slowCount = 3

    const unknown = createEmptyUsageHistoryLatencyAggregate()
    unknown.count = 3
    unknown.slowCount = 1

    accountStore.tokenNamesById["1"] = "Token A"
    accountStore.latencyDailyByModel["gpt-4"] = { [dayKey]: gpt4 }
    accountStore.latencyDailyByModel["claude-3"] = { [dayKey]: claude }
    accountStore.latencyDailyByToken["1"] = { [dayKey]: gpt4 }
    accountStore.latencyDailyByToken["unknown"] = { [dayKey]: unknown }
    accountStore.latencyDailyByTokenByModel["1"] = {
      "gpt-4": { [dayKey]: gpt4 },
      "claude-3": { [dayKey]: claude },
    }

    const exportData = buildExportData({ account: accountStore }, dayKey)

    expect(
      getSlowModelRows({
        exportData,
        tokenIds: ["1"],
        topN: 1,
        otherLabel: "Other",
      }),
    ).toEqual([
      { key: "gpt-4", label: "gpt-4", slowCount: 4, totalCount: 10 },
      { key: "Other", label: "Other", slowCount: 3, totalCount: 0 },
    ])

    expect(
      getSlowTokenRows({
        exportData,
        tokenIds: [],
        topN: 1,
        otherLabel: "Other",
        unknownLabel: "Unknown token",
      }),
    ).toEqual([
      { key: "1", label: "Token A (#1)", slowCount: 4, totalCount: 10 },
      { key: "Other", label: "Other", slowCount: 1, totalCount: 0 },
    ])
  })

  it("sums token-filtered account totals, falls back to account ids, and sorts deterministically", () => {
    const first = createEmptyUsageHistoryAccountStore()
    first.dailyByToken["token-1"] = {
      "2026-01-01": {
        requests: 2,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 5,
        quotaConsumed: 1,
      },
    }

    const second = createEmptyUsageHistoryAccountStore()
    second.dailyByToken["token-1"] = {
      "2026-01-01": {
        requests: 3,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 12,
        quotaConsumed: 4,
      },
    }

    const rows = getAccountTotalsRows({
      exportData: buildExportData({ b: first, a: second }),
      tokenIds: ["token-1"],
      accountLabels: { b: "Bravo" },
    })

    expect(rows).toEqual([
      {
        accountId: "a",
        accountLabel: "a",
        totalTokens: 12,
        requests: 3,
        quotaConsumed: 4,
      },
      {
        accountId: "b",
        accountLabel: "Bravo",
        totalTokens: 5,
        requests: 2,
        quotaConsumed: 1,
      },
    ])
  })

  it("builds dense chart options with legend selection, sparse heatmap cells, and zero-safe latency averages", () => {
    const overview = buildDailyOverviewOption({
      dayKeys: ["2026-01-01", "2026-01-02"],
      daily: {
        "2026-01-01": {
          requests: 2,
          promptTokens: 5,
          completionTokens: 7,
          totalTokens: 12,
          quotaConsumed: 3,
        },
      },
      requestsAxisLabel: "Requests",
      tokensAxisLabel: "Tokens",
      requestsSeriesLabel: "Requests",
      promptTokensSeriesLabel: "Prompt",
      completionTokensSeriesLabel: "Completion",
      totalTokensSeriesLabel: "Total",
      quotaSeriesLabel: "Quota",
      legendSelected: { Total: false },
    }) as any

    expect(overview.legend.selected).toEqual({ Total: false })
    expect(overview.series[0].data).toEqual([2, 0])
    expect(overview.xAxis.axisLabel.color).toBe("var(--chart-axis)")

    const heatmap = buildHeatmapOption({
      dayKeys: ["2026-01-01", "2026-01-02"],
      modelNames: ["gpt-4", "claude-3"],
      valuesByModelAndDay: {
        "gpt-4": { "2026-01-02": 8 },
      },
      seriesLabel: "Tokens",
    }) as any

    expect(heatmap.series[0].data).toEqual([
      [0, 0, 0],
      [1, 0, 8],
      [0, 1, 0],
      [1, 1, 0],
    ])
    expect(heatmap.visualMap.max).toBe(8)

    const trend = buildLatencyTrendOption({
      dayKeys: ["2026-01-01", "2026-01-02"],
      dailyLatency: {
        "2026-01-01": {
          count: 0,
          sum: 10,
          max: 6,
          slowCount: 2,
          unknownCount: 0,
          buckets: [],
        },
      },
      avgSeriesLabel: "Average",
      maxSeriesLabel: "Max",
      slowSeriesLabel: "Slow",
      secondsAxisLabel: "Seconds",
      slowCountAxisLabel: "Slow count",
    }) as any

    expect(trend.series[0].data).toEqual([0, 0])
    expect(trend.series[1].data).toEqual([6, 0])
    expect(trend.series[2].data).toEqual([2, 0])
  })

  it("returns original fused aggregates for an empty token filter and omits Other when topN covers all rows", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()
    accountStore.daily["2026-01-01"] = {
      requests: 3,
      promptTokens: 2,
      completionTokens: 4,
      totalTokens: 6,
      quotaConsumed: 1,
    }
    accountStore.hourly["2026-01-01"] = {
      "09": {
        requests: 3,
        promptTokens: 2,
        completionTokens: 4,
        totalTokens: 6,
        quotaConsumed: 1,
      },
    }
    accountStore.dailyByModel["gpt-4"] = {
      "2026-01-01": {
        requests: 2,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 4,
        quotaConsumed: 2,
      },
    }
    accountStore.dailyByModel["claude-3"] = {
      "2026-01-01": {
        requests: 1,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 2,
        quotaConsumed: 1,
      },
    }

    const exportData = buildExportData({ account: accountStore })

    expect(resolveFusedDailyForTokens(exportData, [])).toBe(
      exportData.fused.daily,
    )
    expect(resolveFusedHourlyForTokens(exportData, [])).toBe(
      exportData.fused.hourly,
    )
    expect(resolveFusedDailyByModelForTokens(exportData, [])).toBe(
      exportData.fused.dailyByModel,
    )
    expect(resolveLatencyDailyForTokens(exportData, [])).toBe(
      exportData.fused.latencyDaily,
    )
    expect(
      getModelTotalsRows({
        exportData,
        tokenIds: [],
        topN: 99,
      }),
    ).toEqual([
      { modelName: "gpt-4", totalTokens: 4, quotaConsumed: 2 },
      { modelName: "claude-3", totalTokens: 2, quotaConsumed: 1 },
    ])
  })

  it("builds default chart variants when optional labels and formatters are omitted", () => {
    const histogram = buildLatencyHistogramOption({
      latency: createEmptyUsageHistoryLatencyAggregate(),
      seriesLabel: "Latency",
    }) as any
    expect(histogram.series[0].data.every((value: number) => value === 0)).toBe(
      true,
    )

    const bar = buildHorizontalBarOption({
      categories: ["A"],
      values: [3],
    }) as any
    expect(bar.yAxis.inverse).toBe(true)
    expect(bar.series[0].name).toBe("")

    const pie = buildPieOption({
      categories: ["A"],
      values: [3],
    }) as any
    expect(pie.series[0].name).toBe("")
    expect(pie.legend.textStyle.color).toBe("var(--chart-axis)")
  })
})
