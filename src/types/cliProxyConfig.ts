export interface CliProxyConfig {
  /**
   * Management API base URL, e.g. http://localhost:8317/v0/management
   */
  baseUrl: string
  /**
   * Management API key (MANAGEMENT_KEY) for Authorization header
   */
  managementKey: string
}

export const DEFAULT_CLI_PROXY_CONFIG: CliProxyConfig = {
  baseUrl: "",
  managementKey: "",
}
