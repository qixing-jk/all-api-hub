import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import { runAbortableTask } from "~/services/apiTransport/abortableTask"
import { createCookieOperationSession } from "~/services/apiTransport/cookieOperationSession"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { isSafeHttpMethod } from "~/services/apiTransport/httpMethods"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { PMPLAN_ENDPOINTS } from "./constants"
import { parsePmplanAccountData } from "./data"
import { getPmplanOrigin } from "./deployment"
import { parsePmplanIdentity } from "./identity"

const session = createCookieOperationSession({
  origin: (request) => getPmplanOrigin(request.baseUrl),
  loginCookieName: "pmplan_session",
})

/** Native writes and their readback must share the same captured console login. */
export function withPmplanSession<TRequest extends ApiServiceRequest, T>(
  request: TRequest,
  run: (request: TRequest) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const origin = getPmplanOrigin(request.baseUrl)
  if (request.baseUrl !== origin) request = { ...request, baseUrl: origin }
  if (!signal) return session.withSession(request, run)
  return runAbortableTask(
    (composed) =>
      session.withSession({ ...request, abortSignal: composed }, run),
    { signals: [request.abortSignal, signal] },
  )
}

/** Sends a bare native response with isolated Cookies and write-only CSRF tracking. */
async function readRaw(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
) {
  return withPmplanSession(request, async (scoped) => {
    const prepared = await session.prepareRequest(
      scoped,
      new URL(endpoint, scoped.baseUrl),
    )
    const method = (options.method ?? "GET").toUpperCase()
    const headers = new Headers(options.headers)
    const isRead = isSafeHttpMethod(method)
    if (!isRead) headers.set("X-PMPlan-CSRF", "1")
    return fetchApi<unknown>(
      {
        ...prepared.request,
        observer: isRead ? undefined : scoped.observer,
      },
      {
        endpoint,
        ...prepared.transport,
        options: { ...options, headers, cache: "no-store" },
      },
      false,
    )
  })
}

/** Rejects a malformed or different identity before account-scoped work continues. */
function verifyIdentity(request: ApiServiceRequest, body: unknown) {
  const user = parsePmplanIdentity(body)
  if (!user)
    throw new ApiError(
      "Invalid PM-Plan identity",
      undefined,
      PMPLAN_ENDPOINTS.Identity,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  if (request.auth.userId && String(request.auth.userId) !== user.id)
    throw new ApiError(
      "PM-Plan account identity mismatch",
      undefined,
      PMPLAN_ENDPOINTS.Identity,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  return user
}

/** Keep the live console identity bound to the saved account. */
export async function fetchUserInfo(request: ApiServiceRequest) {
  return verifyIdentity(
    request,
    await readRaw(request, PMPLAN_ENDPOINTS.Identity),
  )
}

/** Rolling windows overlap; the tightest finite window limits available spending. */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const body = await readRaw(request, PMPLAN_ENDPOINTS.Identity)
  verifyIdentity(request, body)
  if (!isRecord(body))
    throw new ApiError(
      "Invalid PM-Plan dashboard",
      undefined,
      PMPLAN_ENDPOINTS.Identity,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  return parsePmplanAccountData(body, request)
}

/** Guard the saved identity before each native operation, with no ambient credential fallback. */
export async function fetchPmplan(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
) {
  if (
    !endpoint.startsWith("/api/") ||
    endpoint.includes("\\") ||
    endpoint.includes("..") ||
    new URL(endpoint, getPmplanOrigin(request.baseUrl)).origin !==
      getPmplanOrigin(request.baseUrl)
  )
    throw new ApiError(
      "Invalid PM-Plan endpoint",
      undefined,
      undefined,
      API_ERROR_CODES.FEATURE_UNSUPPORTED,
    )
  return withPmplanSession(request, async (scoped) => {
    await fetchUserInfo(scoped)
    return readRaw(scoped, endpoint, options)
  })
}
