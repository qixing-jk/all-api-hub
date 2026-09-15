import type { AccountKeyCreationIntent } from "~/services/apiAdapters/contracts/accountKeyResource"

/** Resolve name-based creation hints while retaining exact provider group IDs. */
export function resolveKeyCreationGroupIntent<
  T extends { id: number; displayName: string },
>(groups: readonly T[] = [], intent?: AccountKeyCreationIntent) {
  const allowedNames = intent?.allowedGroups
  const allowedIds = allowedNames
    ? new Set(
        groups
          .filter((group) => allowedNames.includes(group.displayName))
          .map((group) => String(group.id)),
      )
    : null
  const matches = groups.filter((group) =>
    intent?.preferredGroup
      ? group.displayName === intent.preferredGroup
      : allowedNames?.length === 1 && group.displayName === allowedNames[0],
  )
  return {
    allowedIds,
    preferred: matches.length === 1 ? matches[0] : undefined,
  }
}
