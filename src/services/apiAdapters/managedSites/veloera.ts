import { SITE_TYPES } from "~/constants/siteType"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
  ManagedSiteQueriesCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  fetchAccountAvailableModels,
  fetchSiteUserGroups,
} from "~/services/apiService/newApiFamily/default/keyManagement"
import {
  createChannel,
  deleteChannel,
  fetchChannel,
  fetchChannelModels,
  listAllChannels,
  searchChannel,
  updateChannel,
  updateChannelModelMapping,
  updateChannelModels,
} from "~/services/apiService/veloera"
import {
  buildChannelName,
  buildChannelPayload,
  checkValidVeloeraConfig,
  fetchAvailableModels,
  prepareChannelFormData,
} from "~/services/managedSites/providers/veloera"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import type { ManagedSiteChannel } from "~/types/managedSite"
import type { VeloeraConfig } from "~/types/veloeraConfig"

import { createManagedSiteConfigCapability } from "./config"
import { toManagedSiteApiServiceRequest } from "./request"

const fetchSecretKey = async (config: VeloeraConfig, channelId: number) => {
  const channel = await fetchChannel(
    toManagedSiteApiServiceRequest(config),
    channelId,
  )
  return channel.key
}

const hydrateComparableKeys = async (
  config: VeloeraConfig,
  candidates: ManagedSiteChannel[],
) => {
  const hydratedCandidates: ManagedSiteChannel[] = []

  for (const candidate of candidates) {
    if (hasUsableManagedSiteChannelKey(candidate.key)) {
      hydratedCandidates.push(candidate)
      continue
    }

    const key = await fetchSecretKey(config, candidate.id)
    hydratedCandidates.push({ ...candidate, key })
  }

  return hydratedCandidates
}

export const veloeraManagedSiteChannels: ManagedSiteChannelsCapability<VeloeraConfig> =
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
    fetchSecretKey,
    hydrateComparableKeys,
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

const veloeraManagedSiteConfig: ManagedSiteConfigCapability<VeloeraConfig> =
  createManagedSiteConfigCapability(SITE_TYPES.VELOERA, checkValidVeloeraConfig)

const veloeraManagedSiteQueries: ManagedSiteQueriesCapability<VeloeraConfig> = {
  fetchSiteUserGroups: async (config) =>
    await fetchSiteUserGroups(toManagedSiteApiServiceRequest(config)),
  fetchAccountAvailableModels: async (config) =>
    await fetchAccountAvailableModels(toManagedSiteApiServiceRequest(config)),
}

const fetchVeloeraManagedSiteAvailableModels: ManagedSiteChannelDraftsCapability["fetchAvailableModels"] =
  async (account, token) =>
    await fetchAvailableModels(account, token, {
      fetchAccountAvailableModels,
    })

const veloeraManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability = {
  fetchAvailableModels: fetchVeloeraManagedSiteAvailableModels,
  buildName: buildChannelName,
  prepareFormData: prepareChannelFormData,
  buildPayload: buildChannelPayload,
}

export const veloeraManagedSiteCapabilities = {
  channels: veloeraManagedSiteChannels,
  config: veloeraManagedSiteConfig,
  queries: veloeraManagedSiteQueries,
  channelDrafts: veloeraManagedSiteChannelDrafts,
}
