import { SITE_TYPES } from "~/constants/siteType"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
  ManagedSiteQueriesCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  createChannel as createOctopusChannel,
  deleteChannel as deleteOctopusChannel,
  fetchGroups,
  fetchAvailableModels as fetchOctopusAvailableModels,
  listChannels,
  searchChannels,
  updateChannel as updateOctopusChannel,
} from "~/services/apiService/octopus"
import {
  buildChannelName,
  buildChannelPayload,
  checkValidOctopusConfig,
  fetchAvailableModels,
  mapChannelTypeToOctopusOutboundType,
  octopusChannelToManagedSite,
  prepareChannelFormData,
} from "~/services/managedSites/providers/octopus"
import { getNumericChannelType } from "~/services/managedSites/utils/channelType"
import type {
  CreateChannelPayload,
  ManagedSiteChannelListData,
  UpdateChannelPayload,
} from "~/types/managedSite"
import type {
  OctopusChannel,
  OctopusCreateChannelRequest,
} from "~/types/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"
import { getErrorMessage } from "~/utils/core/error"

import { createManagedSiteConfigCapability } from "./config"

const toManagedSiteChannelListData = (
  channels: OctopusChannel[],
): ManagedSiteChannelListData => {
  const items = channels.map(octopusChannelToManagedSite)
  const typeCounts = items.reduce<Record<string, number>>((acc, channel) => {
    const type = String(channel.type)
    acc[type] = (acc[type] ?? 0) + 1
    return acc
  }, {})

  return {
    items,
    total: items.length,
    type_counts: typeCounts,
  }
}

const toOctopusCreateRequest = (
  channelData: CreateChannelPayload,
): OctopusCreateChannelRequest => {
  const channel = channelData.channel

  return {
    name: channel.name || "",
    type: mapChannelTypeToOctopusOutboundType(
      getNumericChannelType(channel.type),
      true,
    ),
    enabled: channel.status === 1,
    base_urls: [{ url: channel.base_url || "" }],
    keys: [{ enabled: true, channel_key: channel.key || "" }],
    model: channel.models,
    auto_sync: true,
    auto_group: 0,
  }
}

const toOctopusUpdateRequest = (channelData: UpdateChannelPayload) => ({
  id: channelData.id,
  name: channelData.name,
  type:
    channelData.type !== undefined
      ? mapChannelTypeToOctopusOutboundType(
          getNumericChannelType(channelData.type),
          true,
        )
      : undefined,
  enabled:
    "status" in channelData && channelData.status !== undefined
      ? channelData.status === 1
      : undefined,
  base_urls:
    "base_url" in channelData && channelData.base_url !== undefined
      ? [{ url: channelData.base_url }]
      : undefined,
  model: channelData.models,
})

export const octopusManagedSiteChannels: ManagedSiteChannelsCapability<OctopusConfig> =
  {
    search: async (config, keyword) => {
      try {
        return toManagedSiteChannelListData(
          await searchChannels(config, keyword),
        )
      } catch {
        return null
      }
    },
    list: async (config, options) =>
      toManagedSiteChannelListData(await listChannels(config, options)),
    create: async (config, channelData) => {
      try {
        const result = await createOctopusChannel(
          config,
          toOctopusCreateRequest(channelData),
        )
        return {
          success: result.success,
          data: result.data,
          message: result.message || "success",
        }
      } catch (error) {
        return {
          success: false,
          data: null,
          message: getErrorMessage(error) || "Failed to create channel",
        }
      }
    },
    update: async (config, channelData) => {
      try {
        const result = await updateOctopusChannel(
          config,
          toOctopusUpdateRequest(channelData),
        )
        return {
          success: result.success,
          data: result.data,
          message: result.message || "success",
        }
      } catch (error) {
        return {
          success: false,
          data: null,
          message: getErrorMessage(error) || "Failed to update channel",
        }
      }
    },
    delete: async (config, channelId) => {
      try {
        const result = await deleteOctopusChannel(config, channelId)
        return {
          success: result.success,
          data: result.data,
          message: result.message || "success",
        }
      } catch (error) {
        return {
          success: false,
          data: null,
          message: getErrorMessage(error) || "Failed to delete channel",
        }
      }
    },
  }

const octopusManagedSiteConfig: ManagedSiteConfigCapability<OctopusConfig> =
  createManagedSiteConfigCapability(SITE_TYPES.OCTOPUS, checkValidOctopusConfig)

const octopusManagedSiteQueries: ManagedSiteQueriesCapability<OctopusConfig> = {
  fetchSiteUserGroups: fetchGroups,
  fetchAccountAvailableModels: fetchOctopusAvailableModels,
}

const octopusManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability = {
  fetchAvailableModels,
  buildName: buildChannelName,
  prepareFormData: prepareChannelFormData,
  buildPayload: buildChannelPayload,
}

export const octopusManagedSiteCapabilities = {
  channels: octopusManagedSiteChannels,
  config: octopusManagedSiteConfig,
  queries: octopusManagedSiteQueries,
  channelDrafts: octopusManagedSiteChannelDrafts,
}
