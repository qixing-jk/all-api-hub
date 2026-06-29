import { SITE_TYPES } from "~/constants/siteType"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteChannelsCapability,
  ManagedSiteConfigCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  buildChannelName,
  buildChannelPayload,
  checkValidAxonHubConfig,
  createChannel,
  deleteChannel,
  fetchAvailableModels,
  prepareChannelFormData,
  searchChannel,
  updateChannel,
} from "~/services/managedSites/providers/axonHub"
import type { AxonHubConfig } from "~/types/axonHubConfig"

import { createManagedSiteConfigCapability } from "./config"
import { emptyManagedSiteQueries } from "./unsupportedQueries"

export const axonHubManagedSiteChannels: ManagedSiteChannelsCapability<AxonHubConfig> =
  {
    search: searchChannel,
    create: createChannel,
    update: updateChannel,
    delete: deleteChannel,
  }

const axonHubManagedSiteConfig: ManagedSiteConfigCapability<AxonHubConfig> =
  createManagedSiteConfigCapability(
    SITE_TYPES.AXON_HUB,
    checkValidAxonHubConfig,
  )

const axonHubManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability = {
  fetchAvailableModels,
  buildName: buildChannelName,
  prepareFormData: prepareChannelFormData,
  buildPayload: buildChannelPayload,
}

export const axonHubManagedSiteCapabilities = {
  channels: axonHubManagedSiteChannels,
  config: axonHubManagedSiteConfig,
  queries: emptyManagedSiteQueries,
  channelDrafts: axonHubManagedSiteChannelDrafts,
}
