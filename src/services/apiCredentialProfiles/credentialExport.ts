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

/** Project a stored credential for synchronous desktop-client deeplinks. */
export function createProfileCredentialExportData(
  profile: ApiCredentialProfile,
): CredentialExportData {
  return {
    providerId: buildApiCredentialProfileSyntheticAccountId(profile.id),
    providerName: profile.name,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
  }
}

/** Export a standalone credential directly, without fabricating account/token DTOs. */
export function createProfileCredentialExportSource(
  profile: ApiCredentialProfile,
): CredentialExportSource {
  return {
    id: getLegacyProfileExportId(profile.id),
    providerId: buildApiCredentialProfileSyntheticAccountId(profile.id),
    providerName: profile.name,
    credentialName: profile.name,
    baseUrl: profile.baseUrl,
    notes: profile.notes,
    cacheKey: hashProviderCatalogValue(
      JSON.stringify([profile.id, profile.baseUrl, profile.apiKey]),
    ),
    resolveApiKey: async () => profile.apiKey,
  }
}
