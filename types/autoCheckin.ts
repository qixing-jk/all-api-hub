/**
 * Auto Check-in Types
 * Types for automatic daily check-in feature
 */

/**
 * Check-in result status
 */
export type CheckinResultStatus = "success" | "already_checked" | "failed"

/**
 * Single account check-in result
 */
export interface CheckinAccountResult {
  accountId: string
  accountName: string
  status: CheckinResultStatus
  message: string
  timestamp: number
}

/**
 * Overall auto check-in execution result
 */
export type AutoCheckinRunResult = "success" | "partial" | "failed"

/**
 * Auto check-in status stored in local storage
 */
export interface AutoCheckinStatus {
  lastRunAt?: string // ISO timestamp
  lastRunResult?: AutoCheckinRunResult
  perAccount?: Record<string, CheckinAccountResult>
  nextScheduledAt?: string // ISO timestamp
}

/**
 * Auto check-in preferences (stored in UserPreferences)
 */
export interface AutoCheckinPreferences {
  globalEnabled: boolean
  windowStart: string // HH:mm format (e.g., "09:00")
  windowEnd: string // HH:mm format (e.g., "18:00")
}
