import { FOXCODE_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { createCookieOperationSession } from "~/services/apiTransport/cookieOperationSession"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { isSafeHttpMethod } from "~/services/apiTransport/httpMethods"
import { fetchApi } from "~/services/apiTransport/request"
import { notifyApiTransportObserver } from "~/services/apiTransport/requestExecution"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { hasCookieInterceptorPermissions } from "~/services/permissions/permissionManager"
import { isRecord } from "~/utils/core/object"

import { FOXCODE_ENDPOINTS } from "./constants"

export const FOXCODE_CONSOLE_ORIGIN = FOXCODE_WEB_ORIGIN
const session = createCookieOperationSession({
  origin: FOXCODE_CONSOLE_ORIGIN,
  loginCookieName: "auth_token",
})
/** Reads one non-blank string field off a failure envelope. */
function readNonBlankString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

const operationReads = new WeakMap<
  ApiServiceRequest,
  Map<string, Promise<Record<string, unknown>>>
>()
const reusableEndpoints = new Set<string>([
  FOXCODE_ENDPOINTS.Identity,
  FOXCODE_ENDPOINTS.Channels,
  FOXCODE_ENDPOINTS.InferenceOrigin,
])

/** Nested reads share facts only while the same captured Cookie operation is active. */
export async function withFoxCodeSession<TRequest extends ApiServiceRequest, T>(
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

export const invalidFoxCodeResponse = (endpoint: string) =>
  new ApiError(
    "Invalid FoxCode response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

/** Bind the HttpOnly console login across identity checks, native writes and readback. */
async function readFoxCodeUncached(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
): Promise<Record<string, unknown>> {
  return withFoxCodeSession(request, async (request) => {
    const cookieSession = session.getSession(
      request,
      new URL(endpoint, FOXCODE_CONSOLE_ORIGIN),
    )
    const firefox = import.meta.env.BROWSER === "firefox"
    if (firefox && !(await hasCookieInterceptorPermissions()))
      throw new ApiError(
        "FoxCode requires Cookie interceptor permissions",
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
        observer: isSafeHttpMethod(method) ? undefined : request.observer,
      },
      {
        endpoint,
        options: { cache: "no-store", ...options },
        currentTabTransport: "disabled",
        ...(firefox ? { tempWindowFallback: {} } : {}),
      },
      true,
    )
    if (
      method === "DELETE" &&
      isRecord(body) &&
      body.success === true &&
      body.data === undefined
    ) {
      notifyApiTransportObserver(request.observer, "onMutationAccepted")
      return {}
    }
    if (isRecord(body) && body.success === false) {
      // A failure envelope is the console refusing the request, not a
      // malformed answer: keep its message so a dispatched write can be
      // proven not-applied instead of guessed as state-uncertain.
      const message =
        readNonBlankString(body.message) ??
        (typeof body.error === "string" ? body.error : undefined)
      throw new ApiError(
        message ?? "FoxCode request failed",
        undefined,
        endpoint,
        API_ERROR_CODES.BUSINESS_ERROR,
        body.code !== undefined ? String(body.code) : undefined,
      )
    }
    if (!isRecord(body) || body.success !== true || !isRecord(body.data))
      throw invalidFoxCodeResponse(endpoint)
    if (!isSafeHttpMethod(method))
      notifyApiTransportObserver(request.observer, "onMutationAccepted")
    return body.data
  })
}

/** Identity and public configuration are stable within one fixed-Cookie operation. */
export async function readFoxCode(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
): Promise<Record<string, unknown>> {
  return withFoxCodeSession(request, async (scoped) => {
    const reusable =
      (options.method ?? "GET").toUpperCase() === "GET" &&
      reusableEndpoints.has(endpoint)
    if (!reusable) return readFoxCodeUncached(scoped, endpoint, options)
    const reads = operationReads.get(scoped)!
    let pending = reads.get(endpoint)
    if (!pending) {
      pending = readFoxCodeUncached(scoped, endpoint, options)
      reads.set(endpoint, pending)
    }
    return pending
  })
}
