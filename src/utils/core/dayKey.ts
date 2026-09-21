/**
 * Day-key (`YYYY-MM-DD`) and month-key (`YYYY-MM`) helpers.
 *
 * Timezone contract for time-related code in this app:
 * - "Today" boundaries, scheduling, and history buckets use the
 *   DEVICE-LOCAL timezone (`formatLocalDayKey`, `formatLocalMonthKey`,
 *   `getDayKeyFromUnixSeconds` without `timeZone`).
 * - UTC day keys (`formatUtcDayKey`) are only for telemetry counters and
 *   opaque labels (e.g. backup filenames) where "which local day" is
 *   irrelevant.
 * - Site-configured timezones are handled where the site's contract is
 *   parsed (see `services/modelPricing` and the API adapters); they never
 *   apply to the user's own day boundaries.
 *
 * Day-key arithmetic (`parseDayKey` / `addDaysToDayKey` /
 * `subtractDaysFromDayKey` / `listDayKeysInRange` callers) uses UTC fields to
 * keep calendar math predictable and DST-safe; local wall-clock is only read
 * when deriving a key from an instant.
 */

/**
 * Pad a numeric value to 2 digits using leading zeros.
 */
function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

/**
 * Format the local calendar day (`YYYY-MM-DD`) of the given instant.
 *
 * DST-safe: reads local calendar fields instead of offset math. This is the
 * canonical "today" boundary shared by the auto check-in scheduler, the
 * custom check-in state, and local history buckets.
 */
export function formatLocalDayKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * Format the UTC calendar day (`YYYY-MM-DD`) of the given instant.
 *
 * Intended for telemetry day counters and opaque labels only — not for
 * user-facing "today" decisions.
 */
export function formatUtcDayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Format the local calendar month (`YYYY-MM`) of the given instant.
 */
export function formatLocalMonthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

/**
 * Format a Date into a day bucket (`YYYY-MM-DD`) using UTC fields.
 *
 * This is used for day-key arithmetic and display; bucket assignment itself
 * can be local.
 */
export function formatDayKeyUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

/**
 * Parse a `YYYY-MM-DD` day key into date parts.
 *
 * Rejects invalid calendar days (e.g. `2026-02-31`) that JS Date would
 * otherwise normalize.
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
