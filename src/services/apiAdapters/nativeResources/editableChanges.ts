/** Compare provider-owned editable values, including primitive array fields. */
export const resourceValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => resourceValuesEqual(value, right[index]))
    )
  if (!left || !right || typeof left !== "object" || typeof right !== "object")
    return false
  const leftValues = left as Record<string, unknown>
  const rightValues = right as Record<string, unknown>
  return (
    Object.keys(leftValues).length === Object.keys(rightValues).length &&
    Object.keys(leftValues).every(
      (key) =>
        Object.hasOwn(rightValues, key) &&
        resourceValuesEqual(leftValues[key], rightValues[key]),
    )
  )
}

/**
 * Apply only local edits to fresh provider data. A concurrent edit to the same
 * field requires reopening the editor; unrelated remote changes are preserved.
 */
export function mergeResourceEdits<T extends object>(
  baseline: T,
  edited: T,
  latest: T,
): T | null {
  const merged = { ...latest }
  for (const key of Object.keys(edited) as (keyof T)[]) {
    if (resourceValuesEqual(baseline[key], edited[key])) continue
    if (
      !resourceValuesEqual(baseline[key], latest[key]) &&
      !resourceValuesEqual(edited[key], latest[key])
    )
      return null
    merged[key] = edited[key]
  }
  return merged
}
