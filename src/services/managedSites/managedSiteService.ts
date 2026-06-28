import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import type { ApiResponse } from "~/services/apiTransport/type"
import {
  getCurrentManagedSiteRuntimeConfig,
  getManagedSiteRuntimeConfigForType,
  type ManagedSiteRuntimeConfigValue,
  type ManagedSiteRuntimeConfigValueForType,
} from "~/services/managedSites/runtimeConfig"
import type { ManagedSiteMessagesKey } from "~/services/managedSites/utils/managedSite"
import {
  getManagedSiteAdminConfig,
  getManagedSiteAdminConfigForType,
  getManagedSiteMessagesKeyFromSiteType,
} from "~/services/managedSites/utils/managedSite"
import type {
  AccountToken,
  ApiToken,
  DisplaySiteData,
  SiteAccount,
} from "~/types"
import type {
  ChannelFormData,
  ChannelMode,
  CreateChannelPayload,
  ManagedSiteChannel,
  ManagedSiteChannelListData,
  UpdateChannelPayload,
} from "~/types/managedSite"

import {
  userPreferences,
  type UserPreferences,
} from "../preferences/userPreferences"
import * as axonHubService from "./providers/axonHub"
import * as claudeCodeHubService from "./providers/claudeCodeHub"
import * as doneHubService from "./providers/doneHubService"
import * as newApiService from "./providers/newApi"
import * as octopusService from "./providers/octopus"
import * as veloeraService from "./providers/veloera"

export type ManagedSiteConfig = ManagedSiteRuntimeConfigValue

export interface ManagedSiteService<
  TConfig extends ManagedSiteConfig = ManagedSiteConfig,
  TSiteType extends ManagedSiteType = ManagedSiteType,
> {
  siteType: TSiteType
  messagesKey: ManagedSiteMessagesKey

  searchChannel(
    config: TConfig,
    keyword: string,
  ): Promise<ManagedSiteChannelListData | null>

  createChannel(
    config: TConfig,
    channelData: CreateChannelPayload,
  ): Promise<ApiResponse<unknown>>

  updateChannel(
    config: TConfig,
    channelData: UpdateChannelPayload,
  ): Promise<ApiResponse<unknown>>

  deleteChannel(
    config: TConfig,
    channelId: number,
  ): Promise<ApiResponse<unknown>>

  checkValidConfig(): Promise<boolean>
  getConfig(): Promise<TConfig | null>

  fetchAvailableModels(
    account: DisplaySiteData,
    token: ApiToken,
  ): Promise<string[]>

  buildChannelName(account: DisplaySiteData, token: ApiToken): string

  prepareChannelFormData(
    account: DisplaySiteData,
    token: ApiToken | AccountToken,
  ): Promise<ChannelFormData>

  buildChannelPayload(
    formData: ChannelFormData,
    mode?: ChannelMode,
  ): CreateChannelPayload

  hydrateComparableChannelKeys?(
    config: TConfig,
    candidates: ManagedSiteChannel[],
  ): Promise<ManagedSiteChannel[]>

  fetchChannelSecretKey?(config: TConfig, channelId: number): Promise<string>

  /**
   * Legacy direct-import entrypoint kept on the managed-site service contract.
   * @deprecated Unused by the current runtime flow. Account auto-config now
   * routes through `useChannelDialog().openWithAccount()` so users can review
   * generated channel fields before creation. Kept temporarily for compatibility.
   */
  autoConfigToManagedSite(
    account: SiteAccount,
    toastId?: string,
  ): Promise<unknown>
}

export type TypedManagedSiteService<TSiteType extends ManagedSiteType> =
  ManagedSiteService<ManagedSiteRuntimeConfigValueForType<TSiteType>, TSiteType>

/**
 * Check if preferences contain a valid managed site admin configuration.
 */
export function hasValidManagedSiteConfig(
  prefs: UserPreferences | null,
  siteType?: ManagedSiteType,
): boolean {
  if (!prefs) {
    return false
  }

  return Boolean(
    siteType
      ? getManagedSiteAdminConfigForType(prefs, siteType)
      : getManagedSiteAdminConfig(prefs),
  )
}

/**
 * Resolve the managed site service implementation based on preferences.
 */
export async function getManagedSiteService(): Promise<ManagedSiteService> {
  const runtimeConfig = await getCurrentManagedSiteRuntimeConfig()
  if (runtimeConfig) {
    return getManagedSiteServiceForType(runtimeConfig.siteType)
  }

  try {
    const preferences = await userPreferences.getPreferences()
    return getManagedSiteServiceForType(
      preferences.managedSiteType || SITE_TYPES.NEW_API,
    )
  } catch {
    return getManagedSiteServiceForType(SITE_TYPES.NEW_API)
  }
}

/**
 * Resolve the managed site service implementation for an explicit site type.
 */
export function getManagedSiteServiceForType(
  siteType: typeof SITE_TYPES.OCTOPUS,
): TypedManagedSiteService<typeof SITE_TYPES.OCTOPUS>
export function getManagedSiteServiceForType(
  siteType: typeof SITE_TYPES.AXON_HUB,
): TypedManagedSiteService<typeof SITE_TYPES.AXON_HUB>
export function getManagedSiteServiceForType(
  siteType: typeof SITE_TYPES.CLAUDE_CODE_HUB,
): TypedManagedSiteService<typeof SITE_TYPES.CLAUDE_CODE_HUB>
export function getManagedSiteServiceForType(
  siteType: typeof SITE_TYPES.VELOERA,
): TypedManagedSiteService<typeof SITE_TYPES.VELOERA>
export function getManagedSiteServiceForType(
  siteType: typeof SITE_TYPES.DONE_HUB,
): TypedManagedSiteService<typeof SITE_TYPES.DONE_HUB>
export function getManagedSiteServiceForType(
  siteType: typeof SITE_TYPES.NEW_API,
): TypedManagedSiteService<typeof SITE_TYPES.NEW_API>
export function getManagedSiteServiceForType(
  siteType: ManagedSiteType,
): ManagedSiteService
export function getManagedSiteServiceForType(
  siteType: ManagedSiteType,
): ManagedSiteService {
  const messagesKey: ManagedSiteMessagesKey =
    getManagedSiteMessagesKeyFromSiteType(siteType)
  const getConfig = async (): Promise<ManagedSiteConfig | null> => {
    const runtimeConfig = await getManagedSiteRuntimeConfigForType(siteType)
    return runtimeConfig?.config ?? null
  }

  if (siteType === SITE_TYPES.OCTOPUS) {
    return {
      siteType,
      messagesKey,
      searchChannel: octopusService.searchChannel,
      createChannel: octopusService.createChannel,
      updateChannel: octopusService.updateChannel,
      deleteChannel: octopusService.deleteChannel,
      checkValidConfig: octopusService.checkValidOctopusConfig,
      getConfig,
      fetchAvailableModels: octopusService.fetchAvailableModels,
      buildChannelName: octopusService.buildChannelName,
      prepareChannelFormData: octopusService.prepareChannelFormData,
      buildChannelPayload: octopusService.buildChannelPayload,
      autoConfigToManagedSite: octopusService.autoConfigToOctopus,
    }
  }

  if (siteType === SITE_TYPES.AXON_HUB) {
    return {
      siteType,
      messagesKey,
      searchChannel: axonHubService.searchChannel,
      createChannel: axonHubService.createChannel,
      updateChannel: axonHubService.updateChannel,
      deleteChannel: axonHubService.deleteChannel,
      checkValidConfig: axonHubService.checkValidAxonHubConfig,
      getConfig,
      fetchAvailableModels: axonHubService.fetchAvailableModels,
      buildChannelName: axonHubService.buildChannelName,
      prepareChannelFormData: axonHubService.prepareChannelFormData,
      buildChannelPayload: axonHubService.buildChannelPayload,
      autoConfigToManagedSite: axonHubService.autoConfigToAxonHub,
    }
  }

  if (siteType === SITE_TYPES.CLAUDE_CODE_HUB) {
    return {
      siteType,
      messagesKey,
      searchChannel: claudeCodeHubService.searchChannel,
      createChannel: claudeCodeHubService.createChannel,
      updateChannel: claudeCodeHubService.updateChannel,
      deleteChannel: claudeCodeHubService.deleteChannel,
      checkValidConfig: claudeCodeHubService.checkValidClaudeCodeHubConfig,
      getConfig,
      fetchAvailableModels: claudeCodeHubService.fetchAvailableModels,
      buildChannelName: claudeCodeHubService.buildChannelName,
      prepareChannelFormData: claudeCodeHubService.prepareChannelFormData,
      buildChannelPayload: claudeCodeHubService.buildChannelPayload,
      hydrateComparableChannelKeys:
        claudeCodeHubService.hydrateComparableChannelKeys,
      fetchChannelSecretKey: claudeCodeHubService.fetchChannelSecretKey,
      autoConfigToManagedSite: claudeCodeHubService.autoConfigToClaudeCodeHub,
    }
  }

  if (siteType === SITE_TYPES.VELOERA) {
    return {
      siteType,
      messagesKey,
      searchChannel: veloeraService.searchChannel,
      createChannel: veloeraService.createChannel,
      updateChannel: veloeraService.updateChannel,
      deleteChannel: veloeraService.deleteChannel,
      checkValidConfig: veloeraService.checkValidVeloeraConfig,
      getConfig,
      fetchAvailableModels: veloeraService.fetchAvailableModels,
      buildChannelName: veloeraService.buildChannelName,
      prepareChannelFormData: veloeraService.prepareChannelFormData,
      buildChannelPayload: veloeraService.buildChannelPayload,
      hydrateComparableChannelKeys: veloeraService.hydrateComparableChannelKeys,
      fetchChannelSecretKey: veloeraService.fetchChannelSecretKey,
      autoConfigToManagedSite: veloeraService.autoConfigToVeloera,
    }
  }

  if (siteType === SITE_TYPES.DONE_HUB) {
    return {
      siteType,
      messagesKey,
      searchChannel: doneHubService.searchChannel,
      createChannel: doneHubService.createChannel,
      updateChannel: doneHubService.updateChannel,
      deleteChannel: doneHubService.deleteChannel,
      checkValidConfig: doneHubService.checkValidDoneHubConfig,
      getConfig,
      fetchAvailableModels: doneHubService.fetchAvailableModels,
      buildChannelName: doneHubService.buildChannelName,
      prepareChannelFormData: doneHubService.prepareChannelFormData,
      buildChannelPayload: doneHubService.buildChannelPayload,
      hydrateComparableChannelKeys: doneHubService.hydrateComparableChannelKeys,
      fetchChannelSecretKey: doneHubService.fetchChannelSecretKey,
      autoConfigToManagedSite: doneHubService.autoConfigToDoneHub,
    }
  }

  return {
    siteType: SITE_TYPES.NEW_API,
    messagesKey,
    searchChannel: newApiService.searchChannel,
    createChannel: newApiService.createChannel,
    updateChannel: newApiService.updateChannel,
    deleteChannel: newApiService.deleteChannel,
    checkValidConfig: newApiService.checkValidNewApiConfig,
    getConfig,
    fetchAvailableModels: newApiService.fetchAvailableModels,
    buildChannelName: newApiService.buildChannelName,
    prepareChannelFormData: newApiService.prepareChannelFormData,
    buildChannelPayload: newApiService.buildChannelPayload,
    hydrateComparableChannelKeys: newApiService.hydrateComparableChannelKeys,
    fetchChannelSecretKey: newApiService.fetchChannelSecretKey,
    autoConfigToManagedSite: newApiService.autoConfigToNewApi,
  }
}
