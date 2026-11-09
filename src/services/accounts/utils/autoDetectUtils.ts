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
 * - openLoginTab: 在新标签页中打开登录页面
 *
 * 使用场景：
 * - AddAccountDialog 和 EditAccountDialog 中的自动识别错误处理
 * - AutoDetectErrorAlert 组件中的错误展示和操作
 */
import {
  AUTO_DETECT_ERROR_CODES,
  AUTO_DETECT_FAILURE_REASONS,
  AUTO_DETECT_RECOVERY_ACTIONS,
  type AutoDetectAnalyticsContext,
  type AutoDetectErrorCode,
  type AutoDetectFailureReason,
  type AutoDetectRecoveryAction,
} from "~/constants/autoDetect"
import { type AccountSiteType } from "~/constants/siteType"
import { resolveAccountSiteLoginUrl } from "~/services/accounts/utils/siteRouteResolver"
import {
  API_ERROR_CODES,
  ApiError,
  hasUnattributedMessage,
  isAuthenticationRequiredError,
} from "~/services/apiTransport/errors"
import { createTab, queryTabs, reloadTab } from "~/utils/browser/tabs"
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"
import { getDocsAutoDetectUrl } from "~/utils/navigation/docsLinks"

// 自动识别错误类型
export enum AutoDetectErrorType {
  TIMEOUT = "timeout",
  UNAUTHORIZED = "unauthorized",
  ACCESS_TOKEN_VERIFICATION_REQUIRED = "access_token_verification_required",
  COOKIE_SESSION_REJECTED = "cookie_session_rejected",
  CURRENT_TAB_RELOAD_REQUIRED = "current_tab_reload_required",
  INVALID_RESPONSE = "invalid_response",
  NETWORK_ERROR = "network_error",
  UNKNOWN = "unknown",
  FORBIDDEN = "forbidden",
  NOT_FOUND = "notFound",
  SERVER_ERROR = "serverError",
  RATE_LIMITED = "rate_limited",
}

export {
  AUTO_DETECT_FAILURE_REASONS,
  type AutoDetectAnalyticsContext,
  type AutoDetectFailureReason,
}

/**
 * Failure reasons raised only after the account identity (userId) was resolved.
 * These come from the completion/credential stage, so a failure carrying one of
 * them establishes identity discovery independently of credential completion.
 */
const IDENTITY_KNOWN_AUTO_DETECT_FAILURE_REASONS =
  new Set<AutoDetectFailureReason>([
    AUTO_DETECT_FAILURE_REASONS.AccessTokenVerificationRequired,
    AUTO_DETECT_FAILURE_REASONS.CookieSessionRejected,
    AUTO_DETECT_FAILURE_REASONS.CookieSessionUnavailable,
    AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch,
    AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
  ])

/**
 * Whether an auto-detect failure reason implies the account identity was
 * already resolved. Unknown/missing reasons stay false so analysis never
 * over-counts identity detection.
 */
export function isIdentityKnownAutoDetectFailureReason(
  reason: AutoDetectFailureReason | null | undefined,
): boolean {
  return (
    reason != null && IDENTITY_KNOWN_AUTO_DETECT_FAILURE_REASONS.has(reason)
  )
}

// 自动识别错误信息
export interface AutoDetectError {
  type: AutoDetectErrorType
  message: string
  /** A supported next step, independent of what caused detection to fail. */
  recoveryAction?: AutoDetectRecoveryAction
  /** False when a supported account workflow already owns credential recovery. */
  canUseApiCredentialFallback?: boolean
  actionText?: string
  actionUrl?: string
  helpDocUrl?: string
}

/** Recovery capability is independent of a confirmed security-verification failure. */
export function isAccessTokenRecoveryError(
  error: AutoDetectError | null | undefined,
): boolean {
  return (
    error?.recoveryAction === AUTO_DETECT_RECOVERY_ACTIONS.AccessToken ||
    error?.type === AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED
  )
}

const ERROR_KEYWORDS: Partial<Record<AutoDetectErrorType, readonly string[]>> =
  {
    [AutoDetectErrorType.TIMEOUT]: [
      "超时",
      "timeout",
      "请求超时",
      "request timeout",
      "timed out",
    ],
    [AutoDetectErrorType.UNAUTHORIZED]: [
      "401",
      "未授权",
      "Unauthorized",
      "未登录",
      "login required",
    ],
    [AutoDetectErrorType.CURRENT_TAB_RELOAD_REQUIRED]: [
      "receiving end does not exist",
      "could not establish connection",
      "刷新当前页面",
      "refresh the current page",
      "reload the current page",
    ],
    [AutoDetectErrorType.INVALID_RESPONSE]: [
      "格式",
      "解析",
      "JSON",
      "数据不符合",
      "无法获取",
      "invalid response",
      "parse error",
      "malformed",
    ],
    [AutoDetectErrorType.NETWORK_ERROR]: [
      "网络",
      "连接",
      "Network",
      "网络中断",
      "connection lost",
      "offline",
    ],
    [AutoDetectErrorType.FORBIDDEN]: ["403", "禁止访问", "Forbidden"],
    [AutoDetectErrorType.NOT_FOUND]: ["404", "未找到", "Not Found"],
    [AutoDetectErrorType.SERVER_ERROR]: [
      "500",
      "服务器错误",
      "Internal Server Error",
      "server crash",
    ],
  }

/**
 * Builds the structured UI error shown when the active tab likely needs a
 * manual reload so the content script can attach.
 */
function createCurrentTabReloadRequiredError(): AutoDetectError {
  return {
    type: AutoDetectErrorType.CURRENT_TAB_RELOAD_REQUIRED,
    message: t("messages:autodetect.currentTabNeedsReload"),
    actionText: t("accountDialog:actions.reloadCurrentPage"),
    helpDocUrl: getDocsAutoDetectUrl(),
  }
}

/**
 * Maps a machine-readable auto-detect error code to a structured UI error when
 * the caller already knows the exact failure category.
 * @param errorCode Optional service-layer auto-detect error code.
 * @returns Structured UI error when the code is recognized; otherwise null.
 */
export function getAutoDetectErrorByCode(
  errorCode?: AutoDetectErrorCode,
): AutoDetectError | null {
  switch (errorCode) {
    case AUTO_DETECT_ERROR_CODES.CURRENT_TAB_CONTENT_SCRIPT_UNAVAILABLE:
      return createCurrentTabReloadRequiredError()
    case AUTO_DETECT_ERROR_CODES.SITE_TYPE_DETECTION_FAILED:
      return {
        type: AutoDetectErrorType.NOT_FOUND,
        message: t("messages:autodetect.notFound"),
        helpDocUrl: getDocsAutoDetectUrl(),
      }
    default:
      return null
  }
}

/** Interpret transport facts before considering any message text. */
function classifyApiAutoDetectError(error: ApiError): AutoDetectErrorType {
  switch (error.code) {
    case API_ERROR_CODES.NETWORK_ERROR:
      return AutoDetectErrorType.NETWORK_ERROR
    case API_ERROR_CODES.CONTENT_TYPE_MISMATCH:
    case API_ERROR_CODES.JSON_PARSE_ERROR:
      return AutoDetectErrorType.INVALID_RESPONSE
    case API_ERROR_CODES.ROBOT_CHALLENGE:
      return AutoDetectErrorType.UNKNOWN
  }
  // A proxy's message cannot establish site permissions or a missing site.
  // Timeout, throttling and server failure remain observable HTTP facts.
  if (
    error.unattributedMessage &&
    (error.statusCode === 403 || error.statusCode === 404)
  )
    return AutoDetectErrorType.UNKNOWN
  if (isAuthenticationRequiredError(error))
    return AutoDetectErrorType.UNAUTHORIZED
  switch (error.statusCode) {
    case 403:
      return AutoDetectErrorType.FORBIDDEN
    case 404:
      return AutoDetectErrorType.NOT_FOUND
    case 429:
      return AutoDetectErrorType.RATE_LIMITED
    case 408:
    case 504:
      return AutoDetectErrorType.TIMEOUT
  }
  if (error.statusCode && error.statusCode >= 500 && error.statusCode < 600)
    return AutoDetectErrorType.SERVER_ERROR
  return AutoDetectErrorType.UNKNOWN
}

/** Own the local copy and available action for each generic detection failure. */
function createAutoDetectError(
  type: AutoDetectErrorType,
  errorMessage: string,
): AutoDetectError {
  const helpDocUrl = getDocsAutoDetectUrl()
  switch (type) {
    case AutoDetectErrorType.TIMEOUT:
      return { type, message: t("messages:autodetect.timeout"), helpDocUrl }
    case AutoDetectErrorType.UNAUTHORIZED:
      return {
        type,
        message: t("messages:autodetect.notLoggedIn"),
        actionText: t("messages:autodetect.loginThisSite"),
        helpDocUrl,
      }
    case AutoDetectErrorType.CURRENT_TAB_RELOAD_REQUIRED:
      return createCurrentTabReloadRequiredError()
    case AutoDetectErrorType.INVALID_RESPONSE:
      return {
        type,
        message: t("messages:autodetect.unexpectedData"),
        helpDocUrl,
      }
    case AutoDetectErrorType.NETWORK_ERROR:
      return {
        type,
        message: t("messages:autodetect.networkError"),
        helpDocUrl,
      }
    case AutoDetectErrorType.FORBIDDEN:
      return { type, message: t("messages:autodetect.forbidden"), helpDocUrl }
    case AutoDetectErrorType.NOT_FOUND:
      return { type, message: t("messages:autodetect.notFound"), helpDocUrl }
    case AutoDetectErrorType.SERVER_ERROR:
      return { type, message: t("messages:autodetect.serverError"), helpDocUrl }
    case AutoDetectErrorType.RATE_LIMITED:
      return { type, message: t("messages:autodetect.rateLimited"), helpDocUrl }
    default:
      return {
        type: AutoDetectErrorType.UNKNOWN,
        message: t("messages:autodetect.failed", { error: errorMessage }),
        helpDocUrl,
      }
  }
}

/**
 * Interpret structured transport failures, falling back to legacy message patterns
 * only when no API error facts are available.
 */
export function analyzeAutoDetectError(error: unknown): AutoDetectError {
  const errorMessage = getErrorMessage(error)
  if (error instanceof ApiError && (error.code || error.statusCode != null)) {
    return createAutoDetectError(
      classifyApiAutoDetectError(error),
      errorMessage,
    )
  }
  if (hasUnattributedMessage(error)) {
    return createAutoDetectError(AutoDetectErrorType.UNKNOWN, errorMessage)
  }

  if (errorMessage === t("messages:autodetect.currentTabNeedsReload")) {
    return createCurrentTabReloadRequiredError()
  }
  // Local identity guidance may mention login or connectivity without proving either.
  if (
    errorMessage === t("messages:operations.detection.getUserIdFailed") ||
    errorMessage === t("messages:operations.detection.getUserIdFailedDetailed")
  ) {
    return {
      type: AutoDetectErrorType.INVALID_RESPONSE,
      message: t("messages:operations.detection.getUserIdFailedDetailed"),
      helpDocUrl: getDocsAutoDetectUrl(),
    }
  }

  const message = errorMessage.toLowerCase()
  const type = (Object.keys(ERROR_KEYWORDS) as AutoDetectErrorType[]).find(
    (type) =>
      ERROR_KEYWORDS[type]?.some((keyword) =>
        message.includes(keyword.toLowerCase()),
      ),
  )
  return createAutoDetectError(
    type ?? AutoDetectErrorType.UNKNOWN,
    errorMessage,
  )
}

// 创建错误消息组件的props
export interface AutoDetectErrorProps {
  error: AutoDetectError
  siteUrl?: string
  siteType?: AccountSiteType
  onHelpClick?: () => void
  onActionClick?: () => void
  onApiCredentialProfilesClick?: () => void
}

/**
 * Open a new browser tab pointing to the site's login page.
 * @param siteUrl Base site URL used to derive the login page.
 * @param siteTypeHint Optional already-known site type from the caller.
 */
export async function openLoginTab(
  siteUrl: string,
  siteTypeHint?: AccountSiteType,
): Promise<void> {
  const loginUrl = await resolveAccountSiteLoginUrl(siteUrl, siteTypeHint)
  await createTab(loginUrl, true)
}

/**
 * Reload the currently active page so a freshly installed or updated content
 * script can attach before the next auto-detect attempt.
 */
export async function reloadCurrentTab(): Promise<void> {
  const tabs = await queryTabs({
    active: true,
    currentWindow: true,
  })

  const activeTab = tabs[0]
  if (typeof activeTab?.id === "number") {
    await reloadTab(activeTab.id)
  }
}
