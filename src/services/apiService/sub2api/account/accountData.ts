import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { resolveDeploymentApiOrigin } from "~/constants/deploymentApiOrigins"
import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
  TodayUsageData,
  TodayUsageDataWithAvailability,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import {
  accountBalanceObservation,
  accountBalanceScope,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_NATURES,
  EVIDENCE_KINDS,
  FINANCIAL_ENUMERATION,
  OBSERVATION_STATUSES,
  WALLET_BALANCE_COLLECTION_KEY,
} from "~/services/amounts/financialConstants"
import type {
  AccessTokenInfo,
  UserInfo,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import { fetchSub2ApiAuthIdentity } from "~/services/apiService/sub2api/auth/authIdentity"
import {
  didSub2ApiAuthChange,
  executeAuthenticatedSub2ApiRequest,
  isSub2ApiRefreshTokenInvalidError,
  normalizeSub2ApiAccessToken as normalizeAccessToken,
  normalizeSub2ApiJwtRequest as normalizeJwtRequest,
  normalizeSub2ApiRefreshToken as normalizeRefreshToken,
  normalizeSub2ApiTokenExpiresAt as normalizeTokenExpiresAt,
} from "~/services/apiService/sub2api/auth/authLifecycle"
import { getSub2ApiAuthPersistenceStatus } from "~/services/apiService/sub2api/auth/authSession"
import {
  SUB2API_TOKEN_REFRESH_FAILURE_REASONS,
  Sub2ApiTokenRefreshError,
} from "~/services/apiService/sub2api/auth/tokenRefresh"
import {
  parseSub2ApiEnvelope,
  parseSub2ApiTodayUsage,
} from "~/services/apiService/sub2api/parsing"
import { getSafeErrorMessage } from "~/services/apiService/sub2api/redaction"
import { decodeSub2ApiResponseError } from "~/services/apiService/sub2api/responseError"
import {
  SUB2API_AUTH_ME_ENDPOINT,
  SUB2API_PANEL_KEY_ERRORS,
  SUB2API_USAGE_STATS_ENDPOINT,
  type Sub2ApiUsageStatsData,
} from "~/services/apiService/sub2api/type"
import {
  ApiError,
  isAuthenticationRequiredError,
} from "~/services/apiTransport/errors"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  ACCOUNT_AUTH_HEALTH_STATUS_CODES,
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
  balanceUsd: unknown
  financial: Pick<AccountData, "balance" | "balanceRefreshParts">
}

type Sub2ApiTodayObservation = TodayUsageDataWithAvailability &
  Pick<AccountData, "usage">

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
  todayUsage: Sub2ApiTodayObservation,
): AccountData => ({
  ...currentUser.financial,
  ...todayUsage,
  today_income: 0,
  todayStatsAvailability: {
    ...todayUsage.todayStatsAvailability,
    income: createSub2ApiIncomeAvailability(),
  },
  checkIn,
})

const createLoginRequiredHealthStatus = (
  message = t("messages:sub2api.loginRequired"),
) => ({
  status: SiteHealthStatus.Warning,
  message,
  code: ACCOUNT_AUTH_HEALTH_STATUS_CODES.AUTHENTICATION_REQUIRED,
})

const createRefreshTokenRestoreRequiredHealthStatus = () => ({
  status: SiteHealthStatus.Warning,
  message: t("messages:sub2api.refreshTokenInvalid"),
  code: ACCOUNT_AUTH_HEALTH_STATUS_CODES.AUTHENTICATION_REQUIRED,
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
  todayUsage: Sub2ApiTodayObservation,
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
  todayUsage: Sub2ApiTodayObservation
}> => {
  const currentUser = await fetchCurrentUserWithRequest(request)
  let todayUsage: Sub2ApiTodayObservation = createZeroTodayUsage(
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
  const observedAt = Date.now()
  const scope = accountBalanceScope(request, {
    authority: new URL(resolveDeploymentApiOrigin(request.baseUrl)).origin,
  })

  return {
    userId: identity.userId,
    username: identity.username,
    balanceUsd: identity.balanceUsd,
    financial: accountBalanceObservation(
      scope,
      [
        balancePosition({
          id: "balance",
          collectionKey: WALLET_BALANCE_COLLECTION_KEY,
          scope,
          observedAt,
          value: identity.balanceUsd,
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          nature: BALANCE_NATURES.Prepaid,
          source: {
            adapter: SITE_TYPES.SUB2API,
            operation: `${SUB2API_AUTH_ME_ENDPOINT}:balance`,
            contractVersion: "usd/v1",
            kind: EVIDENCE_KINDS.Reported,
          },
        }),
      ],
      observedAt,
      FINANCIAL_ENUMERATION.Complete,
    ),
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
): Promise<Sub2ApiTodayObservation> => {
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

  const usage = parseSub2ApiTodayUsage(data, endpoint)
  const observedAt = Date.now()
  const source = {
    adapter: SITE_TYPES.SUB2API,
    operation: `${SUB2API_USAGE_STATS_ENDPOINT}:total_actual_cost`,
    contractVersion: "usd/v1",
    kind: EVIDENCE_KINDS.Reported,
  }
  const amount = observeAmount(data.total_actual_cost, source, observedAt)
  const unqualified = (
    metric: (typeof usage.todayStatsAvailability)["consumption"],
  ) =>
    metric.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable
      ? metric
      : ({
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
        } as const)
  return {
    ...usage,
    usage: {
      scope: ACCOUNT_USAGE_SCOPES.SiteToday,
      ...(usage.todayStatsAvailability.requests.status ===
      ACCOUNT_TODAY_METRIC_STATUSES.Complete
        ? { totalRequests: usage.today_requests_count }
        : {}),
      ...(usage.todayStatsAvailability.tokens.status ===
      ACCOUNT_TODAY_METRIC_STATUSES.Complete
        ? {
            totalTokens:
              usage.today_prompt_tokens + usage.today_completion_tokens,
          }
        : {}),
      cost: {
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        amount,
        scope: accountBalanceScope(request, {
          authority: new URL(resolveDeploymentApiOrigin(request.baseUrl))
            .origin,
        }),
      },
    },
    // period=today is evaluated in the server's unknown zone, not the caller's local day.
    todayStatsAvailability: {
      consumption: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason:
          amount.status === OBSERVATION_STATUSES.Known
            ? ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod
            : ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
      },
      requests: unqualified(usage.todayStatsAvailability.requests),
      tokens: unqualified(usage.todayStatsAvailability.tokens),
    },
  }
}

/** Fetch today's Sub2API usage through the authenticated session lifecycle. */
export async function fetchTodayUsage(
  request: ApiServiceAccountRequest,
): Promise<Sub2ApiTodayObservation> {
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
    if (error instanceof ApiError) {
      switch (error.upstreamCode) {
        case SUB2API_PANEL_KEY_ERRORS.Mismatch:
        case SUB2API_PANEL_KEY_ERRORS.WebsiteKeyMissing:
          return {
            success: false,
            healthStatus: createLoginRequiredHealthStatus(
              t("messages:errors.api.browserProofLoginRequired"),
            ),
          }
        case SUB2API_PANEL_KEY_ERRORS.IndependentSessionRequired:
          return {
            success: false,
            healthStatus: createLoginRequiredHealthStatus(
              t("messages:sub2api.independentSessionRequired"),
            ),
          }
      }
    }
    if (isAuthenticationRequiredError(error)) {
      return {
        success: false,
        healthStatus: isSub2ApiRefreshTokenInvalidError(error)
          ? createRefreshTokenRestoreRequiredHealthStatus()
          : createLoginRequiredHealthStatus(),
      }
    }
    if (
      error instanceof Sub2ApiTokenRefreshError &&
      error.reason ===
        SUB2API_TOKEN_REFRESH_FAILURE_REASONS.INVALID_REFRESH_TOKEN
    ) {
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
