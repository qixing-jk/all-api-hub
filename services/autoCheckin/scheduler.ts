import { t } from "i18next"

import { accountStorage } from "~/services/accountStorage"
import {
  DEFAULT_PREFERENCES,
  userPreferences
} from "~/services/userPreferences"
import type { DisplaySiteData, SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_RUN_RESULT,
  AUTO_CHECKIN_SCHEDULE_MODE,
  AUTO_CHECKIN_SKIP_REASON,
  AutoCheckinAccountSnapshot,
  AutoCheckinAttemptsTracker,
  AutoCheckinPreferences,
  AutoCheckinRunResult,
  AutoCheckinRunSummary,
  AutoCheckinSkipReason,
  AutoCheckinStatus,
  CHECKIN_RESULT_STATUS,
  type CheckinAccountResult,
  type CheckinResultStatus
} from "~/types/autoCheckin"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
  onAlarm
} from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"

import { resolveAutoCheckinProvider } from "./providers"
import { autoCheckinStorage } from "./storage"

/**
 * Scheduler service for Auto Check-in
 * Handles daily check-in execution using chrome.alarms
 */
class AutoCheckinScheduler {
  private static readonly ALARM_NAME = "autoCheckin"
  private isInitialized = false

  private getToday(): string {
    return new Date().toISOString().split("T")[0]
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
    windowEnd: number
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
    now: Date
  ): Date | null {
    const deterministicMinutes = this.parseTimeToMinutes(
      config.deterministicTime || config.windowStart
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
        windowEndMinutes
      )
    ) {
      return null
    }

    const target = new Date(now)
    target.setHours(
      Math.floor(deterministicMinutes / 60),
      deterministicMinutes % 60,
      0,
      0
    )

    if (target <= now) {
      target.setDate(target.getDate() + 1)
    }

    return target
  }

  private calculateRandomTrigger(
    windowStart: string,
    windowEnd: string,
    now: Date
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

  private computeRetryTrigger(
    config: AutoCheckinPreferences,
    status: AutoCheckinStatus | null,
    now: Date
  ): Date | null {
    if (!config.retryStrategy?.enabled || !status?.pendingRetry) {
      return null
    }

    const attempts = status.attempts
    const today = this.getToday()
    if (!attempts || attempts.date !== today) {
      return null
    }

    if (attempts.attempts >= config.retryStrategy.maxAttemptsPerDay) {
      return null
    }

    if (!status.lastRunAt) {
      return null
    }

    const lastRun = new Date(status.lastRunAt)
    if (Number.isNaN(lastRun.getTime())) {
      return null
    }

    const retryTime = new Date(
      lastRun.getTime() + config.retryStrategy.intervalMinutes * 60 * 1000
    )

    if (retryTime <= now) {
      return new Date(now.getTime() + 15 * 1000)
    }

    return retryTime
  }

  /**
   * Computes the next trigger time for auto-checkin based on the given configuration and status.
   * If retry is enabled and the last run was not successful, it will return the retry time.
   * If deterministic schedule mode is enabled and the current time is within the window, it will return the deterministic trigger time.
   * If none of the above conditions are met, it will return a random trigger time within the configured window.
   *
   * @param config - The auto-checkin configuration.
   * @param status - The auto-checkin status.
   * @returns A Date object representing the next trigger time, or null if the configuration is invalid.
   */
  private computeNextTriggerTime(
    config: AutoCheckinPreferences,
    status: AutoCheckinStatus | null
  ): Date {
    const now = new Date()

    const retryTime = this.computeRetryTrigger(config, status, now)
    if (retryTime) {
      return retryTime
    }

    if (config.scheduleMode === AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC) {
      const deterministic = this.calculateDeterministicTrigger(config, now)
      if (deterministic) {
        return deterministic
      }
    }

    return this.calculateRandomTrigger(
      config.windowStart,
      config.windowEnd,
      now
    )
  }

  private getUpdatedAttempts(
    status: AutoCheckinStatus | null,
    today: string
  ): AutoCheckinAttemptsTracker {
    if (status?.attempts?.date === today) {
      return {
        date: today,
        attempts: status.attempts.attempts + 1
      }
    }

    return {
      date: today,
      attempts: 1
    }
  }

  private recalculateSummaryFromResults(
    perAccount: Record<string, CheckinAccountResult>,
    previousSummary?: AutoCheckinRunSummary
  ): AutoCheckinRunSummary {
    const values = Object.values(perAccount)
    const successStatuses: CheckinResultStatus[] = [
      CHECKIN_RESULT_STATUS.SUCCESS,
      CHECKIN_RESULT_STATUS.ALREADY_CHECKED
    ]
    const successCount = values.filter((value) =>
      successStatuses.includes(value.status)
    ).length
    const failedCount = values.filter(
      (value) => value.status === CHECKIN_RESULT_STATUS.FAILED
    ).length
    const skippedCount = values.filter(
      (value) => value.status === CHECKIN_RESULT_STATUS.SKIPPED
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
      needsRetry: failedCount > 0
    }
  }

  private updateSnapshotWithResult(
    snapshots: AutoCheckinAccountSnapshot[] | undefined,
    result: CheckinAccountResult
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
        lastResult: result
      }
    })

    return updated ? nextSnapshots : snapshots
  }

  /**
   * Returns the localized, human-readable message for a skip reason code.
   */
  private getSkipReasonMessage(reason: AutoCheckinSkipReason): string {
    return t(`autoCheckin:skipReasons.${reason}`, {
      defaultValue: t("autoCheckin:skipReasons.unknown")
    })
  }

  private buildAccountSnapshot(
    account: SiteAccount
  ): AutoCheckinAccountSnapshot {
    const detectionEnabled = account.checkIn?.enableDetection ?? false
    const autoCheckinEnabled = account.checkIn?.autoCheckInEnabled !== false
    const provider = resolveAutoCheckinProvider(account)
    const providerAvailable = provider ? provider.canCheckIn(account) : false
    const isCheckedInToday = account.checkIn?.isCheckedInToday === true

    let skipReason: AutoCheckinSkipReason | undefined

    if (!detectionEnabled) {
      skipReason = AUTO_CHECKIN_SKIP_REASON.DETECTION_DISABLED
    } else if (!autoCheckinEnabled) {
      skipReason = AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED
    } else if (isCheckedInToday) {
      skipReason = AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY
    } else if (!provider) {
      skipReason = AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER
    } else if (!providerAvailable) {
      skipReason = AUTO_CHECKIN_SKIP_REASON.PROVIDER_NOT_READY
    }

    return {
      accountId: account.id,
      accountName: account.site_name,
      siteType: account.site_type,
      detectionEnabled,
      autoCheckinEnabled,
      providerAvailable,
      isCheckedInToday: account.checkIn?.isCheckedInToday,
      lastCheckInDate: account.checkIn?.lastCheckInDate,
      skipReason
    }
  }

  private attachResultsToSnapshots(
    snapshots: AutoCheckinAccountSnapshot[],
    results: Record<string, CheckinAccountResult>
  ): AutoCheckinAccountSnapshot[] {
    return snapshots.map((snapshot) => ({
      ...snapshot,
      lastResult: results[snapshot.accountId]
    }))
  }

  private async runAccountCheckin(account: SiteAccount): Promise<{
    result: CheckinAccountResult
    successful: boolean
  }> {
    const buildResult = (
      status: CheckinResultStatus,
      message: string
    ): CheckinAccountResult => ({
      accountId: account.id,
      accountName: account.site_name,
      status,
      message,
      timestamp: Date.now()
    })

    try {
      const provider = resolveAutoCheckinProvider(account)
      if (!provider) {
        const message = "No auto check-in provider available"
        console.warn(`[AutoCheckin] ${account.site_name}: ${message}`)
        return {
          result: buildResult(CHECKIN_RESULT_STATUS.FAILED, message),
          successful: false
        }
      }

      const providerResult = await provider.checkIn(account)
      const result = buildResult(providerResult.status, providerResult.message)

      if (
        providerResult.status === CHECKIN_RESULT_STATUS.SUCCESS ||
        providerResult.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED
      ) {
        await accountStorage.markAccountAsCheckedIn(account.id)
        console.log(
          `[AutoCheckin] ${account.site_name}: ${providerResult.status} - ${providerResult.message}`
        )
        return { result, successful: true }
      }

      console.error(
        `[AutoCheckin] ${account.site_name}: failed - ${providerResult.message}`
      )
      return { result, successful: false }
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      console.error(
        `[AutoCheckin] ${account.site_name}: error - ${errorMessage}`
      )
      return {
        result: buildResult(CHECKIN_RESULT_STATUS.FAILED, errorMessage),
        successful: false
      }
    }
  }

  /**
   * Initialize the scheduler
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
          if (alarm.name === AutoCheckinScheduler.ALARM_NAME) {
            this.handleAlarm().catch((error) => {
              console.error("[AutoCheckin] Scheduled execution failed:", error)
            })
          }
        })

        // Setup initial alarm based on preferences
        await this.scheduleNextRun()
      } else {
        console.warn(
          "[AutoCheckin] Alarms API not available, automatic check-in disabled"
        )
      }

      this.isInitialized = true
      console.log("[AutoCheckin] Scheduler initialized")
    } catch (error) {
      console.error("[AutoCheckin] Failed to initialize scheduler:", error)
    }
  }

  /**
   * Schedule the next check-in run randomly within configured time window
   */
  async scheduleNextRun() {
    // Check if alarms API is supported
    if (!hasAlarmsAPI()) {
      console.warn("[AutoCheckin] Alarms API not supported, cannot schedule")
      return
    }

    const prefs = await userPreferences.getPreferences()
    const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!

    // Clear existing alarm
    await clearAlarm(AutoCheckinScheduler.ALARM_NAME)

    if (!config.globalEnabled) {
      console.log("[AutoCheckin] Auto check-in disabled, alarm cleared")
      // Update status to clear nextScheduledAt
      const currentStatus = await autoCheckinStorage.getStatus()
      await autoCheckinStorage.saveStatus({
        ...currentStatus,
        nextScheduledAt: undefined
      })
      return
    }

    const currentStatus = await autoCheckinStorage.getStatus()

    // Calculate next trigger time (retry or scheduled window)
    const nextTriggerTime = this.computeNextTriggerTime(config, currentStatus)

    try {
      await createAlarm(AutoCheckinScheduler.ALARM_NAME, {
        when: nextTriggerTime.getTime()
      })

      // Verify alarm was created
      const alarm = await getAlarm(AutoCheckinScheduler.ALARM_NAME)
      if (alarm) {
        console.log(`[AutoCheckin] Alarm scheduled:`, {
          name: alarm.name,
          scheduledTime: new Date(alarm.scheduledTime || 0)
        })

        // Update status with next scheduled time
        const updatedStatus: AutoCheckinStatus = {
          ...(currentStatus ?? {}),
          nextScheduledAt: nextTriggerTime.toISOString()
        }
        await autoCheckinStorage.saveStatus(updatedStatus)
      } else {
        console.warn("[AutoCheckin] Alarm was not created properly")
      }
    } catch (error) {
      console.error("[AutoCheckin] Failed to create alarm:", error)
    }
  }

  /**
   * Calculate next trigger time randomly within the time window
   * @param windowStart - Start time in HH:mm format
   * @param windowEnd - End time in HH:mm format
   * @returns Date object for next trigger
   */
  /**
   * Handle alarm trigger - execute check-ins
   */
  async handleAlarm() {
    console.log("[AutoCheckin] Alarm triggered, starting check-in execution")
    await this.runCheckins()
    // Schedule next run after completion
    await this.scheduleNextRun()
  }

  /**
   * Execute check-ins for all eligible accounts
   */
  async runCheckins(): Promise<void> {
    console.log("[AutoCheckin] Starting check-in execution")
    const startTime = Date.now()
    const today = this.getToday()
    const currentStatus = await autoCheckinStorage.getStatus()
    const updatedAttempts = this.getUpdatedAttempts(currentStatus, today)

    try {
      // Get preferences
      const prefs = await userPreferences.getPreferences()
      const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!

      if (!config.globalEnabled) {
        console.log("[AutoCheckin] Global feature disabled, skipping")
        return
      }

      // Get all accounts
      const allAccounts = await accountStorage.getAllAccounts()

      // Reset isCheckedInToday for accounts whose lastCheckInDate !== today
      // isCheckedInToday: true means already checked in (skip until tomorrow)
      // isCheckedInToday: false/undefined means can check in today
      for (const account of allAccounts) {
        if (
          account.checkIn?.lastCheckInDate &&
          account.checkIn.lastCheckInDate !== today &&
          account.checkIn.isCheckedInToday === true
        ) {
          // Date changed, reset status to allow check-in today
          await accountStorage.updateAccount(account.id, {
            checkIn: {
              ...account.checkIn,
              isCheckedInToday: false // New day -> not yet checked in
            }
          })
        }
      }

      // Filter accounts with detection enabled
      const detectionEnabledAccounts = allAccounts.filter(
        (account) => account.checkIn?.enableDetection
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

      // Record skipped accounts to results
      for (const snapshot of accountSnapshots) {
        if (snapshot.skipReason) {
          results[snapshot.accountId] = {
            accountId: snapshot.accountId,
            accountName: snapshot.accountName,
            status: CHECKIN_RESULT_STATUS.SKIPPED,
            message: this.getSkipReasonMessage(snapshot.skipReason),
            reasonCode: snapshot.skipReason,
            timestamp
          }
        }
      }

      console.log(
        `[AutoCheckin] Tracking ${detectionEnabledAccounts.length} accounts, runnable: ${runnableAccounts.length}`
      )

      // If no accounts to run, save status and exit
      if (runnableAccounts.length === 0) {
        const summary: AutoCheckinRunSummary = {
          totalEligible: accountSnapshots.length,
          executed: 0,
          successCount: 0,
          failedCount: 0,
          skippedCount: accountSnapshots.length,
          needsRetry: false
        }

        await autoCheckinStorage.saveStatus({
          lastRunAt: new Date().toISOString(),
          lastRunResult: AUTO_CHECKIN_RUN_RESULT.SUCCESS,
          perAccount: results,
          nextScheduledAt: undefined,
          summary,
          attempts: updatedAttempts,
          pendingRetry: false,
          accountsSnapshot: this.attachResultsToSnapshots(
            accountSnapshots,
            results
          )
        })
        return
      }

      // Execute check-ins concurrently
      let successCount = 0
      let failedCount = 0

      const checkinOutcomes = await Promise.all(
        runnableAccounts.map((account) => this.runAccountCheckin(account))
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
      const hasRetriesRemaining = !!(
        config.retryStrategy?.enabled &&
        updatedAttempts.attempts < config.retryStrategy.maxAttemptsPerDay
      )

      const summary: AutoCheckinRunSummary = {
        totalEligible: accountSnapshots.length,
        executed: runnableAccounts.length,
        successCount,
        failedCount,
        skippedCount,
        needsRetry: summaryNeedsRetry
      }

      const pendingRetry = summaryNeedsRetry && hasRetriesRemaining

      await autoCheckinStorage.saveStatus({
        lastRunAt: new Date().toISOString(),
        lastRunResult: overallResult,
        perAccount: results,
        nextScheduledAt: undefined,
        summary,
        attempts: updatedAttempts,
        pendingRetry,
        accountsSnapshot: this.attachResultsToSnapshots(
          accountSnapshots,
          results
        )
      })

      const duration = Date.now() - startTime
      console.log(
        `[AutoCheckin] Execution completed in ${duration}ms: ${successCount} succeeded, ${failedCount} failed`
      )
    } catch (error) {
      console.error("[AutoCheckin] Execution failed:", error)
      await autoCheckinStorage.saveStatus({
        lastRunAt: new Date().toISOString(),
        lastRunResult: AUTO_CHECKIN_RUN_RESULT.FAILED,
        perAccount: {},
        nextScheduledAt: undefined,
        attempts: updatedAttempts,
        pendingRetry: false
      })
    }
  }

  /**
   * Update settings and reschedule alarm
   */
  async updateSettings(
    settings: Partial<
      Pick<
        AutoCheckinPreferences,
        | "globalEnabled"
        | "windowStart"
        | "windowEnd"
        | "scheduleMode"
        | "deterministicTime"
      >
    > & {
      retryStrategy?: Partial<AutoCheckinPreferences["retryStrategy"]>
    }
  ) {
    // Get current config and update
    const prefs = await userPreferences.getPreferences()
    const current = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!

    const updated: AutoCheckinPreferences = {
      ...current,
      ...settings,
      retryStrategy: {
        ...current.retryStrategy,
        ...(settings.retryStrategy ?? {})
      }
    }

    await userPreferences.savePreferences({ autoCheckin: updated })
    await this.scheduleNextRun()
    console.log("[AutoCheckin] Settings updated:", updated)
  }

  async retryAccount(accountId: string) {
    const account = await accountStorage.getAccountById(accountId)

    if (!account) {
      throw new Error(t("messages:storage.accountNotFound", { id: accountId }))
    }

    const { result } = await this.runAccountCheckin(account)
    const currentStatus = (await autoCheckinStorage.getStatus()) || {}

    const perAccount: Record<string, CheckinAccountResult> = {
      ...(currentStatus.perAccount ?? {}),
      [result.accountId]: result
    }

    const summary = this.recalculateSummaryFromResults(
      perAccount,
      currentStatus.summary
    )

    const prefs = await userPreferences.getPreferences()
    const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
    const hasRetriesRemaining = !!(
      config.retryStrategy?.enabled &&
      (currentStatus.attempts?.attempts ?? 0) <
        config.retryStrategy.maxAttemptsPerDay
    )

    let lastRunResult: AutoCheckinRunResult = AUTO_CHECKIN_RUN_RESULT.SUCCESS
    if (summary.failedCount > 0 && summary.successCount > 0) {
      lastRunResult = AUTO_CHECKIN_RUN_RESULT.PARTIAL
    } else if (summary.failedCount > 0) {
      lastRunResult = AUTO_CHECKIN_RUN_RESULT.FAILED
    }

    const pendingRetry = summary.failedCount > 0 && hasRetriesRemaining

    const accountsSnapshot = this.updateSnapshotWithResult(
      currentStatus.accountsSnapshot,
      result
    )

    const updatedStatus: AutoCheckinStatus = {
      ...currentStatus,
      lastRunAt: new Date().toISOString(),
      lastRunResult,
      perAccount,
      summary,
      pendingRetry,
      accountsSnapshot
    }

    await autoCheckinStorage.saveStatus(updatedStatus)

    return {
      result,
      summary,
      pendingRetry
    }
  }

  async getAccountDisplayData(accountId: string): Promise<DisplaySiteData> {
    const account = await accountStorage.getAccountById(accountId)

    if (!account) {
      throw new Error(t("messages:storage.accountNotFound", { id: accountId }))
    }

    return accountStorage.convertToDisplayData(account) as DisplaySiteData
  }
}

// Create singleton instance
export const autoCheckinScheduler = new AutoCheckinScheduler()

/**
 * Message handler for Auto Check-in
 */
export const handleAutoCheckinMessage = async (
  request: any,
  sendResponse: (response: any) => void
) => {
  try {
    switch (request.action) {
      case "autoCheckin:runNow":
        await autoCheckinScheduler.runCheckins()
        sendResponse({ success: true })
        break

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
          request.accountId
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
