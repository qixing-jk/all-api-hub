import type { TFunction } from "i18next"

import type { ManagedSiteType } from "~/constants/siteType"
import type { InventoryReadOptions } from "~/services/apiTransport/inventoryReads"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/configuration/runtimeConfig"
import type {
  ManagedResourceMatchCandidate,
  ManagedResourceMatchList,
} from "~/types/managedResourceMatching"

import type { ManagedResourceRef } from "./managedResourceNative"
import type { ManagedSiteChannelSecretReadOptions } from "./managedSiteCapabilities"

export const MANAGED_RESOURCE_EXACT_MATCH_BASES = {
  URL_KEY: "url-key",
  KEY_MODELS: "key-models",
} as const

export const MANAGED_RESOURCE_SEARCH_INVENTORY_MODES = {
  FULL: "full",
} as const

export const MANAGED_RESOURCE_SECRET_VERIFICATION_KINDS = {
  NEW_API_SESSION: "new-api-session",
} as const

/** Runtime readiness for the registered interactive secret verification workflow. */
export interface ManagedResourceSecretVerificationRecovery {
  siteType: ManagedSiteType
  managedBaseUrl: string
  searchBaseUrl?: string
  loginCredentialsConfigured: boolean
  authenticatedBrowserSessionExists: boolean
  automaticCodeConfigured: boolean
}

export interface ManagedResourceSecretVerificationCapability<TConfig> {
  /** Selects the implemented feature-layer session workflow. */
  kind: typeof MANAGED_RESOURCE_SECRET_VERIFICATION_KINDS.NEW_API_SESSION
  getRecovery(
    config: TConfig,
    searchBaseUrl?: string,
  ): Promise<ManagedResourceSecretVerificationRecovery | undefined>
  getUnavailableHint(t: TFunction): string
}

export interface ManagedResourceMatchingCapability<
  TConfig = ManagedSiteRuntimeConfigValue,
> {
  secretVerification?: ManagedResourceSecretVerificationCapability<TConfig>
  /** Signals that identify one exact duplicate; absent uses key plus exact models. */
  exactMatchBasis?: (typeof MANAGED_RESOURCE_EXACT_MATCH_BASES)[keyof typeof MANAGED_RESOURCE_EXACT_MATCH_BASES]
  /** Complete, unfiltered canonical inventories can be indexed once per read-only batch. */
  searchInventoryMode?: typeof MANAGED_RESOURCE_SEARCH_INVENTORY_MODES.FULL
  search(
    config: TConfig,
    baseUrl: string,
    options?: InventoryReadOptions,
  ): Promise<ManagedResourceMatchList | null>
  fetchSecretKey?(
    config: TConfig,
    ref: ManagedResourceRef,
    options?: ManagedSiteChannelSecretReadOptions,
  ): Promise<string>
  hydrateComparableKeys?(
    config: TConfig,
    candidates: ManagedResourceMatchCandidate[],
    options?: ManagedSiteChannelSecretReadOptions,
  ): Promise<ManagedResourceMatchCandidate[]>
}
