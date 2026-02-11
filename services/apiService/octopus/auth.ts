/**
 * Octopus 认证服务
 * 处理 JWT Token 的获取、缓存和刷新
 */
import i18next from "i18next"

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
      // Read body once as text, then try to parse as JSON
      const bodyText = await response.text()
      let serverMessage: string | undefined
      try {
        const errorJson = JSON.parse(bodyText)
        serverMessage = errorJson.message || undefined
      } catch {
        // not JSON, ignore
      }

      // 针对 403 错误添加 CORS 配置提示
      if (response.status === 403) {
        const corsHint = i18next.t("messages:octopus.corsError")
        const detail = serverMessage || "Forbidden"
        throw new Error(`${detail}\n${corsHint}`)
      }

      throw new Error(
        serverMessage ||
          `HTTP ${response.status} - ${bodyText || "Unknown error"}`,
      )
    }

    const data = await response.json()

    if (data.code !== 200 || !data.data?.token) {
      throw new Error(data.message || "Login failed")
    }

    return data.data as OctopusLoginResponse
  }

  /**
   * 获取有效的 JWT Token
   * - 如果内存缓存中有有效 Token，直接返回
   * - 如果 Token 过期或不存在，自动重新登录获取
   *
   * 注意：Token 仅缓存在内存中，不持久化到存储。
   * Octopus 默认 token 有效期为 15 分钟，可通过登录时的 expire 参数自定义。
   */
  async getValidToken(config: OctopusConfig): Promise<string> {
    if (!config.baseUrl || !config.username || !config.password) {
      throw new Error("Octopus config is incomplete")
    }

    const cacheKey = this.getCacheKey(config.baseUrl, config.username)
    const cached = this.tokenCache.get(cacheKey)

    // 检查内存缓存是否有效（提前 1 分钟刷新，因为默认有效期较短）
    const bufferTime = 1 * 60 * 1000
    if (cached && cached.expireAt > Date.now() + bufferTime) {
      return cached.token
    }

    // 自动登录获取新 Token
    logger.info("Auto-login to Octopus", { baseUrl: config.baseUrl })
    const response = await this.login(config.baseUrl, {
      username: config.username,
      password: config.password,
    })

    // 解析过期时间，验证有效性
    const parsedExpireAt = new Date(response.expire_at).getTime()
    const defaultTTL = 15 * 60 * 1000 // 15 minutes fallback (Octopus default)
    let expireAt: number
    if (Number.isFinite(parsedExpireAt)) {
      expireAt = parsedExpireAt
    } else {
      logger.warn("Invalid expire_at from server, using default TTL", {
        expire_at: response.expire_at,
      })
      expireAt = Date.now() + defaultTTL
    }

    // 更新内存缓存
    this.tokenCache.set(cacheKey, {
      token: response.token,
      expireAt,
    })

    return response.token
  }

  /**
   * 验证配置是否有效（尝试登录）
   * 返回包含错误信息的结果，便于 UI 展示具体错误原因
   */
  async validateConfig(
    config: OctopusConfig,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.getValidToken(config)
      return { success: true }
    } catch (error) {
      logger.error("Config validation failed", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : undefined,
      }
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
