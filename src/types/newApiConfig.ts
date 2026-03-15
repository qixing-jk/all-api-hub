export interface NewApiConfig {
  baseUrl: string
  adminToken: string
  userId: string
  username?: string
  password?: string
  totpSecret?: string
}

export const DEFAULT_NEW_API_CONFIG = {
  baseUrl: "",
  adminToken: "",
  userId: "",
  username: "",
  password: "",
  totpSecret: "",
}
