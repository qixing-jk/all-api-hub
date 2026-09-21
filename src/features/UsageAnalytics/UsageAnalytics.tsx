import { BarChart3, RefreshCcw, Settings } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { EChart } from "~/components/charts/EChart"
import { OptionsPageSettingsTitleAction } from "~/components/OptionsPageSettingsTitleAction"
import { PageHeader } from "~/components/PageHeader"
import { SegmentedControl } from "~/components/SegmentedControl"
import { Button, Card, WorkflowTransitionButton } from "~/components/ui"
import { DEFAULT_USD_TO_CNY_RATE, QUOTA_PER_USD } from "~/constants/money"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { formatPriceCompact } from "~/services/models/utils/modelPricing"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { parseDayKey } from "~/utils/core/dayKey"
import { formatTokenCount } from "~/utils/core/formatters"
import { pushWithinOptionsPage } from "~/utils/navigation"

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
} from "./charts/echartsOptions"
import UsageAnalyticsFiltersCard from "./components/UsageAnalyticsFiltersCard"
import { useUsageAnalyticsData } from "./hooks/useUsageAnalyticsData"
import { useUsageAnalyticsExport } from "./hooks/useUsageAnalyticsExport"
import { useUsageAnalyticsFilters } from "./hooks/useUsageAnalyticsFilters"
import { USAGE_ANALYTICS_TEST_IDS } from "./testIds"
import type {
  UsageAnalyticsBreakdownChartKey,
  UsageAnalyticsChartDisplayType,
} from "./types"

/**
 * Options page: usage-history charts and export.
 */
export default function UsageAnalytics() {
  const { t } = useTranslation("usageAnalytics")
  const chartTypeOptions = [
    { value: "pie", label: t("charts.common.chartType.pie") },
    { value: "bar", label: t("charts.common.chartType.histogram") },
  ] as const
  const { currencyType } = useUserPreferencesContext()

  const { enabledAccounts, disabledAccountIdSet, store, isLoading, loadData } =
    useUsageAnalyticsData()

  const {
    selectedSiteAccountIds,
    setSelectedSiteAccountIds,
    selectedAccountIds,
    setSelectedAccountIds,
    selectedTokenIds,
    setSelectedTokenIds,
    startDay,
    setStartDay,
    endDay,
    setEndDay,
    siteOptions,
    accountOptions,
    accountsForSelectedSites,
    tokenOptions,
    accountLabels,
    availableDayKeys,
    minDay,
    maxDay,
    exportSelection,
    exportPreview,
    dayKeysInRange,
  } = useUsageAnalyticsFilters({
    enabledAccounts,
    store,
    disabledAccountIdSet,
    isLoading,
  })

  const { handleExport } = useUsageAnalyticsExport({ store, exportSelection })

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

  const fusedDailyForTokens = useMemo(() => {
    if (!exportPreview) return {}
    return resolveFusedDailyForTokens(exportPreview, selectedTokenIds)
  }, [exportPreview, selectedTokenIds])

  const fusedHourlyForTokens = useMemo(() => {
    if (!exportPreview) return {}
    return resolveFusedHourlyForTokens(exportPreview, selectedTokenIds)
  }, [exportPreview, selectedTokenIds])

  const fusedDailyByModelForTokens = useMemo(() => {
    if (!exportPreview) return {}
    return resolveFusedDailyByModelForTokens(exportPreview, selectedTokenIds)
  }, [exportPreview, selectedTokenIds])

  const modelTotalsRows = useMemo(() => {
    if (!exportPreview) return []
    return getModelTotalsRows({
      exportData: exportPreview,
      tokenIds: selectedTokenIds,
      topN: 12,
      otherLabel: t("charts.other"),
    })
  }, [exportPreview, selectedTokenIds, t])

  const accountTotalsFullRows = useMemo(() => {
    if (!exportPreview) return []
    return getAccountTotalsRows({
      exportData: exportPreview,
      tokenIds: selectedTokenIds,
      accountLabels,
    })
  }, [accountLabels, exportPreview, selectedTokenIds])

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

  const slowModelRows = useMemo(() => {
    if (!exportPreview) return []
    return getSlowModelRows({
      exportData: exportPreview,
      tokenIds: selectedTokenIds,
      topN: 12,
      otherLabel: t("charts.other"),
    })
  }, [exportPreview, selectedTokenIds, t])

  const slowTokenRows = useMemo(() => {
    if (!exportPreview) return []
    return getSlowTokenRows({
      exportData: exportPreview,
      tokenIds: selectedTokenIds,
      topN: 12,
      otherLabel: t("charts.other"),
      unknownLabel: t("filters.unknownToken"),
    })
  }, [exportPreview, selectedTokenIds, t])

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

  const latencyDailyForTokens = useMemo(() => {
    if (!exportPreview) return {}
    return resolveLatencyDailyForTokens(exportPreview, selectedTokenIds)
  }, [exportPreview, selectedTokenIds])

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
  const showNoDataState =
    !isLoading && (!store || availableDayKeys.length === 0)

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

  /**
   * Navigate to the account usage settings tab (usage-history sync controls).
   */
  const handleOpenAccountUsageSettings = useCallback(() => {
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.BASIC}`, {
      tab: "accountUsage",
      anchor: "usage-history-sync",
    })
  }, [])

  const headerSurface =
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsUsageAnalyticsHeader

  return (
    <div
      className="space-y-density-6 py-density-6 px-6"
      data-testid={USAGE_ANALYTICS_TEST_IDS.page}
    >
      <PageHeader
        icon={BarChart3}
        title={t("title")}
        titleActions={
          <OptionsPageSettingsTitleAction
            tabId="accountUsage"
            anchor="usage-history-sync"
            label={t("actions.openAccountUsageSettings")}
            analyticsAction={{
              featureId: PRODUCT_ANALYTICS_FEATURE_IDS.UsageAnalytics,
              actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenUsageSyncSettings,
              surfaceId: headerSurface,
              entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
            }}
          />
        }
        description={t("description")}
        actions={
          <ProductAnalyticsScope
            entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
            featureId={PRODUCT_ANALYTICS_FEATURE_IDS.UsageAnalytics}
            surfaceId={headerSurface}
          >
            <div className="gap-y-density-2 flex flex-wrap items-center gap-x-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void loadData({ trackAnalytics: true })}
                leftIcon={<RefreshCcw className="h-4 w-4" />}
              >
                {t("actions.refresh")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleExport()}
              >
                {t("actions.export")}
              </Button>
            </div>
          </ProductAnalyticsScope>
        }
      />

      <UsageAnalyticsFiltersCard
        siteOptions={siteOptions}
        selectedSiteIds={selectedSiteAccountIds}
        onSiteChange={setSelectedSiteAccountIds}
        accountOptions={accountOptions}
        selectedAccountIds={selectedAccountIds}
        onAccountChange={setSelectedAccountIds}
        isAccountFilterDisabled={accountsForSelectedSites.length === 0}
        tokenOptions={tokenOptions}
        selectedTokenIds={selectedTokenIds}
        onTokenChange={setSelectedTokenIds}
        startDay={startDay}
        endDay={endDay}
        minDay={minDay}
        maxDay={maxDay}
        onStartDayChange={setStartDay}
        onEndDayChange={setEndDay}
      />

      {/* summary card*/}
      {exportPreview ? (
        <Card padding="md">
          <div className="gap-y-density-4 grid grid-cols-2 gap-x-4 md:grid-cols-5">
            <div className="space-y-density-1">
              <div className="text-muted-foreground text-xs">
                {t("summary.promptTokens")}
              </div>
              <div className="text-lg font-semibold">
                {formatTokenCount(selectionTotals.promptTokens)}
              </div>
            </div>
            <div className="space-y-density-1">
              <div className="text-muted-foreground text-xs">
                {t("summary.completionTokens")}
              </div>
              <div className="text-lg font-semibold">
                {formatTokenCount(selectionTotals.completionTokens)}
              </div>
            </div>
            <div className="space-y-density-1">
              <div className="text-muted-foreground text-xs">
                {t("summary.totalTokens")}
              </div>
              <div className="text-lg font-semibold">
                {formatTokenCount(selectionTotals.totalTokens)}
              </div>
            </div>
            <div className="space-y-density-1">
              <div className="text-muted-foreground text-xs">
                {t("summary.requests")}
              </div>
              <div className="text-lg font-semibold">
                {formatTokenCount(selectionTotals.requests)}
              </div>
            </div>
            <div className="space-y-density-1">
              <div className="text-muted-foreground text-xs">
                {t("summary.cost")}
              </div>
              <div className="text-lg font-semibold">
                {formatPriceCompact(selectionCost, currencyType)}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {showNoDataState ? (
        <ProductAnalyticsScope
          entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
          featureId={PRODUCT_ANALYTICS_FEATURE_IDS.UsageAnalytics}
          surfaceId={
            PRODUCT_ANALYTICS_SURFACE_IDS.OptionsUsageAnalyticsEmptyState
          }
        >
          <Card padding="md">
            <div className="space-y-density-2">
              <div className="text-sm font-medium">{t("empty.title")}</div>
              <div className="text-muted-foreground text-sm">
                {t("empty.description")}
              </div>
              {/* Quick navigation so users can enable sync immediately. */}
              <div className="pt-density-1">
                <WorkflowTransitionButton
                  size="sm"
                  variant="outline"
                  onClick={handleOpenAccountUsageSettings}
                  leftIcon={<Settings className="h-4 w-4" />}
                  analyticsAction={
                    PRODUCT_ANALYTICS_ACTION_IDS.OpenUsageSyncSettings
                  }
                >
                  {t("actions.openAccountUsageSettings")}
                </WorkflowTransitionButton>
              </div>
            </div>
          </Card>
        </ProductAnalyticsScope>
      ) : (
        <>
          {/*Daily Overview*/}
          <Card padding="md">
            <div className="mb-density-4 space-y-density-1">
              <div className="text-sm font-medium">
                {t("charts.dailyOverview.title")}
              </div>
              <div className="text-muted-foreground text-xs">
                {t("charts.dailyOverview.description")}
              </div>
            </div>

            <div className="h-80 w-full">
              <EChart
                option={dailyOverviewOption}
                onEvents={dailyChartEvents}
              />
            </div>
          </Card>

          <div className="gap-y-density-6 grid grid-cols-1 gap-x-6 lg:grid-cols-2">
            <Card padding="md">
              <div className="mb-density-4 gap-y-density-3 flex items-start justify-between gap-x-3">
                <div className="space-y-density-1 min-w-0">
                  <div className="text-sm font-medium">
                    {t("charts.modelDistribution.title")}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t("charts.modelDistribution.description")}
                  </div>
                </div>
                <SegmentedControl
                  layout="fit"
                  size="sm"
                  options={chartTypeOptions}
                  value={breakdownChartTypeByKey.modelDistribution}
                  onValueChange={(value) =>
                    setBreakdownChartType("modelDistribution", value)
                  }
                  aria-label={t("charts.common.chartType.ariaLabel")}
                />
              </div>

              <div className="h-80 w-full">
                <EChart
                  option={modelDistributionOption}
                  onEvents={modelDistributionEvents}
                />
              </div>
            </Card>

            <Card padding="md">
              <div className="mb-density-4 gap-y-density-3 flex items-start justify-between gap-x-3">
                <div className="space-y-density-1 min-w-0">
                  <div className="text-sm font-medium">
                    {t("charts.modelCostDistribution.title")}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t("charts.modelCostDistribution.description")}
                  </div>
                </div>
                <SegmentedControl
                  layout="fit"
                  size="sm"
                  options={chartTypeOptions}
                  value={breakdownChartTypeByKey.modelCostDistribution}
                  onValueChange={(value) =>
                    setBreakdownChartType("modelCostDistribution", value)
                  }
                  aria-label={t("charts.common.chartType.ariaLabel")}
                />
              </div>

              <div className="h-80 w-full">
                <EChart
                  option={modelCostDistributionOption}
                  onEvents={modelDistributionEvents}
                />
              </div>
            </Card>

            <Card padding="md">
              <div className="mb-density-4 gap-y-density-3 flex items-start justify-between gap-x-3">
                <div className="space-y-density-1 min-w-0">
                  <div className="text-sm font-medium">
                    {t("charts.accountComparison.title")}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t("charts.accountComparison.description")}
                  </div>
                </div>
                <SegmentedControl
                  layout="fit"
                  size="sm"
                  options={chartTypeOptions}
                  value={breakdownChartTypeByKey.accountComparison}
                  onValueChange={(value) =>
                    setBreakdownChartType("accountComparison", value)
                  }
                  aria-label={t("charts.common.chartType.ariaLabel")}
                />
              </div>

              <div className="h-80 w-full">
                <EChart option={accountComparisonOption} />
              </div>
            </Card>
          </div>

          <Card padding="md">
            <div className="mb-density-4 space-y-density-1">
              <div className="text-sm font-medium">
                {t("charts.usageTimeHeatmap.title")}
              </div>
              <div className="text-muted-foreground text-xs">
                {t("charts.usageTimeHeatmap.description")}
              </div>
            </div>

            <div className="h-[360px] w-full">
              <EChart option={usageTimeHeatmapOption} />
            </div>
          </Card>

          <Card padding="md">
            <div className="mb-density-4 space-y-density-1">
              <div className="text-sm font-medium">
                {t("charts.modelHeatmap.title")}
              </div>
              <div className="text-muted-foreground text-xs">
                {t("charts.modelHeatmap.description")}
              </div>
            </div>

            <div className="h-[420px] w-full">
              <EChart option={heatmapOption} />
            </div>
          </Card>

          <div className="gap-y-density-6 grid grid-cols-1 gap-x-6 lg:grid-cols-2">
            <Card padding="md">
              <div className="mb-density-4 space-y-density-1">
                <div className="text-sm font-medium">
                  {t("charts.latencyHistogram.title")}
                  {focusModelName && focusModelName !== t("charts.other")
                    ? ` · ${focusModelName}`
                    : ""}
                </div>
                <div className="text-muted-foreground text-xs">
                  {t("charts.latencyHistogram.description")}
                </div>
              </div>

              <div className="h-80 w-full">
                {latencyHistogramOption ? (
                  <EChart option={latencyHistogramOption} />
                ) : null}
              </div>
            </Card>

            <Card padding="md">
              <div className="mb-density-4 space-y-density-1">
                <div className="text-sm font-medium">
                  {t("charts.latencyTrend.title")}
                </div>
                <div className="text-muted-foreground text-xs">
                  {t("charts.latencyTrend.description")}
                </div>
              </div>

              <div className="h-80 w-full">
                <EChart option={latencyTrendOption} />
              </div>
            </Card>
          </div>

          <div className="gap-y-density-6 grid grid-cols-1 gap-x-6 lg:grid-cols-2">
            <Card padding="md">
              <div className="mb-density-4 gap-y-density-3 flex items-start justify-between gap-x-3">
                <div className="space-y-density-1 min-w-0">
                  <div className="text-sm font-medium">
                    {t("charts.slowModels.title")}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t("charts.slowModels.description")}
                  </div>
                </div>
                <SegmentedControl
                  layout="fit"
                  size="sm"
                  options={chartTypeOptions}
                  value={breakdownChartTypeByKey.slowModels}
                  onValueChange={(value) =>
                    setBreakdownChartType("slowModels", value)
                  }
                  aria-label={t("charts.common.chartType.ariaLabel")}
                />
              </div>

              <div className="h-80 w-full">
                <EChart option={slowModelsOption} />
              </div>
            </Card>

            <Card padding="md">
              <div className="mb-density-4 gap-y-density-3 flex items-start justify-between gap-x-3">
                <div className="space-y-density-1 min-w-0">
                  <div className="text-sm font-medium">
                    {t("charts.slowTokens.title")}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t("charts.slowTokens.description")}
                  </div>
                </div>
                <SegmentedControl
                  layout="fit"
                  size="sm"
                  options={chartTypeOptions}
                  value={breakdownChartTypeByKey.slowTokens}
                  onValueChange={(value) =>
                    setBreakdownChartType("slowTokens", value)
                  }
                  aria-label={t("charts.common.chartType.ariaLabel")}
                />
              </div>

              <div className="h-80 w-full">
                <EChart option={slowTokensOption} />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
