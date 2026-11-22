import { useTranslation } from "react-i18next"

import { EChart } from "~/components/charts/EChart"
import { SegmentedControl } from "~/components/SegmentedControl"
import { Input, Label } from "~/components/ui"
import { BALANCE_HISTORY_TREND_CHART_TYPES } from "~/features/BalanceHistory/contracts"
import { BalanceHistoryMetricMenu } from "~/features/BalanceHistory/reporting/BalanceHistoryMetricMenu"
import { type useBalanceHistoryViewModel } from "~/features/BalanceHistory/workspace/useBalanceHistoryViewModel"
import { cn } from "~/lib/utils"
import { DAILY_BALANCE_HISTORY_METRICS } from "~/services/history/dailyBalanceHistory/constants"

/** Render this reporting section from its existing ViewModel snapshot. */
export function BalanceHistoryBreakdown({
  className,
  model,
}: {
  className?: string
  model: Pick<
    ReturnType<typeof useBalanceHistoryViewModel>,
    | "effectiveBreakdownMetric"
    | "selectBreakdownMetric"
    | "nativeMetrics"
    | "nativeBreakdown"
    | "hasReferenceBalance"
    | "referenceMetrics"
    | "currencyType"
    | "estimatedTodayIncomeEnabled"
    | "breakdownData"
    | "breakdownChartType"
    | "setBreakdownChartType"
    | "breakdownBalanceDayKey"
    | "effectiveRange"
    | "setBreakdownBalanceDayKey"
    | "breakdownOption"
  >
}) {
  const { t } = useTranslation("balanceHistory")
  const {
    effectiveBreakdownMetric,
    selectBreakdownMetric,
    nativeMetrics,
    nativeBreakdown,
    hasReferenceBalance,
    estimatedTodayIncomeEnabled,
    breakdownData,
    breakdownChartType,
    setBreakdownChartType,
    breakdownBalanceDayKey,
    effectiveRange,
    setBreakdownBalanceDayKey,
    breakdownOption,
  } = model
  const { entries, hasNegativeValues } = breakdownData
  const isBalanceMetric = nativeBreakdown
    ? !("activity" in nativeBreakdown)
    : effectiveBreakdownMetric === DAILY_BALANCE_HISTORY_METRICS.Balance
  const hasComparison = entries.length > 1
  const singleEntry = entries.length === 1 ? entries[0] : undefined
  const { min, max } = entries.reduce(
    (range, { value }) => ({
      min: Math.min(range.min, value),
      max: Math.max(range.max, value),
    }),
    { min: 0, max: 0 },
  )
  const magnitude = Math.max(max, -min) || 1
  const range = max / magnitude - min / magnitude || 1
  const percent = (value: number) => (value / magnitude / range) * 100
  const zero = -percent(min)

  return (
    <section
      aria-label={t("breakdown.title")}
      className={cn("min-w-0", className)}
    >
      <div
        className={
          hasComparison
            ? "space-y-density-3"
            : "flex flex-wrap items-center gap-x-4 gap-y-density-3"
        }
      >
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-density-3">
          <div className="min-w-0 space-y-density-1">
            <BalanceHistoryMetricMenu
              title={t("breakdown.title")}
              metric={effectiveBreakdownMetric}
              nativeMetric={nativeBreakdown}
              nativeMetrics={nativeMetrics}
              hasReferenceBalance={hasReferenceBalance}
              referenceMetrics={model.referenceMetrics}
              currencyType={model.currencyType}
              estimatedTodayIncomeEnabled={estimatedTodayIncomeEnabled}
              onChange={selectBreakdownMetric}
            />
            <div className="text-xs text-muted-foreground">
              {t("breakdown.coverage", {
                covered: breakdownData.coveredAccounts,
                total: breakdownData.totalAccounts,
              })}
            </div>
          </div>

          {hasComparison && (
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
                  disabled: !breakdownData.canUsePie,
                },
                {
                  value: BALANCE_HISTORY_TREND_CHART_TYPES.Bar,
                  label: t("breakdown.chartTypes.bars"),
                },
              ]}
            />
          )}
        </div>

        {isBalanceMetric && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-density-2">
            <Label className="text-xs text-muted-foreground">
              {t("breakdown.controls.reference")}
            </Label>
            <Input
              type="date"
              size="sm"
              containerClassName="w-40"
              value={breakdownBalanceDayKey || effectiveRange.endDayKey}
              min={effectiveRange.startDayKey}
              max={effectiveRange.endDayKey}
              aria-label={t("breakdown.controls.reference")}
              onChange={(event) =>
                setBreakdownBalanceDayKey(event.target.value)
              }
            />
          </div>
        )}

        {hasComparison && hasNegativeValues && (
          <div className="text-xs text-muted-foreground">
            {t("breakdown.hints.pieDisabledForNegative")}
          </div>
        )}

        {singleEntry ? (
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm [overflow-wrap:anywhere]">
            <span className="text-muted-foreground">{singleEntry.name}</span>
            <span className="font-semibold tabular-nums">
              {singleEntry.formattedValue}
            </span>
          </div>
        ) : breakdownOption ? (
          <div className="h-56 w-full">
            <EChart option={breakdownOption} />
          </div>
        ) : entries.length > 0 ? (
          <ul className="max-h-80 space-y-density-3 overflow-y-auto pr-1">
            {entries.map(({ name, value, formattedValue }) => (
              <li key={name} className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs [overflow-wrap:anywhere]">
                  <span>{name}</span>
                  <span className="ms-auto font-medium tabular-nums">
                    {formattedValue}
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="relative h-2 rounded-sm bg-surface-subtle"
                >
                  {hasNegativeValues && (
                    <span
                      className="absolute inset-y-0 w-px bg-border-strong"
                      style={{ insetInlineStart: `${zero}%` }}
                    />
                  )}
                  <span
                    className={
                      value < 0
                        ? "absolute inset-y-0 rounded-sm bg-destructive-indicator"
                        : "absolute inset-y-0 rounded-sm bg-[var(--chart-1)]"
                    }
                    style={{
                      insetInlineStart: `${zero + Math.min(0, percent(value))}%`,
                      width: `${Math.abs(percent(value))}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-muted-foreground dark:text-secondary-foreground">
            {t("breakdown.empty")}
          </div>
        )}
      </div>
    </section>
  )
}
