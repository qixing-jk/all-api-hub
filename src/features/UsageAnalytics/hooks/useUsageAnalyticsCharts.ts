import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { DEFAULT_USD_TO_CNY_RATE, QUOTA_PER_USD } from "~/constants/money"
import {
  buildDailyOverviewOption,
  buildHeatmapOption,
  buildHorizontalBarOption,
  buildLatencyHistogramOption,
  buildLatencyTrendOption,
  buildPieOption,
} from "~/features/UsageAnalytics/charts/echartsOptions"
import type { useUsageAnalyticsFilters } from "~/features/UsageAnalytics/hooks/useUsageAnalyticsFilters"
import type {
  UsageAnalyticsBreakdownChartKey,
  UsageAnalyticsChartDisplayType,
} from "~/features/UsageAnalytics/types"
import {
  resolveLatencyAggregateForSelection,
  resolveUsageSelection,
  topNWithOther,
} from "~/features/UsageAnalytics/usageSelection"
import type { CurrencyType, SiteAccount } from "~/types"
import { parseDayKey } from "~/utils/core/dayKey"

interface UsageAnalyticsChartsInput {
  enabledAccounts: SiteAccount[]
  currencyType: CurrencyType
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

/** Owns chart projections and the click, legend, and date-zoom interactions. */
export function useUsageAnalyticsCharts({
  enabledAccounts,
  currencyType,
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
    slowModels: "pie",
    slowTokens: "pie",
    accountComparison: "pie",
    modelDistribution: "pie",
    modelCostDistribution: "pie",
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
        totals.quotaConsumed += aggregate.quotaConsumed
        return totals
      },
      {
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        quotaConsumed: 0,
      },
    )
  }, [fusedDailyForTokens])

  const selectionCost = useMemo(() => {
    const conversionFactor = QUOTA_PER_USD
    const totalQuotaConsumed = accountTotalsFullRows.reduce(
      (sum, row) => sum + row.quotaConsumed,
      0,
    )

    const usd = totalQuotaConsumed / conversionFactor

    if (currencyType === "USD") {
      return usd
    }

    const exchangeRateByAccountId = new Map(
      enabledAccounts.map(
        (account) => [account.id, account.exchange_rate] as const,
      ),
    )

    return accountTotalsFullRows.reduce((sum, row) => {
      const exchangeRate =
        exchangeRateByAccountId.get(row.accountId) ?? DEFAULT_USD_TO_CNY_RATE
      return sum + (row.quotaConsumed / conversionFactor) * exchangeRate
    }, 0)
  }, [accountTotalsFullRows, currencyType, enabledAccounts])

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
      quotaSeriesLabel: t("charts.dailyOverview.series.quota"),
    }
  }, [t])

  const dailyOverviewOption = useMemo(() => {
    return buildDailyOverviewOption({
      dayKeys: dayKeysInRange,
      daily: fusedDailyForTokens,
      ...dailyLegendLabels,
      legendSelected: dailyLegendSelected,
    })
  }, [
    dailyLegendLabels,
    dailyLegendSelected,
    dayKeysInRange,
    fusedDailyForTokens,
  ])

  const modelDistributionOption = useMemo(() => {
    const categories = modelTotalsRows.map((row) => row.modelName)
    const values = modelTotalsRows.map((row) => row.totalTokens)
    const valueLabel = t("charts.modelDistribution.series.tokens")

    return breakdownChartTypeByKey.modelDistribution === "pie"
      ? buildPieOption({ categories, values, valueLabel })
      : buildHorizontalBarOption({ categories, values, valueLabel })
  }, [breakdownChartTypeByKey.modelDistribution, modelTotalsRows, t])

  const modelCostDistributionOption = useMemo(() => {
    const conversionFactor = QUOTA_PER_USD
    const categories = modelTotalsRows.map((row) => row.modelName)
    const values = modelTotalsRows.map(
      (row) => row.quotaConsumed / conversionFactor,
    )
    const valueLabel = t("charts.modelCostDistribution.series.usd")

    return breakdownChartTypeByKey.modelCostDistribution === "pie"
      ? buildPieOption({ categories, values, valueLabel })
      : buildHorizontalBarOption({ categories, values, valueLabel })
  }, [breakdownChartTypeByKey.modelCostDistribution, modelTotalsRows, t])

  const accountComparisonOption = useMemo(() => {
    const categories = accountTotalsRows.map((row) => row.key)
    const values = accountTotalsRows.map((row) => row.value)
    const valueLabel = t("charts.accountComparison.series.tokens")

    return breakdownChartTypeByKey.accountComparison === "pie"
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

    return breakdownChartTypeByKey.slowModels === "pie"
      ? buildPieOption({ categories, values, valueLabel })
      : buildHorizontalBarOption({ categories, values, valueLabel })
  }, [breakdownChartTypeByKey.slowModels, slowModelRows, t])

  const slowTokensOption = useMemo(() => {
    const categories = slowTokenRows.map((row) => row.label)
    const values = slowTokenRows.map((row) => row.slowCount)
    const valueLabel = t("charts.slowTokens.series.slowCount")

    return breakdownChartTypeByKey.slowTokens === "pie"
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
      const payload = Array.isArray((event as any)?.batch)
        ? (event as any).batch[0]
        : (event as any)

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
    const selected = (event as any)?.selected
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
    const modelName =
      typeof (event as any)?.name === "string"
        ? String((event as any).name)
        : null
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
    selectionCost,
    dailyOverviewOption,
    modelDistributionOption,
    modelCostDistributionOption,
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
