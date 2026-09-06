import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedResourceMatchingCapability } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteConfigCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { listAxonHubChannelPage } from "~/services/apiService/axonHub"
import {
  buildChannelName,
  checkValidAxonHubConfig,
  fetchAvailableModels,
  prepareChannelFormData,
} from "~/services/managedSites/providers/axonHub"
import type { AxonHubConfig } from "~/types/axonHubConfig"
import type { ManagedResourceMatchCandidate } from "~/types/managedResourceMatching"
import { normalizeList } from "~/utils/core/string"

import { createManagedSiteConfigCapability } from "./config"

const axonHubManagedSiteConfig: ManagedSiteConfigCapability<AxonHubConfig> =
  createManagedSiteConfigCapability(
    SITE_TYPES.AXON_HUB,
    checkValidAxonHubConfig,
  )

const axonHubManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability = {
  fetchAvailableModels,
  buildName: buildChannelName,
  prepareFormData: prepareChannelFormData,
}

const matching: ManagedResourceMatchingCapability<AxonHubConfig> = {
  search: async (config) => {
    const items: ManagedResourceMatchCandidate[] = []
    const cursors = new Set<string>()
    let cursor: string | undefined
    do {
      const page = await listAxonHubChannelPage(config, { cursor, limit: 100 })
      items.push(
        ...page.items.map((channel) => ({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          base_url: channel.baseURL ?? "",
          models: normalizeList([
            ...(channel.supportedModels ?? []),
            ...(channel.manualModels ?? []),
          ]).join(","),
          key: [
            ...(channel.credentials?.apiKeys ?? []),
            channel.credentials?.apiKey ?? "",
          ]
            .filter(Boolean)
            .join("\n"),
        })),
      )
      cursor = page.nextCursor
      if (cursor && cursors.has(cursor))
        throw new Error("Incomplete AxonHub matching inventory")
      if (cursor) cursors.add(cursor)
    } while (cursor)
    return { items, total: items.length, type_counts: {} }
  },
}
export const axonHubManagedSiteCapabilities = {
  matching,
  config: axonHubManagedSiteConfig,
  channelDrafts: axonHubManagedSiteChannelDrafts,
}
