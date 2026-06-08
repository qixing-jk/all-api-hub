/**
 * Normalize release versions into the dotted numeric format used for changelog lookup.
 */
export function normalizeDottedVersion(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().replace(/^v/i, "")
  if (!/^\d+(?:\.\d+)*$/.test(normalized)) {
    return null
  }

  return normalized
}

/**
 * Compare two dotted release versions numerically, padding missing parts with zero.
 */
export function compareDottedVersions(
  left: string | null | undefined,
  right: string | null | undefined,
): number | null {
  const normalizedLeft = normalizeDottedVersion(left)
  const normalizedRight = normalizeDottedVersion(right)

  if (!normalizedLeft || !normalizedRight) {
    return null
  }

  const leftParts = normalizedLeft
    .split(".")
    .map((part) => Number.parseInt(part, 10))
  const rightParts = normalizedRight
    .split(".")
    .map((part) => Number.parseInt(part, 10))
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index++) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0

    if (leftPart !== rightPart) {
      return leftPart - rightPart
    }
  }

  return 0
}
