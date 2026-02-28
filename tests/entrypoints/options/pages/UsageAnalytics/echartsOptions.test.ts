import { describe, expect, it } from "vitest"

import {
  buildDailyOverviewOption,
  buildHeatmapOption,
  buildHorizontalBarOption,
  buildLatencyHistogramOption,
  buildLatencyTrendOption,
  buildLineTrendOption,
  buildPieOption,
  getAccountTotalsRows,
  getLatencyBucketLabels,
  getModelTotalsRows,
  getSlowModelRows,
  getSlowTokenRows,
  getTokenTotalsRows,
  resolveFusedDailyByModelForTokens,
  resolveFusedDailyForTokens,
  resolveFusedHourlyForTokens,
  resolveLatencyAggregateForSelection,
  resolveLatencyDailyForTokens,
  topNWithOther,
} from "~/entrypoints/options/pages/UsageAnalytics/echartsOptions"
import { computeUsageHistoryExport } from "~/services/history/usageHistory/analytics"
import {
  createEmptyUsageHistoryAccountStore,
  createEmptyUsageHistoryLatencyAggregate,
} from "~/services/history/usageHistory/core"
import type { UsageHistoryStore } from "~/types/usageHistory"

describe("UsageAnalytics echartsOptions", () => {
  it("topNWithOther is stable and aggregates the remainder", () => {
    const out = topNWithOther(
      [
        { key: "b", value: 2 },
        { key: "a", value: 2 },
        { key: "c", value: 1 },
      ],
      2,
      "Other",
    )

    expect(out).toEqual([
      { key: "a", value: 2 },
      { key: "b", value: 2 },
      { key: "Other", value: 1 },
    ])
  })

  it("resolves token-filtered fused daily aggregates", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()
    accountStore.daily["2026-01-01"] = {
      requests: 2,
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      quotaConsumed: 3,
    }

    accountStore.dailyByToken["1"] = {
      "2026-01-01": {
        requests: 1,
        promptTokens: 10,
        completionTokens: 0,
        totalTokens: 10,
        quotaConsumed: 2,
      },
    }

    accountStore.dailyByToken["2"] = {
      "2026-01-01": {
        requests: 1,
        promptTokens: 0,
        completionTokens: 5,
        totalTokens: 5,
        quotaConsumed: 1,
      },
    }

    accountStore.tokenNamesById["1"] = "Token A"
    accountStore.tokenNamesById["2"] = "Token B"

    const store: UsageHistoryStore = {
      schemaVersion: 1,
      accounts: { a1: accountStore },
    }

    const exportData = computeUsageHistoryExport({
      store,
      selection: {
        accountIds: ["a1"],
        startDay: "2026-01-01",
        endDay: "2026-01-01",
      },
    })

    expect(
      resolveFusedDailyForTokens(exportData, [])["2026-01-01"],
    ).toMatchObject({ requests: 2, totalTokens: 15 })
    expect(
      resolveFusedDailyForTokens(exportData, ["1"])["2026-01-01"],
    ).toMatchObject({ requests: 1, totalTokens: 10 })
    expect(
      resolveFusedDailyForTokens(exportData, ["1", "2"])["2026-01-01"],
    ).toMatchObject({ requests: 2, totalTokens: 15 })
  })

  it("buildDailyOverviewOption aligns dense dayKeys and fills missing days", () => {
    const option = buildDailyOverviewOption({
      dayKeys: ["2026-01-01", "2026-01-02"],
      daily: {
        "2026-01-01": {
          requests: 1,
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
          quotaConsumed: 1,
        },
      },
      requestsAxisLabel: "Requests",
      tokensAxisLabel: "Tokens",
      requestsSeriesLabel: "Requests",
      promptTokensSeriesLabel: "Prompt",
      completionTokensSeriesLabel: "Completion",
      totalTokensSeriesLabel: "Total",
      quotaSeriesLabel: "Quota",
    }) as any

    const requestsSeries = option.series.find((s: any) => s.name === "Requests")
    expect(requestsSeries.data).toEqual([1, 0])
  })

  it("buildPieOption creates a pie series for distribution views", () => {
    const option = buildPieOption({
      categories: ["A", "B"],
      values: [1, 2],
      valueLabel: "Value",
      isDark: true,
    }) as any

    expect(option.series?.[0]?.type).toBe("pie")
    expect(option.series?.[0]?.data).toEqual([
      { name: "A", value: 1 },
      { name: "B", value: 2 },
    ])
  })

  it("resolveLatencyAggregateForSelection supports token + model focus", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()
    const dayKey = "2026-01-01"

    const latencyA = createEmptyUsageHistoryLatencyAggregate()
    latencyA.count = 2
    latencyA.sum = 3
    latencyA.max = 2
    latencyA.slowCount = 1

    const latencyB = createEmptyUsageHistoryLatencyAggregate()
    latencyB.count = 1
    latencyB.sum = 1
    latencyB.max = 1
    latencyB.slowCount = 0

    accountStore.latencyDailyByTokenByModel["1"] = {
      "gpt-4": { [dayKey]: latencyA },
    }
    accountStore.latencyDailyByTokenByModel["2"] = {
      "gpt-4": { [dayKey]: latencyB },
    }

    const store: UsageHistoryStore = {
      schemaVersion: 1,
      accounts: { a1: accountStore },
    }

    const exportData = computeUsageHistoryExport({
      store,
      selection: { accountIds: ["a1"], startDay: dayKey, endDay: dayKey },
    })

    const merged = resolveLatencyAggregateForSelection({
      exportData,
      tokenIds: ["1", "2"],
      modelName: "gpt-4",
    })

    expect(merged.count).toBe(3)
    expect(merged.slowCount).toBe(1)
    expect(merged.max).toBe(2)
  })

  it("buildLatencyTrendOption aligns dense dayKeys and fills missing days", () => {
    const dailyLatency = {
      "2026-01-01": {
        count: 2,
        sum: 4,
        max: 3,
        slowCount: 1,
        unknownCount: 0,
        buckets: [0],
      },
    }

    const option = buildLatencyTrendOption({
      dayKeys: ["2026-01-01", "2026-01-02"],
      dailyLatency,
      avgSeriesLabel: "Avg",
      maxSeriesLabel: "Max",
      slowSeriesLabel: "Slow",
      secondsAxisLabel: "Seconds",
      slowCountAxisLabel: "Slow count",
    }) as any

    const slowSeries = option.series.find((s: any) => s.name === "Slow")
    expect(slowSeries.data).toEqual([1, 0])
  })

  it("resolveFusedHourlyForTokens merges per-hour aggregates across selected tokens", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()

    accountStore.hourlyByToken["1"] = {
      "2026-01-01": {
        "00": {
          requests: 1,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          quotaConsumed: 0,
        },
      },
    }
    accountStore.hourlyByToken["2"] = {
      "2026-01-01": {
        "00": {
          requests: 2,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          quotaConsumed: 0,
        },
        "01": {
          requests: 3,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          quotaConsumed: 0,
        },
      },
    }

    const store: UsageHistoryStore = {
      schemaVersion: 1,
      accounts: { a1: accountStore },
    }
    const exportData = computeUsageHistoryExport({
      store,
      selection: {
        accountIds: ["a1"],
        startDay: "2026-01-01",
        endDay: "2026-01-01",
      },
    })

    const merged = resolveFusedHourlyForTokens(exportData, ["1", "2"])
    expect(merged["2026-01-01"]["00"]).toMatchObject({ requests: 3 })
    expect(merged["2026-01-01"]["01"]).toMatchObject({ requests: 3 })
  })

  it("resolveFusedDailyByModelForTokens merges per-token model daily aggregates", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()
    accountStore.dailyByTokenByModel["1"] = {
      "gpt-4": {
        "2026-01-01": {
          requests: 1,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 10,
          quotaConsumed: 1,
        },
      },
    }
    accountStore.dailyByTokenByModel["2"] = {
      "gpt-4": {
        "2026-01-01": {
          requests: 1,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 5,
          quotaConsumed: 2,
        },
      },
      "gpt-3.5-turbo": {
        "2026-01-01": {
          requests: 1,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 1,
          quotaConsumed: 1,
        },
      },
    }

    const store: UsageHistoryStore = {
      schemaVersion: 1,
      accounts: { a1: accountStore },
    }
    const exportData = computeUsageHistoryExport({
      store,
      selection: {
        accountIds: ["a1"],
        startDay: "2026-01-01",
        endDay: "2026-01-01",
      },
    })

    const merged = resolveFusedDailyByModelForTokens(exportData, ["1", "2"])
    expect(merged["gpt-4"]["2026-01-01"]).toMatchObject({
      totalTokens: 15,
      quotaConsumed: 3,
    })
    expect(merged["gpt-3.5-turbo"]["2026-01-01"]).toMatchObject({
      totalTokens: 1,
    })
  })

  it("resolveLatencyDailyForTokens merges daily latency and pads histogram buckets", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()
    const dayKey = "2026-01-01"

    const a = createEmptyUsageHistoryLatencyAggregate()
    a.count = 1
    a.sum = 1
    a.max = 1
    a.slowCount = 0
    a.buckets = [1, 0, 0]

    const b = createEmptyUsageHistoryLatencyAggregate()
    b.count = 1
    b.sum = 2
    b.max = 2
    b.slowCount = 1
    b.buckets = [0, 1]

    accountStore.latencyDailyByToken["1"] = { [dayKey]: a }
    accountStore.latencyDailyByToken["2"] = { [dayKey]: b }

    const store: UsageHistoryStore = {
      schemaVersion: 1,
      accounts: { a1: accountStore },
    }
    const exportData = computeUsageHistoryExport({
      store,
      selection: { accountIds: ["a1"], startDay: dayKey, endDay: dayKey },
    })

    const merged = resolveLatencyDailyForTokens(exportData, ["1", "2"])[dayKey]
    expect(merged).toMatchObject({ count: 2, sum: 3, max: 2, slowCount: 1 })
    expect(merged.buckets[0]).toBe(1)
    expect(merged.buckets[1]).toBe(1)
    expect(merged.buckets.slice(2).every((value) => value === 0)).toBe(true)
  })

  it("getTokenTotalsRows formats known, unknown, and unlabeled tokens", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()
    const dayKey = "2026-01-01"

    accountStore.tokenNamesById["1"] = "Token A"
    accountStore.dailyByToken["1"] = {
      [dayKey]: {
        requests: 1,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 10,
        quotaConsumed: 0,
      },
    }
    accountStore.dailyByToken["2"] = {
      [dayKey]: {
        requests: 1,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 5,
        quotaConsumed: 0,
      },
    }
    accountStore.dailyByToken["unknown"] = {
      [dayKey]: {
        requests: 1,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 1,
        quotaConsumed: 0,
      },
    }

    const store: UsageHistoryStore = {
      schemaVersion: 1,
      accounts: { a1: accountStore },
    }
    const exportData = computeUsageHistoryExport({
      store,
      selection: { accountIds: ["a1"], startDay: dayKey, endDay: dayKey },
    })

    const rows = getTokenTotalsRows({
      exportData,
      topN: 99,
      unknownLabel: "Unknown",
    })
    const byId = Object.fromEntries(
      rows.map((row) => [row.tokenId, row] as const),
    )

    expect(byId["1"].tokenLabel).toBe("Token A (#1)")
    expect(byId["2"].tokenLabel).toBe("#2")
    expect(byId["unknown"].tokenLabel).toBe("Unknown")
  })

  it("getTokenTotalsRows does not prefix the Other bucket with #", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()
    const dayKey = "2026-01-01"

    accountStore.dailyByToken["1"] = {
      [dayKey]: {
        requests: 1,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 100,
        quotaConsumed: 0,
      },
    }
    accountStore.dailyByToken["2"] = {
      [dayKey]: {
        requests: 1,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 5,
        quotaConsumed: 0,
      },
    }

    const store: UsageHistoryStore = {
      schemaVersion: 1,
      accounts: { a1: accountStore },
    }
    const exportData = computeUsageHistoryExport({
      store,
      selection: { accountIds: ["a1"], startDay: dayKey, endDay: dayKey },
    })

    const rows = getTokenTotalsRows({
      exportData,
      topN: 1,
      otherLabel: "Other",
    })

    const other = rows.find((row) => row.tokenId === "Other")
    expect(other?.tokenLabel).toBe("Other")
  })

  it("getModelTotalsRows sorts deterministically and aggregates remainder into Other", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()
    const dayKey = "2026-01-01"

    accountStore.dailyByModel["b-model"] = {
      [dayKey]: {
        requests: 1,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 10,
        quotaConsumed: 3,
      },
    }
    accountStore.dailyByModel["a-model"] = {
      [dayKey]: {
        requests: 1,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 10,
        quotaConsumed: 1,
      },
    }
    accountStore.dailyByModel["c-model"] = {
      [dayKey]: {
        requests: 1,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 1,
        quotaConsumed: 2,
      },
    }

    const store: UsageHistoryStore = {
      schemaVersion: 1,
      accounts: { a1: accountStore },
    }
    const exportData = computeUsageHistoryExport({
      store,
      selection: { accountIds: ["a1"], startDay: dayKey, endDay: dayKey },
    })

    const rows = getModelTotalsRows({
      exportData,
      tokenIds: [],
      topN: 1,
      otherLabel: "Other",
    })
    expect(rows[0].modelName).toBe("a-model")
    expect(rows[1]).toMatchObject({
      modelName: "Other",
      totalTokens: 11,
      quotaConsumed: 5,
    })
  })

  it("getSlowModelRows and getSlowTokenRows respect token filters", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()
    const dayKey = "2026-01-01"

    const m1 = createEmptyUsageHistoryLatencyAggregate()
    m1.count = 10
    m1.slowCount = 2
    const m2 = createEmptyUsageHistoryLatencyAggregate()
    m2.count = 5
    m2.slowCount = 1

    accountStore.latencyDailyByModel["gpt-4"] = { [dayKey]: m1 }
    accountStore.latencyDailyByModel["gpt-3.5-turbo"] = { [dayKey]: m2 }

    accountStore.tokenNamesById["1"] = "Token A"
    accountStore.latencyDailyByToken["1"] = { [dayKey]: m1 }
    accountStore.latencyDailyByTokenByModel["1"] = {
      "gpt-4": { [dayKey]: m1 },
    }

    const store: UsageHistoryStore = {
      schemaVersion: 1,
      accounts: { a1: accountStore },
    }
    const exportData = computeUsageHistoryExport({
      store,
      selection: { accountIds: ["a1"], startDay: dayKey, endDay: dayKey },
    })

    const slowModelsAll = getSlowModelRows({
      exportData,
      tokenIds: [],
      topN: 10,
    })
    expect(slowModelsAll.map((r) => r.key).sort()).toEqual([
      "gpt-3.5-turbo",
      "gpt-4",
    ])

    const slowModelsToken = getSlowModelRows({
      exportData,
      tokenIds: ["1"],
      topN: 10,
    })
    expect(slowModelsToken.map((r) => r.key)).toEqual(["gpt-4"])

    const slowTokensToken = getSlowTokenRows({
      exportData,
      tokenIds: ["1"],
      topN: 10,
      unknownLabel: "Unknown token",
    })
    expect(slowTokensToken[0].label).toBe("Token A (#1)")
  })

  it("getAccountTotalsRows sums totals per account and sorts by totalTokens", () => {
    const a1 = createEmptyUsageHistoryAccountStore()
    a1.daily["2026-01-01"] = {
      requests: 1,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 10,
      quotaConsumed: 1,
    }

    const a2 = createEmptyUsageHistoryAccountStore()
    a2.daily["2026-01-01"] = {
      requests: 2,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 20,
      quotaConsumed: 2,
    }

    const store: UsageHistoryStore = { schemaVersion: 1, accounts: { a1, a2 } }
    const exportData = computeUsageHistoryExport({
      store,
      selection: {
        accountIds: ["a1", "a2"],
        startDay: "2026-01-01",
        endDay: "2026-01-01",
      },
    })

    const rows = getAccountTotalsRows({
      exportData,
      tokenIds: [],
      accountLabels: { a1: "Account 1", a2: "Account 2" },
    })

    expect(rows.map((r) => r.accountId)).toEqual(["a2", "a1"])
    expect(rows[0]).toMatchObject({
      totalTokens: 20,
      requests: 2,
      quotaConsumed: 2,
    })
  })

  it("build option helpers return shape-stable ECharts configs", () => {
    const histogramLabels = getLatencyBucketLabels()
    expect(histogramLabels.length).toBeGreaterThan(1)

    const latency = createEmptyUsageHistoryLatencyAggregate()
    latency.buckets = [1]

    const histogram = buildLatencyHistogramOption({
      latency,
      seriesLabel: "Latency",
    }) as any
    expect(histogram.xAxis.data.length).toBe(histogramLabels.length)
    expect(histogram.series[0].data.length).toBe(histogramLabels.length)

    const heatmap = buildHeatmapOption({
      dayKeys: ["2026-01-01", "2026-01-02"],
      modelNames: ["gpt-4"],
      valuesByModelAndDay: { "gpt-4": { "2026-01-02": 2 } },
      seriesLabel: "Tokens",
    }) as any
    expect(heatmap.series[0].data).toEqual([
      [0, 0, 0],
      [1, 0, 2],
    ])

    const bar = buildHorizontalBarOption({
      categories: ["a", "b"],
      values: [1, 2],
      valueLabel: "Count",
    }) as any
    expect(bar.series[0].data).toEqual([1, 2])

    const line = buildLineTrendOption({
      categories: ["x"],
      values: [null],
      seriesLabel: "Series",
    }) as any
    expect(line.series[0].connectNulls).toBe(true)
  })
})
