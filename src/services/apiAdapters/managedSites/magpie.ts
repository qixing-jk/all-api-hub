import {
  MAGPIE_ENDPOINT_FIELDS,
  MAGPIE_ENDPOINT_TYPES,
  MAGPIE_PROTOCOLS,
} from "~/constants/magpie"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  toProtocolRoot,
  toVersionedProtocolMount,
} from "~/services/aiApi/protocolAddress"
import { MANAGED_RESOURCE_EXACT_MATCH_BASES } from "~/services/apiAdapters/contracts/managedResourceMatching"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ManagedSiteCapabilities } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { magpieModels } from "~/services/apiAdapters/managedResources/magpie/models"
import { magpieScope } from "~/services/apiAdapters/managedResources/magpie/nativeRuntime"
import { createManagedSiteConfigCapability } from "~/services/apiAdapters/managedSites/config"
import {
  listMagpieProviders,
  readMagpieProviderKey,
} from "~/services/apiService/magpie/providers"
import { withMagpieRequestSession } from "~/services/apiService/magpie/request"
import { shareInventoryRead } from "~/services/apiTransport/inventoryReads"
import { getManagedSiteRuntimeConfigForType } from "~/services/managedSites/configuration/runtimeConfig"
import { fetchManagedSiteImportModels } from "~/services/managedSites/utils/fetchManagedSiteImportModels"
import { API_TYPES } from "~/services/verification/aiApiVerification/types"
import type { MagpieConfig } from "~/types/magpieConfig"

type EndpointField = (typeof MAGPIE_ENDPOINT_FIELDS)[number]
type IndexedProvider = {
  resourceId: string
  name: string
  models: string
  ordinal: number
  field: EndpointField
}

const readMatchingInventory = shareInventoryRead(
  async (config: MagpieConfig, options) => {
    const index = new Map<EndpointField, Map<string, IndexedProvider[]>>()
    const providers = await listMagpieProviders(config, options)
    providers.forEach((provider, ordinal) => {
      if (provider.account) return
      const facts = {
        resourceId: provider.id,
        name: provider.name,
        models: (provider.chosen ?? []).join(","),
      }
      for (const field of MAGPIE_ENDPOINT_FIELDS) {
        const endpoint = provider[field]
        if (!endpoint) continue
        const root = toProtocolRoot(MAGPIE_PROTOCOLS[field], endpoint)
        if (!root) continue
        let buckets = index.get(field)
        if (!buckets) {
          buckets = new Map()
          index.set(field, buckets)
        }
        const bucket = buckets.get(root) ?? []
        bucket.push({ ...facts, ordinal, field })
        buckets.set(root, bucket)
      }
    })
    return index
  },
)

/** Magpie import and matching consume canonical credentials, not account DTOs. */
export const magpieManagedSiteCapabilities = {
  siteType: SITE_TYPES.MAGPIE,
  config: createManagedSiteConfigCapability(SITE_TYPES.MAGPIE, async () => {
    const runtime = await getManagedSiteRuntimeConfigForType(SITE_TYPES.MAGPIE)
    if (!runtime) return false
    try {
      await listMagpieProviders(runtime.config)
      return true
    } catch {
      return false
    }
  }),
  matching: {
    exactMatchBasis: MANAGED_RESOURCE_EXACT_MATCH_BASES.URL_KEY,
    search: async (config, baseUrl, options) => {
      const index = await readMatchingInventory(
        withMagpieRequestSession(
          config,
          options?.operationContext?.sessions ?? options?.inventoryCache,
        ),
        options,
      )
      const matches = new Map<number, IndexedProvider>()
      for (const field of MAGPIE_ENDPOINT_FIELDS) {
        const target = toProtocolRoot(MAGPIE_PROTOCOLS[field], baseUrl)
        if (!target) continue
        for (const match of index.get(field)?.get(target) ?? []) {
          // Preserve the first matching field and original provider order.
          if (!matches.has(match.ordinal)) matches.set(match.ordinal, match)
        }
      }
      const items = [...matches.values()]
        .sort((left, right) => left.ordinal - right.ordinal)
        .map(({ resourceId, name, models, field: type }) => ({
          ref: {
            siteType: SITE_TYPES.MAGPIE,
            kind: MANAGED_RESOURCE_KINDS.Channel,
            scopeKey: magpieScope(config),
            resourceId,
          },
          name,
          type,
          // The protocol adapter has proved these addresses equivalent.
          // Preserve the lookup spelling so shared URL checks do not
          // discard Gemini root/version aliases using OpenAI rules.
          base_url: baseUrl,
          models,
          key: "",
        }))
      return { items, total: items.length, type_counts: {} }
    },
    fetchSecretKey: async (config, ref, options) => {
      if (
        ref.siteType !== SITE_TYPES.MAGPIE ||
        ref.kind !== MANAGED_RESOURCE_KINDS.Channel ||
        ref.scopeKey !== magpieScope(config)
      )
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
        })
      return readMagpieProviderKey(
        withMagpieRequestSession(
          config,
          options?.operationContext?.sessions ?? options?.inventoryCache,
        ),
        ref.resourceId,
        options,
      )
    },
  },
  models: magpieModels,
  channelDrafts: {
    prepareFormData: async (source, options) => {
      const apiType = source.apiType ?? API_TYPES.OPENAI_COMPATIBLE
      const protocol =
        apiType === API_TYPES.ANTHROPIC
          ? MAGPIE_ENDPOINT_TYPES.Anthropic
          : apiType === API_TYPES.GOOGLE
            ? MAGPIE_ENDPOINT_TYPES.Gemini
            : apiType === API_TYPES.OPENAI
              ? MAGPIE_ENDPOINT_TYPES.Responses
              : MAGPIE_ENDPOINT_TYPES.Chat
      // GeminiBase only adds /v1beta to a bare host. Prefixed deployments
      // therefore need the versioned mount explicitly, just like Chat/Responses.
      const baseUrl =
        protocol === MAGPIE_ENDPOINT_TYPES.Anthropic
          ? toProtocolRoot(apiType, source.baseUrl)
          : toVersionedProtocolMount(apiType, source.baseUrl)
      const { models, fetchFailed } =
        protocol === MAGPIE_ENDPOINT_TYPES.Chat ||
        protocol === MAGPIE_ENDPOINT_TYPES.Responses
          ? await fetchManagedSiteImportModels(source, options)
          : { models: [...source.modelHints], fetchFailed: false }
      return {
        name: source.name,
        type: protocol,
        base_url: baseUrl ?? source.baseUrl,
        key: source.apiKey,
        models,
        groups: [],
        enabled: true,
        ...(fetchFailed ? { modelPrefillFetchFailed: true } : {}),
      }
    },
  },
} satisfies ManagedSiteCapabilities<MagpieConfig, typeof SITE_TYPES.MAGPIE>
