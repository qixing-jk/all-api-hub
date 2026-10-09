import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  API_CHECK_MODAL_CLOSE_REASONS,
  API_CHECK_OPEN_MODAL_EVENT,
  dispatchApiCheckModalClosed,
  dispatchApiCheckModalHostReady,
  type ApiCheckOpenModalDetail,
} from "~/features/WebAiApiCheck/content/events"
import { useApiCheckBaseUrlHistory } from "~/features/WebAiApiCheck/content/history/useApiCheckBaseUrlHistory"
import {
  contentApiCheckAnalyticsScope,
  getApiCheckActionSourceKind,
  getApiCheckSourceKind,
} from "~/features/WebAiApiCheck/content/modal/apiCheckModalAnalytics"
import type { ApiCheckValidationError } from "~/features/WebAiApiCheck/content/modal/apiCheckModalTypes"
import { useApiCheckModalShell } from "~/features/WebAiApiCheck/content/modal/useApiCheckModalShell"
import { useApiCheckModelDiscovery } from "~/features/WebAiApiCheck/content/models/useApiCheckModelDiscovery"
import { useApiCheckProbeRunner } from "~/features/WebAiApiCheck/content/probes/useApiCheckProbeRunner"
import { normalizeApiCheckSourceUrl } from "~/features/WebAiApiCheck/content/profiles/apiCheckSourceUrl"
import { useApiCheckProfileSaveWorkflow } from "~/features/WebAiApiCheck/content/profiles/useApiCheckProfileSaveWorkflow"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import {
  API_TYPES,
  API_VERIFICATION_MODES,
  type ApiVerificationApiType,
  type ApiVerificationMode,
  type ApiVerificationProbeId,
} from "~/services/verification/aiApiVerification"
import { extractApiCheckCredentialsFromText } from "~/services/verification/webAiApiCheck/extractCredentials"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import type { Tag } from "~/types"

/**
 * Builds the state and action contract for the content API check modal UI.
 */
export function useApiCheckModalViewModel() {
  const { t, i18n } = useTranslation([
    "webAiApiCheck",
    "common",
    "aiApiVerification",
  ])

  const [isOpen, setIsOpen] = useState(false)
  const [trigger, setTrigger] =
    useState<ApiCheckOpenModalDetail["trigger"]>("contextMenu")
  const [pageUrl, setPageUrl] = useState("")

  const [sourceText, setSourceText] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [extractionMetadata, setExtractionMetadata] =
    useState<ApiCheckOpenModalDetail["extraction"]>(undefined)
  const [apiKeyCleanupPatterns, setApiKeyCleanupPatterns] = useState<string[]>(
    [],
  )
  const [apiKeyVisible, setApiKeyVisible] = useState(true)
  const [apiType, setApiType] = useState<ApiVerificationApiType>(
    API_TYPES.OPENAI_COMPATIBLE,
  )
  const [verificationMode, setVerificationMode] = useState<ApiVerificationMode>(
    API_VERIFICATION_MODES.Streaming,
  )
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [notes, setNotes] = useState("")
  const [expiresAtInput, setExpiresAtInput] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [isProfileOptionsOpen, setIsProfileOptionsOpen] = useState(false)

  const baseUrlValueRef = useRef("")

  const hasSignaledHostReadyRef = useRef(false)
  const skipNextSourceTextExtractionRef = useRef<string | null>(null)

  const [validationFailure, setValidationError] =
    useState<ApiCheckValidationError | null>(null)
  const validationError =
    validationFailure === "missing-credentials"
      ? t("webAiApiCheck:modal.errors.missingBaseUrlOrKey")
      : validationFailure === "missing-model"
        ? t("aiApiVerification:verifyDialog.requiresModelId")
        : null
  const hasInitializedApiTypeRef = useRef(false)

  const { popoverPortalContainer, refs: modalShellRefs } =
    useApiCheckModalShell(isOpen)

  const updateBaseUrl = useCallback((value: string) => {
    baseUrlValueRef.current = value
    setBaseUrl(value)
  }, [])

  const getCurrentBaseUrl = useCallback(() => baseUrlValueRef.current, [])

  const baseUrlHistory = useApiCheckBaseUrlHistory({
    apiType,
    pageUrl,
    updateBaseUrl,
    getCurrentBaseUrl,
  })

  const {
    baseUrlHistorySuggestions,
    isBaseUrlHistoryPickerOpen,
    historyConfirmationCount,
    setIsBaseUrlHistoryPickerOpen,
    resetBaseUrlHistorySuggestions,
    recordBaseUrlHistory,
    loadBaseUrlHistorySuggestions,
    removeBaseUrlHistory,
    selectBaseUrlHistory,
  } = baseUrlHistory

  const modelDiscovery = useApiCheckModelDiscovery({
    t,
    isOpen,
    apiType,
    baseUrl,
    apiKey,
    historyConfirmationCount,
    setValidationError,
    recordBaseUrlHistory,
  })

  const {
    modelId,
    setModelId,
    modelIdsOptions,
    isFetchingModels,
    fetchModelsError,
    hasFetchedModels,
    modelListSupported,
    canFetchModels: canFetchModelsFromModelDiscovery,
    fetchModelsManually,
    resetModelList,
    resetAutoFetchMarker,
    clearHistoryPrefilledFetchKey,
    setHistoryPrefilledFetchKey,
  } = modelDiscovery

  const probeRunner = useApiCheckProbeRunner({
    t,
    apiType,
    verificationMode,
    trigger,
    baseUrl,
    apiKey,
    modelId,
    setValidationError,
    recordBaseUrlHistory,
  })

  const {
    probes,
    isRunningAll,
    isStoppingRunAll,
    testStoppedMessage,
    hasAnyResult,
    isAnyProbeRunning,
    resetProbeState,
    runProbe,
    stopProbe,
    runAll,
    stopRunAll,
    getCurrentVerificationResultsSnapshot,
  } = probeRunner

  const canClose = !isRunningAll && !isAnyProbeRunning
  const canFetchModels = canFetchModelsFromModelDiscovery && !isRunningAll
  const isRunAllActionDisabled =
    isStoppingRunAll ||
    (!isRunningAll && (isFetchingModels || isAnyProbeRunning))
  const hasProfileMetadataInput =
    selectedTagIds.length > 0 ||
    !!notes.trim() ||
    !!expiresAtInput.trim() ||
    !!sourceUrl.trim()

  const loadTags = useCallback(async () => {
    setTags([])
    const response = await sendWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.ListTags,
      {},
    )
    if (response?.success) {
      setTags(response.tags)
    }
  }, [])

  const createTag = useCallback(async (name: string) => {
    const response = await sendWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.CreateTag,
      { name },
    )
    if (!response?.success) {
      throw new Error(response?.error || "Failed to create tag")
    }
    setTags((current) => [
      ...current.filter((tag) => tag.id !== response.tag.id),
      response.tag,
    ])
    return response.tag
  }, [])

  const renameTag = useCallback(async (tagId: string, name: string) => {
    const response = await sendWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.RenameTag,
      { tagId, name },
    )
    if (!response?.success) {
      throw new Error(response?.error || "Failed to rename tag")
    }
    setTags((current) =>
      current.map((tag) => (tag.id === response.tag.id ? response.tag : tag)),
    )
    return response.tag
  }, [])

  useEffect(() => {
    if (!hasInitializedApiTypeRef.current) {
      hasInitializedApiTypeRef.current = true
      return
    }
    resetProbeState(apiType)
    resetModelList({ clearSelection: true })
    setValidationError(null)
  }, [apiType, resetModelList, resetProbeState])

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const custom = event as CustomEvent<ApiCheckOpenModalDetail>
      const detail = custom.detail
      if (!detail) return

      // Reset auto-fetch marker on each modal open so a new set of credentials
      // can trigger a model refresh without requiring manual interaction.
      resetAutoFetchMarker()

      setTrigger(detail.trigger)
      const nextPageUrl = detail.pageUrl || window.location.href
      setPageUrl(nextPageUrl)

      const nextSourceText = (detail.sourceText ?? "").toString()
      skipNextSourceTextExtractionRef.current = nextSourceText
      setSourceText(nextSourceText)
      const nextApiKeyCleanupPatterns = detail.apiKeyCleanupPatterns ?? []
      setApiKeyCleanupPatterns(nextApiKeyCleanupPatterns)

      const extracted = extractApiCheckCredentialsFromText(nextSourceText, {
        apiKeyCleanupPatterns: nextApiKeyCleanupPatterns,
      })
      const extraction = detail.extraction ?? {
        candidates: extracted.candidates,
        summary: extracted.summary,
      }
      const nextBaseUrl =
        extraction.candidates.baseUrls[0]?.value ?? extracted.baseUrl ?? ""
      const nextApiKey =
        extraction.candidates.apiKeys[0]?.value ?? extracted.apiKey ?? ""
      setExtractionMetadata(extraction)
      resetBaseUrlHistorySuggestions()
      clearHistoryPrefilledFetchKey()
      updateBaseUrl(nextBaseUrl)
      setApiKey(nextApiKey)
      setVerificationMode(API_VERIFICATION_MODES.Streaming)
      setSelectedTagIds([])
      setNotes("")
      setExpiresAtInput("")
      setSourceUrl(normalizeApiCheckSourceUrl(nextPageUrl) ?? "")
      setIsProfileOptionsOpen(false)

      setApiKeyVisible(true)
      resetModelList({ clearSelection: true })
      setValidationError(null)
      resetProbeState(apiType)

      setIsOpen(true)

      const tracker = startProductAnalyticsAction({
        ...contentApiCheckAnalyticsScope,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ShowApiCredentialCheckModal,
      })
      const hasUsableCredentials = !!nextBaseUrl && !!nextApiKey
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: {
          sourceKind: getApiCheckSourceKind(detail.trigger),
          apiType,
          readyCount: hasUsableCredentials ? 1 : 0,
          blockedCount: hasUsableCredentials ? 0 : 1,
        },
      })

      loadBaseUrlHistorySuggestions({
        pageUrl: detail.pageUrl || window.location.href,
        apiKey: nextApiKey,
        onPrefill: (historyBaseUrl) => {
          setHistoryPrefilledFetchKey(
            `${apiType}::${historyBaseUrl.trim()}::${nextApiKey.trim()}`,
          )
        },
      })

      void loadTags()
    }

    window.addEventListener(API_CHECK_OPEN_MODAL_EVENT, handleOpen as any)
    if (!hasSignaledHostReadyRef.current) {
      hasSignaledHostReadyRef.current = true
      dispatchApiCheckModalHostReady()
    }
    return () => {
      window.removeEventListener(API_CHECK_OPEN_MODAL_EVENT, handleOpen as any)
    }
  }, [
    apiType,
    clearHistoryPrefilledFetchKey,
    loadBaseUrlHistorySuggestions,
    resetAutoFetchMarker,
    resetBaseUrlHistorySuggestions,
    resetModelList,
    resetProbeState,
    setHistoryPrefilledFetchKey,
    updateBaseUrl,
    loadTags,
  ])

  const close = () => {
    const reason =
      hasAnyResult || hasFetchedModels
        ? API_CHECK_MODAL_CLOSE_REASONS.Completed
        : API_CHECK_MODAL_CLOSE_REASONS.Dismissed
    if (reason === API_CHECK_MODAL_CLOSE_REASONS.Dismissed) {
      const tracker = startProductAnalyticsAction({
        ...contentApiCheckAnalyticsScope,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.DismissDetectedApiCredentialCheck,
      })
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
        insights: {
          sourceKind: getApiCheckActionSourceKind(trigger),
        },
      })
    }
    dispatchApiCheckModalClosed({
      pageUrl: pageUrl || window.location.href,
      trigger,
      reason,
    })
    resetModelList()
    setExtractionMetadata(undefined)
    setIsOpen(false)
  }

  // Keep baseUrl + apiKey in sync with the source text so users don't need
  // a manual "Re-extract" action after editing/pasting into the textarea.
  useEffect(() => {
    if (!isOpen) return
    if (skipNextSourceTextExtractionRef.current === sourceText) {
      skipNextSourceTextExtractionRef.current = null
      return
    }
    const extracted = extractApiCheckCredentialsFromText(sourceText, {
      apiKeyCleanupPatterns,
    })
    setExtractionMetadata({
      candidates: extracted.candidates,
      summary: extracted.summary,
    })
    if (extracted.baseUrl) {
      updateBaseUrl(extracted.baseUrl)
    }
    if (extracted.apiKey) {
      setApiKey(extracted.apiKey)
    }
  }, [apiKeyCleanupPatterns, isOpen, sourceText, updateBaseUrl])

  const handleSelectBaseUrlHistory = useCallback(
    (value: string) => {
      clearHistoryPrefilledFetchKey()
      selectBaseUrlHistory(value)
    },
    [clearHistoryPrefilledFetchKey, selectBaseUrlHistory],
  )

  const {
    canSaveProfile,
    isSavingProfile,
    saveProfile: handleSaveProfile,
  } = useApiCheckProfileSaveWorkflow({
    draft: {
      baseUrl,
      apiKey,
      apiType,
      trigger,
      pageUrl,
      notes,
      sourceUrl,
      expiresAtInput,
      selectedTagIds,
    },
    setValidationError,
    recordBaseUrlHistory,
    getCurrentVerificationResultsSnapshot,
  })
  const apiTypeOptions = useMemo(
    () => [
      { value: API_TYPES.OPENAI_COMPATIBLE, label: "OpenAI-compatible" },
      { value: API_TYPES.OPENAI, label: "OpenAI" },
      { value: API_TYPES.ANTHROPIC, label: "Anthropic" },
      { value: API_TYPES.GOOGLE, label: "Google" },
    ],
    [],
  )
  return {
    view: {
      isOpen,
      sourceText,
      baseUrl,
      baseUrlHistorySuggestions,
      isBaseUrlHistoryPickerOpen,
      apiKey,
      extractionMetadata,
      apiKeyVisible,
      apiType,
      verificationMode,
      modelId,
      modelIdsOptions,
      tags,
      selectedTagIds,
      notes,
      expiresAtInput,
      sourceUrl,
      datePickerLanguage: i18n.language,
      isProfileOptionsOpen,
      hasProfileMetadataInput,
      isFetchingModels,
      fetchModelsError,
      popoverPortalContainer,
      probes,
      isRunningAll,
      isStoppingRunAll,
      testStoppedMessage,
      isSavingProfile,
      validationError,
      hasAnyResult,
      isAnyProbeRunning,
      modelListSupported,
      canClose,
      canFetchModels,
      isRunAllActionDisabled,
      canSaveProfile,
      apiTypeOptions,
    },
    actions: {
      close,
      setSourceText,
      updateBaseUrl,
      setIsBaseUrlHistoryPickerOpen,
      selectBaseUrlHistory: handleSelectBaseUrlHistory,
      removeBaseUrlHistory,
      setApiKey,
      setApiKeyVisible,
      setApiType,
      setVerificationMode,
      setModelId,
      setSelectedTagIds,
      setNotes,
      setExpiresAtInput,
      setSourceUrl,
      setIsProfileOptionsOpen,
      createTag,
      renameTag,
      fetchModels: fetchModelsManually,
      runProbe: (probeId: ApiVerificationProbeId) => {
        void runProbe(probeId)
      },
      stopProbe,
      runAll: () => {
        void runAll()
      },
      stopRunAll,
      saveProfile: () => {
        void handleSaveProfile()
      },
    },
    refs: {
      ...modalShellRefs,
    },
  }
}
