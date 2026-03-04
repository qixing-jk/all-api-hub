/**
 * Auto Check-in Types
 * Types for automatic daily check-in feature
 */

import { RuntimeActionIds } from "~/constants/runtimeActions"

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
  AUTO_CHECKIN_DISABLED: "auto_checkin_disabled",
  ALREADY_CHECKED_TODAY: "already_checked_today",
  NO_PROVIDER: "no_provider",
  PROVIDER_NOT_READY: "provider_not_ready",
} as const
export type AutoCheckinSkipReason =
  (typeof AUTO_CHECKIN_SKIP_REASON)[keyof typeof AUTO_CHECKIN_SKIP_REASON]
export const AUTO_CHECKIN_SKIP_REASONS = Object.values(
  AUTO_CHECKIN_SKIP_REASON,
) as AutoCheckinSkipReason[]

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
} as const
export type AutoCheckinRunResult =
  (typeof AUTO_CHECKIN_RUN_RESULT)[keyof typeof AUTO_CHECKIN_RUN_RESULT]
export const AUTO_CHECKIN_RUN_RESULTS = Object.values(
  AUTO_CHECKIN_RUN_RESULT,
) as AutoCheckinRunResult[]

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
  action: typeof RuntimeActionIds.AutoCheckinRunNow
  accountIds?: string[]
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
  siteType: string
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
