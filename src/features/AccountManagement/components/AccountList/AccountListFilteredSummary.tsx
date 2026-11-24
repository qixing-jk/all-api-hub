import { useTranslation } from "react-i18next"

import { FINANCIAL_METRIC_KINDS } from "~/components/financialMetricKinds"
import { FinancialMetricLabel } from "~/components/FinancialMetricLabel"
import { Caption } from "~/components/ui"
import {
  BalancePortfolioSummary,
  FILTERED_SUMMARY_METRIC_ROWS,
} from "~/features/AccountManagement/components/BalancePortfolioSummary"
import { FinancialTotalsPopover } from "~/features/AccountManagement/components/FinancialTotalsPopover"
import { ProviderDayUsageSummary } from "~/features/AccountManagement/components/ProviderDayUsageSummary"
import { cn } from "~/lib/utils"
import type { ConsumptionProjection } from "~/services/accounts/metrics/consumptionProjection"
import type { DisplaySiteData } from "~/types"

import { FilteredTodayMetric } from "./FilteredTodayMetric"

interface AccountListFilteredSummaryProps {
  sites: DisplaySiteData[]
  consumption: ConsumptionProjection
  income: ConsumptionProjection
  showTodayCashflow: boolean
}

/** Owns the filtered result count, financial metrics, details entry and spacing. */
export function AccountListFilteredSummary({
  sites,
  consumption,
  income,
  showTodayCashflow,
}: AccountListFilteredSummaryProps) {
  const { t } = useTranslation(["account", "common"])
  return (
    <div
      role="region"
      aria-label={t("account:filter.summary", {
        count: sites.length,
      })}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 border-t border-border/60 bg-card px-3 py-1 text-xs text-muted-foreground sm:px-4 dark:bg-background [@container(min-width:40rem)]:grid-cols-[auto_minmax(0,1fr)_auto] [@container(min-width:56rem)]:grid-cols-[auto_auto_auto] [@container(min-width:56rem)]:items-baseline [@container(min-width:56rem)]:justify-start [@container(min-width:56rem)]:gap-x-3"
    >
      <span className="self-center [@container(min-width:56rem)]:self-baseline">
        {t("account:filter.summary", {
          count: sites.length,
        })}
      </span>
      <div
        className={cn(
          "col-span-full col-start-1 row-start-2 grid min-w-0 gap-x-3 gap-y-1 [@container(min-width:40rem)]:col-span-1 [@container(min-width:40rem)]:col-start-2 [@container(min-width:40rem)]:row-start-1",
          showTodayCashflow
            ? "grid-cols-3 [@container(min-width:56rem)]:grid-cols-[repeat(3,minmax(0,max-content))] [@container(min-width:56rem)]:items-baseline [@container(min-width:56rem)]:gap-x-3"
            : "grid-cols-1",
        )}
      >
        <div
          role="group"
          aria-label={t("account:financial.availableTotal")}
          className={cn(
            FILTERED_SUMMARY_METRIC_ROWS,
            "min-w-0 [@container(min-width:56rem)]:border-l [@container(min-width:56rem)]:border-border/70 [@container(min-width:56rem)]:pl-2",
          )}
        >
          <BalancePortfolioSummary sites={sites} inline />
        </div>
        {showTodayCashflow && (
          <>
            <div
              role="group"
              aria-label={t("account:filteredTotals.consumption")}
              className={cn(
                FILTERED_SUMMARY_METRIC_ROWS,
                "min-w-0 space-y-1 [@container(min-width:56rem)]:flex [@container(min-width:56rem)]:flex-wrap [@container(min-width:56rem)]:items-baseline [@container(min-width:56rem)]:gap-2 [@container(min-width:56rem)]:space-y-0 [@container(min-width:56rem)]:pl-2",
              )}
            >
              <Caption className="block min-h-8 font-medium [@container(min-width:30rem)]:min-h-4">
                <FinancialMetricLabel
                  kind={FINANCIAL_METRIC_KINDS.Consumption}
                  className="pl-0 [@container(min-width:56rem)]:pl-5"
                  iconClassName="hidden [@container(min-width:56rem)]:block"
                >
                  {t("account:filteredTotals.consumption")}
                </FinancialMetricLabel>
              </Caption>
              <div
                className={cn(
                  "text-sm leading-tight font-medium tabular-nums",
                  consumption.groups.length
                    ? "text-cashflow-expense"
                    : "text-muted-foreground",
                )}
              >
                <FilteredTodayMetric total={consumption} t={t} compact />
              </div>
            </div>
            <div
              role="group"
              aria-label={t("account:filteredTotals.income")}
              className={cn(
                FILTERED_SUMMARY_METRIC_ROWS,
                "min-w-0 space-y-1 [@container(min-width:56rem)]:flex [@container(min-width:56rem)]:flex-wrap [@container(min-width:56rem)]:items-baseline [@container(min-width:56rem)]:gap-2 [@container(min-width:56rem)]:space-y-0 [@container(min-width:56rem)]:pl-2",
              )}
            >
              <Caption className="block min-h-8 font-medium [@container(min-width:30rem)]:min-h-4">
                <FinancialMetricLabel
                  kind={FINANCIAL_METRIC_KINDS.Income}
                  className="pl-0 [@container(min-width:56rem)]:pl-5"
                  iconClassName="hidden [@container(min-width:56rem)]:block"
                >
                  {t("account:filteredTotals.income")}
                </FinancialMetricLabel>
              </Caption>
              <div
                className={cn(
                  "text-sm leading-tight font-medium tabular-nums",
                  income.groups.length
                    ? "text-cashflow-income"
                    : "text-muted-foreground",
                )}
              >
                <FilteredTodayMetric total={income} t={t} compact />
              </div>
            </div>
          </>
        )}
      </div>
      <div className="col-start-2 row-start-1 [@container(min-width:40rem)]:col-start-3 [@container(min-width:56rem)]:flex [@container(min-width:56rem)]:items-baseline [@container(min-width:56rem)]:pl-2">
        <FinancialTotalsPopover
          title={t("account:financial.filteredSubtotal")}
          triggerLabel={t("account:financial.summaryDetails")}
          sites={sites}
          consumption={consumption}
          income={income}
          showTodayCashflow={showTodayCashflow}
        />
      </div>
      {showTodayCashflow && <ProviderDayUsageSummary sites={sites} />}
    </div>
  )
}
