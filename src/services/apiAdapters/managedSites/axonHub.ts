import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedResourceMatchingCapability } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import type {
  ManagedSiteCapabilities,
  ManagedSiteChannelDraftsCapability,
  ManagedSiteConfigCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  getAxonHubChannelSecretKey,
  listAxonHubChannelPage,
} from "~/services/apiService/axonHub"
import {
  assertManagedResourceRefForSite,
  createManagedChannelResourceRef,
} from "~/services/managedSites/managedResourceIdentity"
import {
  checkValidAxonHubConfig,
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
          ref: createManagedChannelResourceRef(
            SITE_TYPES.AXON_HUB,
            config.baseUrl,
            channel.id,
          ),
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
    for (const candidate of candidates) {
      assertManagedResourceRefForSite(candidate.ref, {
        siteType: SITE_TYPES.AXON_HUB,
        config,
      })
    }
    const hydrated = []
    for (const candidate of candidates) {
      if (hasUsableManagedSiteChannelKey(candidate.key)) {
        hydrated.push(candidate)
        continue
      }
      hydrated.push({
        ...candidate,
        key: await fetchSecretKey(config, candidate.ref, options),
      })
    }
    return hydrated
  },
}

/** Matching lists are secret-free; resolve credentials only for selected candidates. */
async function fetchSecretKey(
  config: AxonHubConfig,
  ref: ManagedResourceRef,
  options?: Pick<RequestInit, "signal">,
): Promise<string> {
  assertManagedResourceRefForSite(ref, {
    siteType: SITE_TYPES.AXON_HUB,
    config,
  })
  return getAxonHubChannelSecretKey(config, ref.resourceId, options)
}
export const axonHubManagedSiteCapabilities = {
  siteType: SITE_TYPES.AXON_HUB,
  matching,
  config: axonHubManagedSiteConfig,
  channelDrafts: axonHubManagedSiteChannelDrafts,
} satisfies ManagedSiteCapabilities<AxonHubConfig, typeof SITE_TYPES.AXON_HUB>
