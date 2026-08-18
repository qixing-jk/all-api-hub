/**
 * Octopus 认证服务
 * 处理旧版 JWT 与新版 Cookie 会话的获取、缓存和刷新
 */
import type { OctopusConfig } from "~/types/octopusConfig"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("OctopusAuth")

/**
 * Octopus 登录请求
 */
interface OctopusLoginRequest {
  username: string
  password: string
  expire?: number
}

/**
 * 认证会话类型
 */
export const OCTOPUS_AUTH_MODES = {
  Bearer: "bearer",
  Cookie: "cookie",
} as const

export type OctopusAuthSession =
  | {
      mode: typeof OCTOPUS_AUTH_MODES.Bearer
      token: string
      expireAt: number
    }
  | {
      mode: typeof OCTOPUS_AUTH_MODES.Cookie
      expireAt: number
    }

interface LegacyOctopusLoginResponse {
  token: string
  expire_at: string
}

interface OctopusLoginEnvelope {
  code?: number
  message?: string
  data?: unknown
}

const DEFAULT_SESSION_TTL_MS = 15 * 60 * 1000

const isLegacyLoginResponse = (
  value: unknown,
): value is LegacyOctopusLoginResponse =>
  typeof value === "object" &&
  value !== null &&
  "token" in value &&
  typeof value.token === "string" &&
  value.token.length > 0 &&
  "expire_at" in value &&
  typeof value.expire_at === "string"

const hasLegacyTokenField = (value: unknown): boolean =>
  typeof value === "object" && value !== null && "token" in value

const resolveExpireAt = (expireAt: string | undefined): number => {
  const parsedExpireAt = expireAt ? new Date(expireAt).getTime() : Number.NaN
  return Number.isFinite(parsedExpireAt)
    ? parsedExpireAt
    : Date.now() + DEFAULT_SESSION_TTL_MS
}

/**
 * Octopus 认证管理器
 * 负责自动登录和 Token 生命周期管理
 */
class OctopusAuthManager {
  private authCache: Map<string, OctopusAuthSession> = new Map()

  /**
   * 生成缓存键
   */
  private getCacheKey(baseUrl: string, username: string): string {
    return `${baseUrl}:${username}`
  }

  /**
   * 登录到 Octopus 并识别当前服务端认证契约
   */
  async login(
    baseUrl: string,
    credentials: OctopusLoginRequest,
    options?: Pick<RequestInit, "signal">,
  ): Promise<OctopusAuthSession> {
    const url = `${baseUrl.replace(/\/$/, "")}/api/v1/user/login`

    const response = await fetch(url, {
      method: "POST",
      signal: options?.signal,
      credentials: "include",
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
        const corsHint = t("messages:octopus.corsError")
        const detail = serverMessage || "Forbidden"
        throw new Error(`${detail}\n${corsHint}`)
      }

      throw new Error(
        serverMessage ||
          `HTTP ${response.status} - ${bodyText || "Unknown error"}`,
      )
    }

    const data = (await response.json()) as OctopusLoginEnvelope

    if (data.code !== 200) {
      throw new Error(data.message || "Login failed")
    }

    if (isLegacyLoginResponse(data.data)) {
      return {
        mode: OCTOPUS_AUTH_MODES.Bearer,
        token: data.data.token,
        expireAt: resolveExpireAt(data.data.expire_at),
      }
    }

    if (hasLegacyTokenField(data.data)) {
      throw new Error("Invalid legacy token response")
    }

    // Octopus switched administrator login from a returned JWT to an `auth`
    // cookie in https://github.com/bestruirui/octopus/commit/7b1de824cd272d87dce6f3659634048e6a1e3441.
    // The protocol discriminator is the absence of the legacy token, not the
    // human-readable success payload, which may change between releases.
    return {
      mode: OCTOPUS_AUTH_MODES.Cookie,
      expireAt: resolveExpireAt(undefined),
    }
  }

  /**
   * 获取有效的认证会话
   * - 如果内存缓存中有有效会话，直接返回
   * - 如果会话过期或不存在，自动重新登录获取
   *
   * 注意：认证元数据仅缓存在内存中，不持久化到存储。
   * Octopus 默认会话有效期为 15 分钟，可通过登录时的 expire 参数自定义。
   */
  async getValidSession(
    config: OctopusConfig,
    options?: Pick<RequestInit, "signal">,
  ): Promise<OctopusAuthSession> {
    if (!config.baseUrl || !config.username || !config.password) {
      throw new Error("Octopus config is incomplete")
    }

    const cacheKey = this.getCacheKey(config.baseUrl, config.username)
    const cached = this.authCache.get(cacheKey)

    // 检查内存缓存是否有效（提前 1 分钟刷新，因为默认有效期较短）
    const bufferTime = 1 * 60 * 1000
    if (cached && cached.expireAt > Date.now() + bufferTime) {
      return cached
    }

    // 自动登录获取新 Token
    logger.info("Auto-login to Octopus", { baseUrl: config.baseUrl })
    const session = await this.login(
      config.baseUrl,
      {
        username: config.username,
        password: config.password,
      },
      options,
    )

    // 更新内存缓存
    this.authCache.set(cacheKey, session)

    return session
  }

  /**
   * 验证配置是否有效（尝试登录）
   * 返回包含错误信息的结果，便于 UI 展示具体错误原因
   */
  async validateConfig(
    config: OctopusConfig,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Validation must exercise the submitted password, not a session cached
      // for the same origin and username under older credentials.
      this.clearCache(config.baseUrl, config.username)
      await this.getValidSession(config)
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
    this.authCache.delete(cacheKey)
  }

  /**
   * 清除所有缓存
   */
  clearAllCache(): void {
    this.authCache.clear()
  }
}

export const octopusAuthManager = new OctopusAuthManager()
