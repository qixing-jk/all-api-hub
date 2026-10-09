import {
  normalizeGptLoadComparableUrl,
  resolveGptLoadFirstPartyChannel,
} from "~/constants/gptLoad"
import { SITE_TYPES } from "~/constants/siteType"
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
import { createManagedChannelResourceRef } from "~/services/managedSites/managedResourceIdentity"
import {
  checkValidGptLoadConfig,
  fetchGptLoadChannelSecretKey,
  prepareGptLoadChannelFormData,
} from "~/services/managedSites/providers/gptLoad"
import type { GptLoadGroup } from "~/types/gptLoad"
import type { GptLoadConfig } from "~/types/gptLoadConfig"

/**
 * Whether a group represents the same upstream as the searched address.
 *
 * A group whose channel is a known first-party endpoint imports the channel
 * with no base-url override (the gateway uses the channel's own endpoint), so
 * the empty override is compared by channel identity instead. An override group
 * matches only the exact normalized address, never a longer address that merely
 * starts with it.
 */
function gptLoadGroupMatchesSource(
  group: GptLoadGroup,
  searchTarget: string,
): boolean {
  // The channel-level override lives in `params.base_url` on the classic route
  // and in the resolved `endpoint` on the modern one.
  const baseUrl =
    readGptLoadGroupBaseUrl(group) || (group.endpoint ?? "").trim()
  if (baseUrl) {
    return normalizeGptLoadComparableUrl(baseUrl) === searchTarget
  }
  return resolveGptLoadFirstPartyChannel(searchTarget) === group.channel_id
}

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
  exactMatchBasis: "url-key",
  search: async (config, baseUrl, options) => {
    const groups = await listAllGptLoadGroups(config, options)
    const searchTarget = normalizeGptLoadComparableUrl(baseUrl)
    const items = groups
      .filter((group) => gptLoadGroupMatchesSource(group, searchTarget))
      .map((group) => {
        const sanitized = toGptLoadSanitizedGroup(group)
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
          // Never copy the list response's credential field: it is masked by
          // default and plaintext is per-row reveal only.
          key: "",
        }
      })
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
