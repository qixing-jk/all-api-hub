/** Compare normalized settings, treating omitted legacy fields as their defaults. */
export function matchesDefaultSettings(
  value: unknown,
  defaults: unknown,
): boolean {
  if (value === undefined) return true
  if (Object.is(value, defaults)) return true
  if (Array.isArray(value) || Array.isArray(defaults)) {
    return (
      Array.isArray(value) &&
      Array.isArray(defaults) &&
      value.length === defaults.length &&
      value.every((item, index) =>
        matchesDefaultSettings(item, defaults[index]),
      )
    )
  }
  if (
    value &&
    defaults &&
    typeof value === "object" &&
    typeof defaults === "object"
  ) {
    return Object.entries(value).every(([key, item]) =>
      matchesDefaultSettings(item, (defaults as Record<string, unknown>)[key]),
    )
  }
  return false
}
