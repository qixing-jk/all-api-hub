import { KRILL_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { createCookieOperationSession } from "~/services/apiTransport/cookieOperationSession"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { isSafeHttpMethod } from "~/services/apiTransport/httpMethods"
import { fetchApi } from "~/services/apiTransport/request"
import { notifyApiTransportObserver } from "~/services/apiTransport/requestExecution"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { hasCookieInterceptorPermissions } from "~/services/permissions/permissionManager"
import { AuthTypeEnum } from "~/types"
import { parseCookieHeader } from "~/utils/browser/cookieString"
import { isRecord } from "~/utils/core/object"

import { KRILL_ENDPOINTS } from "./constants"

/**
 * `krill_jwt` is the console login credential: the site stores it in both
 * localStorage (sent as `Authorization: Bearer`) and a 7-day `Path=/` Cookie,
 * and a cookie-only authenticated request succeeds. Verified 2026-10-14.
 */
const session = createCookieOperationSession({
  origin: KRILL_WEB_ORIGIN,
  loginCookieName: "krill_jwt",
})
const operationReads = new WeakMap<
  ApiServiceRequest,
  Map<string, Promise<Record<string, unknown>>>
>()
/** Identity and the personal endpoint catalogue are stable within one operation. */
const reusableEndpoints = new Set<string>([
  KRILL_ENDPOINTS.Identity,
  KRILL_ENDPOINTS.EndpointSettings,
])

/** Every console route returns `{success, code, data}`; callers own field checks. */
export function invalidKrillResponse(endpoint: string): never {
  throw new ApiError(
    "Invalid Krill AI response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )
}

/** Console amounts arrive as fixed-precision USD strings; coercion hides bad data. */
export function krillNumber(value: unknown, endpoint: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    return invalidKrillResponse(endpoint)
  return value
}

/** Parse a fixed-precision USD string without silently reading missing values as zero. */
export function usdAmount(value: unknown, endpoint: string): number {
  if (typeof value !== "string" || !/^-?\d+(\.\d+)?$/.test(value.trim()))
    return invalidKrillResponse(endpoint)
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0)
    return invalidKrillResponse(endpoint)
  return amount
}

/** Nested reads share facts only while the same captured Cookie operation is active. */
export async function withKrillSession<TRequest extends ApiServiceRequest, T>(
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

/** Bind the HttpOnly console login across identity checks, native writes and readback. */
async function fetchKrillRaw(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
): Promise<unknown> {
  return withKrillSession(request, async (request) => {
    if (
      new URL(request.baseUrl).origin !== KRILL_WEB_ORIGIN ||
      request.auth.authType !== AuthTypeEnum.Cookie ||
      !endpoint.startsWith("/api/")
    )
      throw new ApiError(
        "Krill AI requires its console Cookie session",
        undefined,
        endpoint,
        API_ERROR_CODES.FEATURE_UNSUPPORTED,
      )
    const cookieSession = session.getSession(
      request,
      new URL(endpoint, KRILL_WEB_ORIGIN),
    )
    // Native account routes use the same JWT as both Cookie and Bearer. The
    // identity route alone can accept Cookie, so it cannot prove other reads.
    const encodedJwt = parseCookieHeader(cookieSession.cookieHeader).get(
      "krill_jwt",
    )
    if (!encodedJwt)
      throw new ApiError(
        "Krill AI session unavailable",
        401,
        endpoint,
        API_ERROR_CODES.HTTP_401,
      )
    let jwt: string
    try {
      jwt = decodeURIComponent(encodedJwt)
    } catch {
      return invalidKrillResponse(endpoint)
    }
    const firefox = import.meta.env.BROWSER === "firefox"
    if (firefox && !(await hasCookieInterceptorPermissions()))
      throw new ApiError(
        "Krill AI requires Cookie interceptor permissions",
        undefined,
        endpoint,
        API_ERROR_CODES.COOKIE_PERMISSION_REQUIRED,
      )
    const method = (options.method ?? "GET").toUpperCase()
    const body = await fetchApi<unknown>(
      {
        ...request,
        auth: {
          ...request.auth,
          accessToken: jwt,
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
        options: { cache: "no-store", ...options },
        currentTabTransport: "disabled",
        ...(firefox ? { tempWindowFallback: {} } : {}),
      },
      false,
    )
    return body
  })
}

/**
 * Validate the envelope. The console reports business failures as
 * `{success:false, message}` and expiring sessions as HTTP 401, which the
 * site's own client answers by clearing the credential and returning to
 * `/login`.
 */
export async function readKrillEnvelope(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
): Promise<Record<string, unknown>> {
  const body = await fetchKrillRaw(request, endpoint, options)
  if (!isRecord(body) || typeof body.success !== "boolean")
    invalidKrillResponse(endpoint)
  if (body.success !== true) {
    const message =
      (isRecord(body.error) && typeof body.error.message === "string"
        ? body.error.message
        : undefined) ??
      (typeof body.message === "string" ? body.message : undefined)
    const unauthorized =
      /未登录|登录已过期|请重新登录|unauthorized|login/i.test(message ?? "") ||
      body.code === 401
    throw new ApiError(
      message || "Krill AI request failed",
      unauthorized ? 401 : undefined,
      endpoint,
      unauthorized ? API_ERROR_CODES.HTTP_401 : API_ERROR_CODES.BUSINESS_ERROR,
    )
  }
  if (!isSafeHttpMethod((options.method ?? "GET").toUpperCase()))
    notifyApiTransportObserver(request.observer, "onMutationAccepted")
  return body
}

/** Read an object payload without reusing prior operation facts. */
async function readKrillUncached(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
) {
  const body = await readKrillEnvelope(request, endpoint, options)
  if (!isRecord(body.data)) invalidKrillResponse(endpoint)
  return body.data
}

/** Identity and public configuration are stable within one fixed-Cookie operation. */
export async function readKrill(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
): Promise<Record<string, unknown>> {
  return withKrillSession(request, async (scoped) => {
    const reusable =
      (options.method ?? "GET").toUpperCase() === "GET" &&
      reusableEndpoints.has(endpoint)
    if (!reusable) return readKrillUncached(scoped, endpoint, options)
    const reads = operationReads.get(scoped)!
    let pending = reads.get(endpoint)
    if (!pending) {
      pending = readKrillUncached(scoped, endpoint, options).catch((error) => {
        reads.delete(endpoint)
        throw error
      })
      reads.set(endpoint, pending)
    }
    return pending
  })
}
