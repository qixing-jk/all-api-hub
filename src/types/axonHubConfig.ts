/**
 * AxonHub managed-site admin configuration.
 */
export interface AxonHubConfig {
  /** AxonHub site base URL. */
  baseUrl: string
  /** Admin email used by /admin/auth/signin. */
  email: string
  /** Admin password used by /admin/auth/signin. */
  password: string
}

export const DEFAULT_AXON_HUB_CONFIG: AxonHubConfig = {
  baseUrl: "",
  email: "",
  password: "",
}
