/**
 * OmniRoute managed-site configuration.
 *
 * OmniRoute is self-hosted, so the deployment address is user supplied and
 * there is no enumerable official hostname. Authentication is bearer-only:
 * `token` holds an `oma_` scoped access token. A dashboard password may be
 * entered once to mint that token, but the password itself is never persisted
 * because every management call can use the minted token directly.
 */
export interface OmniRouteConfig {
  /** OmniRoute dashboard/base URL, e.g. `http://localhost:20128`. */
  baseUrl: string
  /**
   * Scoped access token (`oma_…`). Must carry the `admin` scope: channel writes
   * live under the gateway's `ADMIN_MUTATION_PREFIXES`.
   */
  token: string
}

export const DEFAULT_OMNIROUTE_CONFIG: OmniRouteConfig = {
  baseUrl: "",
  token: "",
}

/** Trims the stored deployment URL so request paths never double a slash. */
export function normalizeOmniRouteBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "")
}
