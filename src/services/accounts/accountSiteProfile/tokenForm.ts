import type { AccountSiteType } from "~/constants/siteType"

import type {
  AccountSiteCreatedTokenSecretHandling,
  AccountSiteTokenFormNetworkLimitPolicy,
} from "./contracts"
import { getAccountSiteProductProfile } from "./registry"

/**
 * Resolves how a created token secret should be surfaced for an account site.
 */
export function resolveAccountSiteCreatedTokenSecretHandling(account: {
  siteType: AccountSiteType
}): AccountSiteCreatedTokenSecretHandling {
  return getAccountSiteProductProfile(account.siteType).createdToken
    .secretHandling
}

/**
 * Resolves the network-limit semantics used by the token form for an account site.
 */
export function resolveAccountSiteTokenFormNetworkLimitPolicy(account: {
  siteType: AccountSiteType
}): AccountSiteTokenFormNetworkLimitPolicy {
  return getAccountSiteProductProfile(account.siteType).tokenForm
    .networkLimitPolicy
}
