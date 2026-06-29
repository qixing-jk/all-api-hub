import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { ApiResponse } from "~/services/apiTransport/type"
import {
  getCurrentManagedSiteRuntimeConfig,
  type ManagedSiteRuntimeConfigValue,
  type ManagedSiteRuntimeConfigValueForType,
} from "~/services/managedSites/runtimeConfig"
import type { ManagedSiteMessagesKey } from "~/services/managedSites/utils/managedSite"
import {
  getManagedSiteAdminConfig,
  getManagedSiteAdminConfigForType,
  getManagedSiteMessagesKeyFromSiteType,
} from "~/services/managedSites/utils/managedSite"
import type { AccountToken, ApiToken, DisplaySiteData } from "~/types"
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

  fetchSiteUserGroups(config: TConfig): Promise<string[]>

  fetchAccountAvailableModels(config: TConfig): Promise<string[]>

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
}

export type TypedManagedSiteService<TSiteType extends ManagedSiteType> =
  ManagedSiteService<ManagedSiteRuntimeConfigValueForType<TSiteType>, TSiteType>
type ManagedSiteCapabilities = NonNullable<
  ReturnType<typeof getSiteTypeCapabilities>["managedSites"]
>
type RequiredManagedSiteCapabilities = {
  channels: NonNullable<ManagedSiteCapabilities["channels"]>
  config: NonNullable<ManagedSiteCapabilities["config"]>
  queries: NonNullable<ManagedSiteCapabilities["queries"]>
  channelDrafts: NonNullable<ManagedSiteCapabilities["channelDrafts"]>
}

/**
 * Resolves the full managed-site capability set required by the service facade.
 */
function requireManagedSiteCapabilities(
  siteType: ManagedSiteType,
): RequiredManagedSiteCapabilities {
  const managedSites = getSiteTypeCapabilities(siteType).managedSites

  if (
    !managedSites?.channels ||
    !managedSites.config ||
    !managedSites.queries ||
    !managedSites.channelDrafts
  ) {
    throw new Error(
      `managedSites capabilities are not implemented for ${siteType}`,
    )
  }

  return {
    channels: managedSites.channels,
    config: managedSites.config,
    queries: managedSites.queries,
    channelDrafts: managedSites.channelDrafts,
  }
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
  const capabilities = requireManagedSiteCapabilities(siteType)

  return {
    siteType,
    messagesKey,
    searchChannel: capabilities.channels.search,
    createChannel: capabilities.channels.create,
    updateChannel: capabilities.channels.update,
    deleteChannel: capabilities.channels.delete,
    checkValidConfig: capabilities.config.checkValid,
    getConfig: capabilities.config.get,
    fetchSiteUserGroups: capabilities.queries.fetchSiteUserGroups,
    fetchAccountAvailableModels:
      capabilities.queries.fetchAccountAvailableModels,
    fetchAvailableModels: capabilities.channelDrafts.fetchAvailableModels,
    buildChannelName: capabilities.channelDrafts.buildName,
    prepareChannelFormData: capabilities.channelDrafts.prepareFormData,
    buildChannelPayload: capabilities.channelDrafts.buildPayload,
    hydrateComparableChannelKeys: capabilities.channels.hydrateComparableKeys,
    fetchChannelSecretKey: capabilities.channels.fetchSecretKey,
  }
}
