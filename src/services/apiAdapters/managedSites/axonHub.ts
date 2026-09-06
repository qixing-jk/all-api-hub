import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedResourceMatchingCapability } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type {
  ManagedSiteChannelDraftsCapability,
  ManagedSiteConfigCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  getAxonHubChannelSecretKey,
  listAxonHubChannelPage,
} from "~/services/apiService/axonHub"
import {
  buildChannelName,
  checkValidAxonHubConfig,
  fetchAvailableModels,
  prepareChannelFormData,
} from "~/services/managedSites/providers/axonHub"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
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
          key: "",
        })),
      )
      cursor = page.nextCursor
      if (cursor && cursors.has(cursor))
        throw new Error("Incomplete AxonHub matching inventory")
      if (cursor) cursors.add(cursor)
    } while (cursor)
    return { items, total: items.length, type_counts: {} }
  },
  fetchSecretKey,
  hydrateComparableKeys: async (config, candidates, options) => {
    const hydrated = []
    for (const candidate of candidates) {
      if (hasUsableManagedSiteChannelKey(candidate.key)) {
        hydrated.push(candidate)
        continue
      }
      hydrated.push({
        ...candidate,
        key: await fetchSecretKey(config, candidate.id, options),
      })
    }
    return hydrated
  },
}

/** Matching lists are secret-free; resolve credentials only for selected candidates. */
async function fetchSecretKey(
  config: AxonHubConfig,
  id: number | string,
  options?: Pick<RequestInit, "signal">,
): Promise<string> {
  return getAxonHubChannelSecretKey(config, String(id), options)
}
export const axonHubManagedSiteCapabilities = {
  matching,
  config: axonHubManagedSiteConfig,
  channelDrafts: axonHubManagedSiteChannelDrafts,
}
