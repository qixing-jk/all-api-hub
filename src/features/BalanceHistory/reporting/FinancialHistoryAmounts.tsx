import { ChevronRight } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  BUDGET_AMOUNT_FIELDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import type { FinancialHistorySeries } from "~/services/history/dailyBalanceHistory/selectors"
import { formatBudgetAmount } from "~/utils/core/budgetPresentation"
import { formatAssetAmount } from "~/utils/core/money"

import type { getFinancialHistoryPresentation } from "./financialHistoryPresentation"

/** List one account's recorded balances in its summary row and open individual records. */
export function FinancialHistoryAmounts({
  items,
  presentation,
  onOpen,
  selectedKey,
}: {
  items: FinancialHistorySeries[]
  presentation: ReturnType<typeof getFinancialHistoryPresentation>
  onOpen: (key: string) => void
  selectedKey?: string
}) {
  const { t, i18n } = useTranslation("balanceHistory")
  const { optionLabel, statusLabel, displayAmount } = presentation
  if (!items.length) return <span className="text-muted-foreground">—</span>
  return (
    <ul className="min-w-40 space-y-1">
      {items.map((item) => {
        const record = item.observations.at(-1)
        if (!record) return null
        const label = optionLabel(item, false)
        const date = new Date(record.observedAt ?? record.at)
        const amount = record.allowance
          ? formatBudgetAmount(
              record.allowance.constraint,
              BUDGET_AMOUNT_FIELDS.Remaining,
              t,
              false,
              {
                formatAmount: (amount) =>
                  formatAssetAmount(amount, i18n.language),
              },
            )
          : record.value === null
            ? "—"
            : displayAmount(item.position.asset, record.value)
        return (
          <li key={item.key}>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={selectedKey === item.key}
              data-balance-history-record={item.key}
              onClick={() => onOpen(item.key)}
              className="group flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              title={date.toLocaleString(i18n.language)}
            >
              <span className="min-w-0 [overflow-wrap:anywhere] whitespace-normal text-muted-foreground">
                {label}
                {item.values.length > 1 && item.values[0] != null && (
                  <span className="block text-xs text-muted-foreground">
                    {t("table.columns.startBalance")} ·{" "}
                    {displayAmount(item.position.asset, item.values[0])}
                  </span>
                )}
              </span>
              <span className="max-w-[60%] min-w-0 shrink-0 text-right">
                <span className="inline-flex items-center gap-1 font-medium tabular-nums">
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {amount}
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-3 shrink-0 text-muted-foreground"
                  />
                </span>
                {record.status !== OBSERVATION_STATUSES.Known && (
                  <span className="block text-muted-foreground">
                    {statusLabel(record.status)}
                  </span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
