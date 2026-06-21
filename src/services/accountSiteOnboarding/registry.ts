import { compatibleUserContentSessionExtractor } from "./contentSession/compatibleUser"
import { sub2ApiContentSessionExtractor } from "./contentSession/sub2api"
import type { ContentSessionExtractor } from "./contracts"
import {
  getAccountSiteAdapterFamilyMetadata,
  getAccountSiteCompatUserIdHeaderRules as getAccountSiteCompatUserIdHeaderRuleMetadata,
  getAccountSiteDomainRuleMetadata,
  getAccountSiteMetadata,
  getAccountSiteRouteOverrideMetadata,
  getAccountSiteTitleRuleMetadata,
} from "./metadata"
import type { AccountSiteType } from "./siteTypes"

/**
 * Returns the onboarding definition for one account site type.
 */
export function getAccountSiteOnboardingDefinition(siteType: AccountSiteType) {
  return getAccountSiteMetadata(siteType)
}

/**
 * Returns domain-detection rules for account site onboarding.
 */
export function getAccountSiteDomainRules() {
  return getAccountSiteDomainRuleMetadata()
}

/**
 * Returns title-detection rules for account site onboarding.
 */
export function getAccountSiteTitleRules() {
  return getAccountSiteTitleRuleMetadata()
}

/**
 * Returns compat user-id header detection rules for account site onboarding.
 */
export function getAccountSiteCompatUserIdHeaderRules() {
  return getAccountSiteCompatUserIdHeaderRuleMetadata()
}

/**
 * Returns the adapter family declared for one account site type.
 */
export function getAccountSiteAdapterFamily(siteType: AccountSiteType) {
  return getAccountSiteAdapterFamilyMetadata(siteType)
}

/**
 * Returns route overrides for one account site type.
 */
export function getAccountSiteRouteOverrides(siteType: AccountSiteType) {
  return getAccountSiteRouteOverrideMetadata(siteType)
}

/**
 * Returns content-session extractors in account onboarding priority order.
 */
export function getContentSessionExtractors(): readonly ContentSessionExtractor[] {
  return [sub2ApiContentSessionExtractor, compatibleUserContentSessionExtractor]
}
