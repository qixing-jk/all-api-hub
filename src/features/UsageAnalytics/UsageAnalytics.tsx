import { BarChart3, RefreshCw, Settings } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { EChart } from "~/components/charts/EChart"
import { OptionsPageSettingsTitleAction } from "~/components/OptionsPageSettingsTitleAction"
import { PageHeader } from "~/components/PageHeader"
import { SegmentedControl } from "~/components/SegmentedControl"
import {
  Alert,
  Button,
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  WorkflowTransitionButton,
} from "~/components/ui"
import { BASIC_SETTINGS_TAB_IDS } from "~/constants/basicSettingsTabs"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { ReportPreviewNotice } from "~/features/DevPanel/ReportPreviewNotice"
import { useReportPreview } from "~/features/DevPanel/useReportPreview"
import { createUsageAnalyticsPreview } from "~/features/UsageAnalytics/data/createUsageAnalyticsPreview"
import UsageAnalyticsFiltersCard from "~/features/UsageAnalytics/filtering/UsageAnalyticsFiltersCard"
import {
  USAGE_ANALYTICS_BREAKDOWN_CHART_KEYS,
  USAGE_ANALYTICS_CHART_TYPES,
} from "~/features/UsageAnalytics/types"
import { useUsageAnalyticsViewModel } from "~/features/UsageAnalytics/workspace/useUsageAnalyticsViewModel"
import { cn } from "~/lib/utils"
import { formatPriceCompact } from "~/services/models/utils/modelPricing"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { formatTokenCount } from "~/utils/core/formatters"
import { formatAssetAmount } from "~/utils/core/money"

import { USAGE_ANALYTICS_TEST_IDS } from "./testIds"

/**
 * Options page: usage-history charts and export.
 */
export default function UsageAnalytics() {
  const { scenario, data, exit } = useReportPreview(
    MENU_ITEM_IDS.USAGE_ANALYTICS,
    {
      title: "Usage Analytics previews",
      standard: "Dev: Preview USD usage costs",
      mixed: "Dev: Preview mixed usage costs",
    },
    createUsageAnalyticsPreview,
  )
  return (
    <UsageAnalyticsPage
      key={scenario ?? "saved"}
      preview={data}
      exitPreview={exit}
    />
  )
}

/** Keep preview selections isolated from the saved report. */
function UsageAnalyticsPage({
  preview,
  exitPreview,
}: {
  preview?: ReturnType<typeof createUsageAnalyticsPreview>
  exitPreview: () => void
}) {
  const { t, i18n } = useTranslation("usageAnalytics")
  const chartTypeOptions = [
    {
      value: USAGE_ANALYTICS_CHART_TYPES.Pie,
      label: t("charts.common.chartType.pie"),
    },
    {
      value: USAGE_ANALYTICS_CHART_TYPES.Bar,
      label: t("charts.common.chartType.histogram"),
    },
  ] as const
  const {
    data,
    filters,
    charts,
    currencyType,
    referenceCost,
    handleExport,
    showNoDataState,
    handleOpenAccountUsageSettings,
  } = useUsageAnalyticsViewModel(preview)
  const { store, isLoading, loadData, loadError, hasLoadedData } = data
  const initialLoadFailed = Boolean(loadError) && !hasLoadedData
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
    availableDayKeys,
    minDay,
    maxDay,
    exportPreview,
  } = filters
  const {
    focusModelName,
    setBreakdownChartType,
    selectionTotals,
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
  } = charts
  const [modelCostKey, setModelCostKey] = useState<string>()
  const modelCostChoices = referenceModelCostChart
    ? [...modelCostCharts, referenceModelCostChart]
    : modelCostCharts
  const selectedModelCost =
    modelCostChoices.find(({ key }) => key === modelCostKey) ??
    modelCostChoices[0]
  const costSharesUnavailable = selectedModelCost?.hasShares === false

  const headerSurface =
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsUsageAnalyticsHeader

  return (
    <div
      className="space-y-density-6 px-4 py-density-4 sm:px-6 sm:py-density-6"
      data-testid={USAGE_ANALYTICS_TEST_IDS.page}
      data-options-page-pending={
        (isLoading && !store) ||
        (availableDayKeys.length > 0 && (!startDay || !endDay))
          ? ""
          : undefined
      }
    >
      <PageHeader
        icon={BarChart3}
        title={t("title")}
        titleActions={
          <OptionsPageSettingsTitleAction
            tabId={BASIC_SETTINGS_TAB_IDS.AccountUsage}
            anchor={SETTINGS_ANCHORS.USAGE_HISTORY_SYNC}
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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-density-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={Boolean(preview)}
                onClick={() => void loadData({ trackAnalytics: true })}
                leftIcon={<RefreshCw className="h-4 w-4" />}
              >
                {t("actions.refresh")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleExport()}
                disabled={initialLoadFailed || Boolean(preview)}
              >
                {t("actions.export")}
              </Button>
            </div>
          </ProductAnalyticsScope>
        }
      />

      {preview && <ReportPreviewNotice exit={exitPreview} />}

      {loadError && (
        <Alert
          variant={hasLoadedData ? "warning" : "destructive"}
          title={t("messages.error.loadTitle")}
          description={
            hasLoadedData
              ? t("messages.error.lastLoadedDescription")
              : t("messages.error.loadDescription")
          }
          action={
            <Button
              size="sm"
              variant="outline"
              disabled={isLoading}
              aria-busy={isLoading}
              onClick={() => void loadData({ trackAnalytics: true })}
            >
              {t("common:actions.retry")}
            </Button>
          }
        />
      )}

      {!initialLoadFailed && (
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
      )}

      {/* summary card*/}
      {exportPreview ? (
        <Card padding="md" className="space-y-density-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-density-3 sm:grid-cols-4">
            <div className="space-y-density-1">
              <div className="text-xs text-muted-foreground">
                {t("summary.promptTokens")}
              </div>
              <div className="text-lg font-semibold">
                {formatTokenCount(selectionTotals.promptTokens)}
              </div>
            </div>
            <div className="space-y-density-1">
              <div className="text-xs text-muted-foreground">
                {t("summary.completionTokens")}
              </div>
              <div className="text-lg font-semibold">
                {formatTokenCount(selectionTotals.completionTokens)}
              </div>
            </div>
            <div className="space-y-density-1">
              <div className="text-xs text-muted-foreground">
                {t("summary.totalTokens")}
              </div>
              <div className="text-lg font-semibold">
                {formatTokenCount(selectionTotals.totalTokens)}
              </div>
            </div>
            <div className="space-y-density-1">
              <div className="text-xs text-muted-foreground">
                {t("summary.requests")}
              </div>
              <div className="text-lg font-semibold">
                {formatTokenCount(selectionTotals.requests)}
              </div>
            </div>
          </div>
          <div
            className={cn(
              "grid gap-x-6 gap-y-density-3 border-t border-border pt-density-3",
              recordedCosts.length > 0 &&
                referenceCost !== undefined &&
                "sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
            )}
          >
            {(recordedCosts.length > 0 || referenceCost === undefined) && (
              <section
                aria-label={t("summary.cost")}
                className="min-w-0 space-y-density-1"
              >
                <h2 className="text-xs font-medium text-muted-foreground">
                  {t("summary.cost")}
                </h2>
                {recordedCosts.length ? (
                  <ul className="flex flex-wrap gap-x-6 gap-y-density-1 text-lg font-semibold tabular-nums">
                    {recordedCosts.map(({ key, amount }) => (
                      <li
                        key={key}
                        className="min-w-0 [overflow-wrap:anywhere]"
                      >
                        {formatAssetAmount(amount, i18n.language)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("summary.unpriced")}
                  </p>
                )}
                {recordedCosts.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("summary.partial")}
                  </p>
                )}
              </section>
            )}
            {referenceCost !== undefined && (
              <section
                aria-label={t("summary.referenceCost")}
                className={cn(
                  "min-w-0 space-y-density-1",
                  recordedCosts.length > 0 &&
                    "border-t border-border pt-density-3 sm:border-s sm:border-t-0 sm:ps-6 sm:pt-0",
                )}
              >
                <h2 className="text-xs font-medium text-muted-foreground">
                  {t("summary.referenceCost")}
                </h2>
                <p className="text-lg font-semibold tabular-nums">
                  {formatPriceCompact(referenceCost, currencyType)}
                </p>
                {recordedCosts.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("summary.referenceHint")}
                  </p>
                )}
              </section>
            )}
          </div>
        </Card>
      ) : null}

      {initialLoadFailed ? null : showNoDataState ? (
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
              <div className="text-sm text-muted-foreground">
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
          <Card
            padding="md"
            data-testid={USAGE_ANALYTICS_TEST_IDS.chartsSection}
          >
            <div className="mb-density-4 flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-density-1">
                <div className="text-sm font-medium">
                  {t("charts.dailyOverview.title")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("charts.dailyOverview.description")}
                </div>
              </div>
              <UsageCostSelect
                label={t("charts.common.costUnit")}
                options={dailyCostChoices}
                value={selectedDailyCost?.key}
                onChange={setDailyCostKey}
              />
            </div>

            <div className="h-80 w-full">
              <EChart
                option={dailyOverviewOption}
                onEvents={dailyChartEvents}
              />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-x-6 gap-y-density-6 lg:grid-cols-2">
            <Card padding="md">
              <div className="mb-density-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-density-3">
                <div className="min-w-0 space-y-density-1">
                  <div className="text-sm font-medium">
                    {t("charts.modelDistribution.title")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("charts.modelDistribution.description")}
                  </div>
                </div>
                <SegmentedControl
                  layout="fit"
                  className="shrink-0 [&_button]:whitespace-nowrap"
                  size="sm"
                  options={chartTypeOptions}
                  value={breakdownChartTypeByKey.modelDistribution}
                  onValueChange={(value) =>
                    setBreakdownChartType(
                      USAGE_ANALYTICS_BREAKDOWN_CHART_KEYS.ModelDistribution,
                      value,
                    )
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
              <div className="mb-density-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-density-3">
                <div className="min-w-0 space-y-density-1">
                  <div className="text-sm font-medium">
                    {t("charts.modelCostDistribution.title")}
                  </div>
                  {modelCostCharts.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {t("charts.modelCostDistribution.description")}
                    </div>
                  )}
                </div>
                {(modelCostCharts.length > 0 || referenceModelCostChart) && (
                  <SegmentedControl
                    layout="fit"
                    className="shrink-0 [&_button]:whitespace-nowrap"
                    size="sm"
                    options={
                      costSharesUnavailable
                        ? chartTypeOptions.map((option) => ({
                            ...option,
                            disabled:
                              option.value === USAGE_ANALYTICS_CHART_TYPES.Pie,
                          }))
                        : chartTypeOptions
                    }
                    value={
                      costSharesUnavailable
                        ? USAGE_ANALYTICS_CHART_TYPES.Bar
                        : breakdownChartTypeByKey.modelCostDistribution
                    }
                    onValueChange={(value) =>
                      setBreakdownChartType(
                        USAGE_ANALYTICS_BREAKDOWN_CHART_KEYS.ModelCostDistribution,
                        value,
                      )
                    }
                    aria-label={t("charts.common.chartType.ariaLabel")}
                  />
                )}
              </div>

              {selectedModelCost ? (
                <>
                  <UsageCostSelect
                    label={t("charts.common.costUnit")}
                    options={modelCostChoices}
                    value={selectedModelCost.key}
                    onChange={setModelCostKey}
                  />
                  <div className="mt-density-3 h-80 w-full">
                    <EChart
                      option={selectedModelCost.option}
                      onEvents={modelDistributionEvents}
                    />
                  </div>
                </>
              ) : (
                <div className="flex h-80 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  {t("charts.modelCostDistribution.unavailable")}
                </div>
              )}
            </Card>

            <Card padding="md">
              <div className="mb-density-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-density-3">
                <div className="min-w-0 space-y-density-1">
                  <div className="text-sm font-medium">
                    {t("charts.accountComparison.title")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("charts.accountComparison.description")}
                  </div>
                </div>
                <SegmentedControl
                  layout="fit"
                  className="shrink-0 [&_button]:whitespace-nowrap"
                  size="sm"
                  options={chartTypeOptions}
                  value={breakdownChartTypeByKey.accountComparison}
                  onValueChange={(value) =>
                    setBreakdownChartType(
                      USAGE_ANALYTICS_BREAKDOWN_CHART_KEYS.AccountComparison,
                      value,
                    )
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
              <div className="text-xs text-muted-foreground">
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
              <div className="text-xs text-muted-foreground">
                {t("charts.modelHeatmap.description")}
              </div>
            </div>

            <div className="h-[420px] w-full">
              <EChart option={heatmapOption} />
            </div>
          </Card>

          <div
            className="grid grid-cols-1 gap-x-6 gap-y-density-6 lg:grid-cols-2"
            data-testid={USAGE_ANALYTICS_TEST_IDS.latencySection}
          >
            <Card padding="md">
              <div className="mb-density-4 space-y-density-1">
                <div className="text-sm font-medium">
                  {t("charts.latencyHistogram.title")}
                  {focusModelName && focusModelName !== t("charts.other")
                    ? ` · ${focusModelName}`
                    : ""}
                </div>
                <div className="text-xs text-muted-foreground">
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
                <div className="text-xs text-muted-foreground">
                  {t("charts.latencyTrend.description")}
                </div>
              </div>

              <div className="h-80 w-full">
                <EChart option={latencyTrendOption} />
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-x-6 gap-y-density-6 lg:grid-cols-2">
            <Card padding="md">
              <div className="mb-density-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-density-3">
                <div className="min-w-0 space-y-density-1">
                  <div className="text-sm font-medium">
                    {t("charts.slowModels.title")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("charts.slowModels.description")}
                  </div>
                </div>
                <SegmentedControl
                  layout="fit"
                  className="shrink-0 [&_button]:whitespace-nowrap"
                  size="sm"
                  options={chartTypeOptions}
                  value={breakdownChartTypeByKey.slowModels}
                  onValueChange={(value) =>
                    setBreakdownChartType(
                      USAGE_ANALYTICS_BREAKDOWN_CHART_KEYS.SlowModels,
                      value,
                    )
                  }
                  aria-label={t("charts.common.chartType.ariaLabel")}
                />
              </div>

              <div className="h-80 w-full">
                <EChart option={slowModelsOption} />
              </div>
            </Card>

            <Card padding="md">
              <div className="mb-density-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-density-3">
                <div className="min-w-0 space-y-density-1">
                  <div className="text-sm font-medium">
                    {t("charts.slowTokens.title")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("charts.slowTokens.description")}
                  </div>
                </div>
                <SegmentedControl
                  layout="fit"
                  className="shrink-0 [&_button]:whitespace-nowrap"
                  size="sm"
                  options={chartTypeOptions}
                  value={breakdownChartTypeByKey.slowTokens}
                  onValueChange={(value) =>
                    setBreakdownChartType(
                      USAGE_ANALYTICS_BREAKDOWN_CHART_KEYS.SlowTokens,
                      value,
                    )
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

/** Keep the unit visible even when there is only one cost series. */
function UsageCostSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { key: string; label: string }[]
  value?: string
  onChange: (key: string) => void
}) {
  if (options.length < 2)
    return options[0] ? (
      <div className="text-xs text-muted-foreground">{options[0].label}</div>
    ) : null
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} size="sm" className="w-fit max-w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map(({ key, label }) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
