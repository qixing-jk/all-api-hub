import {
  getAccountSiteDefinitions,
  getAccountSiteOnboardingDefinitions,
} from "~/services/accountSiteDefinitions"
import type { AccountSiteRouteConfig } from "~/services/accountSiteDefinitions/contracts"
import type { AccountSiteType } from "~/services/accountSiteDefinitions/siteTypes"
import type { AccountSiteOnboardingMetadata } from "~/services/accountSiteOnboarding/contracts"

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

const getAccountSiteOnboardingMetadata =
  (): readonly AccountSiteOnboardingMetadata[] =>
    getAccountSiteOnboardingDefinitions().map((definition) => ({
      siteType: definition.siteType as AccountSiteType,
      adapterFamily: definition.adapterFamily,
      detection: definition.detection,
      routes: definition.routes,
    }))

/**
 * Returns the static onboarding metadata for an account site type.
 */
function getAccountSiteMetadata(siteType: AccountSiteType) {
  const metadata = getAccountSiteOnboardingMetadata().find(
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
  return getAccountSiteOnboardingMetadata().flatMap(
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
  return getAccountSiteOnboardingMetadata().flatMap((metadata) =>
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
 * Projects compatible user-id header metadata into normalized rules.
 */
export function getAccountSiteCompatUserIdHeaderRules() {
  return getAccountSiteDefinitions().flatMap(
    (definition) =>
      definition.onboarding?.detection?.compatUserIdHeaderNames?.map(
        (headerName) => ({
          siteType: definition.siteType as AccountSiteType,
          headerName,
        }),
      ) ?? [],
  )
}
