import { UI_CONSTANTS } from "~/constants/ui"
import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/accountTodayStats"
import { OPENROUTER_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { ApiError } from "~/services/apiTransport/errors"
import { fetchApiData } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum, SiteHealthStatus, type AccountIdentity } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import {
  OPENROUTER_CREDITS_ENDPOINT,
  OPENROUTER_KEY_ENDPOINT,
} from "./constants"
import { OpenRouterManagementKeyRequiredError } from "./errors"
import { createOpenRouterManagementRequest } from "./request"

export * from "./keyManagement"
export * from "./keyManagementSchemas"
export { createOpenRouterManagementRequest } from "./request"

const logger = createLogger("ApiService.OpenRouter")

// OpenAPI contract: GET /key uses a Bearer Management Key and returns
// `data.is_management_key`; `creator_user_id` is nullable current-key metadata.
// https://github.com/OpenRouterTeam/docs/blob/main/openapi/openapi.yaml
type OpenRouterKeyData = {
  is_management_key?: unknown
  creator_user_id?: unknown
}

type OpenRouterCreditsData = {
  total_credits?: unknown
  total_usage?: unknown
}

type OpenRouterManagementKeyValidationInput = {
  accessToken: string
  signal?: AbortSignal
}

export type OpenRouterManagementKeyValidation = {
  userId?: AccountIdentity
}

const createInvalidResponseError = (endpoint: string): ApiError =>
  new ApiError(
    t("messages:errors.api.invalidResponseFormat"),
    undefined,
    endpoint,
  )

const createCredentialRequest = (
  input: OpenRouterManagementKeyValidationInput,
): ApiServiceRequest =>
  createOpenRouterManagementRequest({
    baseUrl: OPENROUTER_API_BASE_URL,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken:
        typeof input.accessToken === "string" ? input.accessToken : "",
    },
    abortSignal: input.signal,
  })

const createAccountRequest = (request: ApiServiceRequest): ApiServiceRequest =>
  createOpenRouterManagementRequest(request)

/**
 * Keeps refresh health classification while removing upstream error details.
 * OpenRouter may echo credential-sensitive text in top-level API messages.
 */
const sanitizeRefreshError = (error: unknown): Error => {
  if (error instanceof ApiError) {
    return new ApiError(
      t("account:healthStatus.apiError"),
      error.statusCode,
      undefined,
      error.code,
    )
  }

  if (error instanceof TypeError && error.message.includes("fetch")) {
    return new TypeError("fetch")
  }

  return new Error(t("account:healthStatus.unknownError"))
}

/** Validates that a credential is an active OpenRouter management key. */
export async function validateManagementKey(
  input: OpenRouterManagementKeyValidationInput,
): Promise<OpenRouterManagementKeyValidation> {
  const request = createCredentialRequest(input)

  const data = await fetchApiData<OpenRouterKeyData>(request, {
    endpoint: OPENROUTER_KEY_ENDPOINT,
    options: { method: "GET", cache: "no-store" },
    tempWindowFallback: { statusCodes: [], codes: [] },
  })

  if (!data || typeof data !== "object") {
    throw createInvalidResponseError(OPENROUTER_KEY_ENDPOINT)
  }
  if (typeof data.is_management_key !== "boolean") {
    throw createInvalidResponseError(OPENROUTER_KEY_ENDPOINT)
  }
  if (!data.is_management_key) {
    throw new OpenRouterManagementKeyRequiredError()
  }

  if (data.creator_user_id == null) return {}
  if (typeof data.creator_user_id !== "string") {
    throw createInvalidResponseError(OPENROUTER_KEY_ENDPOINT)
  }

  const userId = data.creator_user_id.trim()
  return userId ? { userId } : {}
}

const fetchCredits = async (
  request: ApiServiceAccountRequest,
): Promise<OpenRouterCreditsData> => {
  const canonicalRequest = createAccountRequest(request)

  return await fetchApiData<OpenRouterCreditsData>(canonicalRequest, {
    endpoint: OPENROUTER_CREDITS_ENDPOINT,
    options: { method: "GET", cache: "no-store" },
    tempWindowFallback: { statusCodes: [], codes: [] },
  })
}

const normalizeCredits = (
  data: OpenRouterCreditsData,
): Pick<AccountData, "quota"> => {
  const { total_credits: totalCredits, total_usage: totalUsage } = data ?? {}
  if (
    typeof totalCredits !== "number" ||
    !Number.isFinite(totalCredits) ||
    typeof totalUsage !== "number" ||
    !Number.isFinite(totalUsage)
  ) {
    throw createInvalidResponseError(OPENROUTER_CREDITS_ENDPOINT)
  }

  // OpenRouter OpenAPI: https://github.com/OpenRouterTeam/docs/blob/main/openapi/openapi.yaml
  // `/credits` requires a Management Key and reports cumulative purchased USD
  // (`total_credits`) and used USD (`total_usage`).
  const remainingUsd = totalCredits - totalUsage
  if (!Number.isFinite(remainingUsd)) {
    throw createInvalidResponseError(OPENROUTER_CREDITS_ENDPOINT)
  }

  const quota = Math.round(
    remainingUsd * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
  )
  if (!Number.isFinite(quota)) {
    throw createInvalidResponseError(OPENROUTER_CREDITS_ENDPOINT)
  }

  return { quota }
}

/** Fetches and normalizes the OpenRouter credits balance. */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const credits = normalizeCredits(await fetchCredits(request))

  return {
    ...credits,
    today_quota_consumption: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_requests_count: 0,
    today_income: 0,
    todayStatsAvailability: createUnsupportedTodayStatsAvailability(),
    checkIn: request.checkIn,
  }
}

/** Refreshes OpenRouter credits and maps failures to account health. */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  try {
    const data = await fetchAccountData(request)
    return {
      success: true,
      data,
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: t("account:healthStatus.normal"),
      },
    }
  } catch (error) {
    logger.error("Failed to refresh OpenRouter account data")
    return {
      success: false,
      healthStatus: determineHealthStatus(sanitizeRefreshError(error)),
    }
  }
}
