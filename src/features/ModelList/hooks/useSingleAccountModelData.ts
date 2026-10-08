import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  getModelDataErrorCategory,
  getPersonalizedCatalogFallbackMessage,
  getPricingModelCount,
  trackModelDataLoadCompletion,
} from "~/features/ModelList/catalog/modelDataDiagnostics"
import {
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelManagementSource,
} from "~/features/ModelList/catalog/modelManagementSources"
import toast from "~/lib/notify"
import { MODEL_LIST_DATA_ERROR_CODES } from "~/services/modelCatalog/errors"
import type { AccountPricingContext } from "~/services/modelCatalog/loader"
import {
  createModelPricingCacheKey,
  isUnsupportedModelPricingError,
  loadAccountCatalogSource,
} from "~/services/modelCatalog/loader"
import {
  MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
  resolveModelListAccountSourceReadiness,
} from "~/services/modelList/accountSources"
import {
  MODEL_PRICING_CACHE_TTL_MS,
  modelPricingCache,
} from "~/services/models/modelPricingCache"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"

import {
  createModelPricingQueryKey,
  invalidateProviderModelCatalogCaches,
  shouldRetryModelPricingQuery,
} from "./modelDataQueryPolicy"
import type {
  PersonalizedCatalogFallbackControls,
  UseModelDataReturn,
} from "./modelDataTypes"
import { useAccountCatalogFallback } from "./useAccountCatalogFallback"

/**
 * Fetches pricing data for a single selected account with caching and error handling.
 * @param params Input parameters for the hook.
 * @param params.selectedSource Account-backed source to load pricing for.
 * @param params.accounts All available accounts.
 * @returns Pricing data, loading flags, query states, and reload helper.
 */
export function useSingleAccountModelData(params: {
  selectedSource: ModelManagementSource | null
  accounts: DisplaySiteData[]
}): UseModelDataReturn {
  const { selectedSource, accounts } = params
  const queryClient = useQueryClient()
  const { t, i18n } = useTranslation("modelList")
  const [dataFormatError, setDataFormatError] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const loadErrorMessage = loadFailed ? t("status.loadFailed") : null
  const safeDisplayData = useMemo(() => accounts || [], [accounts])

  const currentAccount = useMemo(
    () =>
      selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
        ? safeDisplayData.find((acc) => acc.id === selectedSource.account.id)
        : undefined,
    [safeDisplayData, selectedSource],
  )
  const currentReadiness = useMemo(
    () =>
      currentAccount
        ? resolveModelListAccountSourceReadiness(currentAccount)
        : null,
    [currentAccount],
  )
  const queryKey = useMemo(
    () =>
      createModelPricingQueryKey(
        currentAccount,
        currentReadiness?.route ===
          MODEL_LIST_ACCOUNT_SOURCE_ROUTES.ProviderCatalog
          ? currentReadiness.providerModelCatalog
          : undefined,
      ),
    [currentAccount, currentReadiness],
  )
  const trackedDirectLoadKeyRef = useRef<string | null>(null)
  const directLoadCacheHitRef = useRef(false)

  const query = useQuery<
    Awaited<ReturnType<typeof loadAccountCatalogSource>>,
    Error
  >({
    queryKey,
    enabled: !!currentAccount,
    staleTime:
      currentReadiness?.route ===
      MODEL_LIST_ACCOUNT_SOURCE_ROUTES.ProviderCatalog
        ? currentReadiness.providerModelCatalog.personalized?.cacheTtlMs ??
          currentReadiness.providerModelCatalog.source.cacheTtlMs
        : MODEL_PRICING_CACHE_TTL_MS,
    refetchOnWindowFocus: false,
    retry: shouldRetryModelPricingQuery,
    queryFn: async ({ signal }) => {
      if (!currentAccount) {
        throw new Error("No account selected")
      }

      const result = await loadAccountCatalogSource({
        account: currentAccount,
        loadScope: queryClient,
        abortSignal: signal,
      })
      directLoadCacheHitRef.current = result.cacheHit ?? false
      return result
    },
  })

  const directPricingData = query.data?.contexts[0]?.pricing

  const onFallbackCatalogLoaded = useCallback(() => {
    setLoadFailed(false)
    setDataFormatError(false)
  }, [])
  const {
    catalogContext: scopedFallbackCatalogContext,
    pricingData: scopedFallbackPricingData,
    selectedRuntimeKey: selectedFallbackRuntimeKey,
    isLoadingCatalog: scopedIsLoadingFallbackCatalog,
    catalogLoadErrorMessage: scopedFallbackCatalogLoadErrorMessage,
    isActive: isFallbackCatalogActive,
    isAvailable: fallbackAvailable,
    scopeKey: currentAccountScopeKey,
    reset: resetFallbackState,
    loadCatalog: loadFallbackCatalog,
    accountFallback,
  } = useAccountCatalogFallback({
    currentAccount,
    selectedSource,
    query,
    onCatalogLoaded: onFallbackCatalogLoaded,
  })

  useEffect(() => {
    if (
      selectedSource?.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT ||
      !currentAccount
    ) {
      setDataFormatError(false)
      setLoadFailed(false)
      return
    }

    if (query.isFetching) {
      setLoadFailed(false)
      return
    }

    if (query.isSuccess) {
      setDataFormatError(false)
      setLoadFailed(false)
      resetFallbackState()
      const trackingKey = `${currentAccountScopeKey}:success:${query.dataUpdatedAt}`
      if (trackedDirectLoadKeyRef.current !== trackingKey) {
        trackedDirectLoadKeyRef.current = trackingKey
        toast.success(i18n.t("modelList:status.dataLoaded"))
        trackModelDataLoadCompletion({
          result: PRODUCT_ANALYTICS_RESULTS.Success,
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAccount,
          siteType: currentAccount.siteType,
          requestedAuthMode: currentAccount.authType,
          cacheHit: directLoadCacheHitRef.current,
          ...(directPricingData?.model_list_source?.catalogFallback
            ? { fallbackAvailable: true, fallbackUsed: true }
            : {}),
          modelCount: getPricingModelCount(directPricingData),
        })
      }
      return
    }

    if (query.isError) {
      const typedError = (query.error ?? undefined) as
        | { code?: string }
        | undefined

      if (typedError?.code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT) {
        setDataFormatError(true)
        setLoadFailed(false)
        const trackingKey = `${currentAccountScopeKey}:invalid-format:${query.errorUpdatedAt}`
        if (trackedDirectLoadKeyRef.current !== trackingKey) {
          trackedDirectLoadKeyRef.current = trackingKey
          toast.error(i18n.t("modelList:status.formatNotStandard"))
          trackModelDataLoadCompletion({
            result: PRODUCT_ANALYTICS_RESULTS.Failure,
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAccount,
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Parse,
            error: query.error,
            siteType: currentAccount.siteType,
            requestedAuthMode: currentAccount.authType,
          })
        }
        return
      }

      setDataFormatError(false)
      if (
        currentReadiness?.route ===
          MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported &&
        isUnsupportedModelPricingError(query.error)
      ) {
        setLoadFailed(false)
        return
      }

      if (
        currentReadiness?.route ===
          MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog &&
        isUnsupportedModelPricingError(query.error) &&
        fallbackAvailable
      ) {
        setLoadFailed(false)
        return
      }

      setLoadFailed(true)
      const trackingKey = `${currentAccountScopeKey}:failure:${query.errorUpdatedAt}`
      if (trackedDirectLoadKeyRef.current !== trackingKey) {
        trackedDirectLoadKeyRef.current = trackingKey
        toast.error(i18n.t("modelList:status.loadFailed"))
        trackModelDataLoadCompletion({
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAccount,
          errorCategory: getModelDataErrorCategory(query.error),
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
          error: query.error,
          siteType: currentAccount.siteType,
          requestedAuthMode: currentAccount.authType,
        })
      }
    }
  }, [
    query.data,
    directPricingData,
    query.isError,
    query.isFetching,
    query.isSuccess,
    query.error,
    query.dataUpdatedAt,
    query.errorUpdatedAt,
    currentAccount,
    currentReadiness,
    currentAccountScopeKey,
    fallbackAvailable,
    selectedSource?.kind,
    i18n,
    resetFallbackState,
  ])

  const loadPricingData = useCallback(async () => {
    if (!currentAccount) return
    if (scopedFallbackPricingData && selectedFallbackRuntimeKey) {
      await loadFallbackCatalog()
      return
    }

    const readiness = resolveModelListAccountSourceReadiness(currentAccount)
    if (
      readiness.route === MODEL_LIST_ACCOUNT_SOURCE_ROUTES.ProviderCatalog &&
      !readiness.providerModelCatalog.personalized
    ) {
      await invalidateProviderModelCatalogCaches({
        queryClient,
        sourceId: readiness.providerModelCatalog.source.id,
      })
    } else {
      if (readiness.route === MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing) {
        readiness.modelPricing.invalidateCache?.()
      }
      await modelPricingCache.invalidate(
        createModelPricingCacheKey(currentAccount),
      )
    }
    await query.refetch()
  }, [
    currentAccount,
    loadFallbackCatalog,
    query,
    queryClient,
    scopedFallbackPricingData,
    selectedFallbackRuntimeKey,
  ])

  const pricingData = directPricingData ?? scopedFallbackPricingData ?? null
  const hasAuthoritativePricingData =
    (query.isSuccess && !query.isFetching && Boolean(query.data)) ||
    (isFallbackCatalogActive &&
      !scopedIsLoadingFallbackCatalog &&
      !scopedFallbackCatalogLoadErrorMessage)
  const unsupportedSource = Boolean(
    query.isError &&
      isUnsupportedModelPricingError(query.error) &&
      currentAccount &&
      currentReadiness?.route === MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
  )

  const pricingContexts: AccountPricingContext[] = useMemo(() => {
    if (!currentAccount || !pricingData) return []

    const contexts = isFallbackCatalogActive
      ? scopedFallbackCatalogContext
        ? [scopedFallbackCatalogContext]
        : []
      : query.data?.contexts ?? []
    // Catalog facts are cached; account display/action inputs remain live.
    return contexts.map((context) => ({ ...context, account: currentAccount }))
  }, [
    currentAccount,
    isFallbackCatalogActive,
    pricingData,
    query.data,
    scopedFallbackCatalogContext,
  ])

  const personalizedCatalogFallback =
    useMemo<PersonalizedCatalogFallbackControls | null>(() => {
      const fallback = pricingData?.model_list_source?.catalogFallback
      if (!fallback) return null

      return {
        affectedAccountCount: 1,
        failureCategory: fallback.failureCategory,
        message: getPersonalizedCatalogFallbackMessage(
          fallback.failureCategory,
          t,
        ),
        retry: loadPricingData,
      }
    }, [loadPricingData, pricingData, t])

  return {
    pricingData,
    pricingContexts,
    isLoading: query.isFetching || scopedIsLoadingFallbackCatalog,
    hasAuthoritativePricingData,
    dataFormatError,
    unsupportedSource,
    accountQueryStates: [],
    loadPricingData,
    loadErrorMessage,
    accountFallback,
    personalizedCatalogFallback,
  }
}
