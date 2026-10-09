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
  AUTO_CHECKIN_ALARM_NAMES,
  autoCheckinAlarmSchedule,
} from "~/services/checkin/autoCheckin/scheduling/alarmSchedule"
import { DailyTriggerWorkflow } from "~/services/checkin/autoCheckin/scheduling/dailyTriggerWorkflow"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import { type DisplaySiteData } from "~/types"
import { type AutoCheckinPreferences } from "~/types/autoCheckin"
import {
  TEMP_WINDOW_REQUEST_SOURCES,
  type TempWindowRequestSource,
} from "~/types/tempWindowFetch"
import { hasAlarmsAPI, onAlarm } from "~/utils/browser/alarms"
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
    clearRetryAlarm: (maxAttempts) =>
      autoCheckinAlarmSchedule.clearRetryAlarm(maxAttempts),
    clearRetryAlarmAndState: () =>
      autoCheckinAlarmSchedule.clearRetryAlarmAndState(),
    scheduleRetryAlarm: (config) =>
      autoCheckinAlarmSchedule.scheduleRetryAlarm(config),
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

  private isInitialized = false

  private readonly dailyTrigger = new DailyTriggerWorkflow({
    dailyAlarmName: AUTO_CHECKIN_ALARM_NAMES.Daily,
    runCheckins: (options) => this.runCheckins(options),
    scheduleNextRun: () => this.scheduleNextRun(),
  })

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
          if (alarm.name === AUTO_CHECKIN_ALARM_NAMES.Daily) {
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

          if (alarm.name === AUTO_CHECKIN_ALARM_NAMES.Retry) {
            // Await to keep the MV3 service worker alive for the full retry run.
            try {
              await this.handleRetryAlarm(alarm)
            } catch (error) {
              logger.error("Retry alarm execution failed", error)
            }
            return
          }

          if (alarm.name === AUTO_CHECKIN_ALARM_NAMES.Legacy) {
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

  /** Routes scheduled triggers through the shared daily admission owner. */
  /** Restores browser alarms and persisted schedules through their concrete owner. */
  scheduleNextRun(
    options?: Parameters<typeof autoCheckinAlarmSchedule.scheduleNextRun>[0],
  ) {
    return autoCheckinAlarmSchedule.scheduleNextRun(options)
  }

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
      await autoCheckinAlarmSchedule.clearRetryAlarmAndState()
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
      await autoCheckinAlarmSchedule.scheduleRetryAlarm(config)
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
        name: AUTO_CHECKIN_ALARM_NAMES.Daily,
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
      name: AUTO_CHECKIN_ALARM_NAMES.Retry,
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

    const scheduledTime =
      await autoCheckinAlarmSchedule.scheduleDailyAlarmForToday(
        Date.now() + minutesFromNow * 60_000,
      )

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
