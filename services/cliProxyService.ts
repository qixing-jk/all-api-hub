import { t } from "i18next"

import { userPreferences } from "~/services/userPreferences"
import type { ApiToken, DisplaySiteData, ServiceResponse } from "~/types"
import { joinUrl } from "~/utils/url"

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

function getProviderBaseUrl(account: DisplaySiteData): string {
  // Use the OpenAI-compatible /v1 endpoint for the upstream
  return joinUrl(account.baseUrl, "/v1")
}

function buildProviderName(account: DisplaySiteData): string {
  return account.name || account.baseUrl
}

async function getCliProxyConfig() {
  const prefs = await userPreferences.getPreferences()
  const cliProxy = (prefs as any).cliProxy as
    | { baseUrl?: string; managementKey?: string }
    | undefined

  if (!cliProxy || !cliProxy.baseUrl || !cliProxy.managementKey) {
    return null
  }

  return {
    baseUrl: cliProxy.baseUrl.trim(),
    managementKey: cliProxy.managementKey.trim()
  }
}

async function fetchProviders(baseUrl: string, managementKey: string) {
  const url = joinUrl(baseUrl, "/openai-compatibility")

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json"
    }
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

async function putProviders(
  baseUrl: string,
  managementKey: string,
  providers: OpenAICompatibilityProvider[]
) {
  const url = joinUrl(baseUrl, "/openai-compatibility")

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(providers)
  })

  if (!res.ok) {
    throw new Error(`CLIProxy Management API PUT failed: ${res.status}`)
  }
}

async function patchProviderByIndex(
  baseUrl: string,
  managementKey: string,
  index: number,
  value: OpenAICompatibilityProvider
) {
  const url = joinUrl(baseUrl, "/openai-compatibility")

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ index, value })
  })

  if (!res.ok) {
    throw new Error(`CLIProxy Management API PATCH failed: ${res.status}`)
  }
}

export async function importToCliProxy(
  account: DisplaySiteData,
  token: ApiToken
): Promise<ServiceResponse<void>> {
  try {
    const config = await getCliProxyConfig()

    if (!config) {
      return {
        success: false,
        message: t("messages:cliproxy.configMissing")
      }
    }

    const { baseUrl, managementKey } = config

    const providerBaseUrl = getProviderBaseUrl(account)
    const providerName = buildProviderName(account)

    const providers = await fetchProviders(baseUrl, managementKey)

    const apiKeyEntry: OpenAICompatibilityProviderApiKeyEntry = {
      "api-key": token.key,
      "proxy-url": ""
    }

    const existingIndex = providers.findIndex(
      (p) => p["base-url"] === providerBaseUrl || p.name === providerName
    )

    if (existingIndex >= 0) {
      const existing = providers[existingIndex]
      const existingEntries = existing["api-key-entries"] || []

      const filtered = existingEntries.filter(
        (entry) => entry["api-key"] !== token.key
      )

      const updatedProvider: OpenAICompatibilityProvider = {
        ...existing,
        name: existing.name || providerName,
        "base-url": providerBaseUrl,
        "api-key-entries": [...filtered, apiKeyEntry]
      }

      await patchProviderByIndex(
        baseUrl,
        managementKey,
        existingIndex,
        updatedProvider
      )

      return {
        success: true,
        message: t("messages:cliproxy.updateSuccess", {
          name: updatedProvider.name
        })
      }
    }

    const newProvider: OpenAICompatibilityProvider = {
      name: providerName,
      "base-url": providerBaseUrl,
      "api-key-entries": [apiKeyEntry],
      models: [],
      headers: {}
    }

    const nextProviders = [...providers, newProvider]

    await putProviders(baseUrl, managementKey, nextProviders)

    return {
      success: true,
      message: t("messages:cliproxy.importSuccess", {
        name: newProvider.name
      })
    }
  } catch (error: any) {
    console.error("[CLIProxy] Import failed", error)
    return {
      success: false,
      message:
        error?.message ||
        t("messages:cliproxy.importFailed", {
          defaultValue: "Failed to import provider to CLIProxyAPI"
        })
    }
  }
}
