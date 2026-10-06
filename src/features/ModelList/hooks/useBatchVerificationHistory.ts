import { useCallback, useRef } from "react"

import {
  MODEL_LIST_BATCH_VERIFY_PERSIST_FLUSH_SIZE,
  type BatchVerifyModelItem,
} from "~/features/ModelList/batchVerification"
import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/modelManagementSources"
import {
  type ApiVerificationApiType,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import {
  createAccountModelVerificationHistoryTarget,
  createProfileModelVerificationHistoryTarget,
  createVerificationHistorySummary,
  verificationResultHistoryStorage,
  type ApiVerificationHistorySummary,
} from "~/services/verification/verificationResultHistory"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("BatchVerifyModelsDialog")
/** Buffer completed models and atomically hand each flush to the history adapter. */
export function useBatchVerificationHistory() {
  const pendingSummariesRef = useRef<ApiVerificationHistorySummary[]>([])
  /**
   * Writes the pending results in one store write.
   *
   * Swaps the buffer before awaiting so concurrent workers cannot flush the same
   * results twice. A failure is logged for the batch: one unwritable store must
   * not discard the other results, and the rows report their own probe outcomes
   * regardless of persistence.
   */
  const flushPendingResults = useCallback(async () => {
    const pending = pendingSummariesRef.current
    if (pending.length === 0) return

    pendingSummariesRef.current = []
    try {
      await verificationResultHistoryStorage.upsertLatestSummaries(pending)
    } catch (persistError) {
      logger.error("Failed to persist batch verification results", {
        count: pending.length,
        message: toSanitizedErrorSummary(persistError, []),
      })
    }
  }, [])

  const persistResult = useCallback(
    async (
      item: BatchVerifyModelItem,
      apiType: ApiVerificationApiType,
      results: ApiVerificationProbeResult[],
    ) => {
      const target =
        item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
          ? createProfileModelVerificationHistoryTarget(
              item.source.profile.id,
              item.modelId,
            )
          : createAccountModelVerificationHistoryTarget(
              item.source.account.id,
              item.modelId,
            )
      if (!target) return

      const historySummary = createVerificationHistorySummary({
        target,
        apiType,
        preferredModelId: item.modelId,
        results,
      })
      if (!historySummary) return

      pendingSummariesRef.current.push(historySummary)
      if (
        pendingSummariesRef.current.length >=
        MODEL_LIST_BATCH_VERIFY_PERSIST_FLUSH_SIZE
      ) {
        await flushPendingResults()
      }
    },
    [flushPendingResults],
  )

  return { persistResult, flushPendingResults }
}
