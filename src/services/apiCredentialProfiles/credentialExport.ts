import { findDeclaredInferenceRoots } from "~/services/accounts/accountSiteProfile/addresses"
import { toProtocolRoot } from "~/services/aiApi/protocolAddress"
import type {
  CredentialExportData,
  CredentialExportSource,
} from "~/services/integrations/credentialExport"
import { hashProviderCatalogValue } from "~/services/integrations/providerCatalogExport"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

import { buildApiCredentialProfileSyntheticAccountId } from "./syntheticAccount"

/** Preserve previously exported Cursor++ provider IDs without a token inventory. */
function getLegacyProfileExportId(profileId: string) {
  let hash = 0
  for (let i = 0; i < profileId.length; i += 1) {
    hash = (hash * 31 + profileId.charCodeAt(i)) | 0
  }
  return `account_token:${buildApiCredentialProfileSyntheticAccountId(profileId)}:${Math.abs(hash) || 1}`
}

/**
 * Protocol root a profile export hands to an external caller.
 *
 * Stored profiles already hold a root; transient ones built from a provider's
 * own service URL may not, and the consumer appends the version segment it
 * owns, so the export namespace normalizes rather than trusting the caller.
 */
function resolveProfileExportBaseUrl(profile: ApiCredentialProfile): string {
  return toProtocolRoot(profile.apiType, profile.baseUrl) ?? profile.baseUrl
}

/** Project a stored credential for synchronous desktop-client deeplinks. */
export function createProfileCredentialExportData(
  profile: ApiCredentialProfile,
): CredentialExportData {
  return {
    providerId: buildApiCredentialProfileSyntheticAccountId(profile.id),
    providerName: profile.name,
    baseUrl: resolveProfileExportBaseUrl(profile),
    apiKey: profile.apiKey,
  }
}

/** Export a standalone credential directly, without fabricating account/token DTOs. */
export function createProfileCredentialExportSource(
  profile: ApiCredentialProfile,
): CredentialExportSource {
  const baseUrl = resolveProfileExportBaseUrl(profile)
  const declaredRoots = findDeclaredInferenceRoots(baseUrl)
  const anthropicBaseUrl =
    profile.apiType === "openai-compatible"
      ? declaredRoots?.anthropic
      : undefined
  return {
    id: getLegacyProfileExportId(profile.id),
    providerId: buildApiCredentialProfileSyntheticAccountId(profile.id),
    providerName: profile.name,
    credentialName: profile.name,
    baseUrl,
    ...(anthropicBaseUrl ? { anthropicBaseUrl } : {}),
    notes: profile.notes,
    requestHeaders: profile.requestHeaders,
    cacheKey: hashProviderCatalogValue(
      JSON.stringify([
        profile.id,
        profile.baseUrl,
        profile.apiKey,
        profile.requestHeaders,
      ]),
    ),
    resolveApiKey: async () => profile.apiKey,
  }
}
