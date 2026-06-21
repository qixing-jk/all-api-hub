import {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_HOSTNAMES,
  AIHUBMIX_WEB_ORIGIN,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { AuthTypeEnum } from "~/types"

import {
  ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES,
  ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING,
  ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS,
  ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING,
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
  ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES,
  ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS,
  ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS,
  ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES,
  type AccountSiteProductProfile,
} from "./contracts"

export const DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE: AccountSiteProductProfile = {
  siteType: SITE_TYPES.UNKNOWN,
  auth: {
    allowedAuthTypes: [AuthTypeEnum.AccessToken, AuthTypeEnum.Cookie],
    defaultAuthType: AuthTypeEnum.AccessToken,
    defaultAuthHostnames: [],
    supportsCookieAuth: true,
    supportsBuiltInCheckInDetection: true,
  },
  authSession: {
    kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.None,
    decoratesAccountApiRequests: false,
    refreshLockScope: ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES.None,
  },
  createdToken: {
    secretHandling: ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING.ResponseKey,
  },
  identity: {
    usernameRequired: true,
    storedUserIdentityFields: ["id"],
  },
  modelList: {
    directPricing: ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Supported,
    tokenScopedCatalogFallback:
      ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.None,
    dashboardEstimateLoader:
      ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.None,
    statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
    displayCapabilitiesSource:
      ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
  },
  supplementalAuth: {
    kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.None,
  },
  tokenForm: {
    networkLimitPolicy: ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES.IpList,
  },
  urls: {
    recognizedHostnames: [],
  },
}

export const ACCOUNT_SITE_PRODUCT_PROFILE_OVERRIDES: Partial<
  Record<AccountSiteType, Partial<AccountSiteProductProfile>>
> = {
  [SITE_TYPES.ANYROUTER]: {
    auth: {
      ...DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.auth,
      defaultAuthType: AuthTypeEnum.Cookie,
      defaultAuthHostnames: ["anyrouter.top"],
    },
  },
  [SITE_TYPES.SUB2API]: {
    auth: {
      allowedAuthTypes: [AuthTypeEnum.AccessToken],
      defaultAuthType: AuthTypeEnum.AccessToken,
      defaultAuthHostnames: [],
      supportsCookieAuth: false,
      supportsBuiltInCheckInDetection: false,
    },
    authSession: {
      kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken,
      decoratesAccountApiRequests: true,
      refreshLockScope: ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES.Account,
    },
    identity: {
      usernameRequired: false,
      storedUserIdentityFields: ["id"],
    },
    modelList: {
      directPricing: ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Unsupported,
      tokenScopedCatalogFallback:
        ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.RuntimeKey,
      dashboardEstimateLoader:
        ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.Sub2Api,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    },
    supplementalAuth: {
      kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken,
    },
  },
  [SITE_TYPES.AIHUBMIX]: {
    auth: {
      allowedAuthTypes: [AuthTypeEnum.AccessToken],
      defaultAuthType: AuthTypeEnum.AccessToken,
      defaultAuthHostnames: [],
      supportsCookieAuth: false,
      supportsBuiltInCheckInDetection: true,
    },
    createdToken: {
      secretHandling:
        ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING.OneTimeSecretDialog,
    },
    identity: {
      usernameRequired: true,
      storedUserIdentityFields: ["username"],
    },
    modelList: {
      directPricing: ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Supported,
      tokenScopedCatalogFallback:
        ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.None,
      dashboardEstimateLoader:
        ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.None,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile,
    },
    tokenForm: {
      networkLimitPolicy:
        ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES.SubnetLimit,
    },
    urls: {
      recognizedHostnames: AIHUBMIX_HOSTNAMES,
      storageOrigin: AIHUBMIX_WEB_ORIGIN,
      duplicateOrigin: AIHUBMIX_WEB_ORIGIN,
      managedChannelOrigin: AIHUBMIX_API_ORIGIN,
    },
  },
}
