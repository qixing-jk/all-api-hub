import { useQueries, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"

import {
  getAggregateModelDataFailureDiagnostics,
  getFirstModelDataDisplayErrorReason,
  getModelDataDisplayErrorReason,
  getPersonalizedCatalogFallbackMessage,
  getPricingModelCount,
  trackModelDataLoadCompletion,
} from "~/features/ModelList/catalog/modelDataDiagnostics"
import {
  createAllAccountsModelLoadTargetQueryKey,
  invalidateProviderModelCatalogCaches,
  shouldRetryModelPricingQuery,
} from "~/features/ModelList/catalog/modelDataQueryPolicy"
import {
  MODEL_LIST_ACCOUNT_ERROR_TYPES,
  MODEL_LIST_QUERY_SCOPE_VALUES,
  type ModelListAccountErrorType,
} from "~/features/ModelList/catalog/modelDataStates"
import type {
  AccountQueryState,
  PersonalizedCatalogFallbackControls,
  UseModelDataReturn,
} from "~/features/ModelList/catalog/modelDataTypes"
import { MODEL_LIST_DATA_ERROR_CODES } from "~/services/modelCatalog/errors"
import type { AccountPricingContext } from "~/services/modelCatalog/loader"
import {
  createAllAccountsModelLoadTargets,
  createModelPricingCacheKey,
  isUnsupportedModelPricingError,
  loadAccountCatalogSource,
} from "~/services/modelCatalog/loader"
import { MODEL_LIST_SOURCE_IDENTITY_KINDS } from "~/services/modelCatalog/sourceIdentity"
import { MODEL_LIST_ACCOUNT_SOURCE_ROUTES } from "~/services/modelList/accountSources"
import {
  MODEL_PRICING_CACHE_TTL_MS,
  modelPricingCache,
} from "~/services/models/modelPricingCache"
import {
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"

/**
 * Fetches pricing data for all accounts concurrently and aggregates results.
 * @param accounts List of accounts to query.
 * @param enabled When true, triggers fetches; when false, keeps queries idle.
 * @returns Pricing contexts, loading/error flags, and reload helper.
 */
export function useAllAccountsModelData(
  accounts: DisplaySiteData[],
  enabled: boolean,
): UseModelDataReturn {
  const { t } = useTranslation("modelList")
  const queryClient = useQueryClient()
  const safeDisplayData = useMemo(() => accounts || [], [accounts])
  const loadTargets = useMemo(
    () => createAllAccountsModelLoadTargets(safeDisplayData),
    [safeDisplayData],
  )
  const targetIndexByAccountId = useMemo(() => {
    const indexes = new Map<string, number>()
    loadTargets.forEach((target, index) => {
      target.accounts.forEach((account) => indexes.set(account.id, index))
    })
    return indexes
  }, [loadTargets])

  const queries = useQueries({
    queries: loadTargets.map((target) => ({
      queryKey: createAllAccountsModelLoadTargetQueryKey(target),
      /**
       * Only load pricing when the UI is explicitly in "all accounts" mode.
       * This avoids triggering expensive background fetches while the user is
       * still selecting a single account.
       */
      enabled: enabled && safeDisplayData.length > 0,
      staleTime:
        target.readiness.route ===
        MODEL_LIST_ACCOUNT_SOURCE_ROUTES.ProviderCatalog
          ? target.readiness.providerModelCatalog.personalized?.cacheTtlMs ??
            target.readiness.providerModelCatalog.source.cacheTtlMs
          : MODEL_PRICING_CACHE_TTL_MS,
      refetchOnWindowFocus: false,
      retry: shouldRetryModelPricingQuery,
      queryFn: async ({ signal }) => {
        return loadAccountCatalogSource({
          account: target.account,
          loadScope: queryClient,
          abortSignal: signal,
          includeRuntimeKeyCatalogs: true,
        })
      },
    })),
  })
  const trackedAggregateLoadKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return

    if (safeDisplayData.length === 0) {
      const trackingKey = `${MODEL_LIST_QUERY_SCOPE_VALUES.NONE}:skipped`
      if (trackedAggregateLoadKeyRef.current !== trackingKey) {
        trackedAggregateLoadKeyRef.current = trackingKey
        trackModelDataLoadCompletion({
          result: PRODUCT_ANALYTICS_RESULTS.Skipped,
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAllAccounts,
          modelCount: 0,
          successCount: 0,
          failureCount: 0,
        })
      }
      return
    }

    if (queries.length !== loadTargets.length) return
    if (queries.some((query) => query.isPending || query.isFetching)) return
    if (!queries.every((query) => query.isSuccess || query.isError)) return

    const successCount = queries.filter((query) => query.isSuccess).length
    const failedQueries = queries.filter(
      (query) => query.isError || (query.data?.partialFailureCount ?? 0) > 0,
    )
    const failureCount = failedQueries.length
    const fallbackCount = queries.filter((query) =>
      query.data?.contexts.some(
        (context) => context.pricing.model_list_source?.catalogFallback,
      ),
    ).length
    const modelCount = queries.reduce(
      (count, query) =>
        count +
        (query.data?.contexts ?? []).reduce(
          (contextCount, context) =>
            contextCount + getPricingModelCount(context.pricing),
          0,
        ),
      0,
    )
    const trackingKey = queries
      .map((query, index) =>
        [
          loadTargets[index]?.id,
          query.isSuccess ? "success" : "failure",
          query.data?.partialFailureCount ?? 0,
          query.dataUpdatedAt,
          query.errorUpdatedAt,
        ].join(":"),
      )
      .join("|")

    if (trackedAggregateLoadKeyRef.current === trackingKey) return
    trackedAggregateLoadKeyRef.current = trackingKey

    const failureDiagnostics =
      failureCount > 0
        ? getAggregateModelDataFailureDiagnostics(
            failedQueries.flatMap((query) => [
              ...(query.error ? [query.error] : []),
              ...(query.data?.partialFailureErrors ?? []),
            ]),
          )
        : null

    // Conservative aggregate semantics: any account failure makes the overall
    // load a failure, because the rendered catalog is incomplete.
    trackModelDataLoadCompletion({
      result:
        failureCount > 0
          ? PRODUCT_ANALYTICS_RESULTS.Failure
          : PRODUCT_ANALYTICS_RESULTS.Success,
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAllAccounts,
      ...(failureDiagnostics
        ? { errorCategory: failureDiagnostics.errorCategory }
        : {}),
      ...(failureDiagnostics
        ? { failureStage: failureDiagnostics.failureStage }
        : {}),
      ...(failureDiagnostics?.failureReason
        ? { failureReason: failureDiagnostics.failureReason }
        : {}),
      ...(failureDiagnostics?.error ? { error: failureDiagnostics.error } : {}),
      ...(fallbackCount > 0
        ? { fallbackAvailable: true, fallbackUsed: true }
        : {}),
      modelCount,
      successCount,
      failureCount,
    })
  }, [enabled, loadTargets, queries, safeDisplayData])

  const pricingContexts: AccountPricingContext[] = useMemo(() => {
    const contexts: AccountPricingContext[] = []
    const representedProviderCatalogs = new Set<string>()

    for (const [index, query] of queries.entries()) {
      const account = loadTargets[index]?.account
      if (!account) continue
      for (const context of query.data?.contexts ?? []) {
        if (
          context.sourceIdentity?.kind ===
          MODEL_LIST_SOURCE_IDENTITY_KINDS.PROVIDER_CATALOG
        ) {
          if (representedProviderCatalogs.has(context.sourceIdentity.id))
            continue
          representedProviderCatalogs.add(context.sourceIdentity.id)
        }
        contexts.push({ ...context, account })
      }
    }

    return contexts
  }, [loadTargets, queries])

  const isLoading = queries.some((query) => query.isFetching)

  const dataFormatError = queries.some((query) => {
    const error = query.error as { code?: string } | null | undefined
    return error?.code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT
  })

  const loadPricingData = useCallback(async () => {
    // Invalidate shared provider snapshots once, before any account starts a
    // replacement fetch, so one refresh preserves cross-account coalescing.
    const invalidated = new Set<() => void>()
    for (const target of loadTargets) {
      if (
        target.readiness.route ===
        MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing
      ) {
        const invalidate = target.readiness.modelPricing.invalidateCache
        if (invalidate && !invalidated.has(invalidate)) {
          invalidated.add(invalidate)
          invalidate.call(target.readiness.modelPricing)
        }
      }
    }
    await Promise.all(
      loadTargets.map(async (target, index) => {
        if (
          target.readiness.route ===
          MODEL_LIST_ACCOUNT_SOURCE_ROUTES.ProviderCatalog
        ) {
          await invalidateProviderModelCatalogCaches({
            queryClient,
            sourceId: target.readiness.providerModelCatalog.source.id,
          })
        } else {
          await modelPricingCache.invalidate(
            createModelPricingCacheKey(target.account),
          )
        }
        const query = queries[index]
        if (query) {
          await query.refetch()
        }
      }),
    )
  }, [loadTargets, queries, queryClient])

  const accountQueryStates: AccountQueryState[] = useMemo(
    () =>
      safeDisplayData.map((account, index) => {
        const query = queries[targetIndexByAccountId.get(account.id) ?? index]
        const error = query?.error as { code?: string } | null | undefined
        const partialFailureCount = query?.data?.partialFailureCount ?? 0
        const partialFailureErrors = query?.data?.partialFailureErrors ?? []
        const catalogFallback = query?.data?.contexts.find(
          (context) => context.account.id === account.id,
        )?.pricing.model_list_source?.catalogFallback
        const hasData = (query?.data?.contexts.length ?? 0) > 0
        const hasPartialFailure =
          hasData && (partialFailureCount > 0 || Boolean(catalogFallback))
        const hasError =
          !!query?.error || partialFailureCount > 0 || Boolean(catalogFallback)
        const isLoading =
          !hasData && Boolean(query?.isPending || query?.isFetching)

        let errorType: ModelListAccountErrorType | undefined
        let errorMessage: string | undefined
        if (error?.code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT) {
          errorType = MODEL_LIST_ACCOUNT_ERROR_TYPES.INVALID_FORMAT
          errorMessage = t("accountSummary.failureReasons.invalidFormat")
        } else if (isUnsupportedModelPricingError(query?.error)) {
          errorType = MODEL_LIST_ACCOUNT_ERROR_TYPES.UNSUPPORTED_SOURCE
          errorMessage = t("accountSummary.failureReasons.unsupportedSource")
        } else if (hasPartialFailure) {
          errorType = MODEL_LIST_ACCOUNT_ERROR_TYPES.PARTIAL_LOAD_FAILED
          errorMessage = catalogFallback
            ? getPersonalizedCatalogFallbackMessage(
                catalogFallback.failureCategory,
                t,
              )
            : t("accountSummary.partialLoadFailedReason", {
                reason: getFirstModelDataDisplayErrorReason(
                  partialFailureErrors,
                  t,
                ),
              })
        } else if (hasError) {
          errorType = MODEL_LIST_ACCOUNT_ERROR_TYPES.LOAD_FAILED
          errorMessage = query?.error
            ? getModelDataDisplayErrorReason(query.error, t)
            : undefined
        }

        return {
          account,
          isLoading,
          hasData,
          hasError,
          errorType,
          errorMessage,
        }
      }),
    [queries, safeDisplayData, t, targetIndexByAccountId],
  )

  const loadErrorMessage = useMemo(() => {
    const failedQuery = queries.find((query) => query.isError)
    if (!failedQuery?.error) {
      return null
    }

    return t("status.loadFailedWithReason", {
      reason: getModelDataDisplayErrorReason(failedQuery.error, t),
    })
  }, [queries, t])

  const personalizedFallbackQueryIndexes = useMemo(
    () =>
      queries.flatMap((query, index) =>
        query.data?.contexts.some(
          (context) => context.pricing.model_list_source?.catalogFallback,
        )
          ? [index]
          : [],
      ),
    [queries],
  )
  const retryPersonalizedCatalogFallbacks = useCallback(async () => {
    await Promise.all(
      personalizedFallbackQueryIndexes.map(async (index) => {
        await queries[index]?.refetch()
      }),
    )
  }, [personalizedFallbackQueryIndexes, queries])
  const personalizedCatalogFallback =
    useMemo<PersonalizedCatalogFallbackControls | null>(() => {
      if (personalizedFallbackQueryIndexes.length === 0) return null

      const firstFallback = queries[
        personalizedFallbackQueryIndexes[0]!
      ]?.data?.contexts.find(
        (context) => context.pricing.model_list_source?.catalogFallback,
      )?.pricing.model_list_source?.catalogFallback
      if (!firstFallback) return null

      return {
        affectedAccountCount: personalizedFallbackQueryIndexes.length,
        failureCategory: firstFallback.failureCategory,
        message: t("personalizedCatalogFallback.allAccountsDescription"),
        retry: retryPersonalizedCatalogFallbacks,
      }
    }, [
      personalizedFallbackQueryIndexes,
      queries,
      retryPersonalizedCatalogFallbacks,
      t,
    ])

  return {
    pricingData: null,
    pricingContexts,
    isLoading,
    hasAuthoritativePricingData: false,
    dataFormatError,
    unsupportedSource: false,
    accountQueryStates,
    loadPricingData,
    loadErrorMessage,
    accountFallback: null,
    personalizedCatalogFallback,
  }
}
