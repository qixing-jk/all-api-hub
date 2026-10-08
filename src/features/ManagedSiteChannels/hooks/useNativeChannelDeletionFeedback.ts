import type { TFunction } from "i18next"
import { useEffect, useRef } from "react"

import { type useManagedResourceMutationController } from "~/features/ManagedSiteChannels/controllers/useManagedResourceMutationController"
import type { ManagedChannelsRowViewModel } from "~/features/ManagedSiteChannels/presentation/contracts"
import toast from "~/lib/notify"

/** Keeps confirmation labels and completion feedback tied to one deletion result. */
export function useNativeChannelDeletionFeedback(
  mutation: ReturnType<typeof useManagedResourceMutationController>,
  rowsByKey: ReadonlyMap<string, ManagedChannelsRowViewModel>,
  t: TFunction,
) {
  const confirmedDeleteLabels = useRef(new Map<string, string>())

  const notifiedDeleteResults = useRef<
    typeof mutation.deleteState.results | null
  >(null)

  useEffect(() => {
    const { results, isExecuting } = mutation.deleteState
    if (isExecuting || results === notifiedDeleteResults.current) return
    notifiedDeleteResults.current = results
    if (
      results.length > 0 &&
      results.every(({ status }) => status === "success")
    ) {
      toast.success(
        t("managedSiteChannels:toasts.channelsDeleted", {
          count: results.length,
        }),
      )
    }
  }, [mutation.deleteState, t])
  return {
    confirmedDeleteLabels,
    confirmDelete: () => {
      confirmedDeleteLabels.current = new Map(
        mutation.deleteState.rowKeys.flatMap((rowKey) => {
          const row = rowsByKey.get(rowKey)
          return row ? [[rowKey, row.name] as const] : []
        }),
      )
      void mutation.confirmDelete()
    },
  }
}
