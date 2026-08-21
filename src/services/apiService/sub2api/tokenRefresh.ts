/**
 * Match upstream buffer: refresh ~2 minutes before expiry.
 */
export const SUB2API_TOKEN_REFRESH_BUFFER_MS = 120 * 1000

type Sub2ApiEnvelope<T> = {
  code: number
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
  baseUrl: string
  accessToken?: string
  refreshToken: string
}): Promise<Sub2ApiRefreshedCredentials> {
  const { baseUrl, refreshToken } = params
  const accessToken = normalizeString(params.accessToken)
  const normalizedRefreshToken = normalizeString(refreshToken)
  if (!normalizedRefreshToken) {
    throw new Error("Sub2API refresh token missing")
  }

  const endpoint = new URL("/api/v1/auth/refresh", baseUrl).toString()
  let payload: Sub2ApiEnvelope<Sub2ApiRefreshTokenData> | null

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ refresh_token: normalizedRefreshToken }),
    })

    payload =
      (await response.json()) as Sub2ApiEnvelope<Sub2ApiRefreshTokenData>
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

  if (payload.code !== 0) {
    throw new Sub2ApiTokenRefreshError(
      SUB2API_TOKEN_REFRESH_FAILURE_REASONS.INVALID_REFRESH_TOKEN,
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
