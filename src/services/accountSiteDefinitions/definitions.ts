import {
  AXON_HUB_DETAIL_FIELD_IDS,
  AXON_HUB_TABLE_FIELD_IDS,
} from "~/constants/axonHub"
import {
  CLAUDE_CODE_HUB_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
  CLAUDE_CODE_HUB_MANAGED_RESOURCE_TABLE_FIELD_IDS,
} from "~/constants/claudeCodeHubManagedResource"
import {
  DONE_HUB_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
  DONE_HUB_MANAGED_RESOURCE_TABLE_FIELD_IDS,
} from "~/constants/doneHub"
import {
  NEW_API_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
  NEW_API_MANAGED_RESOURCE_TABLE_FIELD_IDS,
} from "~/constants/newApi"
import {
  OCTOPUS_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
  OCTOPUS_MANAGED_RESOURCE_TABLE_FIELD_IDS,
} from "~/constants/octopus"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import {
  SUB2API_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
  SUB2API_MANAGED_RESOURCE_TABLE_FIELD_IDS,
} from "~/constants/sub2api"
import {
  VELOERA_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
  VELOERA_MANAGED_RESOURCE_TABLE_FIELD_IDS,
} from "~/constants/veloera"
import {
  ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING,
  ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS,
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
  ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS,
  ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES,
  ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS,
  ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES,
} from "~/services/accounts/accountSiteProfile/contracts"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/accountTodayStats"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import { AuthTypeEnum } from "~/types/auth"

import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  ACCOUNT_SITE_DEFINITION_SCOPES,
  ACCOUNT_SITE_MANUAL_ADD_GUIDE_ANCHORS,
  MANAGED_RESOURCE_KINDS,
  type AccountSiteDefinition,
  type ManagedResourceProductPolicy,
  type RegisteredAccountSiteDefinition,
} from "./contracts"
import {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_HOSTNAMES,
  AIHUBMIX_LOGIN_PATH,
  AIHUBMIX_WEB_ORIGIN,
  APIYI_HOSTNAME,
  MODELFLARE_HOSTNAME,
  MODELFLARE_USER_ID_HEADER_NAME,
  OPENROUTER_DISPLAY_NAME,
  OPENROUTER_HOSTNAMES,
  OPENROUTER_WEB_ORIGIN,
  SHAREDCHAT_HOSTNAMES,
  SHAREDCHAT_WEB_ORIGIN,
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

const NEW_API_USAGE_PATH = "/console/log"
const NEW_API_CHECKIN_PATH = "/console/personal"
// https://github.com/QuantumNous/new-api/blob/387a40914853310d69adc2f52474134ced5f4811/web/src/features/security/index.tsx
const NEW_API_ACCESS_TOKEN_PATH = "/security#security-access"
const SHAREDCHAT_CODEX_DASHBOARD_PATH =
  "/list/#/vibe-code/dashboard?activeMenu=dashboard&service=codex"

const ACCOUNT_SITE_AUTH_TYPES = {
  AccessToken: AuthTypeEnum.AccessToken,
  Cookie: AuthTypeEnum.Cookie,
} as const

const ACCOUNT_SCOPE = [ACCOUNT_SITE_DEFINITION_SCOPES.Account] as const
const MANAGED_SCOPE = [ACCOUNT_SITE_DEFINITION_SCOPES.Managed] as const
const ACCOUNT_AND_MANAGED_SCOPES = [
  ACCOUNT_SITE_DEFINITION_SCOPES.Account,
  ACCOUNT_SITE_DEFINITION_SCOPES.Managed,
] as const

// Console routes below preserve the verified provider navigation contracts:
// New API/Veloera/DoneHub upstream route definitions;
// Wheel: github.com/kunish/wheel/blob/HEAD/apps/web/src/routes.tsx
// AxonHub: github.com/looplj/axonhub/blob/HEAD/frontend/src/routeTree.gen.ts
// Claude Code Hub: github.com/ding113/claude-code-hub/tree/HEAD/src/app
const LEGACY_MANAGED_CHANNEL_POLICY = {
  labelKey: "settings:managedSite.newApi",
  messagesKey: "newapi",
  primaryKind: MANAGED_RESOURCE_KINDS.Channel,
  itemLabelKey: "managedSiteChannels:table.columns.name",
  tableFieldIds: [],
  detailFieldIds: [],
  settingsTarget: { tabId: "managedSite" },
} as const satisfies Omit<ManagedResourceProductPolicy, "consoleRoutes">

export const ACCOUNT_SITE_TYPE_ORDER = [
  SITE_TYPES.ONE_API,
  SITE_TYPES.NEW_API,
  SITE_TYPES.APIYI,
  SITE_TYPES.MODELFLARE,
  SITE_TYPES.ANYROUTER,
  SITE_TYPES.VELOERA,
  SITE_TYPES.ONE_HUB,
  SITE_TYPES.DONE_HUB,
  SITE_TYPES.V_API,
  SITE_TYPES.VO_API_V2,
  SITE_TYPES.VO_API,
  SITE_TYPES.SUPER_API,
  SITE_TYPES.RIX_API,
  SITE_TYPES.NEO_API,
  SITE_TYPES.WONG_GONGYI,
  SITE_TYPES.SUB2API,
  SITE_TYPES.AIHUBMIX,
  SITE_TYPES.SHAREDCHAT,
  SITE_TYPES.OPENROUTER,
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
  SITE_TYPES.SUB2API,
] as const

export type ManagedSiteDefinitionType = (typeof MANAGED_SITE_TYPE_ORDER)[number]

const ACCOUNT_SITE_DEFINITIONS = [
  {
    siteType: SITE_TYPES.ONE_API,
    tokenKey: { optionalSkPrefix: true },
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.ONE_API)] },
      routes: {
        // One API default/air themes: https://github.com/songquanpeng/one-api/blob/main/web/default/src/App.js
        // These pages do not use New API's /console prefix.
        usagePath: "/log",
        redeemPath: "/topup",
        adminCredentialsPath: "/user/edit",
        loginPath: "/login",
        checkInPath: null,
        accessTokenPath: null,
        siteAnnouncementsPath: "/",
      },
    },
  },
  {
    siteType: SITE_TYPES.NEW_API,
    tokenKey: { optionalSkPrefix: true },
    scopes: ACCOUNT_AND_MANAGED_SCOPES,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    managedResource: {
      ...LEGACY_MANAGED_CHANNEL_POLICY,
      consoleRoutes: { channels: "/channels", tokens: "/keys" },
      tableFieldIds: NEW_API_MANAGED_RESOURCE_TABLE_FIELD_IDS,
      detailFieldIds: NEW_API_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
    },
    onboarding: {
      manualAddGuideAnchor: ACCOUNT_SITE_MANUAL_ADD_GUIDE_ANCHORS.NewApi,
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.NEW_API)],
        compatUserIdHeaderNames: ["New-API-User"],
      },
      routes: {
        // https://github.com/QuantumNous/new-api/blob/bdef117505247769268b209665fb3ad7554c3da7/web/src/routes/pricing/index.tsx
        pricingPath: "/pricing",
        pricingSearchParam: "search",
        usagePath: NEW_API_USAGE_PATH,
        checkInPath: NEW_API_CHECKIN_PATH,
        adminCredentialsPath: NEW_API_CHECKIN_PATH,
        loginPath: "/login",
        accessTokenPath: NEW_API_ACCESS_TOKEN_PATH,
        redeemPath: "/console/topup",
        siteAnnouncementsPath: "/",
      },
    },
  },
  {
    siteType: SITE_TYPES.APIYI,
    tokenKey: { optionalSkPrefix: true },
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { hostnames: [APIYI_HOSTNAME] },
      routes: {
        // https://api.apiyi.com/account/pricing (v29.8.9)
        pricingPath: "/account/pricing",
        // https://api.apiyi.com/ (v29.8.9) dashboard routes.
        usagePath: "/log",
        redeemPath: "/account/topup/recharge",
        adminCredentialsPath: "/account/profile",
        accessTokenPath: "/account/profile",
        loginPath: "/login",
        checkInPath: null,
        siteAnnouncementsPath: "/",
      },
    },
  },
  {
    siteType: SITE_TYPES.MODELFLARE,
    tokenKey: { optionalSkPrefix: true },
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: {
        hostnames: [MODELFLARE_HOSTNAME],
        titlePatterns: [/\bmodel\s*flare\b/i],
        compatUserIdHeaderNames: [MODELFLARE_USER_ID_HEADER_NAME],
      },
      routes: {
        usagePath: NEW_API_USAGE_PATH,
        checkInPath: NEW_API_CHECKIN_PATH,
        adminCredentialsPath: NEW_API_CHECKIN_PATH,
        loginPath: "/login",
        accessTokenPath: NEW_API_ACCESS_TOKEN_PATH,
        redeemPath: "/console/topup",
        siteAnnouncementsPath: "/",
      },
    },
    productProfile: {
      // The canonical deployment authenticates account APIs with its browser
      // session plus X-ModelFlare-User: https://modelflare.dev/
      auth: {
        defaultAuthType: ACCOUNT_SITE_AUTH_TYPES.Cookie,
        defaultAuthHostnames: [MODELFLARE_HOSTNAME],
      },
    },
  },
  {
    siteType: SITE_TYPES.ANYROUTER,
    tokenKey: { optionalSkPrefix: true },
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [/\bany\s*router\b/i] },
      routes: {
        checkInPath: "/console/topup",
        loginPath: "/login",
        usagePath: NEW_API_USAGE_PATH,
        adminCredentialsPath: NEW_API_CHECKIN_PATH,
        accessTokenPath: null,
        redeemPath: "/console/topup",
        siteAnnouncementsPath: "/",
      },
    },
    productProfile: {
      auth: {
        defaultAuthType: ACCOUNT_SITE_AUTH_TYPES.Cookie,
        defaultAuthHostnames: ["anyrouter.top"],
      },
    },
  },
  {
    siteType: SITE_TYPES.SUB2API,
    scopes: ACCOUNT_AND_MANAGED_SCOPES,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Sub2Api,
    managedResource: {
      ...LEGACY_MANAGED_CHANNEL_POLICY,
      consoleRoutes: { channels: "/admin/accounts", tokens: "/keys" },
      labelKey: "settings:managedSite.sub2api",
      messagesKey: "sub2api",
      tableFieldIds: SUB2API_MANAGED_RESOURCE_TABLE_FIELD_IDS,
      detailFieldIds: SUB2API_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
      settingsTarget: {
        ...LEGACY_MANAGED_CHANNEL_POLICY.settingsTarget,
        anchor: SETTINGS_ANCHORS.SUB2API,
      },
    },
    onboarding: {
      displayName: "Sub2API",
      manualAddGuideAnchor: ACCOUNT_SITE_MANUAL_ADD_GUIDE_ANCHORS.Sub2Api,
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.SUB2API)] },
      routes: {
        // https://github.com/Wei-Shaw/sub2api/blob/main/frontend/src/router/index.ts
        pricingPath: "/model-plaza",
        usagePath: "/usage",
        redeemPath: "/redeem",
        // Admin API Key lives in Settings > Security; the tab has no URL route.
        // github.com/Wei-Shaw/sub2api/blob/b7dba62678a834080564966c002fd0ca2b328b7a/frontend/src/views/admin/SettingsView.vue
        adminCredentialsPath: "/admin/settings",
        siteAnnouncementsPath: "/dashboard",
        loginPath: "/login",
        checkInPath: null,
        accessTokenPath: null,
      },
    },
    productProfile: {
      auth: {
        allowedAuthTypes: [ACCOUNT_SITE_AUTH_TYPES.AccessToken],
        defaultAuthType: ACCOUNT_SITE_AUTH_TYPES.AccessToken,
        defaultAuthHostnames: [],
      },
      authSession: {
        kind: ACCOUNT_SITE_SUPPLEMENTAL_AUTH_KINDS.Sub2ApiRefreshToken,
      },
      identity: {
        usernameRequired: false,
        storedUserIdentityFields: ["id"],
      },
      modelList: {
        dashboardEstimateLoader:
          ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.Sub2Api,
        statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token,
        displayCapabilitiesSource:
          ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
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
        checkInPath: null,
        adminCredentialsPath: "/",
        accessTokenPath: null,
        siteAnnouncementsPath: "/",
      },
    },
    productProfile: {
      metrics: {
        legacyTodayStatsAvailability: {
          consumption: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
            reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
          },
          requests: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
            reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
          },
          tokens: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
            reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
          },
          income: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
            reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
          },
        },
      },
      auth: {
        allowedAuthTypes: [ACCOUNT_SITE_AUTH_TYPES.AccessToken],
        defaultAuthType: ACCOUNT_SITE_AUTH_TYPES.AccessToken,
        defaultAuthHostnames: [],
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
        dashboardEstimateLoader:
          ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.None,
        statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
        displayCapabilitiesSource:
          ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
        groupSemantics: ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE,
      },
      tokenForm: {
        networkLimitPolicy:
          ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES.SubnetLimit,
      },
      urls: {
        recognizedHostnames: AIHUBMIX_HOSTNAMES,
        inferFromHostname: true,
        loginOrigin: AIHUBMIX_WEB_ORIGIN,
        storageOrigin: AIHUBMIX_WEB_ORIGIN,
        duplicateOrigin: AIHUBMIX_WEB_ORIGIN,
        autoDetectOrigin: AIHUBMIX_API_ORIGIN,
        managedChannelOrigin: AIHUBMIX_API_ORIGIN,
      },
    },
  },
  {
    siteType: SITE_TYPES.SHAREDCHAT,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.SharedChat,
    onboarding: {
      detection: {
        hostnames: SHAREDCHAT_HOSTNAMES,
      },
      routes: {
        loginPath: "/list/#/login",
        usagePath: SHAREDCHAT_CODEX_DASHBOARD_PATH,
        adminCredentialsPath: SHAREDCHAT_CODEX_DASHBOARD_PATH,
        siteAnnouncementsPath: SHAREDCHAT_CODEX_DASHBOARD_PATH,
        checkInPath: null,
        accessTokenPath: null,
        redeemPath: null,
      },
    },
    productProfile: {
      auth: {
        allowedAuthTypes: [ACCOUNT_SITE_AUTH_TYPES.Cookie],
        defaultAuthType: ACCOUNT_SITE_AUTH_TYPES.Cookie,
        defaultAuthHostnames: SHAREDCHAT_HOSTNAMES,
      },
      identity: {
        usernameRequired: false,
        storedUserIdentityFields: ["id", "username"],
      },
      modelList: {
        dashboardEstimateLoader:
          ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.None,
        statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
        displayCapabilitiesSource:
          ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile,
        groupSemantics: ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE,
      },
      urls: {
        recognizedHostnames: SHAREDCHAT_HOSTNAMES,
        storageOrigin: SHAREDCHAT_WEB_ORIGIN,
        duplicateOrigin: SHAREDCHAT_WEB_ORIGIN,
      },
    },
  },
  {
    siteType: SITE_TYPES.VO_API_V2,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.VoApiV2,
    onboarding: {
      detection: {
        titlePatterns: [/^(?:.* - )?VoAPI公益站$/i],
      },
      routes: {
        usagePath: "/dash?_userMenuKey=dash",
        checkInPath: "/checkIn?_userMenuKey=checkIn",
        adminCredentialsPath: "/keys?_userMenuKey=keys",
        loginPath: "/login",
        accessTokenPath: null,
        redeemPath: null,
        siteAnnouncementsPath: "/",
      },
    },
    productProfile: {
      auth: {
        allowedAuthTypes: [ACCOUNT_SITE_AUTH_TYPES.AccessToken],
        defaultAuthType: ACCOUNT_SITE_AUTH_TYPES.AccessToken,
        defaultAuthHostnames: [],
      },
      identity: {
        usernameRequired: false,
        storedUserIdentityFields: ["id", "username"],
      },
      modelList: {
        dashboardEstimateLoader:
          ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.None,
        statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
        displayCapabilitiesSource:
          ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
      },
    },
  },
  {
    siteType: SITE_TYPES.OPENROUTER,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.OpenRouter,
    onboarding: {
      displayName: OPENROUTER_DISPLAY_NAME,
      accountForm: {
        fixedSiteUrl: OPENROUTER_WEB_ORIGIN,
        defaultSiteName: OPENROUTER_DISPLAY_NAME,
      },
      manualAddGuideAnchor: ACCOUNT_SITE_MANUAL_ADD_GUIDE_ANCHORS.OpenRouter,
      detection: { hostnames: OPENROUTER_HOSTNAMES },
      routes: {
        // Hosted dashboard: https://openrouter.ai/activity and /settings/credits.
        // Both pages redirect signed-out users to /sign-in.
        loginPath: "/sign-in",
        usagePath: "/activity",
        redeemPath: "/settings/credits",
        adminCredentialsPath: "/settings/management-keys",
        checkInPath: null,
        accessTokenPath: "/settings/management-keys",
        siteAnnouncementsPath: null,
      },
    },
    productProfile: {
      metrics: {
        deferredTodayStatsAvailability:
          createUnsupportedTodayStatsAvailability(),
        legacyTodayStatsAvailability: createUnsupportedTodayStatsAvailability(),
      },
      auth: {
        allowedAuthTypes: [ACCOUNT_SITE_AUTH_TYPES.AccessToken],
        defaultAuthType: ACCOUNT_SITE_AUTH_TYPES.AccessToken,
        defaultAuthHostnames: [],
      },
      identity: {
        usernameRequired: false,
        userIdRequired: false,
        storedUserIdentityFields: [],
      },
      modelList: {
        dashboardEstimateLoader:
          ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.None,
        statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
        displayCapabilitiesSource:
          ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile,
        groupSemantics: ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE,
      },
      urls: {
        recognizedHostnames: OPENROUTER_HOSTNAMES,
        storageOrigin: OPENROUTER_WEB_ORIGIN,
        duplicateOrigin: OPENROUTER_WEB_ORIGIN,
      },
    },
  },
] as const satisfies readonly RegisteredAccountSiteDefinition[]

const MANAGED_ONLY_SITE_DEFINITIONS = [
  {
    siteType: SITE_TYPES.OCTOPUS,
    scopes: MANAGED_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported,
    managedResource: {
      ...LEGACY_MANAGED_CHANNEL_POLICY,
      consoleRoutes: { channels: "/model", tokens: "/keys" },
      labelKey: "settings:managedSite.octopus",
      messagesKey: "octopus",
      tableFieldIds: OCTOPUS_MANAGED_RESOURCE_TABLE_FIELD_IDS,
      detailFieldIds: OCTOPUS_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
    },
  },
  {
    siteType: SITE_TYPES.AXON_HUB,
    scopes: MANAGED_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported,
    managedResource: {
      ...LEGACY_MANAGED_CHANNEL_POLICY,
      consoleRoutes: { channels: "/channels", tokens: "/api-keys" },
      labelKey: "settings:managedSite.axonHub",
      messagesKey: "axonhub",
      tableFieldIds: AXON_HUB_TABLE_FIELD_IDS,
      detailFieldIds: AXON_HUB_DETAIL_FIELD_IDS,
      settingsTarget: {
        ...LEGACY_MANAGED_CHANNEL_POLICY.settingsTarget,
        anchor: SETTINGS_ANCHORS.AXON_HUB,
      },
    },
  },
  {
    siteType: SITE_TYPES.CLAUDE_CODE_HUB,
    scopes: MANAGED_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported,
    managedResource: {
      ...LEGACY_MANAGED_CHANNEL_POLICY,
      consoleRoutes: {
        channels: "/settings/providers",
        tokens: "/dashboard/users",
      },
      labelKey: "settings:managedSite.claudeCodeHub",
      messagesKey: "claudecodehub",
      tableFieldIds: CLAUDE_CODE_HUB_MANAGED_RESOURCE_TABLE_FIELD_IDS,
      detailFieldIds: CLAUDE_CODE_HUB_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
    },
  },
] as const satisfies readonly AccountSiteDefinition[]

const ACCOUNT_SITE_DEFINITION_OVERRIDES = [
  {
    siteType: SITE_TYPES.VELOERA,
    tokenKey: { optionalSkPrefix: true },
    scopes: ACCOUNT_AND_MANAGED_SCOPES,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    managedResource: {
      ...LEGACY_MANAGED_CHANNEL_POLICY,
      consoleRoutes: { channels: "/admin/channels", tokens: "/app/tokens" },
      labelKey: "settings:managedSite.veloera",
      messagesKey: "veloera",
      tableFieldIds: VELOERA_MANAGED_RESOURCE_TABLE_FIELD_IDS,
      detailFieldIds: VELOERA_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
    },
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
        loginPath: "/login",
        accessTokenPath: null,
        siteAnnouncementsPath: "/",
      },
    },
  },
  {
    siteType: SITE_TYPES.DONE_HUB,
    tokenKey: { optionalSkPrefix: true },
    scopes: ACCOUNT_AND_MANAGED_SCOPES,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    managedResource: {
      ...LEGACY_MANAGED_CHANNEL_POLICY,
      consoleRoutes: { channels: "/panel/channel", tokens: "/panel/token" },
      labelKey: "settings:managedSite.doneHub",
      messagesKey: "donehub",
      tableFieldIds: DONE_HUB_MANAGED_RESOURCE_TABLE_FIELD_IDS,
      detailFieldIds: DONE_HUB_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
    },
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.DONE_HUB)] },
      routes: {
        // https://github.com/deanxv/done-hub/blob/main/web/src/routes/MainRoutes.jsx
        pricingPath: "/panel/model_price",
        usagePath: "/panel/log",
        redeemPath: "/panel/topup",
        adminCredentialsPath: "/panel/profile",
        loginPath: "/login",
        checkInPath: null,
        accessTokenPath: null,
        siteAnnouncementsPath: "/",
      },
    },
  },
] as const satisfies readonly RegisteredAccountSiteDefinition[]

const COMPATIBLE_ACCOUNT_SITE_DEFINITIONS = [
  {
    siteType: SITE_TYPES.ONE_HUB,
    tokenKey: { optionalSkPrefix: true },
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.ONE_HUB)] },
      routes: {
        // https://github.com/MartialBE/one-hub/blob/main/web/src/routes/MainRoutes.jsx
        pricingPath: "/panel/model_price",
        usagePath: "/panel/log",
        redeemPath: "/panel/topup",
        adminCredentialsPath: "/panel/profile",
        loginPath: "/login",
        checkInPath: null,
        accessTokenPath: null,
        siteAnnouncementsPath: "/",
      },
    },
  },
  {
    siteType: SITE_TYPES.V_API,
    tokenKey: { optionalSkPrefix: true },
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
        loginPath: "/login",
        accessTokenPath: null,
        siteAnnouncementsPath: "/",
      },
    },
  },
  {
    siteType: SITE_TYPES.VO_API,
    tokenKey: { optionalSkPrefix: true },
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.VO_API)],
        compatUserIdHeaderNames: ["voapi-user"],
      },
      routes: {
        usagePath: NEW_API_USAGE_PATH,
        redeemPath: "/wallet",
        loginPath: "/login",
        checkInPath: NEW_API_CHECKIN_PATH,
        adminCredentialsPath: NEW_API_CHECKIN_PATH,
        accessTokenPath: null,
        siteAnnouncementsPath: "/",
      },
    },
  },
  {
    siteType: SITE_TYPES.SUPER_API,
    tokenKey: { optionalSkPrefix: true },
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      routes: {
        loginPath: "/login",
        usagePath: NEW_API_USAGE_PATH,
        checkInPath: NEW_API_CHECKIN_PATH,
        adminCredentialsPath: NEW_API_CHECKIN_PATH,
        accessTokenPath: null,
        redeemPath: "/console/topup",
        siteAnnouncementsPath: "/",
      },
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.SUPER_API)] },
    },
  },
  {
    siteType: SITE_TYPES.RIX_API,
    tokenKey: { optionalSkPrefix: true },
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
        loginPath: "/login",
        adminCredentialsPath: NEW_API_CHECKIN_PATH,
        accessTokenPath: null,
        siteAnnouncementsPath: "/",
      },
    },
  },
  {
    siteType: SITE_TYPES.NEO_API,
    tokenKey: { optionalSkPrefix: true },
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      routes: {
        loginPath: "/login",
        usagePath: NEW_API_USAGE_PATH,
        checkInPath: NEW_API_CHECKIN_PATH,
        adminCredentialsPath: NEW_API_CHECKIN_PATH,
        accessTokenPath: null,
        redeemPath: "/console/topup",
        siteAnnouncementsPath: "/",
      },
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.NEO_API)],
        compatUserIdHeaderNames: ["neo-api-user"],
      },
    },
  },
  {
    siteType: SITE_TYPES.WONG_GONGYI,
    tokenKey: { optionalSkPrefix: true },
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: { titlePatterns: [/wong\s*公益站/i] },
      routes: {
        checkInPath: "/console/topup",
        loginPath: "/login",
        usagePath: NEW_API_USAGE_PATH,
        adminCredentialsPath: NEW_API_CHECKIN_PATH,
        accessTokenPath: null,
        redeemPath: "/console/topup",
        siteAnnouncementsPath: "/",
      },
    },
  },
  {
    siteType: SITE_TYPES.UNKNOWN,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      routes: {
        loginPath: "/login",
        usagePath: NEW_API_USAGE_PATH,
        checkInPath: NEW_API_CHECKIN_PATH,
        adminCredentialsPath: NEW_API_CHECKIN_PATH,
        accessTokenPath: NEW_API_ACCESS_TOKEN_PATH,
        redeemPath: "/console/topup",
        siteAnnouncementsPath: "/",
      },
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.UNKNOWN)] },
    },
  },
] as const satisfies readonly RegisteredAccountSiteDefinition[]

export const SITE_TYPE_DEFINITIONS: readonly AccountSiteDefinition[] = [
  ...ACCOUNT_SITE_DEFINITIONS,
  ...ACCOUNT_SITE_DEFINITION_OVERRIDES,
  ...COMPATIBLE_ACCOUNT_SITE_DEFINITIONS,
  ...MANAGED_ONLY_SITE_DEFINITIONS,
]
