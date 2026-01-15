/**
 * 自动识别错误处理工具模块
 *
 * 作用：
 * 1. 定义自动识别过程中可能出现的错误类型枚举
 * 2. 提供智能错误分析功能，将通用错误信息转换为结构化的错误对象
 * 3. 包含错误处理的辅助函数，如打开登录页面等
 *
 * 主要功能：
 * - analyzeAutoDetectError: 分析错误消息并返回结构化错误信息
 * - getLoginUrl: 生成站点登录页面URL
 * - openLoginTab: 在新标签页中打开登录页面
 *
 * 使用场景：
 * - AddAccountDialog 和 EditAccountDialog 中的自动识别错误处理
 * - AutoDetectErrorAlert 组件中的错误展示和操作
 */
import { t } from "i18next"

import { AUTO_DETECT_DOC_URL } from "~/constants/about"

import { getErrorMessage } from "./error"

// 自动识别错误类型
export enum AutoDetectErrorType {
  TIMEOUT = "timeout",
  UNAUTHORIZED = "unauthorized",
  INVALID_RESPONSE = "invalid_response",
  NETWORK_ERROR = "network_error",
  UNKNOWN = "unknown",
  FORBIDDEN = "forbidden",
  NOT_FOUND = "notFound",
  SERVER_ERROR = "serverError",
}

// 自动识别错误信息
export interface AutoDetectError {
  type: AutoDetectErrorType
  message: string
  actionText?: string
  actionUrl?: string
  helpDocUrl?: string
}

const ERROR_KEYWORDS: Record<string, string[]> = {
  TIMEOUT: ["超时", "timeout", "请求超时", "request timeout", "timed out"],
  UNAUTHORIZED: ["401", "未授权", "Unauthorized", "未登录", "login required"],
  INVALID_RESPONSE: [
    "格式",
    "解析",
    "JSON",
    "数据不符合",
    "无法获取",
    "invalid response",
    "parse error",
    "malformed",
  ],
  NETWORK_ERROR: [
    "网络",
    "连接",
    "Network",
    "网络中断",
    "connection lost",
    "offline",
  ],
  FORBIDDEN: ["403", "禁止访问", "Forbidden"],
  NOT_FOUND: ["404", "未找到", "Not Found"],
  SERVER_ERROR: ["500", "服务器错误", "Internal Server Error", "server crash"],
}

/**
 * Convert a raw error into a structured {@link AutoDetectError}.
 *
 * Scans known keyword buckets to infer the most likely failure type and
 * returns localized UI copy plus optional next-action metadata.
 * @param error Unknown error object thrown during auto-detection.
 * @returns Structured error info for UI display and guidance.
 */
export function analyzeAutoDetectError(error: any): AutoDetectError {
  const errorMessage = getErrorMessage(error) || ""

  const msg = errorMessage.toLowerCase()

  // Iterate known keyword buckets and return the first matching structured error
  for (const [type, keywords] of Object.entries(ERROR_KEYWORDS)) {
    if (keywords.some((k) => msg.includes(k.toLowerCase()))) {
      switch (type) {
        case "TIMEOUT":
          return {
            type: AutoDetectErrorType.TIMEOUT,
            message: t("messages:autodetect.timeout"),
            helpDocUrl: AUTO_DETECT_DOC_URL,
          }
        case "UNAUTHORIZED":
          return {
            type: AutoDetectErrorType.UNAUTHORIZED,
            message: t("messages:autodetect.notLoggedIn"),
            actionText: t("messages:autodetect.loginThisSite"),
            helpDocUrl: AUTO_DETECT_DOC_URL,
          }
        case "INVALID_RESPONSE":
          return {
            type: AutoDetectErrorType.INVALID_RESPONSE,
            message: t("messages:autodetect.unexpectedData"),
            helpDocUrl: AUTO_DETECT_DOC_URL,
          }
        case "NETWORK_ERROR":
          return {
            type: AutoDetectErrorType.NETWORK_ERROR,
            message: t("messages:autodetect.networkError"),
            helpDocUrl: AUTO_DETECT_DOC_URL,
          }
        case "FORBIDDEN":
          return {
            type: AutoDetectErrorType.FORBIDDEN,
            message: t("messages:autodetect.forbidden"),
            helpDocUrl: AUTO_DETECT_DOC_URL,
          }
        case "NOT_FOUND":
          return {
            type: AutoDetectErrorType.NOT_FOUND,
            message: t("messages:autodetect.notFound"),
            helpDocUrl: AUTO_DETECT_DOC_URL,
          }
        case "SERVER_ERROR":
          return {
            type: AutoDetectErrorType.SERVER_ERROR,
            message: t("messages:autodetect.serverError"),
            helpDocUrl: AUTO_DETECT_DOC_URL,
          }
      }
    }
  }

  // 默认未知错误
  return {
    type: AutoDetectErrorType.UNKNOWN,
    message: t("messages:autodetect.failed") + errorMessage,
    helpDocUrl: AUTO_DETECT_DOC_URL,
  }
}

// 创建错误消息组件的props
export interface AutoDetectErrorProps {
  error: AutoDetectError
  siteUrl?: string
  onHelpClick?: () => void
  onActionClick?: () => void
}

/**
 * Build a best-effort login URL for a given site.
 *
 * Tries to normalize to `{protocol}//{host}/login`; falls back to the
 * original URL if parsing fails.
 * @param siteUrl Base site URL provided by the caller.
 * @returns Login page URL to open in a new tab.
 */
export function getLoginUrl(siteUrl: string): string {
  try {
    const url = new URL(siteUrl)
    // 对于 One API 和 New API，通常登录页面在 /login
    return `${url.protocol}//${url.host}/login`
  } catch {
    // If parsing fails, fall back to the original URL (best-effort)
    return siteUrl
  }
}

/**
 * Open a new browser tab pointing to the site's login page.
 * @param siteUrl Base site URL used to derive the login page.
 */
export async function openLoginTab(siteUrl: string): Promise<void> {
  const loginUrl = getLoginUrl(siteUrl)
  await browser.tabs.create({ url: loginUrl, active: true })
}
