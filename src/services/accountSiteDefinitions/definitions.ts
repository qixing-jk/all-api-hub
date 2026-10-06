import {
  AXON_HUB_DETAIL_FIELD_IDS,
  AXON_HUB_TABLE_FIELD_IDS,
} from "~/constants/axonHub"
import {
  CLAUDE_CODE_HUB_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
  CLAUDE_CODE_HUB_MANAGED_RESOURCE_TABLE_FIELD_IDS,
} from "~/constants/claudeCodeHubManagedResource"
import {
  CLI_PROXY_API_DETAIL_FIELDS,
  CLI_PROXY_API_TABLE_FIELDS,
} from "~/constants/cliProxyApi"
import { AI_ROUTER_HOSTNAMES } from "~/constants/deploymentApiOrigins"
import {
  DONE_HUB_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
  DONE_HUB_MANAGED_RESOURCE_TABLE_FIELD_IDS,
} from "~/constants/doneHub"
import {
  GPT_LOAD_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
  GPT_LOAD_MANAGED_RESOURCE_TABLE_FIELD_IDS,
} from "~/constants/gptLoad"
import {
  NEW_API_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
  NEW_API_MANAGED_RESOURCE_TABLE_FIELD_IDS,
} from "~/constants/newApi"
import {
  OCTOPUS_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
  OCTOPUS_MANAGED_RESOURCE_TABLE_FIELD_IDS,
} from "~/constants/octopus"
import {
  OMNIROUTE_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
  OMNIROUTE_MANAGED_RESOURCE_TABLE_FIELD_IDS,
} from "~/constants/omniroute"
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
  type AccountSiteLoginConfig,
  type ManagedResourceProductPolicy,
  type RegisteredAccountSiteDefinition,
} from "./contracts"
import {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_HOSTNAMES,
  AIHUBMIX_LOGIN_PATH,
  AIHUBMIX_WEB_ORIGIN,
  APIYI_HOSTNAME,
  FREEMODEL_ANTHROPIC_BASE_URL,
  FREEMODEL_HOSTNAMES,
  FREEMODEL_OPENAI_BASE_URL,
  FREEMODEL_WEB_ORIGIN,
  GRSAI_ACCOUNT_PATH,
  GRSAI_API_BASE_URL,
  GRSAI_DISPLAY_NAME,
  GRSAI_HOSTNAMES,
  KIMI_API_BASE_URL,
  KIMI_CONSOLE_ORIGIN,
  KIMI_DISPLAY_NAME,
  KIMI_GLOBAL_API_BASE_URL,
  KIMI_GLOBAL_CONSOLE_ORIGIN,
  KIMI_GLOBAL_DISPLAY_NAME,
  KIMI_GLOBAL_HOSTNAMES,
  KIMI_HOSTNAMES,
  LAOZHANG_HOSTNAMES,
  MODELFLARE_HOSTNAME,
  MODELFLARE_USER_ID_HEADER_NAME,
  OPENROUTER_API_BASE_URL,
  OPENROUTER_DISPLAY_NAME,
  OPENROUTER_HOSTNAMES,
  OPENROUTER_WEB_ORIGIN,
  RIGHTCODE_DISPLAY_NAME,
  RIGHTCODE_HOSTNAMES,
  RIGHTCODE_LOGIN_PATH,
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

// Preserve the existing compatibility allowlist for forks without a recorded
// callback source. Verified upstreams below declare their own completion paths.
const NEW_API_COMPATIBLE_LOGIN = {
  methods: ["github", "linuxdo"],
  protocols: {
    newApi: {
      userIdHeader: "New-Api-User",
      completionPaths: [
        "/console",
        "/console/token",
        "/dashboard",
        "/app/tokens",
      ],
    },
  },
} as const satisfies AccountSiteLoginConfig

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
  getStartedUrl: "https://docs.newapi.ai/en/docs/installation",
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
  SITE_TYPES.LAOZHANG,
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
  SITE_TYPES.FREEMODEL,
  SITE_TYPES.RIGHT_CODE,
  SITE_TYPES.OPENROUTER,
  SITE_TYPES.KIMI,
  SITE_TYPES.KIMI_GLOBAL,
  SITE_TYPES.GRSAI,
  SITE_TYPES.UNKNOWN,
] as const

export type AccountSiteDefinitionType = (typeof ACCOUNT_SITE_TYPE_ORDER)[number]

// GitHub stars snapshot (2026-10-04), descending; refresh deliberately rather
// than fetching popularity during UI rendering. Sources: github.com/<repo>:
// diegosouzapw/OmniRoute 72850, router-for-me/CLIProxyAPI 54110,
// QuantumNous/new-api 49256, Wei-Shaw/sub2api 43283, tbphp/gpt-load 7044,
// looplj/axonhub 5334, ding113/claude-code-hub 3390,
// bestruirui/octopus 2668, Veloera/Veloera 1633, deanxv/done-hub 808.
export const MANAGED_SITE_TYPE_ORDER = [
  SITE_TYPES.OMNIROUTE,
  SITE_TYPES.CLI_PROXY_API,
  SITE_TYPES.NEW_API,
  SITE_TYPES.SUB2API,
  SITE_TYPES.GPT_LOAD,
  SITE_TYPES.AXON_HUB,
  SITE_TYPES.CLAUDE_CODE_HUB,
  SITE_TYPES.OCTOPUS,
  SITE_TYPES.VELOERA,
  SITE_TYPES.DONE_HUB,
] as const

export type ManagedSiteDefinitionType = (typeof MANAGED_SITE_TYPE_ORDER)[number]

const ACCOUNT_SITE_DEFINITIONS = [
  {
    siteType: SITE_TYPES.FREEMODEL,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.FreeModel,
    onboarding: {
      displayName: "FreeModel",
      detection: { hostnames: FREEMODEL_HOSTNAMES },
      routes: {
        loginPath: "/",
        usagePath: "/dashboard/usage",
        adminCredentialsPath: "/dashboard/keys",
        checkInPath: null,
        accessTokenPath: null,
        redeemPath: null,
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
        // freemodel.dev console APIs validate the live browser cookie session.
        usesBrowserCookieSession: true,
        allowedAuthTypes: [ACCOUNT_SITE_AUTH_TYPES.Cookie],
        defaultAuthType: ACCOUNT_SITE_AUTH_TYPES.Cookie,
        defaultAuthHostnames: FREEMODEL_HOSTNAMES,
      },
      identity: {
        usernameRequired: false,
        storedUserIdentityFields: ["id", "username"],
      },
      modelList: {
        statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
        displayCapabilitiesSource:
          ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile,
        groupSemantics: ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE,
      },
      urls: {
        recognizedHostnames: FREEMODEL_HOSTNAMES,
        inferFromHostname: true,
        storageOrigin: FREEMODEL_WEB_ORIGIN,
        managedChannelOrigin: FREEMODEL_OPENAI_BASE_URL,
        duplicateOrigin: FREEMODEL_WEB_ORIGIN,
        inferenceApiBaseUrls: {
          openAiCompatible: FREEMODEL_OPENAI_BASE_URL,
          anthropic: FREEMODEL_ANTHROPIC_BASE_URL,
        },
      },
    },
  },
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
    accountLogin: {
      ...NEW_API_COMPATIBLE_LOGIN,
      methods: ["github", "linuxdo", "discord", "oidc"],
      // QuantumNous/new-api: v1.0.0-rc.37 web/src/routes/oauth/$provider.tsx;
      // earlier web/src/components/OAuth2Callback.js completes under /console.
      protocols: {
        newApi: {
          ...NEW_API_COMPATIBLE_LOGIN.protocols.newApi,
          completionPaths: ["/console", "/console/token", "/dashboard"],
        },
      },
    },
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
      accessTokenVerificationGuide: {
        copy: "security",
        showRotationWarning: true,
      },
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
      browserUserStorage: "apiyi",
      accessTokenVerificationGuide: {
        copy: "apiyi",
        showRotationWarning: false,
      },
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
    siteType: SITE_TYPES.LAOZHANG,
    tokenKey: { optionalSkPrefix: true },
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      displayName: "LaoZhang API",
      browserUserStorage: "apiyi",
      accessTokenVerificationGuide: {
        copy: "laozhang",
        showRotationWarning: false,
      },
      detection: {
        hostnames: LAOZHANG_HOSTNAMES,
        titlePatterns: [/\blaozhang\s*api\b/i],
      },
      // https://api2.laozhang.ai/account/profile, observed v31.1.5.
      routes: {
        pricingPath: "/account/pricing",
        usagePath: "/log",
        redeemPath: "/account/topup/recharge",
        adminCredentialsPath: "/account/profile",
        accessTokenPath: "/account/profile",
        loginPath: "/login",
        checkInPath: null,
        siteAnnouncementsPath: "/account",
      },
    },
    productProfile: {
      auth: {
        defaultAuthType: ACCOUNT_SITE_AUTH_TYPES.AccessToken,
        defaultAuthHostnames: LAOZHANG_HOSTNAMES,
      },
      urls: {
        recognizedHostnames: LAOZHANG_HOSTNAMES,
        inferFromHostname: true,
        duplicateOrigin: "https://api.laozhang.ai",
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
    accountLogin: {
      // Wei-Shaw/sub2api@881f320: public settings and native OAuth start routes.
      methods: ["github", "google", "linuxdo", "oidc", "dingtalk", "wechat"],
    },
    managedResource: {
      ...LEGACY_MANAGED_CHANNEL_POLICY,
      consoleRoutes: { channels: "/admin/accounts", tokens: "/keys" },
      labelKey: "settings:managedSite.sub2api",
      getStartedUrl: "https://github.com/Wei-Shaw/sub2api#deployment",
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
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.SUB2API)],
        // AI-ROUTER is a split-origin fork: its browser origin answers neither
        // the title match nor the `/api/v1/auth/me` shape probe, so the hostname
        // has to be registered explicitly.
        hostnames: AI_ROUTER_HOSTNAMES,
      },
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
        statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token,
        displayCapabilitiesSource:
          ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
      },
      urls: {
        // Only enumerated deployments are recognized by hostname; other Sub2API
        // forks stay title/probe detected so a self-hosted install is never
        // mistaken for a registered one.
        recognizedHostnames: AI_ROUTER_HOSTNAMES,
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
    siteType: SITE_TYPES.RIGHT_CODE,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.RightCode,
    onboarding: {
      displayName: RIGHTCODE_DISPLAY_NAME,
      detection: {
        hostnames: RIGHTCODE_HOSTNAMES,
      },
      // Console routes verified against the deployment's own router table; the
      // deployment serves the same console on right.codes, www.right.codes and
      // rightapi.ai. https://docs.rightapi.ai/docs/rc_quick_start/models.html
      routes: {
        loginPath: RIGHTCODE_LOGIN_PATH,
        usagePath: "/use-logs",
        adminCredentialsPath: "/api-keys",
        siteAnnouncementsPath: "/dashboard",
        pricingPath: "/models",
        // Right Code has no check-in flow, and its activation-code redemption
        // contract is not verified yet, so neither page is offered.
        checkInPath: null,
        accessTokenPath: null,
        redeemPath: null,
      },
    },
    productProfile: {
      auth: {
        allowedAuthTypes: [ACCOUNT_SITE_AUTH_TYPES.AccessToken],
        defaultAuthType: ACCOUNT_SITE_AUTH_TYPES.AccessToken,
        defaultAuthHostnames: [],
      },
      identity: {
        usernameRequired: true,
        // The console never shows the numeric account id, and the token alone
        // authenticates every call, so manual adds must not demand it.
        userIdRequired: false,
        storedUserIdentityFields: ["id", "username"],
      },
      modelList: {
        statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
        displayCapabilitiesSource:
          ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
        groupSemantics: ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE,
      },
      tokenForm: {
        // Keys carry no network restrictions; only channel, models and quota.
        networkLimitPolicy:
          ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES.IpList,
      },
      // The three delivery domains are equivalent; accounts keep whichever host
      // they were detected on instead of being rewritten to a canonical origin.
      urls: {
        recognizedHostnames: RIGHTCODE_HOSTNAMES,
        inferFromHostname: true,
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
        accessTokenLabelKey: "form.openrouterManagementKey",
        accessTokenGuidanceTitleKey:
          "form.openrouterManagementKeyGuidanceTitle",
        accessTokenGuidanceKey: "form.openrouterManagementKeyGuidance",
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
        statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
        displayCapabilitiesSource:
          ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile,
        groupSemantics: ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE,
      },
      urls: {
        recognizedHostnames: OPENROUTER_HOSTNAMES,
        storageOrigin: OPENROUTER_WEB_ORIGIN,
        duplicateOrigin: OPENROUTER_WEB_ORIGIN,
        managedChannelOrigin: OPENROUTER_API_BASE_URL,
        inferenceApiBaseUrls: {
          openAiCompatible: OPENROUTER_API_BASE_URL,
        },
      },
    },
  },

  {
    siteType: SITE_TYPES.KIMI,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.KimiOpenPlatform,
    onboarding: {
      displayName: KIMI_DISPLAY_NAME,
      accountForm: {
        fixedSiteUrl: KIMI_CONSOLE_ORIGIN,
        defaultSiteName: KIMI_DISPLAY_NAME,
      },
      detection: { hostnames: KIMI_HOSTNAMES },
      routes: {
        loginPath: "/console/account",
        usagePath: "/console/account",
        adminCredentialsPath: "/console/api-keys",
        checkInPath: null,
        accessTokenPath: null,
        redeemPath: null,
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
        userIdRequired: true,
        storedUserIdentityFields: ["id", "username"],
      },
      modelList: {
        statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
        displayCapabilitiesSource:
          ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
        groupSemantics: ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE,
      },
      urls: {
        recognizedHostnames: KIMI_HOSTNAMES,
        storageOrigin: KIMI_CONSOLE_ORIGIN,
        duplicateOrigin: KIMI_CONSOLE_ORIGIN,
        managedChannelOrigin: KIMI_API_BASE_URL,
        inferenceApiBaseUrls: {
          openAiCompatible: KIMI_API_BASE_URL,
          anthropic: "https://api.moonshot.cn/anthropic",
        },
      },
    },
  },
  {
    siteType: SITE_TYPES.KIMI_GLOBAL,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.KimiOpenPlatform,
    onboarding: {
      displayName: KIMI_GLOBAL_DISPLAY_NAME,
      accountForm: {
        fixedSiteUrl: KIMI_GLOBAL_CONSOLE_ORIGIN,
        defaultSiteName: KIMI_GLOBAL_DISPLAY_NAME,
      },
      detection: { hostnames: KIMI_GLOBAL_HOSTNAMES },
      routes: {
        loginPath: "/console/account",
        usagePath: "/console/account",
        adminCredentialsPath: "/console/api-keys",
        checkInPath: null,
        accessTokenPath: null,
        redeemPath: null,
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
        userIdRequired: true,
        storedUserIdentityFields: ["id", "username"],
      },
      modelList: {
        statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
        displayCapabilitiesSource:
          ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
        groupSemantics: ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE,
      },
      urls: {
        recognizedHostnames: KIMI_GLOBAL_HOSTNAMES,
        storageOrigin: KIMI_GLOBAL_CONSOLE_ORIGIN,
        duplicateOrigin: KIMI_GLOBAL_CONSOLE_ORIGIN,
        managedChannelOrigin: KIMI_GLOBAL_API_BASE_URL,
        inferenceApiBaseUrls: {
          openAiCompatible: KIMI_GLOBAL_API_BASE_URL,
          anthropic: "https://api.moonshot.ai/anthropic",
        },
      },
    },
  },
  {
    siteType: SITE_TYPES.GRSAI,
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Grsai,
    onboarding: {
      displayName: GRSAI_DISPLAY_NAME,
      detection: { hostnames: GRSAI_HOSTNAMES },
      // Console routes verified against the deployment's own router table. The
      // console is served on grsai.com and grsai.ai; it has no separate sign-in
      // route (/login, /sign-in and /register all answer 404), so /dashboard
      // owns the signed-out state and is what "open the console" means.
      routes: {
        loginPath: GRSAI_ACCOUNT_PATH,
        usagePath: "/dashboard/consumption-log",
        adminCredentialsPath: "/dashboard/api-keys",
        siteAnnouncementsPath: null,
        pricingPath: "/dashboard/models",
        // No check-in flow, no separate access-token page, no activation codes.
        checkInPath: null,
        accessTokenPath: null,
        redeemPath: null,
      },
    },
    productProfile: {
      auth: {
        allowedAuthTypes: [ACCOUNT_SITE_AUTH_TYPES.AccessToken],
        defaultAuthType: ACCOUNT_SITE_AUTH_TYPES.AccessToken,
        defaultAuthHostnames: [],
      },
      identity: {
        // The console identifies an account by its sign-in email and never
        // exposes a separate display name; the saved session token alone
        // authenticates every call, so manual adds must not demand an id.
        usernameRequired: false,
        userIdRequired: false,
        storedUserIdentityFields: ["id", "username"],
      },
      modelList: {
        statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
        displayCapabilitiesSource:
          ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
        groupSemantics: ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE,
      },
      tokenForm: {
        // Keys carry no network restrictions; only quota and expiry.
        networkLimitPolicy:
          ACCOUNT_SITE_TOKEN_FORM_NETWORK_LIMIT_POLICIES.IpList,
      },
      // The two console domains are equivalent; accounts keep whichever host
      // they were detected on instead of being rewritten to a canonical origin.
      urls: {
        recognizedHostnames: GRSAI_HOSTNAMES,
        inferFromHostname: true,
        inferenceApiBaseUrls: {
          openAiCompatible: GRSAI_API_BASE_URL,
        },
      },
    },
  },
] as const satisfies readonly RegisteredAccountSiteDefinition[]

const MANAGED_ONLY_SITE_DEFINITIONS = [
  {
    siteType: SITE_TYPES.CLI_PROXY_API,
    scopes: MANAGED_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported,
    managedResource: {
      ...LEGACY_MANAGED_CHANNEL_POLICY,
      consoleRoutes: {
        channels: "/management.html",
        tokens: "/management.html",
      },
      labelKey: "settings:managedSite.cliProxyApi",
      getStartedUrl: "https://help.router-for.me/introduction/quick-start.html",
      messagesKey: "cliProxyApi",
      tableFieldIds: CLI_PROXY_API_TABLE_FIELDS,
      detailFieldIds: CLI_PROXY_API_DETAIL_FIELDS,
    },
  },
  {
    siteType: SITE_TYPES.OCTOPUS,
    scopes: MANAGED_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported,
    managedResource: {
      ...LEGACY_MANAGED_CHANNEL_POLICY,
      consoleRoutes: { channels: "/model", tokens: "/keys" },
      labelKey: "settings:managedSite.octopus",
      getStartedUrl: "https://github.com/bestruirui/octopus#-quick-start",
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
      getStartedUrl:
        "https://github.com/looplj/axonhub#-部署指南--deployment-guide",
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
      getStartedUrl:
        "https://github.com/ding113/claude-code-hub#-快速开始-quick-start",
      messagesKey: "claudecodehub",
      tableFieldIds: CLAUDE_CODE_HUB_MANAGED_RESOURCE_TABLE_FIELD_IDS,
      detailFieldIds: CLAUDE_CODE_HUB_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
    },
  },
  {
    // OmniRoute is a self-hosted TypeScript fork of 9router, but it has diverged
    // far enough that the two share no usable contract: scoped bearer tokens
    // (no cookie session), connection-level base-URL overrides, and masked
    // channel reads all exist only here. Not a CLIProxyAPI alias either — that
    // integration is `/v0/management` + `X-Management-Key`.
    siteType: SITE_TYPES.OMNIROUTE,
    scopes: MANAGED_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported,
    managedResource: {
      ...LEGACY_MANAGED_CHANNEL_POLICY,
      consoleRoutes: {
        channels: "/dashboard/providers",
        tokens: "/dashboard/api-manager",
      },
      labelKey: "settings:managedSite.omniroute",
      getStartedUrl: "https://github.com/diegosouzapw/OmniRoute#-quick-start",
      messagesKey: "omniroute",
      tableFieldIds: OMNIROUTE_MANAGED_RESOURCE_TABLE_FIELD_IDS,
      detailFieldIds: OMNIROUTE_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
      settingsTarget: {
        ...LEGACY_MANAGED_CHANNEL_POLICY.settingsTarget,
        anchor: SETTINGS_ANCHORS.OMNIROUTE,
      },
    },
  },
  {
    // gpt-load is a self-hosted Go AI gateway. It owns no upstream account of
    // its own (no balance, plan, or check-in) and exposes no enumerable official
    // hostname, so it is managed-only with no account scope and no detection.
    // Its management object is a group: one channel driver, a credential pool,
    // and a model list. Not a New API-family alias: its control plane is
    // `/api/*` behind the root AUTH_KEY bearer, with a `{code,message,data}`
    // envelope whose error `code` is a string.
    siteType: SITE_TYPES.GPT_LOAD,
    scopes: MANAGED_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported,
    managedResource: {
      ...LEGACY_MANAGED_CHANNEL_POLICY,
      consoleRoutes: {
        channels: "/groups",
        tokens: "/access-keys",
      },
      labelKey: "settings:managedSite.gptLoad",
      getStartedUrl: "https://github.com/tbphp/gpt-load#-quick-start",
      messagesKey: "gptLoad",
      tableFieldIds: GPT_LOAD_MANAGED_RESOURCE_TABLE_FIELD_IDS,
      detailFieldIds: GPT_LOAD_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
      settingsTarget: {
        ...LEGACY_MANAGED_CHANNEL_POLICY.settingsTarget,
        anchor: SETTINGS_ANCHORS.GPT_LOAD,
      },
    },
  },
] as const satisfies readonly AccountSiteDefinition[]

const ACCOUNT_SITE_DEFINITION_OVERRIDES = [
  {
    siteType: SITE_TYPES.VELOERA,
    tokenKey: { optionalSkPrefix: true },
    accountLogin: {
      ...NEW_API_COMPATIBLE_LOGIN,
      methods: ["github", "linuxdo", "oidc"],
      // github.com/Veloera/Veloera: middleware/auth.go and
      // web/src/components/OAuth2Callback.js own this session/header contract.
      protocols: {
        newApi: {
          userIdHeader: "Veloera-User",
          completionPaths: ["/app/tokens"],
        },
      },
    },
    scopes: ACCOUNT_AND_MANAGED_SCOPES,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    managedResource: {
      ...LEGACY_MANAGED_CHANNEL_POLICY,
      consoleRoutes: { channels: "/admin/channels", tokens: "/app/tokens" },
      labelKey: "settings:managedSite.veloera",
      getStartedUrl: "https://github.com/Veloera/Veloera#部署",
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
      getStartedUrl: "https://github.com/deanxv/done-hub#部署",
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
    accountLogin: {
      ...NEW_API_COMPATIBLE_LOGIN,
      protocols: {
        newApi: {
          ...NEW_API_COMPATIBLE_LOGIN.protocols.newApi,
          userIdHeader: "X-Api-User",
        },
      },
    },
    scopes: ACCOUNT_SCOPE,
    adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    onboarding: {
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.V_API)],
        compatUserIdHeaderNames: ["X-Api-User"],
      },
      browserUserStorage: "v-api",
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
    accountLogin: NEW_API_COMPATIBLE_LOGIN,
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
    // Retains the existing Rix session contract; no canonical source is recorded.
    accountLogin: {
      ...NEW_API_COMPATIBLE_LOGIN,
      protocols: {
        newApi: {
          ...NEW_API_COMPATIBLE_LOGIN.protocols.newApi,
          userIdHeader: "Rix-Api-User",
        },
      },
    },
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
        // Rix API 6.x issues its account credential from the console's admin-keys
        // page, which is also where the site states its two-factor / passkey /
        // phone requirement for that action.
        accessTokenPath: "/admin-keys",
        siteAnnouncementsPath: "/",
      },
    },
    productProfile: {
      identity: {
        usernameRequired: true,
        // Rix API 6.x omits `id` from its self DTO (observed 2026-09-26 on
        // platform.ephone.ai and the vendor demo platform.rixapi.com), so a
        // manually added account has no numeric id to supply. `id` stays first
        // because older deployments still expose it.
        userIdRequired: false,
        storedUserIdentityFields: ["id", "username"],
      },
    },
  },
  {
    siteType: SITE_TYPES.NEO_API,
    tokenKey: { optionalSkPrefix: true },
    // Retains the existing Neo session contract; no canonical source is recorded.
    accountLogin: {
      ...NEW_API_COMPATIBLE_LOGIN,
      protocols: {
        newApi: {
          ...NEW_API_COMPATIBLE_LOGIN.protocols.newApi,
          userIdHeader: "neo-api-user",
        },
      },
    },
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
    accountLogin: NEW_API_COMPATIBLE_LOGIN,
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
