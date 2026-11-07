import type { LineSeriesOption } from "echarts"

import { CHART_COLORS } from "~/components/charts/chartColors"
import type { EChartsOption } from "~/components/charts/echarts"

/**
 * ECharts tooltip value can be a scalar or an array (multi-dimension values).
 * Normalize it to a scalar so our simple money formatter can handle it.
 */
function normalizeTooltipValue(value: unknown): number | string {
  if (typeof value === "number" || typeof value === "string") return value
  if (value instanceof Date) return value.valueOf()

  if (Array.isArray(value) && value.length > 0) {
    const first = value[0]
    if (typeof first === "number" || typeof first === "string") return first
    if (first instanceof Date) return first.valueOf()
  }

  return ""
}

export type BalanceHistoryTrendChartType = "line" | "bar"

/** Build independent bridges using only the recorded points on either side. */
function buildGapBridgeData(dayKeys: string[], values: Array<number | null>) {
  const data: Array<[string, number | null]> = []
  let previous: { index: number; day: string; value: number } | undefined

  dayKeys.forEach((day, index) => {
    const value = values[index]
    if (value == null || !Number.isFinite(value)) return
    if (previous && index > previous.index + 1) {
      // A null separator stops separate bridges from joining over observed days.
      if (data.length > 0) data.push([previous.day, null])
      data.push([previous.day, previous.value], [day, value])
    }
    previous = { index, day, value }
  })

  return data
}

/**
 * Build a multi-series trend option for per-account daily values (line or bar).
 *
 * Notes:
 * - Uses a scrollable legend to handle many accounts.
 * - `null` values are treated as gaps per series to represent missing snapshots/cashflow.
 */
export function buildMultiSeriesTrendOption(params: {
  dayKeys: string[]
  series: Array<{ name: string; values: Array<number | null> }>
  chartType: BalanceHistoryTrendChartType
  yAxisLabel?: string
  axisLabelFormatter?: (value: number | string, index: number) => string
  valueFormatter?: (value: number | string, dataIndex: number) => string
}): EChartsOption {
  const {
    dayKeys,
    series,
    chartType,
    yAxisLabel,
    axisLabelFormatter,
    valueFormatter,
  } = params

  const tooltipValueFormatter = valueFormatter
    ? (value: unknown, dataIndex: number) =>
        valueFormatter(normalizeTooltipValue(value), dataIndex)
    : undefined

  const legendTextColor = CHART_COLORS.axis

  const gapBridges: LineSeriesOption[] = []
  const resolvedSeries = series.map((entry) => {
    if (chartType === "line") {
      const bridge = buildGapBridgeData(dayKeys, entry.values)
      if (bridge.length > 0) {
        gapBridges.push({
          // Sharing the name keeps color and visibility tied to the account legend.
          name: entry.name,
          type: "line",
          data: bridge,
          encode: { x: 0, y: 1 },
          connectNulls: false,
          showSymbol: false,
          silent: true,
          tooltip: { show: false, trigger: "none" },
          emphasis: { disabled: true },
          lineStyle: { type: "dashed", width: 1.5, opacity: 0.45 },
          z: 1,
        })
      }
      return {
        name: entry.name,
        type: "line" as const,
        data: entry.values,
        // Keep sparse points visible (single-day snapshots), but avoid heavy clutter.
        showSymbol: true,
        showAllSymbol: "auto" as const,
        symbol: "circle",
        symbolSize: 4,
        smooth: true,
        connectNulls: false,
      }
    }

    return {
      name: entry.name,
      type: "bar" as const,
      data: entry.values,
      barMaxWidth: 18,
    }
  })

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      ...(tooltipValueFormatter
        ? { valueFormatter: tooltipValueFormatter }
        : {}),
    },
    legend: {
      type: "scroll",
      top: 0,
      left: 0,
      right: 0,
      tooltip: { show: true },
      pageIconColor: legendTextColor,
      pageTextStyle: { color: legendTextColor },
      textStyle: {
        color: legendTextColor,
        width: 140,
        overflow: "truncate",
        ellipsis: "…",
      },
    },
    grid: { left: 16, right: 16, top: 40, bottom: 24, containLabel: true },
    xAxis: {
      type: "category",
      data: dayKeys,
      axisLabel: { color: CHART_COLORS.axis },
      axisLine: { lineStyle: { color: CHART_COLORS.border } },
    },
    yAxis: {
      type: "value",
      name: yAxisLabel,
      axisLabel: {
        color: CHART_COLORS.axis,
        ...(axisLabelFormatter ? { formatter: axisLabelFormatter } : {}),
      },
      splitLine: { lineStyle: { color: CHART_COLORS.grid } },
    },
    series: [...resolvedSeries, ...gapBridges],
  }
}

/**
 * Build a donut-style pie option for per-account distribution views.
 */
export function buildAccountBreakdownPieOption(params: {
  categories: string[]
  values: number[]
  valueLabel?: string
  valueFormatter?: (value: number | string, dataIndex: number) => string
}): EChartsOption {
  const { categories, values, valueLabel, valueFormatter } = params

  const tooltipValueFormatter = valueFormatter
    ? (value: unknown, dataIndex: number) =>
        valueFormatter(normalizeTooltipValue(value), dataIndex)
    : undefined

  const legendTextColor = CHART_COLORS.axis

  const data = categories.map((name, index) => ({
    name,
    value: values[index] ?? 0,
  }))

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      ...(tooltipValueFormatter
        ? { valueFormatter: tooltipValueFormatter }
        : {}),
    },
    legend: {
      type: "scroll",
      bottom: 0,
      left: 0,
      right: 0,
      tooltip: { show: true },
      pageIconColor: legendTextColor,
      pageTextStyle: { color: legendTextColor },
      textStyle: {
        color: legendTextColor,
        width: 140,
        overflow: "truncate",
        ellipsis: "…",
      },
    },
    series: [
      {
        name: valueLabel ?? "",
        type: "pie",
        radius: ["35%", "70%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        label: { show: false, position: "center" },
        emphasis: { label: { show: true, fontSize: 12, fontWeight: "bold" } },
        labelLine: { show: false },
        data,
      },
    ],
  }
}

/**
 * Build a histogram-style bar option for per-account distribution views.
 *
 * Uses a horizontal bar layout for long account labels.
 */
export function buildAccountBreakdownBarOption(params: {
  categories: string[]
  values: number[]
  valueLabel?: string
  axisLabelFormatter?: (value: number | string, index: number) => string
  valueFormatter?: (value: number | string, dataIndex: number) => string
}): EChartsOption {
  const { categories, values, valueLabel, axisLabelFormatter, valueFormatter } =
    params

  const tooltipValueFormatter = valueFormatter
    ? (value: unknown, dataIndex: number) =>
        valueFormatter(normalizeTooltipValue(value), dataIndex)
    : undefined

  const axisTextColor = CHART_COLORS.axis

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      ...(tooltipValueFormatter
        ? { valueFormatter: tooltipValueFormatter }
        : {}),
    },
    grid: { left: 16, right: 16, top: 16, bottom: 16, containLabel: true },
    xAxis: {
      type: "value",
      axisLabel: {
        color: axisTextColor,
        ...(axisLabelFormatter ? { formatter: axisLabelFormatter } : {}),
      },
      splitLine: { lineStyle: { color: CHART_COLORS.grid } },
    },
    yAxis: {
      type: "category",
      data: categories,
      inverse: true,
      axisLabel: {
        color: axisTextColor,
        width: 140,
        overflow: "truncate",
        ellipsis: "…",
      },
      axisLine: { lineStyle: { color: CHART_COLORS.border } },
    },
    series: [
      {
        name: valueLabel ?? "",
        type: "bar",
        data: values,
      },
    ],
  }
}
