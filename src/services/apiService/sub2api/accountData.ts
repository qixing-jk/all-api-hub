import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
  TodayUsageData,
  TodayUsageDataWithAvailability,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import type {
  AccessTokenInfo,
  UserInfo,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import { fetchSub2ApiAuthIdentity } from "~/services/apiService/sub2api/authIdentity"
import {
  didSub2ApiAuthChange,
  executeAuthenticatedSub2ApiRequest,
  isSub2ApiRefreshTokenInvalidError,
  normalizeSub2ApiAccessToken as normalizeAccessToken,
  normalizeSub2ApiJwtRequest as normalizeJwtRequest,
  normalizeSub2ApiRefreshToken as normalizeRefreshToken,
  normalizeSub2ApiTokenExpiresAt as normalizeTokenExpiresAt,
} from "~/services/apiService/sub2api/authLifecycle"
import { getSub2ApiAuthPersistenceStatus } from "~/services/apiService/sub2api/authSession"
import {
  parseSub2ApiEnvelope,
  parseSub2ApiTodayUsage,
} from "~/services/apiService/sub2api/parsing"
import { getSafeErrorMessage } from "~/services/apiService/sub2api/redaction"
import { decodeSub2ApiResponseError } from "~/services/apiService/sub2api/responseError"
import { Sub2ApiTokenRefreshError } from "~/services/apiService/sub2api/tokenRefresh"
import {
  SUB2API_AUTH_ME_ENDPOINT,
  SUB2API_USAGE_STATS_ENDPOINT,
  type Sub2ApiUsageStatsData,
} from "~/services/apiService/sub2api/type"
import { ApiError } from "~/services/apiTransport/errors"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  SiteHealthStatus,
  type AccountTodayMetricReason,
  type CheckInConfig,
} from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

/**
 * Unified logger scoped to Sub2API site API overrides.
 */
const logger = createLogger("ApiService.Sub2API")

type Sub2ApiCurrentUser = {
  userId: number
  username: string
  balanceUsd: number
  quota: number
}

const createZeroTodayUsage = (
  reason: AccountTodayMetricReason,
): TodayUsageDataWithAvailability => {
  const availability = {
    status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    reason,
  } as const

  return {
    ...ZERO_TODAY_USAGE_DATA,
    todayStatsAvailability: {
      consumption: availability,
      requests: availability,
      tokens: availability,
    },
  }
}

const createSub2ApiIncomeAvailability = () =>
  ({
    status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
  }) as const

const createAccountData = (
  currentUser: Sub2ApiCurrentUser,
  checkIn: CheckInConfig,
  todayUsage: TodayUsageDataWithAvailability,
): AccountData => ({
  quota: currentUser.quota,
  ...todayUsage,
  today_income: 0,
  todayStatsAvailability: {
    ...todayUsage.todayStatsAvailability,
    income: createSub2ApiIncomeAvailability(),
  },
  checkIn,
})

const createLoginRequiredHealthStatus = () => ({
  status: SiteHealthStatus.Warning,
  message: t("messages:sub2api.loginRequired"),
})

const createRefreshTokenRestoreRequiredHealthStatus = () => ({
  status: SiteHealthStatus.Warning,
  message: t("messages:sub2api.refreshTokenInvalid"),
})

const createAuthPersistenceFailureHealthStatus = () => ({
  status: SiteHealthStatus.Warning,
  message: t("messages:sub2api.authPersistenceFailed"),
})

const createHealthyHealthStatus = () => ({
  status: SiteHealthStatus.Healthy,
  message: t("account:healthStatus.normal"),
})

const createRefreshSuccessResult = (
  currentUser: Sub2ApiCurrentUser,
  checkIn: CheckInConfig,
  todayUsage: TodayUsageDataWithAvailability,
  authUpdate?: RefreshAccountResult["authUpdate"],
): RefreshAccountResult => ({
  success: true,
  data: createAccountData(currentUser, checkIn, todayUsage),
  healthStatus: createHealthyHealthStatus(),
  authUpdate: {
    ...authUpdate,
    userId: String(currentUser.userId),
    username: currentUser.username,
  },
})

const fetchCurrentUserAndTodayUsage = async (
  request: ApiServiceAccountRequest,
): Promise<{
  currentUser: Sub2ApiCurrentUser
  todayUsage: TodayUsageDataWithAvailability
}> => {
  const currentUser = await fetchCurrentUserWithRequest(request)
  let todayUsage = createZeroTodayUsage(
    ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
  )

  try {
    todayUsage = await fetchTodayUsageWithRequest(request)
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 401) throw error
    logger.warn("Failed to fetch Sub2API today usage; using zero defaults", {
      accountId: request.accountId,
      error: getSafeErrorMessage(error),
    })
  }

  return { currentUser, todayUsage }
}

/**
 * Fetch the currently logged-in Sub2API user.
 */
const fetchCurrentUserWithRequest = async (
  request: ApiServiceRequest,
): Promise<Sub2ApiCurrentUser> => {
  const jwtRequest = normalizeJwtRequest(request)
  const { identity } = await fetchSub2ApiAuthIdentity(jwtRequest)

  return {
    userId: identity.userId,
    username: identity.username,
    balanceUsd: identity.balanceUsd,
    quota: identity.quota,
  }
}

/** Fetch the authenticated Sub2API dashboard identity. */
export async function fetchCurrentUser(
  request: ApiServiceRequest,
): Promise<Sub2ApiCurrentUser> {
  return await executeAuthenticatedSub2ApiRequest(
    request,
    SUB2API_AUTH_ME_ENDPOINT,
    fetchCurrentUserWithRequest,
  )
}

/**
 * Sub2API compatibility overrides for shared account-detection callers.
 *
 * Source: https://github.com/Wei-Shaw/sub2api
 * Upstream identity lives at `/api/v1/auth/me` behind bearer JWT auth.
 * This adapter intentionally does not fall back to common `/api/user/self`
 * or `/api/user/token` semantics.
 */
type Sub2ApiUserInfo = {
  id: string
  username: string
  access_token: string
  user: UserInfo
}

const fetchUserInfoWithRequest = async (
  request: ApiServiceRequest,
): Promise<Sub2ApiUserInfo> => {
  const jwtRequest = normalizeJwtRequest(request)
  const accessToken = normalizeAccessToken(jwtRequest.auth.accessToken)
  const { data, identity } = await fetchSub2ApiAuthIdentity(jwtRequest)

  return {
    id: String(identity.userId),
    username: identity.username,
    access_token: accessToken,
    user: {
      ...(data as Record<string, unknown>),
      id: String(identity.userId),
      username: identity.username,
      access_token: accessToken,
    } as UserInfo,
  }
}

/** Fetch the authenticated Sub2API account profile. */
export async function fetchUserInfo(
  request: ApiServiceRequest,
): Promise<Sub2ApiUserInfo> {
  return await executeAuthenticatedSub2ApiRequest(
    request,
    SUB2API_AUTH_ME_ENDPOINT,
    fetchUserInfoWithRequest,
  )
}

/**
 * Return a reusable Sub2API JWT for shared token-detection callers.
 */
export async function getOrCreateAccessToken(
  request: ApiServiceRequest,
): Promise<AccessTokenInfo> {
  return await executeAuthenticatedSub2ApiRequest(
    request,
    SUB2API_AUTH_ME_ENDPOINT,
    async (authenticatedRequest) => {
      const userInfo = await fetchUserInfoWithRequest(authenticatedRequest)
      return {
        username: userInfo.username,
        access_token: normalizeAccessToken(
          authenticatedRequest.auth.accessToken,
        ),
      }
    },
    { recoverInvalidRefreshTokenViaBrowser: true },
  )
}

/**
 * Sub2API does not support the extension's built-in check-in flow.
 */
export async function fetchSupportCheckIn(
  _request: ApiServiceRequest,
): Promise<boolean | undefined> {
  return false
}

const ZERO_TODAY_USAGE_DATA: TodayUsageData = {
  today_quota_consumption: 0,
  today_prompt_tokens: 0,
  today_completion_tokens: 0,
  today_requests_count: 0,
}

const createSub2ApiUsageStatsEndpoint = (): string =>
  `${SUB2API_USAGE_STATS_ENDPOINT}?period=today`

/**
 * Fetch Sub2API user-level usage stats for today.
 *
 * Source: https://github.com/Wei-Shaw/sub2api
 * User routes register authenticated `GET /api/v1/usage/stats`; `period=today`
 * is the server-configured current day and maps to the extension's today fields.
 */
const fetchTodayUsageWithRequest = async (
  request: ApiServiceAccountRequest,
): Promise<TodayUsageDataWithAvailability> => {
  if (request.includeTodayCashflow === false) {
    return createZeroTodayUsage(ACCOUNT_TODAY_METRIC_REASONS.NotCollected)
  }

  const endpoint = createSub2ApiUsageStatsEndpoint()
  const body = await fetchApi<unknown>(request, {
    endpoint,
    options: {
      method: "GET",
      cache: "no-store",
    },
    errorResponseDecoder: decodeSub2ApiResponseError,
  })
  const data = parseSub2ApiEnvelope<Sub2ApiUsageStatsData>(body, endpoint)

  return parseSub2ApiTodayUsage(data, endpoint)
}

/** Fetch today's Sub2API usage through the authenticated session lifecycle. */
export async function fetchTodayUsage(
  request: ApiServiceAccountRequest,
): Promise<TodayUsageDataWithAvailability> {
  if (request.includeTodayCashflow === false) {
    return createZeroTodayUsage(ACCOUNT_TODAY_METRIC_REASONS.NotCollected)
  }

  return await executeAuthenticatedSub2ApiRequest(
    request,
    createSub2ApiUsageStatsEndpoint(),
    (authenticatedRequest) =>
      fetchTodayUsageWithRequest(
        authenticatedRequest as ApiServiceAccountRequest,
      ),
  )
}

/**
 * Fetch Sub2API account data: quota + zeroed today stats and check-in disabled.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  return await executeAuthenticatedSub2ApiRequest(
    request,
    SUB2API_AUTH_ME_ENDPOINT,
    async (authenticatedRequest) => {
      const { currentUser, todayUsage } = await fetchCurrentUserAndTodayUsage(
        authenticatedRequest as ApiServiceAccountRequest,
      )
      return createAccountData(currentUser, request.checkIn, todayUsage)
    },
  )
}

/**
 * Refresh Sub2API account data and return a normalized `RefreshAccountResult`.
 */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  try {
    const refreshed = await executeAuthenticatedSub2ApiRequest(
      request,
      SUB2API_AUTH_ME_ENDPOINT,
      async (authenticatedRequest) => {
        const accountRequest = authenticatedRequest as ApiServiceAccountRequest
        const accountData = await fetchCurrentUserAndTodayUsage(accountRequest)
        return { ...accountData, request: accountRequest }
      },
      { recoverInvalidRefreshTokenViaBrowser: true },
    )
    const authChanged = didSub2ApiAuthChange(request, refreshed.request)
    const refreshToken = normalizeRefreshToken(
      refreshed.request.auth?.refreshToken,
    )
    const tokenExpiresAt = normalizeTokenExpiresAt(
      refreshed.request.auth?.tokenExpiresAt,
    )

    return createRefreshSuccessResult(
      refreshed.currentUser,
      request.checkIn,
      refreshed.todayUsage,
      authChanged
        ? {
            accessToken: refreshed.request.auth.accessToken,
            ...(refreshToken
              ? {
                  sub2apiAuth: {
                    refreshToken,
                    ...(typeof tokenExpiresAt === "number"
                      ? { tokenExpiresAt }
                      : {}),
                  },
                }
              : {}),
          }
        : undefined,
    )
  } catch (error) {
    if (getSub2ApiAuthPersistenceStatus(error)) {
      return {
        success: false,
        healthStatus: createAuthPersistenceFailureHealthStatus(),
      }
    }
    if (error instanceof ApiError && error.statusCode === 401) {
      return {
        success: false,
        healthStatus: isSub2ApiRefreshTokenInvalidError(error)
          ? createRefreshTokenRestoreRequiredHealthStatus()
          : createLoginRequiredHealthStatus(),
      }
    }
    if (error instanceof Sub2ApiTokenRefreshError) {
      return {
        success: false,
        healthStatus: createRefreshTokenRestoreRequiredHealthStatus(),
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
