/** Parses announcement seconds, milliseconds and date strings into epoch milliseconds. */
export function parseAnnouncementTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value))
    return value > 10_000_000_000 ? value : value * 1000
  if (typeof value !== "string" || !value.trim()) return undefined
  const number = Number(value)
  if (Number.isFinite(number))
    return number > 10_000_000_000 ? number : number * 1000
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : undefined
}
