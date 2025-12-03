/**
 * Auto Check-in Types
 * Types for automatic daily check-in feature
 */

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
  message: string
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
 * Auto check-in attempts tracker
 */
export interface AutoCheckinAttemptsTracker {
  date: string // YYYY-MM-DD
  attempts: number
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
  nextScheduledAt?: string // ISO timestamp
  summary?: AutoCheckinRunSummary
  attempts?: AutoCheckinAttemptsTracker
  pendingRetry?: boolean
  accountsSnapshot?: AutoCheckinAccountSnapshot[]
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
  windowStart: string // HH:mm format (e.g., "09:00")
  windowEnd: string // HH:mm format (e.g., "18:00")
  scheduleMode: AutoCheckinScheduleMode
  deterministicTime?: string // HH:mm format for deterministic mode
  retryStrategy: AutoCheckinRetryStrategy
}
