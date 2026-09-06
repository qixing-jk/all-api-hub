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

export const ACCOUNT_SITE_MANUAL_ADD_GUIDE_ANCHORS = {
  NewApi: "manual-new-api",
  Sub2Api: "manual-sub2api",
  OpenRouter: "manual-openrouter",
} as const

export type AccountSiteManualAddGuideAnchor =
  (typeof ACCOUNT_SITE_MANUAL_ADD_GUIDE_ANCHORS)[keyof typeof ACCOUNT_SITE_MANUAL_ADD_GUIDE_ANCHORS]

export const ACCOUNT_SITE_ADAPTER_FAMILIES = {
  NewApiFamily: "newApiFamily",
  Sub2Api: "sub2api",
  VoApiV2: "voapiV2",
  Aihubmix: "aihubmix",
  SharedChat: "sharedchat",
  OpenRouter: "openrouter",
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

export const MANAGED_RESOURCE_KINDS = {
  Channel: "channel",
} as const

export type ManagedResourceKind =
  (typeof MANAGED_RESOURCE_KINDS)[keyof typeof MANAGED_RESOURCE_KINDS]

export interface ManagedResourceProductPolicy {
  primaryKind: ManagedResourceKind
  titleKey: "managedSiteChannels:title"
  itemLabelKey: "managedSiteChannels:table.columns.name"
  tableFieldIds: readonly string[]
  detailFieldIds: readonly string[]
  settingsTarget: {
    tabId: "managedSite"
    anchor?: string
  }
}

export interface AccountSiteDefinitionOnboardingMetadata {
  detection?: AccountSiteDetectionMetadata
  routes?: AccountSiteRouteConfig
  manualAddGuideAnchor?: AccountSiteManualAddGuideAnchor
}

export interface AccountSiteDefinition {
  siteType: SiteType
  scopes: readonly AccountSiteDefinitionScope[]
  adapterFamily: AccountSiteBackendFamily
  managedResource?: ManagedResourceProductPolicy
  onboarding?: AccountSiteDefinitionOnboardingMetadata
  productProfile?: AccountSiteProductProfileOverride
}
