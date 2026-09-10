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
  // The registry already returns defensive copies, so resolve against one snapshot.
  const definitions = getAccountSiteOnboardingDefinitions()
  const metadata =
    definitions.find((definition) => definition.siteType === siteType) ??
    definitions.find((definition) => definition.siteType === SITE_TYPES.UNKNOWN)
  if (!metadata?.routes)
    throw new Error(
      "Account site registration is missing its route declaration",
    )
  return metadata.routes
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
