/** Falls back to 1x when a group ratio is missing or invalid. */
export function resolveGroupRatio(
  group: string,
  groupRatios: Record<string, number>,
) {
  const ratio = groupRatios[group]
  return typeof ratio === "number" && Number.isFinite(ratio) ? ratio : 1
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
  return formatGroupLabel(group, resolveGroupRatio(group, groupRatios))
}
