import {
  ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS,
  getAccountSiteModelListProfile,
  type AccountSiteModelListGroupSemantics,
} from "~/services/accounts/accountSiteProfile"
import type { ModelListSourceInfo } from "~/services/modelList/pricingModel"
import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

export const MODEL_MANAGEMENT_SOURCE_KINDS = {
  ALL_ACCOUNTS: "all-accounts",
  ACCOUNT: "account",
  PROFILE: "profile",
} as const

export const MODEL_LIST_GROUP_SEMANTICS =
  ACCOUNT_SITE_MODEL_LIST_GROUP_SEMANTICS

export type ModelListGroupSemantics = AccountSiteModelListGroupSemantics

export const NO_MODEL_MANAGEMENT_SOURCE_VALUE = ""
export const ALL_ACCOUNTS_SOURCE_VALUE = "all"

const MODEL_MANAGEMENT_SOURCE_VALUE_PREFIXES = {
  ACCOUNT: "account:",
  PROFILE: "profile:",
} as const

export type ModelManagementSourceCapabilities = {
  supportsRuntimeModelList?: boolean
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
      groupSemantics: ModelListGroupSemantics
    }
  | {
      kind: typeof MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
      value: string
      account: DisplaySiteData
      capabilities: ModelManagementSourceCapabilities
      groupSemantics: ModelListGroupSemantics
    }
  | {
      kind: typeof MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
      value: string
      profile: ApiCredentialProfile
      capabilities: ModelManagementSourceCapabilities
      groupSemantics: ModelListGroupSemantics
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
 * Applies response-level model-list source capability overrides for display.
 */
export function deriveModelListSourceCapabilities(params: {
  capabilities: ModelManagementSourceCapabilities
  modelListSource?: Pick<
    ModelListSourceInfo,
    "supportsRuntimeModelList" | "supportsPricing" | "actionPolicy"
  >
}): ModelManagementSourceCapabilities {
  const { capabilities, modelListSource } = params

  if (!modelListSource) return capabilities

  const pricingCapabilities =
    modelListSource.supportsPricing === false
      ? toCatalogOnlyCapabilities(capabilities)
      : capabilities
  const actionPolicy = modelListSource.actionPolicy

  const applyDowngrade = (current: boolean, override: boolean | undefined) =>
    typeof override === "boolean" ? current && override : current

  return {
    ...pricingCapabilities,
    supportsGroupFiltering: applyDowngrade(
      pricingCapabilities.supportsGroupFiltering,
      actionPolicy?.supportsGroupFiltering,
    ),
    supportsAccountSummary: applyDowngrade(
      pricingCapabilities.supportsAccountSummary,
      actionPolicy?.supportsAccountSummary,
    ),
    supportsTokenCompatibility: applyDowngrade(
      pricingCapabilities.supportsTokenCompatibility,
      actionPolicy?.supportsTokenCompatibility,
    ),
    supportsCredentialVerification: applyDowngrade(
      pricingCapabilities.supportsCredentialVerification,
      actionPolicy?.supportsCredentialVerification,
    ),
    supportsBatchCredentialVerification: applyDowngrade(
      pricingCapabilities.supportsBatchCredentialVerification,
      actionPolicy?.supportsBatchCredentialVerification,
    ),
    supportsCliVerification: applyDowngrade(
      pricingCapabilities.supportsCliVerification,
      actionPolicy?.supportsCliVerification,
    ),
    ...(typeof modelListSource.supportsRuntimeModelList === "boolean"
      ? { supportsRuntimeModelList: modelListSource.supportsRuntimeModelList }
      : {}),
  }
}

/**
 * Projects loaded response policies onto the aggregate all-accounts source.
 * A control remains available when at least one loaded source can support it;
 * an empty response keeps the aggregate defaults while data is still loading.
 */
export function deriveAllAccountsModelListCapabilities(params: {
  capabilities: ModelManagementSourceCapabilities
  modelListSources: readonly Pick<
    ModelListSourceInfo,
    "supportsRuntimeModelList" | "supportsPricing" | "actionPolicy"
  >[]
}): ModelManagementSourceCapabilities {
  const { capabilities, modelListSources } = params
  if (modelListSources.length === 0) return capabilities

  const projectedCapabilities = modelListSources.map((modelListSource) =>
    deriveModelListSourceCapabilities({
      capabilities,
      modelListSource,
    }),
  )
  const supportsAny = (capability: keyof ModelManagementSourceCapabilities) =>
    projectedCapabilities.some((source) => source[capability] === true)

  return {
    ...capabilities,
    supportsPricing: supportsAny("supportsPricing"),
    supportsGroupFiltering: supportsAny("supportsGroupFiltering"),
    supportsAccountSummary: supportsAny("supportsAccountSummary"),
    supportsTokenCompatibility: supportsAny("supportsTokenCompatibility"),
    supportsCredentialVerification: supportsAny(
      "supportsCredentialVerification",
    ),
    supportsBatchCredentialVerification: supportsAny(
      "supportsBatchCredentialVerification",
    ),
    supportsCliVerification: supportsAny("supportsCliVerification"),
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
    groupSemantics: MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY,
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
    groupSemantics: getAccountSiteModelListProfile(account.siteType)
      .groupSemantics,
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
    groupSemantics: MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE,
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
