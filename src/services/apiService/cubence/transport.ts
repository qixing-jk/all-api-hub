import { CUBENCE_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { isSafeHttpMethod } from "~/services/apiTransport/httpMethods"
import { fetchApi } from "~/services/apiTransport/request"
import { notifyApiTransportObserver } from "~/services/apiTransport/requestExecution"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { isRecord } from "~/utils/core/object"

import { getCubenceCookieSession, withCubenceSession } from "./session"

/** Reject unknown wire shapes rather than converting missing data to zero. */
export function invalidCubenceResponse(endpoint: string): never {
  throw new ApiError(
    "Invalid Cubence response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )
}

/**
 * Cubence's console uses same-origin cookies, not its inference API keys.
 * https://cubence.com/dashboard, verified 2026-10-09: auth/me is plain JSON;
 * other routes use success:true, code:0 or code:200 depending on the endpoint.
 */
export async function readCubenceResponse(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
): Promise<Record<string, unknown>> {
  return withCubenceSession(request, async (request) => {
    if (
      new URL(request.baseUrl).origin !== CUBENCE_WEB_ORIGIN ||
      request.auth.authType !== AuthTypeEnum.Cookie ||
      !endpoint.startsWith("/api/")
    ) {
      throw new ApiError(
        "Cubence requires its console cookie session",
        undefined,
        endpoint,
        API_ERROR_CODES.FEATURE_UNSUPPORTED,
      )
    }
    // https://cubence.com/dashboard, CDP 2026-10-10: explicit Cookie + site Origin
    // supports direct CRUD with credentials:omit; bare extension-origin writes fail.
    const method = (options.method ?? "GET").toUpperCase()
    const direct = import.meta.env.BROWSER !== "firefox"
    const body = await fetchApi<unknown>(
      {
        ...request,
        auth: { ...request.auth, accessToken: undefined },
        // Identity/inventory reads do not establish that a key mutation was sent.
        observer: isSafeHttpMethod(method) ? undefined : request.observer,
        ...(direct
          ? {
              cookieSession: getCubenceCookieSession(
                request,
                new URL(endpoint, CUBENCE_WEB_ORIGIN),
              ),
              requestTimeoutMs: request.requestTimeoutMs ?? 15_000,
            }
          : {}),
        ...(!direct && !isSafeHttpMethod(method)
          ? { forceTempWindow: true }
          : {}),
      },
      { endpoint, options: { cache: "no-store", ...options } },
      true,
    )
    if (!isRecord(body)) return invalidCubenceResponse(endpoint)
    if (
      body.success === false ||
      (body.code !== undefined && body.code !== 0 && body.code !== 200) ||
      typeof body.error === "string"
    ) {
      // A failure envelope is the console refusing the request, not a
      // malformed answer: keep its message so a dispatched write can be
      // proven not-applied instead of guessed as state-uncertain.
      const message =
        readNonBlankString(body.message) ??
        (typeof body.error === "string" ? body.error : undefined) ??
        (isRecord(body.error)
          ? readNonBlankString(body.error.message)
          : undefined)
      throw new ApiError(
        message ?? "Cubence request failed",
        undefined,
        endpoint,
        API_ERROR_CODES.BUSINESS_ERROR,
        body.code !== undefined ? String(body.code) : undefined,
      )
    }
    if (!isSafeHttpMethod(method))
      notifyApiTransportObserver(request.observer, "onMutationAccepted")
    return body
  })
}

/** Reads one non-blank string field off a failure envelope. */
function readNonBlankString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

/** Console amounts are numeric microcredits; string coercion hides bad data. */
export function cubenceNumber(value: unknown, endpoint: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    return invalidCubenceResponse(endpoint)
  return value
}
