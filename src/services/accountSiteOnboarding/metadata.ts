import type {
  AccountSiteOnboardingMetadata,
  AccountSiteRouteConfig,
} from "~/services/accountSiteOnboarding/contracts"
import { ACCOUNT_SITE_ADAPTER_FAMILIES } from "~/services/accountSiteOnboarding/contracts"

import {
  AIHUBMIX_HOSTNAMES,
  AIHUBMIX_LOGIN_PATH,
  SITE_TYPES,
  type AccountSiteType,
} from "./siteTypes"

type AccountSiteRouteOverrideMetadata = Partial<AccountSiteRouteConfig>

type AccountSiteTitleRuleMetadata = {
  name: AccountSiteType
  regex: RegExp
}

type AccountSiteDomainRuleMetadata = {
  name: AccountSiteType
  hostnames: readonly string[]
}

/**
 * Clones detection metadata arrays before exposing registry projections.
 */
function cloneDetectionMetadata(
  detection: AccountSiteOnboardingMetadata["detection"],
) {
  if (!detection) return undefined

  return {
    ...detection,
    titlePatterns: detection.titlePatterns
      ? [...detection.titlePatterns]
      : undefined,
    hostnames: detection.hostnames ? [...detection.hostnames] : undefined,
    compatUserIdHeaderNames: detection.compatUserIdHeaderNames
      ? [...detection.compatUserIdHeaderNames]
      : undefined,
  }
}

/**
 * Error-message detection should only use header names that carry an
 * unambiguous site-family signal. Generic compatibility headers like `User-id`
 * are intentionally excluded to avoid over-classifying unrelated deployments.
 */
export const COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE = {
  "New-API-User": SITE_TYPES.NEW_API,
  "Veloera-User": SITE_TYPES.VELOERA,
  "X-Api-User": SITE_TYPES.V_API,
  "voapi-user": SITE_TYPES.VO_API,
  "Rix-Api-User": SITE_TYPES.RIX_API,
  "neo-api-user": SITE_TYPES.NEO_API,
} as const satisfies Record<string, AccountSiteType>

/**
 * Builds the legacy title-matching pattern for a site type display name.
 */
function makeTitleRegex(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = escaped.replace(/-/g, "[-_ ]?")
  return new RegExp(`\\b${pattern}\\b`, "i")
}

const DEFAULT_LOGIN_PATH = "/login"
const DEFAULT_USAGE_PATH = "/console/log"
const DEFAULT_CHECKIN_PATH = "/console/personal"
const DEFAULT_REDEEM_PATH = "/console/topup"
const DEFAULT_ADMIN_CREDENTIALS_PATH = DEFAULT_CHECKIN_PATH
const DEFAULT_SITE_ANNOUNCEMENTS_PATH = "/"

export const DEFAULT_SITE_ROUTE_CONFIG = {
  loginPath: DEFAULT_LOGIN_PATH,
  usagePath: DEFAULT_USAGE_PATH,
  checkInPath: DEFAULT_CHECKIN_PATH,
  adminCredentialsPath: DEFAULT_ADMIN_CREDENTIALS_PATH,
  redeemPath: DEFAULT_REDEEM_PATH,
  siteAnnouncementsPath: DEFAULT_SITE_ANNOUNCEMENTS_PATH,
} as const satisfies Required<AccountSiteRouteConfig>

const accountSiteOnboardingMetadata: readonly AccountSiteOnboardingMetadata[] =
  [
    {
      siteType: SITE_TYPES.ONE_API,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.ONE_API)] },
      routes: { usagePath: DEFAULT_USAGE_PATH },
    },
    {
      siteType: SITE_TYPES.NEW_API,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.NEW_API)],
      },
      routes: {
        usagePath: DEFAULT_USAGE_PATH,
        checkInPath: "/console/personal",
        adminCredentialsPath: "/console/personal",
      },
    },
    {
      siteType: SITE_TYPES.ANYROUTER,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
      detection: { titlePatterns: [/\bany\s*router\b/i] },
      routes: { checkInPath: "/console/topup" },
    },
    {
      siteType: SITE_TYPES.VELOERA,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.VELOERA)],
      },
      routes: {
        usagePath: "/app/logs/api-usage",
        checkInPath: "/app/me",
        redeemPath: "/app/wallet",
        adminCredentialsPath: "/app/me",
      },
    },
    {
      siteType: SITE_TYPES.ONE_HUB,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.ONE_HUB)] },
      routes: {
        usagePath: "/panel/log",
        redeemPath: "/panel/topup",
        adminCredentialsPath: "/panel/profile",
      },
    },
    {
      siteType: SITE_TYPES.DONE_HUB,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.DONE_HUB)] },
      routes: {
        usagePath: "/panel/log",
        redeemPath: "/panel/topup",
        adminCredentialsPath: "/panel/profile",
      },
    },
    {
      siteType: SITE_TYPES.V_API,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.V_API)],
      },
      routes: {
        usagePath: "/panel/log",
        checkInPath: "/panel/profile",
        redeemPath: "/panel/topup",
        adminCredentialsPath: "/panel/profile",
      },
    },
    {
      siteType: SITE_TYPES.VO_API,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.VO_API)],
      },
      routes: { usagePath: DEFAULT_USAGE_PATH, redeemPath: "/wallet" },
    },
    {
      siteType: SITE_TYPES.SUPER_API,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.SUPER_API)] },
    },
    {
      siteType: SITE_TYPES.RIX_API,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.RIX_API)],
      },
      routes: {
        usagePath: "/log",
        checkInPath: "/panel",
        redeemPath: "/topup",
      },
    },
    {
      siteType: SITE_TYPES.NEO_API,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
      detection: {
        titlePatterns: [makeTitleRegex(SITE_TYPES.NEO_API)],
      },
    },
    {
      siteType: SITE_TYPES.WONG_GONGYI,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
      detection: { titlePatterns: [/wong\s*公益站/i] },
      routes: { checkInPath: "/console/topup" },
    },
    {
      siteType: SITE_TYPES.SUB2API,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Sub2Api,
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.SUB2API)] },
      routes: {
        usagePath: "/usage",
        redeemPath: "/redeem",
        siteAnnouncementsPath: "/dashboard",
      },
    },
    {
      siteType: SITE_TYPES.AIHUBMIX,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix,
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
    {
      siteType: SITE_TYPES.UNKNOWN,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
      detection: { titlePatterns: [makeTitleRegex(SITE_TYPES.UNKNOWN)] },
    },
  ]

/**
 * Returns the static onboarding metadata for an account site type.
 */
export function getAccountSiteMetadata(siteType: AccountSiteType) {
  const metadata = accountSiteOnboardingMetadata.find(
    (metadata) => metadata.siteType === siteType,
  )

  if (!metadata) return undefined

  return {
    ...metadata,
    detection: cloneDetectionMetadata(metadata.detection),
    routes: metadata.routes ? { ...metadata.routes } : undefined,
  }
}

/**
 * Projects title-detection metadata into the legacy rule shape.
 */
export function getAccountSiteTitleRuleMetadata(): readonly AccountSiteTitleRuleMetadata[] {
  return accountSiteOnboardingMetadata.flatMap(
    (metadata) =>
      metadata.detection?.titlePatterns?.map((regex) => ({
        name: metadata.siteType,
        regex,
      })) ?? [],
  )
}

/**
 * Projects domain-detection metadata into the legacy rule shape.
 */
export function getAccountSiteDomainRuleMetadata(): readonly AccountSiteDomainRuleMetadata[] {
  return accountSiteOnboardingMetadata.flatMap((metadata) =>
    metadata.detection?.hostnames
      ? [
          {
            name: metadata.siteType,
            hostnames: [...metadata.detection.hostnames],
          },
        ]
      : [],
  )
}

/**
 * Returns the route overrides defined by metadata for one account site type.
 */
export function getAccountSiteRouteOverrideMetadata(
  siteType: AccountSiteType,
): AccountSiteRouteOverrideMetadata {
  return { ...(getAccountSiteMetadata(siteType)?.routes ?? {}) }
}

/**
 * Returns the adapter family declared by account-site metadata.
 */
export function getAccountSiteAdapterFamilyMetadata(siteType: AccountSiteType) {
  const metadata = accountSiteOnboardingMetadata.find(
    (metadata) => metadata.siteType === siteType,
  )

  return metadata?.adapterFamily ?? ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported
}

/**
 * Projects compatible user-id header metadata into normalized rules.
 */
export function getAccountSiteCompatUserIdHeaderRules() {
  return Object.entries(COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE).map(
    ([headerName, siteType]) => ({ siteType, headerName }),
  )
}
