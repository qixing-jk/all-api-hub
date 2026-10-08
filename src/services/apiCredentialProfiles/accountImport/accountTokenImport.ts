import { resolveAccountSiteAddresses } from "~/services/accounts/accountSiteProfile/addresses"
import type { AccountRuntimeKeyLocator } from "~/services/accounts/keys/accountRuntimeKeys"
import { buildApiCredentialProfileName } from "~/services/apiCredentialProfiles/accountImport/accountTokenProfileName"
import {
  apiCredentialProfileLinks,
  type ApiCredentialProfileCaptureInput,
} from "~/services/apiCredentialProfiles/links"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import type { DisplaySiteData } from "~/types"
import { API_CREDENTIAL_PROFILE_LINK_SOURCES } from "~/types/apiCredentialProfiles"

export type ApiCredentialProfileLinkedBy =
  ApiCredentialProfileCaptureInput["linkedBy"]

interface CaptureProfileFromAccountTokenParams {
  accountName: string
  fallbackAccountName?: string
  baseUrl: string
  siteType?: DisplaySiteData["siteType"] | string
  tagIds?: string[]
  token: { key: string; name: string }
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
}: CaptureProfileFromAccountTokenParams) {
  return apiCredentialProfileLinks.capture({
    profile: {
      name: buildApiCredentialProfileName({
        accountName,
        fallbackAccountName,
        tokenName: token.name ?? "",
      }),
      apiType,
      baseUrl: resolveAccountSiteAddresses({
        siteType,
        siteUrl: baseUrl,
      }).inferenceApi.openAiCompatible.root,
      apiKey: token.key,
      tagIds: tagIds ?? [],
    },
    ...(locator ? { locator } : {}),
    linkedBy,
  })
}
