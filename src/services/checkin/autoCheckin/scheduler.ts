import {
  CHECK_IN_EXECUTION_SKIP_REASONS,
  CHECK_IN_METHOD_EXECUTION_RESULT_KINDS,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_SELECTION_STATUSES,
} from "~/constants/checkIn"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { accountStorage } from "~/services/accounts/accountStorage"
import { buildAccountDisplayNameMap } from "~/services/accounts/utils/accountDisplayName"
import { getSelectedCheckInStatus } from "~/services/checkin/autoCheckin/inspection"
import {
  onAutoCheckinMessage,
  type AutoCheckinDebugScheduleDailyAlarmForTodayRequest,
  type AutoCheckinGetAccountInfoRequest,
  type AutoCheckinPretriggerDailyOnUiOpenRequest,
  type AutoCheckinRunNowRequest,
  type AutoCheckinUpdateSettingsRequest,
} from "~/services/checkin/autoCheckin/messaging"
import {
  executeSelectedCheckIn,
  inspectSelectedCheckInCompatibility,
} from "~/services/checkin/autoCheckin/methods"
import { resolveProviderErrorResult } from "~/services/checkin/autoCheckin/providers/shared"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { notifyTaskResult } from "~/services/notifications/taskNotificationService"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { trackProductAnalyticsActionCompleted } from "~/services/productAnalytics/actions"
import {
  buildAutoCheckinDiagnostics,
  trackAutoCheckinConfigSnapshot,
  trackAutoCheckinRunAnalytics,
} from "~/services/productAnalytics/autoCheckin"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsResult,
} from "~/services/productAnalytics/contracts"
import { createAutomaticProtectionBypassExecution } from "~/services/protectionBypass/client"
import {
  INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
  isProtectionBypassExecution,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_USER_COMMANDS,
  type ProtectionBypassExecution,
  type ProtectionBypassUserCommand,
} from "~/services/protectionBypass/contracts"
import { AutoCheckinMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { DisplaySiteData, SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_RUN_RESULT,
  AUTO_CHECKIN_RUN_TYPE,
  AUTO_CHECKIN_SCHEDULE_MODE,
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_ACCOUNT_STATE_DURABILITY,
  CHECKIN_RESULT_STATUS,
  getAutoCheckinRunResultFromSummary,
  getAutoCheckinSkipReasonTranslationKey,
  type AutoCheckinAccountSnapshot,
  type AutoCheckinPreferences,
  type AutoCheckinRetryState,
  type AutoCheckinRunCompletedRuntimeMessage,
  type AutoCheckinRunKind,
  type AutoCheckinRunResult,
  type AutoCheckinRunSummary,
  type AutoCheckinRunType,
  type AutoCheckinSkipReason,
  type AutoCheckinStatus,
  type CheckinAccountResult,
  type CheckinResultStatus,
} from "~/types/autoCheckin"
import type { CheckInExecutionSkipReason } from "~/types/checkIn"
import {
  getTaskNotificationStatusFromCounts,
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
} from "~/types/taskNotifications"
import {
  TEMP_WINDOW_REQUEST_SOURCES,
  type TempWindowRequestSource,
} from "~/types/tempWindowFetch"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
  isMessageReceiverUnavailableError,
  onAlarm,
  sendRuntimeMessage,
} from "~/utils/browser/browserApi"
import { normalizeTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { isDevelopmentMode, isTestMode } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import { AUTO_CHECKIN_STATUS_STORAGE_LOCK, autoCheckinStorage } from "./storage"

const logger = createLogger("AutoCheckin")

const isSuccessfulCheckinStatus = (status: CheckinResultStatus): boolean =>
  status === CHECKIN_RESULT_STATUS.SUCCESS ||
  status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED

const isFailedCheckinStatus = (status: CheckinResultStatus): boolean =>
  status === CHECKIN_RESULT_STATUS.FAILED

const isRetryableCheckinResult = (result: CheckinAccountResult): boolean => {
  if (!isFailedCheckinStatus(result.status)) return false
  // Persisted pre-contract failures have no flag; keep their historical retry
  // behavior while all newly produced failures write an explicit decision.
  if (result.retryable !== undefined) return result.retryable
  return true
}

const toSchedulerSkipReason = (
  reason: CheckInExecutionSkipReason,
): AutoCheckinSkipReason => {
  switch (reason) {
    case CHECK_IN_EXECUTION_SKIP_REASONS.AccountDisabled:
      return AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED
    case CHECK_IN_EXECUTION_SKIP_REASONS.GlobalAutomaticExecutionDisabled:
    case CHECK_IN_EXECUTION_SKIP_REASONS.AutomaticExecutionDisabled:
      return AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED
    case CHECK_IN_EXECUTION_SKIP_REASONS.AlreadyChecked:
      return AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY
    case CHECK_IN_EXECUTION_SKIP_REASONS.MethodDisabled:
      return AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED
    case CHECK_IN_EXECUTION_SKIP_REASONS.StatusUnavailable:
      return AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE
    case CHECK_IN_EXECUTION_SKIP_REASONS.NoProvider:
      return AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER
    case CHECK_IN_EXECUTION_SKIP_REASONS.AccountDataMissing:
      return AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DATA_MISSING
    case CHECK_IN_EXECUTION_SKIP_REASONS.AuthenticationRequired:
      return AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED
    case CHECK_IN_EXECUTION_SKIP_REASONS.CredentialsMissing:
      return AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING
    case CHECK_IN_EXECUTION_SKIP_REASONS.NetworkError:
      return AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR
    case CHECK_IN_EXECUTION_SKIP_REASONS.SourceUnavailable:
      return AUTO_CHECKIN_SKIP_REASON.SOURCE_UNAVAILABLE
    case CHECK_IN_EXECUTION_SKIP_REASONS.PermissionDenied:
      return AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED
    case CHECK_IN_EXECUTION_SKIP_REASONS.Timeout:
      return AUTO_CHECKIN_SKIP_REASON.TIMEOUT
    case CHECK_IN_EXECUTION_SKIP_REASONS.AccountUnavailable:
      return AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE
    case CHECK_IN_EXECUTION_SKIP_REASONS.NoSelectedMethod:
      return AUTO_CHECKIN_SKIP_REASON.NO_SELECTED_METHOD
    case CHECK_IN_EXECUTION_SKIP_REASONS.MethodUnavailable:
      return AUTO_CHECKIN_SKIP_REASON.METHOD_UNAVAILABLE
    case CHECK_IN_EXECUTION_SKIP_REASONS.MethodNotMatched:
      return AUTO_CHECKIN_SKIP_REASON.METHOD_NOT_MATCHED
    case CHECK_IN_EXECUTION_SKIP_REASONS.MethodUnsupported:
      return AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED
  }
}

const createAutomaticCheckinExecution = (
  trigger: (typeof PROTECTION_BYPASS_AUTOMATIC_TRIGGERS)[keyof typeof PROTECTION_BYPASS_AUTOMATIC_TRIGGERS],
  surface: TempWindowRequestSource,
) =>
  createAutomaticProtectionBypassExecution(
    PROTECTION_BYPASS_FEATURES.Checkin,
    trigger,
    surface,
  )

const isExpectedCheckinCommandExecution = (
  execution: unknown,
  expectedCommand: ProtectionBypassUserCommand,
): execution is Extract<
  ProtectionBypassExecution,
  { kind: typeof PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand }
> =>
  isProtectionBypassExecution(execution) &&
  execution.kind === PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand &&
  execution.command === expectedCommand

const isUiOpenCheckinExecution = (
  execution: unknown,
  surface: TempWindowRequestSource,
): execution is ProtectionBypassExecution =>
  isProtectionBypassExecution(execution) &&
  execution.kind === PROTECTION_BYPASS_EXECUTION_KINDS.Automatic &&
  execution.feature === PROTECTION_BYPASS_FEATURES.Checkin &&
  execution.trigger === PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle &&
  execution.surface === surface

/**
 * Reason codes describing why the UI-open pre-trigger is not eligible to run.
 *
 * These are intentionally stable, UI-safe strings so developers can diagnose issues
 * without relying on log scraping.
 */
type AutoCheckinUiOpenPretriggerIneligibleReason =
  | "alarms_api_unavailable"
  | "global_disabled"
  | "pretrigger_disabled"
  | "already_ran_today"
  | "daily_run_in_flight"
  | "invalid_time_window"
  | "outside_time_window"
  | "daily_alarm_missing"
  | "daily_alarm_not_today"

interface AutoCheckinUiOpenPretriggerDebugInfo {
  nowIso: string
  today: string
  windowStart: string
  windowEnd: string
  windowStartMinutes: number | null
  windowEndMinutes: number | null
  nowMinutes: number
  isWithinWindow: boolean | null
  lastDailyRunDay: string | null
  dailyRunInFlightDay: string | null
  dailyAlarmScheduledTime: number | null
  scheduledTargetDay: string | null
  storedTargetDay: string | null
  targetDay: string | null
}

interface AutoCheckinUiOpenPretriggerResult {
  /**
   * True only when the daily run was actually executed as a result of this call.
   * In `dryRun` mode, this will always be false.
   */
  started: boolean
  /**
   * True when the current state would allow the UI-open pre-trigger to run.
   * Useful for diagnostics; `started` may still be false when `dryRun` is true.
   */
  eligible: boolean
  /**
   * Present only when `eligible` is false.
   */
  ineligibleReason?: AutoCheckinUiOpenPretriggerIneligibleReason
  /**
   * Included only when `debug` is true.
   */
  debug?: AutoCheckinUiOpenPretriggerDebugInfo
  summary?: AutoCheckinRunSummary
  lastRunResult?: AutoCheckinRunResult
  pendingRetry?: boolean
}

interface AutoCheckinDailyTriggerPlan {
  triggerTime: Date
  enforceTodayTarget?: boolean
}

interface AutoCheckinDailyPlanningOptions {
  allowCatchUp?: boolean
}

const AUTO_CHECKIN_BACKGROUND_ANALYTICS_CONTEXT = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundAutoCheckinScheduler,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
} as const

type PostCheckinRefreshOutcome = "refreshed" | "unchanged" | "failed"

/**
 * Scheduler service for Auto Check-in
 *
 * Scheduling model:
 * - A dedicated *daily* alarm runs the normal auto check-in at most once per local day.
 * - A separate *retry* alarm retries only the accounts that failed in today's normal run.
 */
class AutoCheckinScheduler {
  /**
   * Post-checkin account refresh to ensure balances/quotas reflect the effect of a successful check-in.
   *
   * Notes:
   * - This MUST NOT invoke provider `checkIn` again; it uses the existing account refresh pipeline.
   * - Best-effort: failures are swallowed so check-in completion semantics are unchanged.
   * - API/page resources are limited by their owning lower layers.
   */
  private async refreshAccountsAfterSuccessfulCheckins(params: {
    accountIds: string[]
    force?: boolean
    tempWindowRequestSource?: TempWindowRequestSource
    protectionBypassExecution?: ProtectionBypassExecution
  }): Promise<void> {
    try {
      const uniqueAccountIds = Array.from(new Set(params.accountIds)).filter(
        (id) => typeof id === "string" && id.trim().length > 0,
      )

      if (uniqueAccountIds.length === 0) {
        return
      }

      let refreshedCount = 0
      let failedCount = 0

      const force = params.force ?? true
      const results = await Promise.all(
        uniqueAccountIds.map(
          async (accountId): Promise<PostCheckinRefreshOutcome> => {
            try {
              const result = params.tempWindowRequestSource
                ? await accountStorage.refreshAccount(accountId, force, {
                    tempWindowRequestSource: params.tempWindowRequestSource,
                    ...(params.protectionBypassExecution
                      ? {
                          protectionBypassExecution:
                            params.protectionBypassExecution,
                        }
                      : {}),
                  })
                : await accountStorage.refreshAccount(accountId, force)
              if (result?.refreshed === true) return "refreshed"
              if (result == null) return "failed"
              return "unchanged"
            } catch {
              return "failed"
            }
          },
        ),
      )

      for (const result of results) {
        if (result === "refreshed") {
          refreshedCount += 1
        } else if (result === "failed") {
          failedCount += 1
        }
      }

      logger.debug("Post-checkin refresh finished", {
        total: uniqueAccountIds.length,
        refreshedCount,
        failedCount,
      })
    } catch (error) {
      logger.warn("Post-checkin refresh failed", {
        error: getErrorMessage(error),
      })
    }
  }

  /**
   * Alarm naming / migration notes.
   *
   * We keep a legacy alarm name for backward compatibility, but clear it when scheduling
   * to avoid duplicate executions after upgrading.
   *
   * In the new model, daily scheduling and retry scheduling are separate alarms so that:
   * - the normal run executes at most once per local day
   * - retries never override/replace the next daily run schedule
   */

  /**
   * legacy single alarm name
   * @deprecated
   */
  private static readonly LEGACY_ALARM_NAME = "autoCheckin"
  private static readonly DAILY_ALARM_NAME = "autoCheckinDaily"
  private static readonly RETRY_ALARM_NAME = "autoCheckinRetry"
  private static readonly DETERMINISTIC_CATCH_UP_DELAY_MS = 60_000
  private isInitialized = false

  /**
   * In-flight guard to prevent duplicate daily runs for the same local day.
   *
   * This specifically protects against:
   * - multiple UI surfaces opening and triggering a pre-run simultaneously
   * - the daily alarm firing while a UI-triggered daily run is executing
   */
  private dailyRunInFlightDay: string | null = null
  private dailyRunInFlightPromise: Promise<void> | null = null

  /**
   * Best-effort broadcast so open UI surfaces can refresh after an execution completes.
   *
   * This notification MUST never crash the scheduler: UI pages may be closed or not listening.
   */
  private async notifyUiRunCompleted(params: {
    runKind: AutoCheckinRunKind
    updatedAccountIds: string[]
    summary?: AutoCheckinRunSummary
  }): Promise<void> {
    const message: AutoCheckinRunCompletedRuntimeMessage = {
      action: RuntimeActionIds.AutoCheckinRunCompleted,
      runKind: params.runKind,
      updatedAccountIds: params.updatedAccountIds,
      timestamp: Date.now(),
      summary: params.summary,
    }

    try {
      await sendRuntimeMessage(message, { maxAttempts: 1 })
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      // Ignore "no receiver" errors (popup/options closed). Log others for diagnostics.
      if (isMessageReceiverUnavailableError(error)) {
        logger.debug("Run-completed UI notification ignored (no receiver)", {
          runKind: message.runKind,
          error: errorMessage,
        })
        return
      }

      logger.warn("Run-completed UI notification failed", {
        runKind: message.runKind,
        error: errorMessage,
      })
    }
  }

  private getTaskNotificationStatus(successCount: number, failedCount: number) {
    return getTaskNotificationStatusFromCounts({
      successCount,
      failedCount,
    })
  }

  private async notifyScheduledRunResult(params: {
    successCount: number
    failedCount: number
    skippedCount: number
    total: number
  }) {
    await notifyTaskResult({
      task: TASK_NOTIFICATION_TASKS.AutoCheckin,
      status: this.getTaskNotificationStatus(
        params.successCount,
        params.failedCount,
      ),
      counts: {
        success: params.successCount,
        failed: params.failedCount,
        skipped: params.skippedCount,
        total: params.total,
      },
    })
  }

  /**
   * Returns the local calendar day string for the provided date.
   *
   * We intentionally use a local day boundary for scheduling/retry scoping so that
   * "once per day" matches user expectations around their configured time window.
   */
  private getLocalDay(date: Date = new Date()): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  /**
   * Add days using local calendar math (safe across DST changes).
   */
  private addLocalDays(date: Date, days: number): Date {
    const next = new Date(date)
    next.setDate(next.getDate() + days)
    return next
  }

  private startOfLocalDay(date: Date): Date {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      0,
      0,
      0,
      0,
    )
  }

  private parseTimeToMinutes(time: string): number | null {
    const [hourStr, minuteStr] = time.split(":")
    const hours = Number(hourStr)
    const minutes = Number(minuteStr)
    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null
    }
    return hours * 60 + minutes
  }

  private mapRunSummaryToProductAnalyticsResult(
    summary: Pick<
      AutoCheckinRunSummary,
      "executed" | "failedCount" | "skippedCount"
    >,
  ): ProductAnalyticsResult {
    if (summary.failedCount > 0) {
      return PRODUCT_ANALYTICS_RESULTS.Failure
    }
    if (summary.executed === 0) {
      return PRODUCT_ANALYTICS_RESULTS.Skipped
    }
    return PRODUCT_ANALYTICS_RESULTS.Success
  }

  private trackBackgroundAutoCheckinCompleted(params: {
    summary: AutoCheckinRunSummary
    durationMs: number
    mode: (typeof PRODUCT_ANALYTICS_MODE_IDS)[keyof typeof PRODUCT_ANALYTICS_MODE_IDS]
    retryAttempted?: boolean
    retryCount?: number
  }) {
    const result = this.mapRunSummaryToProductAnalyticsResult(params.summary)

    void trackProductAnalyticsActionCompleted({
      ...AUTO_CHECKIN_BACKGROUND_ANALYTICS_CONTEXT,
      result,
      durationMs: params.durationMs,
      diagnostics: buildAutoCheckinDiagnostics({
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Auto,
        mode: params.mode,
        summary: params.summary,
        backgroundExecution: true,
        ...(typeof params.retryAttempted === "boolean"
          ? { retryAttempted: params.retryAttempted }
          : {}),
        ...(typeof params.retryCount === "number"
          ? { retryCount: params.retryCount }
          : {}),
      }),
    })
  }

  private trackBackgroundAutoCheckinRunAnalytics(params: {
    runKind: AutoCheckinRunKind
    snapshots: AutoCheckinAccountSnapshot[]
    accounts: SiteAccount[]
    retryEnabled: boolean
    retryPendingBefore: number
    retryAttempted: number
    retryRescued: number
    retryPendingAfter: number
    retryExhausted: number
  }) {
    trackAutoCheckinRunAnalytics({
      runKind: params.runKind,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
      snapshots: params.snapshots,
      accountsById: new Map(
        params.accounts.map((account) => [
          account.id,
          { authType: account.authType },
        ]),
      ),
      retryEnabled: params.retryEnabled,
      retryPendingBefore: params.retryPendingBefore,
      retryAttempted: params.retryAttempted,
      retryRescued: params.retryRescued,
      retryPendingAfter: params.retryPendingAfter,
      retryExhausted: params.retryExhausted,
    })
  }

  private isMinutesWithinWindow(
    minutes: number,
    windowStart: number,
    windowEnd: number,
  ): boolean {
    if (windowStart === windowEnd) {
      return false
    }

    if (windowStart < windowEnd) {
      return minutes >= windowStart && minutes <= windowEnd
    }

    // Window crosses midnight
    return minutes >= windowStart || minutes <= windowEnd
  }

  private calculateDeterministicTriggerForDay(
    config: AutoCheckinPreferences,
    day: Date,
  ): Date | null {
    const deterministicMinutes = this.parseTimeToMinutes(
      config.deterministicTime || config.windowStart,
    )
    const windowStartMinutes = this.parseTimeToMinutes(config.windowStart)
    const windowEndMinutes = this.parseTimeToMinutes(config.windowEnd)

    if (
      deterministicMinutes === null ||
      windowStartMinutes === null ||
      windowEndMinutes === null
    ) {
      return null
    }

    if (
      !this.isMinutesWithinWindow(
        deterministicMinutes,
        windowStartMinutes,
        windowEndMinutes,
      )
    ) {
      return null
    }

    const target = new Date(day)
    target.setHours(
      Math.floor(deterministicMinutes / 60),
      deterministicMinutes % 60,
      0,
      0,
    )

    return target
  }

  private calculateDeterministicCatchUpTrigger(now: Date): Date | null {
    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)

    const desiredWhen = Math.min(
      now.getTime() + AutoCheckinScheduler.DETERMINISTIC_CATCH_UP_DELAY_MS,
      endOfToday.getTime(),
    )

    if (desiredWhen <= now.getTime()) {
      return null
    }

    return new Date(desiredWhen)
  }

  private calculateRandomTrigger(
    windowStart: string,
    windowEnd: string,
    now: Date,
  ): Date {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [startHour, startMinute] = windowStart.split(":").map(Number)
    const [endHour, endMinute] = windowEnd.split(":").map(Number)

    const windowStartTime = new Date(today)
    windowStartTime.setHours(startHour, startMinute, 0, 0)

    const windowEndTime = new Date(today)
    windowEndTime.setHours(endHour, endMinute, 0, 0)

    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const windowEndMinutes = endHour * 60 + endMinute
    if (windowEndTime <= windowStartTime) {
      windowEndTime.setDate(windowEndTime.getDate() + 1)
      if (
        now < windowStartTime &&
        (endHour !== startHour || endMinute !== startMinute) &&
        nowMinutes <= windowEndMinutes
      ) {
        windowStartTime.setDate(windowStartTime.getDate() - 1)
        windowEndTime.setDate(windowEndTime.getDate() - 1)
      }
    }

    if (now >= windowEndTime) {
      windowStartTime.setDate(windowStartTime.getDate() + 1)
      windowEndTime.setDate(windowEndTime.getDate() + 1)
    } else if (now < windowStartTime) {
      // use today's window as-is
    } else {
      windowStartTime.setTime(now.getTime())
    }

    const windowDuration = windowEndTime.getTime() - windowStartTime.getTime()
    const randomOffset =
      windowDuration <= 0 ? 0 : Math.random() * windowDuration
    return new Date(windowStartTime.getTime() + randomOffset)
  }

  private calculateRandomTriggerForDay(
    windowStart: string,
    windowEnd: string,
    day: Date,
  ): Date | null {
    const [startHour, startMinute] = windowStart.split(":").map(Number)
    const [endHour, endMinute] = windowEnd.split(":").map(Number)

    if (
      [startHour, startMinute, endHour, endMinute].some((value) =>
        Number.isNaN(value),
      )
    ) {
      return null
    }

    const windowStartTime = new Date(day)
    windowStartTime.setHours(startHour, startMinute, 0, 0)

    const windowEndTime = new Date(day)
    windowEndTime.setHours(endHour, endMinute, 0, 0)
    if (windowEndTime <= windowStartTime) {
      windowEndTime.setDate(windowEndTime.getDate() + 1)
    }

    const windowDuration = windowEndTime.getTime() - windowStartTime.getTime()
    const randomOffset =
      windowDuration <= 0 ? 0 : Math.random() * windowDuration
    return new Date(windowStartTime.getTime() + randomOffset)
  }

  /**
   * Compute the next trigger time for the *daily* (normal) auto check-in.
   *
   * Rules:
   * - If the daily run already executed today, schedule within tomorrow's window.
   * - Deterministic mode schedules the configured deterministic time (fallback: window start).
   * - Random mode picks one random time inside the target day's window.
   */
  private computeNextDailyTriggerPlan(
    config: AutoCheckinPreferences,
    status: AutoCheckinStatus | null,
    now: Date,
    planningOptions?: AutoCheckinDailyPlanningOptions,
  ): AutoCheckinDailyTriggerPlan | null {
    const today = this.getLocalDay(now)
    const ranToday = status?.lastDailyRunDay === today
    const windowStartMinutes = this.parseTimeToMinutes(config.windowStart)
    const windowEndMinutes = this.parseTimeToMinutes(config.windowEnd)
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const isWithinWindow =
      windowStartMinutes !== null &&
      windowEndMinutes !== null &&
      this.isMinutesWithinWindow(
        nowMinutes,
        windowStartMinutes,
        windowEndMinutes,
      )
    const allowCatchUp = planningOptions?.allowCatchUp === true

    if (config.scheduleMode === AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC) {
      if (ranToday) {
        const tomorrowTrigger = this.calculateDeterministicTriggerForDay(
          config,
          this.addLocalDays(now, 1),
        )
        if (tomorrowTrigger) {
          return { triggerTime: tomorrowTrigger }
        }
      } else {
        const todayTrigger = this.calculateDeterministicTriggerForDay(
          config,
          now,
        )
        if (todayTrigger) {
          if (todayTrigger > now) {
            return { triggerTime: todayTrigger }
          }

          if (allowCatchUp && isWithinWindow) {
            const catchUpTrigger =
              this.calculateDeterministicCatchUpTrigger(now)
            if (catchUpTrigger) {
              return {
                triggerTime: catchUpTrigger,
                enforceTodayTarget: true,
              }
            }
          }

          const tomorrowTrigger = this.calculateDeterministicTriggerForDay(
            config,
            this.addLocalDays(now, 1),
          )
          if (tomorrowTrigger) {
            return { triggerTime: tomorrowTrigger }
          }
        }
      }
    }

    if (ranToday) {
      const tomorrowStart = this.startOfLocalDay(this.addLocalDays(now, 1))
      const tomorrowTrigger = this.calculateRandomTriggerForDay(
        config.windowStart,
        config.windowEnd,
        tomorrowStart,
      )
      return tomorrowTrigger ? { triggerTime: tomorrowTrigger } : null
    }

    return {
      triggerTime: this.calculateRandomTrigger(
        config.windowStart,
        config.windowEnd,
        now,
      ),
    }
  }

  private async syncDailyScheduleStatus(
    currentStatus: AutoCheckinStatus | null,
    scheduledTime: Date,
    targetDay = this.getLocalDay(scheduledTime),
  ) {
    const scheduledIso = scheduledTime.toISOString()

    await withExtensionStorageWriteLock(
      AUTO_CHECKIN_STATUS_STORAGE_LOCK,
      async () => {
        const latestStatus =
          (await autoCheckinStorage.getStatus()) ?? currentStatus ?? {}

        await autoCheckinStorage.saveStatus({
          ...latestStatus,
          nextDailyScheduledAt: scheduledIso,
          dailyAlarmTargetDay: targetDay,
          nextScheduledAt: scheduledIso, // legacy compatibility
        })
      },
    )
  }

  private async clearDailyScheduleStatus(
    currentStatus: AutoCheckinStatus | null,
  ) {
    await withExtensionStorageWriteLock(
      AUTO_CHECKIN_STATUS_STORAGE_LOCK,
      async () => {
        const latestStatus =
          (await autoCheckinStorage.getStatus()) ?? currentStatus ?? {}

        await autoCheckinStorage.saveStatus({
          ...latestStatus,
          nextDailyScheduledAt: undefined,
          dailyAlarmTargetDay: undefined,
          nextScheduledAt: undefined,
        })
      },
    )
  }

  private isExistingDailyAlarmReusable(
    config: AutoCheckinPreferences,
    scheduledTime: Date,
    nextTriggerPlan: AutoCheckinDailyTriggerPlan | null,
  ): boolean {
    if (Number.isNaN(scheduledTime.getTime()) || !nextTriggerPlan) {
      return false
    }

    if (config.scheduleMode !== AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC) {
      return true
    }

    if (nextTriggerPlan.enforceTodayTarget) {
      return (
        this.getLocalDay(scheduledTime) ===
          this.getLocalDay(nextTriggerPlan.triggerTime) &&
        scheduledTime.getTime() <= nextTriggerPlan.triggerTime.getTime()
      )
    }

    return (
      this.getLocalDay(scheduledTime) ===
        this.getLocalDay(nextTriggerPlan.triggerTime) &&
      scheduledTime.getHours() === nextTriggerPlan.triggerTime.getHours() &&
      scheduledTime.getMinutes() === nextTriggerPlan.triggerTime.getMinutes()
    )
  }

  private async createDailyAlarmForToday(desiredWhen: number): Promise<Date> {
    const now = new Date()
    const today = this.getLocalDay(now)
    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)

    let nextWhen = desiredWhen
    if (nextWhen > endOfToday.getTime()) {
      nextWhen = endOfToday.getTime()
    }

    if (nextWhen <= now.getTime()) {
      throw new Error(
        "[AutoCheckin] Cannot schedule daily alarm for today (too close to day boundary)",
      )
    }

    await createAlarm(AutoCheckinScheduler.DAILY_ALARM_NAME, {
      when: nextWhen,
    })

    let alarm = await getAlarm(AutoCheckinScheduler.DAILY_ALARM_NAME)
    let scheduledWhen = alarm?.scheduledTime ?? nextWhen
    let scheduledDay = this.getLocalDay(new Date(scheduledWhen))

    if (scheduledDay !== today) {
      const fallbackWhen = endOfToday.getTime()
      if (fallbackWhen <= now.getTime()) {
        throw new Error(
          "[AutoCheckin] Cannot schedule daily alarm for today (end-of-day already passed)",
        )
      }

      await createAlarm(AutoCheckinScheduler.DAILY_ALARM_NAME, {
        when: fallbackWhen,
      })
      alarm = await getAlarm(AutoCheckinScheduler.DAILY_ALARM_NAME)
      scheduledWhen = alarm?.scheduledTime ?? fallbackWhen
      scheduledDay = this.getLocalDay(new Date(scheduledWhen))
    }

    if (scheduledDay !== today) {
      throw new Error(
        `[AutoCheckin] Failed to schedule daily alarm for today (scheduledDay=${scheduledDay}, today=${today})`,
      )
    }

    return new Date(scheduledWhen)
  }

  private recalculateSummaryFromResults(
    perAccount: Record<string, CheckinAccountResult>,
    previousSummary?: AutoCheckinRunSummary,
  ): AutoCheckinRunSummary {
    const values = Object.values(perAccount)
    const successCount = values.filter((value) =>
      isSuccessfulCheckinStatus(value.status),
    ).length
    const failedCount = values.filter((value) =>
      isFailedCheckinStatus(value.status),
    ).length
    const skippedCount = values.filter(
      (value) => value.status === CHECKIN_RESULT_STATUS.SKIPPED,
    ).length
    const uncertainCount = values.filter(
      (value) => value.status === CHECKIN_RESULT_STATUS.UNCERTAIN,
    ).length

    const executed = successCount + failedCount + uncertainCount
    const totalEligible =
      previousSummary?.totalEligible ?? executed + skippedCount

    return {
      totalEligible,
      executed,
      successCount,
      failedCount,
      skippedCount,
      ...(uncertainCount > 0 ? { uncertainCount } : {}),
      needsRetry: values.some(isRetryableCheckinResult),
    }
  }

  private updateSnapshotWithResult(
    snapshots: AutoCheckinAccountSnapshot[] | undefined,
    result: CheckinAccountResult,
  ): AutoCheckinAccountSnapshot[] | undefined {
    if (!snapshots || snapshots.length === 0) {
      return snapshots
    }

    let updated = false
    const nextSnapshots = snapshots.map((snapshot) => {
      if (snapshot.accountId !== result.accountId) {
        return snapshot
      }
      updated = true
      return {
        ...snapshot,
        lastResult: result,
      }
    })

    return updated ? nextSnapshots : snapshots
  }

  private buildAccountSnapshot(
    account: SiteAccount,
    accountName: string,
  ): AutoCheckinAccountSnapshot {
    const compatibility = inspectSelectedCheckInCompatibility({
      account,
      // This helper is called only after the scheduler's global/manual gate.
      globalAutomaticExecutionEnabled: true,
    })
    const selectionState = compatibility.state.selectionState
    const detectionEnabled =
      selectionState.status === CHECK_IN_SELECTION_STATUSES.Selected
    const autoCheckinEnabled = account.checkIn.automaticExecutionEnabled
    const selectedStatus = getSelectedCheckInStatus({
      config: account.checkIn,
      siteType: account.site_type,
    })

    const executionEligibility = compatibility.state.executionEligibility
    let skipReason: AutoCheckinSkipReason | undefined =
      executionEligibility.eligible === false
        ? toSchedulerSkipReason(executionEligibility.skipReason)
        : undefined

    const providerAvailable = compatibility.providerAvailable
    if (!skipReason && !providerAvailable) {
      skipReason =
        compatibility.providerReadiness?.ready === false
          ? toSchedulerSkipReason(compatibility.providerReadiness.reason)
          : AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER
    }

    return {
      accountId: account.id,
      accountName,
      siteType: account.site_type,
      detectionEnabled,
      autoCheckinEnabled,
      providerAvailable,
      // Display-only field: DO NOT use this for eligibility decisions (provider outcomes are the source of truth).
      isCheckedInToday:
        selectedStatus?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known
          ? selectedStatus.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked
          : undefined,
      lastCheckInDate:
        selectedStatus?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known &&
        selectedStatus.evidence.source ===
          CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.LegacyMigration
          ? selectedStatus.evidence.legacyDayKey
          : undefined,
      skipReason,
    }
  }

  private attachResultsToSnapshots(
    snapshots: AutoCheckinAccountSnapshot[],
    results: Record<string, CheckinAccountResult>,
  ): AutoCheckinAccountSnapshot[] {
    return snapshots.map((snapshot) => ({
      ...snapshot,
      lastResult: results[snapshot.accountId],
    }))
  }

  private buildAnalyticsSnapshots(
    accounts: SiteAccount[],
    accountDisplayNameById: Map<string, string>,
    results: Record<string, CheckinAccountResult>,
  ): AutoCheckinAccountSnapshot[] {
    return this.attachResultsToSnapshots(
      accounts.map((account) =>
        this.buildAccountSnapshot(
          account,
          accountDisplayNameById.get(account.id) ?? account.id,
        ),
      ),
      results,
    )
  }

  /**
   * Execute provider check-in for a single account and normalize the result.
   *
   * Notes:
   * - Provider `already_checked` is treated as a successful outcome (and should not enter retries).
   * - We mark the account as checked-in only for successful outcomes to keep local status fresh.
   */
  private async runAccountCheckin(
    account: SiteAccount,
    accountName: string,
    tempWindowRequestSource: TempWindowRequestSource,
    protectionBypassExecution: ProtectionBypassExecution,
    requireStatusConfirmationBeforeMutation = false,
  ): Promise<{
    result: CheckinAccountResult
  }> {
    const buildResult = (
      status: CheckinResultStatus,
      partial?: Partial<
        Pick<
          CheckinAccountResult,
          | "message"
          | "messageKey"
          | "messageParams"
          | "rawMessage"
          | "reasonCode"
          | "retryable"
          | "methodId"
          | "reconciliation"
          | "accountStateDurability"
        >
      >,
    ): CheckinAccountResult =>
      ({
        accountId: account.id,
        accountName,
        status,
        ...(partial ?? {}),
        timestamp: Date.now(),
      }) as CheckinAccountResult

    try {
      const execution = await executeSelectedCheckIn({
        account,
        // This helper is called only after the scheduler's global/manual gate.
        globalAutomaticExecutionEnabled: true,
        context: {
          tempWindowRequestSource,
          protectionBypassExecution,
        },
        revalidateAccount: (refreshedConfig) =>
          accountStorage.prepareAccountForSelectedCheckIn(
            account.id,
            refreshedConfig,
          ),
        requireStatusConfirmationBeforeMutation,
      })
      if (execution.kind === CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped) {
        const reasonCode = toSchedulerSkipReason(execution.reason)
        const retryablePreMutationFailure = execution.retryable === true
        return {
          result: buildResult(
            retryablePreMutationFailure
              ? CHECKIN_RESULT_STATUS.FAILED
              : CHECKIN_RESULT_STATUS.SKIPPED,
            {
              messageKey: getAutoCheckinSkipReasonTranslationKey(reasonCode),
              reasonCode,
              ...(retryablePreMutationFailure ? { retryable: true } : {}),
            },
          ),
        }
      }
      const providerResult = execution.result
      const result = buildResult(providerResult.status, {
        messageKey: providerResult.messageKey,
        messageParams: providerResult.messageParams,
        rawMessage: providerResult.rawMessage,
        reasonCode: providerResult.reasonCode,
        methodId: execution.methodId,
        reconciliation: providerResult.reconciliation,
        ...(providerResult.status === CHECKIN_RESULT_STATUS.FAILED
          ? { retryable: execution.retryable }
          : {}),
      })

      if (
        providerResult.status === CHECKIN_RESULT_STATUS.SUCCESS ||
        providerResult.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED
      ) {
        const persisted = await accountStorage.markAccountAsSiteCheckedIn(
          account.id,
        )
        result.accountStateDurability =
          persisted === false
            ? CHECKIN_ACCOUNT_STATE_DURABILITY.FAILED
            : CHECKIN_ACCOUNT_STATE_DURABILITY.PERSISTED
        logger.info("Check-in completed", {
          accountId: account.id,
          siteName: account.site_name,
          status: providerResult.status,
          message: providerResult.rawMessage ?? providerResult.messageKey ?? "",
        })
        return { result }
      }

      logger.warn("Check-in failed", {
        accountId: account.id,
        siteName: account.site_name,
        status: providerResult.status,
        message: providerResult.rawMessage ?? providerResult.messageKey ?? "",
      })
      return { result }
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      const normalizedError = resolveProviderErrorResult({ error })
      logger.error("Check-in error", {
        accountId: account.id,
        siteName: account.site_name,
        error: errorMessage,
      })
      return {
        result: buildResult(normalizedError.status, {
          messageKey: normalizedError.messageKey,
          messageParams: normalizedError.messageParams,
          rawMessage: normalizedError.rawMessage,
          reasonCode: normalizedError.reasonCode,
          ...(normalizedError.status === CHECKIN_RESULT_STATUS.FAILED
            ? { retryable: false }
            : {}),
        }),
      }
    }
  }

  private async runAccountCheckins(params: {
    accounts: SiteAccount[]
    accountDisplayNameById: Map<string, string>
    tempWindowRequestSource: TempWindowRequestSource
    protectionBypassExecution: ProtectionBypassExecution
  }): Promise<
    Array<{
      result: CheckinAccountResult
    }>
  > {
    return Promise.all(
      params.accounts.map(async (account) => {
        const accountName =
          params.accountDisplayNameById.get(account.id) ?? account.id
        try {
          return await this.runAccountCheckin(
            account,
            accountName,
            params.tempWindowRequestSource,
            params.protectionBypassExecution,
          )
        } catch (error) {
          return {
            result: {
              accountId: account.id,
              accountName,
              status: CHECKIN_RESULT_STATUS.FAILED,
              rawMessage: getErrorMessage(error),
              retryable: false,
              timestamp: Date.now(),
            },
          }
        }
      }),
    )
  }

  /**
   * Initialize the scheduler
   *
   * Idempotent: installs alarm listener and restores alarms when supported.
   */
  async initialize() {
    if (this.isInitialized) {
      logger.debug("Scheduler already initialized")
      return
    }

    try {
      // Set up alarm listener (if supported)
      if (hasAlarmsAPI()) {
        onAlarm(async (alarm) => {
          if (alarm.name === AutoCheckinScheduler.DAILY_ALARM_NAME) {
            // Await to keep the MV3 service worker alive for the full daily run.
            try {
              await this.handleDailyAlarm(
                alarm,
                TEMP_WINDOW_REQUEST_SOURCES.Background,
                createAutomaticCheckinExecution(
                  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
                  TEMP_WINDOW_REQUEST_SOURCES.Background,
                ),
              )
            } catch (error) {
              logger.error("Daily alarm execution failed", error)
            }
            return
          }

          if (alarm.name === AutoCheckinScheduler.RETRY_ALARM_NAME) {
            // Await to keep the MV3 service worker alive for the full retry run.
            try {
              await this.handleRetryAlarm(alarm)
            } catch (error) {
              logger.error("Retry alarm execution failed", error)
            }
            return
          }

          if (alarm.name === AutoCheckinScheduler.LEGACY_ALARM_NAME) {
            logger.warn(
              "Legacy alarm detected; clearing and restoring daily schedule",
            )
            try {
              await this.scheduleNextRun({ allowCatchUp: true })
            } catch (error) {
              logger.error("Failed to restore schedule", error)
            }
          }
        })

        await this.scheduleNextRun({
          preserveExisting: true,
          allowCatchUp: true,
        })
      } else {
        logger.warn("Alarms API not available, automatic check-in disabled")
      }

      this.isInitialized = true
      logger.info("Scheduler initialized")
    } catch (error) {
      logger.error("Failed to initialize scheduler", error)
    }
  }

  /**
   * Restore/schedule daily + retry alarms.
   *
   * When `preserveExisting` is true we reuse any surviving alarms to avoid
   * re-randomizing on background restarts, only recreating missing alarms.
   */
  async scheduleNextRun(options?: {
    preserveExisting?: boolean
    allowCatchUp?: boolean
  }) {
    if (!hasAlarmsAPI()) {
      logger.warn("Alarms API not supported, cannot schedule")
      return
    }

    const prefs = await userPreferences.getPreferences()
    const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
    const currentStatus = await autoCheckinStorage.getStatus()
    trackAutoCheckinConfigSnapshot(
      config,
      PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    )

    // Always remove the legacy single-alarm schedule to prevent duplicate executions.
    await clearAlarm(AutoCheckinScheduler.LEGACY_ALARM_NAME)

    if (!config.globalEnabled) {
      await clearAlarm(AutoCheckinScheduler.DAILY_ALARM_NAME)
      await clearAlarm(AutoCheckinScheduler.RETRY_ALARM_NAME)
      logger.info("Auto check-in disabled; alarms cleared")
      await autoCheckinStorage.saveStatus({
        ...(currentStatus ?? {}),
        nextDailyScheduledAt: undefined,
        dailyAlarmTargetDay: undefined,
        nextRetryScheduledAt: undefined,
        retryAlarmTargetDay: undefined,
        retryState: undefined,
        pendingRetry: false,
        nextScheduledAt: undefined,
      })
      return
    }

    await this.scheduleDailyAlarm(config, options)
    await this.scheduleRetryAlarm(config, options)
  }

  /**
   * Schedule the normal daily alarm (once per day) and persist the next schedule.
   *
   * When `preserveExisting` is true we reuse any surviving alarm to avoid
   * re-randomizing on background restarts, only recreating the alarm if missing.
   */
  private async scheduleDailyAlarm(
    config: AutoCheckinPreferences,
    options?: { preserveExisting?: boolean; allowCatchUp?: boolean },
  ) {
    const currentStatus = await autoCheckinStorage.getStatus()
    const now = new Date()
    const nextTriggerPlan = this.computeNextDailyTriggerPlan(
      config,
      currentStatus,
      now,
      { allowCatchUp: options?.allowCatchUp },
    )
    const existingAlarm = options?.preserveExisting
      ? await getAlarm(AutoCheckinScheduler.DAILY_ALARM_NAME)
      : undefined

    if (options?.preserveExisting && existingAlarm?.scheduledTime) {
      const scheduledTime = new Date(existingAlarm.scheduledTime)
      const scheduledIso = scheduledTime.toISOString()
      const targetDay = this.getLocalDay(scheduledTime)

      if (
        !this.isExistingDailyAlarmReusable(
          config,
          scheduledTime,
          nextTriggerPlan,
        )
      ) {
        logger.warn(
          "Existing daily alarm no longer matches scheduler state; recreating",
          {
            scheduledTime,
            expectedTriggerTime: nextTriggerPlan?.triggerTime,
          },
        )
      } else if (
        currentStatus?.nextDailyScheduledAt !== scheduledIso ||
        currentStatus?.dailyAlarmTargetDay !== targetDay ||
        currentStatus?.nextScheduledAt !== scheduledIso
      ) {
        await this.syncDailyScheduleStatus(
          currentStatus,
          scheduledTime,
          targetDay,
        )
        logger.debug("Synced stored daily schedule with existing alarm")
        return
      } else {
        return
      }
    }

    if (options?.preserveExisting) {
      logger.warn("Daily alarm missing on startup; restoring")
    }

    await clearAlarm(AutoCheckinScheduler.DAILY_ALARM_NAME)

    if (
      !nextTriggerPlan ||
      Number.isNaN(nextTriggerPlan.triggerTime.getTime())
    ) {
      logger.warn("Invalid schedule configuration; daily alarm not scheduled")
      await this.clearDailyScheduleStatus(currentStatus)
      return
    }

    try {
      const scheduledTime = nextTriggerPlan.enforceTodayTarget
        ? await this.createDailyAlarmForToday(
            nextTriggerPlan.triggerTime.getTime(),
          )
        : await (async () => {
            await createAlarm(AutoCheckinScheduler.DAILY_ALARM_NAME, {
              when: nextTriggerPlan.triggerTime.getTime(),
            })

            const alarm = await getAlarm(AutoCheckinScheduler.DAILY_ALARM_NAME)
            return alarm?.scheduledTime != null
              ? new Date(alarm.scheduledTime)
              : nextTriggerPlan.triggerTime
          })()

      await this.syncDailyScheduleStatus(currentStatus, scheduledTime)

      logger.info("Daily alarm scheduled", {
        name: AutoCheckinScheduler.DAILY_ALARM_NAME,
        scheduledTime,
      })
    } catch (error) {
      logger.error("Failed to create daily alarm", error)
      await this.clearDailyScheduleStatus(currentStatus)
    }
  }

  /**
   * Clear retry alarm + any persisted retry state.
   */
  private async clearRetryAlarmAndState(
    currentStatus: AutoCheckinStatus | null,
  ) {
    await clearAlarm(AutoCheckinScheduler.RETRY_ALARM_NAME)

    if (!currentStatus) {
      return
    }

    await autoCheckinStorage.saveStatus({
      ...currentStatus,
      nextRetryScheduledAt: undefined,
      retryAlarmTargetDay: undefined,
      retryState: undefined,
      pendingRetry: false,
    })
  }

  /**
   * Compute the next retry trigger time.
   *
   * We use `status.lastRunAt` as the base to avoid bunching retries too closely when multiple
   * status updates happen quickly, then add `retryStrategy.intervalMinutes`.
   *
   * Returns a short fallback delay when inputs are missing/invalid.
   */
  private computeNextRetryTriggerTime(
    config: AutoCheckinPreferences,
    status: AutoCheckinStatus | null,
    now: Date,
  ): Date {
    const intervalMinutes = Math.max(
      0,
      config.retryStrategy?.intervalMinutes ?? 0,
    )
    const intervalMs = intervalMinutes * 60 * 1000

    const lastRunMs =
      status?.lastRunAt != null
        ? new Date(status.lastRunAt).getTime()
        : now.getTime()
    const baseMs = Number.isFinite(lastRunMs) ? lastRunMs : now.getTime()
    const candidate = new Date(baseMs + intervalMs)

    if (Number.isNaN(candidate.getTime()) || candidate <= now) {
      return new Date(now.getTime() + 15 * 1000)
    }

    return candidate
  }

  /**
   * Schedule the retry alarm and persist the next retry schedule.
   *
   * Invariants:
   * - Retries are scoped to the same local day as the normal run.
   * - Scheduling retries MUST NOT override the daily alarm schedule.
   */
  private async scheduleRetryAlarm(
    config: AutoCheckinPreferences,
    options?: { preserveExisting?: boolean },
  ) {
    const currentStatus = await autoCheckinStorage.getStatus()
    const now = new Date()
    const today = this.getLocalDay(now)

    if (!config.retryStrategy?.enabled) {
      await this.clearRetryAlarmAndState(currentStatus)
      return
    }

    // Retry runs only after today's normal run and never carry over to another day.
    if (
      currentStatus?.lastDailyRunDay !== today ||
      currentStatus?.retryState?.day !== today
    ) {
      await this.clearRetryAlarmAndState(currentStatus)
      return
    }

    const retryState = currentStatus.retryState
    if (!retryState || retryState.pendingAccountIds.length === 0) {
      await this.clearRetryAlarmAndState(currentStatus)
      return
    }

    const maxAttempts = config.retryStrategy.maxAttemptsPerDay
    const eligiblePending = retryState.pendingAccountIds.filter((accountId) => {
      const attempts = retryState.attemptsByAccount?.[accountId] ?? 1
      return attempts < maxAttempts
    })

    if (eligiblePending.length === 0) {
      await this.clearRetryAlarmAndState(currentStatus)
      return
    }

    const existingAlarm = options?.preserveExisting
      ? await getAlarm(AutoCheckinScheduler.RETRY_ALARM_NAME)
      : undefined

    if (options?.preserveExisting && existingAlarm?.scheduledTime) {
      const scheduledTime = new Date(existingAlarm.scheduledTime)
      const scheduledIso = scheduledTime.toISOString()
      const targetDay = this.getLocalDay(scheduledTime)

      // If the preserved alarm targets a different day, treat it as stale and clear it.
      if (targetDay !== today) {
        await this.clearRetryAlarmAndState(currentStatus)
        return
      }

      if (
        currentStatus?.nextRetryScheduledAt !== scheduledIso ||
        currentStatus?.retryAlarmTargetDay !== targetDay ||
        currentStatus?.pendingRetry !== true
      ) {
        await autoCheckinStorage.saveStatus({
          ...(currentStatus ?? {}),
          nextRetryScheduledAt: scheduledIso,
          retryAlarmTargetDay: targetDay,
          retryState: {
            ...retryState,
            pendingAccountIds: eligiblePending,
            attemptsByAccount: Object.fromEntries(
              eligiblePending.map((id) => [
                id,
                retryState.attemptsByAccount?.[id] ?? 1,
              ]),
            ),
          },
          pendingRetry: true,
        })
        logger.debug("Synced stored retry schedule with existing alarm")
      }
      return
    }

    if (options?.preserveExisting) {
      logger.warn("Retry alarm missing on startup; restoring")
    }

    await clearAlarm(AutoCheckinScheduler.RETRY_ALARM_NAME)

    const nextRetryTime = this.computeNextRetryTriggerTime(
      config,
      currentStatus,
      now,
    )
    const retryTargetDay = this.getLocalDay(nextRetryTime)

    // Do not schedule retries across the day boundary.
    if (retryTargetDay !== today) {
      await this.clearRetryAlarmAndState(currentStatus)
      return
    }

    try {
      await createAlarm(AutoCheckinScheduler.RETRY_ALARM_NAME, {
        when: nextRetryTime.getTime(),
      })

      const alarm = await getAlarm(AutoCheckinScheduler.RETRY_ALARM_NAME)
      const scheduledTime =
        alarm?.scheduledTime != null ? new Date(alarm.scheduledTime) : null

      const scheduledIso = (scheduledTime ?? nextRetryTime).toISOString()
      const targetDay = this.getLocalDay(scheduledTime ?? nextRetryTime)

      await autoCheckinStorage.saveStatus({
        ...(currentStatus ?? {}),
        nextRetryScheduledAt: scheduledIso,
        retryAlarmTargetDay: targetDay,
        retryState: {
          ...retryState,
          pendingAccountIds: eligiblePending,
          attemptsByAccount: Object.fromEntries(
            eligiblePending.map((id) => [
              id,
              retryState.attemptsByAccount?.[id] ?? 1,
            ]),
          ),
        },
        pendingRetry: true,
      })

      logger.info("Retry alarm scheduled", {
        name: AutoCheckinScheduler.RETRY_ALARM_NAME,
        scheduledTime: scheduledTime ?? nextRetryTime,
      })
    } catch (error) {
      logger.error("Failed to create retry alarm", error)
    }
  }

  /**
   * Normal (daily) alarm handler.
   *
   * Runs a normal check-in execution at most once per day and then schedules:
   * - the next daily run for the next day window
   * - any required retry alarm (without overriding the daily schedule)
   */
  private async handleDailyAlarm(
    alarm: browser.alarms.Alarm,
    tempWindowRequestSource: TempWindowRequestSource,
    protectionBypassExecution: ProtectionBypassExecution,
  ) {
    const now = new Date()
    const today = this.getLocalDay(now)

    if (this.dailyRunInFlightDay === today && this.dailyRunInFlightPromise) {
      logger.warn("Daily run already in-flight; ignoring trigger")
      return
    }

    const runPromise = (async () => {
      const currentStatus = await autoCheckinStorage.getStatus()
      const targetDay =
        currentStatus?.dailyAlarmTargetDay ??
        (alarm.scheduledTime != null
          ? this.getLocalDay(new Date(alarm.scheduledTime))
          : undefined)

      // Stale-alarm guard: never execute a normal run for a past day.
      if (targetDay && targetDay !== today) {
        logger.warn("Ignoring stale daily alarm", {
          targetDay,
          today,
        })
        await this.scheduleNextRun()
        return
      }

      logger.info("Daily alarm triggered; starting check-in execution")
      try {
        await this.runCheckins({
          runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
          tempWindowRequestSource,
          protectionBypassExecution,
        })
      } catch (error) {
        logger.error("Error during daily check-in execution", error)
      } finally {
        await this.scheduleNextRun()
      }
    })()

    this.dailyRunInFlightDay = today
    this.dailyRunInFlightPromise = runPromise

    try {
      await runPromise
    } finally {
      if (this.dailyRunInFlightPromise === runPromise) {
        this.dailyRunInFlightDay = null
        this.dailyRunInFlightPromise = null
      }
    }
  }

  /**
   * Pre-trigger today's scheduled daily run early when an extension UI opens.
   *
   * This method is intentionally scoped to the existing daily alarm path and
   * does not change retry behavior or provider semantics.
   */
  async pretriggerDailyOnUiOpen(params: {
    requestId?: string
    tempWindowRequestSource?: TempWindowRequestSource
    protectionBypassExecution: ProtectionBypassExecution
    /**
     * When true, evaluates eligibility but does not execute the daily run.
     * Intended for UI diagnostics so users can understand why a pre-trigger did
     * or did not start without waiting for the next scheduled time.
     */
    dryRun?: boolean
    /**
     * When true, includes structured debug details describing the eligibility
     * decision inputs (window, alarm schedule, stored target day, etc.).
     */
    debug?: boolean
  }): Promise<AutoCheckinUiOpenPretriggerResult> {
    const now = new Date()
    const today = this.getLocalDay(now)

    const debug: AutoCheckinUiOpenPretriggerDebugInfo | undefined =
      params?.debug === true
        ? {
            nowIso: now.toISOString(),
            today,
            windowStart: "",
            windowEnd: "",
            windowStartMinutes: null,
            windowEndMinutes: null,
            nowMinutes: now.getHours() * 60 + now.getMinutes(),
            isWithinWindow: null,
            lastDailyRunDay: null,
            dailyRunInFlightDay: this.dailyRunInFlightDay ?? null,
            dailyAlarmScheduledTime: null,
            scheduledTargetDay: null,
            storedTargetDay: null,
            targetDay: null,
          }
        : undefined

    const returnIneligible = (
      ineligibleReason: AutoCheckinUiOpenPretriggerIneligibleReason,
    ) => {
      return {
        started: false,
        eligible: false,
        ineligibleReason,
        debug,
      }
    }

    if (!hasAlarmsAPI()) {
      return returnIneligible("alarms_api_unavailable")
    }

    const prefs = await userPreferences.getPreferences()
    const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!

    if (!config.globalEnabled || !config.pretriggerDailyOnUiOpen) {
      if (debug) {
        debug.windowStart = config.windowStart
        debug.windowEnd = config.windowEnd
      }
      return returnIneligible(
        !config.globalEnabled ? "global_disabled" : "pretrigger_disabled",
      )
    }

    const currentStatus = await autoCheckinStorage.getStatus()

    if (debug) {
      debug.windowStart = config.windowStart
      debug.windowEnd = config.windowEnd
      debug.lastDailyRunDay = currentStatus?.lastDailyRunDay ?? null
    }

    if (this.dailyRunInFlightDay === today && this.dailyRunInFlightPromise) {
      return returnIneligible("daily_run_in_flight")
    }

    /**
     * Duplicate-run guard: never allow a second daily run on the same local day,
     * even if the daily alarm schedule/state is inconsistent.
     */
    if (currentStatus?.lastDailyRunDay === today) {
      return returnIneligible("already_ran_today")
    }

    const windowStartMinutes = this.parseTimeToMinutes(config.windowStart)
    const windowEndMinutes = this.parseTimeToMinutes(config.windowEnd)
    const nowMinutes = now.getHours() * 60 + now.getMinutes()

    if (debug) {
      debug.windowStartMinutes = windowStartMinutes
      debug.windowEndMinutes = windowEndMinutes
      debug.nowMinutes = nowMinutes
    }

    if (windowStartMinutes == null || windowEndMinutes == null) {
      return returnIneligible("invalid_time_window")
    }

    const isWithinWindow = this.isMinutesWithinWindow(
      nowMinutes,
      windowStartMinutes,
      windowEndMinutes,
    )

    if (debug) {
      debug.isWithinWindow = isWithinWindow
    }

    if (!isWithinWindow) {
      return returnIneligible("outside_time_window")
    }

    const dailyAlarm = await getAlarm(AutoCheckinScheduler.DAILY_ALARM_NAME)

    if (debug) {
      debug.dailyAlarmScheduledTime = dailyAlarm?.scheduledTime ?? null
    }

    if (!dailyAlarm?.scheduledTime) {
      return returnIneligible("daily_alarm_missing")
    }

    const scheduledTargetDay = this.getLocalDay(
      new Date(dailyAlarm.scheduledTime),
    )
    const targetDay = currentStatus?.dailyAlarmTargetDay ?? scheduledTargetDay

    if (targetDay !== today) {
      if (debug) {
        debug.scheduledTargetDay = scheduledTargetDay
        debug.storedTargetDay = currentStatus?.dailyAlarmTargetDay ?? null
        debug.targetDay = targetDay
      }
      return returnIneligible("daily_alarm_not_today")
    }

    if (debug) {
      debug.scheduledTargetDay = scheduledTargetDay
      debug.storedTargetDay = currentStatus?.dailyAlarmTargetDay ?? null
      debug.targetDay = targetDay
    }

    if (params?.dryRun) {
      return {
        started: false,
        eligible: true,
        debug,
      }
    }

    if (params?.requestId) {
      try {
        await sendRuntimeMessage(
          {
            action: RuntimeActionIds.AutoCheckinPretriggerStarted,
            requestId: params.requestId,
          },
          { maxAttempts: 1 },
        )
      } catch {
        // Ignore if no UI is listening (popup closed, no receivers, etc.).
      }
    }

    await this.handleDailyAlarm(
      {
        name: AutoCheckinScheduler.DAILY_ALARM_NAME,
        scheduledTime: dailyAlarm.scheduledTime,
      } as browser.alarms.Alarm,
      params.tempWindowRequestSource ?? TEMP_WINDOW_REQUEST_SOURCES.Background,
      params.protectionBypassExecution,
    )

    const updatedStatus = await autoCheckinStorage.getStatus()
    const summary =
      updatedStatus?.summary ??
      (updatedStatus?.perAccount
        ? this.recalculateSummaryFromResults(updatedStatus.perAccount)
        : undefined)

    return {
      started: true,
      eligible: true,
      debug,
      summary,
      lastRunResult: updatedStatus?.lastRunResult,
      pendingRetry: updatedStatus?.pendingRetry,
    }
  }

  /**
   * Retry alarm handler.
   *
   * Retries only accounts from today's retry queue and never modifies the daily alarm schedule.
   */
  private async handleRetryAlarm(alarm: browser.alarms.Alarm) {
    const now = new Date()
    const today = this.getLocalDay(now)
    const currentStatus = await autoCheckinStorage.getStatus()
    const targetDay =
      currentStatus?.retryAlarmTargetDay ??
      (alarm.scheduledTime != null
        ? this.getLocalDay(new Date(alarm.scheduledTime))
        : undefined)

    // Stale-alarm guard: never retry failures from a past day.
    if (targetDay && targetDay !== today) {
      logger.warn("Ignoring stale retry alarm", {
        targetDay,
        today,
      })
      await this.clearRetryAlarmAndState(currentStatus)
      return
    }

    logger.info("Retry alarm triggered; starting retries")
    try {
      await this.runRetryCheckins(
        TEMP_WINDOW_REQUEST_SOURCES.Background,
        createAutomaticCheckinExecution(
          PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Retry,
          TEMP_WINDOW_REQUEST_SOURCES.Background,
        ),
      )
    } catch (error) {
      logger.error("Error during retry execution", error)
    } finally {
      const prefs = await userPreferences.getPreferences()
      const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
      await this.scheduleRetryAlarm(config)
    }
  }

  /**
   * Dev/test-only helper: simulate the daily alarm callback immediately.
   *
   * Used by Options UI debug buttons so developers can run the same code path as
   * `chrome.alarms` without waiting for the scheduled time.
   */
  async debugTriggerDailyAlarmNow(): Promise<void> {
    await this.handleDailyAlarm(
      {
        name: AutoCheckinScheduler.DAILY_ALARM_NAME,
        scheduledTime: Date.now(),
      } as browser.alarms.Alarm,
      TEMP_WINDOW_REQUEST_SOURCES.Background,
      createAutomaticCheckinExecution(
        PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
        TEMP_WINDOW_REQUEST_SOURCES.Background,
      ),
    )
  }

  /**
   * Dev/test-only helper: simulate the retry alarm callback immediately.
   *
   * Note: if there is no pending retry queue for today, this will no-op/clear state
   * according to the normal retry logic.
   */
  async debugTriggerRetryAlarmNow(): Promise<void> {
    await this.handleRetryAlarm({
      name: AutoCheckinScheduler.RETRY_ALARM_NAME,
      scheduledTime: Date.now(),
    } as browser.alarms.Alarm)
  }

  /**
   * Dev/test-only helper: clears the stored `lastDailyRunDay` marker.
   *
   * This enables developers to re-run daily/pre-trigger flows in the same local day
   * without waiting for the next day. This intentionally does not modify alarm schedules.
   */
  async debugResetLastDailyRunDay(): Promise<void> {
    const status = await autoCheckinStorage.getStatus()
    if (!status?.lastDailyRunDay) {
      return
    }

    const updated: AutoCheckinStatus = { ...status }
    delete updated.lastDailyRunDay
    await autoCheckinStorage.saveStatus(updated)
  }

  /**
   * Dev/test-only helper: schedule the normal daily alarm to run later today.
   *
   * This is primarily intended for debugging the UI-open pre-trigger eligibility:
   * the pre-trigger requires that a daily alarm exists and targets *today*.
   *
   * Notes:
   * - The alarm is scheduled at `minutesFromNow` (default 60) and clamped to the end of today.
   * - This does not clear `lastDailyRunDay` (use `debugResetLastDailyRunDay` if needed).
   * - This does not change retry scheduling.
   * @returns The scheduled alarm time (epoch ms) after creation.
   */
  async debugScheduleDailyAlarmForToday(params?: {
    minutesFromNow?: number
  }): Promise<number> {
    if (!hasAlarmsAPI()) {
      throw new Error("[AutoCheckin] Alarms API not available")
    }

    const minutesFromNow = Math.max(1, Math.floor(params?.minutesFromNow ?? 60))

    const currentStatus = await autoCheckinStorage.getStatus()
    const scheduledTime = await this.createDailyAlarmForToday(
      Date.now() + minutesFromNow * 60_000,
    )

    await this.syncDailyScheduleStatus(currentStatus, scheduledTime)

    logger.debug("Debug scheduled daily alarm for today", {
      when: scheduledTime.getTime(),
    })

    return scheduledTime.getTime()
  }

  /**
   * Execute check-ins for all eligible accounts, optionally scoped to a target set.
   *
   * Run types:
   * - `AUTO_CHECKIN_RUN_TYPE.DAILY`: invoked by the daily alarm. Records `lastDailyRunDay` and builds a retry queue
   *   from today's *failed* runnable accounts only.
   * - `AUTO_CHECKIN_RUN_TYPE.MANUAL`: invoked by the UI. Does not create a new retry queue, but can shrink an
   *   existing queue for today based on the latest results.
   *
   * Persisted method status is a display projection and may be stale. Providers
   * must return `already_checked` when appropriate.
   */
  async runCheckins(options: {
    runType?: AutoCheckinRunType
    targetAccountIds?: string[]
    tempWindowRequestSource?: TempWindowRequestSource
    protectionBypassExecution: ProtectionBypassExecution
  }): Promise<void> {
    // Default to manual runs for UI-triggered or debug entry points.
    const runType = options?.runType ?? AUTO_CHECKIN_RUN_TYPE.MANUAL
    const isDailyRun = runType === AUTO_CHECKIN_RUN_TYPE.DAILY
    const targetAccountIds = options?.targetAccountIds
    const tempWindowRequestSource =
      options?.tempWindowRequestSource ?? TEMP_WINDOW_REQUEST_SOURCES.Background
    const protectionBypassExecution = options.protectionBypassExecution
    const targetAccountIdSet =
      !isDailyRun &&
      Array.isArray(targetAccountIds) &&
      targetAccountIds.length > 0
        ? new Set(targetAccountIds)
        : null
    let notifyUiOnCompletion: boolean | null = null

    logger.info("Starting check-in execution", {
      runType,
      targetAccountCount: targetAccountIdSet?.size ?? null,
    })
    const startTime = Date.now()
    const now = new Date()
    const today = this.getLocalDay(now)
    const currentStatus = await autoCheckinStorage.getStatus()
    const mergeHistory = Boolean(targetAccountIdSet)

    const mergePerAccountIfNeeded = (
      nextResults: Record<string, CheckinAccountResult>,
    ): Record<string, CheckinAccountResult> => {
      if (!mergeHistory) return nextResults
      return {
        ...(currentStatus?.perAccount ?? {}),
        ...nextResults,
      }
    }

    const mergeAccountsSnapshotIfNeeded = (
      currentRunSnapshots: AutoCheckinAccountSnapshot[],
      nextResults: Record<string, CheckinAccountResult>,
    ): AutoCheckinAccountSnapshot[] => {
      if (!mergeHistory) {
        return this.attachResultsToSnapshots(currentRunSnapshots, nextResults)
      }

      let nextSnapshots = currentStatus?.accountsSnapshot
      if (!nextSnapshots || nextSnapshots.length === 0) {
        return this.attachResultsToSnapshots(currentRunSnapshots, nextResults)
      }

      for (const result of Object.values(nextResults)) {
        nextSnapshots =
          this.updateSnapshotWithResult(nextSnapshots, result) ?? nextSnapshots
      }

      const existingIds = new Set(
        nextSnapshots.map((snapshot) => snapshot.accountId),
      )
      const missing = currentRunSnapshots.filter(
        (snapshot) => !existingIds.has(snapshot.accountId),
      )
      if (missing.length === 0) return nextSnapshots

      return [
        ...nextSnapshots,
        ...this.attachResultsToSnapshots(missing, nextResults),
      ]
    }

    const mergeSummaryIfNeeded = (
      summary: AutoCheckinRunSummary,
      perAccount: Record<string, CheckinAccountResult>,
    ): AutoCheckinRunSummary => {
      if (!mergeHistory) return summary
      return this.recalculateSummaryFromResults(
        perAccount,
        currentStatus?.summary ?? summary,
      )
    }

    try {
      // Get preferences
      const prefs = await userPreferences.getPreferences()
      const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
      // Treat missing values as enabled to preserve backward compatibility with older stored prefs.
      notifyUiOnCompletion = config.notifyUiOnCompletion !== false

      // The global switch controls scheduled/bulk auto check-in. An explicit
      // per-account manual run from the account menu should still execute.
      if (!config.globalEnabled && !targetAccountIdSet) {
        logger.info("Global feature disabled; skipping")
        return
      }

      // Get all accounts, then exclude disabled accounts from runnable selection.
      // Disabled accounts must not participate, but we still record an explicit
      // skip reason so background status/history can explain why an account was skipped.
      const availableAccounts = await accountStorage.getAllAccounts()
      const accountDisplayNameById =
        buildAccountDisplayNameMap(availableAccounts)
      const allAccounts = targetAccountIdSet
        ? availableAccounts.filter((account) =>
            targetAccountIdSet.has(account.id),
          )
        : availableAccounts
      const enabledAccounts = allAccounts.filter(
        (account) => account.disabled !== true,
      )
      const disabledAccounts = allAccounts.filter(
        (account) => account.disabled === true,
      )

      const accountSnapshots: AutoCheckinAccountSnapshot[] = []
      const runnableAccounts: SiteAccount[] = []

      // Build snapshots and determine runnable accounts
      for (const account of enabledAccounts) {
        const snapshot = this.buildAccountSnapshot(
          account,
          accountDisplayNameById.get(account.id) ?? account.id,
        )
        accountSnapshots.push(snapshot)
        if (!snapshot.skipReason) {
          runnableAccounts.push(account)
        }
      }

      const results: Record<string, CheckinAccountResult> = {}
      const timestamp = Date.now()

      for (const account of disabledAccounts) {
        results[account.id] = {
          accountId: account.id,
          accountName: accountDisplayNameById.get(account.id) ?? account.id,
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          messageKey: getAutoCheckinSkipReasonTranslationKey(
            AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
          ),
          reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
          timestamp,
        }
      }

      // Record skipped accounts to results
      for (const snapshot of accountSnapshots) {
        if (snapshot.skipReason) {
          results[snapshot.accountId] = {
            accountId: snapshot.accountId,
            accountName: snapshot.accountName,
            status: CHECKIN_RESULT_STATUS.SKIPPED,
            messageKey: getAutoCheckinSkipReasonTranslationKey(
              snapshot.skipReason,
            ),
            reasonCode: snapshot.skipReason,
            timestamp,
          }
        }
      }

      logger.debug("Prepared check-in execution set", {
        selectedMethodCount: accountSnapshots.filter(
          (snapshot) => snapshot.detectionEnabled,
        ).length,
        runnableCount: runnableAccounts.length,
      })

      // If no accounts to run, save status and exit
      if (runnableAccounts.length === 0) {
        const summary: AutoCheckinRunSummary = {
          totalEligible: accountSnapshots.length,
          executed: 0,
          successCount: 0,
          failedCount: 0,
          skippedCount: accountSnapshots.length,
          needsRetry: false,
        }
        const perAccount = mergePerAccountIfNeeded(results)
        const accountsSnapshot = mergeAccountsSnapshotIfNeeded(
          accountSnapshots,
          results,
        )
        const analyticsSnapshots = this.buildAnalyticsSnapshots(
          allAccounts,
          accountDisplayNameById,
          results,
        )
        const mergedSummary = mergeSummaryIfNeeded(summary, perAccount)

        await autoCheckinStorage.saveStatus({
          ...(currentStatus ?? {}),
          lastRunAt: new Date().toISOString(),
          lastRunResult: AUTO_CHECKIN_RUN_RESULT.SKIPPED,
          perAccount,
          summary: mergedSummary,
          accountsSnapshot,
          ...(isDailyRun
            ? {
                lastDailyRunDay: today,
                retryState: undefined,
                nextRetryScheduledAt: undefined,
                retryAlarmTargetDay: undefined,
                pendingRetry: false,
              }
            : {}),
        })

        if (notifyUiOnCompletion) {
          await this.notifyUiRunCompleted({
            runKind: runType,
            updatedAccountIds: [],
            summary: mergedSummary,
          })
        }
        if (isDailyRun) {
          this.trackBackgroundAutoCheckinCompleted({
            summary: mergedSummary,
            durationMs: Date.now() - startTime,
            mode: PRODUCT_ANALYTICS_MODE_IDS.TelemetryAuto,
            retryAttempted: false,
            retryCount: 0,
          })
          this.trackBackgroundAutoCheckinRunAnalytics({
            runKind: runType,
            snapshots: analyticsSnapshots,
            accounts: allAccounts,
            retryEnabled: config.retryStrategy?.enabled === true,
            retryPendingBefore: 0,
            retryAttempted: 0,
            retryRescued: 0,
            retryPendingAfter: 0,
            retryExhausted: 0,
          })
        }
        return
      }

      // API/page resources are limited by their owning lower layers.
      let successCount = 0
      let failedCount = 0
      let uncertainCount = 0

      const checkinOutcomes = await this.runAccountCheckins({
        accounts: runnableAccounts,
        accountDisplayNameById,
        tempWindowRequestSource,
        protectionBypassExecution,
      })

      for (const outcome of checkinOutcomes) {
        results[outcome.result.accountId] = outcome.result
        if (isSuccessfulCheckinStatus(outcome.result.status)) {
          successCount++
        } else if (isFailedCheckinStatus(outcome.result.status)) {
          failedCount++
        } else if (outcome.result.status === CHECKIN_RESULT_STATUS.UNCERTAIN) {
          uncertainCount++
        }
      }

      const runtimeSkippedCount = checkinOutcomes.filter(
        (outcome) => outcome.result.status === CHECKIN_RESULT_STATUS.SKIPPED,
      ).length
      const skippedCount =
        accountSnapshots.length - runnableAccounts.length + runtimeSkippedCount
      const summaryNeedsRetry = checkinOutcomes.some((outcome) =>
        isRetryableCheckinResult(outcome.result),
      )

      const summary: AutoCheckinRunSummary = {
        totalEligible: accountSnapshots.length,
        executed: successCount + failedCount + uncertainCount,
        successCount,
        failedCount,
        skippedCount,
        ...(uncertainCount > 0 ? { uncertainCount } : {}),
        needsRetry: summaryNeedsRetry,
      }
      const updatedAccountIds = checkinOutcomes
        .filter((outcome) => isSuccessfulCheckinStatus(outcome.result.status))
        .map((outcome) => outcome.result.accountId)

      const accountIdsToRefresh = checkinOutcomes
        .filter(
          (outcome) => outcome.result.status === CHECKIN_RESULT_STATUS.SUCCESS,
        )
        .map((outcome) => outcome.result.accountId)

      let retryState: AutoCheckinRetryState | undefined =
        currentStatus?.retryState
      if (isDailyRun) {
        retryState = undefined
        if (
          config.retryStrategy?.enabled &&
          config.retryStrategy.maxAttemptsPerDay > 1 &&
          summaryNeedsRetry
        ) {
          // Retry queue is derived only from today's *failed* runnable accounts.
          // Provider `already_checked` is treated as success and excluded automatically.
          const failedAccountIds = checkinOutcomes
            .filter((outcome) => isRetryableCheckinResult(outcome.result))
            .map((outcome) => outcome.result.accountId)

          retryState = {
            day: today,
            pendingAccountIds: failedAccountIds,
            // Attempt counter includes the initial daily run failure as attempt=1.
            attemptsByAccount: Object.fromEntries(
              failedAccountIds.map((id) => [id, 1]),
            ),
          }
        }
      } else if (
        retryState?.day === today &&
        retryState.pendingAccountIds.length > 0
      ) {
        const pending = retryState.pendingAccountIds.filter((accountId) => {
          const result = results[accountId]
          return result ? isRetryableCheckinResult(result) : true
        })
        retryState =
          pending.length > 0
            ? { ...retryState, pendingAccountIds: pending }
            : undefined
      }

      const pendingRetry = Boolean(
        retryState?.day === today && retryState.pendingAccountIds.length > 0,
      )

      const perAccount = mergePerAccountIfNeeded(results)
      const accountsSnapshot = mergeAccountsSnapshotIfNeeded(
        accountSnapshots,
        results,
      )
      const analyticsSnapshots = this.buildAnalyticsSnapshots(
        allAccounts,
        accountDisplayNameById,
        results,
      )
      const mergedSummary = mergeSummaryIfNeeded(summary, perAccount)
      const overallResult = getAutoCheckinRunResultFromSummary(mergedSummary)

      await autoCheckinStorage.saveStatus({
        ...(currentStatus ?? {}),
        lastRunAt: new Date().toISOString(),
        lastRunResult: overallResult,
        perAccount,
        summary: mergedSummary,
        retryState,
        pendingRetry,
        accountsSnapshot,
        ...(isDailyRun
          ? {
              lastDailyRunDay: today,
              nextRetryScheduledAt: undefined,
              retryAlarmTargetDay: undefined,
            }
          : {}),
      })

      await this.refreshAccountsAfterSuccessfulCheckins({
        accountIds: accountIdsToRefresh,
        force: true,
        tempWindowRequestSource,
        protectionBypassExecution,
      })

      if (notifyUiOnCompletion) {
        await this.notifyUiRunCompleted({
          runKind: runType,
          updatedAccountIds,
          summary: mergedSummary,
        })
      }

      if (isDailyRun) {
        await this.notifyScheduledRunResult({
          successCount,
          failedCount,
          skippedCount,
          total: runnableAccounts.length + skippedCount,
        })
        this.trackBackgroundAutoCheckinCompleted({
          summary: mergedSummary,
          durationMs: Date.now() - startTime,
          mode: PRODUCT_ANALYTICS_MODE_IDS.TelemetryAuto,
          retryAttempted: false,
          retryCount: 0,
        })
        this.trackBackgroundAutoCheckinRunAnalytics({
          runKind: runType,
          snapshots: analyticsSnapshots,
          accounts: allAccounts,
          retryEnabled: config.retryStrategy?.enabled === true,
          retryPendingBefore: 0,
          retryAttempted: 0,
          retryRescued: 0,
          retryPendingAfter: retryState?.pendingAccountIds.length ?? 0,
          retryExhausted: 0,
        })
      }

      const duration = Date.now() - startTime
      logger.info("Execution completed", {
        durationMs: duration,
        successCount,
        failedCount,
      })
    } catch (error) {
      logger.error("Execution failed", error)
      await autoCheckinStorage.saveStatus({
        ...(currentStatus ?? {}),
        lastRunAt: new Date().toISOString(),
        lastRunResult: AUTO_CHECKIN_RUN_RESULT.FAILED,
        perAccount: mergeHistory ? currentStatus?.perAccount ?? {} : {},
        pendingRetry: false,
        retryState: isDailyRun ? undefined : currentStatus?.retryState,
        ...(isDailyRun
          ? {
              lastDailyRunDay: today,
              nextRetryScheduledAt: undefined,
              retryAlarmTargetDay: undefined,
            }
          : {}),
      })

      if (notifyUiOnCompletion === null) {
        try {
          const prefs = await userPreferences.getPreferences()
          const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
          notifyUiOnCompletion = config.notifyUiOnCompletion !== false
        } catch {
          // ignore; execution already persisted status
        }
      }

      if (notifyUiOnCompletion) {
        await this.notifyUiRunCompleted({
          runKind: runType,
          updatedAccountIds: [],
        })
      }

      if (isDailyRun) {
        await notifyTaskResult({
          task: TASK_NOTIFICATION_TASKS.AutoCheckin,
          status: TASK_NOTIFICATION_STATUSES.Failure,
        })
      }
    }
  }

  /**
   * Execute account-level retries for the current day.
   *
   * This MUST only retry accounts from today's retry queue and MUST NOT run if the
   * normal daily run has not executed today.
   *
   * Attempt counting:
   * - `attemptsByAccount[id]` starts at 1 for the initial daily run failure.
   * - Each automatic retry increments the count.
   * - Retries stop once `attempts >= retryStrategy.maxAttemptsPerDay`.
   */
  private async runRetryCheckins(
    tempWindowRequestSource: TempWindowRequestSource,
    protectionBypassExecution: ProtectionBypassExecution,
  ): Promise<void> {
    const startTime = Date.now()
    const now = new Date()
    const today = this.getLocalDay(now)

    const prefs = await userPreferences.getPreferences()
    const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
    // Treat missing values as enabled to preserve backward compatibility with older stored prefs.
    const notifyUiOnCompletion = config.notifyUiOnCompletion !== false
    const currentStatus = await autoCheckinStorage.getStatus()
    const allAccounts = await accountStorage.getAllAccounts()
    const accountDisplayNameById = buildAccountDisplayNameMap(allAccounts)

    if (!config.globalEnabled || !config.retryStrategy?.enabled) {
      logger.info("Retry skipped (feature disabled)")
      await this.clearRetryAlarmAndState(currentStatus)
      return
    }

    // Ensure that today's normal run has executed
    if (
      currentStatus?.lastDailyRunDay !== today ||
      currentStatus?.retryState?.day !== today
    ) {
      logger.info("Retry skipped (no normal run today)")
      await this.clearRetryAlarmAndState(currentStatus)
      return
    }

    // Ensure we have a retry state with pending accounts
    const retryState = currentStatus.retryState
    if (!retryState || retryState.pendingAccountIds.length === 0) {
      logger.info("Retry skipped (no pending accounts)")
      await this.clearRetryAlarmAndState(currentStatus)
      return
    }

    const maxAttempts = config.retryStrategy.maxAttemptsPerDay
    const attemptsByAccount: Record<string, number> = {
      ...(retryState.attemptsByAccount ?? {}),
    }
    const retryPendingBefore = retryState.pendingAccountIds.length
    let retryExhausted = 0

    const updates: Record<string, CheckinAccountResult> = {}
    const remaining: string[] = []
    const updatedAccountIds: string[] = []
    const accountIdsToRefresh: string[] = []

    for (const accountId of retryState.pendingAccountIds) {
      // Default to 1 to represent the initial daily run failure when the stored map is missing.
      const attempts = attemptsByAccount[accountId] ?? 1
      if (attempts >= maxAttempts) {
        retryExhausted += 1
        continue
      }

      const account = await accountStorage.getAccountById(accountId)
      if (!account || account.disabled === true) {
        updates[accountId] = {
          accountId,
          accountName: account
            ? accountDisplayNameById.get(account.id) ?? account.id
            : accountId,
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          messageKey: getAutoCheckinSkipReasonTranslationKey(
            AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
          ),
          reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
          timestamp: Date.now(),
        }
        continue
      }

      const snapshot = this.buildAccountSnapshot(
        account,
        accountDisplayNameById.get(account.id) ?? account.id,
      )
      if (snapshot.skipReason) {
        updates[accountId] = {
          accountId,
          accountName: snapshot.accountName,
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          messageKey: getAutoCheckinSkipReasonTranslationKey(
            snapshot.skipReason,
          ),
          reasonCode: snapshot.skipReason,
          timestamp: Date.now(),
        }
        continue
      }

      const outcome = await this.runAccountCheckin(
        account,
        accountDisplayNameById.get(account.id) ?? account.id,
        tempWindowRequestSource,
        protectionBypassExecution,
        true,
      )
      // Persist that we've attempted one more time for this account today, regardless of outcome.
      attemptsByAccount[accountId] = attempts + 1
      updates[accountId] = outcome.result
      if (isSuccessfulCheckinStatus(outcome.result.status)) {
        updatedAccountIds.push(outcome.result.accountId)
      }
      if (outcome.result.status === CHECKIN_RESULT_STATUS.SUCCESS) {
        accountIdsToRefresh.push(outcome.result.accountId)
      }

      if (
        isRetryableCheckinResult(outcome.result) &&
        attemptsByAccount[accountId] < maxAttempts
      ) {
        remaining.push(accountId)
      }
    }

    const perAccount: Record<string, CheckinAccountResult> = {
      ...(currentStatus?.perAccount ?? {}),
      ...updates,
    }

    const summary = this.recalculateSummaryFromResults(
      perAccount,
      currentStatus?.summary,
    )

    const lastRunResult = getAutoCheckinRunResultFromSummary(summary)

    let accountsSnapshot = currentStatus?.accountsSnapshot
    for (const result of Object.values(updates)) {
      accountsSnapshot = this.updateSnapshotWithResult(accountsSnapshot, result)
    }

    const nextRetryState: AutoCheckinRetryState | undefined =
      remaining.length > 0
        ? {
            day: today,
            pendingAccountIds: remaining,
            attemptsByAccount: Object.fromEntries(
              remaining.map((id) => [id, attemptsByAccount[id] ?? 1]),
            ),
          }
        : undefined

    await autoCheckinStorage.saveStatus({
      ...(currentStatus ?? {}),
      lastRunAt: new Date().toISOString(),
      lastRunResult,
      perAccount,
      summary,
      accountsSnapshot,
      retryState: nextRetryState,
      pendingRetry: Boolean(nextRetryState?.pendingAccountIds.length),
      nextRetryScheduledAt: undefined,
      retryAlarmTargetDay: undefined,
    })

    await this.refreshAccountsAfterSuccessfulCheckins({
      accountIds: accountIdsToRefresh,
      force: true,
      tempWindowRequestSource,
      protectionBypassExecution,
    })

    if (notifyUiOnCompletion) {
      await this.notifyUiRunCompleted({
        runKind: "retry",
        updatedAccountIds,
        summary,
      })
    }

    const retryResults = Object.values(updates)
    const retrySuccessCount = retryResults.filter(
      (result) =>
        result.status === CHECKIN_RESULT_STATUS.SUCCESS ||
        result.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
    ).length
    const retryFailedCount = retryResults.filter(
      (result) => result.status === CHECKIN_RESULT_STATUS.FAILED,
    ).length
    const retrySkippedCount = retryResults.filter(
      (result) => result.status === CHECKIN_RESULT_STATUS.SKIPPED,
    ).length

    if (retryResults.length > 0) {
      await this.notifyScheduledRunResult({
        successCount: retrySuccessCount,
        failedCount: retryFailedCount,
        skippedCount: retrySkippedCount,
        total: retryResults.length,
      })
      this.trackBackgroundAutoCheckinCompleted({
        summary: {
          totalEligible: retryResults.length,
          executed: retrySuccessCount + retryFailedCount,
          successCount: retrySuccessCount,
          failedCount: retryFailedCount,
          skippedCount: retrySkippedCount,
          needsRetry: Boolean(nextRetryState?.pendingAccountIds.length),
        },
        durationMs: Date.now() - startTime,
        mode: PRODUCT_ANALYTICS_MODE_IDS.RetryFailed,
        retryAttempted: true,
        retryCount: retryResults.length,
      })
      this.trackBackgroundAutoCheckinRunAnalytics({
        runKind: "retry",
        snapshots:
          accountsSnapshot?.filter((snapshot) => updates[snapshot.accountId]) ??
          [],
        accounts: allAccounts,
        retryEnabled: config.retryStrategy?.enabled === true,
        retryPendingBefore,
        retryAttempted: retryResults.length,
        retryRescued: retrySuccessCount,
        retryPendingAfter: nextRetryState?.pendingAccountIds.length ?? 0,
        retryExhausted,
      })
    }
  }

  /**
   * Update settings and reschedule alarm
   * @param settings Partial auto-checkin config plus retryStrategy overrides.
   */
  async updateSettings(
    settings: Partial<
      Pick<
        AutoCheckinPreferences,
        | "globalEnabled"
        | "pretriggerDailyOnUiOpen"
        | "notifyUiOnCompletion"
        | "windowStart"
        | "windowEnd"
        | "scheduleMode"
        | "deterministicTime"
      >
    > & {
      retryStrategy?: Partial<AutoCheckinPreferences["retryStrategy"]>
    },
  ) {
    // Get current config and update
    const prefs = await userPreferences.getPreferences()
    const current = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!

    const updated: AutoCheckinPreferences = {
      ...current,
      ...settings,
      retryStrategy: {
        ...current.retryStrategy,
        ...(settings.retryStrategy ?? {}),
      },
    }

    await userPreferences.savePreferences({ autoCheckin: updated })
    await this.scheduleNextRun({ allowCatchUp: false })
    logger.info("Settings updated", updated)
  }

  /**
   * Manual retry for a single account.
   *
   * If this account is currently in today's retry queue, a successful manual retry removes it
   * from the pending list (and may clear the retry alarm if nothing else remains).
   */
  async retryAccount(
    accountId: string,
    tempWindowRequestSource: TempWindowRequestSource,
    protectionBypassExecution: ProtectionBypassExecution,
  ) {
    const today = this.getLocalDay()
    const allAccounts = await accountStorage.getAllAccounts()
    const account = allAccounts.find((item) => item.id === accountId)
    const accountDisplayNameById = buildAccountDisplayNameMap(allAccounts)

    if (!account) {
      throw new Error(t("messages:storage.accountNotFound", { id: accountId }))
    }

    const result: CheckinAccountResult =
      account.disabled === true
        ? {
            accountId: account.id,
            accountName: accountDisplayNameById.get(account.id) ?? account.id,
            status: CHECKIN_RESULT_STATUS.SKIPPED,
            messageKey: getAutoCheckinSkipReasonTranslationKey(
              AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
            ),
            reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
            timestamp: Date.now(),
          }
        : (
            await this.runAccountCheckin(
              account,
              accountDisplayNameById.get(account.id) ?? account.id,
              tempWindowRequestSource,
              protectionBypassExecution,
            )
          ).result

    const currentStatus = (await autoCheckinStorage.getStatus()) || {}

    const perAccount: Record<string, CheckinAccountResult> = {
      ...(currentStatus.perAccount ?? {}),
      [result.accountId]: result,
    }

    const summary = this.recalculateSummaryFromResults(
      perAccount,
      currentStatus.summary,
    )

    const lastRunResult = getAutoCheckinRunResultFromSummary(summary)

    let retryState = currentStatus.retryState
    if (
      retryState?.day === today &&
      retryState.pendingAccountIds.includes(accountId)
    ) {
      if (!isRetryableCheckinResult(result)) {
        const nextPending = retryState.pendingAccountIds.filter(
          (id) => id !== accountId,
        )
        retryState =
          nextPending.length > 0
            ? { ...retryState, pendingAccountIds: nextPending }
            : undefined
      }
    }

    const pendingRetry = Boolean(
      retryState?.day === today && retryState.pendingAccountIds.length > 0,
    )

    const accountsSnapshot = this.updateSnapshotWithResult(
      currentStatus.accountsSnapshot,
      result,
    )

    const updatedStatus: AutoCheckinStatus = {
      ...currentStatus,
      lastRunAt: new Date().toISOString(),
      lastRunResult,
      perAccount,
      summary,
      retryState,
      pendingRetry,
      accountsSnapshot,
    }

    await autoCheckinStorage.saveStatus(updatedStatus)

    // Reschedule retry alarm if needed (never touches the daily alarm schedule).
    const prefs = await userPreferences.getPreferences()
    const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
    await this.scheduleRetryAlarm(config)

    return {
      result,
      summary,
      pendingRetry,
    }
  }

  /**
   * Return display data for a specific account (used by UI).
   */
  async getAccountDisplayData(
    accountId: string,
    options?: { includeDisabled?: boolean },
  ): Promise<DisplaySiteData> {
    const account = await accountStorage.getAccountById(accountId)

    if (!account) {
      throw new Error(t("messages:storage.accountNotFound", { id: accountId }))
    }
    if (account.disabled === true && !options?.includeDisabled) {
      throw new Error(t("messages:storage.accountDisabled", { id: accountId }))
    }

    const displayAccount = await accountStorage.getDisplayDataById(accountId)

    return displayAccount ?? accountStorage.convertToDisplayData(account)
  }
}

// Create singleton instance
export const autoCheckinScheduler = new AutoCheckinScheduler()

/**
 * Normalizes an optional `accountIds` payload into a unique list of account IDs.
 * Returns an error when the payload is present but invalid.
 */
function parseTargetAccountIds(accountIds: unknown):
  | {
      success: true
      targetAccountIds: string[] | undefined
    }
  | {
      success: false
      error: string
    } {
  if (accountIds === undefined) {
    return { success: true, targetAccountIds: undefined }
  }

  if (!Array.isArray(accountIds)) {
    return {
      success: false,
      error: "Invalid payload: accountIds must be a non-empty string[]",
    }
  }

  const normalized = accountIds
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0)

  if (normalized.length === 0 || normalized.length !== accountIds.length) {
    return {
      success: false,
      error: "Invalid payload: accountIds must be a non-empty string[]",
    }
  }

  return { success: true, targetAccountIds: Array.from(new Set(normalized)) }
}

/**
 * Run auto check-in immediately for all or selected accounts.
 */
export async function runAutoCheckinNow(
  data: AutoCheckinRunNowRequest = {},
  verifiedTempWindowRequestSource?: TempWindowRequestSource,
) {
  const targetIdsResult = parseTargetAccountIds(data.accountIds)
  if (!targetIdsResult.success) {
    return { success: false as const, error: targetIdsResult.error }
  }
  const tempWindowRequestSource =
    verifiedTempWindowRequestSource ??
    data.protectionBypassExecution?.surface ??
    TEMP_WINDOW_REQUEST_SOURCES.Background
  if (
    !isExpectedCheckinCommandExecution(
      data.protectionBypassExecution,
      PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
    )
  ) {
    return {
      success: false as const,
      error: INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
    }
  }

  try {
    await autoCheckinScheduler.runCheckins({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: targetIdsResult.targetAccountIds,
      tempWindowRequestSource,
      protectionBypassExecution: data.protectionBypassExecution,
    })
    return { success: true as const }
  } catch (e) {
    logger.error("Manual run failed", e)
    return { success: false as const, error: getErrorMessage(e) }
  } finally {
    try {
      await autoCheckinScheduler.scheduleNextRun({
        preserveExisting: true,
      })
    } catch (error) {
      logger.warn("Failed to reschedule after manual run", error)
    }
  }
}

/**
 * Reject debug-only auto check-in actions outside development and test modes.
 */
function ensureAutoCheckinDebugAvailable(action: string) {
  if (!isDevelopmentMode() && !isTestMode()) {
    return {
      success: false as const,
      error: `Debug action is only available in development/test mode (${action})`,
    }
  }
  return null
}

/**
 * Trigger the daily auto check-in alarm immediately in debug contexts.
 */
export async function triggerAutoCheckinDailyAlarmNow() {
  const unavailable = ensureAutoCheckinDebugAvailable(
    AutoCheckinMessageTypes.DebugTriggerDailyAlarmNow,
  )
  if (unavailable) return unavailable
  await autoCheckinScheduler.debugTriggerDailyAlarmNow()
  return { success: true as const }
}

/**
 * Trigger the retry auto check-in alarm immediately in debug contexts.
 */
export async function triggerAutoCheckinRetryAlarmNow() {
  const unavailable = ensureAutoCheckinDebugAvailable(
    AutoCheckinMessageTypes.DebugTriggerRetryAlarmNow,
  )
  if (unavailable) return unavailable
  await autoCheckinScheduler.debugTriggerRetryAlarmNow()
  return { success: true as const }
}

/**
 * Clear the stored last daily-run day in debug contexts.
 */
export async function resetAutoCheckinLastDailyRunDay() {
  const unavailable = ensureAutoCheckinDebugAvailable(
    AutoCheckinMessageTypes.DebugResetLastDailyRunDay,
  )
  if (unavailable) return unavailable
  await autoCheckinScheduler.debugResetLastDailyRunDay()
  return { success: true as const }
}

/**
 * Schedule today's daily auto check-in alarm in debug contexts.
 */
export async function scheduleAutoCheckinDailyAlarmForToday(
  data: AutoCheckinDebugScheduleDailyAlarmForTodayRequest = {},
) {
  const unavailable = ensureAutoCheckinDebugAvailable(
    AutoCheckinMessageTypes.DebugScheduleDailyAlarmForToday,
  )
  if (unavailable) return unavailable
  const scheduledTime =
    await autoCheckinScheduler.debugScheduleDailyAlarmForToday({
      minutesFromNow: data.minutesFromNow,
    })
  return { success: true as const, scheduledTime }
}

/**
 * Pretrigger the daily auto check-in flow when the UI opens.
 */
export async function pretriggerAutoCheckinDailyOnUiOpen(
  data: AutoCheckinPretriggerDailyOnUiOpenRequest = {},
  verifiedTempWindowRequestSource?: TempWindowRequestSource,
) {
  const tempWindowRequestSource =
    verifiedTempWindowRequestSource ??
    data.protectionBypassExecution?.surface ??
    TEMP_WINDOW_REQUEST_SOURCES.Background
  if (
    !isUiOpenCheckinExecution(
      data.protectionBypassExecution,
      tempWindowRequestSource,
    )
  ) {
    return {
      success: false as const,
      error: INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
    }
  }
  const result = await autoCheckinScheduler.pretriggerDailyOnUiOpen({
    requestId: data.requestId,
    dryRun: data.dryRun,
    debug: data.debug,
    tempWindowRequestSource,
    protectionBypassExecution: data.protectionBypassExecution,
  })
  return { success: true as const, ...result }
}

/**
 * Retry auto check-in for one failed account.
 */
export async function retryAutoCheckinAccount(
  accountId?: string,
  tempWindowRequestSource?: unknown,
  protectionBypassExecution?: unknown,
  verifiedTempWindowRequestSource?: TempWindowRequestSource,
) {
  if (!accountId) {
    return { success: false as const, error: "Missing accountId" }
  }
  if (
    !isExpectedCheckinCommandExecution(
      protectionBypassExecution,
      PROTECTION_BYPASS_USER_COMMANDS.RetryCheckinAccount,
    )
  ) {
    return {
      success: false as const,
      error: INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
    }
  }
  await autoCheckinScheduler.retryAccount(
    accountId,
    verifiedTempWindowRequestSource ??
      normalizeTempWindowRequestSource(tempWindowRequestSource),
    protectionBypassExecution,
  )
  return { success: true as const }
}

/**
 * Load display data for one account before opening manual check-in pages.
 */
export async function getAutoCheckinAccountInfo(
  data: AutoCheckinGetAccountInfoRequest,
) {
  if (!data.accountId) {
    return { success: false as const, error: "Missing accountId" }
  }
  const displayData = await autoCheckinScheduler.getAccountDisplayData(
    data.accountId,
    { includeDisabled: data.includeDisabled === true },
  )
  return { success: true as const, data: displayData }
}

/**
 * Load the latest persisted auto check-in status.
 */
export async function getAutoCheckinStatus() {
  const status = await autoCheckinStorage.getStatus()
  return { success: true as const, data: status }
}

/**
 * Persist auto check-in scheduler settings.
 */
export async function updateAutoCheckinSettings(
  settings: AutoCheckinUpdateSettingsRequest["settings"],
) {
  await autoCheckinScheduler.updateSettings(settings)
  return { success: true as const }
}

/**
 * Convert auto check-in listener errors into runtime responses.
 */
function toAutoCheckinFailure(error: unknown) {
  logger.error("Message handling failed", error)
  return { success: false as const, error: getErrorMessage(error) }
}

/** Validates plain execution intent before forwarding a typed check-in request. */
async function resolveVerifiedAutoCheckinMessage<T>(
  execution: unknown,
  resolve: (tempWindowRequestSource: TempWindowRequestSource) => Promise<T>,
) {
  if (!isProtectionBypassExecution(execution)) {
    return {
      success: false as const,
      error: INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
    }
  }
  return await resolve(execution.surface)
}

let autoCheckinMessagingCleanup: (() => void)[] | null = null

/**
 * Register typed background listeners for auto check-in runtime messages.
 */
export function setupAutoCheckinMessagingListeners() {
  if (autoCheckinMessagingCleanup) {
    return
  }

  autoCheckinMessagingCleanup = [
    onAutoCheckinMessage(AutoCheckinMessageTypes.RunNow, async ({ data }) => {
      try {
        return await resolveVerifiedAutoCheckinMessage(
          data?.protectionBypassExecution,
          (tempWindowRequestSource) =>
            runAutoCheckinNow(data, tempWindowRequestSource),
        )
      } catch (error) {
        return toAutoCheckinFailure(error)
      }
    }),
    onAutoCheckinMessage(
      AutoCheckinMessageTypes.DebugTriggerDailyAlarmNow,
      async () => {
        try {
          return await triggerAutoCheckinDailyAlarmNow()
        } catch (error) {
          return toAutoCheckinFailure(error)
        }
      },
    ),
    onAutoCheckinMessage(
      AutoCheckinMessageTypes.DebugTriggerRetryAlarmNow,
      async () => {
        try {
          return await triggerAutoCheckinRetryAlarmNow()
        } catch (error) {
          return toAutoCheckinFailure(error)
        }
      },
    ),
    onAutoCheckinMessage(
      AutoCheckinMessageTypes.DebugResetLastDailyRunDay,
      async () => {
        try {
          return await resetAutoCheckinLastDailyRunDay()
        } catch (error) {
          return toAutoCheckinFailure(error)
        }
      },
    ),
    onAutoCheckinMessage(
      AutoCheckinMessageTypes.DebugScheduleDailyAlarmForToday,
      async ({ data }) => {
        try {
          return await scheduleAutoCheckinDailyAlarmForToday(data)
        } catch (error) {
          return toAutoCheckinFailure(error)
        }
      },
    ),
    onAutoCheckinMessage(
      AutoCheckinMessageTypes.PretriggerDailyOnUiOpen,
      async ({ data }) => {
        try {
          return await resolveVerifiedAutoCheckinMessage(
            data?.protectionBypassExecution,
            (tempWindowRequestSource) =>
              pretriggerAutoCheckinDailyOnUiOpen(data, tempWindowRequestSource),
          )
        } catch (error) {
          return toAutoCheckinFailure(error)
        }
      },
    ),
    onAutoCheckinMessage(
      AutoCheckinMessageTypes.RetryAccount,
      async ({ data }) => {
        try {
          return await resolveVerifiedAutoCheckinMessage(
            data?.protectionBypassExecution,
            (tempWindowRequestSource) =>
              retryAutoCheckinAccount(
                data.accountId,
                data.protectionBypassExecution?.surface,
                data.protectionBypassExecution,
                tempWindowRequestSource,
              ),
          )
        } catch (error) {
          return toAutoCheckinFailure(error)
        }
      },
    ),
    onAutoCheckinMessage(
      AutoCheckinMessageTypes.GetAccountInfo,
      async ({ data }) => {
        try {
          return await getAutoCheckinAccountInfo(data)
        } catch (error) {
          return toAutoCheckinFailure(error)
        }
      },
    ),
    onAutoCheckinMessage(AutoCheckinMessageTypes.GetStatus, async () => {
      try {
        return await getAutoCheckinStatus()
      } catch (error) {
        return toAutoCheckinFailure(error)
      }
    }),
    onAutoCheckinMessage(
      AutoCheckinMessageTypes.UpdateSettings,
      async ({ data }) => {
        try {
          return await updateAutoCheckinSettings(data.settings)
        } catch (error) {
          return toAutoCheckinFailure(error)
        }
      },
    ),
  ]
}
