/** Per-account console credentials, distinct from API keys and browser sessions. */
export interface AccountPasswordCredentials {
  username: string
  password: string
}

/** Account-owned login settings, independent of any operation using them. */
export interface AccountLoginConfiguration {
  methodId: string
  credentials?: AccountPasswordCredentials
}
