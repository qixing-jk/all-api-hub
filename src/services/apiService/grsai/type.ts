/** Wire shapes of the Grsai console API, verified against the deployment. */

export type GrsaiConfig = {
  token: string
  kis: string
  ra1: string
  ra2: string
  random: string | number
  timestamp?: number
  isAuth?: boolean
  email?: string
  nickName?: string
  avatar?: string
  manager?: boolean
}

export type GrsaiUserInfo = {
  /** Mongo object id of the account, as the console reports it. */
  id: string
  /** Sign-in email; the console shows no separate display name. */
  mail?: string
  credits?: number
  loginType?: string
  /**
   * Opaque 32-character account token. Unrelated to console authentication,
   * which uses the session token from `getConfig`.
   */
  token?: string
}

export type GrsaiDashboardData = {
  credits: number
  todayConsumed: number
  totalConsumed: number
}

export type GrsaiApiKey = {
  id: string
  /** Plaintext `sk-` secret, returned by both `list` and `create`. */
  key: string
  name: string
  /** Remaining budget for a limited key; carried unchanged for unlimited ones. */
  credits?: number
  /** Credits this key has consumed. */
  totalCost?: number
  type?: number
  /** Unix seconds; `0` means the key never expires. */
  expireTime?: number
  createTime?: string
}

export type GrsaiApiKeyList = {
  list: GrsaiApiKey[]
  total: number
}

export type GrsaiApiKeyCreateRequest = {
  name: string
  type: number
  credits?: number
  expireTime?: number
}

/**
 * Update payload. The deployment addresses the key by its plaintext secret
 * rather than by id, and always expects the full `type`/`expireTime` pair.
 */
export type GrsaiApiKeyUpdateRequest = {
  apiKey: string
  name: string
  type: number
  credits?: number
  expireTime: number
}

export type GrsaiModel = {
  id: string
  /** Upstream model id; empty for models the console only sells by alias. */
  model: string
  /** Alias the console sells the model under. */
  name: string
  /** Credits one call costs. */
  credits?: number
  cost_type?: number
  desc?: string
  document?: string
  feature?: string
  max_token?: number
  maintenance?: string
  errorReturn?: boolean
  violationReturn?: boolean
  priceExample?: string
}

export type GrsaiModelList = {
  list: GrsaiModel[]
}
