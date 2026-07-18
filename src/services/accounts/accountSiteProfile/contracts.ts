import type { AccountSiteType } from "~/constants/siteType"
import type { AuthTypeEnum } from "~/types"
import type { AccountTodayStatsAvailability } from "~/types/accountTodayStats"

export const ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS = {
  None: "none",
  Sub2ApiRefreshToken: "sub2api_refresh_token",
} as const

export type AccountSiteSupplementalAuthKind =
  (typeof ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS)[keyof typeof ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS]

export const ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES = {
  None: "none",
  Account: "account",
} as const

export type AccountSiteAuthSessionRefreshLockScope =
  (typeof ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES)[keyof typeof ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES]

export const ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING = {
  ResponseKey: "response_key",
  OneTimeSecretDialog: "one_time_secret_dialog",
} as const

export type AccountSiteCreatedTokenSecretHandling =
  (typeof ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING)[keyof typeof ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING]

export const ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES = {
  IpList: "ip_list",
  SubnetLimit: "subnet_limit",
} as const

export type AccountSiteTokenFormNetworkLimitPolicy =
  (typeof ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES)[keyof typeof ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES]

export const ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING = {
  Supported: "supported",
  Unsupported: "unsupported",
} as const

export type AccountSiteModelListDirectPricing =
  (typeof ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING)[keyof typeof ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING]

export const ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS = {
  None: "none",
  RuntimeKey: "runtime_key",
} as const

export type AccountSiteModelListTokenScopedCatalogFallback =
  (typeof ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS)[keyof typeof ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS]

export const ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS = {
  None: "none",
  Sub2Api: "sub2api",
} as const

export type AccountSiteModelListDashboardEstimateLoader =
  (typeof ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS)[keyof typeof ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS]

export const ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES = {
  Account: "account",
  Token: "token",
} as const

export type AccountSiteModelListStatusScope =
  (typeof ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES)[keyof typeof ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES]

export const ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES = {
  Response: "response",
  Profile: "profile",
} as const

export type AccountSiteModelListDisplayCapabilitySource =
  (typeof ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES)[keyof typeof ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES]

export const ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS = {
  ACCOUNT_OR_RUNTIME_KEY: "account-or-runtime-key",
  NOT_APPLICABLE: "not-applicable",
} as const

export type AccountSiteModelListGroupSemantics =
  (typeof ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS)[keyof typeof ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS]

export type AccountSiteUrlProfile = {
  recognizedHostnames: readonly string[]
  storageOrigin?: string
  managedChannelOrigin?: string
  duplicateOrigin?: string
}

export type AccountSiteIdentityProfile = {
  usernameRequired: boolean
  storedUserIdentityFields: readonly string[]
}

export type AccountSiteAuthProfile = {
  allowedAuthTypes: readonly AuthTypeEnum[]
  defaultAuthType: AuthTypeEnum
  defaultAuthHostnames: readonly string[]
  supportsCookieAuth: boolean
  supportsBuiltInCheckInDetection: boolean
}

export type AccountSiteAuthSessionProfile = {
  kind: AccountSiteSupplementalAuthKind
  decoratesAccountApiRequests: boolean
  refreshLockScope: AccountSiteAuthSessionRefreshLockScope
}

export type AccountSiteCreatedTokenProfile = {
  secretHandling: AccountSiteCreatedTokenSecretHandling
}

export type AccountSiteTokenFormProfile = {
  networkLimitPolicy: AccountSiteTokenFormNetworkLimitPolicy
}

export type AccountSiteModelListProfile = {
  directPricing: AccountSiteModelListDirectPricing
  tokenScopedCatalogFallback: AccountSiteModelListTokenScopedCatalogFallback
  dashboardEstimateLoader: AccountSiteModelListDashboardEstimateLoader
  statusScope: AccountSiteModelListStatusScope
  displayCapabilitiesSource: AccountSiteModelListDisplayCapabilitySource
  groupSemantics: AccountSiteModelListGroupSemantics
}

export type AccountSiteMetricProfile = {
  deferredTodayStatsAvailability: AccountTodayStatsAvailability
  legacyTodayStatsAvailability: AccountTodayStatsAvailability
}

export type AccountSiteProductProfile = {
  siteType: AccountSiteType
  auth: AccountSiteAuthProfile
  authSession: AccountSiteAuthSessionProfile
  createdToken: AccountSiteCreatedTokenProfile
  identity: AccountSiteIdentityProfile
  modelList: AccountSiteModelListProfile
  metrics: AccountSiteMetricProfile
  supplementalAuth: {
    kind: AccountSiteSupplementalAuthKind
  }
  tokenForm: AccountSiteTokenFormProfile
  urls: AccountSiteUrlProfile
}

type AccountSiteProductProfileOverrideSource = Omit<
  AccountSiteProductProfile,
  "siteType"
>

export type AccountSiteProductProfileOverride = {
  [Key in keyof AccountSiteProductProfileOverrideSource]?: AccountSiteProductProfileOverrideSource[Key] extends readonly (infer Item)[]
    ? readonly Item[]
    : AccountSiteProductProfileOverrideSource[Key] extends object
      ? Partial<AccountSiteProductProfileOverrideSource[Key]>
      : AccountSiteProductProfileOverrideSource[Key]
}
