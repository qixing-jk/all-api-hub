import {
  normalizeGptLoadComparableUrl,
  resolveGptLoadFirstPartyChannel,
} from "~/constants/gptLoad"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_EXACT_MATCH_BASES } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type { ManagedResourceMatchingCapability } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type {
  ManagedSiteCapabilities,
  ManagedSiteChannelDraftsCapability,
  ManagedSiteConfigCapability,
  ManagedSiteQueriesCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { requireOpaqueManagedResourceChannelId } from "~/services/apiAdapters/managedResources/shared/resourceIds"
import { createManagedSiteConfigCapability } from "~/services/apiAdapters/managedSites/config"
import {
  listAllGptLoadGroups,
  listGptLoadModelIds,
} from "~/services/apiService/gptLoad"
import {
  readGptLoadGroupBaseUrl,
  toGptLoadSanitizedGroup,
} from "~/services/apiService/gptLoad/redaction"
import { shareInventoryRead } from "~/services/apiTransport/inventoryReads"
import { createManagedChannelResourceRef } from "~/services/managedSites/managedResourceIdentity"
import {
  createNativeInventoryIndex,
  NATIVE_INVENTORY_NAMESPACES,
} from "~/services/managedSites/matching/nativeInventoryIndex"
import {
  checkValidGptLoadConfig,
  fetchGptLoadChannelSecretKey,
  prepareGptLoadChannelFormData,
} from "~/services/managedSites/providers/gptLoad"
import type { GptLoadConfig } from "~/types/gptLoadConfig"

/** Keep provider lookup rules local; share the secret-free batch index structure. */
const readMatchingInventory = shareInventoryRead(
  async (config: GptLoadConfig, options) =>
    createNativeInventoryIndex(
      await listAllGptLoadGroups(config, options),
      (row) => {
        const baseUrl =
          readGptLoadGroupBaseUrl(row) || (row.endpoint ?? "").trim()
        return baseUrl
          ? {
              namespace: NATIVE_INVENTORY_NAMESPACES.OVERRIDE,
              key: normalizeGptLoadComparableUrl(baseUrl),
            }
          : {
              namespace: NATIVE_INVENTORY_NAMESPACES.DEFAULT,
              key: row.channel_id,
            }
      },
      (row) => {
        const sanitized = toGptLoadSanitizedGroup(row)
        return {
          ref: createManagedChannelResourceRef(
            SITE_TYPES.GPT_LOAD,
            config.baseUrl,
            String(sanitized.id),
          ),
          name: sanitized.name,
          type: sanitized.channelId,
          base_url: sanitized.baseUrl,
          models: sanitized.models.join(","),
        }
      },
    ),
)

const gptLoadManagedSiteConfig: ManagedSiteConfigCapability<GptLoadConfig> =
  createManagedSiteConfigCapability(
    SITE_TYPES.GPT_LOAD,
    checkValidGptLoadConfig,
  )

const gptLoadManagedSiteQueries: ManagedSiteQueriesCapability<GptLoadConfig> = {
  accountAvailableModels: { fetch: (config) => listGptLoadModelIds(config) },
}

const gptLoadManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability = {
  prepareFormData: prepareGptLoadChannelFormData,
}

const matching: ManagedResourceMatchingCapability<GptLoadConfig> = {
  // The stored base-url override plus channel identity identify one group.
  exactMatchBasis: MANAGED_RESOURCE_EXACT_MATCH_BASES.URL_KEY,
  search: async (config, baseUrl, options) => {
    const index = await readMatchingInventory(config, options)
    const searchTarget = normalizeGptLoadComparableUrl(baseUrl)
    const defaultIdentity = resolveGptLoadFirstPartyChannel(searchTarget)
    const items = index.find([
      { namespace: NATIVE_INVENTORY_NAMESPACES.OVERRIDE, key: searchTarget },
      ...(defaultIdentity === null
        ? []
        : [
            {
              namespace: NATIVE_INVENTORY_NAMESPACES.DEFAULT,
              key: defaultIdentity,
            },
          ]),
    ])
    return { items, total: items.length, type_counts: {} }
  },
  fetchSecretKey: async (config, ref, options) =>
    await fetchGptLoadChannelSecretKey(
      config,
      requireOpaqueManagedResourceChannelId(SITE_TYPES.GPT_LOAD, config, ref),
      options,
    ),
}

export const gptLoadManagedSiteCapabilities = {
  siteType: SITE_TYPES.GPT_LOAD,
  matching,
  config: gptLoadManagedSiteConfig,
  queries: gptLoadManagedSiteQueries,
  channelDrafts: gptLoadManagedSiteChannelDrafts,
} satisfies ManagedSiteCapabilities<GptLoadConfig, typeof SITE_TYPES.GPT_LOAD>
