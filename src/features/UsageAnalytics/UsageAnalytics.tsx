import { BarChart3, RefreshCcw, Settings } from "lucide-react"
import { useTranslation } from "react-i18next"

import { EChart } from "~/components/charts/EChart"
import { OptionsPageSettingsTitleAction } from "~/components/OptionsPageSettingsTitleAction"
import { PageHeader } from "~/components/PageHeader"
import { SegmentedControl } from "~/components/SegmentedControl"
import { Button, Card, WorkflowTransitionButton } from "~/components/ui"
import { BASIC_SETTINGS_TAB_IDS } from "~/constants/basicSettingsTabs"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import UsageAnalyticsFiltersCard from "~/features/UsageAnalytics/filtering/UsageAnalyticsFiltersCard"
import { useUsageAnalyticsViewModel } from "~/features/UsageAnalytics/workspace/useUsageAnalyticsViewModel"
import { formatPriceCompact } from "~/services/models/utils/modelPricing"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { formatTokenCount } from "~/utils/core/formatters"

import { USAGE_ANALYTICS_TEST_IDS } from "./testIds"

/**
 * Options page: usage-history charts and export.
 */
export default function UsageAnalytics() {
  const { t } = useTranslation("usageAnalytics")
  const chartTypeOptions = [
    { value: "pie", label: t("charts.common.chartType.pie") },
    { value: "bar", label: t("charts.common.chartType.histogram") },
  ] as const
  const {
    data,
    filters,
    charts,
    currencyType,
    handleExport,
    showNoDataState,
    handleOpenAccountUsageSettings,
  } = useUsageAnalyticsViewModel()
  const { store, isLoading, loadData } = data
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
  } = charts

  const headerSurface =
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsUsageAnalyticsHeader

  return (
    <div
      className="space-y-density-6 py-density-4 sm:py-density-6 px-4 sm:px-6"
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
