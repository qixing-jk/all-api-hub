import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_BROWSER_SESSION_SOURCES } from "~/services/accountBrowserSession"
import { normalizeAccountSiteProfileUrlForOriginKey } from "~/services/accounts/accountSiteProfile/urls"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import { fetchSub2ApiAuthIdentity } from "~/services/apiService/sub2api/auth/authIdentity"
import {
  getSub2ApiAuthSession,
  SUB2API_AUTH_PERSISTENCE_STATUSES,
  type Sub2ApiAuthPersistenceResult,
  type Sub2ApiAuthSession,
  type Sub2ApiPersistAuthUpdate,
} from "~/services/apiService/sub2api/auth/authSession"
import {
  recoverSub2ApiBrowserAuth,
  Sub2ApiAuthIdentityMismatchError,
  type Sub2ApiBrowserAuth,
} from "~/services/apiService/sub2api/auth/browserAuth"
import {
  refreshSub2ApiTokens,
  SUB2API_TOKEN_REFRESH_BUFFER_MS,
  SUB2API_TOKEN_REFRESH_FAILURE_REASONS,
  Sub2ApiTokenRefreshError,
} from "~/services/apiService/sub2api/auth/tokenRefresh"
import { getSafeErrorMessage } from "~/services/apiService/sub2api/redaction"
import {
  SUB2API_AUTH_ME_ENDPOINT,
  SUB2API_SESSION_BINDING_MISMATCH_CODE,
} from "~/services/apiService/sub2api/type"
import {
  API_ERROR_CODES,
  ApiError,
  isAuthenticationRequiredError,
} from "~/services/apiTransport/errors"
import { notifyApiTransportObserver } from "~/services/apiTransport/request"
import {
  API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES,
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
import { createKeyedTaskQueue } from "~/services/core/keyedTaskQueue"
import { STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("ApiService.Sub2API.AuthLifecycle")
const sub2ApiAuthMutationQueue = createKeyedTaskQueue()
const SUB2API_AUTH_ERROR_CODES = {
  REFRESH_TOKEN_INVALID: "sub2api_refresh_token_invalid",
} as const

type PersistableSub2ApiAuthUpdate = {
  accessToken: string
  userId?: string
  refreshToken?: string
  tokenExpiresAt?: number
  clearRefreshCredentials?: boolean
}

type HydratedSub2ApiAuth<
  TRequest extends ApiServiceRequest = ApiServiceRequest,
> = {
  request: TRequest
  authSession?: Sub2ApiAuthSession
  storedAuth?: Sub2ApiPersistAuthUpdate["expectedAuth"]
}

type AuthenticatedSub2ApiRunner<T> = (request: ApiServiceRequest) => Promise<T>

type AuthenticatedSub2ApiRequestOptions = {
  proactiveRefresh?: boolean
  /** Allow read-only probes to skip refresh and browser recovery for absent tokens. */
  recoverMissingAccessToken?: boolean
  recoverUnauthorized?: boolean
  recoverInvalidRefreshTokenViaBrowser?: boolean
  beforeUnauthorizedRetry?: (request: ApiServiceRequest) => Promise<void>
}

class Sub2ApiAuthPersistenceError extends Error {
  constructor(public readonly result: Sub2ApiAuthPersistenceResult) {
    super(t("messages:sub2api.authPersistenceFailed"))
    this.name = "Sub2ApiAuthPersistenceError"
  }
}

const isCloseToExpiry = (tokenExpiresAt: number): boolean =>
  tokenExpiresAt - Date.now() <= SUB2API_TOKEN_REFRESH_BUFFER_MS

export const normalizeSub2ApiAccessToken = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

export const normalizeSub2ApiRefreshToken = (value: unknown): string =>
  normalizeSub2ApiAccessToken(value)

export const normalizeSub2ApiTokenExpiresAt = (
  value: unknown,
): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined

export const normalizeSub2ApiJwtRequest = <TRequest extends ApiServiceRequest>(
  request: TRequest,
): TRequest => {
  const accessToken = normalizeSub2ApiAccessToken(request.auth?.accessToken)
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

export const didSub2ApiAuthChange = (
  previousRequest: ApiServiceRequest,
  nextRequest: ApiServiceRequest,
): boolean =>
  normalizeSub2ApiAccessToken(previousRequest.auth?.accessToken) !==
    normalizeSub2ApiAccessToken(nextRequest.auth?.accessToken) ||
  normalizeSub2ApiRefreshToken(previousRequest.auth?.refreshToken) !==
    normalizeSub2ApiRefreshToken(nextRequest.auth?.refreshToken) ||
  normalizeSub2ApiTokenExpiresAt(previousRequest.auth?.tokenExpiresAt) !==
    normalizeSub2ApiTokenExpiresAt(nextRequest.auth?.tokenExpiresAt)

const createLoginRequiredError = (endpoint: string, cause?: ApiError) =>
  new ApiError(
    t("messages:sub2api.loginRequired"),
    401,
    endpoint,
    API_ERROR_CODES.HTTP_401,
    undefined,
    cause,
  )

const createRefreshTokenInvalidError = (endpoint: string) =>
  new ApiError(
    t("messages:sub2api.refreshTokenInvalid"),
    401,
    endpoint,
    API_ERROR_CODES.HTTP_401,
    SUB2API_AUTH_ERROR_CODES.REFRESH_TOKEN_INVALID,
  )

export const isSub2ApiRefreshTokenInvalidError = (
  error: unknown,
): error is ApiError =>
  error instanceof ApiError &&
  error.upstreamCode === SUB2API_AUTH_ERROR_CODES.REFRESH_TOKEN_INVALID

const isSub2ApiRefreshTokenContractError = (error: unknown): boolean =>
  error instanceof Sub2ApiTokenRefreshError &&
  error.reason === SUB2API_TOKEN_REFRESH_FAILURE_REASONS.INVALID_REFRESH_TOKEN

const isUncertainSub2ApiRefreshRotation = (error: unknown): boolean =>
  error instanceof Sub2ApiTokenRefreshError &&
  error.reason === SUB2API_TOKEN_REFRESH_FAILURE_REASONS.UNCERTAIN_ROTATION

const isSub2ApiSessionBindingMismatch = (error: unknown): boolean =>
  (error instanceof ApiError &&
    error.upstreamCode === SUB2API_SESSION_BINDING_MISMATCH_CODE) ||
  (error instanceof Sub2ApiTokenRefreshError &&
    error.reason ===
      SUB2API_TOKEN_REFRESH_FAILURE_REASONS.SESSION_BINDING_MISMATCH)

const throwIfSub2ApiAuthPersistenceFailed = (error: unknown): void => {
  if (error instanceof Sub2ApiAuthPersistenceError) {
    throw error
  }
}

const hydrateSub2ApiAuthRequest = async <TRequest extends ApiServiceRequest>(
  request: TRequest,
): Promise<HydratedSub2ApiAuth<TRequest>> => {
  let accessToken = normalizeSub2ApiAccessToken(request.auth?.accessToken)
  let refreshToken = normalizeSub2ApiRefreshToken(request.auth?.refreshToken)
  let tokenExpiresAt = normalizeSub2ApiTokenExpiresAt(
    request.auth?.tokenExpiresAt,
  )
  let userId = request.auth?.userId
  const authSession = getSub2ApiAuthSession(request)
  let storedPair: Sub2ApiPersistAuthUpdate["expectedAuth"]

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

      const storedAccessToken = normalizeSub2ApiAccessToken(
        storedAuth.accessToken,
      )
      const storedRefreshToken = normalizeSub2ApiRefreshToken(
        storedAuth.sub2apiAuth?.refreshToken,
      )
      const storedTokenExpiresAt = normalizeSub2ApiTokenExpiresAt(
        storedAuth.sub2apiAuth?.tokenExpiresAt,
      )
      storedPair = {
        accessToken: storedAccessToken,
        refreshToken: storedRefreshToken || undefined,
      }
      // A saved credential is one snapshot, including cleared renewal fields.
      accessToken = storedAccessToken
      refreshToken = storedRefreshToken
      tokenExpiresAt = storedTokenExpiresAt
      if (userId === undefined) userId = storedUserId ?? undefined
    }
  }

  const auth = { ...request.auth }
  delete auth.refreshToken
  delete auth.tokenExpiresAt
  return {
    request: {
      ...request,
      auth: {
        ...auth,
        authType: AuthTypeEnum.AccessToken,
        accessToken,
        ...(refreshToken ? { refreshToken } : {}),
        ...(typeof tokenExpiresAt === "number" ? { tokenExpiresAt } : {}),
        ...(userId !== undefined ? { userId } : {}),
      },
    } as TRequest,
    authSession,
    storedAuth: storedPair,
  }
}

const persistSub2ApiAuthUpdate = async (
  request: ApiServiceRequest,
  authUpdate: PersistableSub2ApiAuthUpdate,
  authSession: Sub2ApiAuthSession | undefined,
  expectedAuth: Sub2ApiPersistAuthUpdate["expectedAuth"],
) => {
  if (!request.accountId || !authSession) {
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
      ...(expectedAuth ? { expectedAuth } : {}),
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
): TRequest => {
  const auth = { ...request.auth }
  if (authUpdate.clearRefreshCredentials) {
    delete auth.refreshToken
    delete auth.tokenExpiresAt
  }

  return {
    ...request,
    auth: {
      ...auth,
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
  } as TRequest
}

const createSub2ApiAuthMutationLockKey = (
  request: ApiServiceRequest,
): string => {
  const lockToken =
    normalizeSub2ApiRefreshToken(request.auth?.refreshToken) ||
    normalizeSub2ApiAccessToken(request.auth?.accessToken) ||
    "anonymous"
  return `origin:${request.baseUrl}:${lockToken}`
}

const withSub2ApiAuthMutationLock = async <T>(
  request: ApiServiceRequest,
  runner: () => Promise<T>,
): Promise<T> => {
  if (request.accountId) {
    return withExtensionStorageWriteLock(
      `${STORAGE_LOCKS.SUB2API_SESSION_AUTH}:${request.accountId}`,
      runner,
    )
  }
  return sub2ApiAuthMutationQueue.run(
    createSub2ApiAuthMutationLockKey(request),
    runner,
  )
}

const createSub2ApiBrowserAuthUpdate = (
  browserAuth: Sub2ApiBrowserAuth,
): PersistableSub2ApiAuthUpdate => ({
  accessToken: browserAuth.accessToken,
  ...(browserAuth.userId ? { userId: browserAuth.userId } : {}),
  ...(browserAuth.sub2apiAuth?.refreshToken
    ? { refreshToken: browserAuth.sub2apiAuth.refreshToken }
    : {}),
  ...(typeof browserAuth.sub2apiAuth?.tokenExpiresAt === "number"
    ? { tokenExpiresAt: browserAuth.sub2apiAuth.tokenExpiresAt }
    : {}),
  ...(!browserAuth.sub2apiAuth?.refreshToken
    ? { clearRefreshCredentials: true }
    : {}),
})

const applySub2ApiBrowserAuth = <TRequest extends ApiServiceRequest>(
  request: TRequest,
  browserAuth: Sub2ApiBrowserAuth,
): TRequest => {
  const authRequest = applySub2ApiAuthUpdate(
    request,
    createSub2ApiBrowserAuthUpdate(browserAuth),
  )
  return {
    ...authRequest,
    // A session-read temp tab is released before this retry. Keep the retry in
    // TempContext so its network fingerprint cannot fall back to the extension.
    ...(browserAuth.source === ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW
      ? { forceTempWindow: true }
      : {}),
    ...(browserAuth.fetchContext
      ? {
          fetchContext: browserAuth.fetchContext,
          ...(browserAuth.fetchContext.kind ===
          API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB
            ? {
                currentTabFallback:
                  API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES.Forbid,
              }
            : {}),
        }
      : {}),
  } as TRequest
}

const verifySub2ApiAuthIdentity = async <TRequest extends ApiServiceRequest>(
  request: TRequest,
  authUpdate: PersistableSub2ApiAuthUpdate,
): Promise<PersistableSub2ApiAuthUpdate> => {
  const expectedUserId = normalizeAccountIdentity(request.auth?.userId)
  if (!request.accountId || !getSub2ApiAuthSession(request)) return authUpdate
  if (!expectedUserId) {
    throw new Sub2ApiAuthPersistenceError({
      status: SUB2API_AUTH_PERSISTENCE_STATUSES.IDENTITY_MISMATCH,
    })
  }

  try {
    const verified = await fetchSub2ApiAuthIdentity(
      applySub2ApiAuthUpdate(request, authUpdate),
    )
    const verifiedUserId = normalizeAccountIdentity(verified.identity.userId)
    if (verifiedUserId !== expectedUserId) {
      throw new Sub2ApiAuthPersistenceError({
        status: SUB2API_AUTH_PERSISTENCE_STATUSES.IDENTITY_MISMATCH,
      })
    }
    return { ...authUpdate, userId: verifiedUserId }
  } catch (error) {
    if (error instanceof Sub2ApiAuthPersistenceError) throw error
    throw new Sub2ApiTokenRefreshError(
      SUB2API_TOKEN_REFRESH_FAILURE_REASONS.UNCERTAIN_ROTATION,
    )
  }
}

const refreshSub2ApiRequestAuth = async <
  TRequest extends ApiServiceRequest,
>(params: {
  request: TRequest
  authSession?: Sub2ApiAuthSession
}): Promise<TRequest> =>
  withSub2ApiAuthMutationLock(params.request, async () => {
    const latestHydrated = await hydrateSub2ApiAuthRequest(params.request)
    const latestRequest = latestHydrated.request
    const latestAuthSession = latestHydrated.authSession ?? params.authSession
    const latestRefreshToken = normalizeSub2ApiRefreshToken(
      latestRequest.auth?.refreshToken,
    )

    if (
      didSub2ApiAuthChange(params.request, latestRequest) &&
      normalizeSub2ApiAccessToken(latestRequest.auth?.accessToken)
    ) {
      return latestRequest
    }

    const refreshed = await refreshSub2ApiTokens({
      request: latestRequest,
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
      latestHydrated.storedAuth,
    )
    return refreshedRequest
  })

const recoverSub2ApiRequestAuth = async <
  TRequest extends ApiServiceRequest,
>(params: {
  request: TRequest
  endpoint: string
  authSession?: Sub2ApiAuthSession
  /** Original renewal failure; browser absence cannot establish its rejection. */
  refreshError?: unknown
}): Promise<TRequest> =>
  withSub2ApiAuthMutationLock(params.request, async () => {
    const latestHydrated = await hydrateSub2ApiAuthRequest(params.request)
    const latestRequest = latestHydrated.request
    const latestAuthSession = latestHydrated.authSession ?? params.authSession
    if (didSub2ApiAuthChange(params.request, latestRequest))
      return latestRequest

    const expectedUserId = normalizeAccountIdentity(latestRequest.auth?.userId)
    let resynced: Sub2ApiBrowserAuth | null
    try {
      resynced = await recoverSub2ApiBrowserAuth({
        baseUrl: latestRequest.baseUrl,
        ...(expectedUserId ? { expectedUserId } : {}),
        ...(latestRequest.tempWindowRequestSource
          ? {
              tempWindowRequestSource: latestRequest.tempWindowRequestSource,
            }
          : {}),
        ...(latestRequest.protectionBypassExecution
          ? {
              protectionBypassExecution:
                latestRequest.protectionBypassExecution,
            }
          : {}),
      })
    } catch (error) {
      if (error instanceof Sub2ApiAuthIdentityMismatchError) {
        throw new Sub2ApiAuthPersistenceError({
          status: SUB2API_AUTH_PERSISTENCE_STATUSES.IDENTITY_MISMATCH,
        })
      }
      throw error
    }
    if (!resynced) {
      if (isUncertainSub2ApiRefreshRotation(params.refreshError))
        throw params.refreshError
      throw createLoginRequiredError(params.endpoint)
    }

    logger.info("Retrying Sub2API authenticated request after JWT re-sync", {
      endpoint: params.endpoint,
      source: resynced.source,
    })
    const resyncedUpdate = createSub2ApiBrowserAuthUpdate(resynced)
    const browserBoundRequest = applySub2ApiBrowserAuth(latestRequest, resynced)
    await persistSub2ApiAuthUpdate(
      browserBoundRequest,
      resyncedUpdate,
      latestAuthSession,
      latestHydrated.storedAuth,
    )
    return browserBoundRequest
  })

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
    if (isAuthenticationRequiredError(retryError)) {
      throw createLoginRequiredError(params.endpoint, retryError)
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
  const updatedRequest = await recoverSub2ApiRequestAuth({
    request: params.request,
    endpoint: params.endpoint,
    authSession: params.authSession,
  })
  return await runRecoveredSub2ApiRequest({
    request: updatedRequest,
    endpoint: params.endpoint,
    runner: params.runner,
    beforeUnauthorizedRetry: params.beforeUnauthorizedRetry,
  })
}

/**
 * Executes one Sub2API operation with browser-context affinity, credential
 * hydration, single-use token rotation, identity verification, and bounded
 * unauthorized recovery hidden behind one interface.
 */
async function executeSub2ApiAuthLifecycle<T>(
  state: { request: ApiServiceRequest },
  endpoint: string,
  runner: AuthenticatedSub2ApiRunner<T>,
  options: AuthenticatedSub2ApiRequestOptions = {},
): Promise<T> {
  const hydrated = await hydrateSub2ApiAuthRequest(state.request)
  state.request = hydrated.request
  const accessToken = normalizeSub2ApiAccessToken(
    state.request.auth?.accessToken,
  )

  if (!accessToken && options.recoverMissingAccessToken !== false) {
    if (normalizeSub2ApiRefreshToken(state.request.auth?.refreshToken)) {
      try {
        const refreshed = await refreshSub2ApiRequestAuth({
          request: state.request,
          authSession: hydrated.authSession,
        })
        state.request = refreshed
      } catch (refreshError) {
        throwIfSub2ApiAuthPersistenceFailed(refreshError)
        state.request = await recoverSub2ApiRequestAuth({
          request: state.request,
          endpoint,
          authSession: hydrated.authSession,
          refreshError,
        })
      }
    } else {
      state.request = await recoverSub2ApiRequestAuth({
        request: state.request,
        endpoint,
        authSession: hydrated.authSession,
      })
    }
  }

  state.request = normalizeSub2ApiJwtRequest(state.request)
  let refreshToken = normalizeSub2ApiRefreshToken(
    state.request.auth.refreshToken,
  )
  const tokenExpiresAt = normalizeSub2ApiTokenExpiresAt(
    state.request.auth.tokenExpiresAt,
  )
  if (
    options.proactiveRefresh !== false &&
    refreshToken &&
    typeof tokenExpiresAt === "number" &&
    isCloseToExpiry(tokenExpiresAt)
  ) {
    try {
      const refreshed = await refreshSub2ApiRequestAuth({
        request: state.request,
        authSession: hydrated.authSession,
      })
      state.request = refreshed
      refreshToken = normalizeSub2ApiRefreshToken(refreshed.auth.refreshToken)
    } catch (refreshError) {
      throwIfSub2ApiAuthPersistenceFailed(refreshError)
      if (
        isUncertainSub2ApiRefreshRotation(refreshError) ||
        isSub2ApiSessionBindingMismatch(refreshError)
      ) {
        state.request = await recoverSub2ApiRequestAuth({
          request: state.request,
          endpoint,
          authSession: hydrated.authSession,
          refreshError,
        })
        refreshToken = normalizeSub2ApiRefreshToken(
          state.request.auth?.refreshToken,
        )
      } else {
        logger.warn("Sub2API proactive auth refresh failed", {
          endpoint,
          error: getSafeErrorMessage(refreshError),
        })
      }
    }
  }

  try {
    return await runner(state.request)
  } catch (error) {
    if (!isAuthenticationRequiredError(error)) throw error
    notifyApiTransportObserver(
      state.request.observer,
      "onPreHandlerUnauthorized",
    )
    if (options.recoverUnauthorized === false) throw error

    if (isSub2ApiSessionBindingMismatch(error)) {
      return await retrySub2ApiRunnerWithResyncedAuth({
        request: state.request,
        endpoint,
        authSession: hydrated.authSession,
        runner,
        beforeUnauthorizedRetry: options.beforeUnauthorizedRetry,
      })
    }

    if (refreshToken) {
      let refreshed: ApiServiceRequest
      try {
        refreshed = await refreshSub2ApiRequestAuth({
          request: state.request,
          authSession: hydrated.authSession,
        })
      } catch (refreshError) {
        throwIfSub2ApiAuthPersistenceFailed(refreshError)
        logger.warn(
          "Failed to restore Sub2API authenticated request via refresh token",
          { endpoint, error: getSafeErrorMessage(refreshError) },
        )
        if (
          isSub2ApiRefreshTokenContractError(refreshError) &&
          options.recoverInvalidRefreshTokenViaBrowser !== true
        ) {
          throw createRefreshTokenInvalidError(endpoint)
        }

        let updatedRequest: ApiServiceRequest
        try {
          updatedRequest = await recoverSub2ApiRequestAuth({
            request: state.request,
            endpoint,
            authSession: hydrated.authSession,
            refreshError,
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

      state.request = refreshed
      try {
        return await runRecoveredSub2ApiRequest({
          request: state.request,
          endpoint,
          runner,
          beforeUnauthorizedRetry: options.beforeUnauthorizedRetry,
        })
      } catch (retryError) {
        if (
          !isAuthenticationRequiredError(retryError) ||
          state.request.allowAccountCredentialRecovery !== true
        )
          throw retryError
        // A rotated token may still lack the browser session's binding. Exhaust
        // that existing session before admitting a new password/OAuth login.
        return await retrySub2ApiRunnerWithResyncedAuth({
          request: state.request,
          endpoint,
          authSession: hydrated.authSession,
          runner,
          beforeUnauthorizedRetry: options.beforeUnauthorizedRetry,
        })
      }
    }

    return await retrySub2ApiRunnerWithResyncedAuth({
      request: state.request,
      endpoint,
      authSession: hydrated.authSession,
      runner,
      beforeUnauthorizedRetry: options.beforeUnauthorizedRetry,
    })
  }
}

/** Login recovery is the final opt-in fallback after native refresh/session recovery. */
export async function executeAuthenticatedSub2ApiRequest<T>(
  request: ApiServiceRequest,
  endpoint: string,
  runner: AuthenticatedSub2ApiRunner<T>,
  options: AuthenticatedSub2ApiRequestOptions = {},
): Promise<T> {
  // Preparation can fail before runner executes; recovery must still compare
  // against the hydrated/current credential, not the caller's older snapshot.
  const state = { request }
  try {
    return await executeSub2ApiAuthLifecycle(
      state,
      endpoint,
      (next) => {
        state.request = next
        return runner(next)
      },
      {
        ...options,
        recoverInvalidRefreshTokenViaBrowser:
          options.recoverInvalidRefreshTokenViaBrowser ??
          request.allowAccountCredentialRecovery === true,
      },
    )
  } catch (error) {
    if (
      request.allowAccountCredentialRecovery !== true ||
      options.recoverUnauthorized === false
    )
      throw error
    const rejected = isSub2ApiRefreshTokenContractError(error)
      ? createRefreshTokenInvalidError(endpoint)
      : error
    const { executeWithAccountCredentialRecovery } =
      await import("~/services/accountCredentialRecovery")
    let initial = true
    return executeWithAccountCredentialRecovery(state.request, async (next) => {
      if (initial) {
        initial = false
        throw rejected
      }
      await options.beforeUnauthorizedRetry?.(next)
      return runner(next)
    })
  }
}
