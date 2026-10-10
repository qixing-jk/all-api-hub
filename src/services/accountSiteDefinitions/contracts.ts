import type { AccountLoginMethodId } from "~/constants/accountLogin"
import type { AccountSiteProductProfileOverride } from "~/services/accounts/accountSiteProfile/contracts"

import type { SiteType } from "./identifiers"
import type { NewApiAccountLoginProtocolConfig } from "./loginProtocols/newApi"

type AccountSitePagePath = `/${string}`

/** Every page is explicit. Null means this integration provides no page navigation. */
export interface AccountSiteRouteConfig {
  /** Verified human-readable pricing page; absent means no known destination. */
  pricingPath?: AccountSitePagePath
  /** Optional upstream search parameter; old versions may safely ignore it. */
  pricingSearchParam?: string
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
  FreeModel: "freemodel",
  Cubence: "cubence",
  RightCode: "rightcode",
  OpenRouter: "openrouter",
  KimiOpenPlatform: "kimiOpenPlatform",
  Grsai: "grsai",
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
  | "settings:managedSite.cliProxyApi"
  | "settings:managedSite.newApi"
  | "settings:managedSite.doneHub"
  | "settings:managedSite.veloera"
  | "settings:managedSite.octopus"
  | "settings:managedSite.axonHub"
  | "settings:managedSite.claudeCodeHub"
  | "settings:managedSite.sub2api"
  | "settings:managedSite.omniroute"
  | "settings:managedSite.gptLoad"
  | "settings:managedSite.magpie"

export type ManagedSiteMessagesKey =
  | "cliProxyApi"
  | "newapi"
  | "donehub"
  | "veloera"
  | "octopus"
  | "axonhub"
  | "claudecodehub"
  | "sub2api"
  | "omniroute"
  | "gptLoad"
  | "magpie"

export interface ManagedResourceProductPolicy {
  /** Whether native ids can identify released numeric channel-config records. */
  legacyNumericChannelConfig: boolean
  /** Official upstream installation or quick-start guide. */
  getStartedUrl: `https://${string}`
  labelKey: ManagedSiteLabelKey
  messagesKey: ManagedSiteMessagesKey
  primaryKind: ManagedResourceKind
  itemLabelKey: "managedSiteChannels:table.columns.name"
  tableFieldIds: readonly string[]
  detailFieldIds: readonly string[]
  consoleRoutes: {
    channels: AccountSitePagePath
    tokens: AccountSitePagePath
  }
  settingsTarget: {
    tabId: "managedSite"
    anchor?: string
  }
}

/** Presentation choices for completing site-owned account credential verification. */
export interface AccountSiteAccessTokenVerificationGuide {
  copy: "security" | "apiyi" | "laozhang"
  showRotationWarning: boolean
}

export interface AccountSiteDefinitionOnboardingMetadata {
  displayName?: string
  accountForm?: {
    fixedSiteUrl?: string
    defaultSiteName?: string
    accessTokenLabelKey?: "form.openrouterManagementKey"
    accessTokenGuidanceTitleKey?: "form.openrouterManagementKeyGuidanceTitle"
    accessTokenGuidanceKey?: "form.openrouterManagementKeyGuidance"
  }
  detection?: AccountSiteDetectionMetadata
  routes: AccountSiteRouteConfig
  manualAddGuideAnchor?: AccountSiteManualAddGuideAnchor
  accessTokenVerificationGuide?: AccountSiteAccessTokenVerificationGuide
  /** Primary dashboard user store; absent keeps the compatible `user` store. */
  browserUserStorage?: "apiyi" | "v-api"
}

/** Static login adoption; methods and their execution semantics belong to the registered adapter. */
export interface AccountSiteLoginConfig {
  methods: readonly AccountLoginMethodId[]
  /** Only protocols needing per-site overrides declare options here. */
  protocols?: {
    newApi?: NewApiAccountLoginProtocolConfig
  }
}

export interface AccountSiteDefinition {
  siteType: SiteType
  /** Released account-token locators map to this native scope, independently of the current adapter family. */
  legacyAccountTokenScope?: "account"
  scopes: readonly AccountSiteDefinitionScope[]
  adapterFamily: AccountSiteBackendFamily
  /** Token identity/auth formatting; absent means opaque keys with no prefix rewriting. */
  tokenKey?: { optionalSkPrefix: boolean }
  accountLogin?: AccountSiteLoginConfig
  managedResource?: ManagedResourceProductPolicy
  onboarding?: AccountSiteDefinitionOnboardingMetadata
  productProfile?: AccountSiteProductProfileOverride
}

/** Account registrations must own a complete route declaration. Null means no supported page navigation. */
export type RegisteredAccountSiteDefinition = AccountSiteDefinition & {
  onboarding: AccountSiteDefinitionOnboardingMetadata
}
