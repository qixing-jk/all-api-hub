/** Normalizes group names while preserving first-seen encounter order. */
export function normalizeGroupNames(groups: Iterable<string>): string[] {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const value of groups) {
    const group = value.trim()
    if (!group || seen.has(group)) continue
    seen.add(group)
    normalized.push(group)
  }

  return normalized
}
