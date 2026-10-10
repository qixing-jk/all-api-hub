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
  displayNames?: Readonly<Record<string, string>>,
) {
  const ratio = resolveKnownGroupRatio(group, groupRatios)
  const name = resolveGroupDisplayName(group, displayNames)
  return ratio === undefined ? name : formatGroupLabel(name, ratio)
}

/** Group identifiers are provider input, including names shared with object prototype properties. */
export function resolveGroupDisplayName(
  group: string,
  displayNames?: Readonly<Record<string, string>>,
): string {
  return displayNames && Object.hasOwn(displayNames, group)
    ? displayNames[group] ?? group
    : group
}
