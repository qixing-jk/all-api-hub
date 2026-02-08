/**
 * Day-key helpers for daily-balance-history (`YYYY-MM-DD`).
 *
 * Notes:
 * - Snapshot buckets are keyed by local calendar day.
 * - Day-key arithmetic uses UTC fields to keep calendar math predictable.
 */

/**
 * Pad a numeric value to 2 digits using leading zeros.
 */
function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

/**
 * Format a Date into a day bucket (`YYYY-MM-DD`) using UTC fields.
 */
export function formatDayKeyUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

/**
 * Parse a `YYYY-MM-DD` day key into date parts.
 */
export function parseDayKey(dayKey: string): {
  year: number
  month: number
  day: number
} | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null
  }

  // Reject invalid calendar days (e.g. 2026-02-31) that JS Date would otherwise normalize.
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day }
}

/**
 * Add N calendar days to a `YYYY-MM-DD` day key and return the new day key.
 */
export function addDaysToDayKey(dayKey: string, days: number): string {
  const parsed = parseDayKey(dayKey)
  if (!parsed) {
    throw new Error(`Invalid dayKey: ${dayKey}`)
  }

  const safeDays = Number.isFinite(days) ? Math.trunc(days) : 0
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day))
  date.setUTCDate(date.getUTCDate() + safeDays)
  return formatDayKeyUtc(date)
}

/**
 * Subtract N calendar days from a `YYYY-MM-DD` day key and return the new day key.
 */
export function subtractDaysFromDayKey(dayKey: string, days: number): string {
  return addDaysToDayKey(dayKey, -days)
}

/**
 * Convert unix seconds into a local day bucket (`YYYY-MM-DD`).
 *
 * When `timeZone` is omitted, the current environment's local timezone is used.
 */
export function getDayKeyFromUnixSeconds(
  unixSeconds: number,
  timeZone?: string,
): string {
  const date = new Date(unixSeconds * 1000)
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })

  const parts = formatter.formatToParts(date)
  let year = ""
  let month = ""
  let day = ""

  for (const part of parts) {
    if (part.type === "year") year = part.value
    if (part.type === "month") month = part.value
    if (part.type === "day") day = part.value
  }

  const dayKey = `${year}-${month}-${day}`
  if (!parseDayKey(dayKey)) {
    throw new Error(`Failed to format dayKey for unixSeconds=${unixSeconds}`)
  }

  return dayKey
}

/**
 * Compute the earliest day bucket that should be retained for the given retention window.
 */
export function computeRetentionCutoffDayKey(params: {
  retentionDays: number
  nowUnixSeconds: number
  timeZone?: string
}): string {
  const safeRetentionDays = Math.max(
    1,
    Number.isFinite(params.retentionDays)
      ? Math.trunc(params.retentionDays)
      : 1,
  )

  const todayKey = getDayKeyFromUnixSeconds(
    params.nowUnixSeconds,
    params.timeZone,
  )
  return subtractDaysFromDayKey(todayKey, safeRetentionDays - 1)
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
