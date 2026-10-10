import { MAGPIE_ENDPOINT_FIELDS, MAGPIE_PROTOCOLS } from "~/constants/magpie"
import { SITE_TYPES } from "~/constants/siteType"
import {
  toProtocolRoot,
  toVersionedProtocolMount,
} from "~/services/aiApi/protocolAddress"
import { ManagedResourceError } from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ManagedSiteCapabilities } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { magpieModels } from "~/services/apiAdapters/managedResources/magpie/models"
import { magpieScope } from "~/services/apiAdapters/managedResources/magpie/nativeRuntime"
import { createManagedSiteConfigCapability } from "~/services/apiAdapters/managedSites/config"
import {
  listMagpieProviders,
  readMagpieProviderKey,
} from "~/services/apiService/magpie/providers"
import { getManagedSiteRuntimeConfigForType } from "~/services/managedSites/configuration/runtimeConfig"
import { fetchManagedSiteImportModels } from "~/services/managedSites/utils/fetchManagedSiteImportModels"
import type { MagpieConfig } from "~/types/magpieConfig"

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
    exactMatchBasis: "url-key",
    search: async (config, baseUrl, options) => {
      const items = (await listMagpieProviders(config, options)).flatMap(
        (provider) => {
          if (provider.account) return []
          const type = MAGPIE_ENDPOINT_FIELDS.find((field) => {
            const endpoint = provider[field]
            const target = toProtocolRoot(MAGPIE_PROTOCOLS[field], baseUrl)
            return (
              endpoint &&
              target &&
              toProtocolRoot(MAGPIE_PROTOCOLS[field], endpoint) === target
            )
          })
          return type
            ? [
                {
                  ref: {
                    siteType: SITE_TYPES.MAGPIE,
                    kind: "channel" as const,
                    scopeKey: magpieScope(config),
                    resourceId: provider.id,
                  },
                  name: provider.name,
                  type,
                  // The protocol adapter has proved these addresses equivalent.
                  // Preserve the lookup spelling so shared URL checks do not
                  // discard Gemini root/version aliases using OpenAI rules.
                  base_url: baseUrl,
                  models: (provider.chosen ?? []).join(","),
                  key: "",
                },
              ]
            : []
        },
      )
      return { items, total: items.length, type_counts: {} }
    },
    fetchSecretKey: async (config, ref, options) => {
      if (
        ref.siteType !== SITE_TYPES.MAGPIE ||
        ref.kind !== "channel" ||
        ref.scopeKey !== magpieScope(config)
      )
        throw new ManagedResourceError({ code: "validation_failed" })
      return readMagpieProviderKey(config, ref.resourceId, options)
    },
  },
  models: magpieModels,
  channelDrafts: {
    prepareFormData: async (source, options) => {
      const apiType = source.apiType ?? "openai-compatible"
      const protocol =
        apiType === "anthropic"
          ? "anthropic"
          : apiType === "google"
            ? "gemini"
            : apiType === "openai"
              ? "responses"
              : "chat"
      // GeminiBase only adds /v1beta to a bare host. Prefixed deployments
      // therefore need the versioned mount explicitly, just like Chat/Responses.
      const baseUrl =
        protocol === "anthropic"
          ? toProtocolRoot(apiType, source.baseUrl)
          : toVersionedProtocolMount(apiType, source.baseUrl)
      const { models, fetchFailed } =
        protocol === "chat" || protocol === "responses"
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
