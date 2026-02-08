import { t } from "i18next"

import { SUB2API } from "~/constants/siteType"
import { parseSub2ApiUserIdentity } from "~/services/apiService/sub2api/parsing"
import { getErrorMessage } from "~/utils/error"

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

const tryParseTimestamp = (value: string | null): number | null => {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

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

  if (!refreshToken.trim() || tokenExpiresAt === null) return null

  const now = Date.now()
  const msUntilExpiry = tokenExpiresAt - now
  if (msUntilExpiry > SUB2API_TOKEN_REFRESH_BUFFER_MS) return null
  const isExpired = msUntilExpiry <= 0

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

/**
 * Handles requests to get data from localStorage.
 */
export function handleGetLocalStorage(
  request: any,
  sendResponse: (res: any) => void,
) {
  try {
    const { key } = request

    if (key) {
      const value = localStorage.getItem(key)
      sendResponse({ success: true, data: { [key]: value } })
    } else {
      const data: Record<string, any> = {}

      for (let i = 0; i < localStorage.length; i++) {
        const storageKey = localStorage.key(i)
        if (storageKey) {
          data[storageKey] = localStorage.getItem(storageKey)
        }
      }

      sendResponse({ success: true, data })
    }
  } catch (error) {
    sendResponse({ success: false, error: getErrorMessage(error) })
  }

  return true
}

/**
 * Handles requests to get user info from localStorage.
 */
export function handleGetUserFromLocalStorage(
  request: any,
  sendResponse: (res: any) => void,
) {
  ;(async () => {
    try {
      const authTokenRaw = localStorage.getItem(
        SUB2API_AUTH_STORAGE_KEYS.accessToken,
      )
      const authUserRaw = localStorage.getItem(
        SUB2API_AUTH_STORAGE_KEYS.authUser,
      )

      // Sub2API dashboard: localStorage-backed JWT session + user identity.
      if (authTokenRaw !== null && authUserRaw !== null) {
        let accessToken = authTokenRaw?.trim() ?? ""
        if (!accessToken) {
          sendResponse({
            success: false,
            error: t("messages:sub2api.loginRequired"),
          })
          return
        }

        const refreshTokenRaw = localStorage.getItem(
          SUB2API_AUTH_STORAGE_KEYS.refreshToken,
        )
        let refreshToken = refreshTokenRaw?.trim() ?? ""
        let tokenExpiresAt = tryParseTimestamp(
          localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.tokenExpiresAt),
        )
        const baseUrl = typeof request?.url === "string" ? request.url : null

        // Best-effort: proactively refresh tokens if the stored expiry is close.
        // This keeps the extension's token reads in sync with Sub2API's latest
        // refresh-token implementation.
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
          // Fall through: if refresh fails, treat as login required.
          sendResponse({
            success: false,
            error: t("messages:sub2api.loginRequired"),
          })
          return
        }

        try {
          const authUser = authUserRaw ? JSON.parse(authUserRaw) : null
          const identity = parseSub2ApiUserIdentity(authUser)
          sendResponse({
            success: true,
            data: {
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
              siteTypeHint: SUB2API,
            },
          })
          return
        } catch {
          sendResponse({
            success: false,
            error: t("messages:sub2api.loginRequired"),
          })
          return
        }
      }

      const userStr = localStorage.getItem("user")
      const user = userStr ? JSON.parse(userStr) : null

      if (!user || !user.id) {
        sendResponse({
          success: false,
          error: t("messages:content.userInfoNotFound"),
        })
        return
      }

      sendResponse({ success: true, data: { userId: user.id, user } })
    } catch (error) {
      sendResponse({ success: false, error: getErrorMessage(error) })
    }
  })()

  return true
}
