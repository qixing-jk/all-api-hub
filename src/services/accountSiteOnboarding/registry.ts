import {
  getAccountSiteCompatUserIdHeaderRules as getAccountSiteCompatUserIdHeaderRuleMetadata,
  getAccountSiteDomainRuleMetadata,
  getAccountSiteTitleRuleMetadata,
} from "~/services/accountSiteOnboarding/metadata"
import { aihubmixBrowserIdentity } from "~/services/apiAdapters/aihubmix/account/browserIdentity"
import type {
  AccountBrowserIdentityCapability,
  AccountBrowserIdentityContext,
} from "~/services/apiAdapters/contracts/accountBrowserIdentity"
import { cubenceBrowserIdentity } from "~/services/apiAdapters/cubence/browserIdentity"
import { dahlBrowserIdentity } from "~/services/apiAdapters/dahl/browserIdentity"
import { emRankBrowserIdentity } from "~/services/apiAdapters/emrank/browserIdentity"
import { foxCodeBrowserIdentity } from "~/services/apiAdapters/foxcode/browserIdentity"
import { freeModelBrowserIdentity } from "~/services/apiAdapters/freemodel/browserIdentity"
import { kimiOpenPlatformBrowserIdentity } from "~/services/apiAdapters/kimiOpenPlatform/browserIdentity"
import { krillBrowserIdentity } from "~/services/apiAdapters/krill/browserIdentity"
import { newApiBrowserIdentity } from "~/services/apiAdapters/newApi/account/browserIdentity"
import { openRouterAccountDetectionPrivacy } from "~/services/apiAdapters/openrouter/account/accountDetection"
import { openRouterBrowserIdentity } from "~/services/apiAdapters/openrouter/account/browserIdentity"
import { rightCodeBrowserIdentity } from "~/services/apiAdapters/rightcode/account/browserIdentity"
import { sharedChatBrowserIdentity } from "~/services/apiAdapters/sharedchat/browserIdentity"
import { sub2ApiBrowserIdentity } from "~/services/apiAdapters/sub2api/auth/browserIdentity"
import { voApiV2BrowserIdentity } from "~/services/apiAdapters/voapiV2/browserIdentity"
import { xiaoenBrowserIdentity } from "~/services/apiAdapters/xiaoen/browserIdentity"

import { apiyiContentSessionExtractor } from "./contentSession/apiyi"
import { compatibleUserContentSessionExtractor } from "./contentSession/compatibleUser"
import { cubenceContentSessionExtractor } from "./contentSession/cubence"
import { dahlContentSessionExtractor } from "./contentSession/dahl"
import { emRankContentSessionExtractor } from "./contentSession/emrank"
import { foxCodeContentSessionExtractor } from "./contentSession/foxcode"
import { freeModelContentSessionExtractor } from "./contentSession/freemodel"
import { grsaiContentSessionExtractor } from "./contentSession/grsai"
import { kimiOpenPlatformContentSessionExtractor } from "./contentSession/kimiOpenPlatform"
import { krillContentSessionExtractor } from "./contentSession/krill"
import { newApiAuthBundleContentSessionExtractor } from "./contentSession/newApiAuthBundle"
import { rightCodeContentSessionExtractor } from "./contentSession/rightcode"
import { sharedChatContentSessionExtractor } from "./contentSession/sharedchat"
import { sub2ApiContentSessionExtractor } from "./contentSession/sub2api"
import { vApiContentSessionExtractor } from "./contentSession/vApi"
import { voApiV2ContentSessionExtractor } from "./contentSession/voapiV2"
import { xiaoenContentSessionExtractor } from "./contentSession/xiaoen"
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
    sessionExtractor: krillContentSessionExtractor,
    identity: krillBrowserIdentity,
  },
  {
    sessionExtractor: xiaoenContentSessionExtractor,
    identity: xiaoenBrowserIdentity,
  },
  {
    sessionExtractor: foxCodeContentSessionExtractor,
    identity: foxCodeBrowserIdentity,
  },
  {
    sessionExtractor: cubenceContentSessionExtractor,
    identity: cubenceBrowserIdentity,
  },
  {
    sessionExtractor: freeModelContentSessionExtractor,
    identity: freeModelBrowserIdentity,
  },
  {
    sessionExtractor: dahlContentSessionExtractor,
    identity: dahlBrowserIdentity,
  },
  {
    sessionExtractor: emRankContentSessionExtractor,
    identity: emRankBrowserIdentity,
  },
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
  {
    sessionExtractor: kimiOpenPlatformContentSessionExtractor,
    identity: kimiOpenPlatformBrowserIdentity,
  },
  {
    sessionExtractor: rightCodeContentSessionExtractor,
    identity: rightCodeBrowserIdentity,
  },
  { sessionExtractor: grsaiContentSessionExtractor },
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
