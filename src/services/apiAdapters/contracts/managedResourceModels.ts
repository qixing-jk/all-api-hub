import type { ManagedSiteVoidMutationResult } from "~/services/managedSites/mutations"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/runtimeConfig"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { ManagedModelChannelListData } from "~/types/managedResourceModels"

import type { ManagedResourceModelSyncWorkflow } from "./managedResourceModelSync"
import type { ManagedResourceRef } from "./managedResourceNative"
import type {
  ManagedSiteChannelModelProbe,
  ManagedSiteChannelRequestOptions,
} from "./managedSiteCapabilities"

/** Provider semantics for determining whether a redirect target still exists. */
export interface ManagedModelMappingPolicy {
  supportsChaining?: boolean
  normalizeTargetForAvailability?(target: string): string
}

/** Provider-owned model operations; writes affect only model fields and preserve native settings. */
export interface ManagedResourceModelsCapability<
  TConfig = ManagedSiteRuntimeConfigValue,
> {
  /** Native sync execution for providers whose payload cannot use the shared channel runner. */
  createSync?(
    config: TConfig,
    protectionBypassExecution: ProtectionBypassExecution,
  ): ManagedResourceModelSyncWorkflow
  modelMappingPolicy?: ManagedModelMappingPolicy
  list?(
    config: TConfig,
    options?: ManagedSiteChannelRequestOptions & {
      beforeRequest?: () => Promise<void>
    },
  ): Promise<ManagedModelChannelListData>
  fetchModels?(
    config: TConfig,
    ref: ManagedResourceRef,
    options?: ManagedSiteChannelRequestOptions,
  ): Promise<string[]>
  fetchDraftModels?(
    config: TConfig,
    probe: ManagedSiteChannelModelProbe,
    options?: ManagedSiteChannelRequestOptions,
  ): Promise<string[]>
  updateModels?(
    config: TConfig,
    ref: ManagedResourceRef,
    models: string[],
    options?: ManagedSiteChannelRequestOptions,
  ): Promise<ManagedSiteVoidMutationResult>
  updateModelMapping?(
    config: TConfig,
    ref: ManagedResourceRef,
    models: string[],
    modelMapping: Record<string, string>,
    options?: ManagedSiteChannelRequestOptions,
  ): Promise<ManagedSiteVoidMutationResult>
}
