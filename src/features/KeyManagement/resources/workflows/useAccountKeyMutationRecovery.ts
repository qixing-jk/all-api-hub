import { useCallback } from "react"
import { useTranslation } from "react-i18next"

import { feedbackDescription } from "~/features/KeyManagement/resources/accountKeyResourceEditorFeedback"
import type {
  ActiveResourceBoundary,
  RecoverMutationFailure,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceControllerTypes"
import toast from "~/lib/notify"
import { ACCOUNT_KEY_RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/accountKeyResource"

/** Shares uncertainty feedback and reconciliation across creation and management. */
export function useAccountKeyMutationRecovery({
  requireFreshRead,
  reconcile,
}: {
  requireFreshRead: (boundary: ActiveResourceBoundary) => void
  reconcile: (boundary: ActiveResourceBoundary) => Promise<unknown>
}) {
  const { t } = useTranslation()
  return useCallback<RecoverMutationFailure>(
    async (failure, boundary, current) => {
      if (
        failure.code !==
        ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain
      )
        return
      requireFreshRead(boundary)
      if (!current) return
      // Reconciliation may replace the dialog. A successful read does not prove
      // that the preceding write succeeded; retain its warning until dismissed.
      toast.warning(feedbackDescription(failure, t), {
        duration: Infinity,
      })
      await reconcile(boundary)
    },
    [requireFreshRead, reconcile, t],
  )
}
