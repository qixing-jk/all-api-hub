import type { TFunction } from "i18next"

import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"

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
    case "autoCheckin:providerFallback.nativePageIdentityMismatch":
      return t(
        "autoCheckin:providerFallback.nativePageIdentityMismatch",
        messageParams,
      )
    case "autoCheckin:providerFallback.nativePageIdentityMissing":
      return t(
        "autoCheckin:providerFallback.nativePageIdentityMissing",
        messageParams,
      )
    case "autoCheckin:providerFallback.nativePageStatusUnconfirmed":
      return t(
        "autoCheckin:providerFallback.nativePageStatusUnconfirmed",
        messageParams,
      )
    case "autoCheckin:providerFallback.nativePageTargetNotFound":
      return t(
        "autoCheckin:providerFallback.nativePageTargetNotFound",
        messageParams,
      )
    case "autoCheckin:providerFallback.nativePageTriggerFailed":
      return t(
        "autoCheckin:providerFallback.nativePageTriggerFailed",
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
const TURNSTILE_TOKEN_UNAVAILABLE_REGEX =
  /turnstile[\s\S]*token[\s\S]*(?:not\s+available|unavailable)/i
const POW_CHALLENGE_NONCE_REGEX = /pow(?=.*challenge)(?=.*nonce)/i
const TURNSTILE_VERIFICATION_FAILED_REGEX =
  /turnstile[\s\S]*(?:校验|验证)[\s\S]*失败/i
const OPEN_SITE_THEN_CHECKIN_REGEX = /打开(?:网站|站点)[\s\S]*签到/

/**
 * Detect a "No tab with id: N" error, usually emitted when a temporary
 * background-created tab/window is closed before an async flow completes.
 */
export function isNoTabWithIdMessage(message: string): boolean {
  if (!message) return false
  return NO_TAB_WITH_ID_REGEX.test(message)
}

/**
 * Detect protected check-in failures that usually require opening the site
 * page first so the browser can complete verification and establish a session.
 */
function isManualVerificationRequiredMessage(message: string): boolean {
  if (!message) return false

  return (
    TURNSTILE_TOKEN_UNAVAILABLE_REGEX.test(message) ||
    POW_CHALLENGE_NONCE_REGEX.test(message) ||
    TURNSTILE_VERIFICATION_FAILED_REGEX.test(message) ||
    OPEN_SITE_THEN_CHECKIN_REGEX.test(message)
  )
}

type AutoCheckinTroubleshootingHintKey =
  | "execution.hints.invalidAccessToken"
  | "execution.hints.manualVerificationRequired"
  | "execution.hints.noTabWithId"
  | "execution.hints.siteTypeCheckinUnsupported"

/**
 * Resolve an optional troubleshooting hint for a result row based on its
 * structured message key first, then on known raw/backend message patterns.
 */
export function resolveAutoCheckinTroubleshootingHintKey(params: {
  status?: string
  messageKey?: string
  message: string
}): AutoCheckinTroubleshootingHintKey | null {
  if (
    params.messageKey === "autoCheckin:skipReasons.no_provider" ||
    params.messageKey === "autoCheckin:providerFallback.endpointNotSupported"
  ) {
    return "execution.hints.siteTypeCheckinUnsupported"
  }

  if (params.status !== CHECKIN_RESULT_STATUS.FAILED) {
    return null
  }

  if (isInvalidAccessTokenMessage(params.message)) {
    return "execution.hints.invalidAccessToken"
  }

  if (isNoTabWithIdMessage(params.message)) {
    return "execution.hints.noTabWithId"
  }

  if (isManualVerificationRequiredMessage(params.message)) {
    return "execution.hints.manualVerificationRequired"
  }

  return null
}
