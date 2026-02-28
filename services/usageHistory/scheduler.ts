import { RuntimeActionIds } from "~/constants/runtimeActions"
import { accountStorage } from "~/services/accounts/accountStorage"
import { userPreferences } from "~/services/userPreferences"
import type { UsageHistoryPreferences } from "~/types/usageHistory"
import {
  DEFAULT_USAGE_HISTORY_PREFERENCES,
  USAGE_HISTORY_SCHEDULE_MODE,
} from "~/types/usageHistory"
import {
  clearAlarm,
  createAlarm,
  hasAlarmsAPI,
  onAlarm,
} from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

import { USAGE_HISTORY_ALARM_NAME } from "./constants"
import { usageHistoryStorage } from "./storage"
import {
  syncUsageHistoryForAccount,
  type UsageHistorySyncTrigger,
} from "./sync"

const logger = createLogger("UsageHistoryScheduler")

export interface UsageHistoryBatchSyncResult {
  totals: {
    success: number
    skipped: number
    error: number
    unsupported: number
  }
  perAccount: Array<Awaited<ReturnType<typeof syncUsageHistoryForAccount>>>
}

/**
 * Clamp retention days to a safe bounded range.
 */
function clampRetentionDays(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return DEFAULT_USAGE_HISTORY_PREFERENCES.retentionDays
  return Math.min(365, Math.max(1, Math.trunc(parsed)))
}

/**
 * Clamp sync interval (minutes) to a safe bounded range.
 */
function clampSyncIntervalMinutes(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return DEFAULT_USAGE_HISTORY_PREFERENCES.syncIntervalMinutes
  return Math.min(24 * 60, Math.max(1, Math.trunc(parsed)))
}

class UsageHistoryScheduler {
  private isInitialized = false
  private isRunning = false

  async initialize() {
    if (this.isInitialized) {
      return
    }

    onAlarm(async (alarm) => {
      if (alarm.name !== USAGE_HISTORY_ALARM_NAME) {
        return
      }

      // Await to keep the MV3 service worker alive while the sync runs.
      await this.runSync({
        trigger: "alarm",
      })
    })

    await this.applyScheduleFromPreferences()
    this.isInitialized = true
  }

  private async applyScheduleFromPreferences(): Promise<void> {
    const prefs = await userPreferences.getPreferences()
    const config = prefs.usageHistory ?? DEFAULT_USAGE_HISTORY_PREFERENCES

    if (
      !config.enabled ||
      config.scheduleMode !== USAGE_HISTORY_SCHEDULE_MODE.ALARM
    ) {
      await clearAlarm(USAGE_HISTORY_ALARM_NAME)
      return
    }

    if (!hasAlarmsAPI()) {
      await clearAlarm(USAGE_HISTORY_ALARM_NAME)

      const fallback: UsageHistoryPreferences = {
        ...config,
        scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH,
      }

      await userPreferences.savePreferences({ usageHistory: fallback })
      logger.warn(
        "Alarms API unavailable; falling back to after-refresh schedule",
      )
      return
    }

    await createAlarm(USAGE_HISTORY_ALARM_NAME, {
      periodInMinutes: clampSyncIntervalMinutes(config.syncIntervalMinutes),
      delayInMinutes: 1,
    })
  }

  async updateSettings(
    updates: Partial<
      Pick<
        UsageHistoryPreferences,
        "enabled" | "retentionDays" | "scheduleMode" | "syncIntervalMinutes"
      >
    >,
  ): Promise<{ warning?: string }> {
    const prefs = await userPreferences.getPreferences()
    const current = prefs.usageHistory ?? DEFAULT_USAGE_HISTORY_PREFERENCES

    const next: UsageHistoryPreferences = {
      ...current,
      ...updates,
      retentionDays: clampRetentionDays(
        updates.retentionDays ?? current.retentionDays,
      ),
      syncIntervalMinutes: clampSyncIntervalMinutes(
        updates.syncIntervalMinutes ?? current.syncIntervalMinutes,
      ),
    }

    let warning: string | undefined
    if (
      next.enabled &&
      next.scheduleMode === USAGE_HISTORY_SCHEDULE_MODE.ALARM &&
      !hasAlarmsAPI()
    ) {
      next.scheduleMode = USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH
      warning =
        "Alarms API not supported; falling back to after-refresh scheduling."
    }

    await userPreferences.savePreferences({ usageHistory: next })
    await usageHistoryStorage.pruneAllAccounts(next.retentionDays)
    await this.applyScheduleFromPreferences()

    return { warning }
  }

  async runAfterRefreshSync() {
    return await this.runSync({ trigger: "afterRefresh" })
  }

  async runManualSync(accountIds?: string[]) {
    return await this.runSync({ trigger: "manual", accountIds, force: true })
  }

  private async runSync(params: {
    trigger: UsageHistorySyncTrigger
    accountIds?: string[]
    force?: boolean
  }): Promise<UsageHistoryBatchSyncResult | null> {
    if (this.isRunning) {
      return null
    }

    this.isRunning = true

    try {
      const prefs = await userPreferences.getPreferences()
      const config = prefs.usageHistory ?? DEFAULT_USAGE_HISTORY_PREFERENCES

      if (!config.enabled && !params.force) {
        return {
          totals: { success: 0, skipped: 0, error: 0, unsupported: 0 },
          perAccount: [],
        }
      }

      if (
        params.trigger === "afterRefresh" &&
        config.scheduleMode !== USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH &&
        !params.force
      ) {
        return {
          totals: { success: 0, skipped: 0, error: 0, unsupported: 0 },
          perAccount: [],
        }
      }

      if (
        params.trigger === "alarm" &&
        config.scheduleMode !== USAGE_HISTORY_SCHEDULE_MODE.ALARM &&
        !params.force
      ) {
        return {
          totals: { success: 0, skipped: 0, error: 0, unsupported: 0 },
          perAccount: [],
        }
      }

      const accounts = params.accountIds?.length
        ? await Promise.all(
            params.accountIds.map((id) => accountStorage.getAccountById(id)),
          ).then((values) =>
            values
              .filter((value): value is NonNullable<typeof value> =>
                Boolean(value),
              )
              .filter((account) => account.disabled !== true),
          )
        : await accountStorage.getEnabledAccounts()

      const perAccount: Array<
        Awaited<ReturnType<typeof syncUsageHistoryForAccount>>
      > = []

      for (const account of accounts) {
        const result = await syncUsageHistoryForAccount({
          accountId: account.id,
          trigger: params.trigger,
          force: params.force,
          config,
        })
        perAccount.push(result)
      }

      const totals = perAccount.reduce(
        (acc, item) => {
          acc[item.status] += 1
          return acc
        },
        {
          success: 0,
          skipped: 0,
          error: 0,
          unsupported: 0,
        } as UsageHistoryBatchSyncResult["totals"],
      )

      return { totals, perAccount }
    } catch (error) {
      logger.error("Sync run failed", error)
      return null
    } finally {
      this.isRunning = false
    }
  }
}

export const usageHistoryScheduler = new UsageHistoryScheduler()

export const handleUsageHistoryMessage = async (
  request: any,
  sendResponse: (response: any) => void,
) => {
  try {
    switch (request.action) {
      case RuntimeActionIds.UsageHistoryUpdateSettings: {
        const result = await usageHistoryScheduler.updateSettings(
          request.settings ?? {},
        )
        sendResponse({ success: true, data: result })
        break
      }

      case RuntimeActionIds.UsageHistorySyncNow: {
        const accountIds = Array.isArray(request.accountIds)
          ? (request.accountIds as string[])
          : undefined
        const result = await usageHistoryScheduler.runManualSync(accountIds)
        sendResponse({ success: true, data: result })
        break
      }

      case RuntimeActionIds.UsageHistoryPrune: {
        const prefs = await userPreferences.getPreferences()
        const config = prefs.usageHistory ?? DEFAULT_USAGE_HISTORY_PREFERENCES
        const ok = await usageHistoryStorage.pruneAllAccounts(
          config.retentionDays,
        )
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
