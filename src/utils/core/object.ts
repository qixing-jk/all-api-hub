/**
 * Determine whether an unknown value is a plain object record.
 *
 * Accepts objects created via object literals or `Object.create(null)` and
 * rejects arrays, built-in object instances, and custom class instances.
 */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)

  return prototype === Object.prototype || prototype === null
}
