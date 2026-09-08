import {
  ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING,
  resolveAccountSiteCreatedTokenSecretHandling,
} from "~/services/accounts/accountSiteProfile"
import { hasUsableApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { ApiToken, DisplaySiteData } from "~/types"

/**
 * AIHubMix may only expose the full API key secret in create responses; later
 * list/detail reads can be masked.
 *
 * Sources:
 * - https://docs.aihubmix.com/en/api/CliEndpoints/create-key
 * - https://github.com/Wei-Shaw/sub2api
 *
 * Sub2API also returns key DTOs from `/api/v1/keys`, but upstream exposes
 * list/get/create routes with the key value directly, so a create DTO is not a
 * one-time-only secret by itself.
 */
export const shouldShowOneTimeKeyDialogForAccount = (
  account: Pick<DisplaySiteData, "siteType">,
) =>
  resolveAccountSiteCreatedTokenSecretHandling(account) ===
  ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING.OneTimeSecretDialog

export const shouldShowOneTimeKeyDialogForCreatedToken = (
  account: Pick<DisplaySiteData, "siteType">,
  token: { key: string },
) =>
  shouldShowOneTimeKeyDialogForAccount(account) &&
  hasUsableApiTokenKey(token.key)

/** Requires a registered response-only secret projection before foreground handoff. */
export function createDisplayAccountTokenRuntimeSecret(params: {
  account: DisplaySiteData
  token: ApiToken
}) {
  const project = getSiteTypeCapabilities(params.account.siteType).account
    ?.keyManagement?.createRuntimeSecret
  if (!project) {
    throw new Error("Created token secret projection is unavailable")
  }
  return project(params)
}
