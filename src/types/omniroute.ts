/**
 * OmniRoute (https://github.com/diegosouzapw/OmniRoute) management API shapes.
 *
 * OmniRoute is a self-hosted Next.js AI gateway. "Channels" in this extension
 * are the gateway's provider connections. Verified against a live deployment of
 * the upstream `release/v3.8.51` line on 2026-09-29; the repository's
 * `docs/openapi.yaml` drifts from the route handlers (it documents `url`
 * instead of `apiKey` for `POST /api/providers`), so these types follow the
 * route handlers only.
 */

/** Provider connection row as returned by `/api/providers`. */
export interface OmniRouteConnection {
  id: string
  provider: string
  name?: string | null
  displayName?: string | null
  /**
   * Masked as `pre8****post4` unless the deployment enables API-key reveal.
   * Never treat this as a usable credential; the unmasked read is
   * `/api/providers/client`.
   */
  apiKey?: string | null
  providerSpecificData?: Record<string, unknown> | null
  defaultModel?: string | null
  isActive?: boolean | null
  authType?: string | null
  testStatus?: string | null
  lastError?: string | null
  priority?: number | null
  [key: string]: unknown
}

/** Model catalog entry from `GET /api/models`. */
export interface OmniRouteModelEntry {
  provider?: string | null
  model?: string | null
  name?: string | null
  fullModel?: string | null
  [key: string]: unknown
}

/** `GET /api/cli/whoami` — also reports the caller's token scope. */
export interface OmniRouteWhoAmI {
  authenticated?: boolean | null
  viaAccessToken?: boolean | null
  scope?: string | null
  [key: string]: unknown
}

/** `POST /api/cli/connect` — the plaintext token is returned exactly once. */
export interface OmniRouteMintedToken {
  success?: boolean | null
  token: string
  id?: string | null
  name?: string | null
  scope?: string | null
  expiresAt?: string | null
  [key: string]: unknown
}

/** Access-token scopes enforced by the gateway's management authorization. */
export const OMNIROUTE_ACCESS_TOKEN_SCOPES = {
  Read: "read",
  Write: "write",
  Admin: "admin",
} as const

export type OmniRouteAccessTokenScope =
  (typeof OMNIROUTE_ACCESS_TOKEN_SCOPES)[keyof typeof OMNIROUTE_ACCESS_TOKEN_SCOPES]
