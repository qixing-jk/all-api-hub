import { logger } from "~/services/checkin/autoCheckin/diagnostics"
import {
  computeNextDailyTriggerPlan,
  computeNextRetryTriggerTime,
  type AutoCheckinDailyTriggerPlan,
} from "~/services/checkin/autoCheckin/scheduling/dailyPlanning"
import { pruneExhaustedPending } from "~/services/checkin/autoCheckin/scheduling/retryQueue"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  AUTO_CHECKIN_SCHEDULE_MODE,
  type AutoCheckinPreferences,
} from "~/types/autoCheckin"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
} from "~/utils/browser/alarms"
import { formatLocalDayKey } from "~/utils/core/dayKey"

export const AUTO_CHECKIN_ALARM_NAMES = {
  Legacy: "autoCheckin",
  Daily: "autoCheckinDaily",
  Retry: "autoCheckinRetry",
} as const

/** Reconciles browser alarms with durable daily and retry schedule facts. */
class AutoCheckinAlarmSchedule {
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

    await createAlarm(AUTO_CHECKIN_ALARM_NAMES.Daily, {
      when: nextWhen,
    })

    let alarm = await getAlarm(AUTO_CHECKIN_ALARM_NAMES.Daily)
    let scheduledWhen = alarm?.scheduledTime ?? nextWhen
    let scheduledDay = formatLocalDayKey(new Date(scheduledWhen))

    if (scheduledDay !== today) {
      const fallbackWhen = endOfToday.getTime()
      if (fallbackWhen <= now.getTime()) {
        throw new Error(
          "[AutoCheckin] Cannot schedule daily alarm for today (end-of-day already passed)",
        )
      }

      await createAlarm(AUTO_CHECKIN_ALARM_NAMES.Daily, {
        when: fallbackWhen,
      })
      alarm = await getAlarm(AUTO_CHECKIN_ALARM_NAMES.Daily)
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
    await clearAlarm(AUTO_CHECKIN_ALARM_NAMES.Legacy)

    if (!config.globalEnabled) {
      await clearAlarm(AUTO_CHECKIN_ALARM_NAMES.Daily)
      await clearAlarm(AUTO_CHECKIN_ALARM_NAMES.Retry)
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
  async scheduleDailyAlarm(
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
      ? await getAlarm(AUTO_CHECKIN_ALARM_NAMES.Daily)
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

    await clearAlarm(AUTO_CHECKIN_ALARM_NAMES.Daily)

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
            await createAlarm(AUTO_CHECKIN_ALARM_NAMES.Daily, {
              when: nextTriggerPlan.triggerTime.getTime(),
            })

            const alarm = await getAlarm(AUTO_CHECKIN_ALARM_NAMES.Daily)
            return alarm?.scheduledTime != null
              ? new Date(alarm.scheduledTime)
              : nextTriggerPlan.triggerTime
          })()

      await this.syncDailyScheduleStatus(scheduledTime)

      logger.info("Daily alarm scheduled", {
        name: AUTO_CHECKIN_ALARM_NAMES.Daily,
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
  async clearRetryAlarm(maxAttempts?: number) {
    await clearAlarm(AUTO_CHECKIN_ALARM_NAMES.Retry)
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
  async clearRetryAlarmAndState() {
    await clearAlarm(AUTO_CHECKIN_ALARM_NAMES.Retry)

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
  async scheduleRetryAlarm(
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
      ? await getAlarm(AUTO_CHECKIN_ALARM_NAMES.Retry)
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

    await clearAlarm(AUTO_CHECKIN_ALARM_NAMES.Retry)

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
      await createAlarm(AUTO_CHECKIN_ALARM_NAMES.Retry, {
        when: nextRetryTime.getTime(),
      })

      const alarm = await getAlarm(AUTO_CHECKIN_ALARM_NAMES.Retry)
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
        name: AUTO_CHECKIN_ALARM_NAMES.Retry,
        scheduledTime: scheduledTime ?? nextRetryTime,
      })
    } catch (error) {
      logger.error("Failed to create retry alarm", error)
    }
  }

  /** Schedules an explicit same-day debug trigger and persists its accepted time. */
  async scheduleDailyAlarmForToday(desiredWhen: number) {
    const scheduledTime = await this.createDailyAlarmForToday(desiredWhen)
    await this.syncDailyScheduleStatus(scheduledTime)
    return scheduledTime
  }
}
export const autoCheckinAlarmSchedule = new AutoCheckinAlarmSchedule()
