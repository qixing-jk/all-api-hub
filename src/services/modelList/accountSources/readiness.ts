import type { AccountSiteType } from "~/constants/siteType"
import {
  ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING,
  ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS,
  getAccountSiteModelListProfile,
  type AccountSiteModelListDashboardEstimateLoader,
  type AccountSiteModelListDisplayCapabilitySource,
  type AccountSiteModelListStatusScope,
} from "~/services/accounts/accountSiteProfile"
import type { ModelCatalogCapability } from "~/services/apiAdapters/contracts/modelCatalog"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"

export const MODEL_LIST_ACCOUNT_SOURCE_ROUTES = {
  DirectPricing: "direct_pricing",
  TokenScopedRuntimeCatalog: "token_scoped_runtime_catalog",
  Unsupported: "unsupported",
} as const

export const MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS = {
  MissingModelPricingCapability: "missing_model_pricing_capability",
  MissingModelCatalogCapability: "missing_model_catalog_capability",
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
      dashboardEstimateLoader: AccountSiteModelListDashboardEstimateLoader
    })
  | (ModelListAccountSourceBaseReadiness & {
      route: typeof MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported
      reason: ModelListAccountSourceUnsupportedReason
    })

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

  if (
    profile.directPricing === ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Supported
  ) {
    if (accountCapabilities?.modelPricing) {
      return {
        ...base,
        route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
        modelPricing: accountCapabilities.modelPricing,
      }
    }

    if (
      profile.tokenScopedCatalogFallback !==
      ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.RuntimeKey
    ) {
      return {
        ...base,
        route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
        reason:
          MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS.MissingModelPricingCapability,
      }
    }
  }

  if (
    profile.tokenScopedCatalogFallback ===
    ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.RuntimeKey
  ) {
    if (accountCapabilities?.modelCatalog) {
      return {
        ...base,
        route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog,
        modelCatalog: accountCapabilities.modelCatalog,
        dashboardEstimateLoader: profile.dashboardEstimateLoader,
      }
    }

    return {
      ...base,
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
      reason:
        MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS.MissingModelCatalogCapability,
    }
  }

  return {
    ...base,
    route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
    reason: MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS.NoSupportedRoute,
  }
}
