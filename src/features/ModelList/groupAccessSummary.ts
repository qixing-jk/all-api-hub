import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/modelManagementSources"
import type { PreparedModelListSource } from "~/features/ModelList/sourcePreparation"

/** Compares normalized ratio maps without relying on object identity. */
function haveEqualGroupRatios(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
) {
  const leftEntries = Object.entries(left)
  return (
    leftEntries.length === Object.keys(right).length &&
    leftEntries.every(([group, ratio]) => right[group] === ratio)
  )
}

/** Combines source evidence conservatively without applying or changing user selections. */
export function summarizeModelListGroupAccess(params: {
  sources: readonly Pick<
    PreparedModelListSource,
    "source" | "groupRatios" | "canRepairGroupSelection"
  >[]
  usesAccountContexts: boolean
  selectedAccountId?: string
}) {
  let canRepairGroupSelection = false
  let singleSourceGroupRatios: Record<string, number> = {}
  let matchingContextCount = 0
  const repairByAccount = new Map<string, boolean>()
  for (const prepared of params.sources) {
    const canRepair = prepared.canRepairGroupSelection
    if (
      !params.usesAccountContexts ||
      prepared.source.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
    ) {
      canRepairGroupSelection = canRepair
      singleSourceGroupRatios = prepared.groupRatios
      continue
    }
    const accountId = prepared.source.account.id
    repairByAccount.set(
      accountId,
      (repairByAccount.get(accountId) ?? true) && canRepair,
    )
    if (accountId !== params.selectedAccountId) continue
    if (matchingContextCount === 0) {
      canRepairGroupSelection = canRepair
      singleSourceGroupRatios = prepared.groupRatios
    } else {
      canRepairGroupSelection &&= canRepair
      if (!haveEqualGroupRatios(singleSourceGroupRatios, prepared.groupRatios))
        singleSourceGroupRatios = {}
    }
    matchingContextCount += 1
  }
  return {
    canRepairGroupSelection,
    singleSourceGroupRatios,
    canRepairGroupSelectionByAccountId: Object.fromEntries(
      repairByAccount,
    ) as Record<string, boolean>,
  }
}
