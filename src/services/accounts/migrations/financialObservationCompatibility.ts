import { CURRENCIES } from "~/constants/money"
import type { Asset } from "~/services/amounts/assets"
import type { EvidenceRef, UsageScope } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"

/** Recognized active dev contracts describe the same reported USD denomination. */
export function currentDailyUsdContract(
  asset: Asset,
  source: EvidenceRef,
): string | undefined {
  if (
    asset.kind !== ASSET_KINDS.Currency ||
    asset.code !== CURRENCIES.USD ||
    source.kind !== EVIDENCE_KINDS.Reported
  )
    return undefined
  if (
    source.adapter === "daya" &&
    source.operation === "/api/v1/usage/dashboard/stats" &&
    (source.contractVersion === "today-usd/v1" ||
      source.contractVersion === "wallet-usd/v1")
  )
    return "wallet-usd/v1"
  if (
    source.adapter === "aimlapi" &&
    source.operation === "/v2/usage/detail" &&
    (source.contractVersion === "utc-day/v1" || source.contractVersion === "1")
  )
    return "1"
  return undefined
}

/** These verified self reports omit filters; explicit restrictions and identities remain unchanged. */
export function normalizeRecordedDailyReportScope(
  scope: UsageScope,
  asset: Asset,
  source: EvidenceRef,
): UsageScope {
  if (!currentDailyUsdContract(asset, source)) return scope
  const reporting = { ...scope }
  for (const field of ["projects", "keys", "models", "groups"] as const)
    if (reporting[field].kind === SCOPE_SELECTION_KINDS.Unknown)
      reporting[field] = { kind: SCOPE_SELECTION_KINDS.All }
  return reporting
}
