import { RuntimeActionIds } from "~/constants/runtimeActions"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { isRecord } from "~/utils/core/object"

let pendingLookup:
  | { ids: Set<number>; result: Promise<Set<number>> }
  | undefined

/** Coalesces this turn's scans without caching ownership across later tab events. */
function queryInternalTabs(ids: number[]): Promise<Set<number>> {
  if (!pendingLookup) {
    const candidates = new Set<number>()
    const result = Promise.resolve().then(async () => {
      pendingLookup = undefined
      const response = await sendRuntimeMessage<unknown>({
        action: RuntimeActionIds.GetInternalTabIds,
        tabIds: [...candidates],
      })
      if (
        !isRecord(response) ||
        response.success !== true ||
        !Array.isArray(response.tabIds) ||
        !response.tabIds.every((id) => candidates.has(id))
      ) {
        throw new Error("Internal tab ownership could not be confirmed")
      }
      return new Set<number>(response.tabIds)
    })
    pendingLookup = { ids: candidates, result }
  }
  for (const id of ids) pendingLookup.ids.add(id)
  return pendingLookup.result
}

/** Keeps extension-owned task pages out of user browsing-context signals. */
export async function excludeInternalTabs<T extends { id?: number }>(
  tabs: T[],
): Promise<T[]> {
  const identifiableTabs = tabs.filter(
    (tab): tab is T & { id: number } =>
      typeof tab.id === "number" && Number.isSafeInteger(tab.id) && tab.id >= 0,
  )
  if (identifiableTabs.length === 0) return []
  const internalIds = await queryInternalTabs(
    identifiableTabs.map((tab) => tab.id),
  )
  return identifiableTabs.filter((tab) => !internalIds.has(tab.id))
}
