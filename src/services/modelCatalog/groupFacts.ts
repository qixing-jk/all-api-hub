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

/** Normalize finite ratios once at admission, preserving zero and own keys. */
export function normalizeGroupRatios(
  groupRatios: Readonly<Record<string, unknown>>,
): Record<string, number> {
  const entries: Array<[string, number]> = []
  const seen = new Set<string>()
  for (const [rawGroup, ratio] of Object.entries(groupRatios)) {
    const group = rawGroup.trim()
    if (
      !group ||
      typeof ratio !== "number" ||
      !Number.isFinite(ratio) ||
      seen.has(group)
    )
      continue
    seen.add(group)
    entries.push([group, ratio])
  }
  return Object.fromEntries(entries)
}
