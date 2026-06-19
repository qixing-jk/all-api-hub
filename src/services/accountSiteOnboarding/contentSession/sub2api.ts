import { SITE_TYPES } from "~/constants/siteType"
import { parseSub2ApiUserIdentity } from "~/services/apiService/sub2api/parsing"

import type { ContentSessionExtractor } from "../contracts"

/**
 * Sub2API uses a short-lived JWT access token with a refresh-token flow.
 *
 * The dashboard stores auth state in localStorage, and will refresh tokens on its
 * own. But the extension may read localStorage before the dashboard finishes its
 * refresh, so we proactively refresh when the saved expiry timestamp is close.
 *
 * IMPORTANT:
 * - Never log tokens.
 * - Only refresh when expiry info exists (avoid unnecessary refresh-token rotation).
 */
const SUB2API_AUTH_STORAGE_KEYS = {
  accessToken: "auth_token",
  refreshToken: "refresh_token",
  tokenExpiresAt: "token_expires_at",
  authUser: "auth_user",
} as const

// Match upstream buffer: refresh ~2 minutes before expiry.
const SUB2API_TOKEN_REFRESH_BUFFER_MS = 120 * 1000

export const SUB2API_LOGIN_REQUIRED_I18N_KEY = "messages:sub2api.loginRequired"

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

export class Sub2ApiContentSessionLoginRequiredError extends Error {
  constructor() {
    super(SUB2API_LOGIN_REQUIRED_I18N_KEY)
  }
}

const tryParseTimestamp = (value: string | null): number | null => {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

const readStoredTokenState = () => ({
  accessToken:
    localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.accessToken)?.trim() ?? "",
  refreshToken:
    localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.refreshToken)?.trim() ?? "",
  tokenExpiresAt: tryParseTimestamp(
    localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.tokenExpiresAt),
  ),
})

const refreshSub2ApiTokensIfNeeded = async (params: {
  baseUrl: string | null
  accessToken: string
  refreshToken: string
  tokenExpiresAt: number | null
}): Promise<{
  accessToken: string
  refreshToken: string
  tokenExpiresAt: number
} | null> => {
  const { baseUrl, accessToken, refreshToken, tokenExpiresAt } = params

  if (tokenExpiresAt === null) return null

  const now = Date.now()
  const msUntilExpiry = tokenExpiresAt - now
  const isExpired = msUntilExpiry <= 0
  if (!refreshToken.trim()) {
    if (isExpired) {
      throw new Error("Sub2API token refresh unavailable")
    }
    return null
  }
  if (msUntilExpiry > SUB2API_TOKEN_REFRESH_BUFFER_MS) return null

  const endpoint =
    typeof baseUrl === "string" && baseUrl.trim()
      ? new URL("/api/v1/auth/refresh", baseUrl).toString()
      : "/api/v1/auth/refresh"

  let payload: Sub2ApiEnvelope<Sub2ApiRefreshTokenData> | null = null
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })

    payload = (await response
      .json()
      .catch(() => null)) as Sub2ApiEnvelope<Sub2ApiRefreshTokenData> | null
  } catch {
    if (isExpired) {
      throw new Error("Sub2API token refresh failed")
    }
    return null
  }

  if (!payload || typeof payload !== "object") {
    if (isExpired) {
      throw new Error("Sub2API token refresh failed")
    }
    return null
  }

  if (payload.code !== 0 || !payload.data) {
    if (isExpired) {
      throw new Error("Sub2API token refresh failed")
    }
    return null
  }

  const nextAccessToken =
    typeof payload.data.access_token === "string"
      ? payload.data.access_token.trim()
      : ""
  const nextRefreshToken =
    typeof payload.data.refresh_token === "string"
      ? payload.data.refresh_token.trim()
      : ""
  const expiresInSeconds =
    typeof payload.data.expires_in === "number" ? payload.data.expires_in : 0

  if (!nextAccessToken || !nextRefreshToken || expiresInSeconds <= 0) {
    if (isExpired) {
      throw new Error("Sub2API token refresh failed")
    }
    return null
  }

  const nextExpiresAt = now + expiresInSeconds * 1000

  localStorage.setItem(SUB2API_AUTH_STORAGE_KEYS.accessToken, nextAccessToken)
  localStorage.setItem(SUB2API_AUTH_STORAGE_KEYS.refreshToken, nextRefreshToken)
  localStorage.setItem(
    SUB2API_AUTH_STORAGE_KEYS.tokenExpiresAt,
    String(nextExpiresAt),
  )

  return {
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    tokenExpiresAt: nextExpiresAt,
  }
}

export const sub2ApiContentSessionExtractor: ContentSessionExtractor = {
  id: "sub2api",
  canExtract: (context) => {
    return (
      context.siteTypeHint === SITE_TYPES.SUB2API &&
      localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.accessToken) !== null &&
      localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.authUser) !== null
    )
  },
  async extract(context) {
    const authTokenRaw = localStorage.getItem(
      SUB2API_AUTH_STORAGE_KEYS.accessToken,
    )
    const authUserRaw = localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.authUser)

    if (authTokenRaw === null || authUserRaw === null) return null

    let accessToken = authTokenRaw?.trim() ?? ""
    if (!accessToken) {
      throw new Sub2ApiContentSessionLoginRequiredError()
    }

    let { refreshToken, tokenExpiresAt } = readStoredTokenState()
    const baseUrl = typeof context.url === "string" ? context.url : null

    try {
      const refreshed = await refreshSub2ApiTokensIfNeeded({
        baseUrl,
        accessToken,
        refreshToken,
        tokenExpiresAt,
      })
      if (refreshed?.accessToken) {
        accessToken = refreshed.accessToken
        refreshToken = refreshed.refreshToken
        tokenExpiresAt = refreshed.tokenExpiresAt
      }
    } catch {
      const stored = readStoredTokenState()
      if (
        stored.accessToken &&
        typeof stored.tokenExpiresAt === "number" &&
        stored.tokenExpiresAt > Date.now()
      ) {
        accessToken = stored.accessToken
        refreshToken = stored.refreshToken
        tokenExpiresAt = stored.tokenExpiresAt
      } else {
        throw new Sub2ApiContentSessionLoginRequiredError()
      }
    }

    try {
      const authUser = authUserRaw ? JSON.parse(authUserRaw) : null
      const identity = parseSub2ApiUserIdentity(authUser)

      return {
        userId: identity.userId,
        user: {
          id: identity.userId,
          username: identity.username,
          balance: identity.balanceUsd,
        },
        accessToken,
        ...(refreshToken
          ? {
              sub2apiAuth: {
                refreshToken,
                ...(typeof tokenExpiresAt === "number"
                  ? { tokenExpiresAt }
                  : {}),
              },
            }
          : {}),
        siteTypeHint: SITE_TYPES.SUB2API,
      }
    } catch {
      throw new Sub2ApiContentSessionLoginRequiredError()
    }
  },
}
