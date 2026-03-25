import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

export const ALL_ACCOUNTS_SOURCE_VALUE = "all"
const ACCOUNT_SOURCE_PREFIX = "account:"
const PROFILE_SOURCE_PREFIX = "profile:"

export type ModelManagementSourceCapabilities = {
  supportsPricing: boolean
  supportsGroupFiltering: boolean
  supportsAccountSummary: boolean
  supportsTokenCompatibility: boolean
  supportsCredentialVerification: boolean
  supportsCliVerification: boolean
}

export type ModelManagementSource =
  | {
      kind: "all-accounts"
      value: typeof ALL_ACCOUNTS_SOURCE_VALUE
      capabilities: ModelManagementSourceCapabilities
    }
  | {
      kind: "account"
      value: string
      account: DisplaySiteData
      capabilities: ModelManagementSourceCapabilities
    }
  | {
      kind: "profile"
      value: string
      profile: ApiCredentialProfile
      capabilities: ModelManagementSourceCapabilities
    }

export type ModelManagementItemSource = Extract<
  ModelManagementSource,
  { kind: "account" | "profile" }
>

export const EMPTY_MODEL_MANAGEMENT_CAPABILITIES: ModelManagementSourceCapabilities =
  {
    supportsPricing: false,
    supportsGroupFiltering: false,
    supportsAccountSummary: false,
    supportsTokenCompatibility: false,
    supportsCredentialVerification: false,
    supportsCliVerification: false,
  }

const ACCOUNT_SOURCE_CAPABILITIES: ModelManagementSourceCapabilities = {
  supportsPricing: true,
  supportsGroupFiltering: true,
  supportsAccountSummary: false,
  supportsTokenCompatibility: true,
  supportsCredentialVerification: true,
  supportsCliVerification: true,
}

const ALL_ACCOUNTS_SOURCE_CAPABILITIES: ModelManagementSourceCapabilities = {
  supportsPricing: true,
  supportsGroupFiltering: true,
  supportsAccountSummary: true,
  supportsTokenCompatibility: false,
  supportsCredentialVerification: false,
  supportsCliVerification: false,
}

const PROFILE_SOURCE_CAPABILITIES: ModelManagementSourceCapabilities = {
  supportsPricing: false,
  supportsGroupFiltering: false,
  supportsAccountSummary: false,
  supportsTokenCompatibility: false,
  supportsCredentialVerification: true,
  supportsCliVerification: true,
}

/**
 * Downgrades a source to catalog-only capabilities while preserving actions
 * that still make sense for the owning source, such as verification or token tools.
 */
export function toCatalogOnlyCapabilities(
  capabilities: ModelManagementSourceCapabilities,
): ModelManagementSourceCapabilities {
  return {
    ...capabilities,
    supportsPricing: false,
    supportsGroupFiltering: false,
    supportsAccountSummary: false,
  }
}

/**
 * Create the serialized selector value for an account-backed source.
 */
export function toAccountSourceValue(accountId: string) {
  return `${ACCOUNT_SOURCE_PREFIX}${accountId}`
}

/**
 * Create the serialized selector value for a profile-backed source.
 */
export function toProfileSourceValue(profileId: string) {
  return `${PROFILE_SOURCE_PREFIX}${profileId}`
}

/**
 * Check whether a serialized selector value refers to a profile-backed source.
 */
export function isProfileSourceValue(value: string) {
  return value.startsWith(PROFILE_SOURCE_PREFIX)
}

/**
 * Build the aggregate "all accounts" source.
 */
export function createAllAccountsSource(): ModelManagementSource {
  return {
    kind: "all-accounts",
    value: ALL_ACCOUNTS_SOURCE_VALUE,
    capabilities: ALL_ACCOUNTS_SOURCE_CAPABILITIES,
  }
}

/**
 * Wrap a site account as a model-management source.
 */
export function createAccountSource(
  account: DisplaySiteData,
): ModelManagementItemSource {
  return {
    kind: "account",
    value: toAccountSourceValue(account.id),
    account,
    capabilities: ACCOUNT_SOURCE_CAPABILITIES,
  }
}

/**
 * Wrap a stored API credential profile as a model-management source.
 */
export function createProfileSource(
  profile: ApiCredentialProfile,
): ModelManagementItemSource {
  return {
    kind: "profile",
    value: toProfileSourceValue(profile.id),
    profile,
    capabilities: PROFILE_SOURCE_CAPABILITIES,
  }
}

/**
 * Resolve a serialized selector value against live account/profile storage.
 */
export function resolveModelManagementSource(params: {
  value: string
  accounts: DisplaySiteData[]
  profiles: ApiCredentialProfile[]
}): ModelManagementSource | null {
  const { value, accounts, profiles } = params

  if (!value) return null
  if (value === ALL_ACCOUNTS_SOURCE_VALUE) {
    return createAllAccountsSource()
  }

  if (value.startsWith(ACCOUNT_SOURCE_PREFIX)) {
    const accountId = value.slice(ACCOUNT_SOURCE_PREFIX.length)
    const account = accounts.find((item) => item.id === accountId)
    return account ? createAccountSource(account) : null
  }

  if (value.startsWith(PROFILE_SOURCE_PREFIX)) {
    const profileId = value.slice(PROFILE_SOURCE_PREFIX.length)
    const profile = profiles.find((item) => item.id === profileId)
    return profile ? createProfileSource(profile) : null
  }

  return null
}
