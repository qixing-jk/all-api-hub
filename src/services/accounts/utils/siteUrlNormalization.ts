import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  isAccountSiteProfileUrl,
  normalizeAccountSiteProfileUrlForDuplicateCheck,
  normalizeAccountSiteProfileUrlForManagedChannel,
  normalizeAccountSiteProfileUrlForOriginKey,
  normalizeAccountSiteProfileUrlForStorage,
} from "~/services/accounts/accountSiteProfile"

/**
 * Checks whether a user-supplied URL points at one of AIHubMix's supported hosts.
 */
export function isAIHubMixSiteUrl(value: string): boolean {
  return isAccountSiteProfileUrl(SITE_TYPES.AIHUBMIX, value)
}

/**
 * Canonicalizes the URL persisted for account UI navigation.
 *
 * AIHubMix API calls are pinned to `https://aihubmix.com`, while the user-facing
 * console pages live under `https://console.aihubmix.com`.
 */
export function normalizeAccountSiteUrlForStorage(params: {
  siteType: AccountSiteType | string
  url: string
}): string {
  return normalizeAccountSiteProfileUrlForStorage(params)
}

/**
 * Resolves the API origin to use when an account is exported into a managed-site
 * upstream channel. AIHubMix adapters pin token-authenticated API traffic to
 * `https://aihubmix.com`; the console origin is only the account UI entrypoint.
 *
 * Source: https://docs.aihubmix.com/en/api/Aihubmix-Integration documents
 * OpenAI-compatible calls with `base_url="https://aihubmix.com/v1"`.
 */
export function normalizeAccountSiteUrlForManagedChannel(params: {
  siteType?: AccountSiteType | string
  url: string
}): string {
  return normalizeAccountSiteProfileUrlForManagedChannel(params)
}

/**
 * Returns an account copy with the upstream URL normalized for managed-channel
 * import flows.
 */
export function normalizeAccountForManagedChannel<
  TAccount extends { siteType?: AccountSiteType | string; baseUrl: string },
>(account: TAccount): TAccount {
  return {
    ...account,
    baseUrl: normalizeAccountSiteUrlForManagedChannel({
      siteType: account.siteType,
      url: account.baseUrl,
    }),
  }
}

/**
 * Produces a stable origin key for duplicate-account scans and warnings.
 */
export function normalizeAccountSiteUrlForOriginKey(params: {
  siteType?: AccountSiteType | string
  url: string
}): string {
  return normalizeAccountSiteProfileUrlForOriginKey(params)
}

/**
 * Produces the scannable origin key used by duplicate-site detection.
 */
export function normalizeAccountSiteUrlForDuplicateCheck(params: {
  siteType?: AccountSiteType | string
  url: string
}): string | undefined {
  return normalizeAccountSiteProfileUrlForDuplicateCheck(params)
}

/**
 * Compares account site URLs using the same canonical origin key used by
 * duplicate-account scans and add-flow warnings.
 */
export function isSameAccountSiteOrigin(
  left: {
    siteType?: AccountSiteType | string
    url: string
  },
  right: {
    siteType?: AccountSiteType | string
    url: string
  },
): boolean {
  const leftKey = normalizeAccountSiteUrlForDuplicateCheck(left)
  const rightKey = normalizeAccountSiteUrlForDuplicateCheck(right)

  return Boolean(leftKey && rightKey && leftKey === rightKey)
}
