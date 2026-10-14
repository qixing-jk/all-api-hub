import { XIAOEN_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { createCookieOperationSession } from "~/services/apiTransport/cookieOperationSession"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { hasCookieInterceptorPermissions } from "~/services/permissions/permissionManager"
import { isRecord } from "~/utils/core/object"

import { XIAOEN_ENDPOINTS } from "./constants"

export const XIAOEN_CONSOLE_ORIGIN = XIAOEN_WEB_ORIGIN
const session = createCookieOperationSession({
  origin: XIAOEN_CONSOLE_ORIGIN,
  loginCookieName: "auth_token",
})
const operationReads = new WeakMap<
  ApiServiceRequest,
  Map<string, Promise<Record<string, unknown>>>
>()
const reusableEndpoints = new Set<string>([
  XIAOEN_ENDPOINTS.Identity,
  XIAOEN_ENDPOINTS.Config,
])

/** Nested reads share facts only while the same captured Cookie operation is active. */
export async function withXiaoenSession<TRequest extends ApiServiceRequest, T>(
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

export const invalidXiaoenResponse = (endpoint: string) =>
  new ApiError(
    "Invalid Xiaoen response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

/** Bind the HttpOnly console login across identity checks, native writes and readback. */
export async function fetchXiaoenEnvelope(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
): Promise<Record<string, unknown>> {
  return withXiaoenSession(request, async (request) => {
    const cookieSession = session.getSession(
      request,
      new URL(endpoint, XIAOEN_CONSOLE_ORIGIN),
    )
    const firefox = import.meta.env.BROWSER === "firefox"
    if (firefox && !(await hasCookieInterceptorPermissions()))
      throw new ApiError(
        "Xiaoen requires Cookie interceptor permissions",
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
      false,
    )
    if (!isRecord(body) || typeof body.success !== "boolean")
      throw invalidXiaoenResponse(endpoint)
    if (!body.success) {
      const message =
        typeof body.message === "string"
          ? body.message
          : "肖恩 AI request failed"
      throw new ApiError(
        message,
        message === "未登录" ? 401 : undefined,
        endpoint,
        message === "未登录"
          ? API_ERROR_CODES.HTTP_401
          : API_ERROR_CODES.BUSINESS_ERROR,
      )
    }
    return body
  })
}

/** Read a successful object payload without reusing prior operation facts. */
async function readXiaoenUncached(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
) {
  const body = await fetchXiaoenEnvelope(request, endpoint, options)
  if (!isRecord(body.data)) throw invalidXiaoenResponse(endpoint)
  return body.data
}

/** Identity and public configuration are stable within one fixed-Cookie operation. */
export async function readXiaoen(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
): Promise<Record<string, unknown>> {
  return withXiaoenSession(request, async (scoped) => {
    const reusable =
      (options.method ?? "GET").toUpperCase() === "GET" &&
      reusableEndpoints.has(endpoint)
    if (!reusable) return readXiaoenUncached(scoped, endpoint, options)
    const reads = operationReads.get(scoped)!
    let pending = reads.get(endpoint)
    if (!pending) {
      pending = readXiaoenUncached(scoped, endpoint, options)
      reads.set(endpoint, pending)
    }
    return pending
  })
}
