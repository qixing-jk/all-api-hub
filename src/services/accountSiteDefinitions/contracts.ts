import type { AccountSiteProductProfileOverride } from "~/services/accounts/accountSiteProfile/contracts"

import type { SiteType } from "./identifiers"

export interface AccountSiteRouteConfig {
  loginPath?: string
  usagePath?: string
  checkInPath?: string
  adminCredentialsPath?: string
  redeemPath?: string
  siteAnnouncementsPath?: string
}

export interface AccountSiteDetectionMetadata {
  titlePatterns?: readonly RegExp[]
  hostnames?: readonly string[]
  compatUserIdHeaderNames?: readonly string[]
}

export const ACCOUNT_SITE_ADAPTER_FAMILIES = {
  NewApiFamily: "newApiFamily",
  Sub2Api: "sub2api",
  VoApiV2: "voapiV2",
  Aihubmix: "aihubmix",
  SharedChat: "sharedchat",
  Unsupported: "unsupported",
} as const

export type AccountSiteBackendFamily =
  (typeof ACCOUNT_SITE_ADAPTER_FAMILIES)[keyof typeof ACCOUNT_SITE_ADAPTER_FAMILIES]

export const ACCOUNT_SITE_DEFINITION_SCOPES = {
  Account: "account",
  Managed: "managed",
} as const

export type AccountSiteDefinitionScope =
  (typeof ACCOUNT_SITE_DEFINITION_SCOPES)[keyof typeof ACCOUNT_SITE_DEFINITION_SCOPES]

export const MANAGED_RESOURCE_MODES = {
  LegacyChannel: "legacy-channel",
  NativeResource: "native-resource",
} as const

export type ManagedResourceMode =
  (typeof MANAGED_RESOURCE_MODES)[keyof typeof MANAGED_RESOURCE_MODES]

export const MANAGED_RESOURCE_KINDS = {
  Channel: "channel",
} as const

export type ManagedResourceKind =
  (typeof MANAGED_RESOURCE_KINDS)[keyof typeof MANAGED_RESOURCE_KINDS]

export const MANAGED_RESOURCE_PRODUCT_ACTIONS = {
  Create: "create",
  DeleteSelected: "delete-selected",
  Migrate: "migrate",
} as const

export type ManagedResourceProductAction =
  (typeof MANAGED_RESOURCE_PRODUCT_ACTIONS)[keyof typeof MANAGED_RESOURCE_PRODUCT_ACTIONS]

export interface ManagedResourceProductPolicy {
  mode: ManagedResourceMode
  primaryKind: ManagedResourceKind
  titleKey: "managedSiteChannels:title"
  itemLabelKey: "managedSiteChannels:table.columns.name"
  tableFieldIds: readonly string[]
  detailFieldIds: readonly string[]
  actions: readonly ManagedResourceProductAction[]
  settingsTarget: {
    tabId: "managedSite"
    anchor?: string
  }
}

export interface AccountSiteDefinitionOnboardingMetadata {
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

export interface AccountSiteDefinitionReadiness {
  modelList?: {
    expectedRoute: AccountSiteModelListExpectedRoute
  }
}

export interface AccountSiteDefinition {
  siteType: SiteType
  scopes: readonly AccountSiteDefinitionScope[]
  adapterFamily: AccountSiteBackendFamily
  managedResource?: ManagedResourceProductPolicy
  onboarding?: AccountSiteDefinitionOnboardingMetadata
  productProfile?: AccountSiteProductProfileOverride
  readiness?: AccountSiteDefinitionReadiness
}
