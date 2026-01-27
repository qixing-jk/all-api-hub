import { t } from "i18next"

import { userPreferences } from "~/services/userPreferences"
import { ApiToken, DisplaySiteData } from "~/types"
import { ServiceResponse } from "~/types/serviceResponse"
import { createLogger } from "~/utils/logger"
import { joinUrl } from "~/utils/url"

/**
 * Unified logger scoped to the CLI Proxy integration service.
 */
const logger = createLogger("CliProxyService")

interface OpenAICompatibilityProviderApiKeyEntry {
  "api-key": string
  "proxy-url"?: string
}

interface OpenAICompatibilityProvider {
  name: string
  "base-url": string
  "api-key-entries": OpenAICompatibilityProviderApiKeyEntry[]
  models?: Array<{ name: string; alias?: string }>
  headers?: Record<string, string>
  // Allow extra fields from future versions
  [key: string]: any
}

interface OpenAICompatibilityListResponse {
  "openai-compatibility"?: OpenAICompatibilityProvider[]
  // Some versions may return the array directly
  [key: string]: any
}

/**
 * Compute upstream OpenAI-compatible base URL for a provider.
 * @param account Display account info.
 * @returns Base URL ending with /v1 for OpenAI compatibility.
 */
function getProviderBaseUrl(account: DisplaySiteData): string {
  // Use the OpenAI-compatible /v1 endpoint for the upstream
  return joinUrl(account.baseUrl, "/v1")
}

/**
 * Build human-readable provider name for CLI Proxy.
 * @param account Display account info.
 */
function buildProviderName(account: DisplaySiteData): string {
  return account.name || account.baseUrl
}

/**
 * Read CLI Proxy config from user preferences.
 * @returns Base URL and management key, or null if not configured.
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
 * Fetch existing providers from CLI Proxy management API.
 */
async function fetchProviders(baseUrl: string, managementKey: string) {
  const url = joinUrl(baseUrl, "/openai-compatibility")

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

  const data = (await res.json()) as OpenAICompatibilityListResponse | any[]

  if (Array.isArray(data)) {
    return data as OpenAICompatibilityProvider[]
  }

  const list = data["openai-compatibility"]
  if (Array.isArray(list)) {
    return list as OpenAICompatibilityProvider[]
  }

  return [] as OpenAICompatibilityProvider[]
}

/**
 * Replace providers list via CLI Proxy management API.
 */
async function putProviders(
  baseUrl: string,
  managementKey: string,
  providers: OpenAICompatibilityProvider[],
) {
  const url = joinUrl(baseUrl, "/openai-compatibility")

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
 * Patch a single provider entry by index.
 */
async function patchProviderByIndex(
  baseUrl: string,
  managementKey: string,
  index: number,
  value: OpenAICompatibilityProvider,
) {
  const url = joinUrl(baseUrl, "/openai-compatibility")

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
 * Import an account/token into CLI Proxy as an OpenAI-compatible provider.
 * @param account Display site data (source).
 * @param token API token to register.
 * @returns ServiceResponse with success flag and message.
 */
export interface ImportToCliProxyOptions {
  account: DisplaySiteData
  token: ApiToken
  providerName?: string
  providerBaseUrl?: string
  proxyUrl?: string
  models?: Array<{ name: string; alias?: string }>
}

/**
 * Register or update a provider in CLI Proxy from a site account and token.
 */
export async function importToCliProxy(
  options: ImportToCliProxyOptions,
): Promise<ServiceResponse<void>> {
  try {
    const {
      account,
      token,
      providerName: providerNameOverride,
      providerBaseUrl: providerBaseUrlOverride,
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

    const { baseUrl, managementKey } = config

    const providerBaseUrl =
      providerBaseUrlOverride?.trim() || getProviderBaseUrl(account)
    const providerName =
      providerNameOverride?.trim() || buildProviderName(account)

    const normalizedModels = (() => {
      if (!modelsOverride) return undefined

      const nextModels = modelsOverride
        .map((model) => {
          const name = model.name.trim()
          const alias = model.alias?.trim()
          return {
            name,
            alias: alias || undefined,
          }
        })
        .filter((model) => model.name.length > 0)

      return nextModels.length > 0 ? nextModels : undefined
    })()

    const providers = await fetchProviders(baseUrl, managementKey)

    const apiKeyEntry: OpenAICompatibilityProviderApiKeyEntry = {
      "api-key": token.key,
      "proxy-url": proxyUrlOverride?.trim() || "",
    }

    const existingIndex = providers.findIndex(
      (p) => p["base-url"] === providerBaseUrl || p.name === providerName,
    )

    if (existingIndex >= 0) {
      const existing = providers[existingIndex]
      const existingEntries = existing["api-key-entries"] || []

      const filtered = existingEntries.filter(
        (entry) => entry["api-key"] !== token.key,
      )

      const updatedProvider: OpenAICompatibilityProvider = {
        ...existing,
        name: existing.name || providerName,
        "base-url": providerBaseUrl,
        "api-key-entries": [...filtered, apiKeyEntry],
        ...(normalizedModels ? { models: normalizedModels } : {}),
      }

      await patchProviderByIndex(
        baseUrl,
        managementKey,
        existingIndex,
        updatedProvider,
      )

      return {
        success: true,
        message: t("messages:cliproxy.updateSuccess", {
          name: updatedProvider.name,
        }),
      }
    }

    const newProvider: OpenAICompatibilityProvider = {
      name: providerName,
      "base-url": providerBaseUrl,
      "api-key-entries": [apiKeyEntry],
      models: normalizedModels ?? [],
      headers: {},
    }

    const nextProviders = [...providers, newProvider]

    await putProviders(baseUrl, managementKey, nextProviders)

    return {
      success: true,
      message: t("messages:cliproxy.importSuccess", {
        name: newProvider.name,
      }),
    }
  } catch (error: any) {
    logger.error("Import failed", error)
    return {
      success: false,
      message:
        error?.message ||
        t("messages:cliproxy.importFailed", {
          defaultValue: "Failed to import provider to CLIProxyAPI",
        }),
    }
  }
}
