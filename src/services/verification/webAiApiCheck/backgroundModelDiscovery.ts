import { fetchAnthropicModelIds } from "~/services/aiApi/anthropic"
import { fetchGoogleModelIds } from "~/services/aiApi/google"
import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import { PRODUCT_ANALYTICS_ERROR_CATEGORIES } from "~/services/productAnalytics/contracts"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  inferStructuredHttpStatus,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import { normalizeProbeBaseUrl } from "~/services/verification/webAiApiCheck/credentialExtraction/baseUrlCandidates"

import { logger, toGenericFailureResponse } from "./backgroundUtils"
import type {
  ApiCheckFetchModelsRequest,
  ApiCheckFetchModelsResponse,
} from "./types"

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
