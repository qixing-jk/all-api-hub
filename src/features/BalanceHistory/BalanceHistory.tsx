import { LineChart, RefreshCw, Scissors, Settings } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { OptionsPageSettingsTitleAction } from "~/components/OptionsPageSettingsTitleAction"
import { PageHeader } from "~/components/PageHeader"
import { SegmentedControl } from "~/components/SegmentedControl"
import {
  ActionGroup,
  Alert,
  Button,
  Card,
  WorkflowTransitionButton,
} from "~/components/ui"
import { Spinner } from "~/components/ui/spinner"
import { BASIC_SETTINGS_TAB_IDS } from "~/constants/basicSettingsTabs"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { BALANCE_HISTORY_CHART_VIEWS } from "~/features/BalanceHistory/contracts"
import type { BalanceHistoryChartView } from "~/features/BalanceHistory/contracts"
import { createBalanceHistoryPreview } from "~/features/BalanceHistory/data/createBalanceHistoryPreview"
import BalanceHistoryAccountSummaryTable from "~/features/BalanceHistory/reporting/BalanceHistoryAccountSummaryTable"
import { BalanceHistoryBreakdown } from "~/features/BalanceHistory/reporting/BalanceHistoryBreakdown"
import { BalanceHistoryOverview } from "~/features/BalanceHistory/reporting/BalanceHistoryOverview"
import { BalanceHistoryTrend } from "~/features/BalanceHistory/reporting/BalanceHistoryTrend"
import { useBalanceHistoryViewModel } from "~/features/BalanceHistory/workspace/useBalanceHistoryViewModel"
import { ReportPreviewNotice } from "~/features/DevPanel/ReportPreviewNotice"
import { useReportPreview } from "~/features/DevPanel/useReportPreview"
import { useMediaQuery } from "~/hooks/useMediaQuery"
import { cn } from "~/lib/utils"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

import { BALANCE_HISTORY_TEST_IDS } from "./testIds"

const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options
const balanceHistorySurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBalanceHistoryPage
/** Render history filters and charts from the composed reporting model. */
export default function BalanceHistory() {
  const { scenario, data, exit } = useReportPreview(
    MENU_ITEM_IDS.BALANCE_HISTORY,
    {
      title: "Balance History previews",
      standard: "Dev: Preview USD balances",
      mixed: "Dev: Preview mixed balances",
    },
    createBalanceHistoryPreview,
  )
  return (
    <BalanceHistoryPage
      key={scenario ?? "saved"}
      preview={data}
      exitPreview={exit}
    />
  )
}

/** Keep preview selections isolated from the saved report. */
function BalanceHistoryPage({
  preview,
  exitPreview,
}: {
  preview?: ReturnType<typeof createBalanceHistoryPreview>
  exitPreview: () => void
}) {
  const { t } = useTranslation("balanceHistory")
  const viewModel = useBalanceHistoryViewModel(preview)
  const trendMetricTrigger = useRef<HTMLButtonElement>(null)
  const [chartView, setChartView] = useState<BalanceHistoryChartView>(
    BALANCE_HISTORY_CHART_VIEWS.Trend,
  )
  const showBothCharts = useMediaQuery("(min-width: 1200px)")
  const showBreakdownRail =
    showBothCharts && viewModel.breakdownData.entries.length > 1
  const {
    isInitialLoading,
    handleRefreshNow,
    handlePruneNow,
    shouldShowCashflowWarning,
    shouldShowEnableBalanceHistoryHint,
    openBalanceHistorySettings,
    snapshotAvailableDays,
    isStoreEmpty,
    currencySymbol,
    estimatedTodayIncomeEnabled,
    tableRows,
    isLoading,
    loadError,
    retryLoad,
    hasLoadedData,
  } = viewModel
  const hasReportData =
    snapshotAvailableDays > 0 ||
    viewModel.financialHistory.series.length > 0 ||
    viewModel.nativeActivity.length > 0
  return (
    <div
      className="space-y-density-6 px-4 py-density-4 sm:px-6 sm:py-density-6"
      data-options-page-pending={isInitialLoading ? "" : undefined}
    >
      <PageHeader
        spacing="compact"
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
          <div className="flex flex-wrap items-center gap-x-2 gap-y-density-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={Boolean(preview)}
              onClick={() => void handleRefreshNow()}
              leftIcon={<RefreshCw className="h-4 w-4" />}
            >
              {t("actions.refreshNow")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(preview)}
              onClick={() => void handlePruneNow()}
              leftIcon={<Scissors className="h-4 w-4" />}
            >
              {t("actions.prune")}
            </Button>
          </div>
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
              onClick={() => void retryLoad()}
            >
              {t("common:actions.retry")}
            </Button>
          }
        />
      )}

      {shouldShowCashflowWarning && (
        <Alert
          variant="warning"
          title={t("warnings.cashflowDisabled.title")}
          description={t("warnings.cashflowDisabled.description")}
        />
      )}

      {loadError &&
      !hasLoadedData ? null : shouldShowEnableBalanceHistoryHint ? (
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
          {!isInitialLoading && (
            <BalanceHistoryOverview
              model={viewModel}
              onViewTrend={(key) => {
                setChartView(BALANCE_HISTORY_CHART_VIEWS.Trend)
                viewModel.selectTrendMetric(key)
                requestAnimationFrame(() => trendMetricTrigger.current?.focus())
              }}
              historyCoverage={
                viewModel.hasFinancialHistory ||
                viewModel.nativeActivity.length > 0
                  ? {
                      covered: new Set([
                        ...viewModel.financialHistory.series.map(
                          (series) => series.accountId,
                        ),
                        ...tableRows
                          .filter(
                            (row) =>
                              row.snapshotDays > 0 ||
                              row.nativeActivity?.length,
                          )
                          .map((row) => row.id),
                      ]).size,
                      total: viewModel.effectiveAccountCount,
                    }
                  : undefined
              }
            />
          )}

          {isInitialLoading ? (
            <div className="flex justify-center py-density-6" aria-busy="true">
              <Spinner aria-label={t("messages.loading.loadingData")} />
            </div>
          ) : isStoreEmpty ? (
            <Card padding="md">
              <div className="space-y-density-1">
                <div className="text-sm font-medium">{t("empty.title")}</div>
                <div className="text-sm text-muted-foreground">
                  {t("empty.description")}
                </div>
              </div>
            </Card>
          ) : !hasReportData ? (
            <Card padding="md">
              <div className="space-y-density-1">
                <div className="text-sm font-medium">
                  {t("emptyRange.title")}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t("emptyRange.description")}
                </div>
              </div>
            </Card>
          ) : (
            <div className="space-y-density-6">
              <Card padding="md" className="space-y-density-3">
                {!showBothCharts && (
                  <SegmentedControl
                    aria-label={t("charts.view")}
                    layout="fit"
                    size="sm"
                    value={chartView}
                    onValueChange={setChartView}
                    options={[
                      {
                        value: BALANCE_HISTORY_CHART_VIEWS.Trend,
                        label: t("trend.title"),
                      },
                      {
                        value: BALANCE_HISTORY_CHART_VIEWS.Breakdown,
                        label: t("breakdown.title"),
                      },
                    ]}
                  />
                )}
                <div
                  className={cn(
                    "grid min-w-0 items-start gap-4",
                    showBreakdownRail &&
                      "grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
                  )}
                >
                  {(showBothCharts ||
                    chartView === BALANCE_HISTORY_CHART_VIEWS.Trend) && (
                    <BalanceHistoryTrend
                      model={viewModel}
                      metricTriggerRef={trendMetricTrigger}
                    />
                  )}
                  {(showBothCharts ||
                    chartView === BALANCE_HISTORY_CHART_VIEWS.Breakdown) && (
                    <BalanceHistoryBreakdown
                      model={viewModel}
                      className={
                        showBreakdownRail
                          ? "self-stretch border-s border-border ps-4"
                          : showBothCharts
                            ? "border-t border-border pt-density-3"
                            : undefined
                      }
                    />
                  )}
                </div>
              </Card>

              <Card
                padding="md"
                data-testid={BALANCE_HISTORY_TEST_IDS.accountSummary}
              >
                <BalanceHistoryAccountSummaryTable
                  rows={tableRows}
                  isLoading={isLoading}
                  currencySymbol={currencySymbol}
                  showEstimatedIncome={estimatedTodayIncomeEnabled}
                  linkAccounts={!preview}
                  financialSeries={viewModel.financialHistory.series}
                  showReferenceColumns={snapshotAvailableDays > 0}
                />
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
