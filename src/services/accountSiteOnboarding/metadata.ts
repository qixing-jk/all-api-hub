import {
  getAccountSiteDefinitions,
  getAccountSiteOnboardingDefinitions,
} from "~/services/accountSiteDefinitions"
import type { AccountSiteRouteConfig } from "~/services/accountSiteDefinitions/contracts"
import { SITE_TYPES } from "~/services/accountSiteDefinitions/identifiers"
import type { AccountSiteType } from "~/services/accountSiteDefinitions/siteTypes"
import type { AccountSiteOnboardingMetadata } from "~/services/accountSiteOnboarding/contracts"

type AccountSiteTitleRuleMetadata = {
  name: AccountSiteType
  regex: RegExp
}

type AccountSiteDomainRuleMetadata = {
  name: AccountSiteType
  hostnames: readonly string[]
}

const getAccountSiteOnboardingMetadata =
  (): readonly AccountSiteOnboardingMetadata[] =>
    getAccountSiteOnboardingDefinitions().map((definition) => ({
      siteType: definition.siteType as AccountSiteType,
      adapterFamily: definition.adapterFamily,
      detection: definition.detection,
      routes: definition.routes,
    }))

// Definitions are static. Keep the route-only projection private and return a
// fresh copy per lookup, without cloning detection or login policy per model.
const routesBySiteType = new Map<string, AccountSiteRouteConfig>(
  getAccountSiteOnboardingDefinitions().map(({ siteType, routes }) => [
    siteType,
    routes,
  ]),
)

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
 * Returns complete site-owned routes; only unregistered inputs use the unknown-site routes.
 */
export function getAccountSiteRouteMetadata(
  siteType: unknown,
): AccountSiteRouteConfig {
  const routes =
    (typeof siteType === "string"
      ? routesBySiteType.get(siteType)
      : undefined) ?? routesBySiteType.get(SITE_TYPES.UNKNOWN)
  if (!routes)
    throw new Error(
      "Account site registration is missing its route declaration",
    )
  return { ...routes }
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
