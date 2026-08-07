import { UI_CONSTANTS } from "~/constants/ui"
import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/accountTodayStats"
import { ORCAROUTER_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { SiteHealthStatus } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("ApiService.OrcaRouter")

const ORCAROUTER_SUBSCRIPTION_ENDPOINT = "/dashboard/billing/subscription"
const ORCAROUTER_USAGE_ENDPOINT = "/dashboard/billing/usage"

// OrcaRouter exposes OpenAI-compatible billing endpoints that return a bare
// JSON body (no `{ data: ... }` envelope), so this adapter uses `fetchApi`
// with the raw-JSON path instead of `fetchApiData`.
type OrcaRouterSubscriptionData = {
  hard_limit_usd?: unknown
}

type OrcaRouterUsageData = {
  total_usage?: unknown
}

const createInvalidResponseError = (endpoint: string): ApiError =>
  new ApiError(
    t("messages:errors.api.invalidResponseFormat"),
    undefined,
    endpoint,
  )

const createAccountRequest = <Request extends ApiServiceRequest>(
  request: Request,
): Request =>
  ({
    ...request,
    baseUrl: ORCAROUTER_API_BASE_URL,
    auth: {
      ...request.auth,
      accessToken: request.auth.accessToken?.trim(),
      userId: undefined,
    },
  }) as Request

const requireAccessToken = (
  request: ApiServiceRequest,
  endpoint: string,
): void => {
  if (request.auth.accessToken?.trim()) return

  throw new ApiError(
    "OrcaRouter API key is required",
    401,
    endpoint,
    API_ERROR_CODES.HTTP_401,
  )
}

const fetchSubscription = async (
  request: ApiServiceRequest,
): Promise<OrcaRouterSubscriptionData> => {
  const canonicalRequest = createAccountRequest(request)
  requireAccessToken(canonicalRequest, ORCAROUTER_SUBSCRIPTION_ENDPOINT)

  return await fetchApi<OrcaRouterSubscriptionData>(
    canonicalRequest,
    {
      endpoint: ORCAROUTER_SUBSCRIPTION_ENDPOINT,
      options: { method: "GET", cache: "no-store" },
      tempWindowFallback: { statusCodes: [], codes: [] },
    },
    true,
  )
}

const fetchUsage = async (
  request: ApiServiceRequest,
): Promise<OrcaRouterUsageData> => {
  const canonicalRequest = createAccountRequest(request)
  requireAccessToken(canonicalRequest, ORCAROUTER_USAGE_ENDPOINT)

  const now = new Date()
  const start = `${now.getFullYear()}-01-01`
  const end = now.toISOString().slice(0, 10)

  return await fetchApi<OrcaRouterUsageData>(
    canonicalRequest,
    {
      endpoint: `${ORCAROUTER_USAGE_ENDPOINT}?start_date=${start}&end_date=${end}`,
      options: { method: "GET", cache: "no-store" },
      tempWindowFallback: { statusCodes: [], codes: [] },
    },
    true,
  )
}

const normalizeBilling = (
  subscription: OrcaRouterSubscriptionData,
  usage: OrcaRouterUsageData,
): Pick<AccountData, "quota"> => {
  const hardLimit = subscription?.hard_limit_usd
  const totalUsage = usage?.total_usage

  if (
    typeof hardLimit !== "number" ||
    !Number.isFinite(hardLimit) ||
    typeof totalUsage !== "number" ||
    !Number.isFinite(totalUsage)
  ) {
    throw createInvalidResponseError(ORCAROUTER_SUBSCRIPTION_ENDPOINT)
  }

  const remainingUsd = hardLimit - totalUsage
  if (!Number.isFinite(remainingUsd)) {
    throw createInvalidResponseError(ORCAROUTER_SUBSCRIPTION_ENDPOINT)
  }

  const quota = Math.round(
    remainingUsd * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
  )
  if (!Number.isFinite(quota)) {
    throw createInvalidResponseError(ORCAROUTER_SUBSCRIPTION_ENDPOINT)
  }

  return { quota }
}

/** Fetches and normalizes the OrcaRouter OpenAI-compatible billing balance. */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const [subscription, usage] = await Promise.all([
    fetchSubscription(request),
    fetchUsage(request),
  ])

  const billing = normalizeBilling(subscription, usage)

  return {
    ...billing,
    today_quota_consumption: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_requests_count: 0,
    today_income: 0,
    todayStatsAvailability: createUnsupportedTodayStatsAvailability(),
    checkIn: {
      ...request.checkIn,
      enableDetection: false,
    },
  }
}

/** Refreshes OrcaRouter billing and maps failures to account health. */
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
    logger.error("Failed to refresh OrcaRouter account data")
    return {
      success: false,
      healthStatus: determineHealthStatus(sanitizeRefreshError(error)),
    }
  }
}

/** Keeps refresh health classification while removing upstream error details. */
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
