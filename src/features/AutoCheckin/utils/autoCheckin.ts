import type { TFunction } from "i18next"

/**
 * Translate a known auto-checkin i18n key while preserving non-i18n backend
 * messages as-is.
 */
export function translateAutoCheckinMessageKey(
  t: TFunction,
  messageKey: string,
  messageParams?: Record<string, unknown>,
): string {
  switch (messageKey) {
    case "autoCheckin:providerFallback.alreadyCheckedToday":
      return t(
        "autoCheckin:providerFallback.alreadyCheckedToday",
        messageParams,
      )
    case "autoCheckin:providerFallback.checkinSuccessful":
      return t("autoCheckin:providerFallback.checkinSuccessful", messageParams)
    case "autoCheckin:providerFallback.checkinFailed":
      return t("autoCheckin:providerFallback.checkinFailed", messageParams)
    case "autoCheckin:providerFallback.endpointNotSupported":
      return t(
        "autoCheckin:providerFallback.endpointNotSupported",
        messageParams,
      )
    case "autoCheckin:providerFallback.unknownError":
      return t("autoCheckin:providerFallback.unknownError", messageParams)
    case "autoCheckin:providerFallback.turnstileManualRequired":
      return t(
        "autoCheckin:providerFallback.turnstileManualRequired",
        messageParams,
      )
    case "autoCheckin:providerFallback.turnstileIncognitoAccessRequired":
      return t(
        "autoCheckin:providerFallback.turnstileIncognitoAccessRequired",
        messageParams,
      )
    case "autoCheckin:providerWong.checkinDisabled":
      return t("autoCheckin:providerWong.checkinDisabled", messageParams)
    case "autoCheckin:skipReasons.account_disabled":
      return t("autoCheckin:skipReasons.account_disabled", messageParams)
    case "autoCheckin:skipReasons.detection_disabled":
      return t("autoCheckin:skipReasons.detection_disabled", messageParams)
    case "autoCheckin:skipReasons.auto_checkin_disabled":
      return t("autoCheckin:skipReasons.auto_checkin_disabled", messageParams)
    case "autoCheckin:skipReasons.already_checked_today":
      return t("autoCheckin:skipReasons.already_checked_today", messageParams)
    case "autoCheckin:skipReasons.no_provider":
      return t("autoCheckin:skipReasons.no_provider", messageParams)
    case "autoCheckin:skipReasons.provider_not_ready":
      return t("autoCheckin:skipReasons.provider_not_ready", messageParams)
    default:
      return messageKey
  }
}

const INVALID_ACCESS_TOKEN_STRICT_SNIPPET = "access token 无效"
const INVALID_ACCESS_TOKEN_KEYWORD = "access token"
const INVALID_ACCESS_TOKEN_HINT_KEYWORDS = [
  "无效",
  "失效",
  "过期",
  "invalid",
  "expired",
] as const

/**
 * Heuristic: detect messages that indicate an invalid/expired access token.
 *
 * Used by the Auto Check-in UI to show an actionable troubleshooting hint
 * under raw backend failure messages.
 */
export function isInvalidAccessTokenMessage(message: string): boolean {
  if (!message) return false

  const normalized = message.toLowerCase()

  if (normalized.includes(INVALID_ACCESS_TOKEN_STRICT_SNIPPET)) {
    return true
  }

  return (
    normalized.includes(INVALID_ACCESS_TOKEN_KEYWORD) &&
    INVALID_ACCESS_TOKEN_HINT_KEYWORDS.some((keyword) =>
      normalized.includes(keyword),
    )
  )
}

const NO_TAB_WITH_ID_REGEX = /no tab with id[: ]\s*\d+/i

/**
 * Detect a "No tab with id: N" error, usually emitted when a temporary
 * background-created tab/window is closed before an async flow completes.
 */
export function isNoTabWithIdMessage(message: string): boolean {
  if (!message) return false
  return NO_TAB_WITH_ID_REGEX.test(message)
}
