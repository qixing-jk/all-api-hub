import { ChevronDown } from "lucide-react"
import { useTranslation } from "react-i18next"

import { EChart } from "~/components/charts/EChart"
import { SegmentedControl } from "~/components/SegmentedControl"
import { Card, Input, Label } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { ANIMATIONS } from "~/constants/designTokens"
import { type BalanceHistoryVisibleMetric } from "~/features/BalanceHistory/contracts"
import { getBalanceHistoryMetricLabel } from "~/features/BalanceHistory/reporting/presentation"
import { type useBalanceHistoryViewModel } from "~/features/BalanceHistory/workspace/useBalanceHistoryViewModel"

/** Render this reporting section from its existing ViewModel snapshot. */
export function BalanceHistoryBreakdown({
  model,
}: {
  model: Pick<
    ReturnType<typeof useBalanceHistoryViewModel>,
    | "effectiveBreakdownMetric"
    | "setBreakdownMetric"
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
    setBreakdownMetric,
    estimatedTodayIncomeEnabled,
    breakdownData,
    breakdownChartType,
    setBreakdownChartType,
    breakdownBalanceDayKey,
    effectiveRange,
    setBreakdownBalanceDayKey,
    breakdownOption,
  } = model
  return (
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
                    {getBalanceHistoryMetricLabel(t, effectiveBreakdownMetric)}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuRadioGroup
                  value={effectiveBreakdownMetric}
                  onValueChange={(value) =>
                    setBreakdownMetric(value as BalanceHistoryVisibleMetric)
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
  )
}
