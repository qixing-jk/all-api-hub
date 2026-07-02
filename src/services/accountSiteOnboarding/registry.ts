import {
  getAccountSiteCompatUserIdHeaderRules as getAccountSiteCompatUserIdHeaderRuleMetadata,
  getAccountSiteDomainRuleMetadata,
  getAccountSiteTitleRuleMetadata,
} from "~/services/accountSiteOnboarding/metadata"

import { compatibleUserContentSessionExtractor } from "./contentSession/compatibleUser"
import { sharedChatContentSessionExtractor } from "./contentSession/sharedchat"
import { sub2ApiContentSessionExtractor } from "./contentSession/sub2api"
import type { ContentSessionExtractor } from "./contracts"

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
 * Returns content-session extractors in account onboarding priority order.
 */
export function getContentSessionExtractors(): readonly ContentSessionExtractor[] {
  return [
    sub2ApiContentSessionExtractor,
    sharedChatContentSessionExtractor,
    compatibleUserContentSessionExtractor,
  ]
}
