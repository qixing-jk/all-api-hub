import { fetchAnthropicModelIds } from "~/services/aiApi/anthropic"
import { fetchGoogleModelIds } from "~/services/aiApi/google"
import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import { resolveProductAnalyticsErrorCategoryFromError } from "~/services/productAnalytics/actions"
import { PRODUCT_ANALYTICS_ERROR_CATEGORIES } from "~/services/productAnalytics/events"
import {
  API_TYPES,
  runApiVerificationProbe,
  type ApiVerificationApiType,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import {
  buildSafeProbeFailureDiagnostics,
  inferStructuredHttpStatus,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import {
  normalizeApiCheckBaseUrl,
  normalizeGoogleFamilyBaseUrl,
  normalizeOpenAiFamilyBaseUrl,
} from "~/services/verification/webAiApiCheck/extractCredentials"
import { createLogger } from "~/utils/core/logger"
import { isUrlAllowedByRegexList } from "~/utils/core/urlWhitelist"

import { onWebAiApiCheckMessage, WebAiApiCheckMessageTypes } from "./messaging"
import type {
  ApiCheckCancelRunProbeRequest,
  ApiCheckCancelRunProbeResponse,
  ApiCheckFetchModelsRequest,
  ApiCheckFetchModelsResponse,
  ApiCheckRunProbeRequest,
  ApiCheckRunProbeResponse,
  ApiCheckSaveProfileRequest,
  ApiCheckSaveProfileResponse,
  ApiCheckShouldPromptRequest,
  ApiCheckShouldPromptResponse,
} from "./types"

/**
 * Unified logger scoped to Web AI API Check background handlers.
 */
const logger = createLogger("WebAiApiCheck")

const activeProbeAbortControllers = new Map<string, AbortController>()

/**
 * Read Web AI API Check preferences with safe defaults.
 */
function getWebAiApiCheckPreferences(
  prefs: UserPreferences,
): NonNullable<UserPreferences["webAiApiCheck"]> {
  return (
    prefs.webAiApiCheck ??
    DEFAULT_PREFERENCES.webAiApiCheck ?? {
      enabled: true,
      contextMenu: {
        enabled: true,
      },
      autoDetect: {
        enabled: true,
        enhanced: { enabled: true },
        urlWhitelist: { patterns: [] },
      },
    }
  )
}

/**
 * Normalize a base URL for probe execution, keeping behavior consistent across api types.
 */
function normalizeProbeBaseUrl(params: {
  apiType: ApiVerificationApiType
  baseUrl: string
}): string | null {
  if (
    params.apiType === API_TYPES.OPENAI_COMPATIBLE ||
    params.apiType === API_TYPES.OPENAI ||
    params.apiType === API_TYPES.ANTHROPIC
  ) {
    return normalizeOpenAiFamilyBaseUrl(params.baseUrl)
  }

  if (params.apiType === API_TYPES.GOOGLE) {
    return normalizeGoogleFamilyBaseUrl(params.baseUrl)
  }

  return normalizeApiCheckBaseUrl(params.baseUrl)
}

/**
 * Builds a stable, user-friendly default profile name for saved credentials.
 */
function buildDefaultProfileName(params: {
  normalizedBaseUrl: string
  pageUrl?: string
}): string {
  const { normalizedBaseUrl, pageUrl } = params

  const hostname =
    (() => {
      try {
        return new URL(normalizedBaseUrl).hostname
      } catch {
        return ""
      }
    })() ||
    (() => {
      try {
        return pageUrl ? new URL(pageUrl).hostname : ""
      } catch {
        return ""
      }
    })()

  if (hostname) {
    return hostname
  }

  return "API Profile"
}

/**
 * Creates the generic failure response used for unexpected handler errors.
 */
function toGenericFailureResponse() {
  return { success: false as const, error: "Failed to handle request" }
}

/**
 * Resolve whether content auto-detection can prompt on the current page.
 */
export async function resolveWebAiApiCheckShouldPromptMessage(
  request: ApiCheckShouldPromptRequest,
): Promise<ApiCheckShouldPromptResponse> {
  try {
    const { pageUrl } = request
    if (!pageUrl?.trim()) {
      return {
        success: false,
        error: "Missing pageUrl",
      }
    }

    const prefs = await userPreferences.getPreferences()
    const config = getWebAiApiCheckPreferences(prefs)
    const patterns = config.autoDetect?.urlWhitelist?.patterns ?? []
    const autoDetectEnabled = config.enabled && !!config.autoDetect?.enabled
    const urlAllowed = isUrlAllowedByRegexList(pageUrl, patterns)
    const shouldPrompt = autoDetectEnabled && urlAllowed
    const enhancedShouldPrompt =
      shouldPrompt && !!config.autoDetect?.enhanced?.enabled

    return {
      success: true,
      shouldPrompt,
      enhancedShouldPrompt,
    }
  } catch (error) {
    logger.error("ApiCheck message handling failed", {
      message: toSanitizedErrorSummary(error, []),
    })
    return toGenericFailureResponse()
  }
}

/**
 * Fetch upstream model IDs for API-check credentials.
 */
export async function resolveWebAiApiCheckFetchModelsMessage(
  request: ApiCheckFetchModelsRequest,
): Promise<ApiCheckFetchModelsResponse> {
  try {
    const { apiType, baseUrl, apiKey } = request

    if (!apiType || !baseUrl?.trim() || !apiKey?.trim()) {
      return {
        success: false,
        error: "Missing apiType, baseUrl, or apiKey",
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      }
    }

    const normalizedBaseUrl = normalizeProbeBaseUrl({ apiType, baseUrl })
    if (!normalizedBaseUrl) {
      return {
        success: false,
        error: "Invalid baseUrl",
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      }
    }

    try {
      const modelIds = await (async () => {
        if (
          apiType === API_TYPES.OPENAI_COMPATIBLE ||
          apiType === API_TYPES.OPENAI
        ) {
          return await fetchOpenAICompatibleModelIds({
            baseUrl: normalizedBaseUrl,
            apiKey,
          })
        }

        if (apiType === API_TYPES.GOOGLE) {
          return await fetchGoogleModelIds({
            baseUrl: normalizedBaseUrl,
            apiKey,
          })
        }

        if (apiType === API_TYPES.ANTHROPIC) {
          return await fetchAnthropicModelIds({
            baseUrl: normalizedBaseUrl,
            apiKey,
          })
        }

        throw new Error("Unsupported apiType")
      })()

      return {
        success: true,
        modelIds,
      }
    } catch (error) {
      const message = toSanitizedErrorSummary(error, [apiKey])
      const status = inferStructuredHttpStatus(error)
      logger.error("Failed to fetch models", {
        apiType,
        baseUrl: normalizedBaseUrl,
        message,
        status,
      })

      return {
        success: false,
        error: message,
        ...(typeof status === "number" ? { errorStatusCode: status } : {}),
      }
    }
  } catch (error) {
    logger.error("ApiCheck message handling failed", {
      message: toSanitizedErrorSummary(error, []),
    })
    return toGenericFailureResponse()
  }
}

/**
 * Run a single API verification probe for API-check credentials.
 */
export async function resolveWebAiApiCheckRunProbeMessage(
  request: ApiCheckRunProbeRequest,
): Promise<ApiCheckRunProbeResponse> {
  try {
    const { runId, apiType, baseUrl, apiKey, modelId, probeId } = request

    if (!apiType || !baseUrl?.trim() || !apiKey?.trim() || !probeId) {
      return {
        success: false,
        error: "Missing apiType, baseUrl, apiKey, or probeId",
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      }
    }

    const normalizedBaseUrl = normalizeProbeBaseUrl({ apiType, baseUrl })
    if (!normalizedBaseUrl) {
      return {
        success: false,
        error: "Invalid baseUrl",
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      }
    }

    try {
      const abortController = runId ? new AbortController() : undefined
      if (runId && abortController) {
        activeProbeAbortControllers.set(runId, abortController)
      }

      const result = await runApiVerificationProbe({
        baseUrl: normalizedBaseUrl,
        apiKey,
        apiType,
        modelId: modelId?.trim() || undefined,
        probeId: probeId as ApiVerificationProbeId,
        abortSignal: abortController?.signal,
      })

      return { success: true, result }
    } catch (error) {
      const message = toSanitizedErrorSummary(error, [apiKey])
      const diagnostics = buildSafeProbeFailureDiagnostics(error, message)

      logger.error("Probe execution failed", {
        apiType,
        probeId,
        baseUrl: normalizedBaseUrl,
        message,
        status: diagnostics.summaryParams?.status,
      })

      const result: ApiVerificationProbeResult = {
        id: probeId as ApiVerificationProbeId,
        status: "fail",
        latencyMs: 0,
        summary: message,
        ...diagnostics,
        input: {
          apiType,
          baseUrl: normalizedBaseUrl,
        },
      }

      return { success: true, result }
    } finally {
      if (runId) {
        activeProbeAbortControllers.delete(runId)
      }
    }
  } catch (error) {
    logger.error("ApiCheck message handling failed", {
      message: toSanitizedErrorSummary(error, []),
    })
    return toGenericFailureResponse()
  }
}

/**
 * Abort a single in-flight API verification probe.
 */
export async function resolveWebAiApiCheckCancelRunProbeMessage(
  request: ApiCheckCancelRunProbeRequest,
): Promise<ApiCheckCancelRunProbeResponse> {
  const runId = request.runId.trim()
  if (!runId) {
    return { success: true, cancelled: false }
  }

  const abortController = activeProbeAbortControllers.get(runId)
  if (!abortController) {
    return { success: true, cancelled: false }
  }

  abortController.abort()
  activeProbeAbortControllers.delete(runId)
  return { success: true, cancelled: true }
}

/**
 * Save API-check credentials as an API credential profile.
 */
export async function resolveWebAiApiCheckSaveProfileMessage(
  request: ApiCheckSaveProfileRequest,
): Promise<ApiCheckSaveProfileResponse> {
  try {
    const { apiType, baseUrl, apiKey, name, pageUrl } = request

    if (!apiType || !baseUrl?.trim() || !apiKey?.trim()) {
      return {
        success: false,
        error: "Missing apiType, baseUrl, or apiKey",
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      }
    }

    const normalizedBaseUrl = normalizeProbeBaseUrl({ apiType, baseUrl })
    if (!normalizedBaseUrl) {
      return {
        success: false,
        error: "Invalid baseUrl",
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      }
    }

    const providedName = typeof name === "string" ? name.trim() : ""
    const profileName =
      providedName || buildDefaultProfileName({ normalizedBaseUrl, pageUrl })

    try {
      const profile = await apiCredentialProfilesStorage.createProfile({
        name: profileName,
        apiType,
        baseUrl: normalizedBaseUrl,
        apiKey,
        tagIds: [],
        notes: "",
      })

      return {
        success: true,
        profileId: profile.id,
        name: profile.name,
        apiType: profile.apiType,
        baseUrl: profile.baseUrl,
      }
    } catch (error) {
      const message = toSanitizedErrorSummary(error, [apiKey])
      logger.error("Failed to save ApiCheck credentials to profiles", {
        apiType,
        baseUrl: normalizedBaseUrl,
        message,
      })

      return {
        success: false,
        error: message,
        errorCategory: resolveProductAnalyticsErrorCategoryFromError(error),
      }
    }
  } catch (error) {
    logger.error("ApiCheck message handling failed", {
      message: toSanitizedErrorSummary(error, []),
    })
    return toGenericFailureResponse()
  }
}

let webAiApiCheckMessagingCleanup: Array<() => void> | null = null

/**
 * Register typed background listeners for Web AI API Check runtime RPCs.
 */
export function setupWebAiApiCheckMessagingListeners() {
  if (webAiApiCheckMessagingCleanup) {
    return
  }

  webAiApiCheckMessagingCleanup = [
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.ShouldPrompt,
      async ({ data }) => resolveWebAiApiCheckShouldPromptMessage(data),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.FetchModels,
      async ({ data }) => resolveWebAiApiCheckFetchModelsMessage(data),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.RunProbe,
      async ({ data }) => resolveWebAiApiCheckRunProbeMessage(data),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.CancelRunProbe,
      async ({ data }) => resolveWebAiApiCheckCancelRunProbeMessage(data),
    ),
    onWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.SaveProfile,
      async ({ data }) => resolveWebAiApiCheckSaveProfileMessage(data),
    ),
  ]
}
