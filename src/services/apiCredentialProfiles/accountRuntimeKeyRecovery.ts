import type { AccountRuntimeKeyLocator } from "~/services/accounts/accountRuntimeKeys"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

import { API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES } from "./apiCredentialProfileLinkContracts"
import { apiCredentialProfileLinks } from "./apiCredentialProfileLinks"

export const ASSOCIATED_PROFILE_SECRET_RESOLUTION_STATUSES = {
  ...API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES,
  EmptySecret: "empty-secret",
} as const

type AssociatedProfileSecretResolution =
  | {
      status: typeof ASSOCIATED_PROFILE_SECRET_RESOLUTION_STATUSES.Resolved
      profile: ApiCredentialProfile
      secret: string
    }
  | {
      status: Exclude<
        (typeof ASSOCIATED_PROFILE_SECRET_RESOLUTION_STATUSES)[keyof typeof ASSOCIATED_PROFILE_SECRET_RESOLUTION_STATUSES],
        typeof ASSOCIATED_PROFILE_SECRET_RESOLUTION_STATUSES.Resolved
      >
    }

/** Resolves one exact runtime-key association into its locally stored secret. */
export async function resolveAssociatedProfileSecret(
  locator: AccountRuntimeKeyLocator,
): Promise<AssociatedProfileSecretResolution> {
  const resolution = await apiCredentialProfileLinks.resolve(locator)

  if (
    resolution.status !==
    API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.Resolved
  ) {
    return { status: resolution.status }
  }

  const secret = resolution.profile.apiKey.trim()
  if (!secret) {
    return {
      status: ASSOCIATED_PROFILE_SECRET_RESOLUTION_STATUSES.EmptySecret,
    }
  }

  return {
    status: ASSOCIATED_PROFILE_SECRET_RESOLUTION_STATUSES.Resolved,
    profile: resolution.profile,
    secret,
  }
}
