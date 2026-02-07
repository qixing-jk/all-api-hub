import { getSafeErrorMessage } from "./redaction"

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

export type Sub2ApiRefreshedCredentials = {
  accessToken: string
  refreshToken: string
  tokenExpiresAt: number
}

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

const normalizeExpiresInSeconds = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0

/**
 *
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
  let payload: Sub2ApiEnvelope<Sub2ApiRefreshTokenData> | null = null

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ refresh_token: normalizedRefreshToken }),
    })

    payload = (await response
      .json()
      .catch(() => null)) as Sub2ApiEnvelope<Sub2ApiRefreshTokenData> | null
  } catch (error) {
    throw new Error(getSafeErrorMessage(error))
  }

  if (!payload || typeof payload !== "object" || payload.code !== 0) {
    throw new Error("Sub2API token refresh failed")
  }

  const data = payload.data
  if (!data || typeof data !== "object") {
    throw new Error("Sub2API token refresh failed")
  }

  const nextAccessToken = normalizeString(data.access_token)
  const nextRefreshToken = normalizeString(data.refresh_token)
  const expiresInSeconds = normalizeExpiresInSeconds(data.expires_in)
  if (!nextAccessToken || !nextRefreshToken || expiresInSeconds <= 0) {
    throw new Error("Sub2API token refresh failed")
  }

  const now = Date.now()
  const nextExpiresAt = now + expiresInSeconds * 1000

  return {
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    tokenExpiresAt: nextExpiresAt,
  }
}
