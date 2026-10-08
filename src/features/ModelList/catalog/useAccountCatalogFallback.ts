import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  getModelDataErrorCategory,
  getPricingModelCount,
  trackModelDataLoadCompletion,
} from "~/features/ModelList/catalog/modelDataDiagnostics"
import { MODEL_LIST_QUERY_SCOPE_VALUES } from "~/features/ModelList/catalog/modelDataStates"
import {
  MODEL_LIST_FALLBACK_STATUS_SCOPES,
  type AccountFallbackControls,
} from "~/features/ModelList/catalog/modelDataTypes"
import {
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelManagementSource,
} from "~/features/ModelList/catalog/modelManagementSources"
import toast from "~/lib/notify"
import { ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES } from "~/services/accounts/accountSiteProfile/contracts"
import { getAccountSiteModelListProfile } from "~/services/accounts/accountSiteProfile/modelList"
import { type AccountRuntimeKey } from "~/services/accounts/keys/accountRuntimeKeys"
import { canListAccountRuntimeKeys } from "~/services/accounts/keys/keyProductCapabilities"
import { fetchDisplayAccountRuntimeKeys } from "~/services/accounts/utils/apiServiceRequest"
import { AccountKeyResourceError } from "~/services/apiAdapters/contracts/accountKeyResource"
import { MODEL_LIST_DATA_ERROR_CODES } from "~/services/modelCatalog/errors"
import type { AccountPricingContext } from "~/services/modelCatalog/loader"
import {
  isUnsupportedModelPricingError,
  isUsableCatalogRuntimeKey,
  loadRuntimeKeyCatalogSource,
} from "~/services/modelCatalog/loader"
import {
  ACCOUNT_RUNTIME_KEY_FALLBACK_LOAD_FAILED,
  canLoadModelListAccountFallbackRuntimeKeys,
  MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
  resolveModelListAccountSourceReadiness,
} from "~/services/modelList/accountSources"
import {
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"

/** Owns transient fallback keys, catalog reads and stale-result protection for one account scope. */
export function useAccountCatalogFallback({
  currentAccount,
  selectedSource,
  query,
  onCatalogLoaded,
}: {
  currentAccount: DisplaySiteData | undefined
  selectedSource: ModelManagementSource | null
  query: { isError: boolean; error: Error | null; data?: unknown }
  onCatalogLoaded: () => void
}) {
  const { t, i18n } = useTranslation("modelList")
  const currentReadiness = useMemo(
    () =>
      currentAccount
        ? resolveModelListAccountSourceReadiness(currentAccount)
        : null,
    [currentAccount],
  )
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

        const [onlyRuntimeKey] = runtimeKeys
        if (onlyRuntimeKey !== undefined && runtimeKeys.length === 1) {
          return onlyRuntimeKey.id
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
      onCatalogLoaded()
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
    onCatalogLoaded,
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

  const isFallbackCatalogActive = Boolean(
    scopedFallbackPricingData && !query.data,
  )
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
          ? MODEL_LIST_FALLBACK_STATUS_SCOPES.RuntimeKey
          : MODEL_LIST_FALLBACK_STATUS_SCOPES.Account,
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

  return {
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
  }
}
