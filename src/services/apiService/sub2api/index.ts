/**
 * Sub2API API overrides.
 *
 * Sub2API differs from One-API/New-API backends in that authenticated endpoints
 * live under `/api/v1/*` and require a dashboard JWT.
 */
import { t } from "i18next"

import { determineHealthStatus } from "~/services/apiService/common"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import type {
  AccountData,
  ApiServiceAccountRequest,
  ApiServiceRequest,
  CreateTokenRequest,
  RefreshAccountResult,
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

const isCloseToExpiry = (tokenExpiresAt: number): boolean => {
  const msUntilExpiry = tokenExpiresAt - Date.now()
  return msUntilExpiry <= SUB2API_TOKEN_REFRESH_BUFFER_MS
}

const normalizeRefreshToken = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

const normalizeTokenExpiresAt = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined

const normalizeJwtRequest = (request: ApiServiceRequest): ApiServiceRequest => {
  const accessToken =
    typeof request.auth?.accessToken === "string"
      ? request.auth.accessToken.trim()
      : ""

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
  }
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

type RefreshedSub2ApiRequest = {
  request: ApiServiceRequest
  refreshToken: string
  tokenExpiresAt: number
}

type HydratedSub2ApiAuth = {
  request: ApiServiceRequest
  accountStorageRef: {
    getAccountById: (id: string) => Promise<any>
    updateAccount: (
      id: string,
      updates: Record<string, any>,
    ) => Promise<boolean>
  } | null
}

const hydrateSub2ApiAuthRequest = async (
  request: ApiServiceRequest,
): Promise<HydratedSub2ApiAuth> => {
  let accessToken =
    typeof request.auth?.accessToken === "string"
      ? request.auth.accessToken.trim()
      : ""
  let refreshToken = normalizeRefreshToken(request.auth?.refreshToken)
  let tokenExpiresAt = normalizeTokenExpiresAt(request.auth?.tokenExpiresAt)
  let userId = request.auth?.userId
  let accountStorageRef: HydratedSub2ApiAuth["accountStorageRef"] = null

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

  const hydratedRequest: ApiServiceRequest = {
    ...request,
    auth: {
      ...request.auth,
      authType: AuthTypeEnum.AccessToken,
      accessToken,
      ...(refreshToken ? { refreshToken } : {}),
      ...(typeof tokenExpiresAt === "number" ? { tokenExpiresAt } : {}),
      ...(userId !== undefined ? { userId } : {}),
    },
  }

  return {
    request: normalizeJwtRequest(hydratedRequest),
    accountStorageRef,
  }
}

const persistSub2ApiAuthUpdate = async (
  request: ApiServiceRequest,
  authUpdate: PersistableSub2ApiAuthUpdate,
  accountStorageRef: HydratedSub2ApiAuth["accountStorageRef"],
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

const applySub2ApiAuthUpdate = (
  request: ApiServiceRequest,
  authUpdate: PersistableSub2ApiAuthUpdate,
): ApiServiceRequest => ({
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
})

const refreshSub2ApiRequestAuth = async (params: {
  request: ApiServiceRequest
  refreshToken: string
  accountStorageRef: HydratedSub2ApiAuth["accountStorageRef"]
}): Promise<RefreshedSub2ApiRequest> => {
  const refreshed = await refreshSub2ApiTokens({
    baseUrl: params.request.baseUrl,
    accessToken: params.request.auth?.accessToken,
    refreshToken: params.refreshToken,
  })

  const refreshedRequest = applySub2ApiAuthUpdate(params.request, refreshed)
  await persistSub2ApiAuthUpdate(
    refreshedRequest,
    refreshed,
    params.accountStorageRef,
  )

  return {
    request: refreshedRequest,
    refreshToken: refreshed.refreshToken,
    tokenExpiresAt: refreshed.tokenExpiresAt,
  }
}

const resyncSub2ApiRequestAuth = async (params: {
  request: ApiServiceRequest
  endpoint: string
  accountStorageRef: HydratedSub2ApiAuth["accountStorageRef"]
}): Promise<ApiServiceRequest> => {
  const resynced = await resyncSub2ApiAuthToken(params.request.baseUrl)
  if (!resynced) {
    throw createLoginRequiredError(params.endpoint)
  }

  logger.info("Retrying Sub2API key request after JWT re-sync", {
    endpoint: params.endpoint,
    source: resynced.source,
  })

  const resyncedRequest = applySub2ApiAuthUpdate(params.request, {
    accessToken: resynced.accessToken,
  })

  await persistSub2ApiAuthUpdate(
    resyncedRequest,
    { accessToken: resynced.accessToken },
    params.accountStorageRef,
  )

  return resyncedRequest
}

type AuthenticatedSub2ApiRunner<T> = (request: ApiServiceRequest) => Promise<T>

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
  let effectiveRequest = hydrated.request
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
        throw refreshError
      }
    }

    effectiveRequest = await resyncSub2ApiRequestAuth({
      request: effectiveRequest,
      endpoint,
      accountStorageRef: hydrated.accountStorageRef,
    })

    try {
      return await runner(effectiveRequest)
    } catch (retryError) {
      if (isUnauthorizedError(retryError)) {
        throw createLoginRequiredError(endpoint)
      }

      throw retryError
    }
  }
}

const fetchSub2ApiData = async <T>(
  request: ApiServiceRequest,
  endpoint: string,
  options?: RequestInit,
  parserOptions?: { allowMissingData?: boolean },
): Promise<T> => {
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

      return parseSub2ApiEnvelope<T>(body, endpoint, parserOptions)
    },
  )
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
      `Sub2API group '${normalizedGroup}' is no longer available. Refresh the group list and try again.`,
      undefined,
      SUB2API_AVAILABLE_GROUPS_ENDPOINT,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  }

  return groupId
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

  const storedRefreshToken =
    typeof request.auth?.refreshToken === "string"
      ? request.auth.refreshToken.trim()
      : ""
  const storedTokenExpiresAtRaw = request.auth?.tokenExpiresAt
  const storedTokenExpiresAt =
    typeof storedTokenExpiresAtRaw === "number" &&
    Number.isFinite(storedTokenExpiresAtRaw)
      ? storedTokenExpiresAtRaw
      : undefined
  const hasStoredRefreshToken = Boolean(storedRefreshToken)
  let refreshToken = storedRefreshToken

  try {
    let accessToken =
      typeof request.auth?.accessToken === "string"
        ? request.auth.accessToken.trim()
        : ""
    let tokenExpiresAt = storedTokenExpiresAt
    let hasProactiveRefreshUpdate = false

    if (hasStoredRefreshToken && typeof tokenExpiresAt === "number") {
      if (isCloseToExpiry(tokenExpiresAt)) {
        try {
          const refreshed = await refreshSub2ApiTokens({
            baseUrl: request.baseUrl,
            accessToken,
            refreshToken,
          })
          accessToken = refreshed.accessToken
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

    const currentUser = await fetchCurrentUser({
      ...request,
      auth: {
        ...request.auth,
        authType: AuthTypeEnum.AccessToken,
        accessToken,
      },
    })
    return createRefreshSuccessResult(currentUser, checkIn, {
      ...(hasProactiveRefreshUpdate
        ? {
            accessToken,
            sub2apiAuth: {
              refreshToken,
              ...(typeof tokenExpiresAt === "number" ? { tokenExpiresAt } : {}),
            },
          }
        : {}),
    })
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 401) {
      if (hasStoredRefreshToken) {
        try {
          const accessToken =
            typeof request.auth?.accessToken === "string"
              ? request.auth.accessToken.trim()
              : ""
          const refreshed = await refreshSub2ApiTokens({
            baseUrl: request.baseUrl,
            accessToken,
            refreshToken,
          })

          const retryRequest: ApiServiceAccountRequest = {
            ...request,
            auth: {
              ...request.auth,
              authType: AuthTypeEnum.AccessToken,
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken,
              tokenExpiresAt: refreshed.tokenExpiresAt,
            },
          }

          const currentUser = await fetchCurrentUser(retryRequest)

          return createRefreshSuccessResult(currentUser, checkIn, {
            accessToken: refreshed.accessToken,
            sub2apiAuth: {
              refreshToken: refreshed.refreshToken,
              tokenExpiresAt: refreshed.tokenExpiresAt,
            },
          })
        } catch (refreshError) {
          logger.warn("Failed to restore Sub2API session via refresh token", {
            error: getSafeErrorMessage(refreshError),
          })
          return {
            success: false,
            healthStatus: createRefreshTokenRestoreRequiredHealthStatus(),
          }
        }
      }

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
        return createRefreshSuccessResult(currentUser, checkIn, {
          accessToken: resynced.accessToken,
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
    const data = await fetchSub2ApiData<Sub2ApiKeyListData>(request, endpoint, {
      method: "GET",
      cache: "no-store",
    })

    return extractSub2ApiKeyItems(data).map((item) =>
      parseSub2ApiKey(item, {
        defaultUserId: request.auth?.userId,
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
    const data = await fetchSub2ApiData<Sub2ApiKeyData>(request, endpoint, {
      method: "GET",
      cache: "no-store",
    })

    return parseSub2ApiKey(data, {
      defaultUserId: request.auth?.userId,
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
