import { EMRANK_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { createCookieOperationSession } from "~/services/apiTransport/cookieOperationSession"
import {
  API_ERROR_CODES,
  ApiError,
  type ApiErrorCode,
} from "~/services/apiTransport/errors"
import { isSafeHttpMethod } from "~/services/apiTransport/httpMethods"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { notifyApiTransportObserver } from "~/services/apiTransport/requestExecution"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { hasCookieInterceptorPermissions } from "~/services/permissions/permissionManager"
import { AuthTypeEnum } from "~/types"
import { isRecord } from "~/utils/core/object"

import {
  EMRANK_CSRF_HEADER_NAME,
  EMRANK_CSRF_HEADER_VALUE,
  EMRANK_ENDPOINTS,
  EMRANK_SESSION_COOKIE_NAME,
} from "./constants"

const EMRANK_CONSOLE_ORIGIN = EMRANK_WEB_ORIGIN
/**
 * `__Host-gateway_session` is the console login credential: an HttpOnly
 * `Path=/` session Cookie. Verified 2026-10-16 on https://emrank.tech.
 */
const session = createCookieOperationSession({
  origin: EMRANK_CONSOLE_ORIGIN,
  loginCookieName: EMRANK_SESSION_COOKIE_NAME,
})
const operationReads = new WeakMap<
  ApiServiceRequest,
  Map<string, Promise<Record<string, unknown>>>
>()
/** Identity and the public catalogue are stable within one fixed-Cookie operation. */
const reusableEndpoints = new Set<string>([
  EMRANK_ENDPOINTS.Identity,
  EMRANK_ENDPOINTS.Catalog,
])

/** EMRank returns raw JSON (no success envelope); callers own field checks. */
export function invalidEmRankResponse(endpoint: string): never {
  throw new ApiError(
    "Invalid EMRank response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )
}

/** Reject missing or non-finite counts instead of converting absent data to zero. */
export function emRankCount(value: unknown, endpoint: string): number {
  const count =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d{1,15}$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN
  if (!Number.isSafeInteger(count) || count < 0) invalidEmRankResponse(endpoint)
  return count
}

const httpErrorCode = (status: number): ApiErrorCode =>
  status === 401
    ? API_ERROR_CODES.HTTP_401
    : status === 403
      ? API_ERROR_CODES.HTTP_403
      : status === 429
        ? API_ERROR_CODES.HTTP_429
        : // Other 4xx answers are business rejections (duplicate names,
          // missing resources); the mutation layer uses that to prove the
          // write was not applied instead of guessing.
          status >= 400 && status < 500 && status !== 408 && status !== 499
          ? API_ERROR_CODES.BUSINESS_ERROR
          : API_ERROR_CODES.HTTP_OTHER

/**
 * Nested reads share facts only while the same captured Cookie operation is
 * active, mirroring the other console-Cookie adapters.
 */
export async function withEmRankSession<TRequest extends ApiServiceRequest, T>(
  request: TRequest,
  run: (request: TRequest) => Promise<T>,
): Promise<T> {
  return session.withSession(request, async (scoped) => {
    if (operationReads.has(scoped)) return run(scoped)
    operationReads.set(scoped, new Map())
    try {
      return await run(scoped)
    } finally {
      operationReads.delete(scoped)
    }
  })
}

/**
 * Read one console route over the bound session cookie.
 *
 * EMRank answers writes with `204` and no body, so the transport reads text
 * and the error envelope itself: an HTTP failure carries
 * `{error:{message,code}}` and a success may be an empty body.
 */
async function readEmRankUncached(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
): Promise<Record<string, unknown>> {
  return withEmRankSession(request, async (request) => {
    const method = (options.method ?? "GET").toUpperCase()
    if (
      new URL(request.baseUrl).origin !== EMRANK_CONSOLE_ORIGIN ||
      request.auth.authType !== AuthTypeEnum.Cookie ||
      !endpoint.startsWith("/api/")
    ) {
      throw new ApiError(
        "EMRank requires its console cookie session",
        undefined,
        endpoint,
        API_ERROR_CODES.FEATURE_UNSUPPORTED,
      )
    }
    const cookieSession = session.getSession(
      request,
      new URL(endpoint, EMRANK_CONSOLE_ORIGIN),
    )
    const firefox = import.meta.env.BROWSER === "firefox"
    if (firefox && !(await hasCookieInterceptorPermissions()))
      throw new ApiError(
        "EMRank requires Cookie interceptor permissions",
        undefined,
        endpoint,
        API_ERROR_CODES.COOKIE_PERMISSION_REQUIRED,
      )
    const headers = new Headers(options.headers)
    // The gateway rejects every mutating console write without this marker.
    if (!isSafeHttpMethod(method))
      headers.set(EMRANK_CSRF_HEADER_NAME, EMRANK_CSRF_HEADER_VALUE)
    const response = await fetchApiResponse<string>(
      {
        ...request,
        auth: {
          ...request.auth,
          accessToken: undefined,
          ...(firefox ? { cookie: cookieSession.cookieHeader } : {}),
        },
        ...(firefox
          ? {
              cookieSession: undefined,
              fetchContext: undefined,
              forceTempWindow: false,
            }
          : { cookieSession }),
        // Identity/inventory reads do not establish that a mutation was sent.
        observer: isSafeHttpMethod(method) ? undefined : request.observer,
      },
      {
        endpoint,
        responseType: "text",
        options: { cache: "no-store", ...options, headers },
        currentTabTransport: "disabled",
        ...(firefox ? { tempWindowFallback: {} } : {}),
      },
    )
    if (!response.ok) {
      const parsed = parseJsonBody(response.body, endpoint)
      const envelope =
        isRecord(parsed) && isRecord(parsed.error) ? parsed.error : undefined
      const message =
        envelope && typeof envelope.message === "string" && envelope.message
          ? envelope.message
          : undefined
      throw new ApiError(
        message || `EMRank request failed: ${response.status}`,
        response.status,
        endpoint,
        httpErrorCode(response.status),
        envelope && typeof envelope.code === "string" && envelope.code
          ? envelope.code
          : undefined,
      )
    }
    // Accepted writes answer 204 with an empty body.
    if (!isSafeHttpMethod(method))
      notifyApiTransportObserver(request.observer, "onMutationAccepted")
    if (typeof response.body !== "string" || !response.body.trim()) return {}
    const body = parseJsonBody(response.body, endpoint)
    if (!isRecord(body)) invalidEmRankResponse(endpoint)
    return body
  })
}

/** Empty answers carry no fields; non-JSON answers are rejected. */
function parseJsonBody(body: unknown, endpoint: string): unknown {
  if (typeof body !== "string" || !body.trim()) return {}
  try {
    return JSON.parse(body)
  } catch {
    return invalidEmRankResponse(endpoint)
  }
}

/** Identity and public configuration are stable within one fixed-Cookie operation. */
export async function readEmRank(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
): Promise<Record<string, unknown>> {
  return withEmRankSession(request, async (scoped) => {
    const reusable =
      (options.method ?? "GET").toUpperCase() === "GET" &&
      reusableEndpoints.has(endpoint)
    if (!reusable) return readEmRankUncached(scoped, endpoint, options)
    const reads = operationReads.get(scoped)!
    let pending = reads.get(endpoint)
    if (!pending) {
      pending = readEmRankUncached(scoped, endpoint, options).catch((error) => {
        reads.delete(endpoint)
        throw error
      })
      reads.set(endpoint, pending)
    }
    return pending
  })
}
