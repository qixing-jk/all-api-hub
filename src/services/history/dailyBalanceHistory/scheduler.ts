import { RuntimeActionIds } from "~/constants/runtimeActions"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountRefresh } from "~/services/accounts/accountStorage/accountRefresh"
import { isAccountTodayMetricComplete } from "~/services/accounts/accountTodayStats"
import { resolveAccountTodayStatsAvailability } from "~/services/accounts/accountTodayStatsResolver"
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
} from "~/utils/browser/browserApi"
import { isDevelopmentMode } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { DAILY_BALANCE_HISTORY_ALARM_NAME } from "./constants"
import { getDayKeyFromUnixSeconds, subtractDaysFromDayKey } from "./dayKeys"
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
const BALANCE_HISTORY_ALARM_TRIGGER: DailyBalanceHistoryCaptureSource = "alarm"

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

  async debugSeedEstimateSnapshots(): Promise<{
    seeded: number
    skipped: number
    todayKey: string
    yesterdayKey: string
  }> {
    const prefs = await userPreferences.getPreferences()
    const config = prefs.balanceHistory ?? DEFAULT_BALANCE_HISTORY_PREFERENCES
    const retentionDays = Math.max(
      2,
      clampBalanceHistoryRetentionDays(config.retentionDays),
    )
    const nowMs = Date.now()
    const todayKey = getDayKeyFromUnixSeconds(Math.floor(nowMs / 1000))
    const yesterdayKey = subtractDaysFromDayKey(todayKey, 1)
    const accounts = await accountQueries.getEnabledAccounts()
    let seeded = 0
    let skipped = 0

    for (const account of accounts) {
      if (
        account.excludeFromTodayIncome === true ||
        (typeof account.manualBalanceUsd === "string" &&
          account.manualBalanceUsd.trim() !== "")
      ) {
        skipped += 1
        continue
      }

      const info = account.account_info
      const todayStatsAvailability =
        resolveAccountTodayStatsAvailability(account)
      const quota = Number(info?.quota)
      if (!Number.isFinite(quota) || quota <= 0) {
        skipped += 1
        continue
      }

      const todayConsumption =
        isAccountTodayMetricComplete(todayStatsAvailability.consumption) &&
        Number.isFinite(info?.today_quota_consumption)
          ? Math.max(0, Number(info.today_quota_consumption))
          : null
      const trustedIncome =
        isAccountTodayMetricComplete(todayStatsAvailability.income) &&
        Number.isFinite(info?.today_income)
          ? Math.max(0, Number(info.today_income))
          : null
      const estimatedIncome = Math.max(
        (trustedIncome ?? 0) + 1_000_000,
        1_000_000,
      )
      const baselineQuota = Math.max(
        0,
        quota + (todayConsumption ?? 1_000_000) - estimatedIncome,
      )
      const yesterdayCapturedAt = nowMs - 24 * 60 * 60 * 1000

      const yesterdayOk = await dailyBalanceHistoryStorage.upsertSnapshot({
        accountId: account.id,
        dayKey: yesterdayKey,
        retentionDays,
        snapshot: {
          quota: baselineQuota,
          today_income: 0,
          today_quota_consumption: 0,
          capturedAt: yesterdayCapturedAt,
          source: "refresh",
        },
      })
      const todayOk = await dailyBalanceHistoryStorage.upsertSnapshot({
        accountId: account.id,
        dayKey: todayKey,
        retentionDays,
        snapshot: {
          quota,
          today_income: trustedIncome,
          today_quota_consumption: todayConsumption,
          capturedAt: nowMs,
          source: "refresh",
        },
      })

      if (yesterdayOk && todayOk) {
        seeded += 1
      } else {
        skipped += 1
      }
    }

    return { seeded, skipped, todayKey, yesterdayKey }
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

export const handleDailyBalanceHistoryMessage = async (
  request: any,
  sendResponse: (response: any) => void,
) => {
  try {
    if (
      request.action !==
      RuntimeActionIds.BalanceHistoryDebugSeedEstimateSnapshots
    ) {
      sendResponse({ success: false, error: "Unknown action" })
      return
    }

    if (!isDevelopmentMode()) {
      sendResponse({ success: false, error: "Debug action unavailable" })
      return
    }

    const result =
      await dailyBalanceHistoryScheduler.debugSeedEstimateSnapshots()
    sendResponse({ success: true, data: result })
  } catch (error) {
    logger.error("Message handling failed", error)
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}
