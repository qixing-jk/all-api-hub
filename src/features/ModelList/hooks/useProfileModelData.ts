import { useQuery } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"

import {
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelManagementSource,
} from "~/features/ModelList/modelManagementSources"
import toast from "~/lib/notify"
import { loadProfileModelCatalog } from "~/services/modelCatalog/loader"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import { MODEL_PRICING_CACHE_TTL_MS } from "~/services/models/modelPricingCache"
import {
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
} from "~/services/productAnalytics/contracts"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"

import {
  getModelDataErrorCategory,
  getPricingModelCount,
  trackModelDataLoadCompletion,
} from "../modelDataDiagnostics"
import { createProfileCatalogQueryKey } from "./modelDataQueryPolicy"
import type { UseModelDataReturn } from "./modelDataTypes"

/**
 * Loads a model catalog directly from a stored API credential profile.
 * @param selectedSource Profile-backed source, when selected.
 * @returns Profile catalog facts plus loading metadata.
 */
export function useProfileModelData(
  selectedSource: ModelManagementSource | null,
): UseModelDataReturn {
  const { t } = useTranslation("modelList")

  const currentProfile =
    selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
      ? selectedSource.profile
      : null

  const query = useQuery<ModelCatalogSnapshot, Error>({
    queryKey: createProfileCatalogQueryKey(currentProfile ?? undefined),
    enabled: !!currentProfile,
    staleTime: MODEL_PRICING_CACHE_TTL_MS,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async ({ signal }) => {
      if (!currentProfile) {
        throw new Error("No profile selected")
      }

      return loadProfileModelCatalog({
        apiType: currentProfile.apiType,
        baseUrl: currentProfile.baseUrl,
        apiKey: currentProfile.apiKey,
        requestHeaders: currentProfile.requestHeaders,
        abortSignal: signal,
      })
    },
  })
  const trackedProfileLoadKeyRef = useRef<string | null>(null)

  const loadErrorMessage = useMemo(() => {
    if (!currentProfile || !query.isError) {
      return null
    }

    const secretsToRedact = [
      currentProfile.apiKey,
      ...Object.values(currentProfile.requestHeaders ?? {}),
      currentProfile.baseUrl,
    ].filter(Boolean)

    return (
      toSanitizedErrorSummary(query.error, secretsToRedact) ||
      t("status.loadFailed")
    )
  }, [currentProfile, query.error, query.isError, t])

  useEffect(() => {
    if (!currentProfile) return

    if (query.isFetching) {
      return
    }

    if (query.isSuccess) {
      const trackingKey = `${currentProfile.id}:success:${query.dataUpdatedAt}`
      if (trackedProfileLoadKeyRef.current !== trackingKey) {
        trackedProfileLoadKeyRef.current = trackingKey
        toast.success(t("status.dataLoaded"))
        trackModelDataLoadCompletion({
          result: PRODUCT_ANALYTICS_RESULTS.Success,
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelProfile,
          apiType: currentProfile.apiType,
          modelCount: getPricingModelCount(query.data),
        })
      }
      return
    }

    if (loadErrorMessage) {
      const trackingKey = `${currentProfile.id}:failure:${query.errorUpdatedAt}`
      if (trackedProfileLoadKeyRef.current !== trackingKey) {
        trackedProfileLoadKeyRef.current = trackingKey
        toast.error(
          t("status.profileLoadFailed", {
            errorMessage: loadErrorMessage,
          }),
        )
        trackModelDataLoadCompletion({
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelProfile,
          errorCategory: getModelDataErrorCategory(query.error),
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
          error: query.error,
          apiType: currentProfile.apiType,
        })
      }
    }
  }, [
    currentProfile,
    loadErrorMessage,
    query.data,
    query.dataUpdatedAt,
    query.error,
    query.errorUpdatedAt,
    query.isFetching,
    query.isSuccess,
    t,
  ])

  const loadPricingData = useCallback(async () => {
    if (!currentProfile) return
    await query.refetch()
  }, [currentProfile, query])

  return {
    pricingData: query.data ?? null,
    pricingContexts: [],
    isLoading: query.isFetching,
    hasAuthoritativePricingData:
      query.isSuccess && !query.isFetching && Boolean(query.data),
    dataFormatError: false,
    unsupportedSource: false,
    accountQueryStates: [],
    loadPricingData,
    loadErrorMessage,
    accountFallback: null,
    personalizedCatalogFallback: null,
  }
}
