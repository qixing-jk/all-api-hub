/**
 * Auto Check-in Types
 * Types for automatic daily check-in feature
 */

import type { TFunction } from "i18next"

import { type RuntimeActionIds } from "~/constants/runtimeActions"
import type { AccountSiteType } from "~/constants/siteType"

/**
 * Check-in result status
 */
export const CHECKIN_RESULT_STATUS = {
  SUCCESS: "success",
  ALREADY_CHECKED: "already_checked",
  FAILED: "failed",
  SKIPPED: "skipped",
  UNCERTAIN: "uncertain",
} as const
export type CheckinResultStatus =
  (typeof CHECKIN_RESULT_STATUS)[keyof typeof CHECKIN_RESULT_STATUS]
export const CHECKIN_RESULT_STATUSES = Object.values(
  CHECKIN_RESULT_STATUS,
) as CheckinResultStatus[]

export const CHECKIN_RECONCILIATION_OUTCOME = {
  CHECKED: "checked",
  NOT_CHECKED: "not_checked",
  UNKNOWN: "unknown",
  UNAVAILABLE: "unavailable",
} as const
export type CheckinReconciliationOutcome =
  (typeof CHECKIN_RECONCILIATION_OUTCOME)[keyof typeof CHECKIN_RECONCILIATION_OUTCOME]

export const CHECKIN_ACCOUNT_STATE_DURABILITY = {
  PERSISTED: "persisted",
  FAILED: "failed",
} as const
export type CheckinAccountStateDurability =
  (typeof CHECKIN_ACCOUNT_STATE_DURABILITY)[keyof typeof CHECKIN_ACCOUNT_STATE_DURABILITY]

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
  MANUAL_VERIFICATION_REQUIRED: "manual_verification_required",
  NETWORK_ERROR: "network_error",
  SOURCE_UNAVAILABLE: "source_unavailable",
  PERMISSION_DENIED: "permission_denied",
  TIMEOUT: "timeout",
  ACCOUNT_UNAVAILABLE: "account_unavailable",
  EXECUTION_CONTEXT_INVALID: "execution_context_invalid",
  CHECKIN_UNCONFIRMED: "checkin_unconfirmed",
  CHECKIN_PAGE_UNAVAILABLE: "checkin_page_unavailable",
  SESSION_BUSY: "session_busy",
  UPSTREAM_ERROR: "upstream_error",
  /** Another enabled account already owns this login method's browser context. */
  LOGIN_PROVIDER_IN_USE: "login_provider_in_use",
} as const
export type AutoCheckinSkipReason =
  (typeof AUTO_CHECKIN_SKIP_REASON)[keyof typeof AUTO_CHECKIN_SKIP_REASON]
export const AUTO_CHECKIN_SKIP_REASONS = Object.values(
  AUTO_CHECKIN_SKIP_REASON,
) as AutoCheckinSkipReason[]

/**
 * Localized label key per reason code. The map is exhaustive by type, so a new
 * reason code cannot silently miss its copy.
 */
const SKIP_REASON_TRANSLATION_KEYS: Record<AutoCheckinSkipReason, string> = {
  [AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED]:
    "autoCheckin:skipReasons.account_disabled",
  [AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE]:
    "autoCheckin:skipReasons.account_unavailable",
  [AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DATA_MISSING]:
    "autoCheckin:skipReasons.account_data_missing",
  [AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY]:
    "autoCheckin:skipReasons.already_checked_today",
  [AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED]:
    "autoCheckin:skipReasons.authentication_required",
  [AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED]:
    "autoCheckin:skipReasons.auto_checkin_disabled",
  [AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING]:
    "autoCheckin:skipReasons.credentials_missing",
  [AUTO_CHECKIN_SKIP_REASON.DETECTION_DISABLED]:
    "autoCheckin:skipReasons.detection_disabled",
  [AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE]:
    "autoCheckin:skipReasons.checkin_page_unavailable",
  [AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED]:
    "autoCheckin:skipReasons.checkin_unconfirmed",
  [AUTO_CHECKIN_SKIP_REASON.LOGIN_PROVIDER_IN_USE]:
    "autoCheckin:skipReasons.login_provider_in_use",
  [AUTO_CHECKIN_SKIP_REASON.EXECUTION_CONTEXT_INVALID]:
    "autoCheckin:skipReasons.execution_context_invalid",
  [AUTO_CHECKIN_SKIP_REASON.SESSION_BUSY]:
    "autoCheckin:skipReasons.session_busy",
  [AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED]:
    "autoCheckin:skipReasons.manual_verification_required",
  [AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED]:
    "autoCheckin:skipReasons.method_disabled",
  [AUTO_CHECKIN_SKIP_REASON.METHOD_NOT_MATCHED]:
    "autoCheckin:skipReasons.method_not_matched",
  [AUTO_CHECKIN_SKIP_REASON.METHOD_UNAVAILABLE]:
    "autoCheckin:skipReasons.method_unavailable",
  [AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED]:
    "autoCheckin:skipReasons.method_unsupported",
  [AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR]:
    "autoCheckin:skipReasons.network_error",
  [AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER]: "autoCheckin:skipReasons.no_provider",
  [AUTO_CHECKIN_SKIP_REASON.NO_SELECTED_METHOD]:
    "autoCheckin:skipReasons.no_selected_method",
  [AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED]:
    "autoCheckin:skipReasons.permission_denied",
  [AUTO_CHECKIN_SKIP_REASON.SOURCE_UNAVAILABLE]:
    "autoCheckin:skipReasons.source_unavailable",
  [AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE]:
    "autoCheckin:skipReasons.status_unavailable",
  [AUTO_CHECKIN_SKIP_REASON.TIMEOUT]: "autoCheckin:skipReasons.timeout",
  [AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR]:
    "autoCheckin:skipReasons.upstream_error",
}

/**
 * Returns the localized skip-reason key for a stable auto-check-in reason code.
 */
export function getAutoCheckinSkipReasonTranslationKey(
  reason: AutoCheckinSkipReason,
): string {
  return (
    SKIP_REASON_TRANSLATION_KEYS[reason] ?? "autoCheckin:skipReasons.unknown"
  )
}

/**
 * Returns the localized skip-reason label for a stable auto-check-in reason code.
 */
export function translateAutoCheckinSkipReason(
  t: TFunction,
  reason: AutoCheckinSkipReason,
): string {
  return t(getAutoCheckinSkipReasonTranslationKey(reason))
}

interface CheckinAccountResultBase {
  accountId: string
  accountName: string
  methodId?: string
  message?: string
  messageKey?: string
  messageParams?: Record<string, any>
  rawMessage?: string
  reasonCode?: AutoCheckinSkipReason
  retryable?: boolean
  reconciliation?: CheckinReconciliationOutcome
  accountStateDurability?: CheckinAccountStateDurability
  timestamp: number
}

/** One account outcome with only valid retry/certainty combinations. */
export type CheckinAccountResult = CheckinAccountResultBase &
  (
    | {
        status:
          | typeof CHECKIN_RESULT_STATUS.SUCCESS
          | typeof CHECKIN_RESULT_STATUS.ALREADY_CHECKED
        retryable?: never
        accountStateDurability?: CheckinAccountStateDurability
        reconciliation?: typeof CHECKIN_RECONCILIATION_OUTCOME.CHECKED
      }
    | {
        status: typeof CHECKIN_RESULT_STATUS.FAILED
        accountStateDurability?: never
      }
    | {
        status: typeof CHECKIN_RESULT_STATUS.SKIPPED
        retryable?: never
        reconciliation?: never
        accountStateDurability?: never
      }
    | {
        status: typeof CHECKIN_RESULT_STATUS.UNCERTAIN
        retryable?: never
        reconciliation: Exclude<
          CheckinReconciliationOutcome,
          typeof CHECKIN_RECONCILIATION_OUTCOME.CHECKED
        >
        accountStateDurability?: never
      }
  )

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
    "executed" | "successCount" | "failedCount" | "uncertainCount"
  >,
): AutoCheckinRunResult {
  const unresolvedCount = summary.failedCount + (summary.uncertainCount ?? 0)
  if (unresolvedCount > 0 && summary.successCount > 0) {
    return AUTO_CHECKIN_RUN_RESULT.PARTIAL
  }
  if (unresolvedCount > 0) {
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
  /** Successful outcomes that were already checked in before this run. */
  alreadyCheckedCount?: number
  failedCount: number
  skippedCount: number
  uncertainCount?: number
  needsRetry: boolean
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
