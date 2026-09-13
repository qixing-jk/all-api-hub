import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedResourceMatchingCapability } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type {
  ManagedSiteCapabilities,
  ManagedSiteChannelDraftsCapability,
  ManagedSiteConfigCapability,
  ManagedSiteQueriesCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { createOctopusModelSyncCapability } from "~/services/apiAdapters/managedResources/octopusModelSync"
import { octopusManagedResourceModels } from "~/services/apiAdapters/managedResources/octopusOperations"
import {
  fetchGroups,
  fetchAvailableModels as fetchOctopusAvailableModels,
  searchChannels,
} from "~/services/apiService/octopus"
import { createManagedChannelResourceRef } from "~/services/managedSites/managedResourceIdentity"
import {
  checkValidOctopusConfig,
  prepareChannelFormData,
} from "~/services/managedSites/providers/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"

import { createManagedSiteConfigCapability } from "./config"

const octopusManagedSiteConfig: ManagedSiteConfigCapability<OctopusConfig> =
  createManagedSiteConfigCapability(SITE_TYPES.OCTOPUS, checkValidOctopusConfig)

const octopusManagedSiteQueries: ManagedSiteQueriesCapability<OctopusConfig> = {
  siteUserGroups: { fetch: fetchGroups },
  accountAvailableModels: { fetch: fetchOctopusAvailableModels },
}

const octopusManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability = {
  prepareFormData: prepareChannelFormData,
}

const matching: ManagedResourceMatchingCapability<OctopusConfig> = {
  search: async (config, keyword, options) => {
    const items = (await searchChannels(config, keyword, options)).map(
      (channel) => ({
        ref: createManagedChannelResourceRef(
          SITE_TYPES.OCTOPUS,
          config.baseUrl,
          channel.id,
        ),
        name: channel.name,
        type: channel.type,
        base_url: channel.base_urls[0]?.url ?? "",
        models: channel.model ?? "",
        key: channel.keys
          .map((key) => key.channel_key)
          .filter(Boolean)
          .join("\n"),
      }),
    )
    return { items, total: items.length, type_counts: {} }
  },
}
export const octopusManagedSiteCapabilities = {
  siteType: SITE_TYPES.OCTOPUS,
  matching,
  models: {
    ...octopusManagedResourceModels,
    createSync: createOctopusModelSyncCapability,
  },
  config: octopusManagedSiteConfig,
  queries: octopusManagedSiteQueries,
  channelDrafts: octopusManagedSiteChannelDrafts,
} satisfies ManagedSiteCapabilities<OctopusConfig, typeof SITE_TYPES.OCTOPUS>
