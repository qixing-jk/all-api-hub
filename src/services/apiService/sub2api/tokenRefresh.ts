import { fetchApiResponse } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import { SUB2API_SESSION_BINDING_MISMATCH_CODE } from "./browserAuth"

/**
 * Match upstream buffer: refresh ~2 minutes before expiry.
 */
export const SUB2API_TOKEN_REFRESH_BUFFER_MS = 120 * 1000

const SUB2API_AUTH_REFRESH_ENDPOINT = "/api/v1/auth/refresh"

type Sub2ApiEnvelope<T> = {
  code: number | string
  message?: string
  data?: T
  detail?: string
}

type Sub2ApiRefreshTokenData = {
  access_token: string
  refresh_token: string
  expires_in: number
}

type Sub2ApiRefreshedCredentials = {
  accessToken: string
  refreshToken: string
  tokenExpiresAt: number
}

export const SUB2API_TOKEN_REFRESH_FAILURE_REASONS = {
  INVALID_REFRESH_TOKEN: "invalid_refresh_token",
  SESSION_BINDING_MISMATCH: "session_binding_mismatch",
  UNCERTAIN_ROTATION: "uncertain_rotation",
} as const

export class Sub2ApiTokenRefreshError extends Error {
  constructor(
    public readonly reason: (typeof SUB2API_TOKEN_REFRESH_FAILURE_REASONS)[keyof typeof SUB2API_TOKEN_REFRESH_FAILURE_REASONS],
  ) {
    super("Sub2API token refresh failed")
    this.name = "Sub2ApiTokenRefreshError"
  }
}

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

const normalizeExpiresInSeconds = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0

/**
 * Refreshes Sub2API tokens.
 *
 * Source: https://github.com/Wei-Shaw/sub2api/blob/67380eafd5ae2eaa8db910ae738199c3dac62e37/backend/internal/service/auth_service.go#L1777-L1861
 * Each refresh immediately invalidates the submitted refresh token and returns
 * a complete replacement pair. An incomplete success response is therefore an
 * uncertain credential mutation and must not replay the submitted token.
 */
export async function refreshSub2ApiTokens(params: {
  request: ApiServiceRequest
  refreshToken: string
}): Promise<Sub2ApiRefreshedCredentials> {
  const { request, refreshToken } = params
  const accessToken = normalizeString(request.auth.accessToken)
  const normalizedRefreshToken = normalizeString(refreshToken)
  if (!normalizedRefreshToken) {
    throw new Error("Sub2API refresh token missing")
  }

  let payload: Sub2ApiEnvelope<Sub2ApiRefreshTokenData> | null
  let responseStatus: number | undefined

  try {
    // Some downstream deployments bind the refresh-token family to the login
    // session's IP and user agent. Preserve the request's browser fetch context
    // so rotation runs in the same context as the dashboard session.
    // Source: https://github.com/LuckyKuang/sub2api-plus/blob/cd1d8438cbe19358936605af7e6b20954283bf15/backend/internal/service/auth_service.go#L1837-L1844
    const response = await fetchApiResponse<
      Sub2ApiEnvelope<Sub2ApiRefreshTokenData>
    >(
      {
        ...request,
        auth: {
          ...request.auth,
          ...(accessToken ? { accessToken } : { accessToken: undefined }),
        },
      },
      {
        endpoint: SUB2API_AUTH_REFRESH_ENDPOINT,
        options: {
          method: "POST",
          body: JSON.stringify({ refresh_token: normalizedRefreshToken }),
        },
      },
    )
    responseStatus = response.status
    payload = response.body
  } catch {
    throw new Sub2ApiTokenRefreshError(
      SUB2API_TOKEN_REFRESH_FAILURE_REASONS.UNCERTAIN_ROTATION,
    )
  }

  if (!payload || typeof payload !== "object") {
    throw new Sub2ApiTokenRefreshError(
      SUB2API_TOKEN_REFRESH_FAILURE_REASONS.UNCERTAIN_ROTATION,
    )
  }

  if (payload.code === SUB2API_SESSION_BINDING_MISMATCH_CODE) {
    throw new Sub2ApiTokenRefreshError(
      SUB2API_TOKEN_REFRESH_FAILURE_REASONS.SESSION_BINDING_MISMATCH,
    )
  }

  if (payload.code !== 0) {
    // Upstream maps rejected refresh tokens to HTTP 401. Other failures may
    // occur after rotation and cannot safely authorize replay of the old token.
    // Source: https://github.com/Wei-Shaw/sub2api/blob/67380eafd5ae2eaa8db910ae738199c3dac62e37/backend/internal/handler/auth_handler.go#L692-L704
    throw new Sub2ApiTokenRefreshError(
      responseStatus === 401
        ? SUB2API_TOKEN_REFRESH_FAILURE_REASONS.INVALID_REFRESH_TOKEN
        : SUB2API_TOKEN_REFRESH_FAILURE_REASONS.UNCERTAIN_ROTATION,
    )
  }

  const data = payload.data
  if (!data || typeof data !== "object") {
    throw new Sub2ApiTokenRefreshError(
      SUB2API_TOKEN_REFRESH_FAILURE_REASONS.UNCERTAIN_ROTATION,
    )
  }

  const nextAccessToken = normalizeString(data.access_token)
  const nextRefreshToken = normalizeString(data.refresh_token)
  const expiresInSeconds = normalizeExpiresInSeconds(data.expires_in)
  if (!nextAccessToken || !nextRefreshToken || expiresInSeconds <= 0) {
    throw new Sub2ApiTokenRefreshError(
      SUB2API_TOKEN_REFRESH_FAILURE_REASONS.UNCERTAIN_ROTATION,
    )
  }

  const now = Date.now()
  const nextExpiresAt = now + expiresInSeconds * 1000

  return {
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    tokenExpiresAt: nextExpiresAt,
  }
}
