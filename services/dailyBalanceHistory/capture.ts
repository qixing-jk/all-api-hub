import type {
  BalanceHistoryPreferences,
  DailyBalanceHistoryCaptureSource,
  DailyBalanceSnapshot,
} from "~/types/dailyBalanceHistory"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"

import { getDayKeyFromUnixSeconds } from "./dayKeys"
import { dailyBalanceHistoryStorage } from "./storage"

/**
 * Best-effort snapshot upsert used by refresh-driven and alarm-driven capture.
 *
 * When `includeTodayCashflow` is false, cashflow fields are stored as `null`
 * to avoid persisting placeholder zeros that do not represent real values.
 */
export async function maybeCaptureDailyBalanceSnapshot(params: {
  config?: BalanceHistoryPreferences
  accountId: string
  quota: number
  today_income: number
  today_quota_consumption: number
  includeTodayCashflow: boolean
  source: DailyBalanceHistoryCaptureSource
  capturedAtMs?: number
  timeZone?: string
}): Promise<boolean> {
  const config = params.config ?? DEFAULT_BALANCE_HISTORY_PREFERENCES
  if (!config.enabled) {
    return false
  }

  const capturedAtMs =
    typeof params.capturedAtMs === "number" && Number.isFinite(params.capturedAtMs)
      ? params.capturedAtMs
      : Date.now()

  const dayKey = getDayKeyFromUnixSeconds(
    Math.floor(capturedAtMs / 1000),
    params.timeZone,
  )

  const snapshot: DailyBalanceSnapshot = {
    quota: params.quota,
    today_income: params.includeTodayCashflow ? params.today_income : null,
    today_quota_consumption: params.includeTodayCashflow
      ? params.today_quota_consumption
      : null,
    capturedAt: capturedAtMs,
    source: params.source,
  }

  return await dailyBalanceHistoryStorage.upsertSnapshot({
    accountId: params.accountId,
    dayKey,
    snapshot,
    retentionDays: config.retentionDays,
    timeZone: params.timeZone,
  })
}

