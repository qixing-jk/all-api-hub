import {
  DONE_HUB,
  NEW_API,
  OCTOPUS,
  VELOERA,
  type ManagedSiteType,
} from "~/constants/siteType"
import type { AccountToken } from "~/entrypoints/options/pages/KeyManagement/type"
import type { ApiResponse } from "~/services/apiService/common/type"
import type { ApiToken, DisplaySiteData, SiteAccount } from "~/types"
import type {
  ChannelFormData,
  ChannelMode,
  CreateChannelPayload,
  ManagedSiteChannel,
  ManagedSiteChannelListData,
  UpdateChannelPayload,
} from "~/types/managedSite"
import type { ManagedSiteMessagesKey } from "~/utils/managedSite"
import {
  getManagedSiteAdminConfig,
  getManagedSiteContext,
} from "~/utils/managedSite"

import { userPreferences, type UserPreferences } from "../userPreferences"
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
): boolean {
  if (!prefs) {
    return false
  }

  return Boolean(getManagedSiteAdminConfig(prefs))
}

/**
 * Resolve the managed site service implementation based on preferences.
 */
export async function getManagedSiteService(): Promise<ManagedSiteService> {
  const prefs = await userPreferences.getPreferences()
  const { siteType, messagesKey } = getManagedSiteContext(prefs)

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
    autoConfigToManagedSite: newApiService.autoConfigToNewApi,
  }
}
