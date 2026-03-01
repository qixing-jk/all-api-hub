import { RuntimeActionIds } from "~/constants/runtimeActions"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { fetchAnthropicModelIds } from "~/services/apiService/anthropic"
import { fetchGoogleModelIds } from "~/services/apiService/google"
import { fetchOpenAICompatibleModelIds } from "~/services/apiService/openaiCompatible"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import {
  API_TYPES,
  runApiVerificationProbe,
  type ApiVerificationApiType,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import {
  inferHttpStatus,
  summaryKeyFromHttpStatus,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import { createLogger } from "~/utils/logger"
import { isUrlAllowedByRegexList } from "~/utils/redemptionAssistWhitelist"
import {
  normalizeApiCheckBaseUrl,
  normalizeGoogleFamilyBaseUrl,
  normalizeOpenAiFamilyBaseUrl,
} from "~/utils/webAiApiCheck"

import type {
  ApiCheckFetchModelsResponse,
  ApiCheckRunProbeResponse,
  ApiCheckRuntimeRequest,
  ApiCheckSaveProfileResponse,
  ApiCheckShouldPromptResponse,
} from "./types"

/**
 * Unified logger scoped to Web AI API Check background handlers.
 */
const logger = createLogger("WebAiApiCheck")

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
        enabled: false,
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
  apiType: ApiVerificationApiType
  normalizedBaseUrl: string
  pageUrl?: string
}): string {
  const { apiType, normalizedBaseUrl, pageUrl } = params

  const label =
    apiType === API_TYPES.OPENAI_COMPATIBLE ? "OpenAI-compatible" : apiType

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
    return `${hostname} (${label})`
  }

  return `API Profile (${label})`
}

/**
 * Message handler for ApiCheck runtime actions.
 * Centralizes background decision logic and sanitizes all outputs.
 */
export async function handleWebAiApiCheckMessage(
  request: ApiCheckRuntimeRequest,
  sendResponse: (response: unknown) => void,
) {
  try {
    switch (request.action) {
      case RuntimeActionIds.ApiCheckShouldPrompt: {
        const { pageUrl } = request
        if (!pageUrl?.trim()) {
          const response: ApiCheckShouldPromptResponse = {
            success: false,
            error: "Missing pageUrl",
          }
          sendResponse(response)
          return
        }

        const prefs = await userPreferences.getPreferences()
        const config = getWebAiApiCheckPreferences(prefs)
        const patterns = config.autoDetect?.urlWhitelist?.patterns ?? []
        const shouldPrompt =
          config.enabled &&
          !!config.autoDetect?.enabled &&
          isUrlAllowedByRegexList(pageUrl, patterns)

        const response: ApiCheckShouldPromptResponse = {
          success: true,
          shouldPrompt,
        }
        sendResponse(response)
        return
      }

      case RuntimeActionIds.ApiCheckFetchModels: {
        const { apiType, baseUrl, apiKey } = request

        if (!apiType || !baseUrl?.trim() || !apiKey?.trim()) {
          const response: ApiCheckFetchModelsResponse = {
            success: false,
            error: "Missing apiType, baseUrl, or apiKey",
          }
          sendResponse(response)
          return
        }

        const normalizedBaseUrl = normalizeProbeBaseUrl({ apiType, baseUrl })
        if (!normalizedBaseUrl) {
          const response: ApiCheckFetchModelsResponse = {
            success: false,
            error: "Invalid baseUrl",
          }
          sendResponse(response)
          return
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
          const response: ApiCheckFetchModelsResponse = {
            success: true,
            modelIds,
          }
          sendResponse(response)
          return
        } catch (error) {
          const message = toSanitizedErrorSummary(error, [apiKey])
          logger.error("Failed to fetch models", {
            apiType,
            baseUrl: normalizedBaseUrl,
            message,
          })

          const response: ApiCheckFetchModelsResponse = {
            success: false,
            error: message,
          }
          sendResponse(response)
          return
        }
      }

      case RuntimeActionIds.ApiCheckRunProbe: {
        const { apiType, baseUrl, apiKey, modelId, probeId } = request

        if (!apiType || !baseUrl?.trim() || !apiKey?.trim() || !probeId) {
          const response: ApiCheckRunProbeResponse = {
            success: false,
            error: "Missing apiType, baseUrl, apiKey, or probeId",
          }
          sendResponse(response)
          return
        }

        const normalizedBaseUrl = normalizeProbeBaseUrl({ apiType, baseUrl })
        if (!normalizedBaseUrl) {
          const response: ApiCheckRunProbeResponse = {
            success: false,
            error: "Invalid baseUrl",
          }
          sendResponse(response)
          return
        }

        try {
          const result = await runApiVerificationProbe({
            baseUrl: normalizedBaseUrl,
            apiKey,
            apiType,
            modelId: modelId?.trim() || undefined,
            probeId: probeId as ApiVerificationProbeId,
          })

          const response: ApiCheckRunProbeResponse = { success: true, result }
          sendResponse(response)
          return
        } catch (error) {
          const message = toSanitizedErrorSummary(error, [apiKey])
          const status = inferHttpStatus(error, message)
          const summaryKey = summaryKeyFromHttpStatus(status)

          logger.error("Probe execution failed", {
            apiType,
            probeId,
            baseUrl: normalizedBaseUrl,
            message,
            status,
          })

          const result: ApiVerificationProbeResult = {
            id: probeId as ApiVerificationProbeId,
            status: "fail",
            latencyMs: 0,
            summary: message,
            summaryKey,
            summaryParams: summaryKey ? { status } : undefined,
            input: {
              apiType,
              baseUrl: normalizedBaseUrl,
            },
          }

          const response: ApiCheckRunProbeResponse = { success: true, result }
          sendResponse(response)
          return
        }
      }

      case RuntimeActionIds.ApiCheckSaveProfile: {
        const { apiType, baseUrl, apiKey, name, pageUrl } = request

        if (!apiType || !baseUrl?.trim() || !apiKey?.trim()) {
          const response: ApiCheckSaveProfileResponse = {
            success: false,
            error: "Missing apiType, baseUrl, or apiKey",
          }
          sendResponse(response)
          return
        }

        const normalizedBaseUrl = normalizeProbeBaseUrl({ apiType, baseUrl })
        if (!normalizedBaseUrl) {
          const response: ApiCheckSaveProfileResponse = {
            success: false,
            error: "Invalid baseUrl",
          }
          sendResponse(response)
          return
        }

        const providedName = typeof name === "string" ? name.trim() : ""
        const profileName =
          providedName ||
          buildDefaultProfileName({ apiType, normalizedBaseUrl, pageUrl })

        try {
          const profile = await apiCredentialProfilesStorage.createProfile({
            name: profileName,
            apiType,
            baseUrl: normalizedBaseUrl,
            apiKey,
            tagIds: [],
            notes: "",
          })

          const response: ApiCheckSaveProfileResponse = {
            success: true,
            profileId: profile.id,
            name: profile.name,
            apiType: profile.apiType,
            baseUrl: profile.baseUrl,
          }
          sendResponse(response)
          return
        } catch (error) {
          const message = toSanitizedErrorSummary(error, [apiKey])
          logger.error("Failed to save ApiCheck credentials to profiles", {
            apiType,
            baseUrl: normalizedBaseUrl,
            message,
          })

          const response: ApiCheckSaveProfileResponse = {
            success: false,
            error: message,
          }
          sendResponse(response)
          return
        }
      }

      default:
        sendResponse({ success: false, error: "Unknown action" })
    }
  } catch (error) {
    logger.error("ApiCheck message handling failed", {
      message: toSanitizedErrorSummary(error, []),
    })
    sendResponse({ success: false, error: "Failed to handle request" })
  }
}
