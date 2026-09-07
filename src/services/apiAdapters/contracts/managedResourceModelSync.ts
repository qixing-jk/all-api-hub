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
  prepareBatch(resourceRefs?: readonly ManagedResourceRef[]): Promise<{
    resources: readonly ManagedModelChannelSummary[]
    run(options: ManagedResourceModelSyncBatchOptions): Promise<ExecutionResult>
  }>
}
