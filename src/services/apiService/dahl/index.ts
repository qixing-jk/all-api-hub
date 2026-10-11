import { QUOTA_PER_USD } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { DAHL_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import type { UserInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import {
  AccountKeyResourceError,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES as failures,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { hasCookieInterceptorPermissions } from "~/services/permissions/permissionManager"
import { AuthTypeEnum } from "~/types"
import { isRecord } from "~/utils/core/object"

import {
  DAHL_ACCOUNT_ENDPOINT,
  DAHL_KEY_STATUSES,
  DAHL_KEYS_ENDPOINT,
  DAHL_MODELS_ENDPOINT,
  DAHL_TRANSFER_DIRECTIONS,
  DAHL_USAGE_ENDPOINT,
  DAHL_USD_PER_TOKEN,
  type DahlTransferDirection,
} from "./constants"
import { parseDahlIdentity } from "./identity"
import { getDahlCookieSession, withDahlSession } from "./session"

const origin = DAHL_WEB_ORIGIN
const keyStatuses: readonly string[] = Object.values(DAHL_KEY_STATUSES)
const invalid = (endpoint: string) =>
  new ApiError(
    "Invalid Dahl response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

/** Only the console's HttpOnly session authenticates account operations. */
async function read(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
) {
  if (
    new URL(request.baseUrl).origin !== origin ||
    request.auth.authType !== AuthTypeEnum.Cookie
  )
    throw new ApiError(
      "Dahl requires its console cookie session",
      undefined,
      endpoint,
      API_ERROR_CODES.FEATURE_UNSUPPORTED,
    )
  return withDahlSession(request, async (request) => {
    const method = (options.method ?? "GET").toUpperCase()
    const session = getDahlCookieSession(request, new URL(endpoint, origin))
    const firefox = import.meta.env.BROWSER === "firefox"
    if (firefox && !(await hasCookieInterceptorPermissions()))
      throw new ApiError(
        "Dahl requires Cookie interceptor permissions",
        undefined,
        endpoint,
        API_ERROR_CODES.COOKIE_PERMISSION_REQUIRED,
      )
    const body = await fetchApi<unknown>(
      {
        ...request,
        auth: {
          ...request.auth,
          accessToken: undefined,
          ...(firefox ? { cookie: session.cookieHeader } : {}),
        },
        ...(firefox
          ? {
              // The existing interceptor sends the captured Cookie; never delegate
              // this operation to a page using its mutable ambient login.
              cookieSession: undefined,
              fetchContext: undefined,
              forceTempWindow: false,
            }
          : { cookieSession: session }),
        // Preflight and readback failures cannot establish mutation dispatch.
        observer: ["GET", "HEAD", "OPTIONS"].includes(method)
          ? undefined
          : request.observer,
      },
      {
        endpoint,
        options: { cache: "no-store", ...options },
        currentTabTransport: "disabled",
        ...(firefox ? { tempWindowFallback: {} } : {}),
      },
      true,
    )
    if (!isRecord(body)) throw invalid(endpoint)
    return body
  })
}

/** Read a fresh console account and reject another UUID before returning facts. */
async function account(request: ApiServiceRequest) {
  const body = await read(request, DAHL_ACCOUNT_ENDPOINT)
  const user = parseDahlIdentity(body)
  if (!user) throw invalid(DAHL_ACCOUNT_ENDPOINT)
  if (
    request.auth.userId !== undefined &&
    String(request.auth.userId) !== user.id
  )
    throw new ApiError(
      "Dahl account identity mismatch",
      undefined,
      DAHL_ACCOUNT_ENDPOINT,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  return { body, user }
}

/** Return the verified identity for onboarding and refresh. */
export async function fetchUserInfo(
  request: ApiServiceRequest,
): Promise<UserInfo> {
  return (await account(request)).user
}

/** Read the unallocated token pool for a fresh native transfer editor. */
export async function fetchTokenPool(
  request: ApiServiceRequest,
): Promise<number> {
  return count(
    (await account(request)).body.token_balance,
    DAHL_ACCOUNT_ENDPOINT,
  )
}

/** Reject absent, fractional and negative token counts. */
function count(value: unknown, endpoint: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw invalid(endpoint)
  return value
}

/** Value token credit and retain the native 30-day usage window. */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  return withDahlSession(request, async (request) => {
    const { body } = await account(request)
    const tokens =
      count(body.token_balance, DAHL_ACCOUNT_ENDPOINT) +
      count(body.tokens_on_keys, DAHL_ACCOUNT_ENDPOINT)
    const usageEndpoint = DAHL_USAGE_ENDPOINT
    const usage = await read(request, usageEndpoint)
    const totalTokens =
      count(usage.total_input_tokens, usageEndpoint) +
      count(usage.total_output_tokens, usageEndpoint)
    return {
      quota: Math.round(tokens * DAHL_USD_PER_TOKEN * QUOTA_PER_USD),
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
      // days=1 has no verified day-boundary contract. Do not label it "today".
      todayStatsAvailability: createUnsupportedTodayStatsAvailability(),
      usage: {
        scope: "rolling_window",
        totalTokens,
        totalRequests: count(usage.total_requests, usageEndpoint),
        totalCost: totalTokens * DAHL_USD_PER_TOKEN,
      },
      subscription: {
        name: "Dahl",
        billingType: "tokens",
        remainingTokens: tokens,
        isActive: true,
      },
      checkIn: request.checkIn,
    }
  })
}

export type DahlKey = {
  id: number
  available_tokens: number
  total_tokens: number
  created_at: string
  masked: string
  status: (typeof DAHL_KEY_STATUSES)[keyof typeof DAHL_KEY_STATUSES]
  token?: string
}

/** Validate native key metadata and retain only verified plaintext values. */
function parseKey(value: unknown): DahlKey {
  const endpoint = DAHL_KEYS_ENDPOINT
  if (
    !isRecord(value) ||
    typeof value.id !== "number" ||
    !Number.isSafeInteger(value.id) ||
    value.id <= 0 ||
    typeof value.masked !== "string" ||
    typeof value.created_at !== "string" ||
    !Number.isFinite(Date.parse(value.created_at)) ||
    !keyStatuses.includes(String(value.status))
  )
    throw invalid(endpoint)
  return {
    id: value.id,
    available_tokens: count(value.available_tokens, endpoint),
    total_tokens: count(value.total_tokens, endpoint),
    created_at: value.created_at,
    masked: value.masked,
    status: value.status as DahlKey["status"],
    ...(typeof value.token === "string" && /^dahl_[a-z0-9]+$/i.test(value.token)
      ? { token: value.token }
      : {}),
  }
}

/** Read the complete non-paginated key inventory without re-verifying identity. */
async function keys(request: ApiServiceRequest): Promise<DahlKey[]> {
  const body = await read(request, DAHL_KEYS_ENDPOINT)
  if (!Array.isArray(body.keys)) throw invalid(DAHL_KEYS_ENDPOINT)
  const result = body.keys.map(parseKey)
  if (new Set(result.map((key) => key.id)).size !== result.length)
    throw invalid(DAHL_KEYS_ENDPOINT)
  return result
}

/** Verify the current session before accessing its owned keys. */
export async function fetchKeys(
  request: ApiServiceRequest,
): Promise<DahlKey[]> {
  return withDahlSession(request, async (request) => {
    await fetchUserInfo(request)
    return keys(request)
  })
}

const keyFailure = (code: ResourceFailure["code"]) =>
  new AccountKeyResourceError({ code })

/** The native console creates first, then allocates separately. Never issue a landing-page /tokens grant. */
export async function createKey(request: ApiServiceRequest): Promise<DahlKey> {
  return withDahlSession(request, async (request) => {
    await fetchUserInfo(request)
    const body = await read(request, DAHL_KEYS_ENDPOINT, { method: "POST" })
    return parseKey(body.key)
  })
}

export type DahlKeyTransfer = {
  direction: DahlTransferDirection
  amount: number
}

/** Preserve the requested operation and quantity; reject an obsolete editor snapshot. */
export async function transferKeyTokens(
  request: ApiServiceRequest,
  baseline: DahlKey,
  transfer: DahlKeyTransfer,
): Promise<DahlKey> {
  return withDahlSession(request, async (request) => {
    const { direction, amount } = transfer
    if (
      (direction !== DAHL_TRANSFER_DIRECTIONS.Allocate &&
        direction !== DAHL_TRANSFER_DIRECTIONS.Return) ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    )
      throw keyFailure(failures.ValidationFailed)
    const { body } = await account(request)
    const current = (await keys(request)).find((key) => key.id === baseline.id)
    if (!current) throw keyFailure(failures.NotFound)
    if (
      current.status === DAHL_KEY_STATUSES.Revoked ||
      current.available_tokens !== baseline.available_tokens ||
      current.total_tokens !== baseline.total_tokens
    )
      throw keyFailure(failures.ResourceChanged)
    const target =
      current.available_tokens +
      (direction === DAHL_TRANSFER_DIRECTIONS.Allocate ? amount : -amount)
    if (
      !Number.isSafeInteger(target) ||
      target < 0 ||
      (direction === DAHL_TRANSFER_DIRECTIONS.Allocate &&
        amount > count(body.token_balance, DAHL_ACCOUNT_ENDPOINT))
    )
      throw keyFailure(failures.ValidationFailed)
    await read(request, `${DAHL_ACCOUNT_ENDPOINT}/${direction}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key_id: current.id, amount }),
    })
    const updated = (await keys(request)).find((key) => key.id === baseline.id)
    if (!updated || updated.available_tokens !== target)
      throw keyFailure(failures.MutationStateUncertain)
    return updated
  })
}

/** Dahl revokes rather than removes records; remaining tokens return to the pool. */
export async function revokeKey(
  request: ApiServiceRequest,
  id: string,
): Promise<void> {
  return withDahlSession(request, async (request) => {
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
      throw keyFailure(failures.NotFound)
    await fetchUserInfo(request)
    const key = (await keys(request)).find((key) => String(key.id) === id)
    if (!key) throw keyFailure(failures.NotFound)
    if (key.status === DAHL_KEY_STATUSES.Revoked) return
    await read(request, `${DAHL_KEYS_ENDPOINT}/${id}`, { method: "DELETE" })
    const updated = (await keys(request)).find((key) => String(key.id) === id)
    if (
      !updated ||
      updated.status !== DAHL_KEY_STATUSES.Revoked ||
      updated.available_tokens !== 0
    )
      throw keyFailure(failures.MutationStateUncertain)
  })
}

/** Public provider catalog; neither one key's visibility nor a console credential export. */
export async function fetchModels(
  request: ApiServiceRequest,
): Promise<string[]> {
  const response = await fetchApi<unknown>(
    { ...request, auth: { authType: AuthTypeEnum.None } },
    { endpoint: DAHL_MODELS_ENDPOINT },
    true,
  )
  if (!isRecord(response) || !Array.isArray(response.data))
    throw invalid(DAHL_MODELS_ENDPOINT)
  return [
    ...new Set(
      response.data.map((model) => {
        if (
          !isRecord(model) ||
          typeof model.id !== "string" ||
          !model.id.trim()
        )
          throw invalid(DAHL_MODELS_ENDPOINT)
        return model.id
      }),
    ),
  ]
}
