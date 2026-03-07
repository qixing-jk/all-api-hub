import { t } from "i18next"

import { userPreferences } from "~/services/preferences/userPreferences"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import type { ApiToken, DisplaySiteData } from "~/types"
import type { ServiceResponse } from "~/types/serviceResponse"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { joinUrl } from "~/utils/core/url"

import {
  buildDefaultCliProxyProviderBaseUrl,
  CLI_PROXY_PROVIDER_TYPES,
  getCliProxyProviderDisplayName,
  mapApiTypeHintToCliProxyProviderType,
  normalizeCliProxyProviderBaseUrl,
  type CliProxyModelMapping,
  type CliProxyProviderType,
} from "./cliProxyProviderTypes"

const logger = createLogger("CliProxyService")

type CliProxyOpenAICompatibilityProviderApiKeyEntry = {
  "api-key": string
  "proxy-url"?: string
}

type CliProxyOpenAICompatibilityProvider = {
  name: string
  "base-url": string
  "api-key-entries": CliProxyOpenAICompatibilityProviderApiKeyEntry[]
  models?: CliProxyModelMapping[]
  headers?: Record<string, string>
  [key: string]: unknown
}

type CliProxyAPIKeyProvider = {
  "api-key": string
  "base-url": string
  "proxy-url": string
  models?: CliProxyModelMapping[]
  headers?: Record<string, string>
  "excluded-models"?: string[]
  [key: string]: unknown
}

type CliProxyManagedProvider =
  | CliProxyAPIKeyProvider
  | CliProxyOpenAICompatibilityProvider

type CliProxyProviderListResponse<TProvider> = Record<string, TProvider[]>

/**
 * build a provider name from account data, falling back to baseUrl if name is not available
 */
function buildProviderName(account: DisplaySiteData) {
  return account.name || account.baseUrl
}

/**
 * Retrieves CLI Proxy configuration from user preferences.
 */
async function getCliProxyConfig() {
  const prefs = await userPreferences.getPreferences()
  const { cliProxy } = prefs

  if (!cliProxy || !cliProxy.baseUrl || !cliProxy.managementKey) {
    return null
  }

  return {
    baseUrl: cliProxy.baseUrl.trim(),
    managementKey: cliProxy.managementKey.trim(),
  }
}

/**
 * Fetches the list of providers of a given type from the CLI Proxy Management API.
 */
async function fetchProviders<TProvider extends Record<string, unknown>>(
  baseUrl: string,
  managementKey: string,
  providerType: CliProxyProviderType,
) {
  const url = joinUrl(baseUrl, `/${providerType}`)

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
    },
  })

  if (!res.ok) {
    throw new Error(`CLIProxy Management API request failed: ${res.status}`)
  }

  const data = (await res.json()) as
    | CliProxyProviderListResponse<TProvider>
    | TProvider[]

  if (Array.isArray(data)) {
    return data
  }

  const list = data[providerType]
  return Array.isArray(list) ? list : ([] as TProvider[])
}

/**
 * Replaces the entire list of providers of a given type in the CLI Proxy Management API.
 */
async function putProviders<TProvider extends Record<string, unknown>>(
  baseUrl: string,
  managementKey: string,
  providerType: CliProxyProviderType,
  providers: TProvider[],
) {
  const url = joinUrl(baseUrl, `/${providerType}`)

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(providers),
  })

  if (!res.ok) {
    throw new Error(`CLIProxy Management API PUT failed: ${res.status}`)
  }
}

/**
 * Updates a single provider at the specified index for a given type in the CLI Proxy Management API.
 */
async function patchProviderByIndex<TProvider extends Record<string, unknown>>(
  baseUrl: string,
  managementKey: string,
  providerType: CliProxyProviderType,
  index: number,
  value: TProvider,
) {
  const url = joinUrl(baseUrl, `/${providerType}`)

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ index, value }),
  })

  if (!res.ok) {
    throw new Error(`CLIProxy Management API PATCH failed: ${res.status}`)
  }
}

/**
 * Normalizes model mapping entries by trimming whitespace and filtering out invalid entries.
 */
function normalizeModelMappings(models?: CliProxyModelMapping[]) {
  if (models === undefined) return undefined

  const normalizedModels = models
    .map((model) => {
      const name = model.name.trim()
      const alias = model.alias?.trim()
      return {
        name,
        alias: alias || undefined,
      }
    })
    .filter((model) => model.name.length > 0)

  return normalizedModels
}

/**
 * Builds a provider draft for an OpenAI-compatibility provider type based on the given options.
 */
function buildOpenAICompatibilityProviderDraft(options: {
  providerBaseUrl: string
  providerName: string
  proxyUrl: string
  token: ApiToken
  models?: CliProxyModelMapping[]
}): CliProxyOpenAICompatibilityProvider {
  const { providerBaseUrl, providerName, proxyUrl, token, models } = options

  return {
    name: providerName,
    "base-url": providerBaseUrl,
    "api-key-entries": [
      {
        "api-key": token.key,
        "proxy-url": proxyUrl,
      },
    ],
    ...(models !== undefined ? { models } : {}),
    headers: {},
  }
}

/**
 * Builds a provider draft for an API key-based provider type based on the given options.
 */
function buildAPIKeyProviderDraft(options: {
  providerBaseUrl: string
  proxyUrl: string
  token: ApiToken
  models?: CliProxyModelMapping[]
}): CliProxyAPIKeyProvider {
  const { providerBaseUrl, proxyUrl, token, models } = options

  return {
    "api-key": token.key,
    "base-url": providerBaseUrl,
    "proxy-url": proxyUrl,
    ...(models !== undefined ? { models } : {}),
    headers: {},
  }
}

/**
 * Finds the index of an existing OpenAI-compatibility provider that matches the given draft based on base URL or name.
 */
function findExistingOpenAICompatibilityProviderIndex(
  providers: CliProxyOpenAICompatibilityProvider[],
  draft: CliProxyOpenAICompatibilityProvider,
) {
  const normalizedBaseUrl = normalizeCliProxyProviderBaseUrl(
    CLI_PROXY_PROVIDER_TYPES.OPENAI_COMPATIBILITY,
    draft["base-url"],
  )

  const baseUrlMatch = providers.findIndex((provider) => {
    return (
      normalizeCliProxyProviderBaseUrl(
        CLI_PROXY_PROVIDER_TYPES.OPENAI_COMPATIBILITY,
        provider["base-url"],
      ) === normalizedBaseUrl
    )
  })

  if (baseUrlMatch >= 0) {
    return baseUrlMatch
  }

  const normalizedName = draft.name.trim().toLowerCase()
  if (!normalizedName) {
    return -1
  }

  return providers.findIndex((provider) => {
    return provider.name.trim().toLowerCase() === normalizedName
  })
}

/**
 * Finds the index of an existing API key-based provider that matches the given draft based on API key and optionally base URL.
 */
function findExistingAPIKeyProviderIndex(
  providerType: Exclude<
    CliProxyProviderType,
    typeof CLI_PROXY_PROVIDER_TYPES.OPENAI_COMPATIBILITY
  >,
  providers: CliProxyAPIKeyProvider[],
  draft: CliProxyAPIKeyProvider,
) {
  const apiKey = draft["api-key"].trim()
  const normalizedBaseUrl = normalizeCliProxyProviderBaseUrl(
    providerType,
    draft["base-url"],
  )

  const matchByApiKeyAndBaseUrl = providers.findIndex((provider) => {
    if (provider["api-key"] !== apiKey) {
      return false
    }

    if (!normalizedBaseUrl) {
      return true
    }

    return (
      normalizeCliProxyProviderBaseUrl(providerType, provider["base-url"]) ===
      normalizedBaseUrl
    )
  })

  if (matchByApiKeyAndBaseUrl >= 0) {
    return matchByApiKeyAndBaseUrl
  }

  if (
    !normalizedBaseUrl ||
    providerType === CLI_PROXY_PROVIDER_TYPES.CODEX_API_KEY
  ) {
    return providers.findIndex((provider) => provider["api-key"] === apiKey)
  }

  return -1
}

/**
 * Merges an existing OpenAI-compatibility provider with a new draft, updating fields and preserving existing API key entries that don't match the new draft's API key.
 */
function mergeOpenAICompatibilityProvider(
  existing: CliProxyOpenAICompatibilityProvider,
  draft: CliProxyOpenAICompatibilityProvider,
  nextModels?: CliProxyModelMapping[],
) {
  const existingEntries = Array.isArray(existing["api-key-entries"])
    ? existing["api-key-entries"]
    : []

  const nextApiKey = draft["api-key-entries"][0]
  const nextEntries = [
    ...existingEntries.filter(
      (entry) => entry["api-key"] !== nextApiKey["api-key"],
    ),
    nextApiKey,
  ]

  return {
    ...existing,
    name: draft.name || existing.name,
    "base-url": draft["base-url"],
    "api-key-entries": nextEntries,
    ...(nextModels !== undefined
      ? { models: nextModels }
      : existing.models !== undefined
        ? { models: existing.models }
        : {}),
  }
}

/**
 * Merges an existing API key-based provider with a new draft, updating fields and optionally replacing the models list if nextModels is provided.
 */
function mergeAPIKeyProvider(
  existing: CliProxyAPIKeyProvider,
  draft: CliProxyAPIKeyProvider,
  nextModels?: CliProxyModelMapping[],
) {
  return {
    ...existing,
    "api-key": draft["api-key"],
    "base-url": draft["base-url"],
    "proxy-url": draft["proxy-url"],
    ...(nextModels !== undefined
      ? { models: nextModels }
      : existing.models !== undefined
        ? { models: existing.models }
        : {}),
  }
}

/**
 * Replaces a provider at the specified index in the providers list with a new provider, returning a new array.
 */
function replaceProviderAtIndex<TProvider>(
  providers: TProvider[],
  index: number,
  provider: TProvider,
) {
  return providers.map((item, currentIndex) => {
    return currentIndex === index ? provider : item
  })
}

/**
 * Gets a display name for a provider based on its type and relevant fields, using i18n for localization.
 */
function getProviderDisplayName(
  providerType: CliProxyProviderType,
  provider: CliProxyManagedProvider,
) {
  if (providerType === CLI_PROXY_PROVIDER_TYPES.OPENAI_COMPATIBILITY) {
    const openAIProvider = provider as CliProxyOpenAICompatibilityProvider
    return getCliProxyProviderDisplayName(
      providerType,
      {
        providerBaseUrl: openAIProvider["base-url"],
        providerName: openAIProvider.name,
      },
      (key) => t(key),
    )
  }

  const apiKeyProvider = provider as CliProxyAPIKeyProvider
  return getCliProxyProviderDisplayName(
    providerType,
    {
      providerBaseUrl: apiKeyProvider["base-url"],
    },
    (key) => t(key),
  )
}

/**
 * Determines whether to use a PUT (full replacement) instead of PATCH (partial update) when updating a matched provider, based on the provider type and presence of nextModels. For Gemini API key providers, if nextModels is provided, we use PUT to ensure the models list is fully replaced rather than merged.
 */
function shouldPutMatchedProviderUpdate(
  providerType: CliProxyProviderType,
  nextModels?: CliProxyModelMapping[],
) {
  return (
    providerType === CLI_PROXY_PROVIDER_TYPES.GEMINI_API_KEY &&
    nextModels !== undefined
  )
}

/**
 * Resolves the provider type to use for the CLI Proxy import based on the given options, preferring an explicit providerType if provided, and falling back to mapping from apiTypeHint if not.
 */
function resolveProviderType(options: ImportToCliProxyOptions) {
  return (
    options.providerType ??
    mapApiTypeHintToCliProxyProviderType(options.apiTypeHint)
  )
}

/**
 * Resolves the provider base URL to use for the CLI Proxy import based on the given options and provider type, normalizing any provided base URL and falling back to defaults based on provider type and account data if not provided or invalid. For API key-based providers, if no valid base URL is provided, we return an empty string to allow the CLI Proxy to apply its own defaults, which may be necessary for certain provider types that have specific expected base URLs.
 */
function resolveProviderBaseUrl(
  providerType: CliProxyProviderType,
  options: ImportToCliProxyOptions,
) {
  const normalizedBaseUrl = normalizeCliProxyProviderBaseUrl(
    providerType,
    options.providerBaseUrl,
  )

  if (normalizedBaseUrl) {
    return normalizedBaseUrl
  }

  if (
    providerType === CLI_PROXY_PROVIDER_TYPES.CLAUDE_API_KEY ||
    providerType === CLI_PROXY_PROVIDER_TYPES.GEMINI_API_KEY
  ) {
    return ""
  }

  return buildDefaultCliProxyProviderBaseUrl(providerType, options.account)
}

export interface ImportToCliProxyOptions {
  account: DisplaySiteData
  token: ApiToken
  providerType?: CliProxyProviderType
  apiTypeHint?: ApiVerificationApiType
  providerName?: string
  providerBaseUrl?: string
  proxyUrl?: string
  models?: CliProxyModelMapping[]
}

/**
 * Imports an API credential profile into the CLI Proxy by either creating a new provider or updating an existing one that matches based on API key and optionally base URL or name. The function handles both OpenAI-compatibility providers and API key-based providers, normalizes model mappings, and provides user feedback through success or error messages.
 */
export async function importToCliProxy(
  options: ImportToCliProxyOptions,
): Promise<ServiceResponse<void>> {
  try {
    const {
      account,
      token,
      providerName: providerNameOverride,
      proxyUrl: proxyUrlOverride,
      models: modelsOverride,
    } = options

    const config = await getCliProxyConfig()
    if (!config) {
      return {
        success: false,
        message: t("messages:cliproxy.configMissing"),
      }
    }

    const providerType = resolveProviderType(options)
    const normalizedModels = normalizeModelMappings(modelsOverride)
    const proxyUrl = proxyUrlOverride?.trim() || ""
    const providerBaseUrl = resolveProviderBaseUrl(providerType, options)
    const providerName =
      providerNameOverride?.trim() || buildProviderName(account)
    const { baseUrl, managementKey } = config

    if (providerType === CLI_PROXY_PROVIDER_TYPES.OPENAI_COMPATIBILITY) {
      const providers =
        await fetchProviders<CliProxyOpenAICompatibilityProvider>(
          baseUrl,
          managementKey,
          providerType,
        )

      const draft = buildOpenAICompatibilityProviderDraft({
        providerBaseUrl,
        providerName,
        proxyUrl,
        token,
        models: normalizedModels,
      })

      const existingIndex = findExistingOpenAICompatibilityProviderIndex(
        providers,
        draft,
      )

      if (existingIndex >= 0) {
        const updatedProvider = mergeOpenAICompatibilityProvider(
          providers[existingIndex],
          draft,
          normalizedModels,
        )

        await patchProviderByIndex(
          baseUrl,
          managementKey,
          providerType,
          existingIndex,
          updatedProvider,
        )

        return {
          success: true,
          message: t("messages:cliproxy.updateSuccess", {
            name: getProviderDisplayName(providerType, updatedProvider),
          }),
        }
      }

      await putProviders(baseUrl, managementKey, providerType, [
        ...providers,
        draft,
      ])

      return {
        success: true,
        message: t("messages:cliproxy.importSuccess", {
          name: getProviderDisplayName(providerType, draft),
        }),
      }
    }

    const apiKeyProviderType = providerType as Exclude<
      CliProxyProviderType,
      typeof CLI_PROXY_PROVIDER_TYPES.OPENAI_COMPATIBILITY
    >

    const providers = await fetchProviders<CliProxyAPIKeyProvider>(
      baseUrl,
      managementKey,
      apiKeyProviderType,
    )

    const draft = buildAPIKeyProviderDraft({
      providerBaseUrl,
      proxyUrl,
      token,
      models: normalizedModels,
    })

    const existingIndex = findExistingAPIKeyProviderIndex(
      apiKeyProviderType,
      providers,
      draft,
    )

    if (existingIndex >= 0) {
      const updatedProvider = mergeAPIKeyProvider(
        providers[existingIndex],
        draft,
        normalizedModels,
      )

      if (shouldPutMatchedProviderUpdate(providerType, normalizedModels)) {
        await putProviders(
          baseUrl,
          managementKey,
          apiKeyProviderType,
          replaceProviderAtIndex(providers, existingIndex, updatedProvider),
        )
      } else {
        await patchProviderByIndex(
          baseUrl,
          managementKey,
          apiKeyProviderType,
          existingIndex,
          updatedProvider,
        )
      }

      return {
        success: true,
        message: t("messages:cliproxy.updateSuccess", {
          name: getProviderDisplayName(providerType, updatedProvider),
        }),
      }
    }

    await putProviders(baseUrl, managementKey, apiKeyProviderType, [
      ...providers,
      draft,
    ])

    return {
      success: true,
      message: t("messages:cliproxy.importSuccess", {
        name: getProviderDisplayName(providerType, draft),
      }),
    }
  } catch (error: unknown) {
    logger.error("Import failed", error)
    return {
      success: false,
      message: getErrorMessage(error) || t("messages:cliproxy.importFailed"),
    }
  }
}
