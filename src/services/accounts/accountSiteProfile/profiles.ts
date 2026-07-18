import { SITE_TYPES } from "~/constants/siteType"
import { createLegacyTodayStatsAvailability } from "~/services/accounts/accountTodayStats"
import { AuthTypeEnum } from "~/types"

import {
  ACCOUNT_SITE_AUTH_SESSION_REFRESH_LOCK_SCOPES,
  ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING,
  ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS,
  ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING,
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
  ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS,
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
    groupSemantics:
      ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
  },
  metrics: {
    deferredTodayStatsAvailability: createLegacyTodayStatsAvailability(),
    legacyTodayStatsAvailability: createLegacyTodayStatsAvailability(),
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
