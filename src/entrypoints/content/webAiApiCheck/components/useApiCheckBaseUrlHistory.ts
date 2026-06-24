import { useCallback, useRef, useState } from "react"

import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
} from "~/services/productAnalytics/events"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import type { WebAiApiCheckBaseUrlSuggestion } from "~/services/verification/webAiApiCheck/baseUrlHistory"
import { WEB_AI_API_CHECK_BASE_URL_HISTORY_SUGGESTION_LIMIT } from "~/services/verification/webAiApiCheck/constants"
import { normalizeOpenAiFamilyBaseUrl } from "~/services/verification/webAiApiCheck/extractCredentials"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"

import { contentApiCheckAnalyticsScope } from "./apiCheckModalAnalytics"

type UseApiCheckBaseUrlHistoryOptions = {
  apiType: ApiVerificationApiType
  pageUrl: string
  updateBaseUrl: (value: string) => void
  getCurrentBaseUrl: () => string
}

type LoadBaseUrlHistorySuggestionsOptions = {
  pageUrl: string
  apiKey: string
  onPrefill: (baseUrl: string) => void
}

/**
 * Owns base URL history suggestions, optimistic local updates, and history analytics.
 */
export function useApiCheckBaseUrlHistory({
  apiType,
  pageUrl,
  updateBaseUrl,
  getCurrentBaseUrl,
}: UseApiCheckBaseUrlHistoryOptions) {
  const [baseUrlHistorySuggestions, setBaseUrlHistorySuggestions] = useState<
    WebAiApiCheckBaseUrlSuggestion[]
  >([])
  const [isBaseUrlHistoryPickerOpen, setIsBaseUrlHistoryPickerOpen] =
    useState(false)
  const [historyConfirmationCount, setHistoryConfirmationCount] = useState(0)
  const historySuggestionsRequestIdRef = useRef(0)

  const trackBaseUrlHistoryAction = useCallback(
    (
      actionId:
        | typeof PRODUCT_ANALYTICS_ACTION_IDS.PrefillApiCredentialBaseUrlFromHistory
        | typeof PRODUCT_ANALYTICS_ACTION_IDS.SelectApiCredentialBaseUrlHistory
        | typeof PRODUCT_ANALYTICS_ACTION_IDS.RemoveApiCredentialBaseUrlHistory,
    ) => {
      const tracker = startProductAnalyticsAction({
        ...contentApiCheckAnalyticsScope,
        actionId,
      })
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: {
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
          apiType,
        },
      })
    },
    [apiType],
  )

  const resetBaseUrlHistorySuggestions = useCallback(() => {
    setBaseUrlHistorySuggestions([])
  }, [])

  const recordBaseUrlHistory = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return
      const normalized = normalizeOpenAiFamilyBaseUrl(trimmed)
      if (normalized) {
        setBaseUrlHistorySuggestions((current) =>
          [
            {
              baseUrl: normalized,
              lastUsedAt: Date.now(),
              useCount:
                (current.find((item) => item.baseUrl === normalized)
                  ?.useCount ?? 0) + 1,
            },
            ...current.filter((item) => item.baseUrl !== normalized),
          ].slice(0, WEB_AI_API_CHECK_BASE_URL_HISTORY_SUGGESTION_LIMIT),
        )
      }
      void sendWebAiApiCheckMessage(
        WebAiApiCheckMessageTypes.RecordBaseUrlHistory,
        {
          baseUrl: trimmed,
          pageUrl: pageUrl || window.location.href,
        },
      )
        .then((response) => {
          if (response?.success && Array.isArray(response.suggestions)) {
            setBaseUrlHistorySuggestions(response.suggestions)
          }
        })
        .catch(() => {})
    },
    [pageUrl],
  )

  const loadBaseUrlHistorySuggestions = useCallback(
    ({
      pageUrl: requestPageUrl,
      apiKey,
      onPrefill,
    }: LoadBaseUrlHistorySuggestionsOptions) => {
      const historyRequestId = ++historySuggestionsRequestIdRef.current
      void sendWebAiApiCheckMessage(
        WebAiApiCheckMessageTypes.GetBaseUrlHistorySuggestions,
        {
          pageUrl: requestPageUrl,
          limit: WEB_AI_API_CHECK_BASE_URL_HISTORY_SUGGESTION_LIMIT,
        },
      )
        .then((response) => {
          if (historyRequestId !== historySuggestionsRequestIdRef.current) {
            return
          }
          if (!response?.success) return
          const suggestions = response.suggestions ?? []
          setBaseUrlHistorySuggestions(suggestions)
          if (!getCurrentBaseUrl().trim() && suggestions[0]?.baseUrl) {
            const historyBaseUrl = suggestions[0].baseUrl
            updateBaseUrl(historyBaseUrl)
            if (apiKey.trim()) {
              onPrefill(historyBaseUrl)
            }
            trackBaseUrlHistoryAction(
              PRODUCT_ANALYTICS_ACTION_IDS.PrefillApiCredentialBaseUrlFromHistory,
            )
          }
        })
        .catch(() => {})
    },
    [getCurrentBaseUrl, trackBaseUrlHistoryAction, updateBaseUrl],
  )

  const removeBaseUrlHistory = useCallback(
    (value: string) => {
      const normalized = normalizeOpenAiFamilyBaseUrl(value.trim())
      if (!normalized) return
      trackBaseUrlHistoryAction(
        PRODUCT_ANALYTICS_ACTION_IDS.RemoveApiCredentialBaseUrlHistory,
      )
      setBaseUrlHistorySuggestions((current) =>
        current.filter((item) => item.baseUrl !== normalized),
      )
      void sendWebAiApiCheckMessage(
        WebAiApiCheckMessageTypes.RemoveBaseUrlHistory,
        {
          baseUrl: normalized,
          pageUrl: pageUrl || window.location.href,
        },
      )
        .then((response) => {
          if (response?.success && Array.isArray(response.suggestions)) {
            setBaseUrlHistorySuggestions(response.suggestions)
          }
        })
        .catch(() => {})
    },
    [pageUrl, trackBaseUrlHistoryAction],
  )

  const selectBaseUrlHistory = useCallback(
    (value: string) => {
      setHistoryConfirmationCount((count) => count + 1)
      updateBaseUrl(value)
      trackBaseUrlHistoryAction(
        PRODUCT_ANALYTICS_ACTION_IDS.SelectApiCredentialBaseUrlHistory,
      )
      setIsBaseUrlHistoryPickerOpen(false)
    },
    [trackBaseUrlHistoryAction, updateBaseUrl],
  )

  return {
    baseUrlHistorySuggestions,
    isBaseUrlHistoryPickerOpen,
    historyConfirmationCount,
    setIsBaseUrlHistoryPickerOpen,
    resetBaseUrlHistorySuggestions,
    recordBaseUrlHistory,
    loadBaseUrlHistorySuggestions,
    removeBaseUrlHistory,
    selectBaseUrlHistory,
  }
}
