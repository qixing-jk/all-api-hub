import {
  getAccountSiteCompatUserIdHeaderRules as getAccountSiteCompatUserIdHeaderRuleMetadata,
  getAccountSiteDomainRuleMetadata,
  getAccountSiteTitleRuleMetadata,
} from "~/services/accountSiteOnboarding/metadata"
import { aihubmixBrowserIdentity } from "~/services/apiAdapters/aihubmix/browserIdentity"
import type {
  AccountBrowserIdentityCapability,
  AccountBrowserIdentityContext,
} from "~/services/apiAdapters/contracts/accountBrowserIdentity"
import { newApiBrowserIdentity } from "~/services/apiAdapters/newApi/browserIdentity"
import { openRouterAccountDetectionPrivacy } from "~/services/apiAdapters/openrouter/accountDetection"
import { openRouterBrowserIdentity } from "~/services/apiAdapters/openrouter/browserIdentity"
import { sharedChatBrowserIdentity } from "~/services/apiAdapters/sharedchat/browserIdentity"
import { sub2ApiBrowserIdentity } from "~/services/apiAdapters/sub2api/browserIdentity"
import { voApiV2BrowserIdentity } from "~/services/apiAdapters/voapiV2/browserIdentity"

import { apiyiContentSessionExtractor } from "./contentSession/apiyi"
import { compatibleUserContentSessionExtractor } from "./contentSession/compatibleUser"
import { newApiAuthBundleContentSessionExtractor } from "./contentSession/newApiAuthBundle"
import { sharedChatContentSessionExtractor } from "./contentSession/sharedchat"
import { sub2ApiContentSessionExtractor } from "./contentSession/sub2api"
import { vApiContentSessionExtractor } from "./contentSession/vApi"
import { voApiV2ContentSessionExtractor } from "./contentSession/voapiV2"
import type {
  AccountDetectionPrivacyPolicy,
  ContentSessionExtractor,
} from "./contracts"

// Browser-context capabilities share one registration with session extraction.
// Passive identity checks never invoke extractors, which may refresh credentials.
const siteBrowserAdapters: readonly {
  sessionExtractor?: ContentSessionExtractor
  identity?: AccountBrowserIdentityCapability
  detectionPrivacy?: AccountDetectionPrivacyPolicy
}[] = [
  {
    sessionExtractor: sub2ApiContentSessionExtractor,
    identity: sub2ApiBrowserIdentity,
  },
  {
    sessionExtractor: sharedChatContentSessionExtractor,
    identity: sharedChatBrowserIdentity,
  },
  {
    sessionExtractor: voApiV2ContentSessionExtractor,
    identity: voApiV2BrowserIdentity,
  },
  { sessionExtractor: vApiContentSessionExtractor },
  { sessionExtractor: apiyiContentSessionExtractor },
  { sessionExtractor: newApiAuthBundleContentSessionExtractor },
  { identity: aihubmixBrowserIdentity },
  {
    identity: openRouterBrowserIdentity,
    detectionPrivacy: openRouterAccountDetectionPrivacy,
  },
  {
    sessionExtractor: compatibleUserContentSessionExtractor,
    identity: newApiBrowserIdentity,
  },
]

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
  return siteBrowserAdapters.flatMap(({ sessionExtractor }) =>
    sessionExtractor ? [sessionExtractor] : [],
  )
}

/** Selects an implemented passive capability without executing an onboarding flow. */
export function getAccountBrowserIdentityCapability(
  context: AccountBrowserIdentityContext,
) {
  return siteBrowserAdapters.find(({ identity }) =>
    identity?.canObserve(context),
  )?.identity
}

/** Resolves disclosure policy from the requested URL, never a detected site hint. */
export function getAccountDetectionPrivacyPolicy(url: string) {
  return siteBrowserAdapters.find(({ detectionPrivacy }) =>
    detectionPrivacy?.matchesUrl(url),
  )?.detectionPrivacy
}
