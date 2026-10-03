import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import type {
  AccessTokenInfo,
  UserInfo,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import { GRSAI_ENDPOINTS } from "~/services/apiService/grsai/constants"
import {
  creditsToQuota,
  isGrsaiApiKey,
  isGrsaiApiKeyList,
  isGrsaiDashboardData,
  isGrsaiModelList,
  isGrsaiUserInfo,
  toOptionalFiniteNumber,
} from "~/services/apiService/grsai/parsing"
import {
  isGrsaiSessionTokenExpired,
  looksLikeGrsaiOpenApiToken,
} from "~/services/apiService/grsai/sessionToken"
import { resyncGrsaiAuthToken } from "~/services/apiService/grsai/tokenResync"
import {
  fetchGrsaiConsole,
  fetchGrsaiSignedConsole,
  getGrsaiAccessToken,
  isGrsaiAuthFailureError,
  openGrsaiConsoleSession,
  type GrsaiConsoleSession,
} from "~/services/apiService/grsai/transport"
import type {
  GrsaiApiKey,
  GrsaiApiKeyCreateRequest,
  GrsaiApiKeyUpdateRequest,
  GrsaiDashboardData,
  GrsaiModel,
  GrsaiUserInfo,
} from "~/services/apiService/grsai/type"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  SiteHealthStatus,
  type AccountTodayMetricAvailability,
  type AccountTodayStatsAvailability,
} from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("ApiService.Grsai")

const COMPLETE_METRIC: AccountTodayMetricAvailability = {
  status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
}

const unavailableMetric = (
  reason:
    | typeof ACCOUNT_TODAY_METRIC_REASONS.Unsupported
    | typeof ACCOUNT_TODAY_METRIC_REASONS.NotCollected
    | typeof ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
): AccountTodayMetricAvailability => ({
  status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
  reason,
})

/**
 * The deployment reports credits and consumption only; it exposes no request or
 * token series anywhere in the console.
 */
const UNSUPPORTED_METRIC = unavailableMetric(
  ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
)

const unauthorizedError = (message: string, endpoint: string) =>
  new ApiError(message, 401, endpoint, API_ERROR_CODES.HTTP_401)

/**
 * Rejects the account token the console's user-info page displays.
 *
 * The console labels that 32-character token as an API credential, so saving it
 * as the account token is a natural mistake — but neither the console API nor
 * the deployment's open endpoints accept it. Naming the mistake is the only way
 * the account form can explain a failure the user cannot see.
 */
const assertNotOpenApiToken = (token: string): void => {
  if (looksLikeGrsaiOpenApiToken(token)) {
    throw unauthorizedError(
      t("messages:grsai.openApiTokenRejected"),
      GRSAI_ENDPOINTS.config,
    )
  }
}

/**
 * Opens the signing session and rejects it when the saved token no longer maps
 * to a signed-in console session.
 *
 * Every console call the adapter makes goes through this, because the session
 * token is also what the request signature is bound to.
 */
async function openSignedInSession(
  request: ApiServiceRequest,
): Promise<GrsaiConsoleSession> {
  const storedToken = getGrsaiAccessToken(request)
  assertNotOpenApiToken(storedToken)

  const session = await openGrsaiConsoleSession(request)
  if (!session.isAuth) {
    // A token whose own stamp has passed used up the console's roughly 30-day
    // session window; anything else is the deployment refusing a session it
    // stopped honouring. Recovery is the same either way, but the user needs to
    // know which one happened.
    throw unauthorizedError(
      isGrsaiSessionTokenExpired(storedToken)
        ? t("messages:grsai.sessionExpired")
        : t("messages:operations.detection.getInfoFailed"),
      GRSAI_ENDPOINTS.config,
    )
  }
  return session
}

/** The signed-in account's own record: id, sign-in email and credit balance. */
async function fetchGrsaiUserInfo(
  request: ApiServiceRequest,
  session?: GrsaiConsoleSession,
): Promise<GrsaiUserInfo> {
  const payload = await fetchGrsaiConsole<unknown>(
    request,
    GRSAI_ENDPOINTS.userInfo,
    { body: {}, session },
  )
  if (!isGrsaiUserInfo(payload)) {
    throw new Error("invalid_grsai_user_info")
  }
  return payload
}

/** The console's dashboard totals, all denominated in credits. */
async function fetchGrsaiDashboard(
  request: ApiServiceRequest,
  session?: GrsaiConsoleSession,
): Promise<GrsaiDashboardData> {
  const payload = await fetchGrsaiConsole<unknown>(
    request,
    GRSAI_ENDPOINTS.dashboard,
    { body: {}, session },
  )
  if (!isGrsaiDashboardData(payload)) {
    throw new Error("invalid_grsai_dashboard")
  }
  return payload
}

/**
 * The key inventory. `key` is returned in plaintext by both list and create, so
 * a saved secret can always be re-read and exported.
 */
export async function fetchGrsaiKeys(
  request: ApiServiceRequest,
  session?: GrsaiConsoleSession,
): Promise<GrsaiApiKey[]> {
  const keys: GrsaiApiKey[] = []
  const ids = new Set<string>()
  const size = 100
  for (let page = 1; ; page++) {
    const payload = await fetchGrsaiConsole<unknown>(
      request,
      GRSAI_ENDPOINTS.apiKeyList,
      { body: { page, size }, session },
    )
    if (!isGrsaiApiKeyList(payload))
      throw new Error("invalid_grsai_key_inventory")
    for (const key of payload.list) {
      if (ids.has(key.id)) throw new Error("invalid_grsai_key_inventory")
      ids.add(key.id)
    }
    keys.push(...payload.list)
    const total = toOptionalFiniteNumber(payload.total)
    if (total !== undefined && keys.length >= total) return keys
    if (payload.list.length < size) {
      if (total !== undefined && keys.length < total)
        throw new Error("incomplete_grsai_key_inventory")
      return keys
    }
  }
}

/** Creates a key and returns it together with its plaintext secret. */
export async function createGrsaiKey(
  request: ApiServiceRequest,
  body: GrsaiApiKeyCreateRequest,
): Promise<GrsaiApiKey> {
  const { data } = await fetchGrsaiSignedConsole<unknown>(
    request,
    GRSAI_ENDPOINTS.apiKeyCreate,
    { ...body },
  )
  if (!isGrsaiApiKey(data)) {
    throw new Error("invalid_grsai_key_create")
  }
  return data
}

/**
 * Renames or requotes a key. The deployment addresses the key by its plaintext
 * secret and answers with no payload, so callers re-read the inventory.
 */
export async function updateGrsaiKey(
  request: ApiServiceRequest,
  body: GrsaiApiKeyUpdateRequest,
): Promise<void> {
  await fetchGrsaiSignedConsole<unknown>(
    request,
    GRSAI_ENDPOINTS.apiKeyUpdate,
    { ...body },
  )
}

/** Removes a key permanently. */
export async function deleteGrsaiKey(
  request: ApiServiceRequest,
  id: string,
): Promise<void> {
  await fetchGrsaiSignedConsole<unknown>(
    request,
    GRSAI_ENDPOINTS.apiKeyDelete,
    {
      id,
    },
  )
}

/**
 * Sellable model catalog. The catalog carries the console's own credit price
 * per call; the deployment has no `/v1/models` endpoint to read instead.
 */
export async function fetchGrsaiModels(
  request: ApiServiceRequest,
  session?: GrsaiConsoleSession,
): Promise<GrsaiModel[]> {
  const payload = await fetchGrsaiConsole<unknown>(
    request,
    GRSAI_ENDPOINTS.modelList,
    { body: {}, session },
  )
  if (!isGrsaiModelList(payload)) {
    throw new Error("invalid_grsai_model_list")
  }
  return payload.list
}

/**
 * Account snapshot used by the refresh flow: the credit balance plus today's
 * and lifetime consumption.
 *
 * `usage` is deliberately omitted: the deployment exposes no request or token
 * series, and the product renders any summary it is given.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
  existingSession?: GrsaiConsoleSession,
): Promise<AccountData> {
  const shouldCollectToday = request.includeTodayCashflow !== false
  const session = existingSession ?? (await openSignedInSession(request))

  const [userInfo, dashboard] = await Promise.all([
    fetchGrsaiUserInfo(request, session),
    fetchGrsaiDashboard(request, session),
  ])

  const expectedUserId = expectedAccountIdentity(request)
  if (expectedUserId && userInfo.id.trim() !== expectedUserId) {
    throw new ApiError(
      "The authenticated account does not match the expected account",
      undefined,
      GRSAI_ENDPOINTS.userInfo,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  }

  const credits =
    toOptionalFiniteNumber(userInfo.credits) ??
    toOptionalFiniteNumber(dashboard.credits) ??
    0
  const todayCredits = toOptionalFiniteNumber(dashboard.todayConsumed)

  const todayStatsAvailability: AccountTodayStatsAvailability = {
    consumption: shouldCollectToday
      ? todayCredits === undefined
        ? unavailableMetric(ACCOUNT_TODAY_METRIC_REASONS.RequestFailed)
        : COMPLETE_METRIC
      : unavailableMetric(ACCOUNT_TODAY_METRIC_REASONS.NotCollected),
    requests: UNSUPPORTED_METRIC,
    tokens: UNSUPPORTED_METRIC,
    income: UNSUPPORTED_METRIC,
  }

  return {
    quota: creditsToQuota(credits),
    today_quota_consumption:
      shouldCollectToday && todayCredits !== undefined
        ? creditsToQuota(todayCredits)
        : 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_requests_count: 0,
    today_income: 0,
    todayStatsAvailability,
    checkIn: request.checkIn,
  }
}

type GrsaiAuthUpdate = {
  accessToken: string
  userId?: string
  username?: string
}

const healthyResult = (
  data: AccountData,
  authUpdate?: GrsaiAuthUpdate,
): RefreshAccountResult => ({
  success: true,
  data,
  ...(authUpdate ? { authUpdate } : {}),
  healthStatus: {
    status: SiteHealthStatus.Healthy,
    message: t("account:healthStatus.normal"),
  },
})

const expectedAccountIdentity = (request: ApiServiceRequest): string => {
  const value = request.auth?.userId
  return value === undefined || value === null ? "" : String(value).trim()
}

/**
 * Recovers a session the deployment no longer accepts by re-reading the console
 * session the browser is holding.
 *
 * A session token is only renewable while it is still honoured, so a dead one
 * has to be replaced from outside the extension: the content-session extractor
 * already knows how to read `localStorage.Token` from a console tab, and it only
 * reports a session the console API has authenticated. The replacement is then
 * proven against the console and checked against the saved account identity
 * before it is written back, so neither a stale nor a foreign browser session
 * can overwrite a working credential.
 */
async function recoverGrsaiSession(
  request: ApiServiceAccountRequest,
  currentToken: string,
): Promise<RefreshAccountResult | null> {
  const expectedUserId = expectedAccountIdentity(request)
  if (!expectedUserId) return null

  const resynced = await resyncGrsaiAuthToken(
    request.baseUrl,
    expectedUserId,
    request.tempWindowRequestSource,
    request.protectionBypassExecution,
  ).catch((error) => {
    logger.warn("Grsai token re-sync failed", error)
    return null
  })

  if (!resynced || resynced.accessToken === currentToken) return null

  if (resynced.userId.trim() !== expectedUserId) {
    logger.warn("Grsai token re-sync returned session for different user", {
      expected: expectedUserId,
      actual: resynced.userId,
    })
    return null
  }

  const retryRequest: ApiServiceAccountRequest = {
    ...request,
    auth: { ...request.auth, accessToken: resynced.accessToken },
  }

  try {
    const session = await openSignedInSession(retryRequest)
    const retryUser = await fetchGrsaiUserInfo(retryRequest, session)
    if (retryUser.id.trim() !== expectedUserId) {
      logger.warn("Grsai token re-sync authenticated a different user", {
        expected: expectedUserId,
        actual: retryUser.id,
      })
      return null
    }

    const data = await fetchAccountData(retryRequest, session)
    return healthyResult(data, {
      accessToken: resynced.accessToken,
      userId: resynced.userId,
      ...(resynced.username ? { username: resynced.username } : {}),
    })
  } catch (retryError) {
    logger.error("Grsai refresh failed after re-sync", retryError)
    return null
  }
}

/**
 * Refreshes the account and persists the rotated session token.
 *
 * The console hands out a new session token on every `getConfig` exchange; the
 * token already stored keeps working, but the freshly issued one is what the
 * next signature is bound to, so it is written back after it proves usable.
 * When the stored token is refused outright, the console session is re-read from
 * the browser before the account is reported as logged out.
 */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  const currentToken = getGrsaiAccessToken(request)

  try {
    const session = await openSignedInSession(request)
    const data = await fetchAccountData(request, session)

    return healthyResult(
      data,
      session.token !== currentToken
        ? { accessToken: session.token }
        : undefined,
    )
  } catch (error) {
    if (isGrsaiAuthFailureError(error)) {
      logger.warn("Grsai console session is no longer signed in")
      const recovered = await recoverGrsaiSession(request, currentToken)
      if (recovered) return recovered
    } else {
      logger.error("Failed to refresh Grsai account data", error)
    }
    return { success: false, healthStatus: determineHealthStatus(error) }
  }
}

/**
 * Onboarding identity. The console session token authenticates the API, so it
 * doubles as the saved account token; the account's own id and sign-in email
 * come from the same call the console uses.
 */
export async function fetchUserInfo(
  request: ApiServiceRequest,
): Promise<UserInfo> {
  const session = await openSignedInSession(request)
  const user = await fetchGrsaiUserInfo(request, session)
  return {
    id: user.id,
    username: user.mail ?? user.id,
    access_token: session.token,
  }
}

/** The session token is already the API credential, so this only re-reads it. */
export async function getOrCreateAccessToken(
  request: ApiServiceRequest,
): Promise<AccessTokenInfo> {
  const session = await openSignedInSession(request)
  const user = await fetchGrsaiUserInfo(request, session)
  return {
    username: user.mail ?? user.id,
    access_token: session.token,
  }
}

/** The console runs no check-in flow, and its routes carry no such page. */
export async function fetchSupportCheckIn(): Promise<boolean> {
  return false
}
