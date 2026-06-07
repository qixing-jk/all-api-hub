/**
 * Converts app release strings into numeric segments for range comparisons.
 */
function normalizeVersion(value: string): number[] | null {
  const normalized = value.trim().replace(/^v/i, "")
  if (!/^\d+(?:\.\d+)*$/.test(normalized)) return null
  return normalized.split(".").map((part) => Number.parseInt(part, 10))
}

/**
 * Compares version segments while treating missing trailing segments as zero.
 */
function compareVersions(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index++) {
    const leftPart = left[index] ?? 0
    const rightPart = right[index] ?? 0
    if (leftPart !== rightPart) return leftPart - rightPart
  }
  return 0
}

/**
 * Evaluates a single comparator token from a whitespace-delimited range.
 */
function evaluateComparator(current: number[], token: string): boolean {
  const match = /^(>=|<=|>|<|=)?(.+)$/.exec(token.trim())
  if (!match) return false

  const operator = match[1] ?? "="
  const target = normalizeVersion(match[2])
  if (!target) return false

  const comparison = compareVersions(current, target)
  switch (operator) {
    case ">=":
      return comparison >= 0
    case "<=":
      return comparison <= 0
    case ">":
      return comparison > 0
    case "<":
      return comparison < 0
    case "=":
      return comparison === 0
    default:
      return false
  }
}

/**
 * Checks whether the current app version is included in a simple semver range.
 */
export function isVersionInRange(
  currentVersion: string,
  range: string,
): boolean {
  const trimmedRange = range.trim()
  if (!trimmedRange) return false
  if (trimmedRange === "*") return normalizeVersion(currentVersion) !== null

  const current = normalizeVersion(currentVersion)
  if (!current) return false

  return trimmedRange
    .split(/\s+/)
    .every((token) => evaluateComparator(current, token))
}
