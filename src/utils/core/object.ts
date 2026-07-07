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

/**
 * Determine whether an unknown value can be inspected as an object record.
 *
 * This is intentionally broader than `isPlainObject`: JSON-like validation
 * often only needs to reject primitives, null, and arrays while preserving
 * field-level checks for the object itself.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Determine whether an unknown value is an array containing only strings.
 */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}
