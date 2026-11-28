import { resolveDeploymentApiOrigin } from "~/constants/deploymentApiOrigins"
import { SITE_TYPES } from "~/constants/siteType"
import {
  fetchSub2ApiBrowserSessionIdentity,
  probeSub2ApiBrowserPanelMiddleware,
  SUB2API_PANEL_MIDDLEWARE_OUTCOMES,
} from "~/services/apiService/sub2api/auth/browserPanelProof"
import { SUB2API_AUTH_STORAGE_KEYS } from "~/services/apiService/sub2api/auth/browserSession"
import { readSub2ApiPanelTokenBinding } from "~/services/apiService/sub2api/auth/panelProofProtocol"
import { parseSub2ApiUserIdentity } from "~/services/apiService/sub2api/parsing"
import { SUB2API_AUTH_REFRESH_ENDPOINT } from "~/services/apiService/sub2api/type"
import { isRecord } from "~/utils/core/object"

import {
  ContentSessionProtocolError,
  type ContentSessionExtractor,
} from "../contracts"

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

export class Sub2ApiContentSessionLoginRequiredError extends ContentSessionProtocolError {
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

/** Token rotation may overlap a website account switch; keep identity bound. */
const assertStoredUserUnchanged = (authUserRaw: string) => {
  const identity = parseSub2ApiUserIdentity(JSON.parse(authUserRaw))
  const currentIdentity = parseSub2ApiUserIdentity(
    JSON.parse(
      localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.authUser) ?? "null",
    ),
  )
  if (currentIdentity.userId !== identity.userId) {
    throw new Sub2ApiContentSessionLoginRequiredError()
  }
  return identity
}

const refreshSub2ApiTokensIfNeeded = async (params: {
  baseUrl: string | null
  authUserRaw: string
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
      ? new URL(
          SUB2API_AUTH_REFRESH_ENDPOINT,
          resolveDeploymentApiOrigin(baseUrl),
        ).toString()
      : SUB2API_AUTH_REFRESH_ENDPOINT

  let payload: Sub2ApiEnvelope<Sub2ApiRefreshTokenData> | null
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    const body = await response.json()
    if (!response.ok) throw new Error("Sub2API token refresh failed")
    payload = body as Sub2ApiEnvelope<Sub2ApiRefreshTokenData> | null
  } catch {
    // The server may have rotated the refresh token before the response was
    // lost. Never export the old pair as a successful refresh or replay it.
    throw new Error("Sub2API token refresh failed")
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    payload.code !== 0 ||
    !payload.data
  ) {
    throw new Error("Sub2API token refresh failed")
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
    throw new Error("Sub2API token refresh failed")
  }

  const nextExpiresAt = now + expiresInSeconds * 1000

  assertStoredUserUnchanged(params.authUserRaw)
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
  async probe(context) {
    const accessToken = localStorage
      .getItem(SUB2API_AUTH_STORAGE_KEYS.accessToken)
      ?.trim()
    const authUserRaw = localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.authUser)
    if (!accessToken || !authUserRaw) return null

    // Generic storage keys are not a protocol signature. Confirm the logged-in
    // identity through Sub2API's read-only auth/me contract before extraction
    // is allowed to rotate a near-expiry token. Resolve only the live page origin
    // through the registered deployment map; never guess another credential host.
    // https://github.com/Wei-Shaw/sub2api: GET /api/v1/auth/me, bearer auth, code=0.
    const origin = location.origin
    let storedIdentity
    try {
      storedIdentity = parseSub2ApiUserIdentity(JSON.parse(authUserRaw))
    } catch {
      return null
    }
    let body: unknown
    try {
      const { response } = await fetchSub2ApiBrowserSessionIdentity(
        resolveDeploymentApiOrigin(origin),
        accessToken,
      )
      if (response.status >= 500 || response.status === 429) {
        throw new Error("Sub2API session probe unavailable")
      }
      if (!response.ok) return null
      body = await response.json()
    } catch {
      // A transport/body failure does not establish that another protocol owns
      // the page, and must not be hidden by a cached generic user fallback.
      throw new Error("Sub2API session probe request failed")
    }
    if (!isRecord(body) || body.code !== 0 || !isRecord(body.data)) return null
    try {
      const identity = parseSub2ApiUserIdentity(body.data)
      if (identity.userId !== storedIdentity.userId) return null
    } catch {
      return null
    }
    if (
      localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.accessToken)?.trim() !==
        accessToken ||
      localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.authUser) !== authUserRaw
    )
      return null
    try {
      return await sub2ApiContentSessionExtractor.extract({
        ...context,
        url: origin,
        siteTypeHint: SITE_TYPES.SUB2API,
      })
    } catch (error) {
      if (error instanceof ContentSessionProtocolError) throw error
      throw new ContentSessionProtocolError("Sub2API session extraction failed")
    }
  },
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

    // The website owns renewal for its bound session. Exporting its refresh
    // token would let two independent clients rotate the same family.
    // A cnf hint alone does not enable signing. Validate it before exporting
    // credentials so a cleared native key cannot masquerade as an ordinary JWT.
    if (readSub2ApiPanelTokenBinding(accessToken)) {
      const apiOrigin = resolveDeploymentApiOrigin(location.origin)
      const { response, browserOwnsSession } =
        await fetchSub2ApiBrowserSessionIdentity(apiOrigin, accessToken)
      // The browser protocol already rejects explicit proof middleware errors.
      // A plain 401 without native-key evidence can still be an ordinary expired
      // JWT; retain its established refresh path below.
      if (browserOwnsSession || response.status !== 401) {
        const body = await response.json()
        const expected = assertStoredUserUnchanged(authUserRaw)
        if (
          !response.ok ||
          body?.code !== 0 ||
          parseSub2ApiUserIdentity(body.data).userId !== expected.userId ||
          localStorage
            .getItem(SUB2API_AUTH_STORAGE_KEYS.accessToken)
            ?.trim() !== accessToken
        )
          throw new Sub2ApiContentSessionLoginRequiredError()
        if (browserOwnsSession)
          return {
            userId: expected.userId,
            user: {
              id: expected.userId,
              username: expected.username,
              balance: expected.balanceUsd,
            },
            accessToken,
            siteTypeHint: SITE_TYPES.SUB2API,
            sub2apiWebsiteSessionBound: true,
          }
      } else if (
        (await probeSub2ApiBrowserPanelMiddleware(apiOrigin)) !==
        SUB2API_PANEL_MIDDLEWARE_OUTCOMES.VerifiedOrdinary
      ) {
        // Some deployments reject expired bearer tokens before proof middleware.
        // Discover that middleware without sending the website's refresh token.
        throw new Sub2ApiContentSessionLoginRequiredError()
      }
    }

    try {
      const refreshed = await refreshSub2ApiTokensIfNeeded({
        baseUrl,
        authUserRaw,
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
      try {
        assertStoredUserUnchanged(authUserRaw)
      } catch {
        throw new Sub2ApiContentSessionLoginRequiredError()
      }
      const stored = readStoredTokenState()
      if (
        stored.accessToken &&
        stored.refreshToken &&
        (stored.accessToken !== accessToken ||
          stored.refreshToken !== refreshToken) &&
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
      const identity = assertStoredUserUnchanged(authUserRaw)

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
