/**
 * Persisted Sub2API managed-site configuration.
 *
 * The admin token is the long-lived Admin API Key sent as `x-api-key`. It is
 * intentionally separate from the dashboard JWT used by saved accounts.
 */
export interface Sub2ApiManagedSiteConfig {
  baseUrl: string
  adminToken: string
}

export const DEFAULT_SUB2API_MANAGED_SITE_CONFIG: Sub2ApiManagedSiteConfig = {
  baseUrl: "",
  adminToken: "",
}
