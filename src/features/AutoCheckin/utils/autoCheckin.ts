import type { TFunction } from "i18next"

import {
  AUTO_CHECKIN_SKIP_REASONS,
  CHECKIN_RESULT_STATUS,
  isSiteTypeRelatedSkipReason,
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
 * Statuses whose results can carry a persisted reason code and therefore take
 * part in the reason narrowing.
 */
export const AUTO_CHECKIN_REASON_FILTERABLE_STATUSES = [
  CHECKIN_RESULT_STATUS.SKIPPED,
  CHECKIN_RESULT_STATUS.FAILED,
  CHECKIN_RESULT_STATUS.UNCERTAIN,
] as const

export type AutoCheckinReasonFilterableStatus =
  (typeof AUTO_CHECKIN_REASON_FILTERABLE_STATUSES)[number]

const REASON_FILTERABLE_STATUS_SET = new Set<string>(
  AUTO_CHECKIN_REASON_FILTERABLE_STATUSES,
)

/** Narrows a result status to the subset that persists a reason code. */
function isReasonFilterableStatus(
  status: CheckinResultStatus,
): status is AutoCheckinReasonFilterableStatus {
  return REASON_FILTERABLE_STATUS_SET.has(status)
}

/**
 * Reason narrowing shared by every reason-carrying status. Categories and the
 * precise reasons behind them are one selection; `appliesTo` records which
 * statuses the selection narrows.
 */
export interface AutoCheckinReasonFilter {
  appliesTo: AutoCheckinReasonFilterableStatus[]
  categories: AutoCheckinSkipCategory[]
  reasons: AutoCheckinSkipReason[]
}

/** Result-table filter state: status multi-select plus optional reason narrowing. */
export interface AutoCheckinResultFilter {
  statuses: CheckinResultStatus[]
  reason: AutoCheckinReasonFilter
}

/** Default filter: every result is visible. */
export const EMPTY_AUTO_CHECKIN_RESULT_FILTER: AutoCheckinResultFilter = {
  statuses: [],
  reason: {
    appliesTo: [],
    categories: [],
    reasons: [],
  },
}

/** Preset for results that genuinely need a user decision. */
export function createNeedsAttentionResultFilter(): AutoCheckinResultFilter {
  return {
    statuses: [
      CHECKIN_RESULT_STATUS.FAILED,
      CHECKIN_RESULT_STATUS.UNCERTAIN,
      CHECKIN_RESULT_STATUS.SKIPPED,
    ],
    // Failed and uncertain rows stay complete: only actionable skips are
    // narrowed, so the preset still matches the attention queue.
    reason: {
      appliesTo: [CHECKIN_RESULT_STATUS.SKIPPED],
      categories: [AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED],
      reasons: [],
    },
  }
}

/** Returns whether the reason selection currently narrows any result. */
export function isAutoCheckinReasonFilterActive(
  filter: AutoCheckinResultFilter,
): boolean {
  return (
    filter.reason.appliesTo.length > 0 &&
    (filter.reason.categories.length > 0 || filter.reason.reasons.length > 0)
  )
}

/**
 * Resolves the statuses a reason selection would apply to. Without a status
 * selection every reason-carrying status is narrowed.
 */
export function resolveAutoCheckinReasonScope(
  statuses: readonly CheckinResultStatus[],
): AutoCheckinReasonFilterableStatus[] {
  if (statuses.length === 0) return [...AUTO_CHECKIN_REASON_FILTERABLE_STATUSES]

  return AUTO_CHECKIN_REASON_FILTERABLE_STATUSES.filter((status) =>
    statuses.includes(status),
  )
}

/** Counts active filter dimensions for analytics without exposing values. */
export function countActiveResultFilterDimensions(
  filter: AutoCheckinResultFilter,
  keyword: string,
): number {
  return (
    (filter.statuses.length > 0 ? 1 : 0) +
    (isAutoCheckinReasonFilterActive(filter) ? 1 : 0) +
    (keyword.trim() ? 1 : 0)
  )
}

/** Detects the semantic needs-attention preset behind the filter state. */
export function isAutoCheckinNeedsAttentionFilter(
  filter: AutoCheckinResultFilter,
): boolean {
  const preset = createNeedsAttentionResultFilter()
  return (
    matchesSelection(filter.statuses, preset.statuses) &&
    matchesSelection(filter.reason.appliesTo, preset.reason.appliesTo) &&
    matchesSelection(filter.reason.categories, preset.reason.categories) &&
    filter.reason.reasons.length === 0
  )
}

/** Compares two selections independent of their order. */
function matchesSelection<T>(selection: readonly T[], expected: readonly T[]) {
  return (
    selection.length === expected.length &&
    expected.every((value) => selection.includes(value))
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
 * Resolves the semantic reason category of a result. Unknown or legacy skip
 * reasons keep the routine bucket; other reason-carrying statuses fall back to
 * the unclassified bucket so the reason dimension covers every row, while
 * statuses without a reason vocabulary stay uncategorized.
 */
function resolveResultReasonCategory(
  result: CheckinAccountResult,
): AutoCheckinSkipCategory | null {
  const category = getAutoCheckinSkipCategory(result.reasonCode)
  if (category) return category

  if (result.status === CHECKIN_RESULT_STATUS.SKIPPED) {
    return AUTO_CHECKIN_SKIP_CATEGORY.EXPECTED
  }

  return isReasonFilterableStatus(result.status)
    ? AUTO_CHECKIN_SKIP_CATEGORY.UNCLASSIFIED
    : null
}

/**
 * Checks whether a result matches the selected statuses and, for the
 * reason-carrying statuses in scope, the selected reason selection.
 */
function matchesAutoCheckinResultFilter(
  result: CheckinAccountResult,
  filter: AutoCheckinResultFilter,
): boolean {
  if (filter.statuses.length > 0 && !filter.statuses.includes(result.status)) {
    return false
  }
  if (!isAutoCheckinReasonFilterActive(filter)) return true
  if (
    !isReasonFilterableStatus(result.status) ||
    !filter.reason.appliesTo.includes(result.status)
  ) {
    return true
  }

  const reason = result.reasonCode ?? null
  if (reason && filter.reason.reasons.includes(reason)) return true

  const category = resolveResultReasonCategory(result)
  return category !== null && filter.reason.categories.includes(category)
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

/** Counts results per persisted reason code. */
export function countAutoCheckinResultReasons(
  results: readonly CheckinAccountResult[],
): Record<AutoCheckinSkipReason, number> {
  const counts = Object.fromEntries(
    AUTO_CHECKIN_SKIP_REASONS.map((reason) => [reason, 0]),
  ) as Record<AutoCheckinSkipReason, number>

  for (const result of results) {
    const reason = result.reasonCode
    if (!reason) continue
    if (!Object.hasOwn(counts, reason)) continue
    counts[reason] += 1
  }

  return counts
}

/** Counts results per semantic reason category. */
export function countAutoCheckinResultReasonCategories(
  results: readonly CheckinAccountResult[],
): Record<AutoCheckinSkipCategory, number> {
  const counts = Object.fromEntries(
    AUTO_CHECKIN_SKIP_CATEGORIES.map((category) => [category, 0]),
  ) as Record<AutoCheckinSkipCategory, number>

  for (const result of results) {
    const category = resolveResultReasonCategory(result)
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
    case "autoCheckin:providerFallback.loginProviderRequired":
      return t(
        "autoCheckin:providerFallback.loginProviderRequired",
        messageParams,
      )
    case "messages:errors.validation.loginProviderInUse":
      return t("messages:errors.validation.loginProviderInUse", messageParams)
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
    case "autoCheckin:skipReasons.checkin_page_unavailable":
      return t(
        "autoCheckin:skipReasons.checkin_page_unavailable",
        messageParams,
      )
    case "autoCheckin:skipReasons.checkin_unconfirmed":
      return t("autoCheckin:skipReasons.checkin_unconfirmed", messageParams)
    case "autoCheckin:skipReasons.execution_context_invalid":
      return t(
        "autoCheckin:skipReasons.execution_context_invalid",
        messageParams,
      )
    case "autoCheckin:skipReasons.manual_verification_required":
      return t(
        "autoCheckin:skipReasons.manual_verification_required",
        messageParams,
      )
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
    case "autoCheckin:skipReasons.session_busy":
      return t("autoCheckin:skipReasons.session_busy", messageParams)
    case "autoCheckin:skipReasons.status_unavailable":
      return t("autoCheckin:skipReasons.status_unavailable", messageParams)
    case "autoCheckin:skipReasons.upstream_error":
      return t("autoCheckin:skipReasons.upstream_error", messageParams)
    case "autoCheckin:skipReasons.no_provider":
      return t("autoCheckin:skipReasons.no_provider", messageParams)
    case "autoCheckin:skipReasons.account_unavailable":
      return t("autoCheckin:skipReasons.account_unavailable", messageParams)
    case "autoCheckin:skipReasons.login_provider_in_use":
      return t("autoCheckin:skipReasons.login_provider_in_use", messageParams)
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
  if (result.messageKey) {
    return translateAutoCheckinMessageKey(
      t,
      result.messageKey,
      result.messageParams,
    )
  }
  if (result.reasonCode) {
    return translateAutoCheckinSkipReason(t, result.reasonCode)
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

/**
 * Translation keys of the per-result troubleshooting hints.
 *
 * Keep each key's text as a literal argument at its `t()` call site as well: the
 * i18n extractor only sees literal arguments, so copy translated through this
 * constant alone counts as unused and is pruned from the locale files.
 */
export const AUTO_CHECKIN_TROUBLESHOOTING_HINT_KEYS = {
  invalidAccessToken: "execution.hints.invalidAccessToken",
  manualVerificationRequired: "execution.hints.manualVerificationRequired",
  noTabWithId: "execution.hints.noTabWithId",
  siteTypeCheckinUnsupported: "execution.hints.siteTypeCheckinUnsupported",
} as const

export type AutoCheckinTroubleshootingHintKey =
  (typeof AUTO_CHECKIN_TROUBLESHOOTING_HINT_KEYS)[keyof typeof AUTO_CHECKIN_TROUBLESHOOTING_HINT_KEYS]

/**
 * Resolve an optional troubleshooting hint for a result row based on its
 * structured message key first, then on known raw/backend message patterns.
 */
export function resolveAutoCheckinTroubleshootingHintKey(params: {
  status?: string
  reasonCode?: AutoCheckinSkipReason
  messageKey?: string
  message: string
}): AutoCheckinTroubleshootingHintKey | null {
  if (
    (params.reasonCode && isSiteTypeRelatedSkipReason(params.reasonCode)) ||
    params.messageKey === "autoCheckin:skipReasons.no_provider" ||
    params.messageKey === "autoCheckin:providerFallback.endpointNotSupported"
  ) {
    return AUTO_CHECKIN_TROUBLESHOOTING_HINT_KEYS.siteTypeCheckinUnsupported
  }

  if (params.status !== CHECKIN_RESULT_STATUS.FAILED) {
    return null
  }

  if (isInvalidAccessTokenMessage(params.message)) {
    return AUTO_CHECKIN_TROUBLESHOOTING_HINT_KEYS.invalidAccessToken
  }

  if (isNoTabWithIdMessage(params.message)) {
    return AUTO_CHECKIN_TROUBLESHOOTING_HINT_KEYS.noTabWithId
  }

  if (isManualVerificationRequiredMessage(params.message)) {
    return AUTO_CHECKIN_TROUBLESHOOTING_HINT_KEYS.manualVerificationRequired
  }

  return null
}
