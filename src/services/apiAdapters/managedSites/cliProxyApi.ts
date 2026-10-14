import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_EXACT_MATCH_BASES } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type { ManagedSiteCapabilities } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  cliProxyApiKeys,
  cliProxyApiRef,
  cliProxyApiScope,
  getCliProxyApiResource,
} from "~/services/apiAdapters/managedResources/cliProxyApi/nativeRuntime"
import {
  listAllCliProxyApiProviders,
  type CliProxyApiProviderKind,
} from "~/services/apiService/cliProxyApi"
import {
  shareInventoryRead,
  type InventoryReadOptions,
} from "~/services/apiTransport/inventoryReads"
import type { ScheduledReadOptions } from "~/services/apiTransport/requestScheduling"
import { getManagedSiteRuntimeConfigForType } from "~/services/managedSites/configuration/runtimeConfig"
import { fetchManagedSiteImportModels } from "~/services/managedSites/utils/fetchManagedSiteImportModels"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import type { CliProxyApiConfig } from "~/types/cliProxyApiConfig"
import { transformNormalizedUrlPath } from "~/utils/core/urlParsing"

import { createManagedSiteConfigCapability } from "./config"

const IMPORT_PROVIDER_KINDS = {
  OpenAi: "openai-compatibility",
  Codex: "codex-api-key",
  Claude: "claude-api-key",
  Gemini: "gemini-api-key",
} as const satisfies Record<string, CliProxyApiProviderKind>

const readMatchingInventory = shareInventoryRead(listAllCliProxyApiProviders)

/** Match the request paths appended by CLIProxyAPI's native executors. */
function importedProviderUrl(
  baseUrl: string,
  kind: CliProxyApiProviderKind,
): string {
  return transformNormalizedUrlPath(baseUrl, (pathname) => {
    const path = pathname.replace(/\/+$/, "")
    if (kind === IMPORT_PROVIDER_KINDS.Claude)
      return path.replace(/\/v1(?:\/messages)?$/, "") || "/"
    if (kind === IMPORT_PROVIDER_KINDS.Gemini)
      return path.replace(/\/v1(?:beta)?(?:\/models(?:\/[^/]+)?)?$/, "") || "/"
    const base = path.replace(
      /\/(?:chat\/completions|responses(?:\/compact)?|models)$/,
      "",
    )
    if (
      kind === IMPORT_PROVIDER_KINDS.Codex &&
      base.endsWith("/backend-api/codex")
    )
      return base
    return /\/v\d+(?:beta)?$/.test(base) ? base : `${base}/v1`
  })
}

export const cliProxyApiCapabilities = {
  siteType: SITE_TYPES.CLI_PROXY_API,
  config: createManagedSiteConfigCapability(
    SITE_TYPES.CLI_PROXY_API,
    async () => {
      const runtime = await getManagedSiteRuntimeConfigForType(
        SITE_TYPES.CLI_PROXY_API,
      )
      if (!runtime) return false
      try {
        await listAllCliProxyApiProviders(runtime.config)
        return true
      } catch {
        return false
      }
    },
  ),
  matching: {
    exactMatchBasis: MANAGED_RESOURCE_EXACT_MATCH_BASES.URL_KEY,
    search: async (config, baseUrl, options?: InventoryReadOptions) => {
      const resources = (await readMatchingInventory(config, options)).filter(
        (item) => (item.value["base-url"] ?? "").includes(baseUrl),
      )
      const items = resources.flatMap((resource) =>
        cliProxyApiKeys(resource).map((key) => ({
          ref: cliProxyApiRef(config, resource),
          name: resource.value.name || resource.kind,
          type: resource.kind,
          base_url: resource.value["base-url"] ?? "",
          models: (resource.value.models ?? [])
            .map((model) => model.alias || model.name)
            .join(","),
          key,
        })),
      )
      return { items, total: items.length, type_counts: {} }
    },
    fetchSecretKey: async (config, ref, options?: ScheduledReadOptions) => {
      if (
        ref.siteType !== SITE_TYPES.CLI_PROXY_API ||
        ref.kind !== "channel" ||
        ref.scopeKey !== cliProxyApiScope(config)
      )
        throw new Error("Invalid resource reference")
      const resource = await getCliProxyApiResource(
        config,
        ref.resourceId,
        options,
      )
      const keys = cliProxyApiKeys(resource)
      if (keys.length !== 1) throw new Error("Multiple provider credentials")
      const [key] = keys
      if (key === undefined) throw new Error("Provider credential is missing")
      return key
    },
  },
  channelDrafts: {
    prepareFormData: async (source, options?: ScheduledReadOptions) => {
      const kind =
        source.apiType === API_TYPES.ANTHROPIC
          ? IMPORT_PROVIDER_KINDS.Claude
          : source.apiType === API_TYPES.GOOGLE
            ? IMPORT_PROVIDER_KINDS.Gemini
            : source.apiType === API_TYPES.OPENAI
              ? IMPORT_PROVIDER_KINDS.Codex
              : IMPORT_PROVIDER_KINDS.OpenAi
      const { models, fetchFailed } =
        kind === IMPORT_PROVIDER_KINDS.OpenAi ||
        kind === IMPORT_PROVIDER_KINDS.Codex
          ? await fetchManagedSiteImportModels(source, options)
          : { models: [...source.modelHints], fetchFailed: false }
      return {
        name: source.name,
        type: kind,
        key: source.apiKey,
        base_url: importedProviderUrl(source.baseUrl, kind),
        models,
        groups: [],
        enabled: true,
        ...(fetchFailed ? { modelPrefillFetchFailed: true } : {}),
      }
    },
  },
} satisfies ManagedSiteCapabilities<
  CliProxyApiConfig,
  typeof SITE_TYPES.CLI_PROXY_API
>
