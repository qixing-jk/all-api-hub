import { t } from "i18next"

import type { ApiToken, DisplaySiteData } from "~/types"
import type { ServiceResponse } from "~/types/serviceResponse"
import { joinUrl } from "~/utils/url"

interface ClaudeCodeRouterProvider {
  name: string
  api_base_url: string
  api_key: string
  models: string[]
  transformer?: any
  [key: string]: any
}

interface ClaudeCodeRouterConfig {
  Providers?: ClaudeCodeRouterProvider[]
  [key: string]: any
}

/**
 * Build request headers for Claude Code Router admin API calls.
 * When an API key is present, uses `Authorization: Bearer <APIKEY>`.
 */
function buildHeaders(
  apiKey: string | undefined,
  extra?: Record<string, string>,
) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...extra,
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  return headers
}

/**
 * Fetch current Claude Code Router config via `GET /api/config`.
 */
async function fetchConfig(baseUrl: string, apiKey: string | undefined) {
  const url = joinUrl(baseUrl, "/api/config")

  const res = await fetch(url, {
    method: "GET",
    headers: buildHeaders(apiKey),
  })

  if (!res.ok) {
    throw new Error(`Claude Code Router API request failed: ${res.status}`)
  }

  return (await res.json()) as ClaudeCodeRouterConfig
}

/**
 * Persist Claude Code Router config via `POST /api/config`.
 * The router expects the full configuration object (including `Providers`).
 */
async function saveConfig(
  baseUrl: string,
  apiKey: string | undefined,
  config: any,
) {
  const url = joinUrl(baseUrl, "/api/config")

  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify(config),
  })

  if (!res.ok) {
    throw new Error(`Claude Code Router API save failed: ${res.status}`)
  }

  return (await res.json()) as any
}

/**
 * Restart Claude Code Router service via `POST /api/restart`.
 * Some deployments require a restart for config changes to take effect.
 */
async function restartService(baseUrl: string, apiKey: string | undefined) {
  const url = joinUrl(baseUrl, "/api/restart")

  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(apiKey),
  })

  if (!res.ok) {
    throw new Error(`Claude Code Router restart failed: ${res.status}`)
  }

  return (await res.json()) as any
}

/**
 * Import a token into Claude Code Router by creating/updating a provider entry.
 *
 * Behavior:
 * - Reads existing config (`GET /api/config`).
 * - Upserts a provider matching `name` , `api_base_url` and `api_key`.
 * - Writes updated config (`POST /api/config`).
 * - Optionally restarts the router (`POST /api/restart`).
 */
export async function importToClaudeCodeRouter(options: {
  account: DisplaySiteData
  token: ApiToken
  routerBaseUrl: string
  routerApiKey?: string
  providerName: string
  providerApiBaseUrl: string
  providerModels: string[]
  restartAfterSave?: boolean
}): Promise<ServiceResponse<void>> {
  try {
    const baseUrl = options.routerBaseUrl
    const apiKey = options.routerApiKey

    // Validate required inputs
    if (!baseUrl) {
      return {
        success: false,
        message: t("messages:claudeCodeRouter.configMissing"),
      }
    }

    // Validate provider models
    const models = (options.providerModels || [])
      .map((m) => m.trim())
      .filter(Boolean)

    if (models.length === 0) {
      return {
        success: false,
        message: t("messages:claudeCodeRouter.modelsMissing"),
      }
    }

    // Fetch current config
    const config = await fetchConfig(baseUrl, apiKey)
    const providers: ClaudeCodeRouterProvider[] = Array.isArray(
      config.Providers,
    )
      ? [...config.Providers]
      : []

    // Prepare provider data
    const providerName = options.providerName.trim()
    const providerApiBaseUrl = options.providerApiBaseUrl.trim()

    const newProvider: ClaudeCodeRouterProvider = {
      name: providerName,
      api_base_url: providerApiBaseUrl,
      api_key: options.token.key,
      models,
    }

    // Find existing provider by name, api_base_url, and api_key
    const existingIndex = providers.findIndex(
      (p) =>
        p.name === providerName &&
        p.api_base_url === providerApiBaseUrl &&
        p.api_key === options.token.key,
    )

    // Update existing provider
    if (existingIndex >= 0) {
      providers[existingIndex] = {
        ...providers[existingIndex],
        ...newProvider,
      }
      await saveConfig(baseUrl, apiKey, {
        ...config,
        Providers: providers,
      })

      if (options.restartAfterSave) {
        await restartService(baseUrl, apiKey)
      }

      return {
        success: true,
        message: t("messages:claudeCodeRouter.updateSuccess", {
          name: providerName,
        }),
      }
    }

    // Add new provider
    const nextProviders = [...providers, newProvider]

    await saveConfig(baseUrl, apiKey, {
      ...config,
      Providers: nextProviders,
    })

    if (options.restartAfterSave) {
      await restartService(baseUrl, apiKey)
    }

    return {
      success: true,
      message: t("messages:claudeCodeRouter.importSuccess", {
        name: providerName,
      }),
    }
  } catch (error: any) {
    console.error("[ClaudeCodeRouter] Import failed", error)
    return {
      success: false,
      message: error?.message || t("messages:claudeCodeRouter.importFailed"),
    }
  }
}
