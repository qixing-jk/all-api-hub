/**
 * Sub2API API overrides.
 *
 * Sub2API differs from One-API/New-API backends in that authenticated endpoints
 * live under `/api/v1/*` and require a dashboard JWT.
 */
import { determineHealthStatus } from "~/services/apiService/common"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import type {
  AccountData,
  ApiServiceAccountRequest,
  ApiServiceRequest,
  CreateTokenRequest,
  RefreshAccountResult,
  SiteStatusInfo,
  TodayIncomeData,
  TodayUsageData,
  UserGroupInfo,
} from "~/services/apiService/common/type"
import { fetchApi } from "~/services/apiService/common/utils"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type ApiToken,
  type CheckInConfig,
} from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import {
  buildSub2ApiUserGroups,
  extractSub2ApiKeyItems,
  parseSub2ApiEnvelope,
  parseSub2ApiKey,
  parseSub2ApiUserIdentity,
  resolveSub2ApiGroupId,
  translateSub2ApiCreateTokenRequest,
  translateSub2ApiUpdateTokenRequest,
} from "./parsing"
import { getSafeErrorMessage } from "./redaction"
import {
  refreshSub2ApiTokens,
  SUB2API_TOKEN_REFRESH_BUFFER_MS,
} from "./tokenRefresh"
import { resyncSub2ApiAuthToken } from "./tokenResync"
import {
  SUB2API_AUTH_ME_ENDPOINT,
  SUB2API_AVAILABLE_GROUPS_ENDPOINT,
  SUB2API_GROUP_RATES_ENDPOINT,
  SUB2API_KEYS_ENDPOINT,
  type Sub2ApiAuthMeData,
  type Sub2ApiAuthMeResponse,
  type Sub2ApiKeyData,
  type Sub2ApiKeyListData,
} from "./type"

/**
 * Unified logger scoped to Sub2API site API overrides.
 */
const logger = createLogger("ApiService.Sub2API")
const DEFAULT_KEYS_PAGE = 1
const DEFAULT_KEYS_PAGE_SIZE = 100
const sub2ApiAuthMutationLocks = new Map<string, Promise<void>>()

const isCloseToExpiry = (tokenExpiresAt: number): boolean => {
  const msUntilExpiry = tokenExpiresAt - Date.now()
  return msUntilExpiry <= SUB2API_TOKEN_REFRESH_BUFFER_MS
}

const normalizeAccessToken = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

const normalizeRefreshToken = (value: unknown): string =>
  normalizeAccessToken(value)

const normalizeTokenExpiresAt = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined

const normalizeJwtRequest = <TRequest extends ApiServiceRequest>(
  request: TRequest,
): TRequest => {
  const accessToken = normalizeAccessToken(request.auth?.accessToken)

  if (request.auth?.authType !== AuthTypeEnum.AccessToken || !accessToken) {
    throw new ApiError(
      t("messages:sub2api.loginRequired"),
      401,
      SUB2API_AUTH_ME_ENDPOINT,
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
  } as TRequest
}

const createLoginRequiredError = (endpoint: string) =>
  new ApiError(
    t("messages:sub2api.loginRequired"),
    401,
    endpoint,
    API_ERROR_CODES.HTTP_401,
  )

const createRefreshTokenInvalidError = (endpoint: string) =>
  new ApiError(
    t("messages:sub2api.refreshTokenInvalid"),
    401,
    endpoint,
    API_ERROR_CODES.HTTP_401,
  )

const isSub2ApiRefreshTokenContractError = (error: unknown): boolean =>
  error instanceof Error && error.message === "Sub2API token refresh failed"

const isUnauthorizedError = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.statusCode === 401

type PersistableSub2ApiAuthUpdate = {
  accessToken: string
  refreshToken?: string
  tokenExpiresAt?: number
}

type RefreshedSub2ApiRequest<
  TRequest extends ApiServiceRequest = ApiServiceRequest,
> = {
  request: TRequest
  refreshToken: string
  tokenExpiresAt: number
}

type Sub2ApiAccountStorageRef = {
  getAccountById: (id: string) => Promise<any>
  updateAccount: (id: string, updates: Record<string, any>) => Promise<boolean>
} | null

type HydratedSub2ApiAuth<
  TRequest extends ApiServiceRequest = ApiServiceRequest,
> = {
  request: TRequest
  accountStorageRef: Sub2ApiAccountStorageRef
}

const hydrateSub2ApiAuthRequest = async <TRequest extends ApiServiceRequest>(
  request: TRequest,
): Promise<HydratedSub2ApiAuth<TRequest>> => {
  let accessToken = normalizeAccessToken(request.auth?.accessToken)
  let refreshToken = normalizeRefreshToken(request.auth?.refreshToken)
  let tokenExpiresAt = normalizeTokenExpiresAt(request.auth?.tokenExpiresAt)
  let userId = request.auth?.userId
  let accountStorageRef: Sub2ApiAccountStorageRef = null

  if (request.accountId) {
    const { accountStorage } = await import(
      "~/services/accounts/accountStorage"
    )
    accountStorageRef = accountStorage

    const account = await accountStorage.getAccountById(request.accountId)
    if (account) {
      const storedAccessToken =
        typeof account.account_info?.access_token === "string"
          ? account.account_info.access_token.trim()
          : ""
      const storedRefreshToken = normalizeRefreshToken(
        account.sub2apiAuth?.refreshToken,
      )
      const storedTokenExpiresAt = normalizeTokenExpiresAt(
        account.sub2apiAuth?.tokenExpiresAt,
      )

      const shouldPreferStoredAccess = Boolean(storedAccessToken)

      if (shouldPreferStoredAccess) {
        accessToken = storedAccessToken
      }
      if (storedRefreshToken) {
        refreshToken = storedRefreshToken
      }
      if (typeof storedTokenExpiresAt === "number") {
        tokenExpiresAt = storedTokenExpiresAt
      }
      if (userId === undefined) {
        userId = account.account_info?.id
      }
    }
  }

  const hydratedRequest: TRequest = {
    ...request,
    auth: {
      ...request.auth,
      authType: AuthTypeEnum.AccessToken,
      accessToken,
      ...(refreshToken ? { refreshToken } : {}),
      ...(typeof tokenExpiresAt === "number" ? { tokenExpiresAt } : {}),
      ...(userId !== undefined ? { userId } : {}),
    },
  } as TRequest

  return {
    request: hydratedRequest,
    accountStorageRef,
  }
}

const persistSub2ApiAuthUpdate = async (
  request: ApiServiceRequest,
  authUpdate: PersistableSub2ApiAuthUpdate,
  accountStorageRef: Sub2ApiAccountStorageRef,
) => {
  if (!request.accountId) {
    return
  }

  try {
    const storage =
      accountStorageRef ??
      (await import("~/services/accounts/accountStorage")).accountStorage

    const updates: Record<string, any> = {
      account_info: {
        access_token: authUpdate.accessToken,
      },
    }

    if (authUpdate.refreshToken) {
      updates.sub2apiAuth = {
        refreshToken: authUpdate.refreshToken,
        ...(typeof authUpdate.tokenExpiresAt === "number"
          ? { tokenExpiresAt: authUpdate.tokenExpiresAt }
          : {}),
      }
    }

    const updated = await storage.updateAccount(request.accountId, updates)
    if (!updated) {
      logger.warn("Failed to persist Sub2API auth update after key request", {
        accountId: request.accountId,
      })
    }
  } catch (error) {
    logger.warn("Failed to persist Sub2API auth update", {
      accountId: request.accountId,
      error: getSafeErrorMessage(error),
    })
  }
}

const applySub2ApiAuthUpdate = <TRequest extends ApiServiceRequest>(
  request: TRequest,
  authUpdate: PersistableSub2ApiAuthUpdate,
): TRequest =>
  ({
    ...request,
    auth: {
      ...request.auth,
      authType: AuthTypeEnum.AccessToken,
      accessToken: authUpdate.accessToken,
      ...(authUpdate.refreshToken
        ? { refreshToken: authUpdate.refreshToken }
        : {}),
      ...(typeof authUpdate.tokenExpiresAt === "number"
        ? { tokenExpiresAt: authUpdate.tokenExpiresAt }
        : {}),
    },
  }) as TRequest

const createSub2ApiAuthMutationLockKey = (
  request: ApiServiceRequest,
): string => {
  if (request.accountId) {
    return `account:${request.accountId}`
  }

  const lockToken =
    normalizeRefreshToken(request.auth?.refreshToken) ||
    normalizeAccessToken(request.auth?.accessToken) ||
    "anonymous"

  return `origin:${request.baseUrl}:${lockToken}`
}

const withSub2ApiAuthMutationLock = async <T>(
  request: ApiServiceRequest,
  runner: () => Promise<T>,
): Promise<T> => {
  const lockKey = createSub2ApiAuthMutationLockKey(request)
  const previous = sub2ApiAuthMutationLocks.get(lockKey) ?? Promise.resolve()
  let releaseCurrent!: () => void
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve
  })
  const queued = previous.catch(() => undefined).then(() => current)

  sub2ApiAuthMutationLocks.set(lockKey, queued)
  await previous.catch(() => undefined)

  try {
    return await runner()
  } finally {
    releaseCurrent()
    if (sub2ApiAuthMutationLocks.get(lockKey) === queued) {
      sub2ApiAuthMutationLocks.delete(lockKey)
    }
  }
}

const didSub2ApiAuthChange = (
  previousRequest: ApiServiceRequest,
  nextRequest: ApiServiceRequest,
): boolean => {
  return (
    normalizeAccessToken(previousRequest.auth?.accessToken) !==
      normalizeAccessToken(nextRequest.auth?.accessToken) ||
    normalizeRefreshToken(previousRequest.auth?.refreshToken) !==
      normalizeRefreshToken(nextRequest.auth?.refreshToken) ||
    normalizeTokenExpiresAt(previousRequest.auth?.tokenExpiresAt) !==
      normalizeTokenExpiresAt(nextRequest.auth?.tokenExpiresAt)
  )
}

const refreshSub2ApiRequestAuth = async <
  TRequest extends ApiServiceRequest,
>(params: {
  request: TRequest
  refreshToken: string
  accountStorageRef: Sub2ApiAccountStorageRef
}): Promise<RefreshedSub2ApiRequest<TRequest>> => {
  return withSub2ApiAuthMutationLock(params.request, async () => {
    const latestHydrated = await hydrateSub2ApiAuthRequest(params.request)
    const latestRequest = latestHydrated.request
    const latestStorageRef =
      latestHydrated.accountStorageRef ?? params.accountStorageRef
    const latestRefreshToken =
      normalizeRefreshToken(latestRequest.auth?.refreshToken) ||
      normalizeRefreshToken(params.refreshToken)
    const latestTokenExpiresAt = normalizeTokenExpiresAt(
      latestRequest.auth?.tokenExpiresAt,
    )

    if (
      didSub2ApiAuthChange(params.request, latestRequest) &&
      latestRefreshToken &&
      typeof latestTokenExpiresAt === "number"
    ) {
      return {
        request: latestRequest,
        refreshToken: latestRefreshToken,
        tokenExpiresAt: latestTokenExpiresAt,
      }
    }

    const refreshed = await refreshSub2ApiTokens({
      baseUrl: latestRequest.baseUrl,
      accessToken: latestRequest.auth?.accessToken,
      refreshToken: latestRefreshToken,
    })

    const refreshedRequest = applySub2ApiAuthUpdate(latestRequest, refreshed)
    await persistSub2ApiAuthUpdate(
      refreshedRequest,
      refreshed,
      latestStorageRef,
    )

    return {
      request: refreshedRequest,
      refreshToken: refreshed.refreshToken,
      tokenExpiresAt: refreshed.tokenExpiresAt,
    }
  })
}

const resyncSub2ApiRequestAuth = async <
  TRequest extends ApiServiceRequest,
>(params: {
  request: TRequest
  endpoint: string
  accountStorageRef: Sub2ApiAccountStorageRef
}): Promise<TRequest> => {
  return withSub2ApiAuthMutationLock(params.request, async () => {
    const latestHydrated = await hydrateSub2ApiAuthRequest(params.request)
    const latestRequest = latestHydrated.request
    const latestStorageRef =
      latestHydrated.accountStorageRef ?? params.accountStorageRef

    if (didSub2ApiAuthChange(params.request, latestRequest)) {
      return latestRequest
    }

    const resynced = await resyncSub2ApiAuthToken(latestRequest.baseUrl)
    if (!resynced) {
      throw createLoginRequiredError(params.endpoint)
    }

    logger.info("Retrying Sub2API key request after JWT re-sync", {
      endpoint: params.endpoint,
      source: resynced.source,
    })

    const resyncedRequest = applySub2ApiAuthUpdate(latestRequest, {
      accessToken: resynced.accessToken,
    })

    await persistSub2ApiAuthUpdate(
      resyncedRequest,
      { accessToken: resynced.accessToken },
      latestStorageRef,
    )

    return resyncedRequest
  })
}

type AuthenticatedSub2ApiRunner<T> = (request: ApiServiceRequest) => Promise<T>

const retrySub2ApiRunnerWithResyncedAuth = async <T>(params: {
  request: ApiServiceRequest
  endpoint: string
  accountStorageRef: Sub2ApiAccountStorageRef
  runner: AuthenticatedSub2ApiRunner<T>
}): Promise<T> => {
  const updatedRequest = await resyncSub2ApiRequestAuth({
    request: params.request,
    endpoint: params.endpoint,
    accountStorageRef: params.accountStorageRef,
  })

  try {
    return await params.runner(updatedRequest)
  } catch (retryError) {
    if (isUnauthorizedError(retryError)) {
      throw createLoginRequiredError(params.endpoint)
    }

    throw retryError
  }
}

/**
 * Execute a Sub2API API request with automatic handling of JWT hydration, proactive refresh, and reactive refresh/resync on 401 errors.
 * @param request The initial API request, which may have incomplete auth info that will be hydrated.
 * @param endpoint The API endpoint being called, used for logging and error messages.
 * @param runner A function that executes the actual API call with a fully hydrated and refreshed request.
 */
const executeAuthenticatedSub2ApiRequest = async <T>(
  request: ApiServiceRequest,
  endpoint: string,
  runner: AuthenticatedSub2ApiRunner<T>,
): Promise<T> => {
  const hydrated = await hydrateSub2ApiAuthRequest(request)
  let effectiveRequest = normalizeJwtRequest(hydrated.request)
  let refreshToken = normalizeRefreshToken(effectiveRequest.auth?.refreshToken)
  const tokenExpiresAt = normalizeTokenExpiresAt(
    effectiveRequest.auth?.tokenExpiresAt,
  )

  if (
    refreshToken &&
    typeof tokenExpiresAt === "number" &&
    isCloseToExpiry(tokenExpiresAt)
  ) {
    try {
      const refreshed = await refreshSub2ApiRequestAuth({
        request: effectiveRequest,
        refreshToken,
        accountStorageRef: hydrated.accountStorageRef,
      })

      effectiveRequest = refreshed.request
      refreshToken = refreshed.refreshToken
    } catch (refreshError) {
      logger.warn("Sub2API proactive key auth refresh failed", {
        endpoint,
        error: getSafeErrorMessage(refreshError),
      })
    }
  }

  try {
    return await runner(effectiveRequest)
  } catch (error) {
    if (!isUnauthorizedError(error)) {
      throw error
    }

    if (refreshToken) {
      try {
        const refreshed = await refreshSub2ApiRequestAuth({
          request: effectiveRequest,
          refreshToken,
          accountStorageRef: hydrated.accountStorageRef,
        })

        effectiveRequest = refreshed.request

        return await runner(effectiveRequest)
      } catch (refreshError) {
        logger.warn("Failed to restore Sub2API key request via refresh token", {
          endpoint,
          error: getSafeErrorMessage(refreshError),
        })
        if (isSub2ApiRefreshTokenContractError(refreshError)) {
          throw createRefreshTokenInvalidError(endpoint)
        }

        let updatedRequest: ApiServiceRequest
        try {
          updatedRequest = await resyncSub2ApiRequestAuth({
            request: effectiveRequest,
            endpoint,
            accountStorageRef: hydrated.accountStorageRef,
          })
        } catch {
          throw refreshError
        }

        try {
          return await runner(updatedRequest)
        } catch (retryError) {
          if (isUnauthorizedError(retryError)) {
            throw createLoginRequiredError(endpoint)
          }

          throw retryError
        }
      }
    }

    return await retrySub2ApiRunnerWithResyncedAuth({
      request: effectiveRequest,
      endpoint,
      accountStorageRef: hydrated.accountStorageRef,
      runner,
    })
  }
}

const fetchSub2ApiDataWithRequest = async <T>(
  request: ApiServiceRequest,
  endpoint: string,
  options?: RequestInit,
  parserOptions?: { allowMissingData?: boolean },
): Promise<{ data: T; request: ApiServiceRequest }> => {
  return executeAuthenticatedSub2ApiRequest(
    request,
    endpoint,
    async (authRequest) => {
      const body = await fetchApi<unknown>(
        authRequest,
        {
          endpoint,
          options,
        },
        true,
      )

      return {
        data: parseSub2ApiEnvelope<T>(body, endpoint, parserOptions),
        request: authRequest,
      }
    },
  )
}

const fetchSub2ApiData = async <T>(
  request: ApiServiceRequest,
  endpoint: string,
  options?: RequestInit,
  parserOptions?: { allowMissingData?: boolean },
): Promise<T> => {
  const result = await fetchSub2ApiDataWithRequest<T>(
    request,
    endpoint,
    options,
    parserOptions,
  )

  return result.data
}

const fetchAvailableGroupsInternal = async (request: ApiServiceRequest) =>
  fetchSub2ApiData<unknown[]>(request, SUB2API_AVAILABLE_GROUPS_ENDPOINT, {
    method: "GET",
    cache: "no-store",
  })

const fetchGroupRatesInternal = async (request: ApiServiceRequest) =>
  fetchSub2ApiData<Record<string, number>>(
    request,
    SUB2API_GROUP_RATES_ENDPOINT,
    {
      method: "GET",
      cache: "no-store",
    },
  )

const normalizePositiveInteger = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback

const createSub2ApiKeysEndpoint = (page: number, size: number): string => {
  const searchParams = new URLSearchParams({
    page: normalizePositiveInteger(page, DEFAULT_KEYS_PAGE).toString(),
    page_size: normalizePositiveInteger(
      size,
      DEFAULT_KEYS_PAGE_SIZE,
    ).toString(),
  })

  return `${SUB2API_KEYS_ENDPOINT}?${searchParams.toString()}`
}

const resolveSelectedGroupId = async (
  request: ApiServiceRequest,
  groupName: string,
): Promise<number | undefined> => {
  const normalizedGroup = groupName.trim()
  if (!normalizedGroup) {
    return undefined
  }

  const groups = await fetchAvailableGroupsInternal(request)
  const groupId = resolveSub2ApiGroupId(
    groups,
    normalizedGroup,
    SUB2API_AVAILABLE_GROUPS_ENDPOINT,
  )

  if (typeof groupId !== "number" || !Number.isFinite(groupId)) {
    throw new ApiError(
      t("messages:sub2api.groupMissing", { group: normalizedGroup }),
      undefined,
      SUB2API_AVAILABLE_GROUPS_ENDPOINT,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  }

  return groupId
}

type Sub2ApiCurrentUser = {
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

const createRefreshTokenRestoreRequiredHealthStatus = () => ({
  status: SiteHealthStatus.Warning,
  message: t("messages:sub2api.refreshTokenInvalid"),
})

const createHealthyHealthStatus = () => ({
  status: SiteHealthStatus.Healthy,
  message: t("account:healthStatus.normal"),
})

const createRefreshSuccessResult = (
  currentUser: Sub2ApiCurrentUser,
  checkIn: CheckInConfig,
  authUpdate?: RefreshAccountResult["authUpdate"],
): RefreshAccountResult => ({
  success: true,
  data: createAccountData(currentUser, checkIn),
  healthStatus: createHealthyHealthStatus(),
  authUpdate: {
    ...authUpdate,
    userId: currentUser.userId,
    username: currentUser.username,
  },
})

const refreshSub2ApiAccountViaResync = async (params: {
  request: ApiServiceRequest
  accountStorageRef: Sub2ApiAccountStorageRef
  checkIn: CheckInConfig
}): Promise<RefreshAccountResult> => {
  const retryRequest = await resyncSub2ApiRequestAuth({
    request: params.request,
    endpoint: SUB2API_AUTH_ME_ENDPOINT,
    accountStorageRef: params.accountStorageRef,
  })

  const currentUser = await fetchCurrentUser(retryRequest)

  return createRefreshSuccessResult(currentUser, params.checkIn, {
    accessToken: retryRequest.auth.accessToken,
  })
}

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
      endpoint: SUB2API_AUTH_ME_ENDPOINT,
      options: {
        method: "GET",
        cache: "no-store",
      },
    },
    true,
  )) as Sub2ApiAuthMeResponse

  const data = parseSub2ApiEnvelope<Sub2ApiAuthMeData>(
    body,
    SUB2API_AUTH_ME_ENDPOINT,
  )
  const identity = parseSub2ApiUserIdentity(data)

  return {
    userId: identity.userId,
    username: identity.username,
    balanceUsd: identity.balanceUsd,
    quota: identity.quota,
  }
}

/**
 * Sub2API does not expose the One-API-style public `/api/status` endpoint.
 * Return a synthetic status payload so shared callers can skip that request and
 * still treat built-in check-in as unsupported.
 */
export async function fetchSiteStatus(
  _request: ApiServiceRequest,
): Promise<SiteStatusInfo> {
  return {
    checkin_enabled: false,
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
  let hydratedRequest: HydratedSub2ApiAuth<ApiServiceAccountRequest> | null =
    null
  let effectiveRequest = request
  let refreshToken = normalizeRefreshToken(request.auth?.refreshToken)
  let tokenExpiresAt = normalizeTokenExpiresAt(request.auth?.tokenExpiresAt)

  try {
    hydratedRequest = await hydrateSub2ApiAuthRequest(request)
    effectiveRequest = hydratedRequest.request
    refreshToken = normalizeRefreshToken(effectiveRequest.auth?.refreshToken)
    tokenExpiresAt = normalizeTokenExpiresAt(
      effectiveRequest.auth?.tokenExpiresAt,
    )
    const hasStoredRefreshToken = Boolean(refreshToken)
    let hasProactiveRefreshUpdate = false

    if (hasStoredRefreshToken && typeof tokenExpiresAt === "number") {
      if (isCloseToExpiry(tokenExpiresAt)) {
        try {
          const refreshed = await refreshSub2ApiRequestAuth({
            request: effectiveRequest,
            refreshToken,
            accountStorageRef: hydratedRequest.accountStorageRef,
          })

          effectiveRequest = refreshed.request
          refreshToken = refreshed.refreshToken
          tokenExpiresAt = refreshed.tokenExpiresAt
          hasProactiveRefreshUpdate = true
        } catch (refreshError) {
          logger.warn("Sub2API proactive token refresh failed", {
            error: getSafeErrorMessage(refreshError),
          })
        }
      }
    }

    const currentUser = await fetchCurrentUser(effectiveRequest)

    return createRefreshSuccessResult(currentUser, checkIn, {
      ...(hasProactiveRefreshUpdate
        ? {
            accessToken: effectiveRequest.auth.accessToken,
            sub2apiAuth: {
              refreshToken,
              ...(typeof tokenExpiresAt === "number" ? { tokenExpiresAt } : {}),
            },
          }
        : {}),
    })
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 401) {
      hydratedRequest ??= await hydrateSub2ApiAuthRequest(request)
      effectiveRequest = didSub2ApiAuthChange(request, effectiveRequest)
        ? effectiveRequest
        : hydratedRequest.request
      refreshToken = normalizeRefreshToken(effectiveRequest.auth?.refreshToken)
      const hasStoredRefreshToken = Boolean(refreshToken)

      if (hasStoredRefreshToken) {
        try {
          const refreshed = await refreshSub2ApiRequestAuth({
            request: effectiveRequest,
            refreshToken,
            accountStorageRef: hydratedRequest.accountStorageRef,
          })

          const retryRequest = refreshed.request

          const currentUser = await fetchCurrentUser(retryRequest)

          return createRefreshSuccessResult(currentUser, checkIn, {
            accessToken: retryRequest.auth.accessToken,
            sub2apiAuth: {
              refreshToken: refreshed.refreshToken,
              tokenExpiresAt: refreshed.tokenExpiresAt,
            },
          })
        } catch (refreshError) {
          logger.warn("Failed to restore Sub2API session via refresh token", {
            error: getSafeErrorMessage(refreshError),
          })

          try {
            return await refreshSub2ApiAccountViaResync({
              request: effectiveRequest,
              accountStorageRef: hydratedRequest.accountStorageRef,
              checkIn,
            })
          } catch {
            return {
              success: false,
              healthStatus: createRefreshTokenRestoreRequiredHealthStatus(),
            }
          }
        }
      }

      try {
        return await refreshSub2ApiAccountViaResync({
          request: hydratedRequest.request,
          accountStorageRef: hydratedRequest.accountStorageRef,
          checkIn,
        })
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

/**
 * Fetch the list of API tokens for the account, with pagination support.
 */
export async function fetchAccountTokens(
  request: ApiServiceRequest,
  page: number = DEFAULT_KEYS_PAGE,
  size: number = DEFAULT_KEYS_PAGE_SIZE,
): Promise<ApiToken[]> {
  const endpoint = createSub2ApiKeysEndpoint(page, size)

  try {
    const { data, request: hydratedRequest } =
      await fetchSub2ApiDataWithRequest<Sub2ApiKeyListData>(request, endpoint, {
        method: "GET",
        cache: "no-store",
      })

    return extractSub2ApiKeyItems(data).map((item) =>
      parseSub2ApiKey(item, {
        defaultUserId: hydratedRequest.auth?.userId,
        endpoint,
      }),
    )
  } catch (error) {
    logger.error("Failed to fetch Sub2API keys", {
      accountId: request.accountId,
      endpoint,
      error: getSafeErrorMessage(error),
    })
    throw error
  }
}

/**
 * Fetch the details of a specific API token by its ID.
 */
export async function fetchTokenById(
  request: ApiServiceRequest,
  tokenId: number,
): Promise<ApiToken> {
  const endpoint = `${SUB2API_KEYS_ENDPOINT}/${tokenId}`

  try {
    const { data, request: hydratedRequest } =
      await fetchSub2ApiDataWithRequest<Sub2ApiKeyData>(request, endpoint, {
        method: "GET",
        cache: "no-store",
      })

    return parseSub2ApiKey(data, {
      defaultUserId: hydratedRequest.auth?.userId,
      endpoint,
    })
  } catch (error) {
    logger.error("Failed to fetch Sub2API key detail", {
      accountId: request.accountId,
      tokenId,
      endpoint,
      error: getSafeErrorMessage(error),
    })
    throw error
  }
}

/**
 * Fetch the list of user groups available in Sub2API and their associated rates, then build a mapping of group name to `UserGroupInfo` for use in the extension.
 */
export async function fetchUserGroups(
  request: ApiServiceRequest,
): Promise<Record<string, UserGroupInfo>> {
  try {
    const [groups, rates] = await Promise.all([
      fetchAvailableGroupsInternal(request),
      fetchGroupRatesInternal(request),
    ])

    return buildSub2ApiUserGroups(groups, rates, {
      groups: SUB2API_AVAILABLE_GROUPS_ENDPOINT,
      rates: SUB2API_GROUP_RATES_ENDPOINT,
    })
  } catch (error) {
    logger.error("Failed to fetch Sub2API groups", {
      accountId: request.accountId,
      error: getSafeErrorMessage(error),
    })
    throw error
  }
}

/**
 * Sub2API does not provide a list of available models, so return an empty array and rely on the extension's default model handling logic.
 */
export async function fetchAccountAvailableModels(
  _request: ApiServiceRequest,
): Promise<string[]> {
  return []
}

/**
 * Create a new API token in Sub2API with the specified data, resolving the group name to an ID as needed.
 */
export async function createApiToken(
  request: ApiServiceRequest,
  tokenData: CreateTokenRequest,
): Promise<boolean> {
  try {
    const groupId = await resolveSelectedGroupId(request, tokenData.group)
    const payload = translateSub2ApiCreateTokenRequest(tokenData, groupId)

    await fetchSub2ApiData<unknown>(request, SUB2API_KEYS_ENDPOINT, {
      method: "POST",
      body: JSON.stringify(payload),
    })

    return true
  } catch (error) {
    logger.error("Failed to create Sub2API key", {
      accountId: request.accountId,
      endpoint: SUB2API_KEYS_ENDPOINT,
      error: getSafeErrorMessage(error),
    })
    throw error
  }
}

/**
 * Update an existing API token in Sub2API by its ID with the specified data, resolving the group name to an ID as needed.
 */
export async function updateApiToken(
  request: ApiServiceRequest,
  tokenId: number,
  tokenData: CreateTokenRequest,
): Promise<boolean> {
  const endpoint = `${SUB2API_KEYS_ENDPOINT}/${tokenId}`

  try {
    const existingToken = await fetchTokenById(request, tokenId)
    const groupId = await resolveSelectedGroupId(request, tokenData.group)
    const payload = translateSub2ApiUpdateTokenRequest(
      tokenData.unlimited_quota
        ? tokenData
        : {
            ...tokenData,
            remain_quota: tokenData.remain_quota + existingToken.used_quota,
          },
      groupId,
    )

    await fetchSub2ApiData<unknown>(request, endpoint, {
      method: "PUT",
      body: JSON.stringify(payload),
    })

    return true
  } catch (error) {
    logger.error("Failed to update Sub2API key", {
      accountId: request.accountId,
      tokenId,
      endpoint,
      error: getSafeErrorMessage(error),
    })
    throw error
  }
}

/**
 * Delete an API token in Sub2API by its ID.
 */
export async function deleteApiToken(
  request: ApiServiceRequest,
  tokenId: number,
): Promise<boolean> {
  const endpoint = `${SUB2API_KEYS_ENDPOINT}/${tokenId}`

  try {
    await fetchSub2ApiData<void>(
      request,
      endpoint,
      {
        method: "DELETE",
      },
      { allowMissingData: true },
    )

    return true
  } catch (error) {
    logger.error("Failed to delete Sub2API key", {
      accountId: request.accountId,
      tokenId,
      endpoint,
      error: getSafeErrorMessage(error),
    })
    throw error
  }
}
