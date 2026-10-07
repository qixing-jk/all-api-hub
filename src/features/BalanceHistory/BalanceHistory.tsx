import {
  ChevronDown,
  LineChart,
  RefreshCcw,
  Scissors,
  Settings,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { EChart } from "~/components/charts/EChart"
import { OptionsPageSettingsTitleAction } from "~/components/OptionsPageSettingsTitleAction"
import { PageHeader } from "~/components/PageHeader"
import { SegmentedControl } from "~/components/SegmentedControl"
import {
  ActionGroup,
  Alert,
  Button,
  Card,
  Input,
  Label,
  TagFilter,
  WorkflowTransitionButton,
} from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { BASIC_SETTINGS_TAB_IDS } from "~/constants/basicSettingsTabs"
import { ANIMATIONS } from "~/constants/designTokens"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { subtractDaysFromDayKey } from "~/utils/core/dayKey"
import { formatMoneyFixed } from "~/utils/core/money"

import BalanceHistoryAccountSummaryTable from "./components/BalanceHistoryAccountSummaryTable"
import {
  BALANCE_HISTORY_TREND_SERIES_SCOPES,
  QUICK_RANGES,
  type BalanceHistoryTrendSeriesScope,
  type BalanceHistoryVisibleMetric,
} from "./contracts"
import { useBalanceHistoryViewModel } from "./hooks/useBalanceHistoryViewModel"
import {
  getBalanceHistoryMetricLabel,
  getBalanceHistoryQuickRangeLabel,
  getBalanceHistoryTrendScopeLabel,
} from "./presentation"
import { BALANCE_HISTORY_TEST_IDS } from "./testIds"

const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options
const balanceHistorySurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBalanceHistoryPage
/** Render history filters and charts from the composed reporting model. */
export default function BalanceHistory() {
  const { t } = useTranslation("balanceHistory")
  const {
    isInitialLoading,
    handleRefreshNow,
    handlePruneNow,
    shouldShowCashflowWarning,
    shouldShowEnableBalanceHistoryHint,
    openBalanceHistorySettings,
    tagOptions,
    selectedTagIds,
    setSelectedTagIds,
    accountOptions,
    selectedAccountIds,
    setSelectedAccountIds,
    currencyType,
    handleCurrencyChange,
    safeRetentionDays,
    startDayKey,
    minDayKey,
    maxDayKey,
    setStartDayKey,
    endDayKey,
    setEndDayKey,
    snapshotAvailableDays,
    snapshotCompleteDays,
    cashflowAvailableDays,
    perAccountSeries,
    isStoreEmpty,
    overviewTotals,
    currencySymbol,
    effectiveBreakdownMetric,
    setBreakdownMetric,
    estimatedTodayIncomeEnabled,
    breakdownData,
    breakdownChartType,
    setBreakdownChartType,
    breakdownBalanceDayKey,
    effectiveRange,
    setBreakdownBalanceDayKey,
    breakdownOption,
    effectiveTrendMetric,
    setTrendMetric,
    trendScope,
    setTrendScope,
    trendChartType,
    setTrendChartType,
    hasAnyTrendMetricData,
    trendOption,
    shouldShowIncompleteTotalHint,
    totalTrendCoverageSummary,
    tableRows,
    isLoading,
  } = useBalanceHistoryViewModel()
  return (
    <div
      className="space-y-density-6 py-density-4 sm:py-density-6 px-4 sm:px-6"
      data-options-page-pending={isInitialLoading ? "" : undefined}
    >
      <PageHeader
        icon={LineChart}
        title={t("title")}
        titleActions={
          <OptionsPageSettingsTitleAction
            tabId={BASIC_SETTINGS_TAB_IDS.BalanceHistory}
            anchor={SETTINGS_ANCHORS.BALANCE_HISTORY}
            analyticsAction={{
              featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BalanceHistory,
              actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenBalanceHistorySettings,
              surfaceId: balanceHistorySurface,
              entrypoint: optionsEntrypoint,
            }}
          />
        }
        description={t("description")}
        actions={
          <div className="gap-y-density-2 flex flex-wrap items-center gap-x-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleRefreshNow()}
              leftIcon={<RefreshCcw className="h-4 w-4" />}
            >
              {t("actions.refreshNow")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handlePruneNow()}
              leftIcon={<Scissors className="h-4 w-4" />}
            >
              {t("actions.prune")}
            </Button>
          </div>
        }
      />

      {shouldShowCashflowWarning && (
        <Alert
          variant="warning"
          title={t("warnings.cashflowDisabled.title")}
          description={t("warnings.cashflowDisabled.description")}
        />
      )}

      {shouldShowEnableBalanceHistoryHint ? (
        <Alert
          variant="default"
          title={t("hints.disabled.title")}
          description={t("hints.disabled.description")}
        >
          <ActionGroup className="mt-density-3 items-stretch justify-start">
            <WorkflowTransitionButton
              size="sm"
              variant="outline"
              onClick={openBalanceHistorySettings}
              leftIcon={<Settings className="h-4 w-4" />}
              analyticsAction={{
                featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BalanceHistory,
                actionId:
                  PRODUCT_ANALYTICS_ACTION_IDS.OpenBalanceHistorySettings,
                surfaceId: balanceHistorySurface,
                entrypoint: optionsEntrypoint,
              }}
            >
              {t("hints.disabled.actions.openSettings")}
            </WorkflowTransitionButton>
          </ActionGroup>
        </Alert>
      ) : (
        <>
          <Card padding="md">
            <div className="space-y-density-4">
              <div>
                <Label className="text-sm font-medium">
                  {t("filters.tags")}
                </Label>
                <div className="text-muted-foreground text-xs">
                  {t("filters.tagsHint")}
                </div>
              </div>
              <TagFilter
                options={tagOptions}
                value={selectedTagIds}
                onChange={setSelectedTagIds}
                includeAllOption
                allLabel={t("filters.allTags")}
                maxVisibleLines={2}
                disabled={tagOptions.length === 0}
              />

              <div>
                <Label className="text-sm font-medium">
                  {t("filters.accounts")}
                </Label>
                <div className="text-muted-foreground text-xs">
                  {t("filters.accountsHint")}
                </div>
              </div>
              <TagFilter
                options={accountOptions}
                value={selectedAccountIds}
                onChange={setSelectedAccountIds}
                includeAllOption
                allLabel={t("filters.allAccounts")}
                maxVisibleLines={3}
                disabled={accountOptions.length === 0}
              />

              <div>
                <Label className="text-sm font-medium">
                  {t("settings:display.currencyUnit")}
                </Label>
                <div className="text-muted-foreground text-xs">
                  {t("settings:display.currencyDesc")}
                </div>
              </div>

              <SegmentedControl
                layout="fit"
                size="default"
                aria-label={t("settings:display.currencyUnit")}
                value={currencyType}
                onValueChange={handleCurrencyChange}
                options={[
                  { value: "USD", label: t("settings:display.usd") },
                  { value: "CNY", label: t("settings:display.cny") },
                ]}
              />

              <div>
                <Label className="text-sm font-medium">
                  {t("filters.range")}
                </Label>
                <div className="text-muted-foreground text-xs">
                  {t("filters.rangeHint", { days: safeRetentionDays })}
                </div>
              </div>

              <div className="gap-y-density-3 grid grid-cols-1 gap-x-3 md:grid-cols-2">
                <div className="space-y-density-2">
                  <Label className="text-sm font-medium">
                    {t("filters.startDay")}
                  </Label>
                  <Input
                    type="date"
                    value={startDayKey}
                    min={minDayKey || undefined}
                    max={maxDayKey || undefined}
                    aria-label={t("filters.startDay")}
                    onChange={(event) => setStartDayKey(event.target.value)}
                    disabled={!minDayKey}
                  />
                </div>
                <div className="space-y-density-2">
                  <Label className="text-sm font-medium">
                    {t("filters.endDay")}
                  </Label>
                  <Input
                    type="date"
                    value={endDayKey}
                    min={minDayKey || undefined}
                    max={maxDayKey || undefined}
                    aria-label={t("filters.endDay")}
                    onChange={(event) => setEndDayKey(event.target.value)}
                    disabled={!maxDayKey}
                  />
                </div>
              </div>

              <ActionGroup className="items-stretch justify-start">
                {QUICK_RANGES.map((preset) => {
                  const label = getBalanceHistoryQuickRangeLabel(t, preset.id)
                  return (
                    <Button
                      key={preset.id}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const desired = Math.min(preset.days, safeRetentionDays)
                        setEndDayKey(maxDayKey)
                        setStartDayKey(
                          subtractDaysFromDayKey(maxDayKey, desired - 1),
                        )
                      }}
                    >
                      {label}
                    </Button>
                  )
                })}
              </ActionGroup>

              <div className="text-muted-foreground text-xs">
                {t("summary.coverage", {
                  snapshotAvailableDays,
                  snapshotCompleteDays: snapshotCompleteDays.snapshotComplete,
                  cashflowAvailableDays,
                  cashflowCompleteDays: snapshotCompleteDays.cashflowComplete,
                  totalDays: perAccountSeries.dayKeys.length,
                })}
              </div>
            </div>
          </Card>

          {isInitialLoading ? (
            <div className="dark:text-secondary-foreground text-muted-foreground text-sm">
              {t("messages.loading.loadingData")}
            </div>
          ) : isStoreEmpty ? (
            <Card padding="md">
              <div className="space-y-density-1">
                <div className="text-sm font-medium">{t("empty.title")}</div>
                <div className="text-muted-foreground text-sm">
                  {t("empty.description")}
                </div>
              </div>
            </Card>
          ) : snapshotAvailableDays === 0 ? (
            <Card padding="md">
              <div className="space-y-density-1">
                <div className="text-sm font-medium">
                  {t("emptyRange.title")}
                </div>
                <div className="text-muted-foreground text-sm">
                  {t("emptyRange.description")}
                </div>
              </div>
            </Card>
          ) : (
            <div className="space-y-density-6">
              <Card
                padding="md"
                data-testid={BALANCE_HISTORY_TEST_IDS.overview}
              >
                <div className="space-y-density-4">
                  <div className="text-sm font-medium">
                    {t("overview.title")}
                  </div>
                  <div className="gap-y-density-3 grid grid-cols-1 gap-x-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="dark:bg-card bg-surface-subtle py-density-3 rounded-lg px-3">
                      <div className="text-muted-foreground text-xs">
                        {t("overview.kpis.endBalance.label")}
                      </div>
                      <div className="text-lg font-semibold">
                        {overviewTotals.endBalance === null
                          ? "-"
                          : `${currencySymbol}${formatMoneyFixed(overviewTotals.endBalance)}`}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {t("overview.kpis.coverageAccounts", {
                          covered: overviewTotals.endBalanceCovered,
                          total: overviewTotals.totalAccounts,
                        })}
                      </div>
                    </div>

                    <div className="dark:bg-card bg-surface-subtle py-density-3 rounded-lg px-3">
                      <div className="text-muted-foreground text-xs">
                        {t("overview.kpis.rangeNet.label")}
                      </div>
                      <div className="text-lg font-semibold">
                        {overviewTotals.rangeNet === null
                          ? "-"
                          : `${currencySymbol}${formatMoneyFixed(overviewTotals.rangeNet)}`}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {t("overview.kpis.coverageAccounts", {
                          covered: overviewTotals.rangeNetCovered,
                          total: overviewTotals.totalAccounts,
                        })}
                      </div>
                    </div>

                    <div className="dark:bg-card bg-surface-subtle py-density-3 rounded-lg px-3">
                      <div className="text-muted-foreground text-xs">
                        {t("overview.kpis.incomeTotal.label")}
                      </div>
                      <div className="text-lg font-semibold">
                        {overviewTotals.incomeTotal === null
                          ? "-"
                          : `${currencySymbol}${formatMoneyFixed(overviewTotals.incomeTotal)}`}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {t("overview.kpis.coverageAccounts", {
                          covered: overviewTotals.incomeCovered,
                          total: overviewTotals.totalAccounts,
                        })}
                      </div>
                    </div>

                    <div className="dark:bg-card bg-surface-subtle py-density-3 rounded-lg px-3">
                      <div className="text-muted-foreground text-xs">
                        {t("overview.kpis.outcomeTotal.label")}
                      </div>
                      <div className="text-lg font-semibold">
                        {overviewTotals.outcomeTotal === null
                          ? "-"
                          : `${currencySymbol}${formatMoneyFixed(overviewTotals.outcomeTotal)}`}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {t("overview.kpis.coverageAccounts", {
                          covered: overviewTotals.outcomeCovered,
                          total: overviewTotals.totalAccounts,
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              <div className="gap-y-density-6 grid grid-cols-1 gap-x-6 lg:grid-cols-2">
                <Card padding="md">
                  <div className="space-y-density-3">
                    <div className="gap-y-density-3 flex flex-wrap items-start justify-between gap-x-3">
                      <div className="space-y-density-1 min-w-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className={`${ANIMATIONS.transition.base} dark:hover:bg-secondary hover:bg-muted focus-visible:ring-ring gap-y-density-1 inline-flex max-w-full min-w-0 items-center gap-x-1 rounded-md px-1 py-0.5 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none`}
                            >
                              <span className="min-w-0 truncate">
                                {t("breakdown.title")}:{" "}
                                {getBalanceHistoryMetricLabel(
                                  t,
                                  effectiveBreakdownMetric,
                                )}
                              </span>
                              <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-44">
                            <DropdownMenuRadioGroup
                              value={effectiveBreakdownMetric}
                              onValueChange={(value) =>
                                setBreakdownMetric(
                                  value as BalanceHistoryVisibleMetric,
                                )
                              }
                            >
                              <DropdownMenuRadioItem value="balance">
                                {t("metrics.balance")}
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="income">
                                {t("metrics.income")}
                              </DropdownMenuRadioItem>
                              {estimatedTodayIncomeEnabled && (
                                <DropdownMenuRadioItem value="estimatedIncome">
                                  {t("metrics.estimatedIncome")}
                                </DropdownMenuRadioItem>
                              )}
                              <DropdownMenuRadioItem value="outcome">
                                {t("metrics.outcome")}
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="net">
                                {t("metrics.net")}
                              </DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <div className="text-muted-foreground text-xs">
                          {t("breakdown.coverage", {
                            covered: breakdownData.coveredAccounts,
                            total: breakdownData.totalAccounts,
                          })}
                        </div>
                      </div>

                      <SegmentedControl
                        layout="fit"
                        size="sm"
                        aria-label={t("breakdown.controls.chartType")}
                        value={breakdownChartType}
                        onValueChange={setBreakdownChartType}
                        options={[
                          {
                            value: "pie",
                            label: t("breakdown.chartTypes.pie"),
                            disabled: breakdownData.hasNegativeValues,
                          },
                          {
                            value: "bar",
                            label: t("breakdown.chartTypes.histogram"),
                          },
                        ]}
                      />
                    </div>

                    {effectiveBreakdownMetric === "balance" && (
                      <div className="gap-y-density-2 flex flex-wrap items-center gap-x-2">
                        <Label className="text-muted-foreground text-xs">
                          {t("breakdown.controls.reference")}
                        </Label>
                        <Input
                          type="date"
                          size="sm"
                          containerClassName="w-40"
                          value={
                            breakdownBalanceDayKey || effectiveRange.endDayKey
                          }
                          min={effectiveRange.startDayKey}
                          max={effectiveRange.endDayKey}
                          aria-label={t("breakdown.controls.reference")}
                          onChange={(event) =>
                            setBreakdownBalanceDayKey(event.target.value)
                          }
                        />
                      </div>
                    )}

                    {breakdownData.hasNegativeValues && (
                      <div className="text-muted-foreground text-xs">
                        {t("breakdown.hints.pieDisabledForNegative")}
                      </div>
                    )}

                    {breakdownOption ? (
                      <div className="h-80 w-full">
                        <EChart option={breakdownOption} />
                      </div>
                    ) : (
                      <div className="dark:text-secondary-foreground text-muted-foreground text-sm">
                        {t("breakdown.empty")}
                      </div>
                    )}
                  </div>
                </Card>

                <Card padding="md">
                  <div className="space-y-density-3">
                    <div className="gap-y-density-3 flex items-start justify-between gap-x-3">
                      <div className="space-y-density-1 min-w-0">
                        <div className="gap-y-density-2 flex min-w-0 items-center gap-x-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className={`${ANIMATIONS.transition.base} dark:hover:bg-secondary hover:bg-muted focus-visible:ring-ring gap-y-density-1 inline-flex max-w-full min-w-0 items-center gap-x-1 rounded-md px-1 py-0.5 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none`}
                              >
                                <span className="min-w-0 truncate">
                                  {t("trend.title")}:{" "}
                                  {getBalanceHistoryMetricLabel(
                                    t,
                                    effectiveTrendMetric,
                                  )}
                                </span>
                                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-44">
                              <DropdownMenuRadioGroup
                                value={effectiveTrendMetric}
                                onValueChange={(value) =>
                                  setTrendMetric(
                                    value as BalanceHistoryVisibleMetric,
                                  )
                                }
                              >
                                <DropdownMenuRadioItem value="balance">
                                  {t("metrics.balance")}
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="income">
                                  {t("metrics.income")}
                                </DropdownMenuRadioItem>
                                {estimatedTodayIncomeEnabled && (
                                  <DropdownMenuRadioItem value="estimatedIncome">
                                    {t("metrics.estimatedIncome")}
                                  </DropdownMenuRadioItem>
                                )}
                                <DropdownMenuRadioItem value="outcome">
                                  {t("metrics.outcome")}
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="net">
                                  {t("metrics.net")}
                                </DropdownMenuRadioItem>
                              </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className={`${ANIMATIONS.transition.base} dark:hover:bg-secondary hover:bg-muted focus-visible:ring-ring gap-y-density-1 inline-flex max-w-full min-w-0 items-center gap-x-1 rounded-md px-1 py-0.5 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none`}
                              >
                                <span className="min-w-0 truncate">
                                  {t("trend.controls.scope")}:{" "}
                                  {getBalanceHistoryTrendScopeLabel(
                                    t,
                                    trendScope,
                                  )}
                                </span>
                                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-40">
                              <DropdownMenuRadioGroup
                                value={trendScope}
                                onValueChange={(value) =>
                                  setTrendScope(
                                    value as BalanceHistoryTrendSeriesScope,
                                  )
                                }
                              >
                                <DropdownMenuRadioItem
                                  value={
                                    BALANCE_HISTORY_TREND_SERIES_SCOPES.Accounts
                                  }
                                >
                                  {t("trend.scopes.accounts")}
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem
                                  value={
                                    BALANCE_HISTORY_TREND_SERIES_SCOPES.Total
                                  }
                                >
                                  {t("trend.scopes.total")}
                                </DropdownMenuRadioItem>
                              </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {trendScope ===
                          BALANCE_HISTORY_TREND_SERIES_SCOPES.Total
                            ? t("trend.subtitleTotal")
                            : t("trend.subtitle")}
                        </div>
                      </div>
                      <SegmentedControl
                        layout="fit"
                        size="sm"
                        aria-label={t("trend.controls.chartType")}
                        value={trendChartType}
                        onValueChange={setTrendChartType}
                        options={[
                          { value: "line", label: t("trend.chartTypes.line") },
                          { value: "bar", label: t("trend.chartTypes.bar") },
                        ]}
                      />
                    </div>

                    {hasAnyTrendMetricData ? (
                      <div className="space-y-density-3">
                        <div className="h-80 w-full">
                          <EChart option={trendOption} />
                        </div>
                        {shouldShowIncompleteTotalHint && (
                          <Alert
                            variant="warning"
                            title={t("hints.incompleteSelection.title")}
                            description={t(
                              "hints.incompleteSelection.description",
                              {
                                minCovered:
                                  totalTrendCoverageSummary.minCovered,
                                maxCovered:
                                  totalTrendCoverageSummary.maxCovered,
                                totalAccounts:
                                  totalTrendCoverageSummary.totalAccounts,
                              },
                            )}
                          />
                        )}
                      </div>
                    ) : (
                      <div className="dark:text-secondary-foreground text-muted-foreground text-sm">
                        {t("trend.emptyMetric", {
                          metric: getBalanceHistoryMetricLabel(
                            t,
                            effectiveTrendMetric,
                          ),
                        })}
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              <Card
                padding="md"
                data-testid={BALANCE_HISTORY_TEST_IDS.accountSummary}
              >
                <div className="space-y-density-3">
                  <div className="text-sm font-medium">{t("table.title")}</div>
                  <BalanceHistoryAccountSummaryTable
                    rows={tableRows}
                    isLoading={isLoading}
                    currencySymbol={currencySymbol}
                    showEstimatedIncome={estimatedTodayIncomeEnabled}
                  />
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
