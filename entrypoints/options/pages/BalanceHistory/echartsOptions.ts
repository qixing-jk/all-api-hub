import type { EChartsOption } from "~/components/charts/echarts"

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
  axisLabelFormatter?: (value: unknown) => string
  valueFormatter?: (value: unknown) => string
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

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      ...(valueFormatter ? { valueFormatter } : {}),
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
        ...(axisLabelFormatter ? { formatter: axisLabelFormatter as any } : {}),
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
  axisLabelFormatter?: (value: unknown) => string
  valueFormatter?: (value: unknown) => string
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

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      ...(valueFormatter ? { valueFormatter } : {}),
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
        ...(axisLabelFormatter ? { formatter: axisLabelFormatter as any } : {}),
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
