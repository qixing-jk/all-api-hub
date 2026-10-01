import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedResourceMatchingCapability } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type {
  ManagedSiteCapabilities,
  ManagedSiteChannelDraftsCapability,
  ManagedSiteConfigCapability,
  ManagedSiteQueriesCapability,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { requireOpaqueManagedResourceChannelId } from "~/services/apiAdapters/managedResources/resourceIds"
import {
  listAllOmniRouteConnections,
  listOmniRouteModelIds,
} from "~/services/apiService/omniroute"
import {
  readOmniRouteConnectionBaseUrl,
  toOmniRouteSanitizedConnection,
} from "~/services/apiService/omniroute/redaction"
import { sharePendingConfigRead } from "~/services/apiTransport/requestScheduling"
import { createManagedChannelResourceRef } from "~/services/managedSites/managedResourceIdentity"
import {
  checkValidOmniRouteConfig,
  fetchOmniRouteChannelSecretKey,
  prepareChannelFormData,
} from "~/services/managedSites/providers/omniroute"
import type { OmniRouteConfig } from "~/types/omnirouteConfig"

import { createManagedSiteConfigCapability } from "./config"

const readMatchingInventory = sharePendingConfigRead(
  listAllOmniRouteConnections,
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
  exactMatchBasis: "url-key",
  search: async (config, baseUrl, options) => {
    const connections = await readMatchingInventory(config, options)
    const items = connections
      .filter((connection) =>
        readOmniRouteConnectionBaseUrl(connection).includes(baseUrl),
      )
      .map((connection) => {
        const sanitized = toOmniRouteSanitizedConnection(connection)
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
          // Never copy the list response's credential field: it is masked by
          // default but plaintext on a reveal-enabled deployment, and match
          // candidates surface in review UIs.
          key: "",
        }
      })
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
