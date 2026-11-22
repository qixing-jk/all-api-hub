import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  buildDailyOverviewOption,
  buildHeatmapOption,
  buildHorizontalBarOption,
  buildLatencyHistogramOption,
  buildLatencyTrendOption,
  buildPieOption,
  REFERENCE_COST_KEY,
  settledCostTotals,
} from "~/features/UsageAnalytics/charts/echartsOptions"
import {
  resolveLatencyAggregateForSelection,
  resolveUsageSelection,
  topNWithOther,
} from "~/features/UsageAnalytics/filtering/usageSelection"
import type { useUsageAnalyticsFilters } from "~/features/UsageAnalytics/filtering/useUsageAnalyticsFilters"
import {
  USAGE_ANALYTICS_BREAKDOWN_CHART_KEYS,
  USAGE_ANALYTICS_CHART_TYPES,
} from "~/features/UsageAnalytics/types"
import type {
  UsageAnalyticsBreakdownChartKey,
  UsageAnalyticsChartDisplayType,
} from "~/features/UsageAnalytics/types"
import { ASSET_KINDS } from "~/services/amounts/financialConstants"
import { parseDayKey } from "~/utils/core/dayKey"
import { getAssetDisplayValue, getAssetLabel } from "~/utils/core/money"

/** Fields read from ECharts interaction callbacks. */
type UsageChartEvent = {
  batch?: UsageChartEvent[]
  startValue?: unknown
  endValue?: unknown
  selected?: unknown
  name?: unknown
}

interface UsageAnalyticsChartsInput {
  filters: Pick<
    ReturnType<typeof useUsageAnalyticsFilters>,
    | "exportPreview"
    | "selectedTokenIds"
    | "accountLabels"
    | "dayKeysInRange"
    | "minDay"
    | "maxDay"
    | "startDay"
    | "endDay"
    | "setStartDay"
    | "setEndDay"
  >
}

/** A cost distribution has shares only when its finite, nonnegative values include a charge. */
function hasCostShares(values: number[]): boolean {
  return (
    values.some((value) => value > 0) &&
    values.every((value) => Number.isFinite(value) && value >= 0)
  )
}

/** Owns chart projections and the click, legend, and date-zoom interactions. */
export function useUsageAnalyticsCharts({
  filters,
}: UsageAnalyticsChartsInput) {
  const { t } = useTranslation("usageAnalytics")
  const {
    exportPreview,
    selectedTokenIds,
    accountLabels,
    dayKeysInRange,
    minDay,
    maxDay,
    startDay,
    endDay,
    setStartDay,
    setEndDay,
  } = filters
  // Cross-chart selection derived from in-chart interactions (click/zoom/legend).
  const [focusModelName, setFocusModelName] = useState<string | null>(null)
  const [dailyLegendSelected, setDailyLegendSelected] = useState<
    Record<string, boolean> | undefined
  >(undefined)

  const [breakdownChartTypeByKey, setBreakdownChartTypeByKey] = useState<
    Record<UsageAnalyticsBreakdownChartKey, UsageAnalyticsChartDisplayType>
  >({
    [USAGE_ANALYTICS_BREAKDOWN_CHART_KEYS.SlowModels]:
      USAGE_ANALYTICS_CHART_TYPES.Pie,
    [USAGE_ANALYTICS_BREAKDOWN_CHART_KEYS.SlowTokens]:
      USAGE_ANALYTICS_CHART_TYPES.Pie,
    [USAGE_ANALYTICS_BREAKDOWN_CHART_KEYS.AccountComparison]:
      USAGE_ANALYTICS_CHART_TYPES.Pie,
    [USAGE_ANALYTICS_BREAKDOWN_CHART_KEYS.ModelDistribution]:
      USAGE_ANALYTICS_CHART_TYPES.Pie,
    [USAGE_ANALYTICS_BREAKDOWN_CHART_KEYS.ModelCostDistribution]:
      USAGE_ANALYTICS_CHART_TYPES.Pie,
  })

  /**
   * Update a single breakdown card's chart type (pie vs histogram-style bar).
   *
   * Stored as a keyed map to keep state updates localized and explicit.
   */
  const setBreakdownChartType = useCallback(
    (
      key: UsageAnalyticsBreakdownChartKey,
      value: UsageAnalyticsChartDisplayType,
    ) => {
      setBreakdownChartTypeByKey((current) => {
        if (current[key] === value) return current
        return { ...current, [key]: value }
      })
    },
    [],
  )

  const {
    fusedDailyForTokens,
    fusedHourlyForTokens,
    fusedDailyByModelForTokens,
    modelTotalsRows,
    accountTotalsFullRows,
    slowModelRows,
    slowTokenRows,
    latencyDailyForTokens,
  } = useMemo(
    () =>
      resolveUsageSelection({
        exportData: exportPreview,
        tokenIds: selectedTokenIds,
        accountLabels,
        otherLabel: t("charts.other"),
        unknownLabel: t("filters.unknownToken"),
      }),
    [exportPreview, selectedTokenIds, accountLabels, t],
  )

  const accountTotalsRows = useMemo(() => {
    return topNWithOther(
      accountTotalsFullRows.map((row) => ({
        key: row.accountLabel,
        value: row.totalTokens,
      })),
      12,
      t("charts.other"),
    )
  }, [accountTotalsFullRows, t])

  const selectionTotals = useMemo(() => {
    return Object.values(fusedDailyForTokens).reduce(
      (totals, aggregate) => {
        totals.requests += aggregate.requests
        totals.promptTokens += aggregate.promptTokens
        totals.completionTokens += aggregate.completionTokens
        totals.totalTokens += aggregate.totalTokens
        return totals
      },
      {
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    )
  }, [fusedDailyForTokens])

  const recordedCosts = useMemo(
    () =>
      settledCostTotals(
        Object.values(fusedDailyForTokens).flatMap(
          (day) => day.consumption ?? [],
        ),
      ),
    [fusedDailyForTokens],
  )

  const [dailyCostKey, setDailyCostKey] = useState<string>()
  const dailyCostChoices = recordedCosts.map(({ key, amount }) => ({
    key,
    label: getAssetLabel(amount.asset),
  }))
  const referenceCostLabel = `${t("summary.referenceCost")} (USD)`
  if (
    Object.values(fusedDailyForTokens).some(
      ({ referenceCostUsd }) => referenceCostUsd !== undefined,
    )
  )
    dailyCostChoices.push({
      key: REFERENCE_COST_KEY,
      label: referenceCostLabel,
    })
  const selectedDailyCost =
    dailyCostChoices.find(({ key }) => key === dailyCostKey) ??
    dailyCostChoices[0]

  const selectedLatencyAggregate = useMemo(() => {
    if (!exportPreview) {
      return null
    }

    return resolveLatencyAggregateForSelection({
      exportData: exportPreview,
      tokenIds: selectedTokenIds,
      modelName: focusModelName,
    })
  }, [exportPreview, focusModelName, selectedTokenIds])

  const dailyLegendLabels = useMemo(() => {
    return {
      requestsAxisLabel: t("charts.dailyOverview.axes.requests"),
      tokensAxisLabel: t("charts.dailyOverview.axes.tokens"),
      requestsSeriesLabel: t("charts.dailyOverview.series.requests"),
      promptTokensSeriesLabel: t("charts.dailyOverview.series.promptTokens"),
      completionTokensSeriesLabel: t(
        "charts.dailyOverview.series.completionTokens",
      ),
      totalTokensSeriesLabel: t("charts.dailyOverview.series.totalTokens"),
      recordedCostSeriesLabel: t("summary.cost"),
      referenceCostSeriesLabel: `${t("summary.referenceCost")} (USD)`,
    }
  }, [t])

  const dailyOverviewOption = useMemo(() => {
    return buildDailyOverviewOption({
      dayKeys: dayKeysInRange,
      daily: fusedDailyForTokens,
      ...dailyLegendLabels,
      selectedCostKey: selectedDailyCost?.key,
      legendSelected: dailyLegendSelected,
    })
  }, [
    dailyLegendLabels,
    dailyLegendSelected,
    dayKeysInRange,
    fusedDailyForTokens,
    selectedDailyCost?.key,
  ])

  const modelDistributionOption = useMemo(() => {
    const categories = modelTotalsRows.map((row) => row.modelName)
    const values = modelTotalsRows.map((row) => row.totalTokens)
    const valueLabel = t("charts.modelDistribution.series.tokens")

    return breakdownChartTypeByKey.modelDistribution ===
      USAGE_ANALYTICS_CHART_TYPES.Pie
      ? buildPieOption({ categories, values, valueLabel })
      : buildHorizontalBarOption({ categories, values, valueLabel })
  }, [breakdownChartTypeByKey.modelDistribution, modelTotalsRows, t])

  const modelCostCharts = useMemo(() => {
    const groups = new Map<
      string,
      { label: string; categories: string[]; values: number[] }
    >()
    for (const [model, days] of Object.entries(fusedDailyByModelForTokens)) {
      const charges = settledCostTotals(
        Object.values(days).flatMap((day) => day.consumption ?? []),
      )
      for (const { key, amount } of charges) {
        const group = groups.get(key) ?? {
          label:
            amount.asset.kind === ASSET_KINDS.Quota
              ? amount.asset.displayLabel
              : getAssetLabel(amount.asset),
          categories: [],
          values: [],
        }
        group.categories.push(model)
        group.values.push(Number(getAssetDisplayValue(amount)))
        groups.set(key, group)
      }
    }
    return [...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, group]) => {
        const { label, categories, values } = group
        const top = topNWithOther(
          categories.map((key, index) => ({ key, value: values[index]! })),
          12,
          t("charts.other"),
          true,
        )
        const options = {
          categories: top.map(({ key }) => key),
          values: top.map(({ value }) => value),
          valueLabel: `${t("charts.modelCostDistribution.series.native")} · ${label}`,
        }
        const hasShares = hasCostShares(values)
        const pie =
          breakdownChartTypeByKey.modelCostDistribution ===
            USAGE_ANALYTICS_CHART_TYPES.Pie && hasShares
        return {
          key,
          label,
          hasShares,
          option: pie
            ? buildPieOption(options)
            : buildHorizontalBarOption({
                ...options,
                showValueLabels: !hasShares,
              }),
        }
      })
  }, [
    breakdownChartTypeByKey.modelCostDistribution,
    fusedDailyByModelForTokens,
    t,
  ])

  const referenceModelCostChart = useMemo(() => {
    const rows = Object.entries(fusedDailyByModelForTokens).flatMap(
      ([key, days]) => {
        const costs = Object.values(days).flatMap(({ referenceCostUsd }) =>
          referenceCostUsd === undefined ? [] : [referenceCostUsd],
        )
        return costs.length
          ? [{ key, value: costs.reduce((total, cost) => total + cost, 0) }]
          : []
      },
    )
    if (!rows.length) return
    const top = topNWithOther(rows, 12, t("charts.other"), true)
    const options = {
      categories: top.map(({ key }) => key),
      values: top.map(({ value }) => value),
      valueLabel: `${t("summary.referenceCost")} (USD)`,
    }
    const hasShares = hasCostShares(rows.map(({ value }) => value))
    return {
      key: REFERENCE_COST_KEY,
      label: referenceCostLabel,
      hasShares,
      option:
        hasShares &&
        breakdownChartTypeByKey.modelCostDistribution ===
          USAGE_ANALYTICS_CHART_TYPES.Pie
          ? buildPieOption(options)
          : buildHorizontalBarOption({
              ...options,
              showValueLabels: !hasShares,
            }),
    }
  }, [
    breakdownChartTypeByKey.modelCostDistribution,
    fusedDailyByModelForTokens,
    referenceCostLabel,
    t,
  ])

  const accountComparisonOption = useMemo(() => {
    const categories = accountTotalsRows.map((row) => row.key)
    const values = accountTotalsRows.map((row) => row.value)
    const valueLabel = t("charts.accountComparison.series.tokens")

    return breakdownChartTypeByKey.accountComparison ===
      USAGE_ANALYTICS_CHART_TYPES.Pie
      ? buildPieOption({ categories, values, valueLabel })
      : buildHorizontalBarOption({ categories, values, valueLabel })
  }, [accountTotalsRows, breakdownChartTypeByKey.accountComparison, t])

  const heatmapOption = useMemo(() => {
    const modelsForHeatmap =
      focusModelName && focusModelName !== t("charts.other")
        ? [focusModelName]
        : modelTotalsRows
            .map((row) => row.modelName)
            .filter((name) => name !== t("charts.other"))
            .slice(0, 10)

    const valuesByModelAndDay: Record<string, Record<string, number>> = {}
    for (const modelName of modelsForHeatmap) {
      const modelDaily = fusedDailyByModelForTokens[modelName] ?? {}
      valuesByModelAndDay[modelName] = Object.fromEntries(
        dayKeysInRange.map((dayKey) => [
          dayKey,
          modelDaily[dayKey]?.totalTokens ?? 0,
        ]),
      )
    }

    return buildHeatmapOption({
      dayKeys: dayKeysInRange,
      modelNames: modelsForHeatmap,
      valuesByModelAndDay,
      seriesLabel: t("charts.modelHeatmap.series.tokens"),
    })
  }, [
    dayKeysInRange,
    focusModelName,
    fusedDailyByModelForTokens,
    modelTotalsRows,
    t,
  ])

  const usageTimeHeatmapOption = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, index) =>
      String(index).padStart(2, "0"),
    )

    const weekdayLabels = [
      t("weekdays.mon"),
      t("weekdays.tue"),
      t("weekdays.wed"),
      t("weekdays.thu"),
      t("weekdays.fri"),
      t("weekdays.sat"),
      t("weekdays.sun"),
    ]

    const valuesByModelAndDay: Record<
      string,
      Record<string, number>
    > = Object.fromEntries(
      weekdayLabels.map((label) => [
        label,
        Object.fromEntries(hours.map((hour) => [hour, 0])),
      ]),
    )

    for (const [dayKey, hourly] of Object.entries(fusedHourlyForTokens)) {
      const parsed = parseDayKey(dayKey)
      if (!parsed) continue

      const weekday = new Date(
        Date.UTC(parsed.year, parsed.month - 1, parsed.day),
      ).getUTCDay()
      const weekdayIndex = (weekday + 6) % 7
      const weekdayLabel = weekdayLabels[weekdayIndex] ?? weekdayLabels[0]
      if (weekdayLabel === undefined) continue
      const weekdayValues = valuesByModelAndDay[weekdayLabel]
      if (weekdayValues === undefined) continue

      for (const [hourKey, aggregate] of Object.entries(hourly)) {
        weekdayValues[hourKey] =
          (weekdayValues[hourKey] ?? 0) + (aggregate.totalTokens ?? 0)
      }
    }

    return buildHeatmapOption({
      dayKeys: hours,
      modelNames: weekdayLabels,
      valuesByModelAndDay,
      seriesLabel: t("charts.usageTimeHeatmap.series.tokens"),
    })
  }, [fusedHourlyForTokens, t])

  const latencyHistogramOption = useMemo(() => {
    if (!selectedLatencyAggregate) {
      return null
    }

    return buildLatencyHistogramOption({
      latency: selectedLatencyAggregate,
      seriesLabel: t("charts.latencyHistogram.series.count"),
    })
  }, [selectedLatencyAggregate, t])

  const latencyTrendOption = useMemo(() => {
    return buildLatencyTrendOption({
      dayKeys: dayKeysInRange,
      dailyLatency: latencyDailyForTokens,
      avgSeriesLabel: t("charts.latencyTrend.series.avg"),
      maxSeriesLabel: t("charts.latencyTrend.series.max"),
      slowSeriesLabel: t("charts.latencyTrend.series.slow"),
      secondsAxisLabel: t("charts.latencyTrend.axes.seconds"),
      slowCountAxisLabel: t("charts.latencyTrend.axes.slowCount"),
    })
  }, [dayKeysInRange, latencyDailyForTokens, t])

  const slowModelsOption = useMemo(() => {
    const categories = slowModelRows.map((row) => row.label)
    const values = slowModelRows.map((row) => row.slowCount)
    const valueLabel = t("charts.slowModels.series.slowCount")

    return breakdownChartTypeByKey.slowModels ===
      USAGE_ANALYTICS_CHART_TYPES.Pie
      ? buildPieOption({ categories, values, valueLabel })
      : buildHorizontalBarOption({ categories, values, valueLabel })
  }, [breakdownChartTypeByKey.slowModels, slowModelRows, t])

  const slowTokensOption = useMemo(() => {
    const categories = slowTokenRows.map((row) => row.label)
    const values = slowTokenRows.map((row) => row.slowCount)
    const valueLabel = t("charts.slowTokens.series.slowCount")

    return breakdownChartTypeByKey.slowTokens ===
      USAGE_ANALYTICS_CHART_TYPES.Pie
      ? buildPieOption({ categories, values, valueLabel })
      : buildHorizontalBarOption({ categories, values, valueLabel })
  }, [breakdownChartTypeByKey.slowTokens, slowTokenRows, t])
  useEffect(() => {
    if (!focusModelName || focusModelName === t("charts.other")) {
      return
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        fusedDailyByModelForTokens,
        focusModelName,
      )
    ) {
      setFocusModelName(null)
    }
  }, [focusModelName, fusedDailyByModelForTokens, t])

  const handleDailyDataZoom = useCallback(
    (event: unknown) => {
      // ECharts dataZoom events may carry category indices or axis values depending
      // on configuration; normalize to `YYYY-MM-DD` day keys and update the filter.
      const chartEvent = event as UsageChartEvent | undefined
      const payload = Array.isArray(chartEvent?.batch)
        ? chartEvent.batch[0]
        : chartEvent

      const startValue = payload?.startValue
      const endValue = payload?.endValue

      const resolveDayKey = (value: unknown) => {
        if (typeof value === "string") return value
        if (typeof value === "number") {
          if (dayKeysInRange.length === 0) {
            return null
          }
          return dayKeysInRange[
            Math.max(0, Math.min(dayKeysInRange.length - 1, value))
          ]
        }
        return null
      }

      const nextStart = resolveDayKey(startValue)
      const nextEnd = resolveDayKey(endValue)

      if (!nextStart || !nextEnd) {
        return
      }

      const clampedStart =
        nextStart < minDay ? minDay : nextStart > maxDay ? maxDay : nextStart
      const clampedEnd =
        nextEnd < minDay ? minDay : nextEnd > maxDay ? maxDay : nextEnd

      const normalizedStart =
        clampedStart <= clampedEnd ? clampedStart : clampedEnd
      const normalizedEnd =
        clampedStart <= clampedEnd ? clampedEnd : clampedStart

      if (normalizedStart === startDay && normalizedEnd === endDay) {
        return
      }

      setStartDay(normalizedStart)
      setEndDay(normalizedEnd)
    },
    [dayKeysInRange, endDay, maxDay, minDay, setEndDay, setStartDay, startDay],
  )

  const handleDailyLegendSelectChanged = useCallback((event: unknown) => {
    const selected = (event as UsageChartEvent | undefined)?.selected
    if (selected && typeof selected === "object") {
      setDailyLegendSelected(selected as Record<string, boolean>)
    }
  }, [])

  const dailyChartEvents = useMemo(() => {
    return {
      datazoom: handleDailyDataZoom,
      legendselectchanged: handleDailyLegendSelectChanged,
    }
  }, [handleDailyDataZoom, handleDailyLegendSelectChanged])

  const handleModelDistributionClick = useCallback((event: unknown) => {
    // Click-to-focus a model name for related charts (e.g., heatmap + latency histogram).
    const chartEvent = event as UsageChartEvent | undefined
    const modelName =
      typeof chartEvent?.name === "string" ? String(chartEvent.name) : null
    if (!modelName) return

    setFocusModelName((current) => (current === modelName ? null : modelName))
  }, [])

  const modelDistributionEvents = useMemo(() => {
    return {
      click: handleModelDistributionClick,
    }
  }, [handleModelDistributionClick])

  return {
    focusModelName,
    setBreakdownChartType,
    selectionTotals,
    accountTotalsFullRows,
    recordedCosts,
    dailyCostChoices,
    selectedDailyCost,
    setDailyCostKey,
    dailyOverviewOption,
    modelDistributionOption,
    modelCostCharts,
    referenceModelCostChart,
    accountComparisonOption,
    heatmapOption,
    usageTimeHeatmapOption,
    latencyHistogramOption,
    latencyTrendOption,
    slowModelsOption,
    slowTokensOption,
    dailyChartEvents,
    modelDistributionEvents,
    breakdownChartTypeByKey,
  }
}
