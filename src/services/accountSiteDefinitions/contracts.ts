import type { AccountSiteProductProfileOverride } from "~/services/accounts/accountSiteProfile/contracts"

import type { SiteType } from "./identifiers"

export type AccountSiteRouteConfig = {
  loginPath?: string
  usagePath?: string
  checkInPath?: string
  adminCredentialsPath?: string
  redeemPath?: string
  siteAnnouncementsPath?: string
}

export type AccountSiteDetectionMetadata = {
  titlePatterns?: readonly RegExp[]
  hostnames?: readonly string[]
  compatUserIdHeaderNames?: readonly string[]
}

export const ACCOUNT_SITE_ADAPTER_FAMILIES = {
  NewApiFamily: "newApiFamily",
  Sub2Api: "sub2api",
  Aihubmix: "aihubmix",
  Unsupported: "unsupported",
} as const

export type AccountSiteAdapterFamily =
  (typeof ACCOUNT_SITE_ADAPTER_FAMILIES)[keyof typeof ACCOUNT_SITE_ADAPTER_FAMILIES]

export const ACCOUNT_SITE_DEFINITION_SCOPES = {
  Account: "account",
  Managed: "managed",
} as const

export type AccountSiteDefinitionScope =
  (typeof ACCOUNT_SITE_DEFINITION_SCOPES)[keyof typeof ACCOUNT_SITE_DEFINITION_SCOPES]

export type AccountSiteDefinitionOnboardingMetadata = {
  detection?: AccountSiteDetectionMetadata
  routes?: AccountSiteRouteConfig
}

export const ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES = {
  DirectPricing: "direct_pricing",
  TokenScopedRuntimeCatalog: "token_scoped_runtime_catalog",
  Unsupported: "unsupported",
} as const

export type AccountSiteModelListExpectedRoute =
  (typeof ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES)[keyof typeof ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES]

export type AccountSiteDefinitionReadiness = {
  modelList?: {
    expectedRoute: AccountSiteModelListExpectedRoute
  }
}

export type AccountSiteDefinition = {
  siteType: SiteType
  scopes: readonly AccountSiteDefinitionScope[]
  adapterFamily: AccountSiteAdapterFamily
  onboarding?: AccountSiteDefinitionOnboardingMetadata
  productProfile?: AccountSiteProductProfileOverride
  readiness?: AccountSiteDefinitionReadiness
}
