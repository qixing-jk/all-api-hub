const ISO_CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Returns whether a value is a real ISO 8601 calendar date without rollover. */
export function isIsoCalendarDate(value: string): boolean {
  if (!ISO_CALENDAR_DATE_PATTERN.test(value)) return false

  const parsed = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}
