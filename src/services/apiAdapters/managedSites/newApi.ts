import { SITE_TYPES } from "~/constants/siteType"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
  ManagedSiteImportCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  createChannel,
  deleteChannel,
  fetchChannelModels,
  listAllChannels,
  searchChannel,
  updateChannel,
  updateChannelModelMapping,
  updateChannelModels,
} from "~/services/apiService/newApiFamily/channelManagement"
import {
  autoConfigToNewApi,
  buildChannelName,
  buildChannelPayload,
  checkValidNewApiConfig,
  fetchAvailableModels,
  prepareChannelFormData,
} from "~/services/managedSites/providers/newApi"
import type { NewApiConfig } from "~/types/newApiConfig"

import { createManagedSiteConfigCapability } from "./config"
import { toManagedSiteApiServiceRequest } from "./request"

export const newApiManagedSiteChannels: ManagedSiteChannelsCapability<NewApiConfig> =
  {
    search: async (config, keyword) =>
      await searchChannel(toManagedSiteApiServiceRequest(config), keyword),
    list: async (config, options) =>
      await listAllChannels(
        toManagedSiteApiServiceRequest(config, options),
        options,
      ),
    create: async (config, channelData) =>
      await createChannel(toManagedSiteApiServiceRequest(config), channelData),
    update: async (config, channelData) =>
      await updateChannel(toManagedSiteApiServiceRequest(config), channelData),
    delete: async (config, channelId) =>
      await deleteChannel(toManagedSiteApiServiceRequest(config), channelId),
    fetchModels: async (config, channelId, options) =>
      await fetchChannelModels(
        toManagedSiteApiServiceRequest(config, options),
        channelId,
        options,
      ),
    updateModels: async (config, channelId, models, options) =>
      await updateChannelModels(
        toManagedSiteApiServiceRequest(config, options),
        channelId,
        models.join(","),
        options,
      ),
    updateModelMapping: async (
      config,
      channelId,
      models,
      modelMapping,
      options,
    ) =>
      await updateChannelModelMapping(
        toManagedSiteApiServiceRequest(config, options),
        channelId,
        models.join(","),
        JSON.stringify(modelMapping),
        options,
      ),
  }

const newApiManagedSiteConfig: ManagedSiteConfigCapability<NewApiConfig> =
  createManagedSiteConfigCapability(SITE_TYPES.NEW_API, checkValidNewApiConfig)

const newApiManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability = {
  fetchAvailableModels,
  buildName: buildChannelName,
  prepareFormData: prepareChannelFormData,
  buildPayload: buildChannelPayload,
}

const newApiManagedSiteImports: ManagedSiteImportCapability = {
  autoConfig: autoConfigToNewApi,
}

export const newApiManagedSiteCapabilities = {
  channels: newApiManagedSiteChannels,
  config: newApiManagedSiteConfig,
  channelDrafts: newApiManagedSiteChannelDrafts,
  imports: newApiManagedSiteImports,
}
