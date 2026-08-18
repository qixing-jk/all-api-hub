import type {
  ManagedSiteMutationResult,
  ManagedSiteVoidMutationResult,
} from "~/services/managedSites/mutations"
import type { ManagedSiteOperationContext } from "~/services/managedSites/operationContext"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/runtimeConfig"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { AccountToken, ApiToken, DisplaySiteData } from "~/types"
import type {
  ChannelFormData,
  ChannelMode,
  CreateChannelPayload,
  ManagedSiteChannel,
  ManagedSiteChannelListData,
  UpdateChannelPayload,
} from "~/types/managedSite"

export type ManagedSiteChannelRequestOptions = {
  signal?: AbortSignal
  protectionBypassExecution?: ProtectionBypassExecution
  bypassSiteRequestLimit?: boolean
  /** Fail instead of returning a pagination-capped partial inventory. */
  requireCompleteInventory?: boolean
}

export type ManagedSitePaginatedChannelRequestOptions =
  ManagedSiteChannelRequestOptions & {
    pageSize?: number
    beforeRequest?: () => Promise<void>
    endpoint?: string
    pageStart?: number
  }

export type ManagedSiteChannelSecretReadOptions = {
  protectionBypassExecution: ProtectionBypassExecution
}

export type ManagedSiteChannelsCapability<
  TConfig = ManagedSiteRuntimeConfigValue,
> = {
  search(
    config: TConfig,
    keyword: string,
  ): Promise<ManagedSiteChannelListData | null>
  list?(
    config: TConfig,
    options?: ManagedSiteChannelRequestOptions & {
      beforeRequest?: () => Promise<void>
    },
  ): Promise<ManagedSiteChannelListData>
  create(
    config: TConfig,
    channelData: CreateChannelPayload,
  ): Promise<ManagedSiteMutationResult<unknown>>
  update(
    config: TConfig,
    channelData: UpdateChannelPayload,
  ): Promise<ManagedSiteMutationResult<unknown>>
  delete(
    config: TConfig,
    channelId: number,
  ): Promise<ManagedSiteVoidMutationResult>
  fetchSecretKey?(
    config: TConfig,
    channelId: number,
    options?: ManagedSiteChannelSecretReadOptions,
  ): Promise<string>
  hydrateComparableKeys?(
    config: TConfig,
    candidates: ManagedSiteChannel[],
    options?: ManagedSiteChannelSecretReadOptions,
  ): Promise<ManagedSiteChannel[]>
  fetchModels?(
    config: TConfig,
    channelId: number,
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

export type ManagedSiteConfigCapability<
  TConfig = ManagedSiteRuntimeConfigValue,
> = {
  checkValid(): Promise<boolean>
  get(): Promise<TConfig | null>
}

export type ManagedSiteQueriesCapability<
  TConfig = ManagedSiteRuntimeConfigValue,
> = {
  fetchSiteUserGroups(config: TConfig): Promise<string[]>
  fetchAccountAvailableModels(config: TConfig): Promise<string[]>
}

export type ManagedSiteChannelDraftRequestOptions = {
  operationContext?: ManagedSiteOperationContext
}

export type ManagedSiteChannelDraftsCapability = {
  fetchAvailableModels(
    account: DisplaySiteData,
    token: ApiToken,
  ): Promise<string[]>
  buildName(account: DisplaySiteData, token: ApiToken): string
  prepareFormData(
    account: DisplaySiteData,
    token: ApiToken | AccountToken,
    options?: ManagedSiteChannelDraftRequestOptions,
  ): Promise<ChannelFormData>
  buildPayload(
    formData: ChannelFormData,
    mode?: ChannelMode,
  ): CreateChannelPayload
}
