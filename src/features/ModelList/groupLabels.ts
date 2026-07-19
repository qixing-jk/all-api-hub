/** Returns a finite group ratio when the source provides one. */
export function resolveKnownGroupRatio(
  group: string,
  groupRatios: Record<string, number>,
) {
  const ratio = groupRatios[group]
  return typeof ratio === "number" && Number.isFinite(ratio) ? ratio : undefined
}

/** Formats a group name with its ratio for consistent UI display. */
export function formatGroupLabel(group: string, ratio: number) {
  return `${group} (${ratio}x)`
}

/** Formats a group name by resolving its ratio from the provided ratio map. */
export function formatGroupLabelFromRatios(
  group: string,
  groupRatios: Record<string, number>,
) {
  const ratio = resolveKnownGroupRatio(group, groupRatios)
  return ratio === undefined ? group : formatGroupLabel(group, ratio)
}
