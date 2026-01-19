import { formatDayKeyUtc, parseDayKey } from "~/services/usageHistory/core"

export type DayKey = string

/**
 * Build a dense list of day keys for a closed range (inclusive).
 * Uses UTC arithmetic because day keys are already calendar dates (`YYYY-MM-DD`).
 */
export function listDayKeysInRange(startDay: DayKey, endDay: DayKey): DayKey[] {
  const start = parseDayKey(startDay)
  const end = parseDayKey(endDay)
  if (!start || !end) {
    return []
  }

  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day))
  const endDate = new Date(Date.UTC(end.year, end.month - 1, end.day))

  const out: DayKey[] = []
  while (cursor <= endDate) {
    out.push(formatDayKeyUtc(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return out
}
