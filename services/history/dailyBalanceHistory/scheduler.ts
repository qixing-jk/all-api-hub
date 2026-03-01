import { RuntimeActionIds } from "~/constants/runtimeActions"
import { accountStorage } from "~/services/accounts/accountStorage"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  DEFAULT_BALANCE_HISTORY_PREFERENCES,
  type BalanceHistoryPreferences,
  type DailyBalanceHistoryCaptureSource,
} from "~/types/dailyBalanceHistory"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
  onAlarm,
} from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

import { DAILY_BALANCE_HISTORY_ALARM_NAME } from "./constants"
import { dailyBalanceHistoryStorage } from "./storage"
import { clampBalanceHistoryRetentionDays } from "./utils"

const logger = createLogger("DailyBalanceHistoryScheduler")

const END_OF_DAY_CAPTURE_TIME = {
  hour: 23,
  minute: 55,
} as const

/**
 *
 */
function computeNextEndOfDayCaptureWhenMs(nowMs: number): number {
  const target = new Date(nowMs)
  target.setHours(
    END_OF_DAY_CAPTURE_TIME.hour,
    END_OF_DAY_CAPTURE_TIME.minute,
    0,
    0,
  )

  if (target.getTime() <= nowMs) {
    target.setDate(target.getDate() + 1)
    target.setHours(
      END_OF_DAY_CAPTURE_TIME.hour,
      END_OF_DAY_CAPTURE_TIME.minute,
      0,
      0,
    )
  }

  return target.getTime()
}

class DailyBalanceHistoryScheduler {
  private isInitialized = false
  private isRunning = false

  async initialize() {
    if (this.isInitialized) {
      return
    }

    onAlarm(async (alarm) => {
      if (alarm.name !== DAILY_BALANCE_HISTORY_ALARM_NAME) {
        return
      }

      // Await to keep the MV3 service worker alive for the duration of the capture run.
      await this.runEndOfDayCapture({ trigger: "alarm" })
    })

    await this.applyScheduleFromPreferences({ preserveExisting: true })
    this.isInitialized = true
  }

  private async applyScheduleFromPreferences(options?: {
    preserveExisting?: boolean
  }): Promise<void> {
    const prefs = await userPreferences.getPreferences()
    const config = prefs.balanceHistory ?? DEFAULT_BALANCE_HISTORY_PREFERENCES

    if (!config.enabled || !config.endOfDayCapture.enabled) {
      await clearAlarm(DAILY_BALANCE_HISTORY_ALARM_NAME)
      return
    }

    if (!hasAlarmsAPI()) {
      await clearAlarm(DAILY_BALANCE_HISTORY_ALARM_NAME)
      logger.warn("Alarms API not supported; end-of-day capture disabled")
      return
    }

    const existingAlarm = options?.preserveExisting
      ? await getAlarm(DAILY_BALANCE_HISTORY_ALARM_NAME)
      : undefined

    if (
      existingAlarm?.scheduledTime &&
      existingAlarm.scheduledTime > Date.now() + 60_000
    ) {
      return
    }

    await createAlarm(DAILY_BALANCE_HISTORY_ALARM_NAME, {
      when: computeNextEndOfDayCaptureWhenMs(Date.now()),
    })
  }

  async updateSettings(updates: Partial<BalanceHistoryPreferences>): Promise<{
    warning?: string
  }> {
    const prefs = await userPreferences.getPreferences()
    const current = prefs.balanceHistory ?? DEFAULT_BALANCE_HISTORY_PREFERENCES

    const requestedEndOfDayEnabled =
      typeof updates.endOfDayCapture?.enabled === "boolean"
        ? updates.endOfDayCapture.enabled
        : current.endOfDayCapture.enabled

    const next: BalanceHistoryPreferences = {
      ...current,
      ...updates,
      endOfDayCapture: {
        ...current.endOfDayCapture,
        ...(updates.endOfDayCapture ?? {}),
      },
      retentionDays: clampBalanceHistoryRetentionDays(
        updates.retentionDays ?? current.retentionDays,
      ),
    }

    let warning: string | undefined
    if (next.enabled && requestedEndOfDayEnabled && !hasAlarmsAPI()) {
      next.endOfDayCapture = { enabled: false }
      warning =
        "Alarms API not supported; end-of-day capture has been disabled."
    }

    await userPreferences.savePreferences({ balanceHistory: next })
    await dailyBalanceHistoryStorage.pruneAll({
      retentionDays: next.retentionDays,
    })
    await this.applyScheduleFromPreferences()

    return { warning }
  }

  async pruneNow(): Promise<boolean> {
    const prefs = await userPreferences.getPreferences()
    const config = prefs.balanceHistory ?? DEFAULT_BALANCE_HISTORY_PREFERENCES
    return await dailyBalanceHistoryStorage.pruneAll({
      retentionDays: clampBalanceHistoryRetentionDays(config.retentionDays),
    })
  }

  async refreshNow(accountIds?: string[]): Promise<{
    success: number
    failed: number
    refreshedCount: number
  } | null> {
    const ids = Array.isArray(accountIds)
      ? accountIds.filter(
          (id) => typeof id === "string" && id.trim().length > 0,
        )
      : undefined

    if (accountIds == null) {
      const result = await accountStorage.refreshAllAccounts(true)
      return {
        success: result.success,
        failed: result.failed,
        refreshedCount: result.refreshedCount,
      }
    }

    if (!ids?.length) {
      return { success: 0, failed: 0, refreshedCount: 0 }
    }

    const results = await Promise.allSettled(
      ids.map((id) => accountStorage.refreshAccount(id, true)),
    )

    let success = 0
    let failed = 0
    let refreshedCount = 0

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        success += 1
        if (result.value.refreshed) {
          refreshedCount += 1
        }
      } else {
        failed += 1
      }
    }

    return { success, failed, refreshedCount }
  }

  async runEndOfDayCapture(params: {
    trigger: DailyBalanceHistoryCaptureSource
  }) {
    if (this.isRunning) {
      return null
    }

    this.isRunning = true

    try {
      const prefs = await userPreferences.getPreferences()
      const config = prefs.balanceHistory ?? DEFAULT_BALANCE_HISTORY_PREFERENCES

      if (!config.enabled || !config.endOfDayCapture.enabled) {
        return { started: false, skipped: true }
      }

      const accounts = await accountStorage.getEnabledAccounts()
      const results = await Promise.allSettled(
        accounts.map((account) =>
          accountStorage.refreshAccount(account.id, true, {
            includeTodayCashflow: true,
            balanceHistoryCaptureSource: params.trigger,
          }),
        ),
      )

      const totals = results.reduce(
        (acc, item) => {
          if (item.status === "fulfilled" && item.value) {
            acc.success += 1
            if (item.value.refreshed) acc.refreshed += 1
          } else {
            acc.failed += 1
          }
          return acc
        },
        { success: 0, failed: 0, refreshed: 0 },
      )

      await this.applyScheduleFromPreferences()

      return {
        started: true,
        trigger: params.trigger,
        totals,
      }
    } catch (error) {
      logger.error("End-of-day capture run failed", error)
      return null
    } finally {
      this.isRunning = false
    }
  }
}

export const dailyBalanceHistoryScheduler = new DailyBalanceHistoryScheduler()

export const handleDailyBalanceHistoryMessage = async (
  request: any,
  sendResponse: (response: any) => void,
) => {
  try {
    switch (request.action) {
      case RuntimeActionIds.BalanceHistoryUpdateSettings: {
        const result = await dailyBalanceHistoryScheduler.updateSettings(
          request.settings ?? {},
        )
        sendResponse({ success: true, data: result })
        break
      }

      case RuntimeActionIds.BalanceHistoryRefreshNow: {
        const accountIds = Array.isArray(request.accountIds)
          ? (request.accountIds as string[])
          : undefined
        const result = await dailyBalanceHistoryScheduler.refreshNow(accountIds)
        sendResponse({ success: true, data: result })
        break
      }

      case RuntimeActionIds.BalanceHistoryPrune: {
        const ok = await dailyBalanceHistoryScheduler.pruneNow()
        sendResponse({ success: ok })
        break
      }

      default:
        sendResponse({ success: false, error: "Unknown action" })
    }
  } catch (error) {
    logger.error("Message handling failed", error)
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}
