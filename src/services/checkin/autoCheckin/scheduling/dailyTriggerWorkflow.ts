import { RuntimeActionIds } from "~/constants/runtimeActions"
import { logger } from "~/services/checkin/autoCheckin/diagnostics"
import type { runCheckins } from "~/services/checkin/autoCheckin/execution/runCheckins"
import { recalculateSummaryFromResults } from "~/services/checkin/autoCheckin/execution/runResults"
import {
  isMinutesWithinWindow,
  parseTimeToMinutes,
} from "~/services/checkin/autoCheckin/scheduling/dailyPlanning"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import { AUTO_CHECKIN_SESSION_STORAGE_KEYS } from "~/services/core/storageKeys"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import {
  AUTO_CHECKIN_RUN_TYPE,
  type AutoCheckinRunResult,
  type AutoCheckinRunSummary,
} from "~/types/autoCheckin"
import {
  TEMP_WINDOW_REQUEST_SOURCES,
  type TempWindowRequestSource,
} from "~/types/tempWindowFetch"
import { getAlarm, hasAlarmsAPI } from "~/utils/browser/alarms"
import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"
import {
  getSessionStorageValues,
  setSessionStorageValues,
} from "~/utils/browser/storage"
import { formatLocalDayKey } from "~/utils/core/dayKey"

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
  | "status_write_failed_recently"
  | "status_write_guard_unavailable"

/**
 * How long a failed daily status write keeps blocking the pre-trigger.
 *
 * The day guard lives in storage; when that write failed, every UI open would
 * otherwise start another full daily run against the same unrecorded day.
 */
const DAILY_RUN_PERSIST_FAILURE_GUARD_MS = 15 * 60 * 1000

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

/** Owns daily admission and in-flight work shared by alarm and UI triggers. */
export class DailyTriggerWorkflow {
  private dailyRunInFlightDay: string | null = null
  private dailyRunInFlightPromise: Promise<void> | null = null
  private lastDailyRunPersistFailedAt: number | null = null
  private persistFailureGuardLoaded = false
  constructor(
    private readonly deps: {
      dailyAlarmName: string
      runCheckins: typeof runCheckins
      scheduleNextRun: (options?: {
        dailyNotBefore?: number
        suppressRetryRearm?: boolean
      }) => Promise<void>
    },
  ) {}
  async handleDailyAlarm(
    alarm: browser.alarms.Alarm,
    tempWindowRequestSource: TempWindowRequestSource,
    protectionBypassExecution: ProtectionBypassExecution,
  ) {
    const now = new Date()
    const today = formatLocalDayKey(now)

    if (this.dailyRunInFlightDay === today && this.dailyRunInFlightPromise) {
      logger.warn("Daily run already in-flight; ignoring trigger")
      return
    }

    const runPromise = (async () => {
      const currentStatus = await autoCheckinStorage.getStatus()
      const targetDay =
        currentStatus?.dailyAlarmTargetDay ??
        (alarm.scheduledTime != null
          ? formatLocalDayKey(new Date(alarm.scheduledTime))
          : undefined)

      // Stale-alarm guard: never execute a normal run for a past day.
      if (targetDay && targetDay !== today) {
        logger.warn("Ignoring stale daily alarm", {
          targetDay,
          today,
        })
        await this.deps.scheduleNextRun()
        return
      }

      logger.info("Daily alarm triggered; starting check-in execution")
      let persisted = true
      try {
        const outcome = await this.deps.runCheckins({
          runType: AUTO_CHECKIN_RUN_TYPE.DAILY,
          tempWindowRequestSource,
          protectionBypassExecution,
        })
        persisted = outcome?.persisted !== false
      } catch (error) {
        logger.error("Error during daily check-in execution", error)
        persisted = false
      } finally {
        // A run that could not persist never recorded today, so the stored
        // day guard stays stale; remember the failure so the pre-trigger does
        // not start another full run on every UI open.
        this.lastDailyRunPersistFailedAt = persisted ? null : Date.now()
        this.persistFailureGuardLoaded = true
        // Session storage survives worker suspension and is independent of
        // the failing local-storage write. Keep the instance value as fallback.
        await setSessionStorageValues({
          [AUTO_CHECKIN_SESSION_STORAGE_KEYS.DAILY_RUN_PERSIST_FAILED_AT]:
            this.lastDailyRunPersistFailedAt,
        })
        await this.deps.scheduleNextRun(
          this.lastDailyRunPersistFailedAt == null
            ? undefined
            : {
                dailyNotBefore:
                  this.lastDailyRunPersistFailedAt +
                  DAILY_RUN_PERSIST_FAILURE_GUARD_MS,
                suppressRetryRearm: true,
              },
        )
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
    const today = formatLocalDayKey(now)

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

    if (!this.persistFailureGuardLoaded) {
      try {
        const values = await getSessionStorageValues(
          AUTO_CHECKIN_SESSION_STORAGE_KEYS.DAILY_RUN_PERSIST_FAILED_AT,
        )
        const failedAt =
          values[AUTO_CHECKIN_SESSION_STORAGE_KEYS.DAILY_RUN_PERSIST_FAILED_AT]
        if (
          failedAt === null ||
          (typeof failedAt === "number" && Number.isFinite(failedAt))
        ) {
          this.lastDailyRunPersistFailedAt = failedAt
        }
        this.persistFailureGuardLoaded = true
      } catch {
        // The stored day may be stale after a failed write. Block admission
        // until the next UI open can recover the session cooldown marker.
        return returnIneligible("status_write_guard_unavailable")
      }
    }

    if (
      typeof this.lastDailyRunPersistFailedAt === "number" &&
      now.getTime() - this.lastDailyRunPersistFailedAt <
        DAILY_RUN_PERSIST_FAILURE_GUARD_MS
    ) {
      return returnIneligible("status_write_failed_recently")
    }

    /**
     * Duplicate-run guard: never allow a second daily run on the same local day,
     * even if the daily alarm schedule/state is inconsistent.
     */
    if (currentStatus?.lastDailyRunDay === today) {
      return returnIneligible("already_ran_today")
    }

    const windowStartMinutes = parseTimeToMinutes(config.windowStart)
    const windowEndMinutes = parseTimeToMinutes(config.windowEnd)
    const nowMinutes = now.getHours() * 60 + now.getMinutes()

    if (debug) {
      debug.windowStartMinutes = windowStartMinutes
      debug.windowEndMinutes = windowEndMinutes
      debug.nowMinutes = nowMinutes
    }

    if (windowStartMinutes == null || windowEndMinutes == null) {
      return returnIneligible("invalid_time_window")
    }

    const isWithinWindow = isMinutesWithinWindow(
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

    const dailyAlarm = await getAlarm(this.deps.dailyAlarmName)

    if (debug) {
      debug.dailyAlarmScheduledTime = dailyAlarm?.scheduledTime ?? null
    }

    if (!dailyAlarm?.scheduledTime) {
      return returnIneligible("daily_alarm_missing")
    }

    const scheduledTargetDay = formatLocalDayKey(
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
        name: this.deps.dailyAlarmName,
        scheduledTime: dailyAlarm.scheduledTime,
      } as browser.alarms.Alarm,
      params.tempWindowRequestSource ?? TEMP_WINDOW_REQUEST_SOURCES.Background,
      params.protectionBypassExecution,
    )

    const updatedStatus = await autoCheckinStorage.getStatus()
    const summary =
      updatedStatus?.summary ??
      (updatedStatus?.perAccount
        ? recalculateSummaryFromResults(updatedStatus.perAccount)
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
}
