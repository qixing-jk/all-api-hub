import type { AccountRuntimeKeyLocator } from "~/services/accounts/accountRuntimeKeys"
import { normalizeAccountSiteUrlForManagedChannel } from "~/services/accounts/utils/siteUrlNormalization"
import { buildApiCredentialProfileName } from "~/services/apiCredentialProfiles/accountTokenProfileName"
import {
  apiCredentialProfileLinks,
  type ApiCredentialProfileCaptureInput,
} from "~/services/apiCredentialProfiles/apiCredentialProfileLinks"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import type { ApiToken, DisplaySiteData } from "~/types"
import { API_CREDENTIAL_PROFILE_LINK_SOURCES } from "~/types/apiCredentialProfiles"

export type ApiCredentialProfileLinkedBy =
  ApiCredentialProfileCaptureInput["linkedBy"]

interface CreateProfileFromAccountTokenParams {
  accountName: string
  fallbackAccountName?: string
  baseUrl: string
  siteType?: DisplaySiteData["siteType"] | string
  tagIds?: string[]
  token: Pick<ApiToken, "key" | "name">
  apiType?: ApiVerificationApiType
  locator?: AccountRuntimeKeyLocator
  linkedBy?: ApiCredentialProfileLinkedBy
}

/** Captures a profile and reports whether its runtime-key association is exact. */
export async function captureProfileFromAccountToken({
  accountName,
  fallbackAccountName,
  baseUrl,
  siteType,
  tagIds,
  token,
  apiType = API_TYPES.OPENAI_COMPATIBLE,
  locator,
  linkedBy = API_CREDENTIAL_PROFILE_LINK_SOURCES.ResolvedRuntimeKey,
}: CreateProfileFromAccountTokenParams) {
  return apiCredentialProfileLinks.capture({
    profile: {
      name: buildApiCredentialProfileName({
        accountName,
        fallbackAccountName,
        tokenName: token.name ?? "",
      }),
      apiType,
      baseUrl: normalizeAccountSiteUrlForManagedChannel({
        siteType,
        url: baseUrl,
      }),
      apiKey: token.key,
      tagIds: tagIds ?? [],
    },
    ...(locator ? { locator } : {}),
    linkedBy,
  })
}

/**
 * Creates an API credential profile from an account-scoped token.
 */
export async function createProfileFromAccountToken(
  params: CreateProfileFromAccountTokenParams,
) {
  const result = await captureProfileFromAccountToken(params)
  return result.profile
}
