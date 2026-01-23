import { t } from "i18next"

import { accountStorage } from "~/services/accountStorage"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/userPreferences"
import type { DisplaySiteData, SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_RUN_RESULT,
  AUTO_CHECKIN_RUN_TYPE,
  AUTO_CHECKIN_SCHEDULE_MODE,
  AUTO_CHECKIN_SKIP_REASON,
  AutoCheckinAccountSnapshot,
  AutoCheckinPreferences,
  AutoCheckinRetryState,
  AutoCheckinRunResult,
  AutoCheckinRunSummary,
  AutoCheckinSkipReason,
  AutoCheckinStatus,
  CHECKIN_RESULT_STATUS,
  type AutoCheckinRunType,
  type CheckinAccountResult,
  type CheckinResultStatus,
} from "~/types/autoCheckin"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
  onAlarm,
} from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"

import { resolveAutoCheckinProvider } from "./providers"
import { autoCheckinStorage } from "./storage"

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

/**
 * Scheduler service for Auto Check-in
 *
 * Scheduling model:
 * - A dedicated *daily* alarm runs the normal auto check-in at most once per local day.
 * - A separate *retry* alarm retries only the accounts that failed in today's normal run.
 */
class AutoCheckinScheduler {
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

  private calculateDeterministicTrigger(
    config: AutoCheckinPreferences,
    now: Date,
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

    const target = new Date(now)
    target.setHours(
      Math.floor(deterministicMinutes / 60),
      deterministicMinutes % 60,
      0,
      0,
    )

    if (target <= now) {
      target.setDate(target.getDate() + 1)
    }

    return target
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
  private computeNextDailyTriggerTime(
    config: AutoCheckinPreferences,
    status: AutoCheckinStatus | null,
    now: Date,
  ): Date | null {
    const ranToday = status?.lastDailyRunDay === this.getLocalDay(now)

    if (config.scheduleMode === AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC) {
      const baseNow = ranToday ? this.addLocalDays(now, 1) : now
      const deterministic = this.calculateDeterministicTrigger(config, baseNow)
      if (deterministic) {
        return deterministic
      }
    }

    if (ranToday) {
      const tomorrowStart = this.startOfLocalDay(this.addLocalDays(now, 1))
      return this.calculateRandomTriggerForDay(
        config.windowStart,
        config.windowEnd,
        tomorrowStart,
      )
    }

    return this.calculateRandomTrigger(
      config.windowStart,
      config.windowEnd,
      now,
    )
  }

  private recalculateSummaryFromResults(
    perAccount: Record<string, CheckinAccountResult>,
    previousSummary?: AutoCheckinRunSummary,
  ): AutoCheckinRunSummary {
    const values = Object.values(perAccount)
    const successStatuses: CheckinResultStatus[] = [
      CHECKIN_RESULT_STATUS.SUCCESS,
      CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
    ]
    const successCount = values.filter((value) =>
      successStatuses.includes(value.status),
    ).length
    const failedCount = values.filter(
      (value) => value.status === CHECKIN_RESULT_STATUS.FAILED,
    ).length
    const skippedCount = values.filter(
      (value) => value.status === CHECKIN_RESULT_STATUS.SKIPPED,
    ).length

    const executed = successCount + failedCount
    const totalEligible =
      previousSummary?.totalEligible ?? executed + skippedCount

    return {
      totalEligible,
      executed,
      successCount,
      failedCount,
      skippedCount,
      needsRetry: failedCount > 0,
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

  /**
   * Returns the i18n key for a skip reason code.
   */
  private getSkipReasonMessageKey(reason: AutoCheckinSkipReason): string {
    return `autoCheckin:skipReasons.${reason}`
  }

  private buildAccountSnapshot(
    account: SiteAccount,
  ): AutoCheckinAccountSnapshot {
    const detectionEnabled = account.checkIn?.enableDetection ?? false
    const autoCheckinEnabled = account.checkIn?.autoCheckInEnabled !== false
    const provider = resolveAutoCheckinProvider(account)
    const providerAvailable = provider ? provider.canCheckIn(account) : false

    let skipReason: AutoCheckinSkipReason | undefined

    if (!detectionEnabled) {
      skipReason = AUTO_CHECKIN_SKIP_REASON.DETECTION_DISABLED
    } else if (!autoCheckinEnabled) {
      skipReason = AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED
    } else if (!provider) {
      skipReason = AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER
    } else if (!providerAvailable) {
      skipReason = AUTO_CHECKIN_SKIP_REASON.PROVIDER_NOT_READY
    }

    return {
      accountId: account.id,
      accountName: `${account.site_name} - ${account.account_info.username}`,
      siteType: account.site_type,
      detectionEnabled,
      autoCheckinEnabled,
      providerAvailable,
      // Display-only field: DO NOT use this for eligibility decisions (provider outcomes are the source of truth).
      isCheckedInToday: account.checkIn?.siteStatus?.isCheckedInToday,
      lastCheckInDate: account.checkIn?.siteStatus?.lastCheckInDate,
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

  /**
   * Execute provider check-in for a single account and normalize the result.
   *
   * Notes:
   * - Provider `already_checked` is treated as a successful outcome (and should not enter retries).
   * - We mark the account as checked-in only for successful outcomes to keep local status fresh.
   */
  private async runAccountCheckin(account: SiteAccount): Promise<{
    result: CheckinAccountResult
    successful: boolean
  }> {
    const buildResult = (
      status: CheckinResultStatus,
      partial?: Pick<
        CheckinAccountResult,
        "message" | "messageKey" | "messageParams" | "rawMessage" | "reasonCode"
      >,
    ): CheckinAccountResult => ({
      accountId: account.id,
      accountName: `${account.site_name} - ${account.account_info.username}`,
      status,
      ...(partial ?? {}),
      timestamp: Date.now(),
    })

    try {
      const provider = resolveAutoCheckinProvider(account)
      if (!provider) {
        const messageKey = "autoCheckin:skipReasons.no_provider"
        console.warn(`[AutoCheckin] ${account.site_name}: ${messageKey}`)
        return {
          result: buildResult(CHECKIN_RESULT_STATUS.FAILED, {
            messageKey,
            reasonCode: AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER,
          }),
          successful: false,
        }
      }

      const providerResult = await provider.checkIn(account)
      const result = buildResult(providerResult.status, {
        messageKey: providerResult.messageKey,
        messageParams: providerResult.messageParams,
        rawMessage: providerResult.rawMessage,
      })

      if (
        providerResult.status === CHECKIN_RESULT_STATUS.SUCCESS ||
        providerResult.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED
      ) {
        await accountStorage.markAccountAsSiteCheckedIn(account.id)
        console.log(
          `[AutoCheckin] ${account.site_name}: ${providerResult.status} - ${providerResult.rawMessage ?? providerResult.messageKey ?? ""}`,
        )
        return { result, successful: true }
      }

      console.error(
        `[AutoCheckin] ${account.site_name}: failed - ${providerResult.rawMessage ?? providerResult.messageKey ?? ""}`,
      )
      return { result, successful: false }
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      console.error(
        `[AutoCheckin] ${account.site_name}: error - ${errorMessage}`,
      )
      return {
        result: buildResult(CHECKIN_RESULT_STATUS.FAILED, {
          rawMessage: errorMessage,
        }),
        successful: false,
      }
    }
  }

  /**
   * Initialize the scheduler
   *
   * Idempotent: installs alarm listener and restores alarms when supported.
   */
  async initialize() {
    if (this.isInitialized) {
      console.log("[AutoCheckin] Scheduler already initialized")
      return
    }

    try {
      // Set up alarm listener (if supported)
      if (hasAlarmsAPI()) {
        onAlarm((alarm) => {
          if (alarm.name === AutoCheckinScheduler.DAILY_ALARM_NAME) {
            void this.handleDailyAlarm(alarm).catch((error) => {
              console.error(
                "[AutoCheckin] Daily alarm execution failed:",
                error,
              )
            })
            return
          }

          if (alarm.name === AutoCheckinScheduler.RETRY_ALARM_NAME) {
            void this.handleRetryAlarm(alarm).catch((error) => {
              console.error(
                "[AutoCheckin] Retry alarm execution failed:",
                error,
              )
            })
            return
          }

          if (alarm.name === AutoCheckinScheduler.LEGACY_ALARM_NAME) {
            console.warn(
              "[AutoCheckin] Legacy alarm detected; clearing and restoring daily schedule",
            )
            void this.scheduleNextRun().catch((error) => {
              console.error("[AutoCheckin] Failed to restore schedule:", error)
            })
          }
        })

        await this.scheduleNextRun({ preserveExisting: true })
      } else {
        console.warn(
          "[AutoCheckin] Alarms API not available, automatic check-in disabled",
        )
      }

      this.isInitialized = true
      console.log("[AutoCheckin] Scheduler initialized")
    } catch (error) {
      console.error("[AutoCheckin] Failed to initialize scheduler:", error)
    }
  }

  /**
   * Restore/schedule daily + retry alarms.
   *
   * When `preserveExisting` is true we reuse any surviving alarms to avoid
   * re-randomizing on background restarts, only recreating missing alarms.
   */
  async scheduleNextRun(options?: { preserveExisting?: boolean }) {
    if (!hasAlarmsAPI()) {
      console.warn("[AutoCheckin] Alarms API not supported, cannot schedule")
      return
    }

    const prefs = await userPreferences.getPreferences()
    const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
    const currentStatus = await autoCheckinStorage.getStatus()

    // Always remove the legacy single-alarm schedule to prevent duplicate executions.
    await clearAlarm(AutoCheckinScheduler.LEGACY_ALARM_NAME)

    if (!config.globalEnabled) {
      await clearAlarm(AutoCheckinScheduler.DAILY_ALARM_NAME)
      await clearAlarm(AutoCheckinScheduler.RETRY_ALARM_NAME)
      console.log("[AutoCheckin] Auto check-in disabled, alarms cleared")
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
    options?: { preserveExisting?: boolean },
  ) {
    const currentStatus = await autoCheckinStorage.getStatus()
    const existingAlarm = options?.preserveExisting
      ? await getAlarm(AutoCheckinScheduler.DAILY_ALARM_NAME)
      : undefined

    if (options?.preserveExisting && existingAlarm?.scheduledTime) {
      const scheduledTime = new Date(existingAlarm.scheduledTime)
      const scheduledIso = scheduledTime.toISOString()
      const targetDay = this.getLocalDay(scheduledTime)

      if (
        currentStatus?.nextDailyScheduledAt !== scheduledIso ||
        currentStatus?.dailyAlarmTargetDay !== targetDay ||
        currentStatus?.nextScheduledAt !== scheduledIso
      ) {
        await autoCheckinStorage.saveStatus({
          ...(currentStatus ?? {}),
          nextDailyScheduledAt: scheduledIso,
          dailyAlarmTargetDay: targetDay,
          nextScheduledAt: scheduledIso, // legacy compatibility
        })
        console.log(
          "[AutoCheckin] Synced stored daily schedule with existing alarm",
        )
      }
      return
    }

    if (options?.preserveExisting) {
      console.warn("[AutoCheckin] Daily alarm missing on startup, restoring...")
    }

    await clearAlarm(AutoCheckinScheduler.DAILY_ALARM_NAME)

    const now = new Date()
    const nextTriggerTime = this.computeNextDailyTriggerTime(
      config,
      currentStatus,
      now,
    )

    if (!nextTriggerTime || Number.isNaN(nextTriggerTime.getTime())) {
      console.warn(
        "[AutoCheckin] Invalid schedule configuration; daily alarm not scheduled",
      )
      await autoCheckinStorage.saveStatus({
        ...(currentStatus ?? {}),
        nextDailyScheduledAt: undefined,
        dailyAlarmTargetDay: undefined,
        nextScheduledAt: undefined,
      })
      return
    }

    try {
      await createAlarm(AutoCheckinScheduler.DAILY_ALARM_NAME, {
        when: nextTriggerTime.getTime(),
      })

      const alarm = await getAlarm(AutoCheckinScheduler.DAILY_ALARM_NAME)
      const scheduledTime =
        alarm?.scheduledTime != null ? new Date(alarm.scheduledTime) : null

      const scheduledIso = (scheduledTime ?? nextTriggerTime).toISOString()
      const targetDay = this.getLocalDay(scheduledTime ?? nextTriggerTime)

      await autoCheckinStorage.saveStatus({
        ...(currentStatus ?? {}),
        nextDailyScheduledAt: scheduledIso,
        dailyAlarmTargetDay: targetDay,
        nextScheduledAt: scheduledIso, // legacy compatibility
      })

      console.log("[AutoCheckin] Daily alarm scheduled:", {
        name: AutoCheckinScheduler.DAILY_ALARM_NAME,
        scheduledTime: scheduledTime ?? nextTriggerTime,
      })
    } catch (error) {
      console.error("[AutoCheckin] Failed to create daily alarm:", error)
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
        console.log(
          "[AutoCheckin] Synced stored retry schedule with existing alarm",
        )
      }
      return
    }

    if (options?.preserveExisting) {
      console.warn("[AutoCheckin] Retry alarm missing on startup, restoring...")
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

      console.log("[AutoCheckin] Retry alarm scheduled:", {
        name: AutoCheckinScheduler.RETRY_ALARM_NAME,
        scheduledTime: scheduledTime ?? nextRetryTime,
      })
    } catch (error) {
      console.error("[AutoCheckin] Failed to create retry alarm:", error)
    }
  }

  /**
   * Normal (daily) alarm handler.
   *
   * Runs a normal check-in execution at most once per day and then schedules:
   * - the next daily run for the next day window
   * - any required retry alarm (without overriding the daily schedule)
   */
  private async handleDailyAlarm(alarm: browser.alarms.Alarm) {
    const now = new Date()
    const today = this.getLocalDay(now)

    if (this.dailyRunInFlightDay === today && this.dailyRunInFlightPromise) {
      console.warn(
        "[AutoCheckin] Daily run already in-flight, ignoring trigger",
      )
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
        console.warn("[AutoCheckin] Ignoring stale daily alarm", {
          targetDay,
          today,
        })
        await this.scheduleNextRun()
        return
      }

      console.log(
        "[AutoCheckin] Daily alarm triggered, starting check-in execution",
      )
      try {
        await this.runCheckins({ runType: AUTO_CHECKIN_RUN_TYPE.DAILY })
      } catch (error) {
        console.error(
          "[AutoCheckin] Error during daily check-in execution:",
          error,
        )
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
  async pretriggerDailyOnUiOpen(params?: {
    requestId?: string
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
        await browser.runtime.sendMessage({
          action: "autoCheckinPretrigger:started",
          requestId: params.requestId,
        })
      } catch {
        // Ignore if no UI is listening (popup closed, no receivers, etc.).
      }
    }

    await this.handleDailyAlarm({
      name: AutoCheckinScheduler.DAILY_ALARM_NAME,
      scheduledTime: dailyAlarm.scheduledTime,
    } as browser.alarms.Alarm)

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
      console.warn("[AutoCheckin] Ignoring stale retry alarm", {
        targetDay,
        today,
      })
      await this.clearRetryAlarmAndState(currentStatus)
      return
    }

    console.log("[AutoCheckin] Retry alarm triggered, starting retries")
    try {
      await this.runRetryCheckins()
    } catch (error) {
      console.error("[AutoCheckin] Error during retry execution:", error)
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
    await this.handleDailyAlarm({
      name: AutoCheckinScheduler.DAILY_ALARM_NAME,
      scheduledTime: Date.now(),
    } as browser.alarms.Alarm)
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

    const now = new Date()
    const today = this.getLocalDay(now)
    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)

    let desiredWhen = now.getTime() + minutesFromNow * 60_000
    if (desiredWhen > endOfToday.getTime()) {
      desiredWhen = endOfToday.getTime()
    }

    if (desiredWhen <= now.getTime()) {
      throw new Error(
        "[AutoCheckin] Cannot schedule daily alarm for today (too close to day boundary)",
      )
    }

    await createAlarm(AutoCheckinScheduler.DAILY_ALARM_NAME, {
      when: desiredWhen,
    })

    let alarm = await getAlarm(AutoCheckinScheduler.DAILY_ALARM_NAME)
    let scheduledWhen = alarm?.scheduledTime ?? desiredWhen
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

    const currentStatus = await autoCheckinStorage.getStatus()
    const scheduledIso = new Date(scheduledWhen).toISOString()

    await autoCheckinStorage.saveStatus({
      ...(currentStatus ?? {}),
      nextDailyScheduledAt: scheduledIso,
      dailyAlarmTargetDay: today,
      nextScheduledAt: scheduledIso, // legacy compatibility
    })

    console.log("[AutoCheckin] Debug scheduled daily alarm for today:", {
      when: scheduledWhen,
    })

    return scheduledWhen
  }

  /**
   * Execute check-ins for all eligible accounts.
   *
   * Run types:
   * - `AUTO_CHECKIN_RUN_TYPE.DAILY`: invoked by the daily alarm. Records `lastDailyRunDay` and builds a retry queue
   *   from today's *failed* runnable accounts only.
   * - `AUTO_CHECKIN_RUN_TYPE.MANUAL`: invoked by the UI. Does not create a new retry queue, but can shrink an
   *   existing queue for today based on the latest results.
   *
   * Important: we DO NOT use `checkIn.siteStatus.isCheckedInToday` for eligibility because it
   * is not trusted. Providers must return `already_checked` when appropriate.
   */
  async runCheckins(options?: { runType?: AutoCheckinRunType }): Promise<void> {
    // Default to manual runs for UI-triggered or debug entry points.
    const runType = options?.runType ?? AUTO_CHECKIN_RUN_TYPE.MANUAL
    const isDailyRun = runType === AUTO_CHECKIN_RUN_TYPE.DAILY

    console.log(`[AutoCheckin] Starting check-in execution (${runType})`)
    const startTime = Date.now()
    const now = new Date()
    const today = this.getLocalDay(now)
    const currentStatus = await autoCheckinStorage.getStatus()

    try {
      // Get preferences
      const prefs = await userPreferences.getPreferences()
      const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!

      if (!config.globalEnabled) {
        console.log("[AutoCheckin] Global feature disabled, skipping")
        return
      }

      // Get all accounts, then exclude disabled accounts from runnable selection.
      // Disabled accounts must not participate, but we still record an explicit
      // skip reason so background status/history can explain why an account was skipped.
      const allAccounts = await accountStorage.getAllAccounts()
      const enabledAccounts = allAccounts.filter(
        (account) => account.disabled !== true,
      )
      const disabledAccounts = allAccounts.filter(
        (account) => account.disabled === true,
      )

      // Filter accounts with detection enabled
      const detectionEnabledAccounts = enabledAccounts.filter(
        (account) => account.checkIn?.enableDetection,
      )

      const accountSnapshots: AutoCheckinAccountSnapshot[] = []
      const runnableAccounts: SiteAccount[] = []

      // Build snapshots and determine runnable accounts
      for (const account of detectionEnabledAccounts) {
        const snapshot = this.buildAccountSnapshot(account)
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
          accountName: `${account.site_name} - ${account.account_info.username}`,
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          messageKey: this.getSkipReasonMessageKey(
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
            messageKey: this.getSkipReasonMessageKey(snapshot.skipReason),
            reasonCode: snapshot.skipReason,
            timestamp,
          }
        }
      }

      console.log(
        `[AutoCheckin] Tracking ${detectionEnabledAccounts.length} accounts, runnable: ${runnableAccounts.length}`,
      )

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

        await autoCheckinStorage.saveStatus({
          ...(currentStatus ?? {}),
          lastRunAt: new Date().toISOString(),
          lastRunResult: AUTO_CHECKIN_RUN_RESULT.SUCCESS,
          perAccount: results,
          summary,
          accountsSnapshot: this.attachResultsToSnapshots(
            accountSnapshots,
            results,
          ),
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
        return
      }

      // Execute check-ins concurrently
      let successCount = 0
      let failedCount = 0

      const checkinOutcomes = await Promise.all(
        runnableAccounts.map((account) => this.runAccountCheckin(account)),
      )

      for (const outcome of checkinOutcomes) {
        results[outcome.result.accountId] = outcome.result
        if (outcome.successful) {
          successCount++
        } else {
          failedCount++
        }
      }

      // Determine overall result
      let overallResult: AutoCheckinRunResult = AUTO_CHECKIN_RUN_RESULT.SUCCESS
      if (failedCount > 0 && successCount > 0) {
        overallResult = AUTO_CHECKIN_RUN_RESULT.PARTIAL
      } else if (failedCount > 0) {
        overallResult = AUTO_CHECKIN_RUN_RESULT.FAILED
      }

      const skippedCount = accountSnapshots.length - runnableAccounts.length
      const summaryNeedsRetry = failedCount > 0 && runnableAccounts.length > 0

      const summary: AutoCheckinRunSummary = {
        totalEligible: accountSnapshots.length,
        executed: runnableAccounts.length,
        successCount,
        failedCount,
        skippedCount,
        needsRetry: summaryNeedsRetry,
      }

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
            .filter((outcome) => !outcome.successful)
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
          return result ? result.status === CHECKIN_RESULT_STATUS.FAILED : true
        })
        retryState =
          pending.length > 0
            ? { ...retryState, pendingAccountIds: pending }
            : undefined
      }

      const pendingRetry = Boolean(
        retryState?.day === today && retryState.pendingAccountIds.length > 0,
      )

      await autoCheckinStorage.saveStatus({
        ...(currentStatus ?? {}),
        lastRunAt: new Date().toISOString(),
        lastRunResult: overallResult,
        perAccount: results,
        summary,
        retryState,
        pendingRetry,
        accountsSnapshot: this.attachResultsToSnapshots(
          accountSnapshots,
          results,
        ),
        ...(isDailyRun
          ? {
              lastDailyRunDay: today,
              nextRetryScheduledAt: undefined,
              retryAlarmTargetDay: undefined,
            }
          : {}),
      })

      const duration = Date.now() - startTime
      console.log(
        `[AutoCheckin] Execution completed in ${duration}ms: ${successCount} succeeded, ${failedCount} failed`,
      )
    } catch (error) {
      console.error("[AutoCheckin] Execution failed:", error)
      await autoCheckinStorage.saveStatus({
        ...(currentStatus ?? {}),
        lastRunAt: new Date().toISOString(),
        lastRunResult: AUTO_CHECKIN_RUN_RESULT.FAILED,
        perAccount: {},
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
  private async runRetryCheckins(): Promise<void> {
    const now = new Date()
    const today = this.getLocalDay(now)

    const prefs = await userPreferences.getPreferences()
    const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
    const currentStatus = await autoCheckinStorage.getStatus()

    if (!config.globalEnabled || !config.retryStrategy?.enabled) {
      console.log("[AutoCheckin] Retry skipped (feature disabled)")
      await this.clearRetryAlarmAndState(currentStatus)
      return
    }

    // Ensure that today's normal run has executed
    if (
      currentStatus?.lastDailyRunDay !== today ||
      currentStatus?.retryState?.day !== today
    ) {
      console.log("[AutoCheckin] Retry skipped (no normal run today)")
      await this.clearRetryAlarmAndState(currentStatus)
      return
    }

    // Ensure we have a retry state with pending accounts
    const retryState = currentStatus.retryState
    if (!retryState || retryState.pendingAccountIds.length === 0) {
      console.log("[AutoCheckin] Retry skipped (no pending accounts)")
      await this.clearRetryAlarmAndState(currentStatus)
      return
    }

    const maxAttempts = config.retryStrategy.maxAttemptsPerDay
    const attemptsByAccount: Record<string, number> = {
      ...(retryState.attemptsByAccount ?? {}),
    }

    const updates: Record<string, CheckinAccountResult> = {}
    const remaining: string[] = []

    for (const accountId of retryState.pendingAccountIds) {
      // Default to 1 to represent the initial daily run failure when the stored map is missing.
      const attempts = attemptsByAccount[accountId] ?? 1
      if (attempts >= maxAttempts) {
        continue
      }

      const account = await accountStorage.getAccountById(accountId)
      if (!account || account.disabled === true) {
        updates[accountId] = {
          accountId,
          accountName: account
            ? `${account.site_name} - ${account.account_info.username}`
            : accountId,
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          messageKey: this.getSkipReasonMessageKey(
            AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
          ),
          reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
          timestamp: Date.now(),
        }
        continue
      }

      const snapshot = this.buildAccountSnapshot(account)
      if (snapshot.skipReason) {
        updates[accountId] = {
          accountId,
          accountName: snapshot.accountName,
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          messageKey: this.getSkipReasonMessageKey(snapshot.skipReason),
          reasonCode: snapshot.skipReason,
          timestamp: Date.now(),
        }
        continue
      }

      const outcome = await this.runAccountCheckin(account)
      // Persist that we've attempted one more time for this account today, regardless of outcome.
      attemptsByAccount[accountId] = attempts + 1
      updates[accountId] = outcome.result

      if (!outcome.successful && attemptsByAccount[accountId] < maxAttempts) {
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

    let lastRunResult: AutoCheckinRunResult = AUTO_CHECKIN_RUN_RESULT.SUCCESS
    if (summary.failedCount > 0 && summary.successCount > 0) {
      lastRunResult = AUTO_CHECKIN_RUN_RESULT.PARTIAL
    } else if (summary.failedCount > 0) {
      lastRunResult = AUTO_CHECKIN_RUN_RESULT.FAILED
    }

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
    await this.scheduleNextRun()
    console.log("[AutoCheckin] Settings updated:", updated)
  }

  /**
   * Manual retry for a single account.
   *
   * If this account is currently in today's retry queue, a successful manual retry removes it
   * from the pending list (and may clear the retry alarm if nothing else remains).
   */
  async retryAccount(accountId: string) {
    const today = this.getLocalDay()
    const account = await accountStorage.getAccountById(accountId)

    if (!account) {
      throw new Error(t("messages:storage.accountNotFound", { id: accountId }))
    }

    const result: CheckinAccountResult =
      account.disabled === true
        ? {
            accountId: account.id,
            accountName: `${account.site_name} - ${account.account_info.username}`,
            status: CHECKIN_RESULT_STATUS.SKIPPED,
            messageKey: this.getSkipReasonMessageKey(
              AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
            ),
            reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
            timestamp: Date.now(),
          }
        : (await this.runAccountCheckin(account)).result

    const currentStatus = (await autoCheckinStorage.getStatus()) || {}

    const perAccount: Record<string, CheckinAccountResult> = {
      ...(currentStatus.perAccount ?? {}),
      [result.accountId]: result,
    }

    const summary = this.recalculateSummaryFromResults(
      perAccount,
      currentStatus.summary,
    )

    let lastRunResult: AutoCheckinRunResult = AUTO_CHECKIN_RUN_RESULT.SUCCESS
    if (summary.failedCount > 0 && summary.successCount > 0) {
      lastRunResult = AUTO_CHECKIN_RUN_RESULT.PARTIAL
    } else if (summary.failedCount > 0) {
      lastRunResult = AUTO_CHECKIN_RUN_RESULT.FAILED
    }

    let retryState = currentStatus.retryState
    if (
      retryState?.day === today &&
      retryState.pendingAccountIds.includes(accountId)
    ) {
      if (result.status !== CHECKIN_RESULT_STATUS.FAILED) {
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
  async getAccountDisplayData(accountId: string): Promise<DisplaySiteData> {
    const account = await accountStorage.getAccountById(accountId)

    if (!account) {
      throw new Error(t("messages:storage.accountNotFound", { id: accountId }))
    }
    if (account.disabled === true) {
      throw new Error(t("messages:storage.accountDisabled", { id: accountId }))
    }

    return accountStorage.convertToDisplayData(account) as DisplaySiteData
  }
}

// Create singleton instance
export const autoCheckinScheduler = new AutoCheckinScheduler()

/**
 * Message handler for Auto Check-in actions (run, retry, get status/settings).
 * Keeps background-only logic centralized for content scripts/options UI calls.
 * @param request Incoming message with action/payload.
 * @param sendResponse Callback to reply to sender.
 */
export const handleAutoCheckinMessage = async (
  request: any,
  sendResponse: (response: any) => void,
) => {
  try {
    switch (request.action) {
      case "autoCheckin:runNow":
        try {
          await autoCheckinScheduler.runCheckins({
            runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
          })
          sendResponse({ success: true })
        } catch (e) {
          // Propagate the error to the caller (options UI/content scripts) for user-visible feedback.
          console.error("[AutoCheckin] Manual run failed:", e)
          sendResponse({ success: false, error: getErrorMessage(e) })
        } finally {
          await autoCheckinScheduler.scheduleNextRun({ preserveExisting: true })
        }
        break

      case "autoCheckin:debugTriggerDailyAlarmNow": {
        if (
          import.meta.env.MODE !== "development" &&
          import.meta.env.MODE !== "test"
        ) {
          sendResponse({
            success: false,
            error:
              "Debug action is only available in development/test mode (autoCheckin:debugTriggerDailyAlarmNow)",
          })
          break
        }
        await autoCheckinScheduler.debugTriggerDailyAlarmNow()
        sendResponse({ success: true })
        break
      }

      case "autoCheckin:debugTriggerRetryAlarmNow": {
        if (
          import.meta.env.MODE !== "development" &&
          import.meta.env.MODE !== "test"
        ) {
          sendResponse({
            success: false,
            error:
              "Debug action is only available in development/test mode (autoCheckin:debugTriggerRetryAlarmNow)",
          })
          break
        }
        await autoCheckinScheduler.debugTriggerRetryAlarmNow()
        sendResponse({ success: true })
        break
      }

      case "autoCheckin:debugResetLastDailyRunDay": {
        if (
          import.meta.env.MODE !== "development" &&
          import.meta.env.MODE !== "test"
        ) {
          sendResponse({
            success: false,
            error:
              "Debug action is only available in development/test mode (autoCheckin:debugResetLastDailyRunDay)",
          })
          break
        }
        await autoCheckinScheduler.debugResetLastDailyRunDay()
        sendResponse({ success: true })
        break
      }

      case "autoCheckin:debugScheduleDailyAlarmForToday": {
        if (
          import.meta.env.MODE !== "development" &&
          import.meta.env.MODE !== "test"
        ) {
          sendResponse({
            success: false,
            error:
              "Debug action is only available in development/test mode (autoCheckin:debugScheduleDailyAlarmForToday)",
          })
          break
        }
        const scheduledTime =
          await autoCheckinScheduler.debugScheduleDailyAlarmForToday({
            minutesFromNow: request.minutesFromNow,
          })
        sendResponse({ success: true, scheduledTime })
        break
      }

      case "autoCheckin:pretriggerDailyOnUiOpen": {
        const result = await autoCheckinScheduler.pretriggerDailyOnUiOpen({
          requestId: request.requestId,
          dryRun: request.dryRun,
          debug: request.debug,
        })
        sendResponse({ success: true, ...result })
        break
      }

      case "autoCheckin:retryAccount":
        if (!request.accountId) {
          sendResponse({ success: false, error: "Missing accountId" })
          break
        }
        await autoCheckinScheduler.retryAccount(request.accountId)
        sendResponse({ success: true })
        break

      case "autoCheckin:getAccountInfo": {
        if (!request.accountId) {
          sendResponse({ success: false, error: "Missing accountId" })
          break
        }
        const displayData = await autoCheckinScheduler.getAccountDisplayData(
          request.accountId,
        )
        sendResponse({ success: true, data: displayData })
        break
      }

      case "autoCheckin:getStatus": {
        const status = await autoCheckinStorage.getStatus()
        sendResponse({ success: true, data: status })
        break
      }

      case "autoCheckin:updateSettings":
        await autoCheckinScheduler.updateSettings(request.settings)
        sendResponse({ success: true })
        break

      default:
        sendResponse({ success: false, error: "Unknown action" })
    }
  } catch (error) {
    console.error("[AutoCheckin] Message handling failed:", error)
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}
