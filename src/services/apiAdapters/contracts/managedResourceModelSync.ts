import type { ChannelResourceConfigMap } from "~/types/channelConfig"
import type {
  ManagedModelChannelSummary,
  ManagedModelChannelSummaryListData,
} from "~/types/managedResourceModels"
import type {
  BatchExecutionOptions,
  ExecutionResult,
} from "~/types/managedSiteModelSync"

import type { ManagedResourceRef } from "./managedResourceNative"

export type ManagedResourceModelSyncBatchOptions = BatchExecutionOptions & {
  channelConfigs?: ChannelResourceConfigMap
}

/** The provider retains its native inventory; shared scheduling sees selection facts only. */
export interface ManagedResourceModelSyncWorkflow {
  listChannels(): Promise<ManagedModelChannelSummaryListData>
  /** Explicit selection overrides exclusions; apply exclusions before any upstream model query. */
  prepareBatch(
    resourceRefs?: readonly ManagedResourceRef[],
    excludedResourceRefs?: readonly ManagedResourceRef[],
  ): Promise<{
    resources: readonly ManagedModelChannelSummary[]
    /** Existing inventory entries excluded before any model requests. */
    skippedResources?: readonly ManagedModelChannelSummary[]
    run(options: ManagedResourceModelSyncBatchOptions): Promise<ExecutionResult>
  }>
}
