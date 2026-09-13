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
    "source" | "groupRatios" | "groupAccessEvidence"
  >[]
  usesAccountContexts: boolean
  selectedAccountId?: string
}) {
  let isGroupAccessAuthoritative = false
  let singleSourceGroupRatios: Record<string, number> = {}
  let matchingContextCount = 0
  const authorityByAccount = new Map<string, boolean>()
  for (const prepared of params.sources) {
    const authoritative = prepared.groupAccessEvidence === "authoritative"
    if (
      !params.usesAccountContexts ||
      prepared.source.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
    ) {
      isGroupAccessAuthoritative = authoritative
      singleSourceGroupRatios = prepared.groupRatios
      continue
    }
    const accountId = prepared.source.account.id
    authorityByAccount.set(
      accountId,
      (authorityByAccount.get(accountId) ?? true) && authoritative,
    )
    if (accountId !== params.selectedAccountId) continue
    if (matchingContextCount === 0) {
      isGroupAccessAuthoritative = authoritative
      singleSourceGroupRatios = prepared.groupRatios
    } else {
      isGroupAccessAuthoritative &&= authoritative
      if (!haveEqualGroupRatios(singleSourceGroupRatios, prepared.groupRatios))
        singleSourceGroupRatios = {}
    }
    matchingContextCount += 1
  }
  return {
    isGroupAccessAuthoritative,
    singleSourceGroupRatios,
    authoritativeGroupAccessByAccountId: Object.fromEntries(
      authorityByAccount,
    ) as Record<string, boolean>,
  }
}
