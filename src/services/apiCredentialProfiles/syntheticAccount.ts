export const API_CREDENTIAL_PROFILE_SYNTHETIC_ACCOUNT_ID_PREFIX =
  "api-credential-profile"

/**
 * Builds the synthetic account id used when a credential profile is adapted to account-based flows.
 */
export function buildApiCredentialProfileSyntheticAccountId(profileId: string) {
  return `${API_CREDENTIAL_PROFILE_SYNTHETIC_ACCOUNT_ID_PREFIX}:${profileId}`
}
