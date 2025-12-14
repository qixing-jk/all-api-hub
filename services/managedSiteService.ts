import { NEW_API, VELOERA, type ManagedSiteType } from "~/constants/siteType"
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

import * as newApiService from "./newApiService/newApiService"
import { userPreferences } from "./userPreferences"
import type { UserPreferences } from "./userPreferences"
import * as veloeraService from "./veloeraService/veloeraService"

export type ManagedSiteMessagesKey = "newapi" | "veloera"

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
  ): Promise<ManagedSiteChannel | null>

  autoConfigToManagedSite(
    account: SiteAccount,
    toastId?: string,
  ): Promise<unknown>
}

/**
 *
 */
function mapSiteTypeToMessagesKey(
  siteType: ManagedSiteType,
): ManagedSiteMessagesKey {
  return siteType === VELOERA ? "veloera" : "newapi"
}

/**
 *
 */
export function hasValidManagedSiteConfig(
  prefs: UserPreferences | null,
): boolean {
  if (!prefs) {
    return false
  }

  const siteType: ManagedSiteType = prefs.managedSiteType || NEW_API
  const managedConfig = siteType === VELOERA ? prefs.veloera : prefs.newApi

  return Boolean(
    managedConfig?.baseUrl &&
      managedConfig?.adminToken &&
      managedConfig?.userId,
  )
}

/**
 *
 */
export async function getManagedSiteType(): Promise<ManagedSiteType> {
  const prefs = await userPreferences.getPreferences()
  return prefs.managedSiteType || NEW_API
}

/**
 *
 */
export async function getManagedSiteMessagesKey(): Promise<ManagedSiteMessagesKey> {
  return mapSiteTypeToMessagesKey(await getManagedSiteType())
}

/**
 *
 */
export async function getManagedSiteService(): Promise<ManagedSiteService> {
  const siteType = await getManagedSiteType()

  if (siteType === VELOERA) {
    return {
      siteType,
      messagesKey: "veloera",
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

  return {
    siteType: NEW_API,
    messagesKey: "newapi",
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
