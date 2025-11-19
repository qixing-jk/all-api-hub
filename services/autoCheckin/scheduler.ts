import { accountStorage } from "~/services/accountStorage"
import {
  DEFAULT_PREFERENCES,
  userPreferences
} from "~/services/userPreferences"
import type {
  AutoCheckinRunResult,
  CheckinAccountResult
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

    // Calculate next trigger time within the window
    const nextTriggerTime = this.calculateNextTrigger(
      config.windowStart,
      config.windowEnd
    )

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
        const currentStatus = await autoCheckinStorage.getStatus()
        await autoCheckinStorage.saveStatus({
          ...currentStatus,
          nextScheduledAt: nextTriggerTime.toISOString()
        })
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
  private calculateNextTrigger(windowStart: string, windowEnd: string): Date {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Parse start and end times
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

    // If window already passed today, schedule for tomorrow
    if (now >= windowEndTime) {
      windowStartTime.setDate(windowStartTime.getDate() + 1)
      windowEndTime.setDate(windowEndTime.getDate() + 1)
    } else if (now < windowStartTime) {
      // Window hasn't started yet today, use today's window
      // Keep the times as-is
    } else {
      // We're in the middle of today's window - use remaining time
      windowStartTime.setTime(now.getTime())
    }

    // Calculate random time within window
    const windowDuration = windowEndTime.getTime() - windowStartTime.getTime()
    const randomOffset =
      windowDuration <= 0 ? 0 : Math.random() * windowDuration
    return new Date(windowStartTime.getTime() + randomOffset)
  }

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
      const today = new Date().toISOString().split("T")[0]
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

      // Filter eligible accounts
      const eligibleAccounts = allAccounts.filter((account) => {
        if (!account.checkIn?.enableDetection) return false
        // Default autoCheckInEnabled to true if not explicitly set to false
        if (account.checkIn?.autoCheckInEnabled === false) return false
        // Skip accounts already checked in today
        if (account.checkIn?.isCheckedInToday === true) return false

        const provider = resolveAutoCheckinProvider(account)
        return provider ? provider.canCheckIn(account) : false
      })

      console.log(
        `[AutoCheckin] Found ${eligibleAccounts.length} eligible accounts`
      )

      if (eligibleAccounts.length === 0) {
        // No accounts to check in
        await autoCheckinStorage.saveStatus({
          lastRunAt: new Date().toISOString(),
          lastRunResult: "success",
          perAccount: {},
          nextScheduledAt: undefined // Will be set by scheduleNextRun
        })
        return
      }

      // Execute check-ins sequentially
      const results: Record<string, CheckinAccountResult> = {}
      let successCount = 0
      let failedCount = 0

      for (const account of eligibleAccounts) {
        try {
          const provider = resolveAutoCheckinProvider(account)
          if (!provider) {
            failedCount++
            const message = "No auto check-in provider available"
            console.warn(`[AutoCheckin] ${account.site_name}: ${message}`)
            results[account.id] = {
              accountId: account.id,
              accountName: account.site_name,
              status: "failed",
              message,
              timestamp: Date.now()
            }
            continue
          }

          // Small delay to avoid rate limiting
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 + Math.random() * 2000)
          )

          const result = await provider.checkIn(account)

          results[account.id] = {
            accountId: account.id,
            accountName: account.site_name,
            status: result.status,
            message: result.message,
            timestamp: Date.now()
          }

          // Update account status if successful or already checked
          if (
            result.status === "success" ||
            result.status === "already_checked"
          ) {
            await accountStorage.markAccountAsCheckedIn(account.id)
            successCount++
            console.log(
              `[AutoCheckin] ${account.site_name}: ${result.status} - ${result.message}`
            )
          } else {
            failedCount++
            console.error(
              `[AutoCheckin] ${account.site_name}: failed - ${result.message}`
            )
          }
        } catch (error) {
          failedCount++
          const errorMessage = getErrorMessage(error)
          console.error(
            `[AutoCheckin] ${account.site_name}: error - ${errorMessage}`
          )

          results[account.id] = {
            accountId: account.id,
            accountName: account.site_name,
            status: "failed",
            message: errorMessage,
            timestamp: Date.now()
          }
        }
      }

      // Determine overall result
      let overallResult: AutoCheckinRunResult = "success"
      if (failedCount > 0 && successCount > 0) {
        overallResult = "partial"
      } else if (failedCount > 0) {
        overallResult = "failed"
      }

      // Save status
      await autoCheckinStorage.saveStatus({
        lastRunAt: new Date().toISOString(),
        lastRunResult: overallResult,
        perAccount: results,
        nextScheduledAt: undefined // Will be set by scheduleNextRun
      })

      const duration = Date.now() - startTime
      console.log(
        `[AutoCheckin] Execution completed in ${duration}ms: ${successCount} succeeded, ${failedCount} failed`
      )
    } catch (error) {
      console.error("[AutoCheckin] Execution failed:", error)
      await autoCheckinStorage.saveStatus({
        lastRunAt: new Date().toISOString(),
        lastRunResult: "failed",
        perAccount: {},
        nextScheduledAt: undefined
      })
    }
  }

  /**
   * Update settings and reschedule alarm
   */
  async updateSettings(settings: {
    globalEnabled?: boolean
    windowStart?: string
    windowEnd?: string
  }) {
    // Get current config and update
    const prefs = await userPreferences.getPreferences()
    const current = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!

    const updated = {
      globalEnabled:
        settings.globalEnabled !== undefined
          ? settings.globalEnabled
          : current.globalEnabled,
      windowStart:
        settings.windowStart !== undefined
          ? settings.windowStart
          : current.windowStart,
      windowEnd:
        settings.windowEnd !== undefined
          ? settings.windowEnd
          : current.windowEnd
    }

    await userPreferences.savePreferences({ autoCheckin: updated })
    await this.scheduleNextRun()
    console.log("[AutoCheckin] Settings updated:", updated)
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
