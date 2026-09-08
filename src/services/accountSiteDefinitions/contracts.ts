import type { AccountSiteProductProfileOverride } from "~/services/accounts/accountSiteProfile/contracts"

import type { SiteType } from "./identifiers"

type AccountSitePagePath = `/${string}`

/** Every page is explicit. Null means this integration provides no page navigation. */
export interface AccountSiteRouteConfig {
  loginPath: AccountSitePagePath
  usagePath: AccountSitePagePath | null
  checkInPath: AccountSitePagePath | null
  adminCredentialsPath: AccountSitePagePath | null
  accessTokenPath: AccountSitePagePath | null
  redeemPath: AccountSitePagePath | null
  siteAnnouncementsPath: AccountSitePagePath | null
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

export type ManagedSiteLabelKey =
  | "settings:managedSite.newApi"
  | "settings:managedSite.doneHub"
  | "settings:managedSite.veloera"
  | "settings:managedSite.octopus"
  | "settings:managedSite.axonHub"
  | "settings:managedSite.claudeCodeHub"
  | "settings:managedSite.sub2api"

export type ManagedSiteMessagesKey =
  | "newapi"
  | "donehub"
  | "veloera"
  | "octopus"
  | "axonhub"
  | "claudecodehub"
  | "sub2api"

export interface ManagedResourceProductPolicy {
  labelKey: ManagedSiteLabelKey
  messagesKey: ManagedSiteMessagesKey
  primaryKind: ManagedResourceKind
  itemLabelKey: "managedSiteChannels:table.columns.name"
  tableFieldIds: readonly string[]
  detailFieldIds: readonly string[]
  settingsTarget: {
    tabId: "managedSite"
    anchor?: string
  }
}

export interface AccountSiteDefinitionOnboardingMetadata {
  displayName?: string
  accountForm?: { fixedSiteUrl?: string; defaultSiteName?: string }
  detection?: AccountSiteDetectionMetadata
  routes: AccountSiteRouteConfig
  manualAddGuideAnchor?: AccountSiteManualAddGuideAnchor
}

export interface AccountSiteDefinition {
  siteType: SiteType
  scopes: readonly AccountSiteDefinitionScope[]
  adapterFamily: AccountSiteBackendFamily
  /** Token identity/auth formatting; absent means opaque keys with no prefix rewriting. */
  tokenKey?: { optionalSkPrefix: boolean }
  managedResource?: ManagedResourceProductPolicy
  onboarding?: AccountSiteDefinitionOnboardingMetadata
  productProfile?: AccountSiteProductProfileOverride
}

/** Account registrations must own a complete route declaration. Null means no supported page navigation. */
export type RegisteredAccountSiteDefinition = AccountSiteDefinition & {
  onboarding: AccountSiteDefinitionOnboardingMetadata
}
