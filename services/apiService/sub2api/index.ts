/**
 * Sub2API API overrides.
 *
 * Sub2API differs from One-API/New-API backends in that authenticated endpoints
 * live under `/api/v1/*` and require a JWT stored in the dashboard's localStorage.
 *
 * This module plugs into `services/apiService/index.ts` as a site override.
 *
 * Supported capabilities:
 * - Fetch quota from GET `/api/v1/auth/me` using Authorization: Bearer <jwt>
 * - Disable check-in and return zeroed "today" stats (initial support focuses on balance)
 *
 * Security:
 * - Never log JWT values.
 */
import { t } from "i18next"

import { determineHealthStatus } from "~/services/apiService/common"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import type {
  AccountData,
  ApiServiceAccountRequest,
  ApiServiceRequest,
  RefreshAccountResult,
  TodayIncomeData,
  TodayUsageData,
} from "~/services/apiService/common/type"
import { fetchApi } from "~/services/apiService/common/utils"
import { AuthTypeEnum, SiteHealthStatus, type CheckInConfig } from "~/types"
import { createLogger } from "~/utils/logger"

import { parseSub2ApiEnvelope, parseSub2ApiUserIdentity } from "./parsing"
import { getSafeErrorMessage } from "./redaction"
import { resyncSub2ApiAuthToken } from "./tokenResync"
import type { Sub2ApiAuthMeData, Sub2ApiAuthMeResponse } from "./type"

/**
 * Unified logger scoped to Sub2API site API overrides.
 */
const logger = createLogger("ApiService.Sub2API")

const AUTH_ME_ENDPOINT = "/api/v1/auth/me"

const normalizeJwtRequest = (request: ApiServiceRequest): ApiServiceRequest => {
  const accessToken =
    typeof request.auth?.accessToken === "string"
      ? request.auth.accessToken.trim()
      : ""

  if (request.auth?.authType !== AuthTypeEnum.AccessToken || !accessToken) {
    throw new ApiError(
      t("messages:sub2api.loginRequired"),
      401,
      AUTH_ME_ENDPOINT,
      API_ERROR_CODES.HTTP_401,
    )
  }

  return {
    ...request,
    auth: {
      ...request.auth,
      authType: AuthTypeEnum.AccessToken,
      accessToken,
    },
  }
}

export type Sub2ApiCurrentUser = {
  userId: number
  username: string
  balanceUsd: number
  quota: number
}

const createAccountData = (
  currentUser: Sub2ApiCurrentUser,
  checkIn: CheckInConfig,
): AccountData => ({
  quota: currentUser.quota,
  today_quota_consumption: 0,
  today_prompt_tokens: 0,
  today_completion_tokens: 0,
  today_requests_count: 0,
  today_income: 0,
  checkIn,
})

const createDisabledCheckInConfig = (
  checkIn: CheckInConfig,
): CheckInConfig => ({
  ...checkIn,
  enableDetection: false,
})

const createLoginRequiredHealthStatus = () => ({
  status: SiteHealthStatus.Warning,
  message: t("messages:sub2api.loginRequired"),
})

/**
 * Fetch the currently logged-in Sub2API user.
 */
export async function fetchCurrentUser(
  request: ApiServiceRequest,
): Promise<Sub2ApiCurrentUser> {
  const jwtRequest = normalizeJwtRequest(request)

  const body = (await fetchApi<Sub2ApiAuthMeResponse>(
    jwtRequest,
    {
      endpoint: AUTH_ME_ENDPOINT,
      options: {
        method: "GET",
        cache: "no-store",
      },
    },
    true,
  )) as Sub2ApiAuthMeResponse

  const data = parseSub2ApiEnvelope<Sub2ApiAuthMeData>(body, AUTH_ME_ENDPOINT)
  const identity = parseSub2ApiUserIdentity(data)

  return {
    userId: identity.userId,
    username: identity.username,
    balanceUsd: identity.balanceUsd,
    quota: identity.quota,
  }
}

/**
 * Sub2API does not support the extension's built-in check-in flow.
 */
export async function fetchSupportCheckIn(
  _request: ApiServiceRequest,
): Promise<boolean | undefined> {
  return false
}

/**
 * Sub2API check-in is unsupported; always return undefined.
 */
export async function fetchCheckInStatus(
  _request: ApiServiceRequest,
): Promise<boolean | undefined> {
  return undefined
}

/**
 * Sub2API usage stats are not mapped yet; return zeros.
 */
export async function fetchTodayUsage(
  _request: ApiServiceRequest,
): Promise<TodayUsageData> {
  return {
    today_quota_consumption: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_requests_count: 0,
  }
}

/**
 * Sub2API income stats are not mapped yet; return zeros.
 */
export async function fetchTodayIncome(
  _request: ApiServiceRequest,
): Promise<TodayIncomeData> {
  return { today_income: 0 }
}

/**
 * Fetch Sub2API account data: quota + zeroed today stats and check-in disabled.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const checkIn: CheckInConfig = {
    ...(request.checkIn ?? { enableDetection: false }),
    enableDetection: false,
  }

  const currentUser = await fetchCurrentUser(request)

  return createAccountData(currentUser, checkIn)
}

/**
 * Refresh Sub2API account data and return a normalized `RefreshAccountResult`.
 */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  const checkIn = createDisabledCheckInConfig(
    request.checkIn ?? { enableDetection: false },
  )

  try {
    const currentUser = await fetchCurrentUser(request)
    return {
      success: true,
      data: createAccountData(currentUser, checkIn),
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: t("account:healthStatus.normal"),
      },
      authUpdate: {
        userId: currentUser.userId,
        username: currentUser.username,
      },
    }
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 401) {
      const resynced = await resyncSub2ApiAuthToken(request.baseUrl)
      if (!resynced) {
        return {
          success: false,
          healthStatus: createLoginRequiredHealthStatus(),
        }
      }

      logger.info("Retrying Sub2API refresh after JWT re-sync", {
        source: resynced.source,
      })

      try {
        const retryRequest: ApiServiceAccountRequest = {
          ...request,
          auth: {
            ...request.auth,
            authType: AuthTypeEnum.AccessToken,
            accessToken: resynced.accessToken,
          },
        }

        const currentUser = await fetchCurrentUser(retryRequest)
        return {
          success: true,
          data: createAccountData(currentUser, checkIn),
          healthStatus: {
            status: SiteHealthStatus.Healthy,
            message: t("account:healthStatus.normal"),
          },
          authUpdate: {
            accessToken: resynced.accessToken,
            userId: currentUser.userId,
            username: currentUser.username,
          },
        }
      } catch (retryError) {
        if (retryError instanceof ApiError && retryError.statusCode === 401) {
          return {
            success: false,
            healthStatus: createLoginRequiredHealthStatus(),
          }
        }

        logger.error("Failed to refresh Sub2API account after JWT re-sync", {
          error: getSafeErrorMessage(retryError),
        })

        return {
          success: false,
          healthStatus: determineHealthStatus(retryError),
        }
      }
    }

    logger.error("Failed to refresh account data", {
      error: getSafeErrorMessage(error),
    })
    return {
      success: false,
      healthStatus: determineHealthStatus(error),
    }
  }
}
