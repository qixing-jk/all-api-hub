import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast/headless"
import { useTranslation } from "react-i18next"

import {
  getDatePickerLocale,
  parseDatePickerTimestamp,
} from "~/components/ui/datePickerValue"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  resolveProductAnalyticsErrorCategoryFromError,
  startProductAnalyticsAction,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import {
  API_TYPES,
  type ApiVerificationApiType,
  type ApiVerificationProbeId,
} from "~/services/verification/aiApiVerification"
import {
  createProfileModelVerificationHistoryTarget,
  createProfileVerificationHistoryTarget,
  createVerificationHistorySummary,
  verificationResultHistoryStorage,
} from "~/services/verification/verificationResultHistory"
import type { WebAiApiCheckBaseUrlSuggestion } from "~/services/verification/webAiApiCheck/baseUrlHistory"
import { extractApiCheckCredentialsFromText } from "~/services/verification/webAiApiCheck/extractCredentials"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import type { Tag } from "~/types"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"

import {
  API_CHECK_MODAL_CLOSE_REASONS,
  API_CHECK_OPEN_MODAL_EVENT,
  dispatchApiCheckModalClosed,
  dispatchApiCheckModalHostReady,
  type ApiCheckOpenModalDetail,
} from "../events"
import { WEB_AI_API_CHECK_TEST_IDS } from "../testIds"
import {
  buildApiCheckAnalyticsInsights,
  contentApiCheckAnalyticsScope,
  getApiCheckActionSourceKind,
  getApiCheckSourceKind,
} from "./apiCheckModalAnalytics"
import type { ProbeItemState } from "./apiCheckModalTypes"
import { useApiCheckBaseUrlHistory } from "./useApiCheckBaseUrlHistory"
import { useApiCheckModalShell } from "./useApiCheckModalShell"
import { useApiCheckModelDiscovery } from "./useApiCheckModelDiscovery"
import { useApiCheckProbeRunner } from "./useApiCheckProbeRunner"

const logger = createLogger("ApiCheckModalViewModel")

/**
 * Converts an HTML date input value into a local day-level timestamp.
 */
export function parseDateInputValue(value: string): number | null {
  return parseDatePickerTimestamp(value)
}

export interface ApiCheckModalViewModel {
  isOpen: boolean
  sourceText: string
  baseUrl: string
  baseUrlHistorySuggestions: WebAiApiCheckBaseUrlSuggestion[]
  isBaseUrlHistoryPickerOpen: boolean
  apiKey: string
  extractionMetadata: ApiCheckOpenModalDetail["extraction"]
  apiKeyVisible: boolean
  apiType: ApiVerificationApiType
  modelId: string
  modelIdsOptions: Array<{ value: string; label: string }>
  tags: Tag[]
  selectedTagIds: string[]
  notes: string
  expiresAtInput: string
  datePickerLocale: ReturnType<typeof getDatePickerLocale>
  isProfileOptionsOpen: boolean
  hasProfileMetadataInput: boolean
  isFetchingModels: boolean
  fetchModelsError: string | null
  popoverPortalContainer: HTMLElement | null
  probes: ProbeItemState[]
  isRunningAll: boolean
  isStoppingRunAll: boolean
  testStoppedMessage: string | null
  isSavingProfile: boolean
  validationError: string | null
  hasAnyResult: boolean
  isAnyProbeRunning: boolean
  modelListSupported: boolean
  canClose: boolean
  canFetchModels: boolean
  isRunAllActionDisabled: boolean
  canSaveProfile: boolean
  apiTypeOptions: Array<{ value: ApiVerificationApiType; label: string }>
}

export interface ApiCheckModalActions {
  close: () => void
  setSourceText: (value: string) => void
  updateBaseUrl: (value: string) => void
  setIsBaseUrlHistoryPickerOpen: (isOpen: boolean) => void
  selectBaseUrlHistory: (baseUrl: string) => void
  removeBaseUrlHistory: (baseUrl: string) => void
  setApiKey: (value: string) => void
  setApiKeyVisible: (isVisible: boolean) => void
  setApiType: (apiType: ApiVerificationApiType) => void
  setModelId: (modelId: string) => void
  setSelectedTagIds: (tagIds: string[]) => void
  setNotes: (notes: string) => void
  setExpiresAtInput: (value: string) => void
  setIsProfileOptionsOpen: (isOpen: boolean) => void
  createTag: (name: string) => Promise<Tag>
  renameTag: (tagId: string, name: string) => Promise<Tag>
  fetchModels: () => void
  runProbe: (probeId: ApiVerificationProbeId) => void
  stopProbe: (probeId: ApiVerificationProbeId) => void
  runAll: () => void
  stopRunAll: () => void
  saveProfile: () => void
}

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
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [notes, setNotes] = useState("")
  const [expiresAtInput, setExpiresAtInput] = useState("")
  const [isProfileOptionsOpen, setIsProfileOptionsOpen] = useState(false)

  const baseUrlValueRef = useRef("")

  const hasSignaledHostReadyRef = useRef(false)
  const skipNextSourceTextExtractionRef = useRef<string | null>(null)

  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
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
    selectedTagIds.length > 0 || !!notes.trim() || !!expiresAtInput.trim()

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
      setPageUrl(detail.pageUrl || window.location.href)

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
      setSelectedTagIds([])
      setNotes("")
      setExpiresAtInput("")
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

  const canSaveProfile = !!baseUrl.trim() && !!apiKey.trim() && !isSavingProfile

  const persistPreSaveVerificationHistory = useCallback(
    async (profileId: string) => {
      const snapshot = getCurrentVerificationResultsSnapshot()
      if (!snapshot) return

      const target = snapshot.modelId
        ? createProfileModelVerificationHistoryTarget(
            profileId,
            snapshot.modelId,
          )
        : createProfileVerificationHistoryTarget(profileId)
      if (!target) return

      const summary = createVerificationHistorySummary({
        target,
        apiType: snapshot.apiType,
        results: snapshot.results,
        preferredModelId: snapshot.modelId,
      })
      if (!summary) return

      try {
        await verificationResultHistoryStorage.upsertLatestSummary(summary)
      } catch (error) {
        logger.error("Failed to persist pre-save verification history", {
          error,
        })
      }
    },
    [getCurrentVerificationResultsSnapshot],
  )

  const handleSaveProfile = async () => {
    const tracker = startProductAnalyticsAction({
      ...contentApiCheckAnalyticsScope,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateApiCredentialProfile,
    })

    setValidationError(null)

    const trimmedBaseUrl = baseUrl.trim()
    const trimmedApiKey = apiKey.trim()

    if (!trimmedBaseUrl || !trimmedApiKey) {
      setValidationError(t("webAiApiCheck:modal.errors.missingBaseUrlOrKey"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        insights: buildApiCheckAnalyticsInsights(apiType, trigger),
      })
      return
    }
    recordBaseUrlHistory(trimmedBaseUrl)

    const trimmedNotes = notes.trim()
    const expiresAt = parseDateInputValue(expiresAtInput)

    setIsSavingProfile(true)
    try {
      const response = await sendWebAiApiCheckMessage(
        WebAiApiCheckMessageTypes.SaveProfile,
        {
          apiType,
          baseUrl: trimmedBaseUrl,
          apiKey: trimmedApiKey,
          pageUrl: pageUrl || window.location.href,
          ...(selectedTagIds.length > 0 ? { tagIds: selectedTagIds } : {}),
          ...(trimmedNotes ? { notes: trimmedNotes } : {}),
          ...(expiresAt !== null ? { expiresAt } : {}),
        },
      )

      if (response?.success) {
        await persistPreSaveVerificationHistory(response.profileId)

        toast.success(
          (toastInstance) => (
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                {t("webAiApiCheck:modal.messages.savedToProfiles", {
                  name: typeof response.name === "string" ? response.name : "",
                })}
              </span>
              <button
                type="button"
                data-testid={
                  WEB_AI_API_CHECK_TEST_IDS.openApiProfilesToastButton
                }
                className="shrink-0 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                onClick={() => {
                  void sendRuntimeMessage({
                    action: RuntimeActionIds.OpenSettingsApiCredentialProfiles,
                  }).catch(() => {})
                  toast.dismiss(toastInstance.id)
                }}
              >
                {t("webAiApiCheck:modal.actions.openApiProfiles")}
              </button>
            </div>
          ),
          { duration: 8000 },
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: buildApiCheckAnalyticsInsights(apiType, trigger),
        })
      } else {
        toast.error(
          response?.error ||
            t("webAiApiCheck:modal.errors.saveToProfilesFailed"),
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory:
            response?.errorCategory ??
            PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: buildApiCheckAnalyticsInsights(apiType, trigger),
        })
      }
    } catch (error) {
      toast.error(t("webAiApiCheck:modal.errors.saveToProfilesFailed"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: resolveProductAnalyticsErrorCategoryFromError(error),
        insights: buildApiCheckAnalyticsInsights(apiType, trigger),
      })
    } finally {
      setIsSavingProfile(false)
    }
  }
  const apiTypeOptions = useMemo(
    () => [
      { value: API_TYPES.OPENAI_COMPATIBLE, label: "OpenAI-compatible" },
      { value: API_TYPES.OPENAI, label: "OpenAI" },
      { value: API_TYPES.ANTHROPIC, label: "Anthropic" },
      { value: API_TYPES.GOOGLE, label: "Google" },
    ],
    [],
  )
  const datePickerLocale = useMemo(
    () => getDatePickerLocale(i18n.language),
    [i18n.language],
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
      modelId,
      modelIdsOptions,
      tags,
      selectedTagIds,
      notes,
      expiresAtInput,
      datePickerLocale,
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
      setModelId,
      setSelectedTagIds,
      setNotes,
      setExpiresAtInput,
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
