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
} from "~/services/accounts/accountSiteProfile/contracts"
import type { AuthTypeEnum } from "~/types"

import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  ACCOUNT_SITE_DEFINITION_SCOPES,
  ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES,
  type AccountSiteDefinition,
} from "./contracts"
import {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_HOSTNAMES,
  AIHUBMIX_LOGIN_PATH,
  AIHUBMIX_WEB_ORIGIN,
  SITE_TYPES,
} from "./identifiers"

/**
 * Builds the legacy account-site title matcher for one registered site type.
 */
function makeTitleRegex(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = escaped.replace(/-/g, "[-_ ]?")
  return new RegExp(`\\b${pattern}\\b`, "i")
}

const DEFAULT_USAGE_PATH = "/console/log"
const DEFAULT_CHECKIN_PATH = "/console/personal"

const ACCOUNT_SITE_AUTH_TYPES = {
  AccessToken: "access_token" as AuthTypeEnum.AccessToken,
  Cookie: "cookie" as AuthTypeEnum.Cookie,
} as const

const ACCOUNT_SCOPE = [ACCOUNT_SITE_DEFINITION_SCOPES.Account] as const
const MANAGED_SCOPE = [ACCOUNT_SITE_DEFINITION_SCOPES.Managed] as const
const ACCOUNT_AND_MANAGED_SCOPES = [
  ACCOUNT_SITE_DEFINITION_SCOPES.Account,
  ACCOUNT_SITE_DEFINITION_SCOPES.Managed,
] as const

const directPricingReadiness = {
  modelList: {
    expectedRoute: ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.DirectPricing,
  },
} as const

export const ACCOUNT_SITE_TYPE_ORDER = [
  SITE_TYPES.ONE_API,
  SITE_TYPES.NEW_API,
  SITE_TYPES.ANYROUTER,
  SITE_TYPES.VELOERA,
  SITE_TYPES.ONE_HUB,
  SITE_TYPES.DONE_HUB,
  SITE_TYPES.V_API,
  SITE_TYPES.VO_API,
  SITE_TYPES.SUPER_API,
  SITE_TYPES.RIX_API,
  SITE_TYPES.NEO_API,
  SITE_TYPES.WONG_GONGYI,
  SITE_TYPES.SUB2API,
  SITE_TYPES.AIHUBMIX,
  SITE_TYPES.UNKNOWN,
] as const

export type AccountSiteDefinitionType = (typeof ACCOUNT_SITE_TYPE_ORDER)[number]

export const MANAGED_SITE_TYPE_ORDER = [
  SITE_TYPES.NEW_API,
  SITE_TYPES.VELOERA,
  SITE_TYPES.DONE_HUB,
  SITE_TYPES.OCTOPUS,
  SITE_TYPES.AXON_HUB,
  SITE_TYPES.CLAUDE_CODE_HUB,
] as const

export type ManagedSiteDefinitionType = (typeof MANAGED_SITE_TYPE_ORDER)[number]

const ACCOUNT_SITE_DEFINITIONS = [
  {
    siteType: SITE_TYPES.ONE_API,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.ONE_API)] },
      routes: { usagePath: DEFAULT_USAGE_PATH },
    },
    readiness: directPricingReadiness,
  },
  {
    siteType: SITE_TYPES.NEW_API,
    scopes: ACCOUNT_AND_MANAGED_SCOPES,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.NEW_API)],
        compatUserIdHeaderNames: ["New-API-User"],
      },
      routes: {
        usagePath: DEFAULT_USAGE_PATH,
        checkInPath: DEFAULT_CHECKIN_PATH,
        adminCredentialsPath: DEFAULT_CHECKIN_PATH,
      },
    },
    readiness: directPricingReadiness,
  },
  {
    siteType: SITE_TYPES.ANYROUTER,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [/\bany\s*router\b/i] },
      routes: { checkInPath: "/console/topup" },
    },
    productProfile: {
      auth: {
        defaultAuthType: ACCOUNT_SITE_AUTH_TYPES.Cookie,
        defaultAuthHostnames: ["anyrouter.top"],
      },
    },
    readiness: directPricingReadiness,
  },
  {
    siteType: SITE_TYPES.SUB2API,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Sub2Api,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.SUB2API)] },
      routes: {
        usagePath: "/usage",
        redeemPath: "/redeem",
        siteAnnouncementsPath: "/dashboard",
      },
    },
    productProfile: {
      auth: {
        allowedAuthTypes: [ACCOUNT_SITE_AUTH_TYPES.AccessToken],
        defaultAuthType: ACCOUNT_SITE_AUTH_TYPES.AccessToken,
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
    readiness: {
      modelList: {
        expectedRoute:
          ACCOUNT_SITE_MODEL_LIST_EXPECTED_ROUTES.TokenScopedRuntimeCatalog,
      },
    },
  },
  {
    siteType: SITE_TYPES.AIHUBMIX,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix,
    onboarding: {
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.AIHUBMIX)],
        hostnames: AIHUBMIX_HOSTNAMES,
      },
      routes: {
        loginPath: AIHUBMIX_LOGIN_PATH,
        usagePath: "/statistics",
        redeemPath: "/topup",
        checkInPath: "/",
        adminCredentialsPath: "/",
      },
    },
    productProfile: {
      auth: {
        allowedAuthTypes: [ACCOUNT_SITE_AUTH_TYPES.AccessToken],
        defaultAuthType: ACCOUNT_SITE_AUTH_TYPES.AccessToken,
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
    readiness: directPricingReadiness,
  },
] as const satisfies readonly AccountSiteDefinition[]

const MANAGED_ONLY_SITE_DEFINITIONS = [
  {
    siteType: SITE_TYPES.OCTOPUS,
    scopes: MANAGED_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported,
  },
  {
    siteType: SITE_TYPES.AXON_HUB,
    scopes: MANAGED_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported,
  },
  {
    siteType: SITE_TYPES.CLAUDE_CODE_HUB,
    scopes: MANAGED_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported,
  },
] as const satisfies readonly AccountSiteDefinition[]

const ACCOUNT_SITE_DEFINITION_OVERRIDES = [
  {
    siteType: SITE_TYPES.VELOERA,
    scopes: ACCOUNT_AND_MANAGED_SCOPES,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.VELOERA)],
        compatUserIdHeaderNames: ["Veloera-User"],
      },
      routes: {
        usagePath: "/app/logs/api-usage",
        checkInPath: "/app/me",
        redeemPath: "/app/wallet",
        adminCredentialsPath: "/app/me",
      },
    },
    readiness: directPricingReadiness,
  },
  {
    siteType: SITE_TYPES.DONE_HUB,
    scopes: ACCOUNT_AND_MANAGED_SCOPES,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.DONE_HUB)] },
      routes: {
        usagePath: "/panel/log",
        redeemPath: "/panel/topup",
        adminCredentialsPath: "/panel/profile",
      },
    },
    readiness: directPricingReadiness,
  },
] as const satisfies readonly AccountSiteDefinition[]

const COMPATIBLE_ACCOUNT_SITE_DEFINITIONS = [
  {
    siteType: SITE_TYPES.ONE_HUB,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.ONE_HUB)] },
      routes: {
        usagePath: "/panel/log",
        redeemPath: "/panel/topup",
        adminCredentialsPath: "/panel/profile",
      },
    },
    readiness: directPricingReadiness,
  },
  {
    siteType: SITE_TYPES.V_API,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.V_API)],
        compatUserIdHeaderNames: ["X-Api-User"],
      },
      routes: {
        usagePath: "/panel/log",
        checkInPath: "/panel/profile",
        redeemPath: "/panel/topup",
        adminCredentialsPath: "/panel/profile",
      },
    },
    readiness: directPricingReadiness,
  },
  {
    siteType: SITE_TYPES.VO_API,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.VO_API)],
        compatUserIdHeaderNames: ["voapi-user"],
      },
      routes: { usagePath: DEFAULT_USAGE_PATH, redeemPath: "/wallet" },
    },
    readiness: directPricingReadiness,
  },
  {
    siteType: SITE_TYPES.SUPER_API,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.SUPER_API)] },
    },
    readiness: directPricingReadiness,
  },
  {
    siteType: SITE_TYPES.RIX_API,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.RIX_API)],
        compatUserIdHeaderNames: ["Rix-Api-User"],
      },
      routes: {
        usagePath: "/log",
        checkInPath: "/panel",
        redeemPath: "/topup",
      },
    },
    readiness: directPricingReadiness,
  },
  {
    siteType: SITE_TYPES.NEO_API,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.NEO_API)],
        compatUserIdHeaderNames: ["neo-api-user"],
      },
    },
    readiness: directPricingReadiness,
  },
  {
    siteType: SITE_TYPES.WONG_GONGYI,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [/wong\s*公益站/i] },
      routes: { checkInPath: "/console/topup" },
    },
    readiness: directPricingReadiness,
  },
  {
    siteType: SITE_TYPES.UNKNOWN,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.UNKNOWN)] },
    },
    readiness: directPricingReadiness,
  },
] as const satisfies readonly AccountSiteDefinition[]

export const SITE_TYPE_DEFINITIONS: readonly AccountSiteDefinition[] = [
  ...ACCOUNT_SITE_DEFINITIONS,
  ...ACCOUNT_SITE_DEFINITION_OVERRIDES,
  ...COMPATIBLE_ACCOUNT_SITE_DEFINITIONS,
  ...MANAGED_ONLY_SITE_DEFINITIONS,
]
