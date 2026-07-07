/**
 * Parses an optional date string into a timestamp.
 *
 * Returns `undefined` for omitted fields and `false` for malformed fields so
 * callers can distinguish absence from invalid data without throwing.
 */
export function parseOptionalDate(value: unknown): number | false | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string") return false

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? false : timestamp
}
