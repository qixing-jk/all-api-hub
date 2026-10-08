import { useCallback, useMemo } from "react"

import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/catalog/modelManagementSources"
import { MODEL_LIST_SORT_MODES } from "~/features/ModelList/filtering/sortModes"
import type { useModelListData } from "~/features/ModelList/hooks/useModelListData"
import {
  applyVerificationResultView,
  type ModelListVerificationResultFilter,
} from "~/features/ModelList/verification/verificationResultFilters"
import type { ApiVerificationHistoryTarget } from "~/services/verification/verificationResultHistory/types"
import { useVerificationResultHistorySummaries } from "~/services/verification/verificationResultHistory/useVerificationResultHistorySummaries"
import {
  createAccountModelVerificationHistoryTarget,
  createProfileModelVerificationHistoryTarget,
} from "~/services/verification/verificationResultHistory/utils"

type ModelListDisplayedResultCountBaseFilters = NonNullable<
  Parameters<ReturnType<typeof useModelListData>["getFilteredResultCount"]>[0]
>

interface ModelListDisplayedResultCountFilters
  extends ModelListDisplayedResultCountBaseFilters {
  selectedVerificationResults?: ModelListVerificationResultFilter[]
}

type ModelListVerificationResultsInput = Pick<
  ReturnType<typeof useModelListData>,
  | "filteredModels"
  | "selectedVerificationResults"
  | "sortMode"
  | "getFilteredModels"
  | "getFilteredResultCount"
>

/** Keeps displayed rows and result-count previews on the same history projection. */
export function useModelListVerificationResults({
  filteredModels,
  selectedVerificationResults,
  sortMode,
  getFilteredModels,
  getFilteredResultCount,
}: ModelListVerificationResultsInput) {
  const modelVerificationTargets = useMemo(() => {
    return filteredModels.reduce<ApiVerificationHistoryTarget[]>(
      (acc, item) => {
        const source = item.source
        const modelId = item.model.model_name?.trim()
        if (!modelId) return acc

        const historyTarget =
          source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
            ? createProfileModelVerificationHistoryTarget(
                source.profile.id,
                modelId,
              )
            : createAccountModelVerificationHistoryTarget(
                source.account.id,
                modelId,
              )
        if (historyTarget) {
          acc.push(historyTarget)
        }

        return acc
      },
      [],
    )
  }, [filteredModels])
  const { summariesByKey: verificationSummariesByKey } =
    useVerificationResultHistorySummaries(modelVerificationTargets)
  const displayedModels = useMemo(
    () =>
      applyVerificationResultView(filteredModels, {
        selectedResults: selectedVerificationResults,
        shouldSortByLatency:
          sortMode === MODEL_LIST_SORT_MODES.VERIFICATION_LATENCY_ASC,
        verificationSummariesByKey,
      }),
    [
      filteredModels,
      selectedVerificationResults,
      sortMode,
      verificationSummariesByKey,
    ],
  )
  const getDisplayedResultCount = useCallback(
    (filters: ModelListDisplayedResultCountFilters = {}) => {
      if (
        !filters.selectedVerificationResults &&
        filters.sortMode !== MODEL_LIST_SORT_MODES.VERIFICATION_LATENCY_ASC
      ) {
        return getFilteredResultCount(filters)
      }

      const selectedResults =
        filters.selectedVerificationResults ?? selectedVerificationResults
      const {
        selectedVerificationResults: _selectedVerificationResults,
        ...baseFilters
      } = filters

      return applyVerificationResultView(getFilteredModels(baseFilters), {
        selectedResults,
        shouldSortByLatency:
          filters.sortMode === MODEL_LIST_SORT_MODES.VERIFICATION_LATENCY_ASC,
        verificationSummariesByKey,
      }).length
    },
    [
      getFilteredModels,
      getFilteredResultCount,
      selectedVerificationResults,
      verificationSummariesByKey,
    ],
  )

  return {
    displayedModels,
    getDisplayedResultCount,
    verificationSummariesByKey,
  }
}
