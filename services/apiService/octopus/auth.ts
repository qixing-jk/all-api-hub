/**
 * Octopus 认证服务
 * 处理 JWT Token 的获取、缓存和刷新
 */
import type { OctopusLoginResponse } from "~/types/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"
import { createLogger } from "~/utils/logger"

const logger = createLogger("OctopusAuth")

/**
 * Octopus 登录请求
 */
export interface OctopusLoginRequest {
  username: string
  password: string
  expire?: number
}

/**
 * Token 缓存条目
 */
interface TokenCacheEntry {
  token: string
  expireAt: number
}

/**
 * Octopus 认证管理器
 * 负责自动登录和 Token 生命周期管理
 */
class OctopusAuthManager {
  private tokenCache: Map<string, TokenCacheEntry> = new Map()

  /**
   * 生成缓存键
   */
  private getCacheKey(baseUrl: string, username: string): string {
    return `${baseUrl}:${username}`
  }

  /**
   * 登录到 Octopus 获取 JWT Token
   */
  async login(
    baseUrl: string,
    credentials: OctopusLoginRequest,
  ): Promise<OctopusLoginResponse> {
    const url = `${baseUrl.replace(/\/$/, "")}/api/v1/user/login`

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    })

    if (!response.ok) {
      let errorBody: string
      try {
        const errorJson = await response.json()
        errorBody = errorJson.message || JSON.stringify(errorJson)
      } catch {
        errorBody = await response.text()
      }
      throw new Error(
        `Login failed: HTTP ${response.status} - ${errorBody || "Unknown error"}`,
      )
    }

    const data = await response.json()

    if (data.code !== 200 || !data.data?.token) {
      throw new Error(data.message || "Login failed")
    }

    return data.data as OctopusLoginResponse
  }

  /**
   * 检查 Octopus 认证状态
   */
  async checkStatus(baseUrl: string, jwtToken: string): Promise<boolean> {
    try {
      const url = `${baseUrl.replace(/\/$/, "")}/api/v1/user/status`
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * 获取有效的 JWT Token
   * - 如果缓存中有有效 Token，直接返回
   * - 如果 Token 过期或不存在，自动重新登录获取
   */
  async getValidToken(config: OctopusConfig): Promise<string> {
    if (!config.baseUrl || !config.username || !config.password) {
      throw new Error("Octopus config is incomplete")
    }

    const cacheKey = this.getCacheKey(config.baseUrl, config.username)
    const cached = this.tokenCache.get(cacheKey)

    // 检查缓存是否有效（提前 5 分钟刷新）
    const bufferTime = 5 * 60 * 1000
    if (cached && cached.expireAt > Date.now() + bufferTime) {
      return cached.token
    }

    // 检查存储中的缓存 Token
    if (
      config.cachedToken &&
      config.tokenExpireAt &&
      config.tokenExpireAt > Date.now() + bufferTime
    ) {
      // 验证 Token 是否仍然有效
      const isValid = await this.checkStatus(config.baseUrl, config.cachedToken)
      if (isValid) {
        // 更新内存缓存
        this.tokenCache.set(cacheKey, {
          token: config.cachedToken,
          expireAt: config.tokenExpireAt,
        })
        return config.cachedToken
      }
    }

    // 自动重新登录
    logger.info("Auto-login to Octopus", { baseUrl: config.baseUrl })
    const response = await this.login(config.baseUrl, {
      username: config.username,
      password: config.password,
    })

    // 解析过期时间
    const expireAt = new Date(response.expire_at).getTime()

    // 更新内存缓存
    this.tokenCache.set(cacheKey, {
      token: response.token,
      expireAt,
    })

    // 返回新 Token（调用方需要更新存储中的缓存）
    return response.token
  }

  /**
   * 验证配置是否有效（尝试登录）
   */
  async validateConfig(config: OctopusConfig): Promise<boolean> {
    try {
      await this.getValidToken(config)
      return true
    } catch (error) {
      logger.error("Config validation failed", error)
      return false
    }
  }

  /**
   * 清除指定配置的缓存
   */
  clearCache(baseUrl: string, username: string): void {
    const cacheKey = this.getCacheKey(baseUrl, username)
    this.tokenCache.delete(cacheKey)
  }

  /**
   * 清除所有缓存
   */
  clearAllCache(): void {
    this.tokenCache.clear()
  }
}

export const octopusAuthManager = new OctopusAuthManager()
