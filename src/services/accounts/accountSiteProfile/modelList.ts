import type { AccountSiteType } from "~/constants/siteType"

import {
  ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING,
  ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS,
  type AccountSiteModelListProfile,
} from "./contracts"
import { getAccountSiteProductProfile } from "./registry"

/**
 * Resolves Model List source-account policy for an account site type.
 */
export function getAccountSiteModelListProfile(
  siteType: AccountSiteType,
): AccountSiteModelListProfile {
  return { ...getAccountSiteProductProfile(siteType).modelList }
}

/**
 * Returns whether the account site can load direct account-scoped model pricing.
 */
export function supportsAccountSiteDirectModelPricing(account: {
  siteType: AccountSiteType
}): boolean {
  return (
    getAccountSiteProductProfile(account.siteType).modelList.directPricing ===
    ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Supported
  )
}

/**
 * Returns whether the account site should fall back to runtime-key catalogs.
 */
export function shouldUseAccountSiteRuntimeKeyCatalogFallback(account: {
  siteType: AccountSiteType
}): boolean {
  return (
    getAccountSiteProductProfile(account.siteType).modelList
      .tokenScopedCatalogFallback ===
    ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.RuntimeKey
  )
}
