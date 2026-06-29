import { SITE_TYPES } from "~/constants/siteType"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
  ManagedSiteQueriesCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { createNewApiKeyManagement } from "~/services/apiAdapters/newApi/keyManagement"
import {
  createChannel,
  deleteChannel,
  fetchChannel,
  fetchChannelModels,
  fetchSiteUserGroups,
  listAllChannels,
  searchChannel,
  updateChannel,
  updateChannelModelMapping,
  updateChannelModels,
} from "~/services/apiService/doneHub"
import {
  buildChannelName,
  buildChannelPayload,
  checkValidDoneHubConfig,
  fetchAvailableModels,
  prepareChannelFormData,
} from "~/services/managedSites/providers/doneHubService"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import type { DoneHubConfig } from "~/types/doneHubConfig"
import type { ManagedSiteChannel } from "~/types/managedSite"

import { createManagedSiteConfigCapability } from "./config"
import { toManagedSiteApiServiceRequest } from "./request"

const fetchSecretKey = async (config: DoneHubConfig, channelId: number) => {
  const channel = await fetchChannel(
    toManagedSiteApiServiceRequest(config),
    channelId,
  )
  return channel.key
}

const hydrateComparableKeys = async (
  config: DoneHubConfig,
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

export const doneHubManagedSiteChannels: ManagedSiteChannelsCapability<DoneHubConfig> =
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

const doneHubManagedSiteConfig: ManagedSiteConfigCapability<DoneHubConfig> =
  createManagedSiteConfigCapability(
    SITE_TYPES.DONE_HUB,
    checkValidDoneHubConfig,
  )

const doneHubKeyManagement = createNewApiKeyManagement(SITE_TYPES.DONE_HUB)

const doneHubManagedSiteQueries: ManagedSiteQueriesCapability<DoneHubConfig> = {
  fetchSiteUserGroups: async (config) =>
    await fetchSiteUserGroups(toManagedSiteApiServiceRequest(config)),
  fetchAccountAvailableModels: async (config) =>
    await doneHubKeyManagement.fetchAvailableModels(
      toManagedSiteApiServiceRequest(config),
    ),
}

const fetchDoneHubManagedSiteAvailableModels: ManagedSiteChannelDraftsCapability["fetchAvailableModels"] =
  async (account, token) =>
    await fetchAvailableModels(account, token, {
      fetchAccountAvailableModels: doneHubKeyManagement.fetchAvailableModels,
    })

const doneHubManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability = {
  fetchAvailableModels: fetchDoneHubManagedSiteAvailableModels,
  buildName: buildChannelName,
  prepareFormData: prepareChannelFormData,
  buildPayload: buildChannelPayload,
}

export const doneHubManagedSiteCapabilities = {
  channels: doneHubManagedSiteChannels,
  config: doneHubManagedSiteConfig,
  queries: doneHubManagedSiteQueries,
  channelDrafts: doneHubManagedSiteChannelDrafts,
}
