/**
 * OmniRoute managed-site configuration.
 *
 * OmniRoute is self-hosted, so the deployment address is user supplied and
 * there is no enumerable official hostname. Authentication uses an existing
 * access token created in the gateway. The token is opaque to the extension;
 * the gateway validates its identity and scope.
 */
export interface OmniRouteConfig {
  /** OmniRoute dashboard/base URL, e.g. `http://localhost:20128`. */
  baseUrl: string
  /**
   * Access token. Must carry the `admin` scope: channel writes
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
