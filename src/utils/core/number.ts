/** Coerces an optional unknown value to a finite number when possible. */
export const toOptionalFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string" || !value.trim()) return undefined

  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : undefined
}
