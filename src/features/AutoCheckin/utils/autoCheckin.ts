import type { TFunction } from "i18next"

import {
  AUTO_CHECKIN_SKIP_REASONS,
  CHECKIN_RESULT_STATUS,
  translateAutoCheckinSkipReason,
  type AutoCheckinSkipReason,
  type CheckinAccountResult,
  type CheckinResultStatus,
} from "~/types/autoCheckin"

import {
  AUTO_CHECKIN_SKIP_CATEGORIES,
  AUTO_CHECKIN_SKIP_CATEGORY,
  getAutoCheckinSkipCategory,
  isAutoCheckinSkipReasonActionable,
  type AutoCheckinSkipCategory,
} from "./skipCategories"

/**
 * Result-table filter state. Atomic statuses stay selectable as-is; reason
 * narrowing (semantic categories plus the precise reason codes behind them)
 * applies to `skipped` rows so expected skips never inflate the
 * needs-attention preset.
 */
export interface AutoCheckinResultFilter {
  statuses: CheckinResultStatus[]
  skippedCategories: AutoCheckinSkipCategory[]
  /** Precise skip reasons, derived from the classifications in the results. */
  reasons: AutoCheckinSkipReason[]
}

/** Default filter: every result is visible. */
export const EMPTY_AUTO_CHECKIN_RESULT_FILTER: AutoCheckinResultFilter = {
  statuses: [],
  skippedCategories: [],
  reasons: [],
}

/** Preset for results that genuinely need a user decision. */
export function createNeedsAttentionResultFilter(): AutoCheckinResultFilter {
  return {
    statuses: [
      CHECKIN_RESULT_STATUS.FAILED,
      CHECKIN_RESULT_STATUS.UNCERTAIN,
      CHECKIN_RESULT_STATUS.SKIPPED,
    ],
    skippedCategories: [AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED],
    reasons: [],
  }
}

/** Counts active filter dimensions for analytics without exposing values. */
export function countActiveResultFilterDimensions(
  filter: AutoCheckinResultFilter,
  keyword: string,
): number {
  return (
    (filter.statuses.length > 0 ? 1 : 0) +
    (filter.skippedCategories.length > 0 || filter.reasons.length > 0 ? 1 : 0) +
    (keyword.trim() ? 1 : 0)
  )
}

/** Detects the semantic needs-attention preset behind the filter state. */
export function isAutoCheckinNeedsAttentionFilter(
  filter: AutoCheckinResultFilter,
): boolean {
  const preset = createNeedsAttentionResultFilter()
  return (
    filter.statuses.length === preset.statuses.length &&
    preset.statuses.every((status) => filter.statuses.includes(status)) &&
    filter.skippedCategories.length === preset.skippedCategories.length &&
    preset.skippedCategories.every((category) =>
      filter.skippedCategories.includes(category),
    ) &&
    filter.reasons.length === 0
  )
}

interface AutoCheckinResultCounts {
  total: number
  success: number
  alreadyChecked: number
  failed: number
  uncertain: number
  skipped: number
}

/** Counts execution outcomes by their user-visible result category. */
export function countAutoCheckinResults(
  results: readonly CheckinAccountResult[],
): AutoCheckinResultCounts {
  return results.reduce<AutoCheckinResultCounts>(
    (counts, result) => {
      counts.total += 1
      switch (result.status) {
        case CHECKIN_RESULT_STATUS.SUCCESS:
          counts.success += 1
          break
        case CHECKIN_RESULT_STATUS.ALREADY_CHECKED:
          counts.alreadyChecked += 1
          break
        case CHECKIN_RESULT_STATUS.FAILED:
          counts.failed += 1
          break
        case CHECKIN_RESULT_STATUS.UNCERTAIN:
          counts.uncertain += 1
          break
        case CHECKIN_RESULT_STATUS.SKIPPED:
          counts.skipped += 1
          break
      }
      return counts
    },
    {
      total: 0,
      success: 0,
      alreadyChecked: 0,
      failed: 0,
      uncertain: 0,
      skipped: 0,
    },
  )
}

/**
 * Resolves the precise skip reason of a skipped result. Unknown or legacy
 * reasons stay uncategorized so they never create attention noise.
 */
function resolveSkippedResultReason(
  result: CheckinAccountResult,
): AutoCheckinSkipReason | null {
  if (result.status !== CHECKIN_RESULT_STATUS.SKIPPED) return null

  return result.reasonCode ?? null
}

/**
 * Resolves the semantic category of a skipped result. Unknown or legacy
 * reasons fall back to the routine bucket so they never create attention
 * noise; other statuses stay uncategorized.
 */
function resolveSkippedResultCategory(
  result: CheckinAccountResult,
): AutoCheckinSkipCategory | null {
  if (result.status !== CHECKIN_RESULT_STATUS.SKIPPED) return null

  return (
    getAutoCheckinSkipCategory(result.reasonCode) ??
    AUTO_CHECKIN_SKIP_CATEGORY.EXPECTED
  )
}

/**
 * Checks whether a result matches the selected statuses and, for skipped
 * rows, the selected reason categories and precise reasons.
 */
function matchesAutoCheckinResultFilter(
  result: CheckinAccountResult,
  filter: AutoCheckinResultFilter,
): boolean {
  if (filter.statuses.length > 0 && !filter.statuses.includes(result.status)) {
    return false
  }

  const reasonsAreNarrowed =
    filter.skippedCategories.length > 0 || filter.reasons.length > 0
  if (reasonsAreNarrowed) {
    const reason = resolveSkippedResultReason(result)
    const category = resolveSkippedResultCategory(result)
    const matchesReason = reason !== null && filter.reasons.includes(reason)
    const matchesCategory =
      category !== null && filter.skippedCategories.includes(category)

    // Non-skipped rows carry their own status bucketing and stay visible,
    // while unknown or legacy skip reasons fall back to the routine bucket.
    if (!matchesReason && !matchesCategory && category !== null) {
      return false
    }
  }

  return true
}

/** Returns whether one result needs an explicit user follow-up. */
export function isAutoCheckinResultNeedingAttention(
  result: CheckinAccountResult,
): boolean {
  if (
    result.status === CHECKIN_RESULT_STATUS.FAILED ||
    result.status === CHECKIN_RESULT_STATUS.UNCERTAIN
  ) {
    return true
  }

  return (
    result.status === CHECKIN_RESULT_STATUS.SKIPPED &&
    isAutoCheckinSkipReasonActionable(result.reasonCode)
  )
}

/** Counts the results surfaced by the needs-attention preset. */
export function countAutoCheckinResultsNeedingAttention(
  results: readonly CheckinAccountResult[],
): number {
  return results.filter(isAutoCheckinResultNeedingAttention).length
}

/** Counts skipped results per persisted reason code. */
export function countAutoCheckinSkippedReasons(
  results: readonly CheckinAccountResult[],
): Record<AutoCheckinSkipReason, number> {
  const counts = Object.fromEntries(
    AUTO_CHECKIN_SKIP_REASONS.map((reason) => [reason, 0]),
  ) as Record<AutoCheckinSkipReason, number>

  for (const result of results) {
    const reason = resolveSkippedResultReason(result)
    if (!reason) continue
    counts[reason] += 1
  }

  return counts
}

/** Counts skipped results per semantic reason category. */
export function countAutoCheckinSkippedCategories(
  results: readonly CheckinAccountResult[],
): Record<AutoCheckinSkipCategory, number> {
  const counts = Object.fromEntries(
    AUTO_CHECKIN_SKIP_CATEGORIES.map((category) => [category, 0]),
  ) as Record<AutoCheckinSkipCategory, number>

  for (const result of results) {
    const category = resolveSkippedResultCategory(result)
    if (!category) continue
    counts[category] += 1
  }

  return counts
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
    case "autoCheckin:providerFallback.sessionBusy":
      return t("autoCheckin:providerFallback.sessionBusy", messageParams)
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
export function getAutoCheckinResultMessage<
  T extends Pick<
    CheckinAccountResult,
    | "status"
    | "reasonCode"
    | "messageKey"
    | "messageParams"
    | "rawMessage"
    | "message"
  >,
>(t: TFunction, result: T): string {
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
 * Applies the result-table filter state and localized keyword filter.
 */
export function filterAutoCheckinResults(
  results: readonly CheckinAccountResult[],
  filter: AutoCheckinResultFilter,
  keyword: string,
  t: TFunction,
): CheckinAccountResult[] {
  const normalizedKeyword = keyword.trim().toLowerCase()

  return results.filter((result) => {
    if (!matchesAutoCheckinResultFilter(result, filter)) return false
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
