import type { TFunction } from "i18next"

import {
  CHECKIN_RESULT_STATUS,
  translateAutoCheckinSkipReason,
  type CheckinAccountResult,
} from "~/types/autoCheckin"

export const FILTER_STATUS = {
  ALL: "all",
  FAILED_OR_SKIPPED: "failed_or_skipped",
  SUCCESS: "success",
  FAILED: "failed",
  SKIPPED: "skipped",
} as const

export type FilterStatus = (typeof FILTER_STATUS)[keyof typeof FILTER_STATUS]

interface AutoCheckinResultCounts {
  total: number
  success: number
  failed: number
  skipped: number
}

/** Counts execution outcomes while treating already-checked as successful. */
export function countAutoCheckinResults(
  results: readonly CheckinAccountResult[],
): AutoCheckinResultCounts {
  return results.reduce<AutoCheckinResultCounts>(
    (counts, result) => {
      counts.total += 1
      switch (result.status) {
        case CHECKIN_RESULT_STATUS.SUCCESS:
        case CHECKIN_RESULT_STATUS.ALREADY_CHECKED:
          counts.success += 1
          break
        case CHECKIN_RESULT_STATUS.FAILED:
          counts.failed += 1
          break
        case CHECKIN_RESULT_STATUS.SKIPPED:
          counts.skipped += 1
          break
      }
      return counts
    },
    { total: 0, success: 0, failed: 0, skipped: 0 },
  )
}

/**
 * Checks whether a result belongs to the selected status filter.
 */
function matchesAutoCheckinResultStatus(
  result: CheckinAccountResult,
  status: FilterStatus,
): boolean {
  switch (status) {
    case FILTER_STATUS.FAILED_OR_SKIPPED:
      return (
        result.status === CHECKIN_RESULT_STATUS.FAILED ||
        result.status === CHECKIN_RESULT_STATUS.SKIPPED
      )
    case FILTER_STATUS.SUCCESS:
      return (
        result.status === CHECKIN_RESULT_STATUS.SUCCESS ||
        result.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED
      )
    case FILTER_STATUS.FAILED:
      return result.status === CHECKIN_RESULT_STATUS.FAILED
    case FILTER_STATUS.SKIPPED:
      return result.status === CHECKIN_RESULT_STATUS.SKIPPED
    case FILTER_STATUS.ALL:
      return true
  }
}

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
    case "autoCheckin:skipReasons.account_data_missing":
      return t("autoCheckin:skipReasons.account_data_missing", messageParams)
    case "autoCheckin:skipReasons.authentication_required":
      return t("autoCheckin:skipReasons.authentication_required", messageParams)
    case "autoCheckin:skipReasons.credentials_missing":
      return t("autoCheckin:skipReasons.credentials_missing", messageParams)
    case "autoCheckin:skipReasons.detection_disabled":
      return t("autoCheckin:skipReasons.detection_disabled", messageParams)
    case "autoCheckin:skipReasons.method_disabled":
      return t("autoCheckin:skipReasons.method_disabled", messageParams)
    case "autoCheckin:skipReasons.method_not_matched":
      return t("autoCheckin:skipReasons.method_not_matched", messageParams)
    case "autoCheckin:skipReasons.method_unavailable":
      return t("autoCheckin:skipReasons.method_unavailable", messageParams)
    case "autoCheckin:skipReasons.method_unsupported":
      return t("autoCheckin:skipReasons.method_unsupported", messageParams)
    case "autoCheckin:skipReasons.network_error":
      return t("autoCheckin:skipReasons.network_error", messageParams)
    case "autoCheckin:skipReasons.no_selected_method":
      return t("autoCheckin:skipReasons.no_selected_method", messageParams)
    case "autoCheckin:skipReasons.permission_denied":
      return t("autoCheckin:skipReasons.permission_denied", messageParams)
    case "autoCheckin:skipReasons.source_unavailable":
      return t("autoCheckin:skipReasons.source_unavailable", messageParams)
    case "autoCheckin:skipReasons.timeout":
      return t("autoCheckin:skipReasons.timeout", messageParams)
    case "autoCheckin:skipReasons.auto_checkin_disabled":
      return t("autoCheckin:skipReasons.auto_checkin_disabled", messageParams)
    case "autoCheckin:skipReasons.already_checked_today":
      return t("autoCheckin:skipReasons.already_checked_today", messageParams)
    case "autoCheckin:skipReasons.status_unavailable":
      return t("autoCheckin:skipReasons.status_unavailable", messageParams)
    case "autoCheckin:skipReasons.no_provider":
      return t("autoCheckin:skipReasons.no_provider", messageParams)
    case "autoCheckin:skipReasons.account_unavailable":
      return t("autoCheckin:skipReasons.account_unavailable", messageParams)
    default:
      return messageKey
  }
}

/**
 * Resolves the user-facing message for one persisted execution result.
 */
export function getAutoCheckinResultMessage(
  t: TFunction,
  result: CheckinAccountResult,
): string {
  if (result.status === CHECKIN_RESULT_STATUS.UNCERTAIN) {
    return t("autoCheckin:providerFallback.resultPendingConfirmation")
  }
  if (result.reasonCode) {
    return translateAutoCheckinSkipReason(t, result.reasonCode)
  }
  if (result.messageKey) {
    return translateAutoCheckinMessageKey(
      t,
      result.messageKey,
      result.messageParams,
    )
  }
  if (result.rawMessage) return result.rawMessage
  if (result.message) return result.message
  return t("autoCheckin:providerFallback.unknownError")
}

/**
 * Applies the result-table status and localized keyword filters.
 */
export function filterAutoCheckinResults(
  results: CheckinAccountResult[],
  status: FilterStatus,
  keyword: string,
  t: TFunction,
): CheckinAccountResult[] {
  const normalizedKeyword = keyword.trim().toLowerCase()

  return results.filter((result) => {
    if (!matchesAutoCheckinResultStatus(result, status)) return false
    if (!normalizedKeyword) return true

    return (
      result.accountName.toLowerCase().includes(normalizedKeyword) ||
      String(result.accountId).toLowerCase().includes(normalizedKeyword) ||
      getAutoCheckinResultMessage(t, result)
        .toLowerCase()
        .includes(normalizedKeyword)
    )
  })
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
