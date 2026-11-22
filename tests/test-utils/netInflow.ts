import { CURRENCIES } from "~/constants/money"
import { balancePosition } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_ROLES,
  EVIDENCE_KINDS,
  FINANCIAL_SUBJECT_KINDS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { getFinancialSeriesKey } from "~/services/history/dailyBalanceHistory/identity"
import {
  NET_INFLOW_STATUSES,
  type NetInflowResult,
} from "~/services/history/dailyBalanceHistory/netInflow"
import { TODAY_INCOME_ESTIMATE_STATUS } from "~/types/dailyBalanceHistory"
import type { NetInflowEstimateItem } from "~/types/dailyBalanceHistory"

/** Pair an estimate with the current ledger identity required by row and total consumers. */
export function buildNetInflowItem(
  netInflow = buildNetInflow(),
): NetInflowEstimateItem {
  const position = balancePosition({
    id: "ledger",
    scope: netInflow.scope,
    asset: netInflow.amount.asset,
    source: netInflow.source,
    value: "50",
    observedAt: netInflow.window.end,
    role: BALANCE_ROLES.Ledger,
  })
  return {
    seriesKey: getFinancialSeriesKey(position),
    position,
    status: TODAY_INCOME_ESTIMATE_STATUS.available,
    netInflow,
  }
}

/** A native, negative, fully scoped net change for presentation and aggregation tests. */
export function buildNetInflow(
  value = "-5",
): Extract<NetInflowResult, { status: typeof NET_INFLOW_STATUSES.Available }> {
  return {
    status: NET_INFLOW_STATUSES.Available,
    amount: {
      value,
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
    },
    classification: "unclassified-net-change",
    window: {
      start: 1767225600000,
      end: 1767229200000,
      timeZone: "Asia/Shanghai",
    },
    source: {
      adapter: "test",
      operation: "wallet",
      contractVersion: "2",
      kind: EVIDENCE_KINDS.Derived,
    },
    scope: {
      subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: "account" },
      authority: "https://example.com",
      walletId: "wallet",
      projects: { kind: SCOPE_SELECTION_KINDS.All },
      keys: { kind: SCOPE_SELECTION_KINDS.All },
      models: { kind: SCOPE_SELECTION_KINDS.All },
      groups: { kind: SCOPE_SELECTION_KINDS.All },
    },
  }
}
