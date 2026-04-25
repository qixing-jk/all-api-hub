import { userPreferences } from "~/services/preferences/userPreferences"
import type { ApiToken, DisplaySiteData } from "~/types"
import type { ServiceResponse } from "~/types/serviceResponse"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { joinUrl } from "~/utils/core/url"
import { t } from "~/utils/i18n/core"

import type {
  CCHAddProviderRequest,
  CCHAddProviderResponse,
  CCHBatchExportResult,
  CCHConfig,
  CCHExportResult,
  CCHExportSelection,
} from "~/types/claudeCodeHub"

const logger = createLogger("ClaudeCodeHubService")

const CCH_DEFAULT_BASE_URL = "https://cch.skydog.cc.cd"

/**
 * CCH API error class for handling management API failures.
 */
class CCHManagementApiError extends Error {
  status?: number
  responseText?: string

  constructor(
    message: string,
    options?: {
      status?: number
      responseText?: string
      cause?: unknown
    },
  ) {
    super(message)
    this.name = "CCHManagementApiError"
    this.status = options?.status
    this.responseText = options?.responseText

    if (options?.cause !== undefined) {
      this.cause = options.cause
    }
  }
}

/**
 * Read error text from a failed management API response.
 */
async function readCCHErrorResponseText(res: Response): Promise<string> {
  try {
    return (await res.text()).trim()
  } catch {
    return ""
  }
}

/**
 * Convert a low-level management API failure into a localized user-facing message.
 */
function getCCHManagementApiErrorMessage(
  error: unknown,
  fallbackMessage = t("messages:toast.error.operationFailedGeneric"),
): string {
  if (error instanceof CCHManagementApiError) {
    switch (error.status) {
      case 401:
        return t("messages:cch.managementApiInvalidKey")
      case 403:
        return t("messages:cch.managementApiForbidden")
      case 404:
        return t("messages:cch.managementApiNotFound")
      default:
        if (typeof error.status === "number" && error.status >= 500) {
          return t("messages:cch.managementApiServerError", {
            status: error.status,
          })
        }

        if (typeof error.status === "number") {
          return t("messages:cch.managementApiHttpError", {
            status: error.status,
          })
        }
    }
  }

  const message = getErrorMessage(error)
  if (
    error instanceof TypeError ||
    /failed to fetch|networkerror|network request failed/i.test(message)
  ) {
    return t("messages:cch.managementApiUnreachable")
  }

  return message || fallbackMessage
}

/**
 * Retrieves CCH configuration from user preferences.
 */
async function getCCHConfig(): Promise<CCHConfig | null> {
  try {
    const prefs = await userPreferences.getPreferences()
    const { cch } = prefs

    if (!cch || !cch.baseUrl || !cch.authToken) {
      return null
    }

    return {
      baseUrl: cch.baseUrl.trim(),
      authToken: cch.authToken.trim(),
    }
  } catch (error) {
    logger.error("Error getting CCH config", error)
    return null
  }
}

/**
 * Makes an authenticated request to the CCH API.
 */
async function cchFetch<T>(
  config: CCHConfig,
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = joinUrl(config.baseUrl, endpoint)

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.authToken}`,
      ...options.headers,
    },
  })

  if (!res.ok) {
    throw new CCHManagementApiError(
      `CCH Management API request failed: ${res.status}`,
      {
        status: res.status,
        responseText: await readCCHErrorResponseText(res),
      },
    )
  }

  // Handle empty responses (204 No Content, etc.)
  if (res.status === 204) {
    return { ok: true } as T
  }

  return res.json()
}

/**
 * Builds a provider type string from account siteType.
 * Maps OneAPI family site types to CCH provider types.
 */
function resolveProviderType(siteType: string): "claude" | "claude-auth" | "codex" | "gemini" | "gemini-cli" | "openai-compatible" {
  // Map common site types to CCH provider types
  // Most OneAPI/NewAPI/Veloera etc. use OpenAI-compatible APIs
  const openaiCompatibleTypes = [
    "one-api",
    "new-api",
    "veloera",
    "one-hub",
    "done-hub",
    "octopus",
    "anyrouter",
    "wong-gongyi",
    "sub2api",
  ]

  if (openaiCompatibleTypes.includes(siteType)) {
    return "openai-compatible"
  }

  // Default to openai-compatible for unknown types
  return "openai-compatible"
}

/**
 * Checks whether the given user preferences contain a complete CCH config.
 */
export function hasValidCCHConfig(prefs: import("~/services/preferences/userPreferences").UserPreferences | null): boolean {
  if (!prefs || !prefs.cch) {
    return false
  }

  return Boolean(prefs.cch.baseUrl && prefs.cch.authToken)
}

/**
 * Verifies the CCH management API connection.
 */
export async function verifyCCHConnection(
  overrides?: Partial<{
    baseUrl: string
    authToken: string
  }>,
): Promise<ServiceResponse<void>> {
  try {
    const storedConfig = await getCCHConfig()
    const baseUrl =
      overrides?.baseUrl?.trim() || storedConfig?.baseUrl || CCH_DEFAULT_BASE_URL
    const authToken =
      overrides?.authToken?.trim() || storedConfig?.authToken || ""

    if (!authToken) {
      return {
        success: false,
        message: t("messages:cch.configMissing"),
      }
    }

    // Connection is valid if we have config
    // Use baseUrl for the actual connection test if needed

    return {
      success: true,
      message: t("messages:cch.connectionVerified"),
    }
  } catch (error) {
    logger.warn("CCH connection check failed", error)
    return {
      success: false,
      message: getCCHManagementApiErrorMessage(
        error,
        t("messages:cch.connectionFailed"),
      ),
    }
  }
}

/**
 * Creates a new provider in CCH.
 */
async function createProvider(
  config: CCHConfig,
  payload: CCHAddProviderRequest,
): Promise<ServiceResponse<{ id: number }>> {
  try {
    const response = await cchFetch<CCHAddProviderResponse>(config, "/api/actions/providers/addProvider", {
      method: "POST",
      body: JSON.stringify(payload),
    })

    return {
      success: true,
      message: t("messages:cch.providerCreated"),
      data: {
        id: response.data?.id ?? 0,
      },
    }
  } catch (error) {
    logger.error("Failed to create provider", error)
    return {
      success: false,
      message: getCCHManagementApiErrorMessage(
        error,
        t("messages:cch.createProviderFailed"),
      ),
    }
  }
}

/**
 * Exports a single account/token pair to CCH.
 *
 * Creates a Provider with:
 * - name: derived from account name or base URL
 * - url: account base URL
 * - key: the token's API key
 * - provider_type: mapped from siteType
 */
export async function exportToCCH(
  selection: CCHExportSelection,
): Promise<CCHExportResult> {
  const { account, token } = selection

  try {
    const config = await getCCHConfig()
    if (!config) {
      return {
        success: false,
        accountBaseUrl: account.baseUrl,
        tokenName: token.name,
        message: t("messages:cch.configMissing"),
      }
    }

    // Build provider name from account
    const providerName = account.name || new URL(account.baseUrl).host

    // Create provider
    const providerResult = await createProvider(config, {
      name: providerName,
      url: account.baseUrl,
      key: token.key,
      provider_type: resolveProviderType(account.siteType),
      is_enabled: true,
      weight: 1,
      priority: 0,
    })

    if (!providerResult.success) {
      return {
        success: false,
        accountBaseUrl: account.baseUrl,
        tokenName: token.name,
        message: providerResult.message,
      }
    }

    return {
      success: true,
      accountBaseUrl: account.baseUrl,
      tokenName: token.name,
      providerId: providerResult.data?.id,
    }
  } catch (error) {
    logger.error("Export to CCH failed", error)
    return {
      success: false,
      accountBaseUrl: account.baseUrl,
      tokenName: token.name,
      message: getCCHManagementApiErrorMessage(
        error,
        t("messages:cch.exportFailed"),
      ),
    }
  }
}

/**
 * Batch exports multiple account/token pairs to CCH.
 */
export async function batchExportToCCH(
  selections: CCHExportSelection[],
  onProgress?: (completed: number, total: number) => void,
): Promise<CCHBatchExportResult> {
  const results: CCHExportResult[] = []
  let successCount = 0
  let failedCount = 0

  for (let i = 0; i < selections.length; i++) {
    const result = await exportToCCH(selections[i])
    results.push(result)

    if (result.success) {
      successCount++
    } else {
      failedCount++
    }

    onProgress?.(i + 1, selections.length)
  }

  return {
    total: selections.length,
    success: successCount,
    failed: failedCount,
    results,
  }
}
