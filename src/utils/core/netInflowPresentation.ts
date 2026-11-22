import type { TFunction } from "i18next"

import { NET_INFLOW_EXCLUSION_REASONS } from "~/services/accounts/metrics/netInflowTotals"
import type { Asset } from "~/services/amounts/assets"
import { ASSET_KINDS } from "~/services/amounts/financialConstants"
import { NET_INFLOW_REASONS } from "~/services/history/dailyBalanceHistory/netInflow"
import { TODAY_INCOME_ESTIMATE_STATUS } from "~/types/dailyBalanceHistory"

/** An unavailable amount still retains its identified native asset. */
export function getNetInflowAssetLabel(asset: Asset): string {
  switch (asset.kind) {
    case ASSET_KINDS.Currency:
      return asset.code
    case ASSET_KINDS.Crypto:
      return asset.id
    case ASSET_KINDS.Quota:
      return asset.displayLabel
    case ASSET_KINDS.Unknown:
      return ""
  }
}

/** Rejection reasons describe missing comparability rather than inventing zero income. */
export function getNetInflowReasonLabel(
  reason: string | undefined,
  t: TFunction,
): string {
  switch (reason) {
    case TODAY_INCOME_ESTIMATE_STATUS.historyUnavailable:
      return t("balanceHistory:messages.error.loadTitle")
    case TODAY_INCOME_ESTIMATE_STATUS.disabled:
      return t("account:netInflow.reasons.disabled")
    case TODAY_INCOME_ESTIMATE_STATUS.missingCurrentSnapshot:
    case NET_INFLOW_REASONS.Observation:
      return t("account:netInflow.reasons.balance")
    case TODAY_INCOME_ESTIMATE_STATUS.missingBaseline:
      return t("account:netInflow.reasons.baseline")
    case TODAY_INCOME_ESTIMATE_STATUS.missingCashflow:
    case NET_INFLOW_REASONS.Consumption:
      return t("account:netInflow.reasons.consumption")
    case TODAY_INCOME_ESTIMATE_STATUS.manualBalance:
      return t("account:netInflow.reasons.manual")
    case TODAY_INCOME_ESTIMATE_STATUS.legacy:
      return t("account:financial.legacy")
    case TODAY_INCOME_ESTIMATE_STATUS.intervalMismatch:
    case NET_INFLOW_REASONS.Interval:
      return t("account:netInflow.reasons.interval")
    case NET_INFLOW_REASONS.Identity:
      return t("account:netInflow.reasons.identity")
    case NET_INFLOW_EXCLUSION_REASONS.DuplicateWallet:
      return t("account:netInflow.reasons.duplicate")
    case NET_INFLOW_EXCLUSION_REASONS.WalletConflict:
      return t("account:netInflow.reasons.conflict")
    case NET_INFLOW_REASONS.Precision:
      return t("account:netInflow.reasons.precision")
    default:
      return t("account:netInflow.reasons.unverified")
  }
}
