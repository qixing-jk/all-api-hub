import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES, type SiteType } from "~/constants/siteType"
import type { Asset, QuotaAsset } from "~/services/amounts/assets"
import { normalizeDecimalUnits, parseDecimal } from "~/services/amounts/decimal"
import { ASSET_KINDS } from "~/services/amounts/financialConstants"
import { NEW_API_FINANCIAL_CONTRACT_VERSIONS } from "~/services/apiService/newApiFamily/financialContractVersions"

const NEW_API_STANDARD_QUOTA_PER_USD = 500_000

/** Unverified deployments retain their own raw quota identity. */
export function newApiQuotaAsset(authority: string): QuotaAsset {
  return {
    id: `${new URL(authority).origin}:new-api-quota`,
    label: "quota",
    displayScale: 1,
    displayLabel: "quota",
  }
}

/**
 * Common family consoles display quota as USD at their standard 500,000 scale.
 * Canonical USD allows common monetary portfolios; unknown sites retain native
 * quota. The denomination does not imply cash classification. Custom display
 * symbols/rates are outside this adaptation.
 * Sources: QuantumNous/new-api web/src/lib/currency.ts and
 * web/src/stores/system-config-store.ts; One API/OneHub renderQuota helpers.
 */
export function newApiFinancialAmount(
  value: unknown,
  authority: string,
  siteType?: SiteType | null,
) {
  const raw = parseDecimal(value)
  const monetary = siteType != null && siteType !== SITE_TYPES.UNKNOWN
  const asset: Asset = monetary
    ? { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD }
    : { kind: ASSET_KINDS.Quota, ...newApiQuotaAsset(authority) }
  return {
    asset,
    nativeUnitsPerAsset: monetary ? NEW_API_STANDARD_QUOTA_PER_USD : undefined,
    value: monetary
      ? normalizeDecimalUnits(value, NEW_API_STANDARD_QUOTA_PER_USD)
      : raw,
    contractVersion: monetary
      ? NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd
      : NEW_API_FINANCIAL_CONTRACT_VERSIONS.NativeQuota,
    ...(raw === undefined ? {} : { amountInputs: { quota: raw } }),
  }
}
