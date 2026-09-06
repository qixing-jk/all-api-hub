import type { ManagedSiteVoidMutationResult } from "~/services/managedSites/mutations"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/runtimeConfig"
import type { ManagedModelChannelListData } from "~/types/managedResourceModels"

import type {
  ManagedSiteChannelModelProbe,
  ManagedSiteChannelRequestOptions,
} from "./managedSiteCapabilities"

/** Provider-owned model operations; writes affect only model fields and preserve native settings. */
export interface ManagedResourceModelsCapability<
  TConfig = ManagedSiteRuntimeConfigValue,
> {
  list(
    config: TConfig,
    options?: ManagedSiteChannelRequestOptions & {
      beforeRequest?: () => Promise<void>
    },
  ): Promise<ManagedModelChannelListData>
  fetchModels?(
    config: TConfig,
    channelId: number,
    options?: ManagedSiteChannelRequestOptions,
  ): Promise<string[]>
  fetchDraftModels?(
    config: TConfig,
    probe: ManagedSiteChannelModelProbe,
    options?: ManagedSiteChannelRequestOptions,
  ): Promise<string[]>
  updateModels?(
    config: TConfig,
    channelId: number,
    models: string[],
    options?: ManagedSiteChannelRequestOptions,
  ): Promise<ManagedSiteVoidMutationResult>
  updateModelMapping?(
    config: TConfig,
    channelId: number,
    models: string[],
    modelMapping: Record<string, string>,
    options?: ManagedSiteChannelRequestOptions,
  ): Promise<ManagedSiteVoidMutationResult>
}
