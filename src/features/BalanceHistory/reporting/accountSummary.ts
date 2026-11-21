import type { FINANCIAL_HISTORY_ACTIVITY_KINDS } from "~/services/history/dailyBalanceHistory/constants"
import type { FinancialHistorySeries } from "~/services/history/dailyBalanceHistory/selectors"

import { groupFinancialHistoryMetrics } from "./financialHistorySelection"

export const BALANCE_HISTORY_REFERENCE_MODES = {
  Archive: "archive",
  Mixed: "mixed",
} as const

export const BALANCE_HISTORY_SUMMARY_COLUMNS = {
  Account: "label",
  FinancialBalances: "financialBalances",
  NativeActivity: "nativeActivity",
  StartBalance: "startBalance",
  EndBalance: "endBalance",
  NetTotal: "netTotal",
  IncomeTotal: "incomeTotal",
  EstimatedIncomeTotal: "estimatedIncomeTotal",
  OutcomeTotal: "outcomeTotal",
  SnapshotCoverage: "snapshotCoverage",
  CashflowCoverage: "cashflowCoverage",
} as const

export const BALANCE_HISTORY_REFERENCE_AMOUNT_COLUMNS = [
  BALANCE_HISTORY_SUMMARY_COLUMNS.StartBalance,
  BALANCE_HISTORY_SUMMARY_COLUMNS.NetTotal,
  BALANCE_HISTORY_SUMMARY_COLUMNS.IncomeTotal,
  BALANCE_HISTORY_SUMMARY_COLUMNS.EstimatedIncomeTotal,
  BALANCE_HISTORY_SUMMARY_COLUMNS.OutcomeTotal,
] as const

export type BalanceHistoryAccountSummaryRow = {
  id: string
  label: string
  startBalance: number | null
  endBalance: number | null
  netTotal: number | null
  incomeTotal: number | null
  estimatedIncomeTotal: number | null
  outcomeTotal: number | null
  nativeActivity?: Array<{
    key: string
    label: string
    amount: string
    value?: string
    sortLabel?: string
    partial?: boolean
    kind: (typeof FINANCIAL_HISTORY_ACTIVITY_KINDS)[keyof typeof FINANCIAL_HISTORY_ACTIVITY_KINDS]
  }>
  snapshotDays: number
  cashflowDays: number
  estimatedIncomeDays: number
  totalDays: number
}

/** Only comparable metrics observed for multiple accounts belong in the sorting menu. */
export function buildNativeHistorySortOptions(
  series: readonly FinancialHistorySeries[],
  rows: readonly BalanceHistoryAccountSummaryRow[],
  optionLabel: (item: FinancialHistorySeries) => string,
) {
  const options = new Map<
    string,
    { label: string; values: Map<string, string> }
  >()
  for (const { key, items } of groupFinancialHistoryMetrics(series)) {
    const values = new Map<string, string>()
    for (const item of items) {
      const value = item.observations.at(-1)?.value
      if (value != null) values.set(item.accountId, value)
    }
    options.set(key, { label: optionLabel(items[0]!), values })
  }
  for (const row of rows) {
    for (const entry of row.nativeActivity ?? []) {
      if (entry.value === undefined) continue
      const option = options.get(entry.key) ?? {
        label: entry.sortLabel ?? entry.label,
        values: new Map<string, string>(),
      }
      option.values.set(row.id, entry.value)
      options.set(entry.key, option)
    }
  }
  return new Map([...options].filter(([, { values }]) => values.size > 1))
}
