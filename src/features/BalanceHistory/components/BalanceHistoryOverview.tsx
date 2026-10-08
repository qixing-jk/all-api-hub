import { useTranslation } from "react-i18next"

import { Card } from "~/components/ui"
import { type useBalanceHistoryViewModel } from "~/features/BalanceHistory/hooks/useBalanceHistoryViewModel"
import { BALANCE_HISTORY_TEST_IDS } from "~/features/BalanceHistory/testIds"
import { formatMoneyFixed } from "~/utils/core/money"

/** Render this reporting section from its existing ViewModel snapshot. */
export function BalanceHistoryOverview({
  model,
}: {
  model: Pick<
    ReturnType<typeof useBalanceHistoryViewModel>,
    "overviewTotals" | "currencySymbol"
  >
}) {
  const { t } = useTranslation("balanceHistory")
  const { overviewTotals, currencySymbol } = model
  return (
    <Card padding="md" data-testid={BALANCE_HISTORY_TEST_IDS.overview}>
      <div className="space-y-density-4">
        <div className="text-sm font-medium">{t("overview.title")}</div>
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
  )
}
