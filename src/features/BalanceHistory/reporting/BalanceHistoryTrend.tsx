import { ChevronDown } from "lucide-react"
import type { Ref } from "react"
import { useTranslation } from "react-i18next"

import { EChart } from "~/components/charts/EChart"
import { SegmentedControl } from "~/components/SegmentedControl"
import { Alert } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { ANIMATIONS } from "~/constants/designTokens"
import {
  BALANCE_HISTORY_TREND_CHART_TYPES,
  BALANCE_HISTORY_TREND_SERIES_SCOPES,
  type BalanceHistoryTrendSeriesScope,
} from "~/features/BalanceHistory/contracts"
import { BalanceHistoryMetricMenu } from "~/features/BalanceHistory/reporting/BalanceHistoryMetricMenu"
import {
  getBalanceHistoryMetricLabel,
  getBalanceHistoryTrendScopeLabel,
} from "~/features/BalanceHistory/reporting/presentation"
import { type useBalanceHistoryViewModel } from "~/features/BalanceHistory/workspace/useBalanceHistoryViewModel"
import { DAILY_BALANCE_HISTORY_METRICS } from "~/services/history/dailyBalanceHistory/constants"

/** Render this reporting section from its existing ViewModel snapshot. */
export function BalanceHistoryTrend({
  model,
  metricTriggerRef,
}: {
  metricTriggerRef?: Ref<HTMLButtonElement>
  model: Pick<
    ReturnType<typeof useBalanceHistoryViewModel>,
    | "estimatedTodayIncomeEnabled"
    | "effectiveTrendMetric"
    | "selectTrendMetric"
    | "nativeTrendMetrics"
    | "nativeTrend"
    | "nativeTrendPresentation"
    | "nativeTrendCanSum"
    | "hasReferenceBalance"
    | "referenceMetrics"
    | "currencyType"
    | "trendScope"
    | "setTrendScope"
    | "trendChartType"
    | "setTrendChartType"
    | "hasAnyTrendMetricData"
    | "trendOption"
    | "shouldShowIncompleteTotalHint"
    | "totalTrendCoverageSummary"
  >
}) {
  const { t, i18n } = useTranslation("balanceHistory")
  const {
    estimatedTodayIncomeEnabled,
    effectiveTrendMetric,
    selectTrendMetric,
    nativeTrendMetrics,
    nativeTrend,
    nativeTrendPresentation,
    hasReferenceBalance,
    trendScope,
    setTrendScope,
    trendChartType,
    setTrendChartType,
    hasAnyTrendMetricData,
    trendOption,
    shouldShowIncompleteTotalHint,
    totalTrendCoverageSummary,
  } = model
  const metricLabel =
    nativeTrend?.label ?? getBalanceHistoryMetricLabel(t, effectiveTrendMetric)
  const singleObservation = nativeTrendPresentation?.singleObservation
  const hasGapBridge =
    Array.isArray(trendOption.series) &&
    trendOption.series.some(
      (series) =>
        series.type === BALANCE_HISTORY_TREND_CHART_TYPES.Line &&
        series.lineStyle?.type === "dashed",
    )
  const recordedRange =
    nativeTrendPresentation &&
    (nativeTrendPresentation.isCropped || singleObservation)
      ? new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
          dateStyle: "medium",
          timeZone: "UTC",
        }).formatRange(
          new Date(nativeTrendPresentation.start),
          new Date(nativeTrendPresentation.end),
        )
      : undefined
  return (
    <section aria-label={t("trend.title")} className="min-w-0">
      <div className="space-y-density-3">
        <div className="space-y-density-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-density-2">
            <BalanceHistoryMetricMenu
              triggerRef={metricTriggerRef}
              title={t("trend.title")}
              metric={effectiveTrendMetric}
              nativeMetric={nativeTrend}
              nativeMetrics={nativeTrendMetrics}
              hasReferenceBalance={hasReferenceBalance}
              referenceMetrics={model.referenceMetrics}
              currencyType={model.currencyType}
              estimatedTodayIncomeEnabled={estimatedTodayIncomeEnabled}
              onChange={selectTrendMetric}
            />

            <div className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-density-1">
              {(!nativeTrend || model.nativeTrendCanSum) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={`${ANIMATIONS.transition.base} inline-flex max-w-full min-w-0 items-center gap-x-1 gap-y-density-1 rounded-md px-1 py-0.5 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-secondary`}
                    >
                      <span className="min-w-0 text-start [overflow-wrap:anywhere] whitespace-normal">
                        {t("trend.controls.scope")}:{" "}
                        {getBalanceHistoryTrendScopeLabel(t, trendScope)}
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-40">
                    <DropdownMenuRadioGroup
                      value={trendScope}
                      onValueChange={(value) =>
                        setTrendScope(value as BalanceHistoryTrendSeriesScope)
                      }
                    >
                      <DropdownMenuRadioItem
                        value={BALANCE_HISTORY_TREND_SERIES_SCOPES.Accounts}
                      >
                        {t("trend.scopes.accounts")}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem
                        value={BALANCE_HISTORY_TREND_SERIES_SCOPES.Total}
                      >
                        {t("trend.scopes.total")}
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {!singleObservation && (
                <SegmentedControl
                  layout="fit"
                  size="sm"
                  className="shrink-0 flex-nowrap"
                  aria-label={t("trend.controls.chartType")}
                  value={trendChartType}
                  onValueChange={setTrendChartType}
                  options={[
                    {
                      value: BALANCE_HISTORY_TREND_CHART_TYPES.Line,
                      label: t("trend.chartTypes.line"),
                    },
                    {
                      value: BALANCE_HISTORY_TREND_CHART_TYPES.Bar,
                      label: t("trend.chartTypes.bar"),
                    },
                  ]}
                />
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-density-1 text-xs text-muted-foreground">
            {recordedRange && (
              <span>{t("native.recordedRange", { range: recordedRange })}</span>
            )}
            {!nativeTrend &&
              effectiveTrendMetric ===
                DAILY_BALANCE_HISTORY_METRICS.EstimatedIncome && (
                <span>{t("metricHelp.estimatedHint")}</span>
              )}
            {nativeTrend
              ? nativeTrendPresentation?.hasGaps
                ? t("native.gaps")
                : null
              : trendScope === BALANCE_HISTORY_TREND_SERIES_SCOPES.Total
                ? t("trend.subtitleTotal")
                : trendChartType === BALANCE_HISTORY_TREND_CHART_TYPES.Bar
                  ? t("trend.subtitle")
                  : null}
          </div>
        </div>

        {singleObservation ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-density-1 border-t border-border pt-density-3 text-sm [overflow-wrap:anywhere]">
            <span className="text-muted-foreground">
              {singleObservation.account}
            </span>
            <span className="font-semibold tabular-nums">
              {singleObservation.amount}
            </span>
          </div>
        ) : hasAnyTrendMetricData ? (
          <div className="space-y-density-3">
            {hasGapBridge && (
              <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="w-4 border-t-2 border-dashed border-current opacity-60"
                />
                {t("trend.gapBridge")}
              </div>
            )}
            <div
              className="h-80 w-full"
              role={nativeTrend ? "img" : undefined}
              aria-label={
                nativeTrend
                  ? `${metricLabel}. ${trendScope === BALANCE_HISTORY_TREND_SERIES_SCOPES.Total ? t("trend.scopes.total") : t("trend.scopes.accounts")}. ${nativeTrend.series.map(({ name }) => name).join(", ")}`
                  : undefined
              }
            >
              <EChart option={trendOption} />
            </div>
            {shouldShowIncompleteTotalHint && (
              <Alert
                variant="warning"
                title={t("hints.incompleteSelection.title")}
                description={t("hints.incompleteSelection.description", {
                  minCovered: totalTrendCoverageSummary.minCovered,
                  maxCovered: totalTrendCoverageSummary.maxCovered,
                  totalAccounts: totalTrendCoverageSummary.totalAccounts,
                })}
              />
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground dark:text-secondary-foreground">
            {t("trend.emptyMetric", {
              metric: metricLabel,
            })}
          </div>
        )}
      </div>
    </section>
  )
}
