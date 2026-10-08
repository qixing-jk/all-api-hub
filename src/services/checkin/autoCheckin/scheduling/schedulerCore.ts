import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountReadModels } from "~/services/accounts/accountStorage/accountReadModels"
import { logger } from "~/services/checkin/autoCheckin/diagnostics"
import { createAutomaticCheckinExecution } from "~/services/checkin/autoCheckin/execution/executionIntent"
import {
  retryAccount,
  verifyAccountStatus,
} from "~/services/checkin/autoCheckin/execution/runAccountActions"
import { runCheckins } from "~/services/checkin/autoCheckin/execution/runCheckins"
import type { AutoCheckinRetryScheduling } from "~/services/checkin/autoCheckin/execution/runContracts"
import { runRetryCheckins } from "~/services/checkin/autoCheckin/execution/runRetryCheckins"
import {
  computeNextDailyTriggerPlan,
  computeNextRetryTriggerTime,
  type AutoCheckinDailyTriggerPlan,
} from "~/services/checkin/autoCheckin/scheduling/dailyPlanning"
import { DailyTriggerWorkflow } from "~/services/checkin/autoCheckin/scheduling/dailyTriggerWorkflow"
import { pruneExhaustedPending } from "~/services/checkin/autoCheckin/scheduling/retryQueue"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import { type DisplaySiteData } from "~/types"
import {
  AUTO_CHECKIN_SCHEDULE_MODE,
  type AutoCheckinPreferences,
} from "~/types/autoCheckin"
import {
  TEMP_WINDOW_REQUEST_SOURCES,
  type TempWindowRequestSource,
} from "~/types/tempWindowFetch"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
  onAlarm,
} from "~/utils/browser/alarms"
import { formatLocalDayKey } from "~/utils/core/dayKey"
import { t } from "~/utils/i18n/core"

/**
 * Scheduler service for Auto Check-in
 *
 * Scheduling model:
 * - A dedicated *daily* alarm runs the normal auto check-in at most once per local day.
 * - A separate *retry* alarm retries only the accounts that failed in today's normal run.
 */
class AutoCheckinScheduler {
  private readonly retryScheduling: AutoCheckinRetryScheduling = {
    clearRetryAlarm: (maxAttempts) => this.clearRetryAlarm(maxAttempts),
    clearRetryAlarmAndState: () => this.clearRetryAlarmAndState(),
    scheduleRetryAlarm: (config) => this.scheduleRetryAlarm(config),
  }

  /** Executes an authorized batch while this owner retains alarm and in-flight state. */
  runCheckins(options: Parameters<typeof runCheckins>[0]) {
    return runCheckins(options)
  }

  /** Runs the current same-day retry queue. */
  private runRetryCheckins(
    source: TempWindowRequestSource,
    execution: ProtectionBypassExecution,
  ) {
    return runRetryCheckins(source, execution, this.retryScheduling)
  }

  /** Executes one authorized account retry and reconciles its persisted outcome. */
  retryAccount(
    accountId: string,
    source: TempWindowRequestSource,
    execution: ProtectionBypassExecution,
  ) {
    return retryAccount(accountId, source, execution, this.retryScheduling)
  }

  /** Reads and reconciles selected-method status without mutation. */
  verifyAccountStatus(accountId: string) {
    return verifyAccountStatus(accountId, this.retryScheduling)
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

  private isInitialized = false

  private readonly dailyTrigger = new DailyTriggerWorkflow({
    dailyAlarmName: AutoCheckinScheduler.DAILY_ALARM_NAME,
    runCheckins: (options) => this.runCheckins(options),
    scheduleNextRun: () => this.scheduleNextRun(),
  })

  private async syncDailyScheduleStatus(
    scheduledTime: Date,
    targetDay = formatLocalDayKey(scheduledTime),
  ) {
    const scheduledIso = scheduledTime.toISOString()

    await autoCheckinStorage.updateStatus((current) => {
      if (
        current?.nextDailyScheduledAt === scheduledIso &&
        current?.dailyAlarmTargetDay === targetDay &&
        current?.nextScheduledAt === scheduledIso
      ) {
        // Already in sync with the alarm; skip the write and the storage
        // change notifications it would emit.
        return { patch: null }
      }

      return {
        patch: {
          nextDailyScheduledAt: scheduledIso,
          dailyAlarmTargetDay: targetDay,
          nextScheduledAt: scheduledIso, // legacy compatibility
        },
      }
    })
  }

  private async clearDailyScheduleStatus() {
    await autoCheckinStorage.updateStatus((current) => ({
      patch: current
        ? {
            nextDailyScheduledAt: undefined,
            dailyAlarmTargetDay: undefined,
            nextScheduledAt: undefined,
          }
        : null,
    }))
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
        formatLocalDayKey(scheduledTime) ===
          formatLocalDayKey(nextTriggerPlan.triggerTime) &&
        scheduledTime.getTime() <= nextTriggerPlan.triggerTime.getTime()
      )
    }

    return (
      formatLocalDayKey(scheduledTime) ===
        formatLocalDayKey(nextTriggerPlan.triggerTime) &&
      scheduledTime.getHours() === nextTriggerPlan.triggerTime.getHours() &&
      scheduledTime.getMinutes() === nextTriggerPlan.triggerTime.getMinutes()
    )
  }

  private async createDailyAlarmForToday(desiredWhen: number): Promise<Date> {
    const now = new Date()
    const today = formatLocalDayKey(now)
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
    let scheduledDay = formatLocalDayKey(new Date(scheduledWhen))

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
      scheduledDay = formatLocalDayKey(new Date(scheduledWhen))
    }

    if (scheduledDay !== today) {
      throw new Error(
        `[AutoCheckin] Failed to schedule daily alarm for today (scheduledDay=${scheduledDay}, today=${today})`,
      )
    }

    return new Date(scheduledWhen)
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

    // Always remove the legacy single-alarm schedule to prevent duplicate executions.
    await clearAlarm(AutoCheckinScheduler.LEGACY_ALARM_NAME)

    if (!config.globalEnabled) {
      await clearAlarm(AutoCheckinScheduler.DAILY_ALARM_NAME)
      await clearAlarm(AutoCheckinScheduler.RETRY_ALARM_NAME)
      logger.info("Auto check-in disabled; alarms cleared")
      await autoCheckinStorage.updateStatus((current) => ({
        patch: current
          ? {
              nextDailyScheduledAt: undefined,
              dailyAlarmTargetDay: undefined,
              nextRetryScheduledAt: undefined,
              retryAlarmTargetDay: undefined,
              retryState: undefined,
              pendingRetry: false,
              nextScheduledAt: undefined,
            }
          : null,
      }))
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
    const nextTriggerPlan = computeNextDailyTriggerPlan(
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
      const targetDay = formatLocalDayKey(scheduledTime)

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
      } else {
        // Reuse the surviving alarm; just make sure the stored schedule
        // matches it. The sync skips the write when it already does.
        await this.syncDailyScheduleStatus(scheduledTime, targetDay)
        logger.debug("Synced stored daily schedule with existing alarm")
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
      await this.clearDailyScheduleStatus()
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

      await this.syncDailyScheduleStatus(scheduledTime)

      logger.info("Daily alarm scheduled", {
        name: AutoCheckinScheduler.DAILY_ALARM_NAME,
        scheduledTime,
      })
    } catch (error) {
      logger.error("Failed to create daily alarm", error)
      await this.clearDailyScheduleStatus()
    }
  }

  /**
   * Clear the retry alarm without touching the day's retry ledger.
   *
   * The ledger outlives the work list: an account that spent the day's attempt
   * budget must stay spent, so clearing "there is nothing to retry right now"
   * must not also clear what today already cost. Passing `maxAttempts` also drops
   * exhausted accounts from the stored work list, which is how a queue whose
   * accounts all ran out of budget stops looking like pending work.
   */
  private async clearRetryAlarm(maxAttempts?: number) {
    await clearAlarm(AutoCheckinScheduler.RETRY_ALARM_NAME)
    const today = formatLocalDayKey()

    await autoCheckinStorage.updateStatus((current) => {
      if (!current) return { patch: null }
      const ledger = current.retryState
      const nextRetryState =
        maxAttempts != null && ledger?.day === today
          ? pruneExhaustedPending({ state: ledger, maxAttempts })
          : ledger

      return {
        patch: {
          nextRetryScheduledAt: undefined,
          retryAlarmTargetDay: undefined,
          pendingRetry: false,
          ...(nextRetryState === ledger ? {} : { retryState: nextRetryState }),
        },
      }
    })
  }

  /**
   * Clear the retry alarm and today's retry ledger.
   *
   * Used when no retry can happen today at all: another day's ledger, the
   * feature or the retry strategy switched off. "Nothing to retry right now"
   * is `clearRetryAlarm` instead, because the day's spent attempts stay spent.
   */
  private async clearRetryAlarmAndState() {
    await clearAlarm(AutoCheckinScheduler.RETRY_ALARM_NAME)

    await autoCheckinStorage.updateStatus((current) => ({
      patch: current
        ? {
            nextRetryScheduledAt: undefined,
            retryAlarmTargetDay: undefined,
            retryState: undefined,
            pendingRetry: false,
          }
        : null,
    }))
  }

  /**
   * Persist the retry alarm target together with the retry queue it belongs to.
   *
   * The queue is re-derived from the stored status under the write lock rather
   * than from the caller's snapshot, so a run that finished while the alarm was
   * being (re)created keeps its results and its updated queue.
   */
  private async syncRetryScheduleStatus(params: {
    scheduledIso: string
    day: string
    maxAttempts: number
  }) {
    const { scheduledIso, day, maxAttempts } = params

    await autoCheckinStorage.updateStatus((current) => {
      const retryState = current?.retryState

      // Retries are scoped to one local day; a ledger from another day, or none
      // at all, must not be adopted by this alarm.
      if (!retryState || retryState.day !== day) {
        return { patch: null }
      }

      // Pruning the work list must not drop the day's counts: an account that
      // spent the budget stays spent even though nothing is left to run.
      const pruned = pruneExhaustedPending({ state: retryState, maxAttempts })
      const eligiblePending = pruned?.pendingAccountIds ?? []
      if (eligiblePending.length === 0) {
        return { patch: null }
      }

      if (
        current?.nextRetryScheduledAt === scheduledIso &&
        current?.retryAlarmTargetDay === day &&
        current?.pendingRetry === true &&
        retryState.pendingAccountIds.length === eligiblePending.length
      ) {
        // Already in sync with the alarm; skip the write and the storage change
        // notifications it would emit.
        return { patch: null }
      }

      return {
        patch: {
          nextRetryScheduledAt: scheduledIso,
          retryAlarmTargetDay: day,
          retryState: pruned,
          pendingRetry: true,
        },
      }
    })
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
    const today = formatLocalDayKey(now)

    if (!config.retryStrategy?.enabled) {
      await this.clearRetryAlarmAndState()
      return
    }

    // A pending queue is enough. Manual runs do not set lastDailyRunDay.
    if (currentStatus?.retryState?.day !== today) {
      await this.clearRetryAlarmAndState()
      return
    }

    const maxAttempts = config.retryStrategy.maxAttemptsPerDay
    const retryState = currentStatus.retryState
    if (!retryState || retryState.pendingAccountIds.length === 0) {
      await this.clearRetryAlarm(maxAttempts)
      return
    }

    const eligiblePending = retryState.pendingAccountIds.filter((accountId) => {
      const attempts = retryState.attemptsByAccount?.[accountId] ?? 1
      return attempts < maxAttempts
    })

    if (eligiblePending.length === 0) {
      // Every queued account spent the day's budget. Nothing to schedule, and
      // the counts stay: they are what stops the next run from re-adding them.
      await this.clearRetryAlarm(maxAttempts)
      return
    }

    const existingAlarm = options?.preserveExisting
      ? await getAlarm(AutoCheckinScheduler.RETRY_ALARM_NAME)
      : undefined

    if (options?.preserveExisting && existingAlarm?.scheduledTime) {
      const scheduledTime = new Date(existingAlarm.scheduledTime)
      const scheduledIso = scheduledTime.toISOString()
      const targetDay = formatLocalDayKey(scheduledTime)

      // If the preserved alarm targets a different day, treat it as stale and clear it.
      if (targetDay !== today) {
        await this.clearRetryAlarmAndState()
        return
      }

      await this.syncRetryScheduleStatus({
        scheduledIso,
        day: targetDay,
        maxAttempts,
      })
      logger.debug("Synced stored retry schedule with existing alarm")
      return
    }

    if (options?.preserveExisting) {
      logger.warn("Retry alarm missing on startup; restoring")
    }

    await clearAlarm(AutoCheckinScheduler.RETRY_ALARM_NAME)

    const nextRetryTime = computeNextRetryTriggerTime(
      config,
      currentStatus,
      now,
    )
    const retryTargetDay = formatLocalDayKey(nextRetryTime)

    // Do not schedule retries across the day boundary.
    if (retryTargetDay !== today) {
      await this.clearRetryAlarmAndState()
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
      const targetDay = formatLocalDayKey(scheduledTime ?? nextRetryTime)

      await this.syncRetryScheduleStatus({
        scheduledIso,
        day: targetDay,
        maxAttempts,
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
  /** Routes scheduled triggers through the shared daily admission owner. */
  private handleDailyAlarm(
    ...args: Parameters<DailyTriggerWorkflow["handleDailyAlarm"]>
  ) {
    return this.dailyTrigger.handleDailyAlarm(...args)
  }

  /** Routes UI-open diagnostics and triggers through the same daily owner. */
  pretriggerDailyOnUiOpen(
    ...args: Parameters<DailyTriggerWorkflow["pretriggerDailyOnUiOpen"]>
  ) {
    return this.dailyTrigger.pretriggerDailyOnUiOpen(...args)
  }

  /**
   * Retry alarm handler.
   *
   * Retries only accounts from today's retry queue and never modifies the daily alarm schedule.
   */
  private async handleRetryAlarm(alarm: browser.alarms.Alarm) {
    const now = new Date()
    const today = formatLocalDayKey(now)
    const currentStatus = await autoCheckinStorage.getStatus()
    const targetDay =
      currentStatus?.retryAlarmTargetDay ??
      (alarm.scheduledTime != null
        ? formatLocalDayKey(new Date(alarm.scheduledTime))
        : undefined)

    // Stale-alarm guard: never retry failures from a past day.
    if (targetDay && targetDay !== today) {
      logger.warn("Ignoring stale retry alarm", {
        targetDay,
        today,
      })
      await this.clearRetryAlarmAndState()
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
    await autoCheckinStorage.updateStatus((current) => ({
      patch: current?.lastDailyRunDay ? { lastDailyRunDay: undefined } : null,
    }))
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

    const scheduledTime = await this.createDailyAlarmForToday(
      Date.now() + minutesFromNow * 60_000,
    )

    await this.syncDailyScheduleStatus(scheduledTime)

    logger.debug("Debug scheduled daily alarm for today", {
      when: scheduledTime.getTime(),
    })

    return scheduledTime.getTime()
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
   * Return display data for a specific account (used by UI).
   */
  async getAccountDisplayData(
    accountId: string,
    options?: { includeDisabled?: boolean },
  ): Promise<DisplaySiteData> {
    const account = await accountQueries.getAccountById(accountId)

    if (!account) {
      throw new Error(t("messages:storage.accountNotFound", { id: accountId }))
    }
    if (account.disabled === true && !options?.includeDisabled) {
      throw new Error(t("messages:storage.accountDisabled", { id: accountId }))
    }

    const displayAccount = await accountReadModels.getDisplayDataById(accountId)

    return displayAccount ?? accountPresentation.convertToDisplayData(account)
  }
}

export const autoCheckinScheduler = new AutoCheckinScheduler()
