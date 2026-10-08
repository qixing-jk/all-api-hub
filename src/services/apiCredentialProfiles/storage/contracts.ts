import { type AccountRuntimeKeyLocator } from "~/services/accounts/keys/accountRuntimeKeys"
import {
  type API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES,
  type ApiCredentialProfileCaptureStatus,
} from "~/services/apiCredentialProfiles/links/contracts"
import { type ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import type {
  API_CREDENTIAL_PROFILE_LINK_SOURCES,
  ApiCredentialProfile,
  ApiCredentialProfileLink,
  ApiCredentialProfileLinkSource,
  ApiCredentialTelemetryConfig,
} from "~/types/apiCredentialProfiles"

export type ApiCredentialProfileCreateInput = {
  name: string
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
  requestHeaders?: Record<string, string>
  tagIds?: string[]
  notes?: string
  sourceUrl?: string
  expiresAt?: number | null
  telemetryConfig?: Partial<ApiCredentialTelemetryConfig>
}

export type ApiCredentialProfileUpdateInput =
  Partial<ApiCredentialProfileCreateInput>

export type ApiCredentialProfileCaptureInput = {
  profile: ApiCredentialProfileCreateInput
  locator?: AccountRuntimeKeyLocator
  linkedBy: Extract<
    ApiCredentialProfileLinkSource,
    | typeof API_CREDENTIAL_PROFILE_LINK_SOURCES.CreationResponse
    | typeof API_CREDENTIAL_PROFILE_LINK_SOURCES.ResolvedRuntimeKey
  >
}

export type ApiCredentialProfileCaptureResult = {
  status: ApiCredentialProfileCaptureStatus
  profile: ApiCredentialProfile
}

export type ApiCredentialProfileLinkResolution =
  | {
      status: typeof API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.Resolved
      link: ApiCredentialProfileLink
      profile: ApiCredentialProfile
    }
  | {
      status:
        | typeof API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.NotFound
        | typeof API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.Stale
    }
  | {
      status:
        | typeof API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.NeedsConfirmation
        | typeof API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.Ambiguous
      links: ApiCredentialProfileLink[]
    }

export type ApiCredentialProfileLinkInput = {
  profileId: string
  locator: AccountRuntimeKeyLocator
  linkedBy: ApiCredentialProfileLinkSource
}

export type ApiCredentialProfileRelinkInput = ApiCredentialProfileLinkInput & {
  id: string
}
