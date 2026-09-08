import type { TFunction } from "i18next"

import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/runtimeConfig"
import type {
  ManagedResourceMatchCandidate,
  ManagedResourceMatchList,
} from "~/types/managedResourceMatching"

import type { ManagedResourceRef } from "./managedResourceNative"
import type { ManagedSiteChannelSecretReadOptions } from "./managedSiteCapabilities"

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
  exactMatchBasis?: "url-key" | "key-models"
  search(
    config: TConfig,
    baseUrl: string,
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
