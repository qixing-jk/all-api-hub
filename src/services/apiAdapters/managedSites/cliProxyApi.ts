import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedSiteCapabilities } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  cliProxyApiKeys,
  cliProxyApiRef,
  cliProxyApiScope,
  getCliProxyApiResource,
} from "~/services/apiAdapters/managedResources/cliProxyApi"
import { listAllCliProxyApiProviders } from "~/services/apiService/cliProxyApi"
import { getManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { fetchManagedSiteImportModels } from "~/services/managedSites/utils/fetchManagedSiteImportModels"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import type { CliProxyApiConfig } from "~/types/cliProxyApiConfig"
import { transformNormalizedUrlPath } from "~/utils/core/urlParsing"

import { createManagedSiteConfigCapability } from "./config"

/** Match the request paths appended by CLIProxyAPI's native executors. */
function importedProviderUrl(baseUrl: string, kind: string): string {
  return transformNormalizedUrlPath(baseUrl, (pathname) => {
    const path = pathname.replace(/\/+$/, "")
    if (kind === "claude-api-key")
      return path.replace(/\/v1(?:\/messages)?$/, "") || "/"
    if (kind === "gemini-api-key")
      return path.replace(/\/v1(?:beta)?(?:\/models(?:\/[^/]+)?)?$/, "") || "/"
    const base = path.replace(
      /\/(?:chat\/completions|responses(?:\/compact)?|models)$/,
      "",
    )
    if (kind === "codex-api-key" && base.endsWith("/backend-api/codex"))
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
    exactMatchBasis: "url-key",
    search: async (config, baseUrl) => {
      const resources = (await listAllCliProxyApiProviders(config)).filter(
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
    fetchSecretKey: async (config, ref) => {
      if (
        ref.siteType !== SITE_TYPES.CLI_PROXY_API ||
        ref.kind !== "channel" ||
        ref.scopeKey !== cliProxyApiScope(config)
      )
        throw new Error("Invalid resource reference")
      const resource = await getCliProxyApiResource(config, ref.resourceId)
      const keys = cliProxyApiKeys(resource)
      if (keys.length !== 1) throw new Error("Multiple provider credentials")
      return keys[0]
    },
  },
  channelDrafts: {
    prepareFormData: async (source) => {
      const kind =
        source.apiType === API_TYPES.ANTHROPIC
          ? "claude-api-key"
          : source.apiType === API_TYPES.GOOGLE
            ? "gemini-api-key"
            : source.apiType === API_TYPES.OPENAI
              ? "codex-api-key"
              : "openai-compatibility"
      const { models, fetchFailed } =
        kind === "openai-compatibility" || kind === "codex-api-key"
          ? await fetchManagedSiteImportModels(source)
          : { models: [...source.modelHints], fetchFailed: false }
      return {
        name: source.name,
        type: kind,
        key: source.apiKey,
        base_url: importedProviderUrl(source.baseUrl, kind),
        models,
        groups: [],
        priority: 0,
        weight: 1,
        enabled: true,
        ...(fetchFailed ? { modelPrefillFetchFailed: true } : {}),
      }
    },
  },
} satisfies ManagedSiteCapabilities<
  CliProxyApiConfig,
  typeof SITE_TYPES.CLI_PROXY_API
>
