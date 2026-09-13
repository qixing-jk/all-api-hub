import { normalizeGroupNames } from "~/features/ModelList/groupNormalization"
import type { AccountGroupOption } from "~/features/ModelList/modelListItems"

interface GroupAvailabilityInput {
  sourceId: string
  accountId: string
  usableGroups: readonly string[]
  /** Ratio keys are normalized by the group-context boundary. */
  groupRatios: Readonly<Record<string, number>>
}

interface GroupAvailability {
  availableGroupsBySourceId: Record<string, string[]>
  availableAccountGroupsByAccountId: Record<string, string[]>
  availableAccountGroupOptionsByAccountId: Record<string, AccountGroupOption[]>
}

/** Derives ordered access indexes and conservative account-level display ratios. */
export function deriveGroupAvailability(
  items: readonly GroupAvailabilityInput[],
): GroupAvailability {
  const groupsBySourceId = new Map<string, Set<string>>()
  const ratiosByAccountId = new Map<string, Map<string, number | undefined>>()

  for (const item of items) {
    const sourceGroups =
      groupsBySourceId.get(item.sourceId) ?? new Set<string>()
    const accountRatios =
      ratiosByAccountId.get(item.accountId) ??
      new Map<string, number | undefined>()

    for (const group of normalizeGroupNames(item.usableGroups)) {
      sourceGroups.add(group)
      const ratio = item.groupRatios[group]
      const finiteRatio = Number.isFinite(ratio) ? ratio : undefined
      if (!accountRatios.has(group)) {
        accountRatios.set(group, finiteRatio)
      } else if (accountRatios.get(group) !== finiteRatio) {
        // Once any row disagrees or lacks a ratio, later rows cannot restore it.
        accountRatios.set(group, undefined)
      }
    }

    groupsBySourceId.set(item.sourceId, sourceGroups)
    ratiosByAccountId.set(item.accountId, accountRatios)
  }

  return {
    availableGroupsBySourceId: Object.fromEntries(
      Array.from(groupsBySourceId, ([sourceId, groups]) => [
        sourceId,
        [...groups],
      ]),
    ),
    availableAccountGroupsByAccountId: Object.fromEntries(
      Array.from(ratiosByAccountId, ([accountId, ratios]) => [
        accountId,
        [...ratios.keys()],
      ]),
    ),
    availableAccountGroupOptionsByAccountId: Object.fromEntries(
      Array.from(ratiosByAccountId, ([accountId, ratios]) => [
        accountId,
        Array.from(
          ratios,
          ([name, ratio]): AccountGroupOption => ({
            name,
            ...(ratio === undefined ? {} : { ratio }),
          }),
        ),
      ]),
    ),
  }
}
