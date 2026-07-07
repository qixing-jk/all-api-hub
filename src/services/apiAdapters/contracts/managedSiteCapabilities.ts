import type { ApiResponse } from "~/services/apiTransport/type"
import type { ManagedSiteOperationContext } from "~/services/managedSites/operationContext"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/runtimeConfig"
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
  bypassSiteRequestLimit?: boolean
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
  ): Promise<ApiResponse<unknown>>
  update(
    config: TConfig,
    channelData: UpdateChannelPayload,
  ): Promise<ApiResponse<unknown>>
  delete(config: TConfig, channelId: number): Promise<ApiResponse<unknown>>
  fetchSecretKey?(config: TConfig, channelId: number): Promise<string>
  hydrateComparableKeys?(
    config: TConfig,
    candidates: ManagedSiteChannel[],
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
  ): Promise<void>
  updateModelMapping?(
    config: TConfig,
    channelId: number,
    models: string[],
    modelMapping: Record<string, string>,
    options?: ManagedSiteChannelRequestOptions,
  ): Promise<void>
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
