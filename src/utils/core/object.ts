/**
 * Determine whether an unknown value is a non-array object record.
 *
 * This intentionally matches the loose storage/preferences guards previously
 * inlined at call sites: any non-null object except arrays is accepted.
 */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
