import { normalizeGroupNames } from "./groupNormalization"

/** Checks whether two normalized group lists represent the same selection. */
function hasSameGroups(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((group, index) => group === right[index])
  )
}

/** Intersects a selection with the groups available after a settled refresh. */
export function repairSelectedGroups(
  current: string[],
  availableGroups: readonly string[],
): string[] {
  const available = new Set(normalizeGroupNames(availableGroups))
  const repaired = normalizeGroupNames(current).filter((group) =>
    available.has(group),
  )

  return hasSameGroups(current, repaired) ? current : repaired
}

/** Repairs settled account exclusions while preserving unresolved account state. */
export function repairAllAccountGroupExclusions({
  current,
  availableByAccountId,
  settledAccountIds,
}: {
  current: Record<string, string[]>
  availableByAccountId: Readonly<Record<string, string[]>>
  settledAccountIds: ReadonlySet<string>
}): Record<string, string[]> {
  let repaired: Record<string, string[]> | null = null

  Object.entries(current).forEach(([accountId, excludedGroups]) => {
    if (!settledAccountIds.has(accountId)) {
      return
    }

    const nextExcludedGroups = repairSelectedGroups(
      excludedGroups,
      availableByAccountId[accountId] ?? [],
    )
    if (
      nextExcludedGroups.length > 0 &&
      nextExcludedGroups === excludedGroups
    ) {
      return
    }

    repaired ??= { ...current }
    if (nextExcludedGroups.length === 0) {
      delete repaired[accountId]
      return
    }

    repaired[accountId] = nextExcludedGroups
  })

  return repaired ?? current
}
