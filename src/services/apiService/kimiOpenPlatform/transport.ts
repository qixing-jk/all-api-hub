import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { persistKimiOpenPlatformAuth } from "~/services/accounts/accountStorage/kimiAuthPersistence"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  executePreparedRequest,
  fetchPreparedJsonResponse,
} from "~/services/apiTransport/requestExecution"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import {
  getKimiOpenPlatformAuthConfig,
  readJwtExpiry,
  type KimiOpenPlatformAuthConfig,
} from "~/services/kimiOpenPlatform/auth"
import {
  resolveKimiOpenPlatformDeployment,
  type KimiOpenPlatformDeployment,
} from "~/services/kimiOpenPlatform/deployments"
import type { SiteAccount } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { joinUrl } from "~/utils/core/url"
import { t } from "~/utils/i18n/core"

import { parseKimiRefresh } from "./parsing"

export type KimiAuthState = KimiOpenPlatformAuthConfig & {
  accessToken: string
}

type KimiRequest = ApiServiceRequest & {
  kimiOpenPlatformAuth?: KimiAuthState
}

const savedSessions = new WeakMap<ApiServiceRequest, SiteAccount>()

const asKimiRequest = (request: ApiServiceRequest): KimiRequest =>
  request as KimiRequest

/** Attaches a mutable console session so a 401 can rotate both tokens. */
export function withKimiOpenPlatformAuth(
  request: ApiServiceRequest,
  auth: KimiAuthState,
): ApiServiceRequest {
  return { ...request, kimiOpenPlatformAuth: { ...auth } } as ApiServiceRequest
}

/** Reads a complete mutable console session from the request. */
export function readKimiAuthState(
  request: ApiServiceRequest,
): KimiAuthState | undefined {
  const state = asKimiRequest(request).kimiOpenPlatformAuth
  if (!state?.accessToken.trim() || !state.refreshToken.trim()) return undefined
  return state
}

/** Maps an HTTP status to the shared API error code. */
const statusToErrorCode = (status: number) => {
  if (status === 401) return API_ERROR_CODES.HTTP_401
  if (status === 403) return API_ERROR_CODES.HTTP_403
  if (status === 429) return API_ERROR_CODES.HTTP_429
  return API_ERROR_CODES.HTTP_OTHER
}

/** The console gateway also reports expired sessions as HTTP 400, code 401. */
const consoleStatus = (response: ApiTransportResponse): number => {
  const body = response.body
  return (response.status === 400 || response.ok) &&
    body &&
    typeof body === "object" &&
    "code" in body &&
    body.code === 401
    ? 401
    : response.status
}

/** Builds an API error from a console or inference failure response. */
const httpError = (status: number, endpoint: string, body: unknown) => {
  const message =
    body &&
    typeof body === "object" &&
    "message" in body &&
    typeof (body as { message?: unknown }).message === "string"
      ? (body as { message: string }).message
      : undefined
  return new ApiError(
    getErrorMessage(
      message,
      t("messages:errors.api.requestFailed", { status }),
    ),
    status,
    endpoint,
    statusToErrorCode(status),
  )
}

/** Loads a saved console session onto the request when the caller did not pass one. */
export async function ensureKimiAuthState(
  request: ApiServiceRequest,
): Promise<KimiAuthState | undefined> {
  const existing = readKimiAuthState(request)
  const accountId = request.accountId?.trim()
  if (!accountId) return existing
  const account = await accountQueries.getAccountById(accountId)
  if (!account) throw new Error("kimi_auth_account_missing")
  const deployment = resolveKimiOpenPlatformDeployment(request.baseUrl)
  const previous = savedSessions.get(request)
  if (
    !deployment ||
    account.site_type !== deployment.siteType ||
    resolveKimiOpenPlatformDeployment(account.site_url)?.siteType !==
      deployment.siteType ||
    (request.auth?.userId !== undefined &&
      String(request.auth.userId) !== String(account.account_info.id)) ||
    (previous &&
      (previous.account_info.id !== account.account_info.id ||
        previous.kimiOpenPlatformAuth?.organizationId !==
          account.kimiOpenPlatformAuth?.organizationId))
  ) {
    throw new Error("kimi_auth_identity_mismatch")
  }
  savedSessions.set(request, structuredClone(account))
  const refreshToken = account?.kimiOpenPlatformAuth?.refreshToken?.trim()
  const organizationId =
    account?.kimiOpenPlatformAuth?.organizationId?.trim() || ""
  const accessToken = account.account_info.access_token.trim()
  if (!refreshToken || !accessToken) {
    delete asKimiRequest(request).kimiOpenPlatformAuth
    return undefined
  }
  const state: KimiAuthState = {
    accessToken,
    refreshToken,
    organizationId,
    ...(account.kimiOpenPlatformAuth?.tokenExpiresAt !== undefined
      ? { tokenExpiresAt: account.kimiOpenPlatformAuth.tokenExpiresAt }
      : {}),
  }
  if (existing) {
    Object.assign(existing, state)
    if (state.tokenExpiresAt === undefined) delete existing.tokenExpiresAt
  }
  asKimiRequest(request).kimiOpenPlatformAuth = existing ?? state
  return existing ?? state
}

/** Writes rotated tokens back to the saved account without touching user edit time. */
export async function persistKimiAuthState(
  request: ApiServiceRequest,
  state: KimiAuthState,
) {
  const accountId = request.accountId?.trim()
  if (!accountId) return
  const snapshot = savedSessions.get(request)
  if (!snapshot) throw new Error("kimi_auth_identity_mismatch")
  const auth = getKimiOpenPlatformAuthConfig(state)
  await persistKimiOpenPlatformAuth(snapshot, state.accessToken, auth)
  savedSessions.set(request, {
    ...snapshot,
    account_info: { ...snapshot.account_info, access_token: state.accessToken },
    kimiOpenPlatformAuth: auth,
  })
}

/** Rotates the access and refresh tokens. Both must be present. */
async function refreshConsoleSession(
  request: ApiServiceRequest,
  deployment: KimiOpenPlatformDeployment,
  state: KimiAuthState,
) {
  const response = await fetchPreparedJsonResponse(request, {
    url: `${deployment.consoleOrigin}/api?endpoint=refreshToken`,
    options: {
      method: "GET",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        "Msh-Authorization": state.refreshToken,
      },
    },
  })
  if (!response.ok)
    throw httpError(response.status, "refreshToken", response.body)
  const refreshed = parseKimiRefresh(response.body)
  state.accessToken = refreshed.accessToken
  state.refreshToken = refreshed.refreshToken
  const expiry = readJwtExpiry(refreshed.accessToken)
  if (expiry !== undefined) state.tokenExpiresAt = expiry
  else delete state.tokenExpiresAt
  if (request.auth) request.auth.accessToken = refreshed.accessToken
  await persistKimiAuthState(request, state)
}

/** A successful console mutation needs code 0, even when no data is returned. */
function requireConsoleSuccess(
  response: ApiTransportResponse,
  endpoint: string,
): ApiTransportResponse {
  const status = consoleStatus(response)
  if (!response.ok || status === 401)
    throw httpError(status, endpoint, response.body)
  const body = response.body
  if (
    !body ||
    typeof body !== "object" ||
    !("code" in body) ||
    typeof body.code !== "number"
  )
    throw new Error("invalid_kimi_envelope")
  if (body.code !== 0) {
    const error = httpError(response.status, endpoint, body)
    error.code = API_ERROR_CODES.BUSINESS_ERROR
    error.upstreamCode = String(body.code)
    throw error
  }
  return response
}

/**
 * Retries only authentication failures; business failures must remain failures.
 * Verified 2026-09-29: refresh uses `Msh-Authorization`, and the rotated pair is
 * written back to the saved account before the request is retried.
 */
async function sendKimiConsoleRequest(
  request: ApiServiceRequest,
  deployment: KimiOpenPlatformDeployment,
  endpoint: string,
  send: (accessToken: string) => Promise<ApiTransportResponse>,
): Promise<ApiTransportResponse> {
  const state = await ensureKimiAuthState(request)
  const accessToken =
    state?.accessToken || request.auth?.accessToken?.trim() || ""
  if (!accessToken) {
    throw new ApiError(
      "missing kimi access token",
      401,
      endpoint,
      API_ERROR_CODES.HTTP_401,
    )
  }

  const first = await send(accessToken)
  const firstStatus = consoleStatus(first)
  if (first.ok && firstStatus !== 401)
    return requireConsoleSuccess(first, endpoint)
  const canRefresh =
    firstStatus === 401 &&
    Boolean(state?.refreshToken) &&
    endpoint !== "refreshToken"
  if (!canRefresh || !state) throw httpError(firstStatus, endpoint, first.body)
  const rotate = async () => {
    const latest = await ensureKimiAuthState(request)
    if (!latest) throw httpError(401, endpoint, first.body)
    // Another context may have persisted a rotation while this request waited.
    if (state.accessToken !== accessToken) return
    await refreshConsoleSession(request, deployment, state)
  }
  if (request.accountId?.trim()) {
    await withExtensionStorageWriteLock(
      `all-api-hub:kimi-session-refresh:${deployment.siteType}:${request.accountId.trim()}`,
      rotate,
    )
  } else {
    await rotate()
  }
  const second = await send(state.accessToken)
  return requireConsoleSuccess(second, endpoint)
}

/**
 * Calls the console BFF. A 401 rotates the session once when a refresh token
 * is available. Verified 2026-09-29: refresh uses `Msh-Authorization`.
 */
export async function fetchKimiConsole<T>(
  request: ApiServiceRequest,
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE"
    query?: Record<string, string | undefined>
    body?: unknown
  } = {},
): Promise<T> {
  const deployment = resolveKimiOpenPlatformDeployment(request.baseUrl)
  if (!deployment) throw new Error("unknown_kimi_deployment")

  const params = new URLSearchParams({ endpoint })
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value) params.set(key, value)
  }
  const method = options.method ?? "GET"
  const response = await sendKimiConsoleRequest(
    request,
    deployment,
    endpoint,
    (accessToken) =>
      fetchPreparedJsonResponse(request, {
        url: `${deployment.consoleOrigin}/api?${params.toString()}`,
        options: {
          method,
          credentials: "omit",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
            ...(options.body !== undefined
              ? { "Content-Type": "application/json" }
              : {}),
          },
          ...(options.body !== undefined
            ? { body: JSON.stringify(options.body) }
            : {}),
        },
      }),
  )
  return response.body as T
}

/**
 * Calls a REST route on the console origin, for the console's own
 * `/api/v1/...` family rather than its `?endpoint=` BFF.
 */
export async function fetchKimiConsolePath<T>(
  request: ApiServiceRequest,
  path: string,
): Promise<T> {
  const deployment = resolveKimiOpenPlatformDeployment(request.baseUrl)
  if (!deployment) throw new Error("unknown_kimi_deployment")

  const response = await sendKimiConsoleRequest(
    request,
    deployment,
    path,
    (accessToken) =>
      fetchPreparedJsonResponse(request, {
        url: joinUrl(deployment.consoleOrigin, path),
        options: {
          method: "GET",
          credentials: "omit",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        },
      }),
  )
  return response.body as T
}

/**
 * Reads a public text asset from the console origin, such as the published
 * pricing document. No console session is involved, so these stay readable
 * when the account has none.
 */
export async function fetchKimiPlatformText(
  request: Pick<ApiServiceRequest, "baseUrl" | "abortSignal">,
  path: string,
): Promise<string> {
  const deployment = resolveKimiOpenPlatformDeployment(request.baseUrl)
  if (!deployment) throw new Error("unknown_kimi_deployment")

  return await executePreparedRequest(
    request,
    {
      url: joinUrl(deployment.consoleOrigin, path),
      options: { method: "GET", credentials: "omit" },
    },
    async ({ dispatch }) => {
      const response = await dispatch()
      let text = ""
      try {
        text = await response.text()
      } catch {
        text = ""
      }
      if (!response.ok) {
        throw new ApiError(
          `kimi platform asset ${path} failed`,
          response.status,
          path,
          statusToErrorCode(response.status),
        )
      }
      return text
    },
  )
}

/** Calls the inference API with an `sk-` key, never the console JWT. */
export async function fetchKimiInference<T>(
  request: ApiServiceRequest,
  path: string,
  apiKey: string,
): Promise<T> {
  const deployment = resolveKimiOpenPlatformDeployment(request.baseUrl)
  if (!deployment) throw new Error("unknown_kimi_deployment")
  const token = apiKey.trim()
  if (!token) {
    throw new ApiError(
      "missing kimi api key",
      401,
      path,
      API_ERROR_CODES.HTTP_401,
    )
  }
  const response = await fetchPreparedJsonResponse(request, {
    url: joinUrl(deployment.inferenceOrigin, path),
    options: {
      method: "GET",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  })
  if (!response.ok) throw httpError(response.status, path, response.body)
  return response.body as T
}
