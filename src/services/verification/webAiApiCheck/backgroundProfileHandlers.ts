import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/storage/profiles"
import { resolveProductAnalyticsErrorCategoryFromError } from "~/services/productAnalytics/actions"
import { PRODUCT_ANALYTICS_ERROR_CATEGORIES } from "~/services/productAnalytics/contracts"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { normalizeProbeBaseUrl } from "~/services/verification/webAiApiCheck/credentialExtraction/baseUrlCandidates"
import { isHttpUrl } from "~/utils/core/urlParsing"

import { logger, toGenericFailureResponse } from "./backgroundUtils"
import type {
  ApiCheckSaveProfileRequest,
  ApiCheckSaveProfileResponse,
} from "./types"

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

    const sourceUrl =
      typeof request.sourceUrl === "string" && isHttpUrl(request.sourceUrl)
        ? request.sourceUrl.trim()
        : undefined

    try {
      const profile = await apiCredentialProfilesStorage.createProfile({
        name: profileName,
        apiType,
        baseUrl: normalizedBaseUrl,
        apiKey,
        ...(sourceUrl !== undefined ? { sourceUrl } : {}),
        ...(request.tagIds !== undefined ? { tagIds: request.tagIds } : {}),
        ...(request.notes !== undefined ? { notes: request.notes } : {}),
        ...(request.expiresAt !== undefined
          ? { expiresAt: request.expiresAt }
          : {}),
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
