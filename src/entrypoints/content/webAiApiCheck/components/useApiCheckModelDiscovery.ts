import type { TFunction } from "i18next"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  resolveProductAnalyticsErrorCategoryFromError,
  startProductAnalyticsAction,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
} from "~/services/productAnalytics/contracts"
import { buildModelListDiagnostics } from "~/services/productAnalytics/modelListDiagnostics"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import { isTestMode } from "~/utils/core/environment"

import { contentApiCheckAnalyticsScope } from "./apiCheckModalAnalytics"

// Preserve the real debounce in dev/prod to avoid bursty background requests
// while typing, but skip the wall-clock delay in Vitest.
const MODEL_AUTO_FETCH_DEBOUNCE_MS = isTestMode() ? 0 : 800

const MODEL_FETCH_ORIGINS = {
  Auto: "auto",
  Manual: "manual",
} as const

type ModelFetchOrigin =
  (typeof MODEL_FETCH_ORIGINS)[keyof typeof MODEL_FETCH_ORIGINS]

type UseApiCheckModelDiscoveryOptions = {
  t: TFunction<["webAiApiCheck", "common", "aiApiVerification"]>
  isOpen: boolean
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
  historyConfirmationCount: number
  setValidationError: (message: string | null) => void
  recordBaseUrlHistory: (baseUrl: string) => void
}

/**
 * Owns model-list discovery state and auto-fetch suppression for the API check modal.
 */
export function useApiCheckModelDiscovery({
  t,
  isOpen,
  apiType,
  baseUrl,
  apiKey,
  historyConfirmationCount,
  setValidationError,
  recordBaseUrlHistory,
}: UseApiCheckModelDiscoveryOptions) {
  const [modelId, setModelId] = useState("")
  const [modelIds, setModelIds] = useState<string[]>([])
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const [fetchModelsError, setFetchModelsError] = useState<string | null>(null)

  /**
   * Auto model-fetch bookkeeping.
   *
   * We auto-fetch model ids after the user provides base URL + API key (or when
   * they are prefilled by extraction). To avoid bursty requests while typing,
   * the auto-fetch is debounced and keyed by (apiType + baseUrl + apiKey).
   */
  const lastAutoFetchKeyRef = useRef<string | null>(null)
  const lastObservedModelFetchKeyRef = useRef<string | null>(null)
  const historyPrefilledFetchKeyRef = useRef<string | null>(null)
  const fetchModelsRequestIdRef = useRef(0)

  const modelListSupported =
    apiType === API_TYPES.OPENAI_COMPATIBLE ||
    apiType === API_TYPES.OPENAI ||
    apiType === API_TYPES.ANTHROPIC ||
    apiType === API_TYPES.GOOGLE

  const hasFetchedModels = modelIds.length > 0
  const canFetchModels = !isFetchingModels
  const modelIdsOptions = useMemo(
    () => modelIds.map((id) => ({ value: id, label: id })),
    [modelIds],
  )

  const resetModelList = useCallback(
    (options?: { clearSelection?: boolean }) => {
      fetchModelsRequestIdRef.current += 1
      lastAutoFetchKeyRef.current = null
      lastObservedModelFetchKeyRef.current = null
      historyPrefilledFetchKeyRef.current = null
      setIsFetchingModels(false)
      setModelIds([])
      setFetchModelsError(null)
      if (options?.clearSelection) setModelId("")
    },
    [],
  )

  const resetAutoFetchMarker = useCallback(() => {
    lastAutoFetchKeyRef.current = null
  }, [])

  const clearHistoryPrefilledFetchKey = useCallback(() => {
    historyPrefilledFetchKeyRef.current = null
  }, [])

  const setHistoryPrefilledFetchKey = useCallback((fetchKey: string | null) => {
    historyPrefilledFetchKeyRef.current = fetchKey
  }, [])

  const fetchModels = useCallback(
    async (origin: ModelFetchOrigin) => {
      setFetchModelsError(null)
      if (origin === MODEL_FETCH_ORIGINS.Manual) setValidationError(null)

      if (!modelListSupported) return

      const tracker = startProductAnalyticsAction({
        ...contentApiCheckAnalyticsScope,
        actionId:
          origin === MODEL_FETCH_ORIGINS.Auto
            ? PRODUCT_ANALYTICS_ACTION_IDS.AutoFetchApiCredentialModelList
            : PRODUCT_ANALYTICS_ACTION_IDS.FetchApiCredentialModelList,
      })
      const sourceKind =
        origin === MODEL_FETCH_ORIGINS.Auto
          ? PRODUCT_ANALYTICS_SOURCE_KINDS.Auto
          : PRODUCT_ANALYTICS_SOURCE_KINDS.Manual

      const trimmedBaseUrl = baseUrl.trim()
      const trimmedApiKey = apiKey.trim()
      if (!trimmedBaseUrl || !trimmedApiKey) {
        if (origin === MODEL_FETCH_ORIGINS.Manual) {
          setValidationError(
            t("webAiApiCheck:modal.errors.missingBaseUrlOrKey"),
          )
        }
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          diagnostics: buildModelListDiagnostics({
            sourceKind,
            apiType,
            modelCount: 0,
            resultKind: "missing_credentials",
          }),
        })
        return
      }
      if (origin === MODEL_FETCH_ORIGINS.Manual) {
        recordBaseUrlHistory(trimmedBaseUrl)
      }

      const requestId = (fetchModelsRequestIdRef.current += 1)
      const fetchKey = `${apiType}::${trimmedBaseUrl}::${trimmedApiKey}`
      if (origin === MODEL_FETCH_ORIGINS.Manual) {
        historyPrefilledFetchKeyRef.current = null
        lastAutoFetchKeyRef.current = fetchKey
      }
      setIsFetchingModels(true)
      try {
        const response = await sendWebAiApiCheckMessage(
          WebAiApiCheckMessageTypes.FetchModels,
          {
            apiType,
            baseUrl: trimmedBaseUrl,
            apiKey: trimmedApiKey,
          },
        )

        // Ignore stale responses when a newer request is already in-flight.
        if (fetchModelsRequestIdRef.current !== requestId) {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
            diagnostics: buildModelListDiagnostics({
              sourceKind,
              apiType,
              modelCount: 0,
              resultKind: "stale_response_ignored",
            }),
          })
          return
        }

        if (response?.success) {
          const ids = Array.isArray(response.modelIds) ? response.modelIds : []
          setModelIds(ids)
          if (!modelId.trim() && ids.length > 0) {
            // Provide a helpful default to reduce friction.
            setModelId(ids[0] ?? "")
          }
          if (origin === MODEL_FETCH_ORIGINS.Auto) {
            recordBaseUrlHistory(trimmedBaseUrl)
          }
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
            diagnostics: buildModelListDiagnostics({
              sourceKind,
              apiType,
              modelCount: ids.length,
            }),
          })
        } else {
          const responseError = response?.error
          setFetchModelsError(
            responseError || t("webAiApiCheck:modal.errors.fetchModelsFailed"),
          )
          const diagnosticsError =
            typeof responseError === "string"
              ? { message: responseError }
              : undefined
          const diagnostics = buildModelListDiagnostics({
            sourceKind,
            apiType,
            modelCount: 0,
            ...(response?.errorCategory
              ? { errorCategory: response.errorCategory }
              : {}),
            ...(diagnosticsError ? { error: diagnosticsError } : {}),
            ...(typeof response?.errorStatusCode === "number"
              ? { statusCode: response.errorStatusCode }
              : {}),
          })
          const errorCategory =
            response?.errorCategory ??
            diagnostics.failure?.category ??
            PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
            errorCategory,
            diagnostics,
          })
        }
      } catch (error) {
        if (fetchModelsRequestIdRef.current === requestId) {
          setFetchModelsError(t("webAiApiCheck:modal.errors.fetchModelsFailed"))
        }
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: resolveProductAnalyticsErrorCategoryFromError(error),
          diagnostics: buildModelListDiagnostics({
            sourceKind,
            apiType,
            modelCount: 0,
            error,
          }),
        })
      } finally {
        if (fetchModelsRequestIdRef.current === requestId) {
          setIsFetchingModels(false)
        }
      }
    },
    [
      apiKey,
      apiType,
      baseUrl,
      modelId,
      modelListSupported,
      recordBaseUrlHistory,
      setValidationError,
      t,
    ],
  )

  const fetchModelsManually = useCallback(async () => {
    await fetchModels(MODEL_FETCH_ORIGINS.Manual)
  }, [fetchModels])

  // Keep model list state in sync with credentials so the model picker doesn't
  // show stale options after the user edits base URL / API key.
  useEffect(() => {
    if (!isOpen) return
    const trimmedBaseUrl = baseUrl.trim()
    const trimmedApiKey = apiKey.trim()
    const currentFetchKey =
      trimmedBaseUrl && trimmedApiKey
        ? `${apiType}::${trimmedBaseUrl}::${trimmedApiKey}`
        : null

    fetchModelsRequestIdRef.current += 1
    if (lastObservedModelFetchKeyRef.current !== currentFetchKey) {
      lastAutoFetchKeyRef.current = null
      lastObservedModelFetchKeyRef.current = currentFetchKey
      setModelId("")
    }
    setIsFetchingModels(false)
    setModelIds([])
    setFetchModelsError(null)
  }, [apiType, baseUrl, apiKey, isOpen])

  // Auto-fetch model list for supported APIs once we have credentials.
  useEffect(() => {
    if (!isOpen) return
    if (!modelListSupported) return

    const trimmedBaseUrl = baseUrl.trim()
    const trimmedApiKey = apiKey.trim()
    if (!trimmedBaseUrl || !trimmedApiKey) return

    const fetchKey = `${apiType}::${trimmedBaseUrl}::${trimmedApiKey}`
    if (historyPrefilledFetchKeyRef.current === fetchKey) return
    if (lastAutoFetchKeyRef.current === fetchKey) return
    if (isFetchingModels) return

    const timeoutId = window.setTimeout(() => {
      // Double-check inside timer to avoid firing after state has moved on.
      if (!isOpen) return
      if (historyPrefilledFetchKeyRef.current === fetchKey) return
      if (lastAutoFetchKeyRef.current === fetchKey) return
      if (isFetchingModels) return
      lastAutoFetchKeyRef.current = fetchKey
      void fetchModels(MODEL_FETCH_ORIGINS.Auto)
    }, MODEL_AUTO_FETCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    apiKey,
    apiType,
    baseUrl,
    fetchModels,
    historyConfirmationCount,
    isFetchingModels,
    isOpen,
    modelListSupported,
  ])

  return {
    modelId,
    setModelId,
    modelIdsOptions,
    isFetchingModels,
    fetchModelsError,
    hasFetchedModels,
    modelListSupported,
    canFetchModels,
    fetchModelsManually,
    resetModelList,
    resetAutoFetchMarker,
    clearHistoryPrefilledFetchKey,
    setHistoryPrefilledFetchKey,
  }
}
