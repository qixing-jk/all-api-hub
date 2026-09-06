import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedResourceMatchingCapability } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type { ManagedResourceModelsCapability } from "~/services/apiAdapters/contracts/managedResourceModels"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteConfigCapability,
  ManagedSiteQueriesCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { toOctopusModelChannel } from "~/services/apiAdapters/managedResources/modelInputs"
import {
  fetchGroups,
  fetchAvailableModels as fetchOctopusAvailableModels,
  listChannels,
  searchChannels,
  updateChannel as updateOctopusChannel,
} from "~/services/apiService/octopus"
import {
  buildChannelName,
  checkValidOctopusConfig,
  fetchAvailableModels,
  prepareChannelFormData,
} from "~/services/managedSites/providers/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"

import { createManagedSiteConfigCapability } from "./config"
import { octopusChannelEffect, runOctopusMutation } from "./octopusMutation"

export const octopusManagedResourceModels: ManagedResourceModelsCapability<OctopusConfig> =
  {
    list: async (config, options) => {
      await options?.beforeRequest?.()
      const items = (await listChannels(config, options)).map(
        toOctopusModelChannel,
      )
      return {
        items,
        total: items.length,
        type_counts: items.reduce<Record<string, number>>((counts, channel) => {
          const type = String(channel.type)
          counts[type] = (counts[type] ?? 0) + 1
          return counts
        }, {}),
      }
    },
    updateModels: async (config, channelId, models, options) => {
      return await runOctopusMutation<unknown, void>({
        effect: octopusChannelEffect("models-updated", channelId),
        execute: async () => {
          const payload = {
            id: channelId,
            model: models.join(","),
          }
          return options
            ? await updateOctopusChannel(config, payload, {
                signal: options.signal,
                ...(options.protectionBypassExecution
                  ? {
                      protectionBypassExecution:
                        options.protectionBypassExecution,
                    }
                  : {}),
              })
            : await updateOctopusChannel(config, payload)
        },
        successData: () => undefined,
      })
    },
  }

const octopusManagedSiteConfig: ManagedSiteConfigCapability<OctopusConfig> =
  createManagedSiteConfigCapability(SITE_TYPES.OCTOPUS, checkValidOctopusConfig)

const octopusManagedSiteQueries: ManagedSiteQueriesCapability<OctopusConfig> = {
  siteUserGroups: { fetch: fetchGroups },
  accountAvailableModels: { fetch: fetchOctopusAvailableModels },
}

const octopusManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability = {
  fetchAvailableModels,
  buildName: buildChannelName,
  prepareFormData: prepareChannelFormData,
}

const matching: ManagedResourceMatchingCapability<OctopusConfig> = {
  search: async (config, keyword) => {
    const items = (await searchChannels(config, keyword)).map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      base_url: channel.base_urls[0]?.url ?? "",
      models: channel.model ?? "",
      key: channel.keys
        .map((key) => key.channel_key)
        .filter(Boolean)
        .join("\n"),
    }))
    return { items, total: items.length, type_counts: {} }
  },
}
export const octopusManagedSiteCapabilities = {
  matching,
  models: octopusManagedResourceModels,
  config: octopusManagedSiteConfig,
  queries: octopusManagedSiteQueries,
  channelDrafts: octopusManagedSiteChannelDrafts,
}
