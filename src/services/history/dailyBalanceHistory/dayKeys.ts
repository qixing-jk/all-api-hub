/**
 * Day-key policy helpers for daily-balance-history.
 *
 * Pure day-key primitives (parsing, formatting, arithmetic) live in
 * `~/utils/core/dayKey`; this module only adds balance-history retention and
 * chart-range policies on top of them.
 */

import { getHistoryRetentionCutoffDayKey } from "~/services/history/retention"
import {
  formatDayKeyUtc,
  getDayKeyFromUnixSeconds,
  parseDayKey,
} from "~/utils/core/dayKey"

/**
 * Compute the earliest day bucket that should be retained for the given retention window.
 */
export function computeRetentionCutoffDayKey(params: {
  retentionDays: number
  nowUnixSeconds: number
  timeZone?: string
}): string {
  const todayKey = getDayKeyFromUnixSeconds(
    params.nowUnixSeconds,
    params.timeZone,
  )
  return getHistoryRetentionCutoffDayKey(todayKey, params.retentionDays)
}

/**
 * List dense day keys in an inclusive range.
 *
 * Missing day buckets are always included to make chart domains stable.
 */
export function listDayKeysInRange(params: {
  startDayKey: string
  endDayKey: string
}): string[] {
  const { startDayKey, endDayKey } = params

  const startParsed = parseDayKey(startDayKey)
  const endParsed = parseDayKey(endDayKey)
  if (!startParsed || !endParsed) {
    return []
  }

  const start = new Date(
    Date.UTC(startParsed.year, startParsed.month - 1, startParsed.day),
  )
  const end = new Date(
    Date.UTC(endParsed.year, endParsed.month - 1, endParsed.day),
  )

  if (start.getTime() > end.getTime()) {
    return []
  }

  const out: string[] = []
  const cursor = new Date(start.getTime())

  while (cursor.getTime() <= end.getTime()) {
    out.push(formatDayKeyUtc(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return out
}
