import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/runtimeConfig"
import type {
  ManagedResourceMatchCandidate,
  ManagedResourceMatchList,
} from "~/types/managedResourceMatching"

import type { ManagedResourceRef } from "./managedResourceNative"
import type { ManagedSiteChannelSecretReadOptions } from "./managedSiteCapabilities"

export interface ManagedResourceMatchingCapability<
  TConfig = ManagedSiteRuntimeConfigValue,
> {
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
