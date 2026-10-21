import { DAYA_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { createCookieOperationSession } from "~/services/apiTransport/cookieOperationSession"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { hasCookieInterceptorPermissions } from "~/services/permissions/permissionManager"
import { isRecord } from "~/utils/core/object"

/**
 * The only verified console credential is the HttpOnly `daya_sid` Cookie
 * (`domain=.dayaai.com`, browser-session scope, verified 2026-10-20); the site
 * client exposes no personal-access-token or refresh contract.
 */
const session = createCookieOperationSession({
  origin: DAYA_WEB_ORIGIN,
  loginCookieName: "daya_sid",
})

/** Bind the console Cookie across identity checks, native writes and readback. */
export async function withDayaSession<TRequest extends ApiServiceRequest, T>(
  request: TRequest,
  run: (request: TRequest) => Promise<T>,
): Promise<T> {
  return session.withSession(request, run)
}

/** Malformed console payloads are protocol errors, never partial data. */
export function invalidDayaResponse(endpoint: string): never {
  throw new ApiError(
    "Invalid Daya API response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )
}

/**
 * Console amounts are plain USD dollar numbers; coercion hides bad data.
 */
export function dayaNumber(value: unknown, endpoint: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    return invalidDayaResponse(endpoint)
  return value
}

/**
 * Account routes answer `{code, message, data}` with `code === 0` on success.
 * Business failures report a non-zero `code` (observed: HTTP 404 with
 * `{code:404, message:"api key not found", reason:"API_KEY_NOT_FOUND"}`);
 * expiring sessions fail with HTTP 401 before the envelope is parsed.
 */
export async function fetchDayaEnvelope(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
): Promise<{ code: number; message: unknown; data: unknown }> {
  return withDayaSession(request, async (request) => {
    const cookieSession = session.getSession(
      request,
      new URL(endpoint, DAYA_WEB_ORIGIN),
    )
    const firefox = import.meta.env.BROWSER === "firefox"
    if (firefox && !(await hasCookieInterceptorPermissions()))
      throw new ApiError(
        "Daya API requires Cookie interceptor permissions",
        undefined,
        endpoint,
        API_ERROR_CODES.COOKIE_PERMISSION_REQUIRED,
      )
    const method = (options.method ?? "GET").toUpperCase()
    let body: unknown
    try {
      body = await fetchApi<unknown>(
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
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401)
        throw new ApiError(
          "Daya API session expired",
          401,
          endpoint,
          API_ERROR_CODES.HTTP_401,
        )
      throw error
    }
    if (!isRecord(body) || typeof body.code !== "number" || !("data" in body))
      throw invalidDayaResponse(endpoint)
    if (body.code !== 0) {
      const message = typeof body.message === "string" ? body.message : ""
      throw new ApiError(
        message || "Daya API request failed",
        undefined,
        endpoint,
        API_ERROR_CODES.BUSINESS_ERROR,
      )
    }
    return { code: body.code, message: body.message, data: body.data }
  })
}

/** Read a payload without reusing prior operation facts. */
export async function fetchDayaData(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
): Promise<unknown> {
  return (await fetchDayaEnvelope(request, endpoint, options)).data
}
