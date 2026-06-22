import {
  getModelItemKey,
  type CalculatedModelItem,
} from "~/features/ModelList/hooks/useFilteredModels"
import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/modelManagementSources"
import {
  createAccountModelVerificationHistoryTarget,
  createProfileModelVerificationHistoryTarget,
  getVerificationSummaryLatencyMs,
  serializeVerificationHistoryTarget,
  type ApiVerificationHistorySummary,
} from "~/services/verification/verificationResultHistory"

export const MODEL_LIST_VERIFICATION_RESULT_FILTERS = {
  PASS: "pass",
  FAIL: "fail",
  UNVERIFIED: "unverified",
} as const

export type ModelListVerificationResultFilter =
  (typeof MODEL_LIST_VERIFICATION_RESULT_FILTERS)[keyof typeof MODEL_LIST_VERIFICATION_RESULT_FILTERS]

export const DEFAULT_MODEL_LIST_VERIFICATION_RESULT_FILTERS = Object.values(
  MODEL_LIST_VERIFICATION_RESULT_FILTERS,
)

/** Builds the verification history lookup key for a model-list row. */
function getVerificationSummaryKeyForModelItem(item: CalculatedModelItem) {
  const modelId = item.model.model_name?.trim()
  if (!modelId) return null

  const historyTarget =
    item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
      ? createProfileModelVerificationHistoryTarget(
          item.source.profile.id,
          modelId,
        )
      : createAccountModelVerificationHistoryTarget(
          item.source.account.id,
          modelId,
        )

  return historyTarget
    ? serializeVerificationHistoryTarget(historyTarget)
    : null
}

/** Applies verification-result filtering and optional latency sorting. */
export function applyVerificationResultView(
  models: CalculatedModelItem[],
  params: {
    selectedResults: ModelListVerificationResultFilter[]
    shouldSortByLatency: boolean
    verificationSummariesByKey: Record<string, ApiVerificationHistorySummary>
  },
) {
  const selectedResultSet = new Set(params.selectedResults)
  const indexedModels = models.map((item, index) => {
    const summaryKey = getVerificationSummaryKeyForModelItem(item)
    const summary = summaryKey
      ? params.verificationSummariesByKey[summaryKey]
      : undefined

    return {
      item,
      index,
      itemKey: getModelItemKey(item),
      result:
        summary?.status ?? MODEL_LIST_VERIFICATION_RESULT_FILTERS.UNVERIFIED,
      latencyMs: getVerificationSummaryLatencyMs(summary),
    }
  })

  const filteredModels = indexedModels.filter((entry) =>
    selectedResultSet.has(entry.result),
  )

  if (!params.shouldSortByLatency) {
    return filteredModels.map(({ item }) => item)
  }

  return [...filteredModels]
    .sort((a, b) => {
      if (
        a.latencyMs !== null &&
        b.latencyMs !== null &&
        a.latencyMs !== b.latencyMs
      ) {
        return a.latencyMs - b.latencyMs
      }

      if (a.latencyMs !== null && b.latencyMs === null) return -1
      if (a.latencyMs === null && b.latencyMs !== null) return 1

      return a.index - b.index
    })
    .map(({ item }) => item)
}
