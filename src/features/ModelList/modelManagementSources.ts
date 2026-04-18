import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

export const MODEL_MANAGEMENT_SOURCE_KINDS = {
  ALL_ACCOUNTS: "all-accounts",
  ACCOUNT: "account",
  PROFILE: "profile",
} as const

export const NO_MODEL_MANAGEMENT_SOURCE_VALUE = ""
export const ALL_ACCOUNTS_SOURCE_VALUE = "all"

const MODEL_MANAGEMENT_SOURCE_VALUE_PREFIXES = {
  ACCOUNT: "account:",
  PROFILE: "profile:",
} as const

export type ModelManagementSourceCapabilities = {
  supportsPricing: boolean
  supportsGroupFiltering: boolean
  supportsAccountSummary: boolean
  supportsTokenCompatibility: boolean
  supportsCredentialVerification: boolean
  supportsBatchCredentialVerification: boolean
  supportsCliVerification: boolean
}

export type ModelManagementSource =
  | {
      kind: typeof MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
      value: typeof ALL_ACCOUNTS_SOURCE_VALUE
      capabilities: ModelManagementSourceCapabilities
    }
  | {
      kind: typeof MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
      value: string
      account: DisplaySiteData
      capabilities: ModelManagementSourceCapabilities
    }
  | {
      kind: typeof MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
      value: string
      profile: ApiCredentialProfile
      capabilities: ModelManagementSourceCapabilities
    }

export type ModelManagementAccountSource = Extract<
  ModelManagementSource,
  { kind: typeof MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT }
>

export type ModelManagementProfileSource = Extract<
  ModelManagementSource,
  { kind: typeof MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE }
>

export type ModelManagementItemSource =
  | ModelManagementAccountSource
  | ModelManagementProfileSource

export const EMPTY_MODEL_MANAGEMENT_CAPABILITIES: ModelManagementSourceCapabilities =
  {
    supportsPricing: false,
    supportsGroupFiltering: false,
    supportsAccountSummary: false,
    supportsTokenCompatibility: false,
    supportsCredentialVerification: false,
    supportsBatchCredentialVerification: false,
    supportsCliVerification: false,
  }

const ACCOUNT_SOURCE_CAPABILITIES: ModelManagementSourceCapabilities = {
  supportsPricing: true,
  supportsGroupFiltering: true,
  supportsAccountSummary: false,
  supportsTokenCompatibility: true,
  supportsCredentialVerification: true,
  supportsBatchCredentialVerification: true,
  supportsCliVerification: true,
}

const ALL_ACCOUNTS_SOURCE_CAPABILITIES: ModelManagementSourceCapabilities = {
  supportsPricing: true,
  supportsGroupFiltering: true,
  supportsAccountSummary: true,
  supportsTokenCompatibility: false,
  supportsCredentialVerification: false,
  supportsBatchCredentialVerification: true,
  supportsCliVerification: false,
}

const PROFILE_SOURCE_CAPABILITIES: ModelManagementSourceCapabilities = {
  supportsPricing: false,
  supportsGroupFiltering: false,
  supportsAccountSummary: false,
  supportsTokenCompatibility: false,
  supportsCredentialVerification: true,
  supportsBatchCredentialVerification: true,
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
  return `${MODEL_MANAGEMENT_SOURCE_VALUE_PREFIXES.ACCOUNT}${accountId}`
}

/**
 * Create the serialized selector value for a profile-backed source.
 */
export function toProfileSourceValue(profileId: string) {
  return `${MODEL_MANAGEMENT_SOURCE_VALUE_PREFIXES.PROFILE}${profileId}`
}

/**
 * Check whether a serialized selector value refers to a profile-backed source.
 */
export function isProfileSourceValue(value: string) {
  return value.startsWith(MODEL_MANAGEMENT_SOURCE_VALUE_PREFIXES.PROFILE)
}

/**
 * Build the aggregate "all accounts" source.
 */
export function createAllAccountsSource(): ModelManagementSource {
  return {
    kind: MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS,
    value: ALL_ACCOUNTS_SOURCE_VALUE,
    capabilities: ALL_ACCOUNTS_SOURCE_CAPABILITIES,
  }
}

/**
 * Wrap a site account as a model-management source.
 */
export function createAccountSource(
  account: DisplaySiteData,
): ModelManagementAccountSource {
  return {
    kind: MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
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
): ModelManagementProfileSource {
  return {
    kind: MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE,
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

  if (value.startsWith(MODEL_MANAGEMENT_SOURCE_VALUE_PREFIXES.ACCOUNT)) {
    const accountId = value.slice(
      MODEL_MANAGEMENT_SOURCE_VALUE_PREFIXES.ACCOUNT.length,
    )
    const account = accounts.find((item) => item.id === accountId)
    return account ? createAccountSource(account) : null
  }

  if (value.startsWith(MODEL_MANAGEMENT_SOURCE_VALUE_PREFIXES.PROFILE)) {
    const profileId = value.slice(
      MODEL_MANAGEMENT_SOURCE_VALUE_PREFIXES.PROFILE.length,
    )
    const profile = profiles.find((item) => item.id === profileId)
    return profile ? createProfileSource(profile) : null
  }

  return null
}
