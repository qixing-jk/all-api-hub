import {
  normalizeOmniRouteComparableUrl,
  resolveOmniRouteBuiltinProvider,
} from "~/constants/omniroute"
import { SITE_TYPES } from "~/constants/siteType"
import { readEdgeKeyMask } from "~/services/accountTokens/keyMaskEvidence"
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
  listAllOmniRouteConnections,
  listOmniRouteModelIds,
} from "~/services/apiService/omniroute"
import {
  readOmniRouteConnectionBaseUrl,
  toOmniRouteSanitizedConnection,
} from "~/services/apiService/omniroute/redaction"
import { shareInventoryRead } from "~/services/apiTransport/inventoryReads"
import { createManagedChannelResourceRef } from "~/services/managedSites/managedResourceIdentity"
import {
  createNativeInventoryIndex,
  NATIVE_INVENTORY_NAMESPACES,
} from "~/services/managedSites/matching/nativeInventoryIndex"
import {
  checkValidOmniRouteConfig,
  fetchOmniRouteChannelSecretKey,
  prepareChannelFormData,
} from "~/services/managedSites/providers/omniroute"
import type { OmniRouteConfig } from "~/types/omnirouteConfig"

/** Keep provider lookup rules local; share the secret-free batch index structure. */
const readMatchingInventory = shareInventoryRead(
  async (config: OmniRouteConfig, options) =>
    createNativeInventoryIndex(
      await listAllOmniRouteConnections(config, options),
      (row) => {
        const baseUrl = readOmniRouteConnectionBaseUrl(row)
        return baseUrl
          ? {
              namespace: NATIVE_INVENTORY_NAMESPACES.OVERRIDE,
              key: normalizeOmniRouteComparableUrl(baseUrl),
            }
          : {
              namespace: NATIVE_INVENTORY_NAMESPACES.DEFAULT,
              key: row.provider,
            }
      },
      (row) => {
        const sanitized = toOmniRouteSanitizedConnection(row)
        // OmniRoute release/v3.8.51 src/lib/apiKeyExposure.ts:maskStoredApiKey.
        // Reveal-enabled plaintext is deliberately not retained in matching rows.
        const keyMask = readEdgeKeyMask(row.apiKey)
        return {
          ref: createManagedChannelResourceRef(
            SITE_TYPES.OMNIROUTE,
            config.baseUrl,
            sanitized.id,
          ),
          name: sanitized.name,
          type: sanitized.provider,
          base_url: sanitized.baseUrl,
          models: "",
          ...(keyMask ? { keyMasks: [keyMask] } : {}),
        }
      },
    ),
)

const omniRouteManagedSiteConfig: ManagedSiteConfigCapability<OmniRouteConfig> =
  createManagedSiteConfigCapability(
    SITE_TYPES.OMNIROUTE,
    checkValidOmniRouteConfig,
  )

const omniRouteManagedSiteQueries: ManagedSiteQueriesCapability<OmniRouteConfig> =
  {
    // The gateway has no per-connection grouping; `/api/keys/groups` groups
    // gateway API keys, which is a different concept.
    accountAvailableModels: { fetch: listOmniRouteModelIds },
  }

const omniRouteManagedSiteChannelDrafts: ManagedSiteChannelDraftsCapability = {
  prepareFormData: prepareChannelFormData,
}

const matching: ManagedResourceMatchingCapability<OmniRouteConfig> = {
  // Connection-level base URL plus the stored credential identify one channel.
  exactMatchBasis: MANAGED_RESOURCE_EXACT_MATCH_BASES.URL_KEY,
  search: async (config, baseUrl, options) => {
    const index = await readMatchingInventory(config, options)
    const searchTarget = normalizeOmniRouteComparableUrl(baseUrl)
    const defaultIdentity = resolveOmniRouteBuiltinProvider(searchTarget)
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
    await fetchOmniRouteChannelSecretKey(
      config,
      requireOpaqueManagedResourceChannelId(SITE_TYPES.OMNIROUTE, config, ref),
      options,
    ),
}

export const omniRouteManagedSiteCapabilities = {
  siteType: SITE_TYPES.OMNIROUTE,
  matching,
  config: omniRouteManagedSiteConfig,
  queries: omniRouteManagedSiteQueries,
  channelDrafts: omniRouteManagedSiteChannelDrafts,
} satisfies ManagedSiteCapabilities<
  OmniRouteConfig,
  typeof SITE_TYPES.OMNIROUTE
>
