import { CURRENCIES } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import {
  accountBalanceObservation,
  accountBalanceScope,
} from "~/services/accounts/balanceSnapshot"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { OPENROUTER_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { balancePosition } from "~/services/amounts/balance"
import { parseDecimal, subtractDecimal } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_FUNDING,
  BALANCE_NATURES,
  BALANCE_RELATIONS,
  BALANCE_ROLES,
  EVIDENCE_KINDS,
  FINANCIAL_ENUMERATION,
} from "~/services/amounts/financialConstants"
import { ApiError } from "~/services/apiTransport/errors"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum, SiteHealthStatus, type AccountIdentity } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import {
  OPENROUTER_CREDITS_ENDPOINT,
  OPENROUTER_KEY_ENDPOINT,
} from "./constants"
import { OpenRouterManagementKeyRequiredError } from "./errors"
import {
  createOpenRouterManagementRequest,
  openRouterRequests,
} from "./request"

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

type OpenRouterManagementKeyValidation = {
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
    directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
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

  const data = await openRouterRequests.data<OpenRouterKeyData>(request, {
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

  return await openRouterRequests.data<OpenRouterCreditsData>(
    canonicalRequest,
    {
      endpoint: OPENROUTER_CREDITS_ENDPOINT,
      options: { method: "GET", cache: "no-store" },
      tempWindowFallback: { statusCodes: [], codes: [] },
    },
  )
}

const normalizeCredits = (
  data: OpenRouterCreditsData,
  request: ApiServiceAccountRequest,
) => {
  const { total_credits: totalCredits, total_usage: totalUsage } = data ?? {}
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    !("total_credits" in data || "total_usage" in data)
  ) {
    throw createInvalidResponseError(OPENROUTER_CREDITS_ENDPOINT)
  }

  // OpenRouter OpenAPI: https://github.com/OpenRouterTeam/docs/blob/main/openapi/openapi.yaml
  // `/credits` requires a Management Key and reports cumulative purchased USD
  // (`total_credits`) and used USD (`total_usage`).
  const credits = parseDecimal(totalCredits)
  const usage = parseDecimal(totalUsage)
  const scope = accountBalanceScope({
    ...request,
    baseUrl: OPENROUTER_API_BASE_URL,
  })
  const now = Date.now()
  let ledger: string | undefined
  if (credits !== undefined && usage !== undefined) {
    try {
      ledger = subtractDecimal(credits, usage)
    } catch {
      ledger = undefined
    }
  }
  return accountBalanceObservation(
    scope,
    [
      balancePosition({
        id: "ledger",
        collectionKey: "credits",
        scope,
        role: BALANCE_ROLES.Ledger,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        nature: BALANCE_NATURES.Prepaid,
        funding: BALANCE_FUNDING.Purchased,
        value: ledger,
        observedAt: now,
        source: {
          adapter: "openrouter",
          operation: OPENROUTER_CREDITS_ENDPOINT,
          contractVersion: "credits-usd/v1",
          kind: EVIDENCE_KINDS.Derived,
          inputs: ["total_credits", "total_usage"],
          amountInputs: {
            ...(credits === undefined ? {} : { total_credits: credits }),
            ...(usage === undefined ? {} : { total_usage: usage }),
          },
        },
      }),
    ].flatMap((position) => [
      position,
      {
        ...position,
        id: "available",
        parentId: position.id,
        relation: BALANCE_RELATIONS.Summary,
        role: BALANCE_ROLES.Available,
      },
    ]),
    now,
    FINANCIAL_ENUMERATION.Complete,
  )
}

/** Fetches and normalizes the OpenRouter credits balance. */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const credits = normalizeCredits(await fetchCredits(request), request)

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
