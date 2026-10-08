import { ChevronDown } from "lucide-react"
import { useTranslation } from "react-i18next"

import { EChart } from "~/components/charts/EChart"
import { SegmentedControl } from "~/components/SegmentedControl"
import { Alert, Card } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { ANIMATIONS } from "~/constants/designTokens"
import {
  BALANCE_HISTORY_TREND_SERIES_SCOPES,
  type BalanceHistoryTrendSeriesScope,
  type BalanceHistoryVisibleMetric,
} from "~/features/BalanceHistory/contracts"
import { type useBalanceHistoryViewModel } from "~/features/BalanceHistory/hooks/useBalanceHistoryViewModel"
import {
  getBalanceHistoryMetricLabel,
  getBalanceHistoryTrendScopeLabel,
} from "~/features/BalanceHistory/presentation"

/** Render this reporting section from its existing ViewModel snapshot. */
export function BalanceHistoryTrend({
  model,
}: {
  model: Pick<
    ReturnType<typeof useBalanceHistoryViewModel>,
    | "estimatedTodayIncomeEnabled"
    | "effectiveTrendMetric"
    | "setTrendMetric"
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
  const { t } = useTranslation("balanceHistory")
  const {
    estimatedTodayIncomeEnabled,
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
  } = model
  return (
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
                      {getBalanceHistoryMetricLabel(t, effectiveTrendMetric)}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuRadioGroup
                    value={effectiveTrendMetric}
                    onValueChange={(value) =>
                      setTrendMetric(value as BalanceHistoryVisibleMetric)
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
            </div>
            <div className="text-muted-foreground text-xs">
              {trendScope === BALANCE_HISTORY_TREND_SERIES_SCOPES.Total
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
                description={t("hints.incompleteSelection.description", {
                  minCovered: totalTrendCoverageSummary.minCovered,
                  maxCovered: totalTrendCoverageSummary.maxCovered,
                  totalAccounts: totalTrendCoverageSummary.totalAccounts,
                })}
              />
            )}
          </div>
        ) : (
          <div className="dark:text-secondary-foreground text-muted-foreground text-sm">
            {t("trend.emptyMetric", {
              metric: getBalanceHistoryMetricLabel(t, effectiveTrendMetric),
            })}
          </div>
        )}
      </div>
    </Card>
  )
}
