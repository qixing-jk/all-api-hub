import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountRefresh } from "~/services/accounts/accountStorage/accountRefresh"
import { notifyTaskResult } from "~/services/notifications/taskNotificationService"
import { userPreferences } from "~/services/preferences/userPreferences"
import { createAutomaticProtectionBypassExecution } from "~/services/protectionBypass/client"
import {
  INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
  isRefreshAllAccountsProtectionBypassExecution,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import { BalanceHistoryMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { createRuntimeMessageFailure } from "~/services/runtimeMessaging/result"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"
import {
  DAILY_BALANCE_HISTORY_CAPTURE_SOURCES,
  DEFAULT_BALANCE_HISTORY_PREFERENCES,
  type BalanceHistoryPreferences,
  type DailyBalanceHistoryCaptureSource,
} from "~/types/dailyBalanceHistory"
import {
  getTaskNotificationStatusFromCounts,
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
} from "~/types/taskNotifications"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
  onAlarm,
} from "~/utils/browser/alarms"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { DAILY_BALANCE_HISTORY_ALARM_NAME } from "./constants"
import {
  onBalanceHistoryMessage,
  type BalanceHistoryRefreshNowRequest,
  type BalanceHistoryRefreshNowResponse,
  type BalanceHistoryUpdateSettingsRequest,
  type BalanceHistoryUpdateSettingsResponse,
} from "./messaging"
import { dailyBalanceHistoryStorage } from "./storage"
import { clampBalanceHistoryRetentionDays } from "./utils"

const logger = createLogger("DailyBalanceHistoryScheduler")
const BALANCE_HISTORY_ALARM_TRIGGER: DailyBalanceHistoryCaptureSource =
  DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Alarm

const END_OF_DAY_CAPTURE_TIME = {
  hour: 23,
  minute: 55,
} as const

/**
 * Computes the next end-of-day capture time.
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
      const result = await this.runEndOfDayCapture({
        trigger: BALANCE_HISTORY_ALARM_TRIGGER,
      })
      if (!result?.started || !result.totals) {
        return
      }

      const totals = result.totals
      if (totals.success + totals.failed === 0) {
        return
      }

      await notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.BalanceHistoryCapture,
        status: getTaskNotificationStatusFromCounts({
          successCount: totals.success,
          failedCount: totals.failed,
        }),
        counts: {
          total: totals.success + totals.failed,
          success: totals.success,
          failed: totals.failed,
          skipped: 0,
        },
      })
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

  async refreshNow(
    protectionBypassExecution: ProtectionBypassExecution,
    accountIds?: string[],
    tempWindowRequestSource?: TempWindowRequestSource,
  ): Promise<{
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
      const result = await accountRefresh.refreshAllAccounts(true, {
        protectionBypassExecution,
        ...(tempWindowRequestSource ? { tempWindowRequestSource } : {}),
      })
      const captured = result.balanceHistoryCapturedCount ?? 0
      return {
        success: captured,
        failed: result.success + result.failed - captured,
        refreshedCount: result.refreshedCount,
      }
    }

    if (!ids?.length) {
      return { success: 0, failed: 0, refreshedCount: 0 }
    }

    const results = await Promise.allSettled(
      ids.map((id) =>
        accountRefresh.refreshAccount(id, true, {
          protectionBypassExecution,
          ...(tempWindowRequestSource ? { tempWindowRequestSource } : {}),
        }),
      ),
    )

    let success = 0
    let failed = 0
    let refreshedCount = 0

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        if (result.value.balanceHistoryCaptured === true) success += 1
        else failed += 1
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

      const accounts = await accountQueries.getEnabledAccounts()
      const protectionBypassExecution =
        createAutomaticProtectionBypassExecution(
          PROTECTION_BYPASS_FEATURES.BalanceHistory,
          PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
          PROTECTION_BYPASS_SURFACES.Background,
        )
      const results = await Promise.allSettled(
        accounts.map((account) =>
          accountRefresh.refreshAccount(account.id, true, {
            includeTodayCashflow: true,
            balanceHistoryCaptureSource: params.trigger,
            protectionBypassExecution,
          }),
        ),
      )

      const totals = results.reduce(
        (acc, item) => {
          if (item.status === "fulfilled" && item.value) {
            if (item.value.balanceHistoryCaptured === true) acc.success += 1
            else acc.failed += 1
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
      if (params.trigger === BALANCE_HISTORY_ALARM_TRIGGER) {
        try {
          await notifyTaskResult({
            task: TASK_NOTIFICATION_TASKS.BalanceHistoryCapture,
            status: TASK_NOTIFICATION_STATUSES.Failure,
            message: getErrorMessage(error),
          })
        } catch (notifyError) {
          logger.error("Failed to send task notification", notifyError)
        }
      }
      return null
    } finally {
      this.isRunning = false
    }
  }
}

export const dailyBalanceHistoryScheduler = new DailyBalanceHistoryScheduler()

let balanceHistoryMessagingCleanup: (() => void)[] | null = null

/**
 * Register typed background listeners for balance-history scheduler messages.
 */
export function setupDailyBalanceHistoryMessagingListeners() {
  if (balanceHistoryMessagingCleanup) {
    return
  }

  balanceHistoryMessagingCleanup = [
    onBalanceHistoryMessage(
      BalanceHistoryMessageTypes.UpdateSettings,
      ({ data }) => resolveBalanceHistoryUpdateSettingsMessage(data),
    ),
    onBalanceHistoryMessage(
      BalanceHistoryMessageTypes.RefreshNow,
      async ({ data }) => {
        if (
          !isRefreshAllAccountsProtectionBypassExecution(
            data?.protectionBypassExecution,
          )
        ) {
          return createRuntimeMessageFailure(
            INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
          )
        }
        return await resolveBalanceHistoryRefreshNowMessage(
          data,
          data.protectionBypassExecution.surface,
        )
      },
    ),
    onBalanceHistoryMessage(BalanceHistoryMessageTypes.Prune, () =>
      resolveBalanceHistoryPruneMessage(),
    ),
  ]
}

/**
 * Resolve a typed request to persist balance-history scheduler settings.
 */
export async function resolveBalanceHistoryUpdateSettingsMessage(
  request: BalanceHistoryUpdateSettingsRequest,
): Promise<BalanceHistoryUpdateSettingsResponse> {
  try {
    const result = await dailyBalanceHistoryScheduler.updateSettings(
      request.settings ?? {},
    )
    return { success: true, data: result }
  } catch (error) {
    logger.error("Message handling failed", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request to refresh balance snapshots immediately.
 */
export async function resolveBalanceHistoryRefreshNowMessage(
  request?: BalanceHistoryRefreshNowRequest,
  tempWindowRequestSource?: TempWindowRequestSource,
): Promise<BalanceHistoryRefreshNowResponse> {
  try {
    if (
      !isRefreshAllAccountsProtectionBypassExecution(
        request?.protectionBypassExecution,
      )
    ) {
      return createRuntimeMessageFailure(
        INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
      )
    }
    if (
      request &&
      request.accountIds !== undefined &&
      !Array.isArray(request.accountIds)
    ) {
      return createRuntimeMessageFailure(
        "accountIds must be an array when provided",
      )
    }

    const accountIds = Array.isArray(request?.accountIds)
      ? request.accountIds
      : undefined
    const result = await dailyBalanceHistoryScheduler.refreshNow(
      request.protectionBypassExecution,
      accountIds,
      tempWindowRequestSource,
    )
    return { success: true, data: result }
  } catch (error) {
    logger.error("Message handling failed", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}

/**
 * Resolve a typed request to prune retained balance-history snapshots.
 */
export async function resolveBalanceHistoryPruneMessage(): Promise<
  RuntimeMessageResponse<undefined>
> {
  try {
    const ok = await dailyBalanceHistoryScheduler.pruneNow()
    return ok
      ? ({ success: true, data: undefined } as const)
      : createRuntimeMessageFailure("Failed to prune balance history")
  } catch (error) {
    logger.error("Message handling failed", error)
    return createRuntimeMessageFailure(getErrorMessage(error))
  }
}
