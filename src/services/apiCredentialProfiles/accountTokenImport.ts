import { normalizeAccountSiteUrlForManagedChannel } from "~/services/accounts/utils/siteUrlNormalization"
import { buildApiCredentialProfileName } from "~/services/apiCredentialProfiles/accountTokenProfileName"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import type { ApiToken, DisplaySiteData } from "~/types"

interface CreateProfileFromAccountTokenParams {
  accountName: string
  fallbackAccountName?: string
  baseUrl: string
  siteType?: DisplaySiteData["siteType"] | string
  tagIds?: string[]
  token: Pick<ApiToken, "key" | "name">
}

/**
 * Creates an API credential profile from an account-scoped token.
 */
export async function createProfileFromAccountToken({
  accountName,
  fallbackAccountName,
  baseUrl,
  siteType,
  tagIds,
  token,
}: CreateProfileFromAccountTokenParams) {
  return apiCredentialProfilesStorage.createProfile({
    name: buildApiCredentialProfileName({
      accountName,
      fallbackAccountName,
      tokenName: token.name ?? "",
    }),
    apiType: API_TYPES.OPENAI_COMPATIBLE,
    baseUrl: normalizeAccountSiteUrlForManagedChannel({
      siteType,
      url: baseUrl,
    }),
    apiKey: token.key,
    tagIds: tagIds ?? [],
  })
}
