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

/**
 * Build a single-series line chart option for the balance trend.
 *
 * `null` values are treated as gaps so users can spot missing days.
 */
export function buildBalanceTrendOption(params: {
  dayKeys: string[]
  values: Array<number | null>
  seriesLabel: string
  yAxisLabel?: string
  isDark?: boolean
  axisLabelFormatter?: (value: number | string, index: number) => string
  valueFormatter?: (value: number | string, dataIndex: number) => string
}): EChartsOption {
  const {
    dayKeys,
    values,
    seriesLabel,
    yAxisLabel,
    isDark = false,
    axisLabelFormatter,
    valueFormatter,
  } = params

  const tooltipValueFormatter = valueFormatter
    ? (value: unknown, dataIndex: number) =>
        valueFormatter(normalizeTooltipValue(value), dataIndex)
    : undefined

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      ...(tooltipValueFormatter
        ? { valueFormatter: tooltipValueFormatter }
        : {}),
    },
    grid: { left: 16, right: 16, top: 16, bottom: 24, containLabel: true },
    xAxis: {
      type: "category",
      data: dayKeys,
      axisLabel: { color: isDark ? "#9ca3af" : "#6b7280" },
      axisLine: { lineStyle: { color: isDark ? "#374151" : "#e5e7eb" } },
    },
    yAxis: {
      type: "value",
      name: yAxisLabel,
      axisLabel: {
        color: isDark ? "#9ca3af" : "#6b7280",
        ...(axisLabelFormatter ? { formatter: axisLabelFormatter } : {}),
      },
      splitLine: { lineStyle: { color: isDark ? "#1f2937" : "#f3f4f6" } },
    },
    series: [
      {
        name: seriesLabel,
        type: "line",
        data: values,
        // Keep symbols visible for sparse snapshots so single-day points don't disappear.
        showSymbol: true,
        showAllSymbol: "auto",
        symbol: "circle",
        symbolSize: 6,
        smooth: true,
        connectNulls: false,
      },
    ],
  }
}

/**
 * Build a two-series bar chart option for daily income/outcome.
 *
 * `null` values are treated as gaps so users can spot missing days.
 */
export function buildIncomeOutcomeBarOption(params: {
  dayKeys: string[]
  incomeValues: Array<number | null>
  outcomeValues: Array<number | null>
  incomeLabel: string
  outcomeLabel: string
  yAxisLabel?: string
  isDark?: boolean
  axisLabelFormatter?: (value: number | string, index: number) => string
  valueFormatter?: (value: number | string, dataIndex: number) => string
}): EChartsOption {
  const {
    dayKeys,
    incomeValues,
    outcomeValues,
    incomeLabel,
    outcomeLabel,
    yAxisLabel,
    isDark = false,
    axisLabelFormatter,
    valueFormatter,
  } = params

  const tooltipValueFormatter = valueFormatter
    ? (value: unknown, dataIndex: number) =>
        valueFormatter(normalizeTooltipValue(value), dataIndex)
    : undefined

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      ...(tooltipValueFormatter
        ? { valueFormatter: tooltipValueFormatter }
        : {}),
    },
    legend: {
      top: 0,
      textStyle: { color: isDark ? "#9ca3af" : "#6b7280" },
    },
    grid: { left: 16, right: 16, top: 32, bottom: 24, containLabel: true },
    xAxis: {
      type: "category",
      data: dayKeys,
      axisLabel: { color: isDark ? "#9ca3af" : "#6b7280" },
      axisLine: { lineStyle: { color: isDark ? "#374151" : "#e5e7eb" } },
    },
    yAxis: {
      type: "value",
      name: yAxisLabel,
      axisLabel: {
        color: isDark ? "#9ca3af" : "#6b7280",
        ...(axisLabelFormatter ? { formatter: axisLabelFormatter } : {}),
      },
      splitLine: { lineStyle: { color: isDark ? "#1f2937" : "#f3f4f6" } },
    },
    series: [
      {
        name: incomeLabel,
        type: "bar",
        data: incomeValues,
        itemStyle: { color: "#10b981" },
      },
      {
        name: outcomeLabel,
        type: "bar",
        data: outcomeValues,
        itemStyle: { color: "#ef4444" },
      },
    ],
  }
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
  isDark?: boolean
  axisLabelFormatter?: (value: number | string, index: number) => string
  valueFormatter?: (value: number | string, dataIndex: number) => string
}): EChartsOption {
  const {
    dayKeys,
    series,
    chartType,
    yAxisLabel,
    isDark = false,
    axisLabelFormatter,
    valueFormatter,
  } = params

  const tooltipValueFormatter = valueFormatter
    ? (value: unknown, dataIndex: number) =>
        valueFormatter(normalizeTooltipValue(value), dataIndex)
    : undefined

  const legendTextColor = isDark ? "#9ca3af" : "#6b7280"

  const resolvedSeries = series.map((entry) => {
    if (chartType === "line") {
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
      axisLabel: { color: isDark ? "#9ca3af" : "#6b7280" },
      axisLine: { lineStyle: { color: isDark ? "#374151" : "#e5e7eb" } },
    },
    yAxis: {
      type: "value",
      name: yAxisLabel,
      axisLabel: {
        color: isDark ? "#9ca3af" : "#6b7280",
        ...(axisLabelFormatter ? { formatter: axisLabelFormatter } : {}),
      },
      splitLine: { lineStyle: { color: isDark ? "#1f2937" : "#f3f4f6" } },
    },
    series: resolvedSeries,
  }
}

/**
 * Build a donut-style pie option for per-account distribution views.
 */
export function buildAccountBreakdownPieOption(params: {
  categories: string[]
  values: number[]
  valueLabel?: string
  isDark?: boolean
  valueFormatter?: (value: number | string, dataIndex: number) => string
}): EChartsOption {
  const {
    categories,
    values,
    valueLabel,
    isDark = false,
    valueFormatter,
  } = params

  const tooltipValueFormatter = valueFormatter
    ? (value: unknown, dataIndex: number) =>
        valueFormatter(normalizeTooltipValue(value), dataIndex)
    : undefined

  const legendTextColor = isDark ? "#9ca3af" : "#6b7280"

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
  isDark?: boolean
  axisLabelFormatter?: (value: number | string, index: number) => string
  valueFormatter?: (value: number | string, dataIndex: number) => string
}): EChartsOption {
  const {
    categories,
    values,
    valueLabel,
    isDark = false,
    axisLabelFormatter,
    valueFormatter,
  } = params

  const tooltipValueFormatter = valueFormatter
    ? (value: unknown, dataIndex: number) =>
        valueFormatter(normalizeTooltipValue(value), dataIndex)
    : undefined

  const axisTextColor = isDark ? "#9ca3af" : "#6b7280"

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
      splitLine: { lineStyle: { color: isDark ? "#1f2937" : "#f3f4f6" } },
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
      axisLine: { lineStyle: { color: isDark ? "#374151" : "#e5e7eb" } },
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
