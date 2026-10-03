import {
  GRSAI_CONSOLE_API_ORIGIN,
  GRSAI_ENDPOINTS,
  GRSAI_SUCCESS_CODE,
  GRSAI_UNAUTHENTICATED_CODE,
} from "~/services/apiService/grsai/constants"
import { isGrsaiConfig, isRecord } from "~/services/apiService/grsai/parsing"
import {
  computeGrsaiSignature,
  type GrsaiSignatureMaterial,
} from "~/services/apiService/grsai/signature"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchPreparedJsonResponse } from "~/services/apiTransport/requestExecution"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { getErrorMessage } from "~/utils/core/error"
import { joinUrl } from "~/utils/core/url"
import { t } from "~/utils/i18n/core"

/** One console signing session: the token to use plus the material for `xtx`. */
export type GrsaiConsoleSession = {
  /** Session token the console just issued; replaces the stored one. */
  token: string
  material: GrsaiSignatureMaterial
  /** Whether the token the session was opened with still drove a signed-in call. */
  isAuth: boolean
}

export type GrsaiConsoleRequestOptions = {
  body?: Record<string, unknown>
  /**
   * Opened session to authenticate with. Callers that issue several calls open
   * one session and reuse it instead of paying a `getConfig` each.
   */
  session?: GrsaiConsoleSession
  /**
   * Whether to attach the `xtx` signature built from the session material.
   * Only mutating endpoints require it, so reads stay unsigned.
   */
  sign?: boolean
}

export const getGrsaiAccessToken = (request: ApiServiceRequest): string =>
  typeof request.auth?.accessToken === "string"
    ? request.auth.accessToken.trim()
    : ""

const decodeEnvelope = <T>(body: unknown, endpoint: string): T => {
  if (!isRecord(body) || typeof body.code !== "number") {
    throw new ApiError(
      t("messages:errors.api.invalidResponseFormat"),
      undefined,
      endpoint,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }

  if (body.code === GRSAI_SUCCESS_CODE) return body.data as T

  if (body.code === GRSAI_UNAUTHENTICATED_CODE) {
    throw new ApiError(
      t("messages:operations.detection.getInfoFailed"),
      401,
      endpoint,
      API_ERROR_CODES.HTTP_401,
      String(body.code),
    )
  }

  throw new ApiError(
    getErrorMessage(
      typeof body.msg === "string" ? body.msg : undefined,
      t("messages:errors.api.invalidResponseFormat"),
    ),
    undefined,
    endpoint,
    API_ERROR_CODES.BUSINESS_ERROR,
    String(body.code),
  )
}

/** Whether a failure means the saved console token is no longer accepted. */
export const isGrsaiAuthFailureError = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.statusCode === 401

/**
 * Calls one console endpoint.
 *
 * The console answers failures with HTTP 200 and a non-zero `code`, so the
 * envelope is what decides success. `credentials: "omit"` is deliberate: the
 * console API is a different registrable domain from the console and carries no
 * cookies, and the session token is the only credential.
 */
export async function fetchGrsaiConsole<T>(
  request: ApiServiceRequest,
  endpoint: string,
  options: GrsaiConsoleRequestOptions = {},
): Promise<T> {
  const token = options.session?.token ?? getGrsaiAccessToken(request)
  if (!token) {
    throw new ApiError(
      t("messages:operations.detection.getInfoFailed"),
      401,
      endpoint,
      API_ERROR_CODES.HTTP_401,
    )
  }

  const body = options.body ?? {}
  const headers = new Headers()
  headers.set("Content-Type", "application/json")
  // Grsai takes the raw session token, not `Bearer <token>`.
  headers.set("Authorization", token)
  if (options.sign && options.session) {
    headers.set(
      "xtx",
      await computeGrsaiSignature(options.session.material, body),
    )
  }

  const response = await fetchPreparedJsonResponse(
    { ...request, baseUrl: GRSAI_CONSOLE_API_ORIGIN },
    {
      url: joinUrl(GRSAI_CONSOLE_API_ORIGIN, endpoint),
      options: {
        method: "POST",
        headers,
        credentials: "omit",
        body: JSON.stringify(body),
      },
    },
  )

  if (!response.ok) {
    throw new ApiError(
      t("messages:errors.api.requestFailed", { status: response.status }),
      response.status,
      endpoint,
      API_ERROR_CODES.HTTP_OTHER,
    )
  }

  return decodeEnvelope<T>(response.body, endpoint)
}

/**
 * Exchanges the saved session token for a fresh one plus the material the next
 * signature needs.
 *
 * The console rotates `localStorage.Token` this way on every page load, and it
 * ties the material to the token it returns, so a mutation has to be sent with
 * the token from the same exchange.
 */
export async function openGrsaiConsoleSession(
  request: ApiServiceRequest,
): Promise<GrsaiConsoleSession> {
  const token = getGrsaiAccessToken(request)
  const payload = await fetchGrsaiConsole<unknown>(
    request,
    GRSAI_ENDPOINTS.config,
    {
      body: { token, referrer: "" },
    },
  )

  if (!isGrsaiConfig(payload)) {
    throw new ApiError(
      t("messages:errors.api.invalidResponseFormat"),
      undefined,
      GRSAI_ENDPOINTS.config,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }

  return {
    token: payload.token,
    material: {
      kis: payload.kis,
      ra1: payload.ra1,
      ra2: payload.ra2,
      random: payload.random,
    },
    isAuth: payload.isAuth === true,
  }
}

/**
 * Opens a session and performs one signed call with it, which is what every
 * mutating console endpoint requires.
 */
export async function fetchGrsaiSignedConsole<T>(
  request: ApiServiceRequest,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<{ data: T; session: GrsaiConsoleSession }> {
  const session = await openGrsaiConsoleSession(request)
  const data = await fetchGrsaiConsole<T>(request, endpoint, {
    body,
    session,
    sign: true,
  })
  return { data, session }
}
