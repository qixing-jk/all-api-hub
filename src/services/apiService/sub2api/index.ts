/**
 * Sub2API API overrides.
 *
 * Sub2API differs from One-API/New-API backends in that authenticated endpoints
 * live under `/api/v1/*` and require a dashboard JWT.
 */
import { SITE_TYPES } from "~/constants/siteType"
import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
  TodayIncomeDataWithAvailability,
  TodayUsageData,
  TodayUsageDataWithAvailability,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { normalizeAccountSiteProfileUrlForOriginKey } from "~/services/accounts/accountSiteProfile"
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
import { fetchApi, fetchApiResponse } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  INVITE_LINK_FAILURE_REASONS,
  InviteLinkError,
} from "~/services/inviteLinks/errors"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  AuthTypeEnum,
  SiteHealthStatus,
  type AccountTodayMetricReason,
  type ApiToken,
  type CheckInConfig,
} from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import {
  getSub2ApiAuthSession,
  SUB2API_AUTH_PERSISTENCE_STATUSES,
  type Sub2ApiAuthPersistenceResult,
  type Sub2ApiAuthSession,
} from "./authSession"
import {
  parseSub2ApiProDailyCheckInMutationResponse,
  parseSub2ApiProDailyCheckInStatusResponse,
  SUB2API_PRO_DAILY_CHECK_IN_ENDPOINT,
  SUB2API_PRO_DAILY_CHECK_IN_STATUS_ENDPOINT,
  type Sub2ApiProDailyCheckInMutationResult,
} from "./checkIn"
import {
  buildSub2ApiGroupDescriptors,
  buildSub2ApiUserGroups,
  extractSub2ApiKeyItems,
  parseSub2ApiEnvelope,
  parseSub2ApiGroupRates,
  parseSub2ApiKey,
  parseSub2ApiTodayUsage,
  parseSub2ApiUserIdentity,
  resolveSub2ApiGroupId,
  translateSub2ApiCreateTokenRequest,
  translateSub2ApiUpdateTokenRequest,
} from "./parsing"
import { getSafeErrorMessage } from "./redaction"
import {
  refreshSub2ApiTokens,
  SUB2API_TOKEN_REFRESH_BUFFER_MS,
  SUB2API_TOKEN_REFRESH_FAILURE_REASONS,
  Sub2ApiTokenRefreshError,
} from "./tokenRefresh"
import {
  resyncSub2ApiAuthToken,
  Sub2ApiAuthIdentityMismatchError,
} from "./tokenResync"
import {
  SUB2API_AFFILIATE_ENDPOINT,
  SUB2API_ANNOUNCEMENTS_ENDPOINT,
  SUB2API_AUTH_ME_ENDPOINT,
  SUB2API_AVAILABLE_GROUPS_ENDPOINT,
  SUB2API_GROUP_RATES_ENDPOINT,
  SUB2API_KEYS_ENDPOINT,
  SUB2API_PUBLIC_SETTINGS_ENDPOINT,
  SUB2API_USAGE_STATS_ENDPOINT,
  type Sub2ApiAffiliateData,
  type Sub2ApiAnnouncementData,
  type Sub2ApiAnnouncementListData,
  type Sub2ApiAuthMeData,
  type Sub2ApiAuthMeResponse,
  type Sub2ApiGroupDescriptor,
  type Sub2ApiKeyData,
  type Sub2ApiKeyListData,
  type Sub2ApiPublicSettingsData,
  type Sub2ApiUsageStatsData,
} from "./type"

/**
 * Unified logger scoped to Sub2API site API overrides.
 */
const logger = createLogger("ApiService.Sub2API")
const DEFAULT_KEYS_PAGE = 1
const DEFAULT_KEYS_PAGE_SIZE = 100
const FULL_KEYS_PAGE_SIZE = 1000
const MAX_FULL_KEYS_PAGES = 1000
const SUB2API_KEY_INVENTORY_FAILURE_CODES = {
  DuplicateKey: "sub2api_key_inventory_duplicate_key",
  InvalidPagination: "sub2api_key_inventory_invalid_pagination",
  PageLimitExceeded: "sub2api_key_inventory_page_limit_exceeded",
  PageDidNotAdvance: "sub2api_key_inventory_page_did_not_advance",
} as const
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
  error instanceof Sub2ApiTokenRefreshError &&
  error.reason === SUB2API_TOKEN_REFRESH_FAILURE_REASONS.INVALID_REFRESH_TOKEN

const isUncertainSub2ApiRefreshRotation = (error: unknown): boolean =>
  error instanceof Sub2ApiTokenRefreshError &&
  error.reason === SUB2API_TOKEN_REFRESH_FAILURE_REASONS.UNCERTAIN_ROTATION

const isUnauthorizedError = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.statusCode === 401

type PersistableSub2ApiAuthUpdate = {
  accessToken: string
  userId?: string
  refreshToken?: string
  tokenExpiresAt?: number
}

class Sub2ApiAuthPersistenceError extends Error {
  constructor(public readonly result: Sub2ApiAuthPersistenceResult) {
    super(t("messages:sub2api.authPersistenceFailed"))
    this.name = "Sub2ApiAuthPersistenceError"
  }
}

const throwIfSub2ApiAuthPersistenceFailed = (error: unknown): void => {
  if (error instanceof Sub2ApiAuthPersistenceError) {
    throw error
  }
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
      const expectedUserId = normalizeAccountIdentity(userId)
      const storedUserId = normalizeAccountIdentity(storedAuth.userId)
      const expectedOrigin = normalizeAccountSiteProfileUrlForOriginKey({
        siteType: SITE_TYPES.SUB2API,
        url: request.baseUrl,
      })
      if (
        (storedUserId && expectedUserId && storedUserId !== expectedUserId) ||
        (storedAuth.origin && storedAuth.origin !== expectedOrigin)
      ) {
        throw new Sub2ApiAuthPersistenceError({
          status: SUB2API_AUTH_PERSISTENCE_STATUSES.IDENTITY_MISMATCH,
        })
      }

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
        userId = storedUserId ?? undefined
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
    return { status: SUB2API_AUTH_PERSISTENCE_STATUSES.PERSISTED } as const
  }

  if (!authSession) {
    return { status: SUB2API_AUTH_PERSISTENCE_STATUSES.PERSISTED } as const
  }

  const expectedUserId = normalizeAccountIdentity(request.auth?.userId)
  if (!expectedUserId) {
    throw new Sub2ApiAuthPersistenceError({
      status: SUB2API_AUTH_PERSISTENCE_STATUSES.IDENTITY_MISMATCH,
    })
  }

  let result: Sub2ApiAuthPersistenceResult
  try {
    result = await authSession.persistAuthUpdate(request.accountId, {
      ...authUpdate,
      expectedOrigin: request.baseUrl,
      expectedUserId,
    })
  } catch (error) {
    logger.warn("Failed to persist Sub2API auth update", {
      accountId: request.accountId,
      error: getSafeErrorMessage(error),
    })
    throw new Sub2ApiAuthPersistenceError({
      status: SUB2API_AUTH_PERSISTENCE_STATUSES.WRITE_FAILED,
    })
  }

  if (result.status !== SUB2API_AUTH_PERSISTENCE_STATUSES.PERSISTED) {
    throw new Sub2ApiAuthPersistenceError(result)
  }
  return result
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
      ...(authUpdate.userId ? { userId: authUpdate.userId } : {}),
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

const verifySub2ApiAuthIdentity = async <TRequest extends ApiServiceRequest>(
  request: TRequest,
  authUpdate: PersistableSub2ApiAuthUpdate,
): Promise<PersistableSub2ApiAuthUpdate> => {
  const expectedUserId = normalizeAccountIdentity(request.auth?.userId)
  if (!request.accountId || !getSub2ApiAuthSession(request)) {
    return authUpdate
  }
  if (!expectedUserId) {
    throw new Sub2ApiAuthPersistenceError({
      status: SUB2API_AUTH_PERSISTENCE_STATUSES.IDENTITY_MISMATCH,
    })
  }

  const verificationRequest = applySub2ApiAuthUpdate(request, authUpdate)
  let verified: Awaited<ReturnType<typeof fetchUserInfo>>
  try {
    verified = await fetchUserInfo(verificationRequest)
  } catch {
    throw new Sub2ApiTokenRefreshError(
      SUB2API_TOKEN_REFRESH_FAILURE_REASONS.UNCERTAIN_ROTATION,
    )
  }
  const verifiedUserId = normalizeAccountIdentity(verified.id)
  if (verifiedUserId !== expectedUserId) {
    throw new Sub2ApiAuthPersistenceError({
      status: SUB2API_AUTH_PERSISTENCE_STATUSES.IDENTITY_MISMATCH,
    })
  }

  return { ...authUpdate, userId: verifiedUserId }
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

    const verifiedRefresh = await verifySub2ApiAuthIdentity(
      latestRequest,
      refreshed,
    )
    const refreshedRequest = applySub2ApiAuthUpdate(
      latestRequest,
      verifiedRefresh,
    )
    await persistSub2ApiAuthUpdate(
      refreshedRequest,
      verifiedRefresh,
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

    const expectedUserId = normalizeAccountIdentity(latestRequest.auth?.userId)
    let resynced
    try {
      resynced = await resyncSub2ApiAuthToken(
        latestRequest.baseUrl,
        latestRequest.tempWindowRequestSource,
        latestRequest.protectionBypassExecution,
        expectedUserId ?? undefined,
      )
    } catch (error) {
      if (error instanceof Sub2ApiAuthIdentityMismatchError) {
        throw new Sub2ApiAuthPersistenceError({
          status: SUB2API_AUTH_PERSISTENCE_STATUSES.IDENTITY_MISMATCH,
        })
      }
      throw error
    }
    if (!resynced) {
      throw createLoginRequiredError(params.endpoint)
    }

    logger.info("Retrying Sub2API key request after JWT re-sync", {
      endpoint: params.endpoint,
      source: resynced.source,
    })

    const resyncedUpdate: PersistableSub2ApiAuthUpdate = {
      accessToken: resynced.accessToken,
      ...(resynced.userId ? { userId: resynced.userId } : {}),
      ...(resynced.sub2apiAuth?.refreshToken
        ? { refreshToken: resynced.sub2apiAuth.refreshToken }
        : {}),
      ...(typeof resynced.sub2apiAuth?.tokenExpiresAt === "number"
        ? { tokenExpiresAt: resynced.sub2apiAuth.tokenExpiresAt }
        : {}),
    }
    const resyncedRequest = applySub2ApiAuthUpdate(
      latestRequest,
      resyncedUpdate,
    )

    await persistSub2ApiAuthUpdate(
      resyncedRequest,
      resyncedUpdate,
      latestAuthSession,
    )

    return resyncedRequest
  })
}

type AuthenticatedSub2ApiRunner<T> = (request: ApiServiceRequest) => Promise<T>

type AuthenticatedSub2ApiRequestOptions = {
  proactiveRefresh?: boolean
  recoverUnauthorized?: boolean
  beforeUnauthorizedRetry?: (request: ApiServiceRequest) => Promise<void>
}

const runRecoveredSub2ApiRequest = async <T>(params: {
  request: ApiServiceRequest
  endpoint: string
  runner: AuthenticatedSub2ApiRunner<T>
  beforeUnauthorizedRetry?: (request: ApiServiceRequest) => Promise<void>
}): Promise<T> => {
  await params.beforeUnauthorizedRetry?.(params.request)
  try {
    return await params.runner(params.request)
  } catch (retryError) {
    if (isUnauthorizedError(retryError)) {
      throw createLoginRequiredError(params.endpoint)
    }
    throw retryError
  }
}

const retrySub2ApiRunnerWithResyncedAuth = async <T>(params: {
  request: ApiServiceRequest
  endpoint: string
  authSession?: Sub2ApiAuthSession
  runner: AuthenticatedSub2ApiRunner<T>
  beforeUnauthorizedRetry?: (request: ApiServiceRequest) => Promise<void>
}): Promise<T> => {
  const updatedRequest = await resyncSub2ApiRequestAuth({
    request: params.request,
    endpoint: params.endpoint,
    authSession: params.authSession,
  })

  return runRecoveredSub2ApiRequest({
    request: updatedRequest,
    endpoint: params.endpoint,
    runner: params.runner,
    beforeUnauthorizedRetry: params.beforeUnauthorizedRetry,
  })
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
  options: AuthenticatedSub2ApiRequestOptions = {},
): Promise<T> => {
  const hydrated = await hydrateSub2ApiAuthRequest(request)
  let effectiveRequest = normalizeJwtRequest(hydrated.request)
  let refreshToken = normalizeRefreshToken(effectiveRequest.auth?.refreshToken)
  const tokenExpiresAt = normalizeTokenExpiresAt(
    effectiveRequest.auth?.tokenExpiresAt,
  )

  if (
    options.proactiveRefresh !== false &&
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
      throwIfSub2ApiAuthPersistenceFailed(refreshError)
      if (isUncertainSub2ApiRefreshRotation(refreshError)) {
        effectiveRequest = await resyncSub2ApiRequestAuth({
          request: effectiveRequest,
          endpoint,
          authSession: hydrated.authSession,
        })
        refreshToken = normalizeRefreshToken(
          effectiveRequest.auth?.refreshToken,
        )
      } else {
        logger.warn("Sub2API proactive key auth refresh failed", {
          endpoint,
          error: getSafeErrorMessage(refreshError),
        })
      }
    }
  }

  try {
    return await runner(effectiveRequest)
  } catch (error) {
    if (!isUnauthorizedError(error)) {
      throw error
    }
    request.observer?.onPreHandlerUnauthorized?.()
    if (options.recoverUnauthorized === false) {
      throw error
    }

    if (refreshToken) {
      let refreshed: RefreshedSub2ApiRequest
      try {
        refreshed = await refreshSub2ApiRequestAuth({
          request: effectiveRequest,
          refreshToken,
          authSession: hydrated.authSession,
        })
      } catch (refreshError) {
        throwIfSub2ApiAuthPersistenceFailed(refreshError)
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
        } catch (resyncError) {
          throwIfSub2ApiAuthPersistenceFailed(resyncError)
          throw refreshError
        }

        return await runRecoveredSub2ApiRequest({
          request: updatedRequest,
          endpoint,
          runner,
          beforeUnauthorizedRetry: options.beforeUnauthorizedRetry,
        })
      }

      effectiveRequest = refreshed.request
      return await runRecoveredSub2ApiRequest({
        request: effectiveRequest,
        endpoint,
        runner,
        beforeUnauthorizedRetry: options.beforeUnauthorizedRetry,
      })
    }

    return await retrySub2ApiRunnerWithResyncedAuth({
      request: effectiveRequest,
      endpoint,
      authSession: hydrated.authSession,
      runner,
      beforeUnauthorizedRetry: options.beforeUnauthorizedRetry,
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

const fetchSub2ApiProDailyCheckInStatusWithRequest = async (
  request: ApiServiceRequest,
) => {
  const response = await fetchApiResponse<unknown>(request, {
    endpoint: SUB2API_PRO_DAILY_CHECK_IN_STATUS_ENDPOINT,
    options: { method: "GET", cache: "no-store" },
  })
  return parseSub2ApiProDailyCheckInStatusResponse(response)
}

/** Reads the pinned Sub2API Pro status without reactive GET-side auth replay. */
export async function fetchSub2ApiProDailyCheckInStatus(
  request: ApiServiceRequest,
) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    SUB2API_PRO_DAILY_CHECK_IN_STATUS_ENDPOINT,
    fetchSub2ApiProDailyCheckInStatusWithRequest,
    { proactiveRefresh: false, recoverUnauthorized: false },
  )
}

class Sub2ApiProRecoveredMutationBlockedError extends Error {
  constructor(
    public readonly result:
      | Exclude<Sub2ApiProDailyCheckInMutationResult, { kind: "applied" }>
      | { kind: "recovery_precondition_failed" },
  ) {
    super("Sub2API Pro recovered mutation blocked by status readback")
    this.name = "Sub2ApiProRecoveredMutationBlockedError"
  }
}

class Sub2ApiProRecoveredStatusUnavailableError extends Error {
  constructor() {
    super("Sub2API Pro recovered status readback unavailable")
    this.name = "Sub2ApiProRecoveredStatusUnavailableError"
  }
}

type Sub2ApiProDailyCheckInOperationResult =
  | Sub2ApiProDailyCheckInMutationResult
  | { kind: "recovery_status_unavailable" }
  | { kind: "recovery_precondition_failed" }

/** Executes one status-guarded mutation, including one safe middleware-401 recovery. */
export async function performSub2ApiProDailyCheckIn(
  request: ApiServiceRequest,
  options: { beforeRecoveredMutation?: () => Promise<boolean> } = {},
): Promise<Sub2ApiProDailyCheckInOperationResult> {
  try {
    return await executeAuthenticatedSub2ApiRequest(
      request,
      SUB2API_PRO_DAILY_CHECK_IN_ENDPOINT,
      async (authenticatedRequest) => {
        const response = await fetchApiResponse<unknown>(authenticatedRequest, {
          endpoint: SUB2API_PRO_DAILY_CHECK_IN_ENDPOINT,
          options: { method: "POST", cache: "no-store" },
        })
        return parseSub2ApiProDailyCheckInMutationResponse(response)
      },
      {
        beforeUnauthorizedRetry: async (recoveredRequest) => {
          const status = await fetchSub2ApiProDailyCheckInStatusWithRequest(
            recoveredRequest,
          ).catch(() => {
            throw new Sub2ApiProRecoveredStatusUnavailableError()
          })
          if (status.enabled && !status.checkedInToday) {
            if (
              options.beforeRecoveredMutation &&
              !(await options.beforeRecoveredMutation())
            ) {
              throw new Sub2ApiProRecoveredMutationBlockedError({
                kind: "recovery_precondition_failed",
              })
            }
            recoveredRequest.observer?.onPreHandlerUnauthorized?.()
            return
          }
          throw new Sub2ApiProRecoveredMutationBlockedError(
            status.checkedInToday
              ? { kind: "already_checked" }
              : { kind: "disabled" },
          )
        },
      },
    )
  } catch (error) {
    if (error instanceof Sub2ApiProRecoveredMutationBlockedError) {
      return error.result
    }
    if (error instanceof Sub2ApiProRecoveredStatusUnavailableError) {
      return { kind: "recovery_status_unavailable" }
    }
    throw error
  }
}

/**
 * Fetch deployment-owned settings that Sub2API exposes without authentication.
 * Source: https://github.com/Wei-Shaw/sub2api/blob/2bc139ab527b4a687546d145dc7bb9063cf14510/backend/internal/handler/dto/settings.go
 * `PublicSettings.site_name` is the canonical public deployment name.
 */
const fetchSub2ApiPublicSettings = async (
  request: ApiServiceRequest,
): Promise<Sub2ApiPublicSettingsData | undefined> => {
  const body = await fetchApi<unknown>(
    {
      ...request,
      auth: { authType: AuthTypeEnum.None },
    },
    {
      endpoint: SUB2API_PUBLIC_SETTINGS_ENDPOINT,
      options: { method: "GET", cache: "no-store" },
    },
    true,
  )

  return parseSub2ApiEnvelope<Sub2ApiPublicSettingsData>(
    body,
    SUB2API_PUBLIC_SETTINGS_ENDPOINT,
    { allowMissingData: true },
  )
}

/**
 * Fetch an opt-in Sub2API affiliate link from the deployment that owns the account.
 * The settings route is public, while the affiliate detail route uses the saved
 * dashboard JWT; the frontend builds a same-origin `/register?aff=` URL.
 * https://github.com/Wei-Shaw/sub2api/blob/main/backend/internal/handler/setting_handler.go
 * https://github.com/Wei-Shaw/sub2api/blob/main/backend/internal/handler/user_handler.go
 * https://github.com/Wei-Shaw/sub2api/blob/main/frontend/src/views/user/AffiliateView.vue
 */
export async function fetchInviteLink(
  request: ApiServiceRequest,
): Promise<string> {
  const publicSettings = await fetchSub2ApiPublicSettings(request)

  if (
    !publicSettings ||
    typeof publicSettings !== "object" ||
    Array.isArray(publicSettings) ||
    typeof publicSettings.affiliate_enabled !== "boolean"
  ) {
    throw new InviteLinkError(INVITE_LINK_FAILURE_REASONS.InvalidResponse)
  }

  if (!publicSettings.affiliate_enabled) {
    throw new InviteLinkError(INVITE_LINK_FAILURE_REASONS.FeatureDisabled)
  }

  const affiliate = await fetchSub2ApiData<Sub2ApiAffiliateData>(
    request,
    SUB2API_AFFILIATE_ENDPOINT,
    { method: "GET", cache: "no-store" },
    { allowMissingData: true },
  )
  const inviteCode =
    affiliate &&
    typeof affiliate === "object" &&
    !Array.isArray(affiliate) &&
    typeof affiliate.aff_code === "string"
      ? affiliate.aff_code.trim()
      : ""

  if (!inviteCode) {
    throw new InviteLinkError(INVITE_LINK_FAILURE_REASONS.InviteDataMissing)
  }

  const origin = new URL(request.baseUrl).origin
  return `${origin}/register?aff=${encodeURIComponent(inviteCode)}`
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

/**
 * Source: https://github.com/Wei-Shaw/sub2api
 * Available groups expose numeric IDs, while group rates are keyed by those
 * IDs. Display names are disclosure only and are not round-tripped as identity.
 */
export async function fetchSub2ApiGroupDescriptors(
  request: ApiServiceRequest,
): Promise<Sub2ApiGroupDescriptor[]> {
  try {
    const [groups, rates] = await Promise.all([
      fetchAvailableGroupsInternal(request),
      fetchGroupRatesInternal(request),
    ])

    return buildSub2ApiGroupDescriptors(groups, rates, {
      groups: SUB2API_AVAILABLE_GROUPS_ENDPOINT,
      rates: SUB2API_GROUP_RATES_ENDPOINT,
    })
  } catch (error) {
    logger.error("Failed to fetch Sub2API group descriptors", {
      accountId: request.accountId,
      error: getSafeErrorMessage(error),
    })
    throw error
  }
}

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
  const currentUser = await fetchCurrentUser(request)
  let todayUsage = createZeroTodayUsage(
    ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
  )

  try {
    todayUsage = await fetchTodayUsage(request)
  } catch (error) {
    logger.warn("Failed to fetch Sub2API today usage; using zero defaults", {
      accountId: request.accountId,
      error: getSafeErrorMessage(error),
    })
  }

  return { currentUser, todayUsage }
}

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

  const { currentUser, todayUsage } = await fetchCurrentUserAndTodayUsage(
    retryRequest as ApiServiceAccountRequest,
  )

  return createRefreshSuccessResult(currentUser, params.checkIn, todayUsage, {
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
        throwIfSub2ApiAuthPersistenceFailed(refreshError)
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
      throwIfSub2ApiAuthPersistenceFailed(refreshError)
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
 * Sub2API does not expose the One-API-style public `/api/status` endpoint, so
 * adapt its native public settings into the shared status contract. Name lookup
 * remains optional so a transient settings failure cannot block account setup.
 */
export async function fetchSiteStatus(
  request: ApiServiceRequest,
): Promise<SiteStatusInfo> {
  try {
    const publicSettings = await fetchSub2ApiPublicSettings(request)
    const siteName =
      typeof publicSettings?.site_name === "string"
        ? publicSettings.site_name.trim()
        : ""

    return {
      ...(siteName ? { system_name: siteName } : {}),
      checkin_enabled: false,
    }
  } catch (error) {
    logger.warn("Failed to fetch optional Sub2API site name", {
      endpoint: SUB2API_PUBLIC_SETTINGS_ENDPOINT,
      error: getSafeErrorMessage(error),
    })

    return {
      checkin_enabled: false,
    }
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
export async function fetchTodayUsage(
  request: ApiServiceAccountRequest,
): Promise<TodayUsageDataWithAvailability> {
  if (request.includeTodayCashflow === false) {
    return createZeroTodayUsage(ACCOUNT_TODAY_METRIC_REASONS.NotCollected)
  }

  const endpoint = createSub2ApiUsageStatsEndpoint()
  const data = await fetchSub2ApiData<Sub2ApiUsageStatsData>(
    request,
    endpoint,
    {
      method: "GET",
      cache: "no-store",
    },
  )

  return parseSub2ApiTodayUsage(data, endpoint)
}

/**
 * Sub2API income stats are not mapped separately; return zero.
 */
export async function fetchTodayIncome(
  _request: ApiServiceRequest,
): Promise<TodayIncomeDataWithAvailability> {
  return {
    today_income: 0,
    todayStatsAvailability: { income: createSub2ApiIncomeAvailability() },
  }
}

/**
 * Fetch Sub2API account data: quota + zeroed today stats and check-in disabled.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const checkIn = request.checkIn

  const { currentUser, todayUsage } =
    await fetchCurrentUserAndTodayUsage(request)

  return createAccountData(currentUser, checkIn, todayUsage)
}

/**
 * Refresh Sub2API account data and return a normalized `RefreshAccountResult`.
 */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  const checkIn = request.checkIn
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
          throwIfSub2ApiAuthPersistenceFailed(refreshError)
          if (isUncertainSub2ApiRefreshRotation(refreshError)) {
            effectiveRequest = await resyncSub2ApiRequestAuth({
              request: effectiveRequest,
              endpoint: SUB2API_AUTH_ME_ENDPOINT,
              authSession: hydratedRequest.authSession,
            })
            refreshToken = normalizeRefreshToken(
              effectiveRequest.auth?.refreshToken,
            )
            tokenExpiresAt = normalizeTokenExpiresAt(
              effectiveRequest.auth?.tokenExpiresAt,
            )
            hasProactiveRefreshUpdate = true
          } else {
            logger.warn("Sub2API proactive token refresh failed", {
              error: getSafeErrorMessage(refreshError),
            })
          }
        }
      }
    }

    const { currentUser, todayUsage } =
      await fetchCurrentUserAndTodayUsage(effectiveRequest)

    return createRefreshSuccessResult(currentUser, checkIn, todayUsage, {
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
    if (error instanceof Sub2ApiAuthPersistenceError) {
      return {
        success: false,
        healthStatus: createAuthPersistenceFailureHealthStatus(),
      }
    }
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

          const { currentUser, todayUsage } =
            await fetchCurrentUserAndTodayUsage(retryRequest)

          return createRefreshSuccessResult(currentUser, checkIn, todayUsage, {
            accessToken: retryRequest.auth.accessToken,
            sub2apiAuth: {
              refreshToken: refreshed.refreshToken,
              tokenExpiresAt: refreshed.tokenExpiresAt,
            },
          })
        } catch (refreshError) {
          throwIfSub2ApiAuthPersistenceFailed(refreshError)
          logger.warn("Failed to restore Sub2API session via refresh token", {
            error: getSafeErrorMessage(refreshError),
          })

          try {
            return await refreshSub2ApiAccountViaResync({
              request: effectiveRequest,
              authSession: hydratedRequest.authSession,
              checkIn,
            })
          } catch (resyncError) {
            return {
              success: false,
              healthStatus:
                resyncError instanceof Sub2ApiAuthPersistenceError
                  ? createAuthPersistenceFailureHealthStatus()
                  : createRefreshTokenRestoreRequiredHealthStatus(),
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
        if (retryError instanceof Sub2ApiAuthPersistenceError) {
          return {
            success: false,
            healthStatus: createAuthPersistenceFailureHealthStatus(),
          }
        }
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

type Sub2ApiKeyPage = {
  tokens: ApiToken[]
  totalPages: number
  reportedPage?: number
}

const createSub2ApiKeyInventoryError = (
  endpoint: string,
  upstreamCode: (typeof SUB2API_KEY_INVENTORY_FAILURE_CODES)[keyof typeof SUB2API_KEY_INVENTORY_FAILURE_CODES],
) =>
  new ApiError(
    t("messages:errors.api.invalidResponseFormat"),
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
    upstreamCode,
  )

const fetchAccountTokenPage = async (
  request: ApiServiceRequest,
  page: number,
  size: number,
): Promise<Sub2ApiKeyPage> => {
  const endpoint = createSub2ApiKeysEndpoint(page, size)

  try {
    const { data, request: hydratedRequest } =
      await fetchSub2ApiDataWithRequest<Sub2ApiKeyListData>(request, endpoint, {
        method: "GET",
        cache: "no-store",
      })
    const reportedPage = Array.isArray(data) ? undefined : data.page
    const reportedTotalPages = Array.isArray(data) ? undefined : data.pages
    if (
      reportedPage !== undefined &&
      (!Number.isSafeInteger(reportedPage) || reportedPage <= 0)
    ) {
      throw createSub2ApiKeyInventoryError(
        endpoint,
        SUB2API_KEY_INVENTORY_FAILURE_CODES.InvalidPagination,
      )
    }
    if (
      reportedTotalPages !== undefined &&
      (!Number.isSafeInteger(reportedTotalPages) || reportedTotalPages <= 0)
    ) {
      throw createSub2ApiKeyInventoryError(
        endpoint,
        SUB2API_KEY_INVENTORY_FAILURE_CODES.InvalidPagination,
      )
    }

    return {
      tokens: extractSub2ApiKeyItems(data).map((item) =>
        parseSub2ApiKey(item, {
          defaultUserId: hydratedRequest.auth?.userId,
          endpoint,
        }),
      ),
      totalPages: Array.isArray(data)
        ? DEFAULT_KEYS_PAGE
        : Math.max(page, reportedTotalPages ?? page),
      ...(reportedPage === undefined ? {} : { reportedPage }),
    }
  } catch (error) {
    logger.error("Failed to fetch Sub2API keys", {
      accountId: request.accountId,
      endpoint,
      error: getSafeErrorMessage(error),
    })
    throw error
  }
}

/** Fetch the complete API-token inventory for all key-management consumers. */
export async function fetchAccountTokens(
  request: ApiServiceRequest,
): Promise<ApiToken[]> {
  const tokens: ApiToken[] = []
  const seenTokenIds = new Set<number>()
  let page = DEFAULT_KEYS_PAGE

  // Upstream paginates this endpoint and caps page_size at 1000:
  // https://github.com/Wei-Shaw/sub2api/blob/main/backend/internal/pkg/response/response.go
  while (true) {
    const result = await fetchAccountTokenPage(
      request,
      page,
      FULL_KEYS_PAGE_SIZE,
    )
    const endpoint = createSub2ApiKeysEndpoint(page, FULL_KEYS_PAGE_SIZE)
    if (result.totalPages > MAX_FULL_KEYS_PAGES) {
      throw createSub2ApiKeyInventoryError(
        endpoint,
        SUB2API_KEY_INVENTORY_FAILURE_CODES.PageLimitExceeded,
      )
    }
    if (result.reportedPage !== undefined && result.reportedPage !== page) {
      throw createSub2ApiKeyInventoryError(
        endpoint,
        SUB2API_KEY_INVENTORY_FAILURE_CODES.PageDidNotAdvance,
      )
    }
    for (const token of result.tokens) {
      if (seenTokenIds.has(token.id)) {
        throw createSub2ApiKeyInventoryError(
          endpoint,
          SUB2API_KEY_INVENTORY_FAILURE_CODES.DuplicateKey,
        )
      }
      seenTokenIds.add(token.id)
    }
    tokens.push(...result.tokens)

    if (page >= result.totalPages) {
      return tokens
    }

    page += 1
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
const createSub2ApiTokenWithGroupId = async (
  request: ApiServiceRequest,
  tokenData: CreateTokenRequest,
  groupId?: number,
): Promise<CreateTokenResult> => {
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
}

/**
 * Creates a key for an exact provider-owned group identity.
 *
 * Source: https://github.com/Wei-Shaw/sub2api
 * Sub2API's create-key DTO accepts `group_id`; native reconciliation must not
 * round-trip a display name when distinct groups may share that label.
 */
export async function createSub2ApiTokenForGroupId(
  request: ApiServiceRequest,
  tokenData: CreateTokenRequest,
  groupId: number,
): Promise<CreateTokenResult> {
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    throw new ApiError(
      "Invalid Sub2API group id",
      undefined,
      SUB2API_KEYS_ENDPOINT,
      API_ERROR_CODES.BUSINESS_ERROR,
      "sub2api_invalid_group_id",
    )
  }

  try {
    return await createSub2ApiTokenWithGroupId(request, tokenData, groupId)
  } catch (error) {
    logger.error("Failed to create Sub2API key for native group id", {
      accountId: request.accountId,
      endpoint: SUB2API_KEYS_ENDPOINT,
      error: getSafeErrorMessage(error),
    })
    throw error
  }
}

/**
 * Create a new API token in Sub2API with the specified data, resolving the
 * legacy group name to an ID as needed.
 */
export async function createApiToken(
  request: ApiServiceRequest,
  tokenData: CreateTokenRequest,
): Promise<CreateTokenResult> {
  try {
    const groupId = await resolveSelectedGroupId(request, tokenData.group)
    return await createSub2ApiTokenWithGroupId(request, tokenData, groupId)
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
