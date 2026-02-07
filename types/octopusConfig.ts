/**
 * Octopus 站点配置
 * 用于存储 Octopus 自建站点的连接信息
 */
export interface OctopusConfig {
  /** Octopus 站点基础 URL */
  baseUrl: string
  /** 用户名，用于自动登录 */
  username: string
  /** 密码，用于自动登录 */
  password: string
  /** 缓存的 JWT Token (系统自动管理) */
  cachedToken?: string
  /** Token 过期时间戳 (系统自动管理) */
  tokenExpireAt?: number
}

export const DEFAULT_OCTOPUS_CONFIG: OctopusConfig = {
  baseUrl: "",
  username: "",
  password: "",
}
