/**
 * Sub2API API overrides.
 *
 * Sub2API differs from One-API/New-API backends in that authenticated endpoints
 * live under `/api/v1/*` and require a dashboard JWT.
 */
import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
  TodayIncomeData,
  TodayUsageData,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import { hasUsableApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import { resolveApiTokenKeyWithFetcher } from "~/services/accountTokens/tokenKeyResolver"
import type {
  CreateTokenRequest,
  CreateTokenResult,
  UserGroupInfo,
} from "~/services/accountTokens/tokenProvisioningModel"
import type {
  AccessTokenInfo,
  SiteStatusInfo,
  UserInfo,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import { extractDefaultExchangeRate as extractNewApiFamilyDefaultExchangeRate } from "~/services/apiService/newApiFamily/default/accountBootstrap"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type ApiToken,
  type CheckInConfig,
} from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import { getSub2ApiAuthSession, type Sub2ApiAuthSession } from "./authSession"
import {
  buildSub2ApiUserGroups,
  extractSub2ApiKeyItems,
  parseSub2ApiEnvelope,
  parseSub2ApiGroupRates,
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
  SUB2API_ANNOUNCEMENTS_ENDPOINT,
  SUB2API_AUTH_ME_ENDPOINT,
  SUB2API_AVAILABLE_GROUPS_ENDPOINT,
  SUB2API_GROUP_RATES_ENDPOINT,
  SUB2API_KEYS_ENDPOINT,
  type Sub2ApiAnnouncementData,
  type Sub2ApiAnnouncementListData,
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
const SUB2API_RUNTIME_MODELS_ENDPOINT = "/v1/models"
const sub2ApiAuthMutationLocks = new Map<string, Promise<void>>()

const isCloseToExpiry = (tokenExpiresAt: number): boolean => {
  const msUntilExpiry = tokenExpiresAt - Date.now()
  return msUntilExpiry <= SUB2API_TOKEN_REFRESH_BUFFER_MS
}

const normalizeAccessToken = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

const normalizeRefreshToken = (value: unknown): string =>
  normalizeAccessToken(value)

const normalizeRuntimeApiKey = (request: ApiServiceRequest): string => {
  const auth = request.auth as typeof request.auth & { apiKey?: unknown }
  return normalizeAccessToken(auth.apiKey)
}

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

type HydratedSub2ApiAuth<
  TRequest extends ApiServiceRequest = ApiServiceRequest,
> = {
  request: TRequest
  authSession?: Sub2ApiAuthSession
}

const hydrateSub2ApiAuthRequest = async <TRequest extends ApiServiceRequest>(
  request: TRequest,
): Promise<HydratedSub2ApiAuth<TRequest>> => {
  let accessToken = normalizeAccessToken(request.auth?.accessToken)
  let refreshToken = normalizeRefreshToken(request.auth?.refreshToken)
  let tokenExpiresAt = normalizeTokenExpiresAt(request.auth?.tokenExpiresAt)
  let userId = request.auth?.userId
  const authSession = getSub2ApiAuthSession(request)

  if (request.accountId && authSession) {
    const storedAuth = await authSession.getLatestAuth(request.accountId)
    if (storedAuth) {
      const storedAccessToken = normalizeAccessToken(storedAuth.accessToken)
      const storedRefreshToken = normalizeRefreshToken(
        storedAuth.sub2apiAuth?.refreshToken,
      )
      const storedTokenExpiresAt = normalizeTokenExpiresAt(
        storedAuth.sub2apiAuth?.tokenExpiresAt,
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
        userId = storedAuth.userId
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
    authSession,
  }
}

const persistSub2ApiAuthUpdate = async (
  request: ApiServiceRequest,
  authUpdate: PersistableSub2ApiAuthUpdate,
  authSession: Sub2ApiAuthSession | undefined,
) => {
  if (!request.accountId) {
    return
  }

  if (!authSession) {
    return
  }

  try {
    const updated = await authSession.persistAuthUpdate(
      request.accountId,
      authUpdate,
    )
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
  authSession?: Sub2ApiAuthSession
}): Promise<RefreshedSub2ApiRequest<TRequest>> => {
  return withSub2ApiAuthMutationLock(params.request, async () => {
    const latestHydrated = await hydrateSub2ApiAuthRequest(params.request)
    const latestRequest = latestHydrated.request
    const latestAuthSession = latestHydrated.authSession ?? params.authSession
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
      latestAuthSession,
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
  authSession?: Sub2ApiAuthSession
}): Promise<TRequest> => {
  return withSub2ApiAuthMutationLock(params.request, async () => {
    const latestHydrated = await hydrateSub2ApiAuthRequest(params.request)
    const latestRequest = latestHydrated.request
    const latestAuthSession = latestHydrated.authSession ?? params.authSession

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
      latestAuthSession,
    )

    return resyncedRequest
  })
}

type AuthenticatedSub2ApiRunner<T> = (request: ApiServiceRequest) => Promise<T>

const retrySub2ApiRunnerWithResyncedAuth = async <T>(params: {
  request: ApiServiceRequest
  endpoint: string
  authSession?: Sub2ApiAuthSession
  runner: AuthenticatedSub2ApiRunner<T>
}): Promise<T> => {
  const updatedRequest = await resyncSub2ApiRequestAuth({
    request: params.request,
    endpoint: params.endpoint,
    authSession: params.authSession,
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
        authSession: hydrated.authSession,
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
          authSession: hydrated.authSession,
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
            authSession: hydrated.authSession,
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
      authSession: hydrated.authSession,
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

const createInvalidRuntimeModelsPayloadError = () =>
  new ApiError(
    t("messages:errors.api.invalidResponseFormat"),
    undefined,
    SUB2API_RUNTIME_MODELS_ENDPOINT,
    API_ERROR_CODES.BUSINESS_ERROR,
  )

const createRuntimeApiKeyAuthError = () =>
  new ApiError(
    t("messages:sub2api.loginRequired"),
    401,
    SUB2API_RUNTIME_MODELS_ENDPOINT,
    API_ERROR_CODES.HTTP_401,
  )

const createSub2ApiRuntimeBusinessError = (
  payload: unknown,
): ApiError | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null
  }

  const code = (payload as { code?: unknown }).code
  if (
    (typeof code !== "string" || !code.trim()) &&
    (typeof code !== "number" || code === 0)
  ) {
    return null
  }

  const message = (payload as { message?: unknown }).message
  if (typeof message !== "string" || !message.trim()) {
    return null
  }

  return new ApiError(
    message.trim(),
    undefined,
    SUB2API_RUNTIME_MODELS_ENDPOINT,
    API_ERROR_CODES.BUSINESS_ERROR,
  )
}

const normalizeRuntimeModelId = (item: unknown): string => {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw createInvalidRuntimeModelsPayloadError()
  }

  const id = (item as { id?: unknown }).id
  if (typeof id !== "string" || !id.trim()) {
    throw createInvalidRuntimeModelsPayloadError()
  }

  return id.trim()
}

const parseSub2ApiRuntimeModelIds = (payload: unknown): string[] => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createInvalidRuntimeModelsPayloadError()
  }

  const data = (payload as { data?: unknown }).data
  if (!Array.isArray(data)) {
    throw createInvalidRuntimeModelsPayloadError()
  }

  return data.map(normalizeRuntimeModelId)
}

const readRuntimeModelsPayload = async (
  response: Response,
): Promise<unknown> => {
  try {
    return await response.json()
  } catch {
    throw createInvalidRuntimeModelsPayloadError()
  }
}

const readRuntimeModelsBusinessError = async (
  response: Response,
): Promise<ApiError | null> => {
  try {
    return createSub2ApiRuntimeBusinessError(await response.clone().json())
  } catch {
    return null
  }
}

const createRuntimeModelsUrl = (baseUrl: string): string =>
  `${baseUrl.replace(/\/+$/, "")}${SUB2API_RUNTIME_MODELS_ENDPOINT}`

const fetchAvailableGroupsInternal = async (request: ApiServiceRequest) =>
  fetchSub2ApiData<unknown[]>(request, SUB2API_AVAILABLE_GROUPS_ENDPOINT, {
    method: "GET",
    cache: "no-store",
  })

const fetchGroupRatesInternal = async (request: ApiServiceRequest) =>
  fetchSub2ApiData<unknown>(request, SUB2API_GROUP_RATES_ENDPOINT, {
    method: "GET",
    cache: "no-store",
  }).then((rates) =>
    parseSub2ApiGroupRates(rates, SUB2API_GROUP_RATES_ENDPOINT),
  )

export const fetchSub2ApiAvailableGroups = fetchAvailableGroupsInternal

export const fetchSub2ApiGroupRates = fetchGroupRatesInternal

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

const extractSub2ApiAnnouncementItems = (
  data: Sub2ApiAnnouncementListData,
): Sub2ApiAnnouncementData[] => {
  if (Array.isArray(data)) {
    return data
  }

  if (Array.isArray(data?.items)) {
    return data.items
  }

  return []
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
    userId: String(currentUser.userId),
    username: currentUser.username,
  },
})

const refreshSub2ApiAccountViaResync = async (params: {
  request: ApiServiceRequest
  authSession?: Sub2ApiAuthSession
  checkIn: CheckInConfig
}): Promise<RefreshAccountResult> => {
  const retryRequest = await resyncSub2ApiRequestAuth({
    request: params.request,
    endpoint: SUB2API_AUTH_ME_ENDPOINT,
    authSession: params.authSession,
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
 * Sub2API compatibility overrides for shared account-detection callers.
 *
 * Source: https://github.com/Wei-Shaw/sub2api
 * Upstream identity lives at `/api/v1/auth/me` behind bearer JWT auth.
 * This adapter intentionally does not fall back to common `/api/user/self`
 * or `/api/user/token` semantics.
 */
export async function fetchUserInfo(request: ApiServiceRequest): Promise<{
  id: string
  username: string
  access_token: string
  user: UserInfo
}> {
  const jwtRequest = normalizeJwtRequest(request)
  const accessToken = normalizeAccessToken(jwtRequest.auth.accessToken)
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

const fetchSub2ApiAccessTokenInfo = async (
  request: ApiServiceRequest,
): Promise<AccessTokenInfo> => {
  const userInfo = await fetchUserInfo(request)

  return {
    username: userInfo.username,
    access_token: userInfo.access_token,
  }
}

const fetchSub2ApiAccessTokenInfoWithResyncedAuth = async (params: {
  request: ApiServiceRequest
  authSession?: Sub2ApiAuthSession
}): Promise<AccessTokenInfo> => {
  const resyncedRequest = await resyncSub2ApiRequestAuth({
    request: params.request,
    endpoint: SUB2API_AUTH_ME_ENDPOINT,
    authSession: params.authSession,
  })

  try {
    return await fetchSub2ApiAccessTokenInfo(resyncedRequest)
  } catch (retryError) {
    if (isUnauthorizedError(retryError)) {
      throw createLoginRequiredError(SUB2API_AUTH_ME_ENDPOINT)
    }

    throw retryError
  }
}

const fetchSub2ApiAccessTokenInfoWithAuthRecovery = async (params: {
  request: ApiServiceRequest
  refreshToken: string
  authSession?: Sub2ApiAuthSession
}): Promise<AccessTokenInfo> => {
  try {
    return await fetchSub2ApiAccessTokenInfo(params.request)
  } catch (error) {
    if (!isUnauthorizedError(error)) {
      throw error
    }

    if (params.refreshToken) {
      try {
        const refreshed = await refreshSub2ApiRequestAuth({
          request: params.request,
          refreshToken: params.refreshToken,
          authSession: params.authSession,
        })

        return await fetchSub2ApiAccessTokenInfo(refreshed.request)
      } catch (refreshError) {
        logger.warn("Failed to restore Sub2API user info via refresh token", {
          endpoint: SUB2API_AUTH_ME_ENDPOINT,
          error: getSafeErrorMessage(refreshError),
        })
      }
    }

    return await fetchSub2ApiAccessTokenInfoWithResyncedAuth({
      request: params.request,
      authSession: params.authSession,
    })
  }
}

/**
 * Return a reusable Sub2API JWT for shared token-detection callers.
 */
export async function getOrCreateAccessToken(
  request: ApiServiceRequest,
): Promise<AccessTokenInfo> {
  const hydrated = await hydrateSub2ApiAuthRequest(request)
  let effectiveRequest = hydrated.request
  let accessToken = normalizeAccessToken(effectiveRequest.auth?.accessToken)
  const refreshToken = normalizeRefreshToken(
    effectiveRequest.auth?.refreshToken,
  )
  const tokenExpiresAt = normalizeTokenExpiresAt(
    effectiveRequest.auth?.tokenExpiresAt,
  )

  if (accessToken && (!tokenExpiresAt || !isCloseToExpiry(tokenExpiresAt))) {
    return await fetchSub2ApiAccessTokenInfoWithAuthRecovery({
      request: effectiveRequest,
      refreshToken,
      authSession: hydrated.authSession,
    })
  }

  if (refreshToken) {
    try {
      const refreshed = await refreshSub2ApiRequestAuth({
        request: effectiveRequest,
        refreshToken,
        authSession: hydrated.authSession,
      })
      effectiveRequest = refreshed.request
      accessToken = normalizeAccessToken(effectiveRequest.auth?.accessToken)

      const userInfo = await fetchUserInfo(effectiveRequest)
      return {
        username: userInfo.username,
        access_token: accessToken,
      }
    } catch (refreshError) {
      logger.warn("Failed to restore Sub2API user info via refresh token", {
        endpoint: SUB2API_AUTH_ME_ENDPOINT,
        error: getSafeErrorMessage(refreshError),
      })
    }
  }

  return await fetchSub2ApiAccessTokenInfoWithResyncedAuth({
    request: effectiveRequest,
    authSession: hydrated.authSession,
  })
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
 * Keep strict Sub2API routing compatible with shared account completion code
 * while reusing the common status exchange-rate fallback order.
 */
export const extractDefaultExchangeRate = extractNewApiFamilyDefaultExchangeRate

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
            authSession: hydratedRequest.authSession,
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
            authSession: hydratedRequest.authSession,
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
              authSession: hydratedRequest.authSession,
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
          authSession: hydratedRequest.authSession,
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
 * Fetch unread Sub2API announcements for the authenticated account.
 */
export async function fetchSub2ApiAnnouncements(
  request: ApiServiceRequest,
  options?: { unreadOnly?: boolean },
): Promise<Sub2ApiAnnouncementData[]> {
  const searchParams = new URLSearchParams()
  if (options?.unreadOnly) {
    searchParams.set("unread_only", "1")
  }

  const endpoint = searchParams.toString()
    ? `${SUB2API_ANNOUNCEMENTS_ENDPOINT}?${searchParams.toString()}`
    : SUB2API_ANNOUNCEMENTS_ENDPOINT

  try {
    const data = await fetchSub2ApiData<Sub2ApiAnnouncementListData>(
      request,
      endpoint,
      {
        method: "GET",
        cache: "no-store",
      },
    )

    return extractSub2ApiAnnouncementItems(data)
  } catch (error) {
    logger.error("Failed to fetch Sub2API announcements", {
      accountId: request.accountId,
      endpoint,
      error: getSafeErrorMessage(error),
    })
    throw error
  }
}

/**
 * Mark a Sub2API announcement as read after it has been delivered locally.
 */
export async function markSub2ApiAnnouncementRead(
  request: ApiServiceRequest,
  id: string | number,
): Promise<boolean> {
  const endpoint = `${SUB2API_ANNOUNCEMENTS_ENDPOINT}/${encodeURIComponent(
    String(id),
  )}/read`

  try {
    await fetchSub2ApiData<void>(
      request,
      endpoint,
      {
        method: "POST",
      },
      { allowMissingData: true },
    )

    return true
  } catch (error) {
    logger.warn("Failed to mark Sub2API announcement as read", {
      accountId: request.accountId,
      endpoint,
      error: getSafeErrorMessage(error),
    })
    return false
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
 * Resolve a Sub2API key secret without falling back to One/New API-compatible
 * `/api/token/{id}/key` semantics.
 *
 * Source: https://github.com/Wei-Shaw/sub2api
 * User key routes live under `/api/v1/keys`; upstream exposes list/get/create
 * DTOs with a full `key` directly and does not define a separate reveal
 * endpoint. The detail fallback below is defensive for forks or unexpected
 * cached/masked inventory data; it must stay inside Sub2API routes instead of
 * falling through to One/New API's `/api/token/{id}/key` contract.
 */
export async function resolveApiTokenKey(
  request: ApiServiceRequest,
  token: Pick<ApiToken, "id" | "key">,
): Promise<string> {
  return await resolveApiTokenKeyWithFetcher(
    request,
    token,
    async (detailRequest, tokenId) => {
      const detail = await fetchTokenById(detailRequest, tokenId)
      if (!hasUsableApiTokenKey(detail.key)) {
        throw new Error("token_secret_key_unresolvable")
      }

      return detail.key
    },
  )
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
 * Source: https://github.com/Wei-Shaw/sub2api - gateway /v1/models uses
 * runtime API-key auth and returns models visible to that key's group/platform.
 */
export async function fetchSub2ApiRuntimeModels(
  request: ApiServiceRequest,
): Promise<string[]> {
  const apiKey = normalizeRuntimeApiKey(request)
  if (!apiKey) {
    throw createRuntimeApiKeyAuthError()
  }

  const endpointUrl = createRuntimeModelsUrl(request.baseUrl)

  try {
    const response = await fetch(endpointUrl, {
      method: "GET",
      cache: "no-store",
      signal: request.abortSignal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (response.status === 401 || response.status === 403) {
      const businessError = await readRuntimeModelsBusinessError(response)
      if (businessError) {
        throw businessError
      }

      throw createRuntimeApiKeyAuthError()
    }

    if (!response.ok) {
      throw new ApiError(
        response.statusText || "Sub2API runtime model request failed",
        response.status,
        SUB2API_RUNTIME_MODELS_ENDPOINT,
        API_ERROR_CODES.HTTP_OTHER,
      )
    }

    return parseSub2ApiRuntimeModelIds(await readRuntimeModelsPayload(response))
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    logger.error("Failed to fetch Sub2API runtime models", {
      accountId: request.accountId,
      endpoint: SUB2API_RUNTIME_MODELS_ENDPOINT,
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
): Promise<CreateTokenResult> {
  try {
    const groupId = await resolveSelectedGroupId(request, tokenData.group)
    const payload = translateSub2ApiCreateTokenRequest(tokenData, groupId)

    const { data: created, request: hydratedRequest } =
      await fetchSub2ApiDataWithRequest<Sub2ApiKeyData | undefined>(
        request,
        SUB2API_KEYS_ENDPOINT,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        { allowMissingData: true },
      )

    if (!created || typeof created !== "object" || !("id" in created)) {
      return true
    }

    return parseSub2ApiKey(created, {
      defaultUserId: hydratedRequest.auth?.userId,
      endpoint: SUB2API_KEYS_ENDPOINT,
    })
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
