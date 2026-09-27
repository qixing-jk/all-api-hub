import {
  useQueries,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelManagementSource,
} from "~/features/ModelList/modelManagementSources"
import toast from "~/lib/notify"
import { type AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import {
  ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES,
  getAccountSiteModelListProfile,
} from "~/services/accounts/accountSiteProfile"
import { canListAccountRuntimeKeys } from "~/services/accounts/keyProductCapabilities"
import { fetchDisplayAccountRuntimeKeys } from "~/services/accounts/utils/apiServiceRequest"
import { AccountKeyResourceError } from "~/services/apiAdapters/contracts/accountKeyResource"
import type { ProviderModelCatalogCapability } from "~/services/apiAdapters/contracts/providerModelCatalog"
import { MODEL_LIST_DATA_ERROR_CODES } from "~/services/modelCatalog/errors"
import type { AccountPricingContext } from "~/services/modelCatalog/loader"
import {
  createAllAccountsModelLoadTargets,
  createModelPricingCacheKey,
  createProviderModelCatalogCacheKey,
  isUnsupportedModelPricingError,
  isUsableCatalogRuntimeKey,
  loadAccountCatalogSource,
  loadProfileModelCatalog,
  loadRuntimeKeyCatalogSource,
  type AllAccountsModelLoadTarget,
} from "~/services/modelCatalog/loader"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import { MODEL_LIST_SOURCE_IDENTITY_KINDS } from "~/services/modelCatalog/sourceIdentity"
import {
  ACCOUNT_RUNTIME_KEY_FALLBACK_LOAD_FAILED,
  canLoadModelListAccountFallbackRuntimeKeys,
  MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
  resolveModelListAccountSourceReadiness,
} from "~/services/modelList/accountSources"
import {
  MODEL_CATALOG_SCOPES,
  MODEL_LIST_SOURCE_KINDS,
  type ModelCatalogFailureCategory,
} from "~/services/modelList/pricingModel"
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
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"

import {
  getAggregateModelDataFailureDiagnostics,
  getFirstModelDataDisplayErrorReason,
  getModelDataDisplayErrorReason,
  getModelDataErrorCategory,
  getPersonalizedCatalogFallbackMessage,
  getPricingModelCount,
  trackModelDataLoadCompletion,
} from "../modelDataDiagnostics"
import {
  MODEL_LIST_ACCOUNT_ERROR_TYPES,
  MODEL_LIST_QUERY_KEYS,
  MODEL_LIST_QUERY_SCOPE_VALUES,
  type ModelListAccountErrorType,
} from "../modelDataStates"

interface UseModelDataProps {
  selectedSource: ModelManagementSource | null
  accounts: DisplaySiteData[]
}

interface AccountQueryState {
  account: DisplaySiteData
  isLoading: boolean
  hasData: boolean
  hasError: boolean
  errorType?: ModelListAccountErrorType
  errorMessage?: string
}

export interface AccountFallbackControls {
  isAvailable: boolean
  isActive: boolean
  statusScope: "account" | "runtime-key"
  runtimeKeys: AccountRuntimeKey[]
  selectedRuntimeKeyId: string | null
  setSelectedRuntimeKeyId: (runtimeKeyId: string | null) => void
  isLoadingRuntimeKeys: boolean
  hasLoadedRuntimeKeys: boolean
  runtimeKeyLoadErrorMessage: string | null
  catalogLoadErrorMessage: string | null
  isLoadingCatalog: boolean
  activeRuntimeKeyName: string | null
  loadRuntimeKeys: () => Promise<void>
  loadCatalog: () => Promise<void>
}

export interface PersonalizedCatalogFallbackControls {
  affectedAccountCount: number
  /** In all-account views, this represents the first affected account. */
  failureCategory: ModelCatalogFailureCategory
  message: string
  retry: () => Promise<void>
}

interface UseModelDataReturn {
  pricingData: ModelCatalogSnapshot | null
  pricingContexts: AccountPricingContext[]
  isLoading: boolean
  hasAuthoritativePricingData: boolean
  dataFormatError: boolean
  unsupportedSource: boolean
  accountQueryStates: AccountQueryState[]
  loadPricingData: () => Promise<void>
  loadErrorMessage: string | null
  accountFallback: AccountFallbackControls | null
  personalizedCatalogFallback: PersonalizedCatalogFallbackControls | null
}

const shouldRetryModelPricingQuery = (failureCount: number, error: Error) =>
  !isUnsupportedModelPricingError(error) && failureCount < 1

/** Builds an account- or provider-scoped pricing query key. */
function createModelPricingQueryKey(
  account?: Pick<
    DisplaySiteData,
    "id" | "baseUrl" | "userId" | "siteType" | "authType"
  >,
  providerCatalog?: ProviderModelCatalogCapability,
) {
  if (account && providerCatalog) {
    return providerCatalog.personalized
      ? [
          ...createProviderModelCatalogQueryKeyPrefix(
            providerCatalog.source.id,
          ),
          MODEL_CATALOG_SCOPES.PERSONALIZED,
          account.id,
          account.baseUrl,
          account.userId,
          account.siteType,
          account.authType,
        ]
      : createProviderModelCatalogQueryKey(
          providerCatalog.source.id,
          MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
        )
  }

  return account
    ? [
        MODEL_LIST_QUERY_KEYS.PRICING,
        account.id,
        account.baseUrl,
        account.userId,
        account.siteType,
        account.authType,
      ]
    : [MODEL_LIST_QUERY_KEYS.PRICING, MODEL_LIST_QUERY_SCOPE_VALUES.NONE]
}

/** Prefix shared by every React Query scope for one provider-wide catalog. */
function createProviderModelCatalogQueryKeyPrefix(sourceId: string) {
  return [
    MODEL_LIST_QUERY_KEYS.PRICING,
    MODEL_LIST_SOURCE_KINDS.PROVIDER_CATALOG,
    sourceId,
  ]
}

/** Keeps provider-catalog result shapes separate by management scope. */
function createProviderModelCatalogQueryKey(sourceId: string, scope: string) {
  return [...createProviderModelCatalogQueryKeyPrefix(sourceId), scope]
}

/** Builds an all-accounts pricing query key without changing persistence cache scope. */
function createAllAccountsModelPricingQueryKey(
  account: Pick<
    DisplaySiteData,
    "id" | "baseUrl" | "userId" | "siteType" | "authType"
  >,
) {
  return [
    MODEL_LIST_QUERY_KEYS.PRICING,
    MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS,
    account.id,
    account.baseUrl,
    account.userId,
    account.siteType,
    account.authType,
  ]
}

/** Builds a query key for one account or collapsed provider catalog target. */
function createAllAccountsModelLoadTargetQueryKey(
  target: AllAccountsModelLoadTarget,
) {
  return target.readiness.route ===
    MODEL_LIST_ACCOUNT_SOURCE_ROUTES.ProviderCatalog &&
    !target.readiness.providerModelCatalog.personalized
    ? createProviderModelCatalogQueryKey(
        target.readiness.providerModelCatalog.source.id,
        MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS,
      )
    : createAllAccountsModelPricingQueryKey(target.account)
}

/** Marks every in-memory provider scope stale after a catalog refresh. */
async function invalidateProviderModelCatalogCaches(params: {
  queryClient: QueryClient
  sourceId: string
}) {
  await Promise.all([
    modelPricingCache.invalidate(
      createProviderModelCatalogCacheKey(params.sourceId),
    ),
    params.queryClient.invalidateQueries({
      queryKey: createProviderModelCatalogQueryKeyPrefix(params.sourceId),
      refetchType: "none",
    }),
  ])
}

/** Builds the profile catalog query key from stable profile revision data. */
function createProfileCatalogQueryKey(profile?: {
  id: string
  updatedAt: number
}) {
  return profile
    ? [
        MODEL_LIST_QUERY_KEYS.CATALOG,
        MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE,
        profile.id,
        profile.updatedAt,
      ]
    : [
        MODEL_LIST_QUERY_KEYS.CATALOG,
        MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE,
        MODEL_LIST_QUERY_SCOPE_VALUES.NONE,
      ]
}

/**
 * Fetches pricing data for a single selected account with caching and error handling.
 * @param params Input parameters for the hook.
 * @param params.selectedSource Account-backed source to load pricing for.
 * @param params.accounts All available accounts.
 * @returns Pricing data, loading flags, query states, and reload helper.
 */
function useSingleAccountModelData(params: {
  selectedSource: ModelManagementSource | null
  accounts: DisplaySiteData[]
}): UseModelDataReturn {
  const { selectedSource, accounts } = params
  const queryClient = useQueryClient()
  const { t, i18n } = useTranslation("modelList")
  const [dataFormatError, setDataFormatError] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const loadErrorMessage = loadFailed ? t("status.loadFailed") : null
  const [fallbackCatalogContext, setFallbackCatalogContext] =
    useState<AccountPricingContext | null>(null)
  const [fallbackRuntimeKeys, setFallbackRuntimeKeys] = useState<
    AccountRuntimeKey[]
  >([])
  const [hasLoadedFallbackRuntimeKeys, setHasLoadedFallbackRuntimeKeys] =
    useState(false)
  const [isLoadingFallbackRuntimeKeys, setIsLoadingFallbackRuntimeKeys] =
    useState(false)
  const [
    fallbackRuntimeKeyLoadDiagnostic,
    setFallbackRuntimeKeyLoadDiagnostic,
  ] = useState<string | null>(null)
  const fallbackRuntimeKeyLoadErrorMessage =
    fallbackRuntimeKeyLoadDiagnostic === null
      ? null
      : fallbackRuntimeKeyLoadDiagnostic
        ? t("status.fallback.loadKeysFailed", {
            errorMessage: fallbackRuntimeKeyLoadDiagnostic,
          })
        : t("status.fallback.loadKeysFailedFallback")
  const [selectedFallbackRuntimeKeyId, setSelectedFallbackRuntimeKeyId] =
    useState<string | null>(null)
  const [isLoadingFallbackCatalog, setIsLoadingFallbackCatalog] =
    useState(false)
  const [fallbackCatalogLoadDiagnostic, setFallbackCatalogLoadDiagnostic] =
    useState<string | null>(null)
  const fallbackCatalogLoadErrorMessage =
    fallbackCatalogLoadDiagnostic === null
      ? null
      : fallbackCatalogLoadDiagnostic ||
        t("status.fallback.loadModelsFailedFallback")
  const [fallbackStateScopeKey, setFallbackStateScopeKey] = useState<string>(
    MODEL_LIST_QUERY_SCOPE_VALUES.NONE,
  )

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
  const fallbackCatalogAbortControllerRef = useRef<AbortController | null>(null)

  const resetFallbackState = useCallback(() => {
    fallbackRuntimeKeysRequestIdRef.current += 1
    fallbackCatalogRequestIdRef.current += 1
    fallbackCatalogAbortControllerRef.current?.abort()
    fallbackCatalogAbortControllerRef.current = null
    setFallbackStateScopeKey(MODEL_LIST_QUERY_SCOPE_VALUES.NONE)
    setFallbackCatalogContext(null)
    setFallbackRuntimeKeys([])
    setHasLoadedFallbackRuntimeKeys(false)
    setIsLoadingFallbackRuntimeKeys(false)
    setFallbackRuntimeKeyLoadDiagnostic(null)
    setSelectedFallbackRuntimeKeyId(null)
    setIsLoadingFallbackCatalog(false)
    setFallbackCatalogLoadDiagnostic(null)
  }, [])

  const currentAccountScopeKey = useMemo(
    () =>
      currentAccount
        ? [
            currentAccount.id,
            currentAccount.baseUrl,
            currentAccount.userId,
          ].join("|")
        : MODEL_LIST_QUERY_SCOPE_VALUES.NONE,
    [currentAccount],
  )

  const currentAccountScopeKeyRef = useRef(currentAccountScopeKey)
  currentAccountScopeKeyRef.current = currentAccountScopeKey

  const fallbackRuntimeKeysRequestIdRef = useRef(0)
  const fallbackCatalogRequestIdRef = useRef(0)

  useEffect(() => {
    // Fallback state is intentionally transient for the currently selected
    // account, so changing the source scope always drops any cached key data.
    resetFallbackState()
  }, [currentAccountScopeKey, resetFallbackState, selectedSource?.kind])

  const fallbackAvailable = useMemo(
    () =>
      canListAccountRuntimeKeys(currentAccount) ||
      canLoadModelListAccountFallbackRuntimeKeys(currentAccount),
    [currentAccount],
  )

  const isActiveFallbackRuntimeKeysRequest = useCallback(
    (scopeKey: string, requestId: number) =>
      currentAccountScopeKeyRef.current === scopeKey &&
      fallbackRuntimeKeysRequestIdRef.current === requestId,
    [],
  )

  const isActiveFallbackCatalogRequest = useCallback(
    (scopeKey: string, requestId: number) =>
      currentAccountScopeKeyRef.current === scopeKey &&
      fallbackCatalogRequestIdRef.current === requestId,
    [],
  )

  const scopedFallbackState = useMemo(() => {
    const isCurrentFallbackScope =
      !!currentAccount && fallbackStateScopeKey === currentAccountScopeKey

    return {
      fallbackCatalogContext: isCurrentFallbackScope
        ? fallbackCatalogContext
        : null,
      fallbackRuntimeKeys: isCurrentFallbackScope ? fallbackRuntimeKeys : [],
      hasLoadedFallbackRuntimeKeys: isCurrentFallbackScope
        ? hasLoadedFallbackRuntimeKeys
        : false,
      isLoadingFallbackRuntimeKeys: isCurrentFallbackScope
        ? isLoadingFallbackRuntimeKeys
        : false,
      fallbackRuntimeKeyLoadErrorMessage: isCurrentFallbackScope
        ? fallbackRuntimeKeyLoadErrorMessage
        : null,
      selectedFallbackRuntimeKeyId: isCurrentFallbackScope
        ? selectedFallbackRuntimeKeyId
        : null,
      isLoadingFallbackCatalog: isCurrentFallbackScope
        ? isLoadingFallbackCatalog
        : false,
      fallbackCatalogLoadErrorMessage: isCurrentFallbackScope
        ? fallbackCatalogLoadErrorMessage
        : null,
    }
  }, [
    currentAccount,
    currentAccountScopeKey,
    fallbackCatalogLoadErrorMessage,
    fallbackCatalogContext,
    fallbackStateScopeKey,
    fallbackRuntimeKeyLoadErrorMessage,
    fallbackRuntimeKeys,
    hasLoadedFallbackRuntimeKeys,
    isLoadingFallbackCatalog,
    isLoadingFallbackRuntimeKeys,
    selectedFallbackRuntimeKeyId,
  ])

  const scopedFallbackCatalogContext =
    scopedFallbackState.fallbackCatalogContext
  const scopedFallbackPricingData =
    scopedFallbackCatalogContext?.pricing ?? null
  const scopedFallbackRuntimeKeys = scopedFallbackState.fallbackRuntimeKeys
  const scopedHasLoadedFallbackRuntimeKeys =
    scopedFallbackState.hasLoadedFallbackRuntimeKeys
  const scopedIsLoadingFallbackRuntimeKeys =
    scopedFallbackState.isLoadingFallbackRuntimeKeys
  const scopedFallbackRuntimeKeyLoadErrorMessage =
    scopedFallbackState.fallbackRuntimeKeyLoadErrorMessage
  const scopedSelectedFallbackRuntimeKeyId =
    scopedFallbackState.selectedFallbackRuntimeKeyId
  const scopedIsLoadingFallbackCatalog =
    scopedFallbackState.isLoadingFallbackCatalog
  const scopedFallbackCatalogLoadErrorMessage =
    scopedFallbackState.fallbackCatalogLoadErrorMessage

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

  const selectedFallbackRuntimeKey = useMemo(() => {
    if (scopedSelectedFallbackRuntimeKeyId !== null) {
      return (
        scopedFallbackRuntimeKeys.find(
          (runtimeKey) => runtimeKey.id === scopedSelectedFallbackRuntimeKeyId,
        ) ?? null
      )
    }

    if (scopedFallbackRuntimeKeys.length === 1) {
      return scopedFallbackRuntimeKeys[0]
    }

    return null
  }, [scopedFallbackRuntimeKeys, scopedSelectedFallbackRuntimeKeyId])

  const loadFallbackRuntimeKeys = useCallback(async () => {
    if (!currentAccount || !fallbackAvailable) return
    const requestScopeKey = currentAccountScopeKey
    const requestId = ++fallbackRuntimeKeysRequestIdRef.current

    setFallbackStateScopeKey(requestScopeKey)
    setIsLoadingFallbackRuntimeKeys(true)
    setFallbackRuntimeKeyLoadDiagnostic(null)
    setFallbackCatalogLoadDiagnostic(null)

    try {
      const runtimeKeys = (
        await fetchDisplayAccountRuntimeKeys(currentAccount)
      ).filter(isUsableCatalogRuntimeKey)

      if (!isActiveFallbackRuntimeKeysRequest(requestScopeKey, requestId)) {
        return
      }

      setFallbackStateScopeKey(requestScopeKey)
      setFallbackRuntimeKeys(runtimeKeys)
      setHasLoadedFallbackRuntimeKeys(true)
      setSelectedFallbackRuntimeKeyId((currentRuntimeKeyId) => {
        if (
          currentRuntimeKeyId !== null &&
          runtimeKeys.some(
            (runtimeKey) => runtimeKey.id === currentRuntimeKeyId,
          )
        ) {
          return currentRuntimeKeyId
        }

        if (runtimeKeys.length === 1) {
          return runtimeKeys[0].id
        }

        return null
      })
    } catch (error) {
      if (!isActiveFallbackRuntimeKeysRequest(requestScopeKey, requestId)) {
        return
      }

      const errorMessage =
        error instanceof AccountKeyResourceError
          ? error.failure.message?.trim() ?? ""
          : getErrorMessage(error)

      setFallbackStateScopeKey(requestScopeKey)
      setFallbackRuntimeKeyLoadDiagnostic(errorMessage)
    } finally {
      if (isActiveFallbackRuntimeKeysRequest(requestScopeKey, requestId)) {
        setIsLoadingFallbackRuntimeKeys(false)
      }
    }
  }, [
    currentAccount,
    currentAccountScopeKey,
    fallbackAvailable,
    isActiveFallbackRuntimeKeysRequest,
  ])

  const loadFallbackCatalog = useCallback(async () => {
    if (!currentAccount || !selectedFallbackRuntimeKey) return
    const requestScopeKey = currentAccountScopeKey
    const requestId = ++fallbackCatalogRequestIdRef.current
    fallbackCatalogAbortControllerRef.current?.abort()
    const abortController = new AbortController()
    fallbackCatalogAbortControllerRef.current = abortController

    setFallbackStateScopeKey(requestScopeKey)
    setIsLoadingFallbackCatalog(true)
    setFallbackCatalogLoadDiagnostic(null)

    try {
      const context = await loadRuntimeKeyCatalogSource({
        account: currentAccount,
        runtimeKey: selectedFallbackRuntimeKey,
        abortSignal: abortController.signal,
      })

      if (!isActiveFallbackCatalogRequest(requestScopeKey, requestId)) {
        return
      }

      setFallbackStateScopeKey(requestScopeKey)
      setFallbackCatalogContext(context)
      setLoadFailed(false)
      setDataFormatError(false)
      toast.success(i18n.t("modelList:status.dataLoaded"))
      trackModelDataLoadCompletion({
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelFallbackCatalog,
        fallbackAvailable: true,
        fallbackUsed: true,
        modelCount: getPricingModelCount(context.pricing),
      })
    } catch (error) {
      if (
        abortController.signal.aborted ||
        !isActiveFallbackCatalogRequest(requestScopeKey, requestId)
      ) {
        return
      }

      const errorMessage = getErrorMessage(error)
      const sanitizedMessage =
        errorMessage &&
        errorMessage !== ACCOUNT_RUNTIME_KEY_FALLBACK_LOAD_FAILED
          ? errorMessage
          : ""

      setFallbackStateScopeKey(requestScopeKey)
      setFallbackCatalogLoadDiagnostic(sanitizedMessage)
      toast.error(
        sanitizedMessage ||
          i18n.t("modelList:status.fallback.loadModelsFailedFallback"),
      )
      trackModelDataLoadCompletion({
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelFallbackCatalog,
        errorCategory: getModelDataErrorCategory(error),
        failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
        error,
        fallbackAvailable: true,
        fallbackUsed: true,
      })
    } finally {
      if (fallbackCatalogAbortControllerRef.current === abortController) {
        fallbackCatalogAbortControllerRef.current = null
      }
      if (isActiveFallbackCatalogRequest(requestScopeKey, requestId)) {
        setIsLoadingFallbackCatalog(false)
      }
    }
  }, [
    currentAccount,
    currentAccountScopeKey,
    isActiveFallbackCatalogRequest,
    selectedFallbackRuntimeKey,
    i18n,
  ])

  useEffect(() => {
    return () => {
      fallbackCatalogAbortControllerRef.current?.abort()
      fallbackCatalogAbortControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (
      selectedSource?.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT ||
      !currentAccount
    ) {
      return
    }
    if (!fallbackAvailable) return
    if (!query.isError) return

    const typedError = (query.error ?? undefined) as
      | { code?: string }
      | undefined
    if (typedError?.code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT) return
    if (
      scopedHasLoadedFallbackRuntimeKeys ||
      scopedIsLoadingFallbackRuntimeKeys
    )
      return
    if (scopedFallbackRuntimeKeyLoadErrorMessage) return

    // Retryable account failures should immediately hydrate the fallback key
    // list so the user can pick a key without an extra preparatory click.
    void loadFallbackRuntimeKeys()
  }, [
    currentAccount,
    fallbackAvailable,
    scopedFallbackRuntimeKeyLoadErrorMessage,
    scopedHasLoadedFallbackRuntimeKeys,
    scopedIsLoadingFallbackRuntimeKeys,
    loadFallbackRuntimeKeys,
    query.error,
    query.isError,
    selectedSource?.kind,
  ])

  useEffect(() => {
    if (
      selectedSource?.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT ||
      !currentAccount
    ) {
      return
    }
    if (!fallbackAvailable) return
    if (
      currentReadiness?.route !==
      MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog
    )
      return
    if (!query.isError) return
    if (!isUnsupportedModelPricingError(query.error)) return
    if (!scopedHasLoadedFallbackRuntimeKeys) return
    if (scopedFallbackRuntimeKeys.length !== 1) return
    if (!selectedFallbackRuntimeKey) return
    if (scopedFallbackPricingData) return
    if (scopedIsLoadingFallbackCatalog) return
    if (scopedFallbackCatalogLoadErrorMessage) return

    void loadFallbackCatalog()
  }, [
    currentAccount,
    currentReadiness,
    fallbackAvailable,
    loadFallbackCatalog,
    query.error,
    query.isError,
    scopedFallbackCatalogLoadErrorMessage,
    scopedFallbackPricingData,
    scopedFallbackRuntimeKeys.length,
    scopedHasLoadedFallbackRuntimeKeys,
    scopedIsLoadingFallbackCatalog,
    selectedFallbackRuntimeKey,
    selectedSource?.kind,
  ])

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
  const isFallbackCatalogActive = Boolean(
    scopedFallbackPricingData && !query.data,
  )
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

  const accountFallback = useMemo<AccountFallbackControls | null>(() => {
    if (!currentAccount) {
      return null
    }

    return {
      isAvailable: fallbackAvailable,
      isActive: isFallbackCatalogActive,
      statusScope:
        getAccountSiteModelListProfile(currentAccount.siteType).statusScope ===
        ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token
          ? "runtime-key"
          : "account",
      runtimeKeys: scopedFallbackRuntimeKeys,
      selectedRuntimeKeyId: scopedSelectedFallbackRuntimeKeyId,
      setSelectedRuntimeKeyId: setSelectedFallbackRuntimeKeyId,
      isLoadingRuntimeKeys: scopedIsLoadingFallbackRuntimeKeys,
      hasLoadedRuntimeKeys: scopedHasLoadedFallbackRuntimeKeys,
      runtimeKeyLoadErrorMessage: scopedFallbackRuntimeKeyLoadErrorMessage,
      catalogLoadErrorMessage: scopedFallbackCatalogLoadErrorMessage,
      isLoadingCatalog: scopedIsLoadingFallbackCatalog,
      activeRuntimeKeyName:
        isFallbackCatalogActive && selectedFallbackRuntimeKey
          ? selectedFallbackRuntimeKey.label
          : null,
      loadRuntimeKeys: loadFallbackRuntimeKeys,
      loadCatalog: loadFallbackCatalog,
    }
  }, [
    currentAccount,
    fallbackAvailable,
    isFallbackCatalogActive,
    scopedHasLoadedFallbackRuntimeKeys,
    scopedIsLoadingFallbackRuntimeKeys,
    scopedIsLoadingFallbackCatalog,
    scopedFallbackRuntimeKeyLoadErrorMessage,
    scopedFallbackCatalogLoadErrorMessage,
    scopedFallbackRuntimeKeys,
    scopedSelectedFallbackRuntimeKeyId,
    selectedFallbackRuntimeKey,
    loadFallbackRuntimeKeys,
    loadFallbackCatalog,
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

/**
 * Fetches pricing data for all accounts concurrently and aggregates results.
 * @param accounts List of accounts to query.
 * @param enabled When true, triggers fetches; when false, keeps queries idle.
 * @returns Pricing contexts, loading/error flags, and reload helper.
 */
function useAllAccountsModelData(
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

/**
 * Loads a model catalog directly from a stored API credential profile.
 * @param selectedSource Profile-backed source, when selected.
 * @returns Profile catalog facts plus loading metadata.
 */
function useProfileModelData(
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

/**
 * Provides model pricing data for either a single account or all accounts.
 * @param params Hook input parameters.
 * @param params.selectedSource Selected model-management source.
 * @param params.accounts Available accounts list.
 * @returns Pricing data, contexts, loading state, and query summaries.
 */
export function useModelData(params: UseModelDataProps): UseModelDataReturn {
  const { selectedSource, accounts } = params
  const safeDisplayData = useMemo(() => accounts || [], [accounts])
  const isAllAccounts =
    selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
  const isProfileSource =
    selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE

  const singleAccountResult = useSingleAccountModelData({
    selectedSource: isAllAccounts || isProfileSource ? null : selectedSource,
    accounts: safeDisplayData,
  })

  const allAccountsResult = useAllAccountsModelData(
    safeDisplayData,
    isAllAccounts,
  )

  const profileResult = useProfileModelData(
    isProfileSource ? selectedSource : null,
  )

  if (isAllAccounts) return allAccountsResult
  if (isProfileSource) return profileResult
  return singleAccountResult
}
