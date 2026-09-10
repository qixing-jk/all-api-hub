import type { AccountSiteType } from "~/constants/siteType"
import {
  getAccountSiteModelListProfile,
  type AccountSiteModelListDashboardEstimateLoader,
  type AccountSiteModelListDisplayCapabilitySource,
  type AccountSiteModelListStatusScope,
} from "~/services/accounts/accountSiteProfile"
import { canListAccountRuntimeKeys } from "~/services/accounts/keyProductCapabilities"
import type { ModelCatalogCapability } from "~/services/apiAdapters/contracts/modelCatalog"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import type { ProviderModelCatalogCapability } from "~/services/apiAdapters/contracts/providerModelCatalog"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"

export const MODEL_LIST_ACCOUNT_SOURCE_ROUTES = {
  DirectPricing: "direct_pricing",
  ProviderCatalog: "provider_catalog",
  TokenScopedRuntimeCatalog: "token_scoped_runtime_catalog",
  Unsupported: "unsupported",
} as const

export const MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS = {
  NoSupportedRoute: "no_supported_route",
} as const

type ModelListAccountSourceUnsupportedReason =
  (typeof MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS)[keyof typeof MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS]

interface ModelListAccountSourceBaseReadiness {
  statusScope: AccountSiteModelListStatusScope
  displayCapabilitiesSource: AccountSiteModelListDisplayCapabilitySource
}

type ModelListAccountSourceReadiness =
  | (ModelListAccountSourceBaseReadiness & {
      route: typeof MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing
      modelPricing: ModelPricingCapability
    })
  | (ModelListAccountSourceBaseReadiness & {
      route: typeof MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog
      modelCatalog: ModelCatalogCapability
      requiresTokenKeyResolution: boolean
      dashboardEstimateLoader: AccountSiteModelListDashboardEstimateLoader
    })
  | (ModelListAccountSourceBaseReadiness & {
      route: typeof MODEL_LIST_ACCOUNT_SOURCE_ROUTES.ProviderCatalog
      providerModelCatalog: ProviderModelCatalogCapability
    })
  | (ModelListAccountSourceBaseReadiness & {
      route: typeof MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported
      reason: ModelListAccountSourceUnsupportedReason
    })

type ModelListAccountRuntimeKeyFallbackContext = Parameters<
  typeof canListAccountRuntimeKeys
>[0]

/**
 * Resolves which account-backed model-list source can be used for an account site.
 */
export function resolveModelListAccountSourceReadiness(account: {
  siteType: AccountSiteType
}): ModelListAccountSourceReadiness {
  const profile = getAccountSiteModelListProfile(account.siteType)
  const accountCapabilities = getSiteTypeCapabilities(account.siteType).account
  const base = {
    statusScope: profile.statusScope,
    displayCapabilitiesSource: profile.displayCapabilitiesSource,
  }

  if (accountCapabilities?.modelPricing) {
    return {
      ...base,
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
      modelPricing: accountCapabilities.modelPricing,
    }
  }

  if (accountCapabilities?.providerModelCatalog) {
    return {
      ...base,
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.ProviderCatalog,
      providerModelCatalog: accountCapabilities.providerModelCatalog,
    }
  }

  if (accountCapabilities?.modelCatalog) {
    return {
      ...base,
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog,
      modelCatalog: accountCapabilities.modelCatalog,
      requiresTokenKeyResolution: Boolean(accountCapabilities.keyManagement),
      dashboardEstimateLoader: profile.dashboardEstimateLoader,
    }
  }

  return {
    ...base,
    route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
    reason: MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS.NoSupportedRoute,
  }
}

/**
 * Returns whether Model List can load fallback catalogs through account runtime keys.
 */
export function canLoadModelListAccountFallbackRuntimeKeys(
  account: ModelListAccountRuntimeKeyFallbackContext,
): boolean {
  if (!canListAccountRuntimeKeys(account)) return false

  return (
    resolveModelListAccountSourceReadiness(account).route ===
    MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog
  )
}
