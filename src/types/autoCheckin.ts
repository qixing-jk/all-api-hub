/**
 * Auto Check-in Types
 * Types for automatic daily check-in feature
 */

import type { TFunction } from "i18next"

import { type RuntimeActionIds } from "~/constants/runtimeActions"
import type { AccountSiteType } from "~/constants/siteType"
import { type AutoCheckinMessageTypes } from "~/services/runtimeMessaging/messageTypes"

/**
 * Check-in result status
 */
export const CHECKIN_RESULT_STATUS = {
  SUCCESS: "success",
  ALREADY_CHECKED: "already_checked",
  FAILED: "failed",
  SKIPPED: "skipped",
} as const
export type CheckinResultStatus =
  (typeof CHECKIN_RESULT_STATUS)[keyof typeof CHECKIN_RESULT_STATUS]
export const CHECKIN_RESULT_STATUSES = Object.values(
  CHECKIN_RESULT_STATUS,
) as CheckinResultStatus[]

/**
 * Reasons why an account was skipped during auto check-in
 */
export const AUTO_CHECKIN_SKIP_REASON = {
  ACCOUNT_DISABLED: "account_disabled",
  DETECTION_DISABLED: "detection_disabled",
  METHOD_DISABLED: "method_disabled",
  AUTO_CHECKIN_DISABLED: "auto_checkin_disabled",
  ALREADY_CHECKED_TODAY: "already_checked_today",
  STATUS_UNAVAILABLE: "status_unavailable",
  NO_PROVIDER: "no_provider",
  NO_SELECTED_METHOD: "no_selected_method",
  METHOD_UNAVAILABLE: "method_unavailable",
  METHOD_NOT_MATCHED: "method_not_matched",
  METHOD_UNSUPPORTED: "method_unsupported",
  ACCOUNT_DATA_MISSING: "account_data_missing",
  AUTHENTICATION_REQUIRED: "authentication_required",
  CREDENTIALS_MISSING: "credentials_missing",
  NETWORK_ERROR: "network_error",
  SOURCE_UNAVAILABLE: "source_unavailable",
  PERMISSION_DENIED: "permission_denied",
  TIMEOUT: "timeout",
  ACCOUNT_UNAVAILABLE: "account_unavailable",
} as const
export type AutoCheckinSkipReason =
  (typeof AUTO_CHECKIN_SKIP_REASON)[keyof typeof AUTO_CHECKIN_SKIP_REASON]
export const AUTO_CHECKIN_SKIP_REASONS = Object.values(
  AUTO_CHECKIN_SKIP_REASON,
) as AutoCheckinSkipReason[]

/**
 * Returns the localized skip-reason key for a stable auto-check-in reason code.
 */
export function getAutoCheckinSkipReasonTranslationKey(
  reason: AutoCheckinSkipReason,
): string {
  switch (reason) {
    case AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED:
      return "autoCheckin:skipReasons.account_disabled"
    case AUTO_CHECKIN_SKIP_REASON.DETECTION_DISABLED:
      return "autoCheckin:skipReasons.detection_disabled"
    case AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED:
      return "autoCheckin:skipReasons.method_disabled"
    case AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED:
      return "autoCheckin:skipReasons.auto_checkin_disabled"
    case AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY:
      return "autoCheckin:skipReasons.already_checked_today"
    case AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE:
      return "autoCheckin:skipReasons.status_unavailable"
    case AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER:
      return "autoCheckin:skipReasons.no_provider"
    case AUTO_CHECKIN_SKIP_REASON.NO_SELECTED_METHOD:
      return "autoCheckin:skipReasons.no_selected_method"
    case AUTO_CHECKIN_SKIP_REASON.METHOD_UNAVAILABLE:
      return "autoCheckin:skipReasons.method_unavailable"
    case AUTO_CHECKIN_SKIP_REASON.METHOD_NOT_MATCHED:
      return "autoCheckin:skipReasons.method_not_matched"
    case AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED:
      return "autoCheckin:skipReasons.method_unsupported"
    case AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DATA_MISSING:
      return "autoCheckin:skipReasons.account_data_missing"
    case AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED:
      return "autoCheckin:skipReasons.authentication_required"
    case AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING:
      return "autoCheckin:skipReasons.credentials_missing"
    case AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR:
      return "autoCheckin:skipReasons.network_error"
    case AUTO_CHECKIN_SKIP_REASON.SOURCE_UNAVAILABLE:
      return "autoCheckin:skipReasons.source_unavailable"
    case AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED:
      return "autoCheckin:skipReasons.permission_denied"
    case AUTO_CHECKIN_SKIP_REASON.TIMEOUT:
      return "autoCheckin:skipReasons.timeout"
    case AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE:
      return "autoCheckin:skipReasons.account_unavailable"
  }

  return "autoCheckin:skipReasons.unknown"
}

/**
 * Returns the localized skip-reason label for a stable auto-check-in reason code.
 */
export function translateAutoCheckinSkipReason(
  t: TFunction,
  reason: AutoCheckinSkipReason,
): string {
  switch (reason) {
    case AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED:
      return t("autoCheckin:skipReasons.account_disabled")
    case AUTO_CHECKIN_SKIP_REASON.DETECTION_DISABLED:
      return t("autoCheckin:skipReasons.detection_disabled")
    case AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED:
      return t("autoCheckin:skipReasons.method_disabled")
    case AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED:
      return t("autoCheckin:skipReasons.auto_checkin_disabled")
    case AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY:
      return t("autoCheckin:skipReasons.already_checked_today")
    case AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE:
      return t("autoCheckin:skipReasons.status_unavailable")
    case AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER:
      return t("autoCheckin:skipReasons.no_provider")
    case AUTO_CHECKIN_SKIP_REASON.NO_SELECTED_METHOD:
      return t("autoCheckin:skipReasons.no_selected_method")
    case AUTO_CHECKIN_SKIP_REASON.METHOD_UNAVAILABLE:
      return t("autoCheckin:skipReasons.method_unavailable")
    case AUTO_CHECKIN_SKIP_REASON.METHOD_NOT_MATCHED:
      return t("autoCheckin:skipReasons.method_not_matched")
    case AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED:
      return t("autoCheckin:skipReasons.method_unsupported")
    case AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DATA_MISSING:
      return t("autoCheckin:skipReasons.account_data_missing")
    case AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED:
      return t("autoCheckin:skipReasons.authentication_required")
    case AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING:
      return t("autoCheckin:skipReasons.credentials_missing")
    case AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR:
      return t("autoCheckin:skipReasons.network_error")
    case AUTO_CHECKIN_SKIP_REASON.SOURCE_UNAVAILABLE:
      return t("autoCheckin:skipReasons.source_unavailable")
    case AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED:
      return t("autoCheckin:skipReasons.permission_denied")
    case AUTO_CHECKIN_SKIP_REASON.TIMEOUT:
      return t("autoCheckin:skipReasons.timeout")
    case AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE:
      return t("autoCheckin:skipReasons.account_unavailable")
  }
}

/**
 * Single account check-in result
 */
export interface CheckinAccountResult {
  accountId: string
  accountName: string
  status: CheckinResultStatus
  message?: string
  messageKey?: string
  messageParams?: Record<string, any>
  rawMessage?: string
  reasonCode?: AutoCheckinSkipReason
  timestamp: number
}

/**
 * Overall auto check-in execution result
 */
export const AUTO_CHECKIN_RUN_RESULT = {
  SUCCESS: "success",
  PARTIAL: "partial",
  FAILED: "failed",
  SKIPPED: "skipped",
} as const
export type AutoCheckinRunResult =
  (typeof AUTO_CHECKIN_RUN_RESULT)[keyof typeof AUTO_CHECKIN_RUN_RESULT]
export const AUTO_CHECKIN_RUN_RESULTS = Object.values(
  AUTO_CHECKIN_RUN_RESULT,
) as AutoCheckinRunResult[]

/**
 * Returns the localized label for a persisted auto check-in run result.
 */
export function getAutoCheckinRunResultLabel(
  t: TFunction,
  result: AutoCheckinRunResult,
): string {
  switch (result) {
    case AUTO_CHECKIN_RUN_RESULT.SUCCESS:
      return t("autoCheckin:status.result.success")
    case AUTO_CHECKIN_RUN_RESULT.PARTIAL:
      return t("autoCheckin:status.result.partial")
    case AUTO_CHECKIN_RUN_RESULT.FAILED:
      return t("autoCheckin:status.result.failed")
    case AUTO_CHECKIN_RUN_RESULT.SKIPPED:
      return t("autoCheckin:status.result.skipped")
  }

  return t("common:labels.unknown")
}

/**
 * Derives the persisted run result from its account-level summary.
 */
export function getAutoCheckinRunResultFromSummary(
  summary: Pick<
    AutoCheckinRunSummary,
    "executed" | "successCount" | "failedCount"
  >,
): AutoCheckinRunResult {
  if (summary.failedCount > 0 && summary.successCount > 0) {
    return AUTO_CHECKIN_RUN_RESULT.PARTIAL
  }
  if (summary.failedCount > 0) {
    return AUTO_CHECKIN_RUN_RESULT.FAILED
  }
  if (summary.executed === 0) {
    return AUTO_CHECKIN_RUN_RESULT.SKIPPED
  }
  return AUTO_CHECKIN_RUN_RESULT.SUCCESS
}

/**
 * Auto check-in execution run type.
 *
 * - `DAILY`: invoked by the scheduled daily alarm.
 * - `MANUAL`: invoked by a user action (e.g., "Run now" in the UI).
 */
export const AUTO_CHECKIN_RUN_TYPE = {
  DAILY: "daily",
  MANUAL: "manual",
} as const
export type AutoCheckinRunType =
  (typeof AUTO_CHECKIN_RUN_TYPE)[keyof typeof AUTO_CHECKIN_RUN_TYPE]
export const AUTO_CHECKIN_RUN_TYPES = Object.values(
  AUTO_CHECKIN_RUN_TYPE,
) as AutoCheckinRunType[]

/**
 * Auto check-in run kind used for run-completion notifications.
 *
 * - `daily`: scheduled daily execution (including UI-open pretrigger runs).
 * - `manual`: user-triggered execution (e.g. "Run now" from settings/controls).
 * - `retry`: automatic retry execution scheduled by the retry alarm.
 */
export type AutoCheckinRunKind = AutoCheckinRunType | "retry"

/**
 * Auto check-in run summary
 */
export interface AutoCheckinRunSummary {
  totalEligible: number
  executed: number
  successCount: number
  failedCount: number
  skippedCount: number
  needsRetry: boolean
}

/**
 * Runtime message request for a manual auto check-in execution.
 *
 * When `accountIds` is provided and non-empty, the background scopes the run to that account set.
 * When omitted, the background runs the full eligible set (backward compatible).
 */
export type AutoCheckinRunNowRuntimeMessage = {
  type: typeof AutoCheckinMessageTypes.RunNow
  data?: {
    accountIds?: string[]
  }
}

/**
 * Runtime message broadcast by the background after an auto check-in execution completes.
 *
 * This message is sent best-effort (it is safe when no UI surface is listening) and allows
 * open UI surfaces to refresh account status and/or the Auto Check-in status view without a
 * full page reload.
 */
export type AutoCheckinRunCompletedRuntimeMessage = {
  action: typeof RuntimeActionIds.AutoCheckinRunCompleted
  runKind: AutoCheckinRunKind
  updatedAccountIds: string[]
  timestamp: number
  summary?: AutoCheckinRunSummary
}

/**
 * Auto check-in attempts tracker
 */
export interface AutoCheckinAttemptsTracker {
  date: string // YYYY-MM-DD
  attempts: number
}

/**
 * Account-level retry state for the current day.
 *
 * Notes:
 * - `day` uses a local calendar day boundary (`YYYY-MM-DD`).
 * - `attemptsByAccount` tracks total attempts for that account on `day`
 *   (initial normal run + automatic retries).
 */
export interface AutoCheckinRetryState {
  day: string // local YYYY-MM-DD
  pendingAccountIds: string[]
  attemptsByAccount: Record<string, number>
}

/**
 * Auto check-in account snapshot
 */
export interface AutoCheckinAccountSnapshot {
  accountId: string
  accountName: string
  siteType: AccountSiteType
  detectionEnabled: boolean
  autoCheckinEnabled: boolean
  providerAvailable: boolean
  isCheckedInToday?: boolean
  lastCheckInDate?: string
  skipReason?: AutoCheckinSkipReason
  lastResult?: CheckinAccountResult
}

/**
 * Auto check-in status stored in local storage
 */
export interface AutoCheckinStatus {
  lastRunAt?: string // ISO timestamp
  lastRunResult?: AutoCheckinRunResult
  perAccount?: Record<string, CheckinAccountResult>
  summary?: AutoCheckinRunSummary
  accountsSnapshot?: AutoCheckinAccountSnapshot[]

  /**
   * Tracks the local calendar day (`YYYY-MM-DD`) when the last *normal* scheduled run executed.
   * Used to ensure the normal schedule runs at most once per day.
   */
  lastDailyRunDay?: string

  /**
   * Next scheduled time for the *normal* daily alarm.
   */
  nextDailyScheduledAt?: string // ISO timestamp

  /**
   * Next scheduled time for the *retry* alarm (only present when retries are pending).
   */
  nextRetryScheduledAt?: string // ISO timestamp

  /**
   * Target day used to guard against stale alarms (local `YYYY-MM-DD`).
   * When an alarm fires, the scheduler compares the stored target day with today's day and
   * skips execution when they don't match.
   */
  dailyAlarmTargetDay?: string
  retryAlarmTargetDay?: string

  /**
   * Automatic retry queue (scoped to one day only).
   */
  retryState?: AutoCheckinRetryState

  /**
   * Legacy fields kept for backward compatibility with previously stored status payloads.
   * New code should prefer `nextDailyScheduledAt`, `nextRetryScheduledAt`, and `retryState`.
   */
  nextScheduledAt?: string // ISO timestamp (legacy: single alarm)
  attempts?: AutoCheckinAttemptsTracker // legacy: global attempts tracker
  pendingRetry?: boolean // legacy: derived from retry state
}

/**
 * Auto check-in preferences (stored in UserPreferences)
 */
export const AUTO_CHECKIN_SCHEDULE_MODE = {
  RANDOM: "random",
  DETERMINISTIC: "deterministic",
} as const
export type AutoCheckinScheduleMode =
  (typeof AUTO_CHECKIN_SCHEDULE_MODE)[keyof typeof AUTO_CHECKIN_SCHEDULE_MODE]
export const AUTO_CHECKIN_SCHEDULE_MODES = Object.values(
  AUTO_CHECKIN_SCHEDULE_MODE,
) as AutoCheckinScheduleMode[]

export interface AutoCheckinRetryStrategy {
  enabled: boolean
  intervalMinutes: number
  maxAttemptsPerDay: number
}

export interface AutoCheckinPreferences {
  globalEnabled: boolean

  /**
   * When enabled, opening an extension UI surface (popup/side panel/options) will
   * opportunistically trigger today's scheduled daily run early (only when the
   * current time is inside the configured time window and the daily run has not
   * executed yet).
   */
  pretriggerDailyOnUiOpen: boolean

  /**
   * When enabled (default), the background broadcasts a completion notification after each
   * auto check-in execution so open UI surfaces can refresh the affected accounts immediately.
   */
  notifyUiOnCompletion: boolean
  windowStart: string // HH:mm format (e.g., "09:00")
  windowEnd: string // HH:mm format (e.g., "18:00")
  scheduleMode: AutoCheckinScheduleMode
  deterministicTime?: string // HH:mm format for deterministic mode
  retryStrategy: AutoCheckinRetryStrategy
}
