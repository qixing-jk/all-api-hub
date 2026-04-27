import {
  AXON_HUB,
  DONE_HUB,
  NEW_API,
  OCTOPUS,
  VELOERA,
  type ManagedSiteType,
} from "~/constants/siteType"
import type { ApiResponse } from "~/services/apiService/common/type"
import type { ManagedSiteMessagesKey } from "~/services/managedSites/utils/managedSite"
import {
  getManagedSiteAdminConfig,
  getManagedSiteAdminConfigForType,
  getManagedSiteContext,
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
import * as doneHubService from "./providers/doneHubService"
import * as newApiService from "./providers/newApi"
import * as octopusService from "./providers/octopus"
import * as veloeraService from "./providers/veloera"

export interface ManagedSiteConfig {
  baseUrl: string
  token: string
  userId: string
}

export interface ManagedSiteService {
  siteType: ManagedSiteType
  messagesKey: ManagedSiteMessagesKey

  searchChannel(
    baseUrl: string,
    accessToken: string,
    userId: number | string,
    keyword: string,
  ): Promise<ManagedSiteChannelListData | null>

  createChannel(
    baseUrl: string,
    adminToken: string,
    userId: number | string,
    channelData: CreateChannelPayload,
  ): Promise<ApiResponse<unknown>>

  updateChannel(
    baseUrl: string,
    adminToken: string,
    userId: number | string,
    channelData: UpdateChannelPayload,
  ): Promise<ApiResponse<unknown>>

  deleteChannel(
    baseUrl: string,
    adminToken: string,
    userId: number | string,
    channelId: number,
  ): Promise<ApiResponse<unknown>>

  checkValidConfig(): Promise<boolean>
  getConfig(): Promise<ManagedSiteConfig | null>

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

  findMatchingChannel(
    baseUrl: string,
    adminToken: string,
    userId: number | string,
    accountBaseUrl: string,
    models: string[],
    key?: string,
  ): Promise<ManagedSiteChannel | null>

  fetchChannelSecretKey?(
    baseUrl: string,
    adminToken: string,
    userId: number | string,
    channelId: number,
  ): Promise<string>

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
  const prefs = await userPreferences.getPreferences()
  const { siteType } = getManagedSiteContext(prefs)

  return getManagedSiteServiceForType(siteType)
}

/**
 * Resolve the managed site service implementation for an explicit site type.
 */
export function getManagedSiteServiceForType(
  siteType: ManagedSiteType,
): ManagedSiteService {
  const messagesKey: ManagedSiteMessagesKey =
    getManagedSiteMessagesKeyFromSiteType(siteType)

  if (siteType === OCTOPUS) {
    return {
      siteType,
      messagesKey,
      searchChannel: octopusService.searchChannel,
      createChannel: octopusService.createChannel,
      updateChannel: octopusService.updateChannel,
      deleteChannel: octopusService.deleteChannel,
      checkValidConfig: octopusService.checkValidOctopusConfig,
      getConfig: octopusService.getOctopusConfig,
      fetchAvailableModels: octopusService.fetchAvailableModels,
      buildChannelName: octopusService.buildChannelName,
      prepareChannelFormData: octopusService.prepareChannelFormData,
      buildChannelPayload: octopusService.buildChannelPayload,
      findMatchingChannel: octopusService.findMatchingChannel,
      autoConfigToManagedSite: octopusService.autoConfigToOctopus,
    }
  }

  if (siteType === AXON_HUB) {
    return {
      siteType,
      messagesKey,
      searchChannel: axonHubService.searchChannel,
      createChannel: axonHubService.createChannel,
      updateChannel: axonHubService.updateChannel,
      deleteChannel: axonHubService.deleteChannel,
      checkValidConfig: axonHubService.checkValidAxonHubConfig,
      getConfig: axonHubService.getAxonHubConfig,
      fetchAvailableModels: axonHubService.fetchAvailableModels,
      buildChannelName: axonHubService.buildChannelName,
      prepareChannelFormData: axonHubService.prepareChannelFormData,
      buildChannelPayload: axonHubService.buildChannelPayload,
      findMatchingChannel: axonHubService.findMatchingChannel,
      autoConfigToManagedSite: axonHubService.autoConfigToAxonHub,
    }
  }

  if (siteType === VELOERA) {
    return {
      siteType,
      messagesKey,
      searchChannel: veloeraService.searchChannel,
      createChannel: veloeraService.createChannel,
      updateChannel: veloeraService.updateChannel,
      deleteChannel: veloeraService.deleteChannel,
      checkValidConfig: veloeraService.checkValidVeloeraConfig,
      getConfig: veloeraService.getVeloeraConfig,
      fetchAvailableModels: veloeraService.fetchAvailableModels,
      buildChannelName: veloeraService.buildChannelName,
      prepareChannelFormData: veloeraService.prepareChannelFormData,
      buildChannelPayload: veloeraService.buildChannelPayload,
      findMatchingChannel: veloeraService.findMatchingChannel,
      fetchChannelSecretKey: veloeraService.fetchChannelSecretKey,
      autoConfigToManagedSite: veloeraService.autoConfigToVeloera,
    }
  }

  if (siteType === DONE_HUB) {
    return {
      siteType,
      messagesKey,
      searchChannel: doneHubService.searchChannel,
      createChannel: doneHubService.createChannel,
      updateChannel: doneHubService.updateChannel,
      deleteChannel: doneHubService.deleteChannel,
      checkValidConfig: doneHubService.checkValidDoneHubConfig,
      getConfig: doneHubService.getDoneHubConfig,
      fetchAvailableModels: doneHubService.fetchAvailableModels,
      buildChannelName: doneHubService.buildChannelName,
      prepareChannelFormData: doneHubService.prepareChannelFormData,
      buildChannelPayload: doneHubService.buildChannelPayload,
      findMatchingChannel: doneHubService.findMatchingChannel,
      fetchChannelSecretKey: doneHubService.fetchChannelSecretKey,
      autoConfigToManagedSite: doneHubService.autoConfigToDoneHub,
    }
  }

  return {
    siteType: NEW_API,
    messagesKey,
    searchChannel: newApiService.searchChannel,
    createChannel: newApiService.createChannel,
    updateChannel: newApiService.updateChannel,
    deleteChannel: newApiService.deleteChannel,
    checkValidConfig: newApiService.checkValidNewApiConfig,
    getConfig: newApiService.getNewApiConfig,
    fetchAvailableModels: newApiService.fetchAvailableModels,
    buildChannelName: newApiService.buildChannelName,
    prepareChannelFormData: newApiService.prepareChannelFormData,
    buildChannelPayload: newApiService.buildChannelPayload,
    findMatchingChannel: newApiService.findMatchingChannel,
    fetchChannelSecretKey: newApiService.fetchChannelSecretKey,
    autoConfigToManagedSite: newApiService.autoConfigToNewApi,
  }
}
