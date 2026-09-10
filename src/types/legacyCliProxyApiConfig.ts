export interface LegacyCliProxyApiConfig {
  /**
   * Management API base URL, e.g. http://localhost:8317/v0/management
   */
  baseUrl: string
  /**
   * Management API key (MANAGEMENT_KEY) for Authorization header
   */
  managementKey: string
}
