import { AIHUBMIX_API_ORIGIN } from "~/constants/siteType"
import { decodeAIHubMixResponseError } from "~/services/apiService/aihubmix/responseError"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchPreparedJsonResponse } from "~/services/apiTransport/requestExecution"
import type {
  ApiResponse,
  ApiServiceRequest,
} from "~/services/apiTransport/type"
import { getErrorMessage } from "~/utils/core/error"
import { joinUrl } from "~/utils/core/url"
import { t } from "~/utils/i18n/core"

export const normalizeAccessToken = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

export const extractAIHubMixData = <T>(body: unknown, endpoint: string): T => {
  if (!body || typeof body !== "object") {
    throw new ApiError(
      t("messages:errors.api.invalidResponseFormat"),
      undefined,
      endpoint,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }

  const response = body as Partial<ApiResponse<T>>
  if (response.success === false) {
    throw new ApiError(
      getErrorMessage(
        typeof response.message === "string" ? response.message : undefined,
        t("messages:errors.api.invalidResponseFormat"),
      ),
      undefined,
      endpoint,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  }

  return ("data" in response ? response.data : body) as T
}

/**
 * Saved accounts use AIHubMix's raw-token API on its canonical origin.
 * Direct execution preserves this protocol; browser-session requests belong
 * to onboarding. https://docs.aihubmix.com/en/api/CliEndpoints/get-self
 */
export const fetchAIHubMixData = async <T>(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
): Promise<T> => {
  const accessToken = normalizeAccessToken(request.auth?.accessToken)
  if (!accessToken) {
    throw new ApiError(
      t("messages:operations.detection.getInfoFailed"),
      401,
      endpoint,
      API_ERROR_CODES.HTTP_401,
    )
  }

  const method = (options.method ?? "GET").toUpperCase()
  const headers = new Headers(options.headers)
  if (!headers.has("Authorization")) {
    // AIHubMix documents raw access-token auth, not `Bearer <token>`.
    headers.set("Authorization", accessToken)
  }
  if (method !== "GET" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetchPreparedJsonResponse(
    { ...request, baseUrl: AIHUBMIX_API_ORIGIN },
    {
      url: joinUrl(AIHUBMIX_API_ORIGIN, endpoint),
      options: { ...options, method, headers, credentials: "omit" },
    },
  )

  if (!response.ok) {
    const providerError = decodeAIHubMixResponseError(response, { endpoint })
    throw new ApiError(
      getErrorMessage(
        providerError?.message,
        t("messages:errors.api.requestFailed", { status: response.status }),
      ),
      response.status,
      endpoint,
    )
  }

  return extractAIHubMixData<T>(response.body, endpoint)
}
