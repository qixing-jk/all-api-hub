import { CHART_COLORS } from "~/components/charts/chartColors"
import type { EChartsOption } from "~/components/charts/echarts"
import { CURRENCIES } from "~/constants/money"
import { assetIdentity, type Asset } from "~/services/amounts/assets"
import { sumDecimals } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_SETTLEMENT_STATUSES,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import type { FinancialConsumptionFact } from "~/services/amounts/usage"
import { USAGE_HISTORY_LATENCY_BUCKET_UPPER_BOUNDS_SECONDS } from "~/services/history/usageHistory/core"
import type {
  UsageHistoryAggregate,
  UsageHistoryLatencyAggregate,
} from "~/types/usageHistory"
import { getAssetDisplayValue, getAssetLabel } from "~/utils/core/money"

export const REFERENCE_COST_KEY = "reference"

/** Group actual charges by asset identity, preserving zero and excluding unknown fees. */
export function settledCostTotals(facts: FinancialConsumptionFact[]) {
  const byAsset = new Map<
    string,
    {
      asset: Exclude<Asset, { kind: typeof ASSET_KINDS.Unknown }>
      values: string[]
    }
  >()
  for (const fact of facts) {
    if (
      fact.asset.kind === ASSET_KINDS.Unknown ||
      fact.amount.status !== OBSERVATION_STATUSES.Known ||
      fact.settlement !== FINANCIAL_SETTLEMENT_STATUSES.Settled ||
      fact.amount.source.kind === EVIDENCE_KINDS.Legacy ||
      fact.amount.source.kind === EVIDENCE_KINDS.Manual
    )
      continue
    const key = assetIdentity(fact.asset)
    const group = byAsset.get(key) ?? { asset: fact.asset, values: [] }
    group.values.push(fact.amount.value)
    byAsset.set(key, group)
  }
  return Array.from(byAsset, ([key, { asset, values }]) => ({
    key,
    amount: { asset, value: sumDecimals(values) },
  })).sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * Create human-readable bucket labels aligned with `USAGE_HISTORY_LATENCY_BUCKET_UPPER_BOUNDS_SECONDS`.
 */
export function getLatencyBucketLabels(): string[] {
  const bounds = USAGE_HISTORY_LATENCY_BUCKET_UPPER_BOUNDS_SECONDS
  const labels: string[] = []

  labels.push(`<${bounds[0]}s`)
  for (let index = 1; index < bounds.length; index += 1) {
    labels.push(`${bounds[index - 1]}–${bounds[index]}s`)
  }
  labels.push(`≥${bounds[bounds.length - 1]}s`)

  return labels
}

/**
 * Build daily requests, model tokens and optional historical USD reference costs.
 *
 * `dayKeys` is assumed to be a dense, ordered domain; any missing aggregate buckets are treated as 0.
 */
export function buildDailyOverviewOption(params: {
  dayKeys: string[]
  daily: Record<string, UsageHistoryAggregate>
  requestsAxisLabel: string
  tokensAxisLabel: string
  requestsSeriesLabel: string
  promptTokensSeriesLabel: string
  completionTokensSeriesLabel: string
  totalTokensSeriesLabel: string
  recordedCostSeriesLabel?: string
  referenceCostSeriesLabel?: string
  selectedCostKey?: string
  legendSelected?: Record<string, boolean>
}): EChartsOption {
  const {
    dayKeys,
    daily,
    requestsAxisLabel,
    tokensAxisLabel,
    requestsSeriesLabel,
    promptTokensSeriesLabel,
    completionTokensSeriesLabel,
    totalTokensSeriesLabel,
    referenceCostSeriesLabel,
    recordedCostSeriesLabel,
    selectedCostKey,
    legendSelected,
  } = params

  const requests = dayKeys.map((dayKey) => daily[dayKey]?.requests ?? 0)
  const promptTokens = dayKeys.map((dayKey) => daily[dayKey]?.promptTokens ?? 0)
  const completionTokens = dayKeys.map(
    (dayKey) => daily[dayKey]?.completionTokens ?? 0,
  )
  const totalTokens = dayKeys.map((dayKey) => daily[dayKey]?.totalTokens ?? 0)
  const referenceCosts = dayKeys.map(
    (dayKey) => daily[dayKey]?.referenceCostUsd ?? null,
  )
  const showReferenceCosts =
    (!selectedCostKey || selectedCostKey === REFERENCE_COST_KEY) &&
    referenceCostSeriesLabel &&
    referenceCosts.some((amount) => amount !== null)

  const fees = new Map<string, { unit: string; values: Map<string, number> }>()
  if (recordedCostSeriesLabel) {
    for (const dayKey of dayKeys) {
      for (const { key, amount } of settledCostTotals(
        daily[dayKey]?.consumption ?? [],
      )) {
        if (selectedCostKey && selectedCostKey !== key) continue
        const value = Number(getAssetDisplayValue(amount))
        if (!Number.isFinite(value)) continue
        const unit =
          amount.asset.kind === ASSET_KINDS.Quota
            ? amount.asset.displayLabel
            : getAssetLabel(amount.asset)
        const series = fees.get(key) ?? { unit, values: new Map() }
        series.values.set(dayKey, value)
        fees.set(key, series)
      }
    }
  }
  const usdKey = assetIdentity({
    kind: ASSET_KINDS.Currency,
    code: CURRENCIES.USD,
  })
  const axes = [
    ...new Set([...(showReferenceCosts ? [usdKey] : []), ...fees.keys()]),
  ]
  const feeAxes = axes.map((key, index) => ({
    type: "value" as const,
    position: "right" as const,
    offset: 42 + index * 54,
    axisLabel: {
      color: CHART_COLORS.axis,
      formatter: key === usdKey ? "${value}" : "{value}",
    },
    splitLine: { show: false },
  }))
  const unitCounts = new Map<string, number>()
  for (const { unit } of fees.values())
    unitCounts.set(unit, (unitCounts.get(unit) ?? 0) + 1)
  const recordedFeeSeries = Array.from(
    fees,
    ([key, { unit, values }], index) => ({
      name: `${recordedCostSeriesLabel} (${unit})${(unitCounts.get(unit) ?? 0) > 1 ? ` #${index + 1}` : ""}`,
      type: "line" as const,
      yAxisIndex: axes.indexOf(key) + 2,
      data: dayKeys.map((day) => values.get(day) ?? null),
    }),
  )

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    legend: {
      type: "scroll",
      top: 0,
      right: 52,
      textStyle: { color: CHART_COLORS.axis },
      ...(legendSelected ? { selected: legendSelected } : {}),
    },
    toolbox: {
      feature: {
        restore: {},
        saveAsImage: {},
      },
    },
    grid: {
      left: "10%",
      right: feeAxes.length ? Math.max(94, 42 + feeAxes.length * 54) : "10%",
    },
    xAxis: {
      type: "category",
      data: dayKeys,
      axisLabel: { color: CHART_COLORS.axis },
      axisLine: { lineStyle: { color: CHART_COLORS.border } },
    },
    yAxis: [
      {
        type: "value",
        name: requestsAxisLabel,
        axisLabel: { color: CHART_COLORS.axis },
        splitLine: { lineStyle: { color: CHART_COLORS.grid } },
      },
      {
        type: "value",
        name: tokensAxisLabel,
        axisLabel: { color: CHART_COLORS.axis },
        splitLine: { show: false },
      },
      ...feeAxes,
    ],
    dataZoom: [
      { type: "inside", xAxisIndex: 0 },
      { type: "slider", xAxisIndex: 0, bottom: 8, height: 20 },
    ],
    series: [
      {
        name: requestsSeriesLabel,
        type: "line",
        yAxisIndex: 0,
        data: requests,
        showSymbol: false,
        smooth: true,
      },
      {
        name: promptTokensSeriesLabel,
        type: "line",
        yAxisIndex: 1,
        data: promptTokens,
        showSymbol: false,
        smooth: true,
        areaStyle: { opacity: 0.2 },
        stack: "tokens",
      },
      {
        name: completionTokensSeriesLabel,
        type: "line",
        yAxisIndex: 1,
        data: completionTokens,
        showSymbol: false,
        smooth: true,
        areaStyle: { opacity: 0.2 },
        stack: "tokens",
      },
      {
        name: totalTokensSeriesLabel,
        type: "line",
        yAxisIndex: 1,
        data: totalTokens,
        showSymbol: false,
        smooth: true,
      },
      ...recordedFeeSeries,
      ...(showReferenceCosts
        ? [
            {
              name: referenceCostSeriesLabel,
              type: "line" as const,
              yAxisIndex: 2,
              data: referenceCosts,
              lineStyle: { type: "dashed" as const },
            },
          ]
        : []),
    ],
  }
}

/**
 * Build a simple horizontal bar chart option (used for Top-N tables and breakdown views).
 */
export function buildHorizontalBarOption(params: {
  categories: string[]
  values: number[]
  valueLabel?: string
  inverse?: boolean
  showValueLabels?: boolean
}): EChartsOption {
  const {
    categories,
    values,
    valueLabel,
    inverse = true,
    showValueLabels = false,
  } = params

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "item" },
    grid: { left: 16, right: 16, top: 16, bottom: 16, containLabel: true },
    xAxis: {
      type: "value",
      axisLabel: { color: CHART_COLORS.axis },
      splitLine: { lineStyle: { color: CHART_COLORS.grid } },
    },
    yAxis: {
      type: "category",
      data: categories,
      inverse,
      axisLabel: { color: CHART_COLORS.axis },
      axisLine: { lineStyle: { color: CHART_COLORS.border } },
    },
    series: [
      {
        name: valueLabel ?? "",
        type: "bar",
        ...(showValueLabels
          ? {
              label: {
                show: true,
                position: "right",
                color: CHART_COLORS.axis,
              },
            }
          : {}),
        data: values,
      },
    ],
  }
}

/**
 * Build a basic pie chart option for distribution-style breakdown views.
 *
 * Notes:
 * - Uses a donut-style radius to leave room for labels/legend.
 * - Keeps labels hidden by default to avoid clutter; they show on hover/emphasis.
 */
export function buildPieOption(params: {
  categories: string[]
  values: number[]
  valueLabel?: string
}): EChartsOption {
  const { categories, values, valueLabel } = params
  const data = categories.map((name, index) => ({
    name,
    value: values[index] ?? 0,
  }))

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "item" },
    legend: {
      type: "scroll",
      bottom: 0,
      textStyle: { color: CHART_COLORS.axis },
    },
    series: [
      {
        name: valueLabel ?? "",
        type: "pie",
        radius: ["35%", "70%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        label: { show: false, position: "center" },
        emphasis: {
          label: { show: true, fontSize: 12, fontWeight: "bold" },
        },
        labelLine: { show: false },
        data,
      },
    ],
  }
}

/**
 * Build a model-by-day heatmap chart option.
 *
 * `valuesByModelAndDay` is treated as sparse; any missing cell values are rendered as 0.
 */
export function buildHeatmapOption(params: {
  dayKeys: string[]
  modelNames: string[]
  valuesByModelAndDay: Record<string, Record<string, number>>
  seriesLabel: string
}): EChartsOption {
  const { dayKeys, modelNames, valuesByModelAndDay, seriesLabel } = params

  const data: Array<[number, number, number]> = []
  for (let y = 0; y < modelNames.length; y += 1) {
    const modelName = modelNames[y]
    if (modelName === undefined) continue
    const modelDaily = valuesByModelAndDay[modelName] ?? {}
    for (let x = 0; x < dayKeys.length; x += 1) {
      const dayKey = dayKeys[x]
      if (dayKey === undefined) continue
      data.push([x, y, modelDaily[dayKey] ?? 0])
    }
  }

  const maxValue = data.reduce((max, item) => Math.max(max, item[2]), 0)

  return {
    backgroundColor: "transparent",
    tooltip: { position: "top" },
    // The calculable scale includes handles and numeric labels above its bar.
    grid: { left: 16, right: 24, top: 16, bottom: 88, containLabel: true },
    xAxis: {
      type: "category",
      data: dayKeys,
      axisLabel: { color: CHART_COLORS.axis },
      axisLine: { lineStyle: { color: CHART_COLORS.border } },
    },
    yAxis: {
      type: "category",
      data: modelNames,
      axisLabel: { color: CHART_COLORS.axis },
      axisLine: { lineStyle: { color: CHART_COLORS.border } },
    },
    visualMap: {
      inRange: { color: [CHART_COLORS.heatmapLow, CHART_COLORS.heatmapHigh] },
      min: 0,
      max: Math.max(1, maxValue),
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      textStyle: { color: CHART_COLORS.axis },
    },
    series: [
      {
        name: seriesLabel,
        type: "heatmap",
        data,
        emphasis: {
          itemStyle: {
            shadowBlur: 8,
            shadowColor: CHART_COLORS.shadow,
          },
        },
      },
    ],
  }
}

/**
 * Build a histogram option for latency bucket counts.
 *
 * Buckets are aligned with `getLatencyBucketLabels()`; missing bucket indices are treated as 0.
 */
export function buildLatencyHistogramOption(params: {
  latency: UsageHistoryLatencyAggregate
  seriesLabel: string
}): EChartsOption {
  const { latency, seriesLabel } = params
  const labels = getLatencyBucketLabels()
  const counts = labels.map((_, index) => latency.buckets[index] ?? 0)

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    grid: { left: 16, right: 16, top: 16, bottom: 24, containLabel: true },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { color: CHART_COLORS.axis, rotate: 30 },
      axisLine: { lineStyle: { color: CHART_COLORS.border } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: CHART_COLORS.axis },
      splitLine: { lineStyle: { color: CHART_COLORS.grid } },
    },
    series: [
      {
        name: seriesLabel,
        type: "bar",
        data: counts,
      },
    ],
  }
}

/**
 * Build the latency trend chart option (avg/max seconds + slow count).
 *
 * `dailyLatency` is treated as sparse; missing days are rendered as 0.
 */
export function buildLatencyTrendOption(params: {
  dayKeys: string[]
  dailyLatency: Record<string, UsageHistoryLatencyAggregate>
  avgSeriesLabel: string
  maxSeriesLabel: string
  slowSeriesLabel: string
  secondsAxisLabel: string
  slowCountAxisLabel: string
}): EChartsOption {
  const {
    dayKeys,
    dailyLatency,
    avgSeriesLabel,
    maxSeriesLabel,
    slowSeriesLabel,
    secondsAxisLabel,
    slowCountAxisLabel,
  } = params

  const avg = dayKeys.map((dayKey) => {
    const item = dailyLatency[dayKey]
    if (!item || item.count <= 0) return 0
    return item.sum / Math.max(1, item.count)
  })

  const max = dayKeys.map((dayKey) => dailyLatency[dayKey]?.max ?? 0)
  const slow = dayKeys.map((dayKey) => dailyLatency[dayKey]?.slowCount ?? 0)

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    legend: { top: 0 },
    grid: { left: 16, right: 16, top: 44, bottom: 24, containLabel: true },
    xAxis: {
      type: "category",
      data: dayKeys,
      axisLabel: { color: CHART_COLORS.axis },
      axisLine: { lineStyle: { color: CHART_COLORS.border } },
    },
    yAxis: [
      {
        type: "value",
        name: secondsAxisLabel,
        axisLabel: { color: CHART_COLORS.axis },
        splitLine: { lineStyle: { color: CHART_COLORS.grid } },
      },
      {
        type: "value",
        name: slowCountAxisLabel,
        axisLabel: { color: CHART_COLORS.axis },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: avgSeriesLabel,
        type: "line",
        data: avg,
        showSymbol: false,
        smooth: true,
      },
      {
        name: maxSeriesLabel,
        type: "line",
        data: max,
        showSymbol: false,
        smooth: true,
      },
      { name: slowSeriesLabel, type: "bar", yAxisIndex: 1, data: slow },
    ],
  }
}
