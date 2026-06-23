import { XMarkIcon } from "@heroicons/react/24/outline"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import toast from "react-hot-toast/headless"
import { useTranslation } from "react-i18next"

import { ProbeStatusBadge } from "~/components/dialogs/VerifyApiDialog/ProbeStatusBadge"
import {
  Button,
  IconButton,
  Input,
  Notice,
  SearchableSelect,
  Textarea,
} from "~/components/ui"
import { inputVariants } from "~/components/ui/input"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { cn } from "~/lib/utils"
import {
  resolveProductAnalyticsErrorCategoryFromError,
  startProductAnalyticsAction,
  type ProductAnalyticsActionInsights,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsErrorCategory,
  type ProductAnalyticsResult,
  type ProductAnalyticsSourceKind,
} from "~/services/productAnalytics/events"
import { buildModelListDiagnostics } from "~/services/productAnalytics/modelListDiagnostics"
import { resolveProductAnalyticsErrorCategoryFromProbeResult } from "~/services/productAnalytics/verification"
import {
  API_TYPES,
  getApiVerificationProbeDefinitions,
  type ApiVerificationApiType,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import {
  getApiVerificationProbeLabel,
  translateApiVerificationSummary,
} from "~/services/verification/aiApiVerification/i18n"
import { extractApiCheckCredentialsFromText } from "~/services/verification/webAiApiCheck/extractCredentials"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { isTestMode } from "~/utils/core/environment"
import { safeRandomUUID } from "~/utils/core/identifier"

import {
  API_CHECK_OPEN_MODAL_EVENT,
  dispatchApiCheckModalClosed,
  dispatchApiCheckModalHostReady,
  type ApiCheckOpenModalDetail,
} from "../events"
import {
  getWebAiApiCheckProbeTestId,
  WEB_AI_API_CHECK_TEST_IDS,
} from "../testIds"

type ProbeItemState = {
  id: ApiVerificationProbeId
  requiresModelId: boolean
  isRunning: boolean
  attempts: number
  result: ApiVerificationProbeResult | null
}

type ApiCheckProbeResultWithAnalyticsCategory = ApiVerificationProbeResult & {
  analyticsErrorCategory?: ProductAnalyticsErrorCategory
}

type ApiCheckExtractionMetadata = NonNullable<
  ApiCheckOpenModalDetail["extraction"]
>

// Preserve the real debounce in dev/prod to avoid bursty background requests
// while typing, but skip the wall-clock delay in Vitest.
const MODEL_AUTO_FETCH_DEBOUNCE_MS = isTestMode() ? 0 : 300

const contentApiCheckAnalyticsScope = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckModal,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
} as const

const stopHostPageKeyboardShortcuts = (
  event: ReactKeyboardEvent<HTMLElement>,
) => {
  event.stopPropagation()
}

const KEYBOARD_EVENTS_TO_CONTAIN = ["keydown", "keyup"] as const

/**
 * Classifies the modal opening source without carrying page content.
 */
function getApiCheckSourceKind(
  trigger: ApiCheckOpenModalDetail["trigger"],
): ProductAnalyticsSourceKind {
  if (trigger === "autoDetect") return PRODUCT_ANALYTICS_SOURCE_KINDS.Auto
  return PRODUCT_ANALYTICS_SOURCE_KINDS.ContextMenu
}

/**
 * Classifies in-modal actions separately from modal launch sources.
 */
function getApiCheckActionSourceKind(
  trigger: ApiCheckOpenModalDetail["trigger"],
): ProductAnalyticsSourceKind {
  return trigger === "autoDetect"
    ? PRODUCT_ANALYTICS_SOURCE_KINDS.Auto
    : PRODUCT_ANALYTICS_SOURCE_KINDS.Manual
}

/**
 * Adds common safe dimensions to API check action completions.
 */
function buildApiCheckAnalyticsInsights(
  apiType: ApiVerificationApiType,
  trigger: ApiCheckOpenModalDetail["trigger"],
  insights: ProductAnalyticsActionInsights = {},
): ProductAnalyticsActionInsights {
  return {
    sourceKind: getApiCheckActionSourceKind(trigger),
    apiType,
    ...insights,
  }
}

/**
 * Converts probe status into a fixed analytics completion result.
 */
function getProbeAnalyticsResult(
  result: ApiVerificationProbeResult | undefined,
): ProductAnalyticsResult {
  if (!result) return PRODUCT_ANALYTICS_RESULTS.Failure
  if (result.status === "pass") return PRODUCT_ANALYTICS_RESULTS.Success
  if (result.status === "unsupported") return PRODUCT_ANALYTICS_RESULTS.Skipped
  return PRODUCT_ANALYTICS_RESULTS.Failure
}

/**
 * Build the initial probe UI state for the selected API type.
 */
function buildProbeState(apiType: ApiVerificationApiType): ProbeItemState[] {
  return getApiVerificationProbeDefinitions(apiType).map(
    (def): ProbeItemState => ({
      id: def.id,
      requiresModelId: def.requiresModelId,
      isRunning: false,
      attempts: 0,
      result: null,
    }),
  )
}

/**
 * Clear the running flag when a late probe result should no longer update UI data.
 */
function markProbeNotRunning(
  probes: ProbeItemState[],
  probeId: ApiVerificationProbeId,
): ProbeItemState[] {
  return probes.map((probe) =>
    probe.id === probeId ? { ...probe, isRunning: false } : probe,
  )
}

/**
 * Always-mounted modal host rendered inside the content-script Shadow DOM root.
 *
 * The host listens for CustomEvents to open/close, so the rest of the content
 * script can trigger the UI without importing React components.
 */
export function ApiCheckModalHost() {
  const { t } = useTranslation(["webAiApiCheck", "common", "aiApiVerification"])

  const [isOpen, setIsOpen] = useState(false)
  const [trigger, setTrigger] =
    useState<ApiCheckOpenModalDetail["trigger"]>("contextMenu")
  const [pageUrl, setPageUrl] = useState("")

  const [sourceText, setSourceText] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [extractionMetadata, setExtractionMetadata] =
    useState<ApiCheckOpenModalDetail["extraction"]>(undefined)
  const [apiKeyVisible, setApiKeyVisible] = useState(true)
  const [apiType, setApiType] = useState<ApiVerificationApiType>(
    API_TYPES.OPENAI_COMPATIBLE,
  )
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
  const fetchModelsRequestIdRef = useRef(0)
  const hasSignaledHostReadyRef = useRef(false)
  const skipNextSourceTextExtractionRef = useRef<string | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  /**
   * Radix popovers (used by `SearchableSelect`) portal to `document.body` by default.
   * In our content-script ShadowRoot UI that causes the dropdown to escape styling
   * and appear behind the overlay. We provide a local portal container inside the
   * modal root instead.
   */
  const [popoverPortalContainer, setPopoverPortalContainer] =
    useState<HTMLElement | null>(null)
  const popoverPortalContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      setPopoverPortalContainer(node)
    },
    [],
  )

  const [probes, setProbes] = useState<ProbeItemState[]>(() =>
    buildProbeState(API_TYPES.OPENAI_COMPATIBLE),
  )
  const [isRunningAll, setIsRunningAll] = useState(false)
  const [isStoppingRunAll, setIsStoppingRunAll] = useState(false)
  const [testStoppedMessage, setTestStoppedMessage] = useState<string | null>(
    null,
  )
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const hasInitializedApiTypeRef = useRef(false)
  const shouldStopRunAllRef = useRef(false)
  const activeProbeRunIdsRef = useRef(new Map<ApiVerificationProbeId, string>())
  const activeProbeTrackersRef = useRef(
    new Map<
      ApiVerificationProbeId,
      ReturnType<typeof startProductAnalyticsAction>
    >(),
  )
  const cancelledProbeRunIdsRef = useRef(new Set<string>())
  const activeRunAllProbeIdRef = useRef<ApiVerificationProbeId | null>(null)

  const probeDefinitions = useMemo(
    () => getApiVerificationProbeDefinitions(apiType),
    [apiType],
  )

  const hasAnyResult = useMemo(
    () => probes.some((probe) => probe.result !== null),
    [probes],
  )

  const hasFetchedModels = modelIds.length > 0
  const isAnyProbeRunning = probes.some((probe) => probe.isRunning)

  const modelListSupported =
    apiType === API_TYPES.OPENAI_COMPATIBLE ||
    apiType === API_TYPES.OPENAI ||
    apiType === API_TYPES.ANTHROPIC ||
    apiType === API_TYPES.GOOGLE

  const resetProbeState = (nextApiType: ApiVerificationApiType) => {
    setProbes(buildProbeState(nextApiType))
    setTestStoppedMessage(null)
  }

  useEffect(() => {
    if (!hasInitializedApiTypeRef.current) {
      hasInitializedApiTypeRef.current = true
      return
    }
    resetProbeState(apiType)
    // Reset model list UI when apiType changes.
    setModelId("")
    setModelIds([])
    setFetchModelsError(null)
    setValidationError(null)
  }, [apiType])

  useEffect(() => {
    if (!isOpen) return
    dialogRef.current?.focus({ preventScroll: true })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const stopKeyboardShortcut = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof Node && dialogRef.current?.contains(target)) {
        event.stopImmediatePropagation()
      }
    }
    const stopWheel = (event: WheelEvent) => {
      event.stopPropagation()
    }
    const stopBackgroundWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
    }
    const documentElement = document.documentElement
    const body = document.body
    const previousDocumentOverflow = documentElement.style.overflow
    const previousBodyOverflow = body.style.overflow

    const dialog = dialogRef.current
    const backdrop = backdropRef.current
    const scrollContainer = scrollContainerRef.current

    KEYBOARD_EVENTS_TO_CONTAIN.forEach((eventName) => {
      document.addEventListener(eventName, stopKeyboardShortcut, {
        capture: true,
      })
    })
    documentElement.style.overflow = "hidden"
    body.style.overflow = "hidden"
    dialog?.addEventListener("wheel", stopBackgroundWheel, { passive: false })
    backdrop?.addEventListener("wheel", stopBackgroundWheel, {
      passive: false,
    })
    scrollContainer?.addEventListener("wheel", stopWheel, { passive: false })

    return () => {
      KEYBOARD_EVENTS_TO_CONTAIN.forEach((eventName) => {
        document.removeEventListener(eventName, stopKeyboardShortcut, {
          capture: true,
        })
      })
      documentElement.style.overflow = previousDocumentOverflow
      body.style.overflow = previousBodyOverflow
      dialog?.removeEventListener("wheel", stopBackgroundWheel)
      backdrop?.removeEventListener("wheel", stopBackgroundWheel)
      scrollContainer?.removeEventListener("wheel", stopWheel)
    }
  }, [isOpen])

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const custom = event as CustomEvent<ApiCheckOpenModalDetail>
      const detail = custom.detail
      if (!detail) return

      // Reset auto-fetch marker on each modal open so a new set of credentials
      // can trigger a model refresh without requiring manual interaction.
      lastAutoFetchKeyRef.current = null

      setTrigger(detail.trigger)
      setPageUrl(detail.pageUrl || window.location.href)

      const nextSourceText = (detail.sourceText ?? "").toString()
      skipNextSourceTextExtractionRef.current = nextSourceText
      setSourceText(nextSourceText)

      const extracted = extractApiCheckCredentialsFromText(nextSourceText)
      const extraction = detail.extraction ?? {
        candidates: extracted.candidates,
        summary: extracted.summary,
      }
      const nextBaseUrl =
        extraction.candidates.baseUrls[0]?.value ?? extracted.baseUrl ?? ""
      const nextApiKey =
        extraction.candidates.apiKeys[0]?.value ?? extracted.apiKey ?? ""
      setExtractionMetadata(extraction)
      setBaseUrl(nextBaseUrl)
      setApiKey(nextApiKey)

      setApiKeyVisible(true)
      setModelId("")
      setModelIds([])
      setFetchModelsError(null)
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
    }

    window.addEventListener(API_CHECK_OPEN_MODAL_EVENT, handleOpen as any)
    if (!hasSignaledHostReadyRef.current) {
      hasSignaledHostReadyRef.current = true
      dispatchApiCheckModalHostReady()
    }
    return () => {
      window.removeEventListener(API_CHECK_OPEN_MODAL_EVENT, handleOpen as any)
    }
  }, [apiType])

  const close = () => {
    const reason = hasAnyResult || hasFetchedModels ? "completed" : "dismissed"
    if (reason === "dismissed") {
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
    fetchModelsRequestIdRef.current += 1
    lastAutoFetchKeyRef.current = null
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
    const extracted = extractApiCheckCredentialsFromText(sourceText)
    setExtractionMetadata({
      candidates: extracted.candidates,
      summary: extracted.summary,
    })
    if (extracted.baseUrl) setBaseUrl(extracted.baseUrl)
    if (extracted.apiKey) setApiKey(extracted.apiKey)
  }, [isOpen, sourceText])

  const renderCandidateButtons = useCallback(
    (
      kind: "baseUrl" | "apiKey",
      candidates: ApiCheckExtractionMetadata["candidates"]["baseUrls"],
      currentValue: string,
      onSelect: (value: string) => void,
    ) => {
      if (candidates.length <= 1) return null

      return (
        <div className="mt-1 flex flex-wrap gap-1">
          {candidates.slice(0, 4).map((candidate, index) => {
            const label =
              kind === "apiKey"
                ? (() => {
                    const apiKeyCandidateLabel = t(
                      "webAiApiCheck:modal.candidates.apiKey",
                      {
                        index: index + 1,
                      },
                    )
                    return apiKeyCandidateLabel ===
                      "webAiApiCheck:modal.candidates.apiKey"
                      ? `${apiKeyCandidateLabel} ${index + 1}`
                      : apiKeyCandidateLabel
                  })()
                : candidate.value

            return (
              <button
                key={`${kind}-${candidate.value}`}
                type="button"
                data-testid={`${
                  kind === "apiKey"
                    ? WEB_AI_API_CHECK_TEST_IDS.apiKeyCandidatePrefix
                    : WEB_AI_API_CHECK_TEST_IDS.baseUrlCandidatePrefix
                }-${index}`}
                className={cn(
                  "max-w-full truncate rounded-md border px-2 py-1 text-xs sm:max-w-64",
                  currentValue === candidate.value
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
                title={kind === "baseUrl" ? candidate.value : undefined}
                onClick={() => onSelect(candidate.value)}
              >
                {label}
              </button>
            )
          })}
        </div>
      )
    },
    [t],
  )

  const fetchModels = useCallback(
    async (origin: "auto" | "manual") => {
      setFetchModelsError(null)
      if (origin === "manual") setValidationError(null)

      if (!modelListSupported) return

      const tracker = startProductAnalyticsAction({
        ...contentApiCheckAnalyticsScope,
        actionId:
          origin === "auto"
            ? PRODUCT_ANALYTICS_ACTION_IDS.AutoFetchApiCredentialModelList
            : PRODUCT_ANALYTICS_ACTION_IDS.FetchApiCredentialModelList,
      })
      const sourceKind =
        origin === "auto"
          ? PRODUCT_ANALYTICS_SOURCE_KINDS.Auto
          : PRODUCT_ANALYTICS_SOURCE_KINDS.Manual

      const trimmedBaseUrl = baseUrl.trim()
      const trimmedApiKey = apiKey.trim()
      if (!trimmedBaseUrl || !trimmedApiKey) {
        if (origin === "manual") {
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

      const requestId = (fetchModelsRequestIdRef.current += 1)
      const fetchKey = `${apiType}::${trimmedBaseUrl}::${trimmedApiKey}`
      if (origin === "manual") {
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
    [apiKey, apiType, baseUrl, modelId, modelListSupported, t],
  )

  const handleFetchModels = async () => {
    await fetchModels("manual")
  }

  const modelIdsOptions = useMemo(
    () => modelIds.map((id) => ({ value: id, label: id })),
    [modelIds],
  )

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
    if (lastAutoFetchKeyRef.current === fetchKey) return
    if (isFetchingModels) return

    const timeoutId = window.setTimeout(() => {
      // Double-check inside timer to avoid firing after state has moved on.
      if (!isOpen) return
      if (lastAutoFetchKeyRef.current === fetchKey) return
      if (isFetchingModels) return
      lastAutoFetchKeyRef.current = fetchKey
      void fetchModels("auto")
    }, MODEL_AUTO_FETCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    apiKey,
    apiType,
    baseUrl,
    fetchModels,
    isFetchingModels,
    isOpen,
    modelListSupported,
  ])

  const runProbe = async (
    probeId: ApiVerificationProbeId,
    options: {
      trackIndividual?: boolean
      runId?: string
      shouldIgnoreResult?: () => boolean
    } = {},
  ): Promise<ApiCheckProbeResultWithAnalyticsCategory | null> => {
    const shouldTrack = options.trackIndividual !== false
    const tracker = shouldTrack
      ? startProductAnalyticsAction({
          ...contentApiCheckAnalyticsScope,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunApiCredentialProbe,
        })
      : null

    setValidationError(null)

    const trimmedBaseUrl = baseUrl.trim()
    const trimmedApiKey = apiKey.trim()

    if (!trimmedBaseUrl || !trimmedApiKey) {
      setValidationError(t("webAiApiCheck:modal.errors.missingBaseUrlOrKey"))
      tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        insights: buildApiCheckAnalyticsInsights(apiType, trigger, {
          mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
        }),
      })
      return null
    }

    setProbes((prev) =>
      prev.map((probe) =>
        probe.id === probeId
          ? {
              ...probe,
              isRunning: true,
              attempts: probe.attempts + 1,
            }
          : probe,
      ),
    )

    const runId = options.runId ?? safeRandomUUID(`web-ai-api-check-${probeId}`)
    try {
      activeProbeRunIdsRef.current.set(probeId, runId)
      if (tracker) {
        activeProbeTrackersRef.current.set(probeId, tracker)
      }
      const response = await sendWebAiApiCheckMessage(
        WebAiApiCheckMessageTypes.RunProbe,
        {
          runId,
          apiType,
          baseUrl: trimmedBaseUrl,
          apiKey: trimmedApiKey,
          modelId: modelId.trim() || undefined,
          probeId,
        },
      )

      if (response.success && response.result) {
        const result =
          response.result as ApiCheckProbeResultWithAnalyticsCategory
        if (
          cancelledProbeRunIdsRef.current.has(runId) ||
          options.shouldIgnoreResult?.()
        ) {
          setProbes((prev) =>
            activeProbeRunIdsRef.current.get(probeId) === runId
              ? markProbeNotRunning(prev, probeId)
              : prev,
          )
          return null
        }
        setProbes((prev) =>
          prev.map((probe) =>
            probe.id === probeId
              ? { ...probe, isRunning: false, result }
              : probe,
          ),
        )
        const analyticsResult = getProbeAnalyticsResult(result)
        tracker?.complete(analyticsResult, {
          ...(analyticsResult === PRODUCT_ANALYTICS_RESULTS.Failure
            ? {
                errorCategory:
                  resolveProductAnalyticsErrorCategoryFromProbeResult(result),
              }
            : {}),
          insights: buildApiCheckAnalyticsInsights(apiType, trigger, {
            mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
          }),
        })
        return result
      }

      const failedResponse = response.success ? undefined : response
      const message =
        failedResponse?.error || t("webAiApiCheck:modal.errors.runProbeFailed")

      const fallback: ApiCheckProbeResultWithAnalyticsCategory = {
        id: probeId,
        status: "fail",
        latencyMs: 0,
        summary: message,
        analyticsErrorCategory: failedResponse?.errorCategory,
        input: {
          apiType,
          baseUrl: trimmedBaseUrl,
        },
      }

      if (
        cancelledProbeRunIdsRef.current.has(runId) ||
        options.shouldIgnoreResult?.()
      ) {
        setProbes((prev) =>
          activeProbeRunIdsRef.current.get(probeId) === runId
            ? markProbeNotRunning(prev, probeId)
            : prev,
        )
        return null
      }

      setProbes((prev) =>
        prev.map((probe) =>
          probe.id === probeId
            ? { ...probe, isRunning: false, result: fallback }
            : probe,
        ),
      )
      tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory:
          failedResponse?.errorCategory ??
          PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: buildApiCheckAnalyticsInsights(apiType, trigger, {
          mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
        }),
      })
      return fallback
    } catch (error) {
      const errorCategory = resolveProductAnalyticsErrorCategoryFromError(error)
      const fallback: ApiCheckProbeResultWithAnalyticsCategory = {
        id: probeId,
        status: "fail",
        latencyMs: 0,
        summary: t("webAiApiCheck:modal.errors.runProbeFailed"),
        analyticsErrorCategory: errorCategory,
        input: {
          apiType,
          baseUrl: trimmedBaseUrl,
        },
      }
      if (
        cancelledProbeRunIdsRef.current.has(runId) ||
        options.shouldIgnoreResult?.()
      ) {
        setProbes((prev) =>
          activeProbeRunIdsRef.current.get(probeId) === runId
            ? markProbeNotRunning(prev, probeId)
            : prev,
        )
        return null
      }
      setProbes((prev) =>
        prev.map((probe) =>
          probe.id === probeId
            ? {
                ...probe,
                isRunning: false,
                result: fallback,
              }
            : probe,
        ),
      )
      tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory,
        insights: buildApiCheckAnalyticsInsights(apiType, trigger, {
          mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
        }),
      })
      return fallback
    } finally {
      if (activeProbeRunIdsRef.current.get(probeId) === runId) {
        activeProbeRunIdsRef.current.delete(probeId)
      }
      if (activeProbeTrackersRef.current.get(probeId) === tracker) {
        activeProbeTrackersRef.current.delete(probeId)
      }
      cancelledProbeRunIdsRef.current.delete(runId)
    }
  }

  const stopProbe = (probeId: ApiVerificationProbeId) => {
    const activeRunId = activeProbeRunIdsRef.current.get(probeId)
    if (!activeRunId) return

    void sendWebAiApiCheckMessage(WebAiApiCheckMessageTypes.CancelRunProbe, {
      runId: activeRunId,
    }).catch(() => {})
    cancelledProbeRunIdsRef.current.add(activeRunId)

    activeProbeTrackersRef.current
      .get(probeId)
      ?.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
        insights: buildApiCheckAnalyticsInsights(apiType, trigger, {
          mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
          failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.CancelledByUser,
        }),
      })
    activeProbeTrackersRef.current.delete(probeId)

    setProbes((prev) => markProbeNotRunning(prev, probeId))
  }

  const stopRunAll = () => {
    if (shouldStopRunAllRef.current) return
    shouldStopRunAllRef.current = true
    setIsStoppingRunAll(true)
    setTestStoppedMessage(t("webAiApiCheck:modal.messages.stoppingTest"))

    const activeRunAllProbeId = activeRunAllProbeIdRef.current
    const activeRunId = activeRunAllProbeId
      ? activeProbeRunIdsRef.current.get(activeRunAllProbeId)
      : undefined
    if (activeRunId) {
      void sendWebAiApiCheckMessage(WebAiApiCheckMessageTypes.CancelRunProbe, {
        runId: activeRunId,
      }).catch(() => {})
    }
  }

  const runAll = async () => {
    const tracker = startProductAnalyticsAction({
      ...contentApiCheckAnalyticsScope,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunApiCredentialProbeSuite,
    })

    const trimmedBaseUrl = baseUrl.trim()
    const trimmedApiKey = apiKey.trim()
    if (!trimmedBaseUrl || !trimmedApiKey) {
      setValidationError(t("webAiApiCheck:modal.errors.missingBaseUrlOrKey"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        insights: buildApiCheckAnalyticsInsights(apiType, trigger, {
          mode: PRODUCT_ANALYTICS_MODE_IDS.All,
          itemCount: probeDefinitions.length,
          successCount: 0,
          failureCount: 0,
          skippedCount: probeDefinitions.length,
        }),
      })
      return
    }

    shouldStopRunAllRef.current = false
    setIsStoppingRunAll(false)
    setTestStoppedMessage(null)
    setIsRunningAll(true)
    const results: ApiCheckProbeResultWithAnalyticsCategory[] = []
    try {
      for (const def of probeDefinitions) {
        if (shouldStopRunAllRef.current) break
        // Run sequentially so the UI updates progressively and we avoid bursty network traffic.
        const runId = safeRandomUUID(`web-ai-api-check-${def.id}`)
        activeRunAllProbeIdRef.current = def.id
        const result = await runProbe(def.id, {
          trackIndividual: false,
          runId,
          shouldIgnoreResult: () => shouldStopRunAllRef.current,
        })
        if (!shouldStopRunAllRef.current && result) results.push(result)
        if (shouldStopRunAllRef.current) break
      }

      if (shouldStopRunAllRef.current) {
        const successCount = results.filter(
          (result) => result.status === "pass",
        ).length
        const failureCount = results.filter(
          (result) => result.status === "fail",
        ).length
        const skippedCount = Math.max(
          probeDefinitions.length - successCount - failureCount,
          0,
        )

        setProbes((prev) =>
          prev.map((probe) =>
            probe.isRunning ? { ...probe, isRunning: false } : probe,
          ),
        )
        setTestStoppedMessage(t("webAiApiCheck:modal.messages.testStopped"))
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
          insights: buildApiCheckAnalyticsInsights(apiType, trigger, {
            mode: PRODUCT_ANALYTICS_MODE_IDS.All,
            itemCount: probeDefinitions.length,
            successCount,
            failureCount,
            skippedCount,
            failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.CancelledByUser,
          }),
        })
        return
      }

      const successCount = results.filter(
        (result) => result.status === "pass",
      ).length
      const failureCount = results.filter(
        (result) => result.status === "fail",
      ).length
      const skippedCount = results.filter(
        (result) => result.status === "unsupported",
      ).length
      const analyticsResult =
        failureCount > 0
          ? PRODUCT_ANALYTICS_RESULTS.Failure
          : successCount > 0
            ? PRODUCT_ANALYTICS_RESULTS.Success
            : PRODUCT_ANALYTICS_RESULTS.Skipped

      tracker.complete(analyticsResult, {
        ...(analyticsResult === PRODUCT_ANALYTICS_RESULTS.Failure
          ? {
              errorCategory:
                results.find((result) => result.status === "fail")
                  ?.analyticsErrorCategory ??
                resolveProductAnalyticsErrorCategoryFromProbeResult(
                  results.find((result) => result.status === "fail"),
                ),
            }
          : {}),
        insights: buildApiCheckAnalyticsInsights(apiType, trigger, {
          mode: PRODUCT_ANALYTICS_MODE_IDS.All,
          itemCount: results.length || probeDefinitions.length,
          successCount,
          failureCount,
          skippedCount,
        }),
      })
    } finally {
      setIsRunningAll(false)
      setIsStoppingRunAll(false)
      shouldStopRunAllRef.current = false
      activeRunAllProbeIdRef.current = null
    }
  }

  const canSaveProfile = !!baseUrl.trim() && !!apiKey.trim() && !isSavingProfile

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

    setIsSavingProfile(true)
    try {
      const response = await sendWebAiApiCheckMessage(
        WebAiApiCheckMessageTypes.SaveProfile,
        {
          apiType,
          baseUrl: trimmedBaseUrl,
          apiKey: trimmedApiKey,
          pageUrl: pageUrl || window.location.href,
        },
      )

      if (response?.success) {
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

  if (!isOpen) return null

  return (
    <div
      data-testid={WEB_AI_API_CHECK_TEST_IDS.modal}
      className="pointer-events-none fixed inset-0 z-2147483647"
    >
      <div
        ref={popoverPortalContainerRef}
        data-slot="api-check-portal-container"
        className="pointer-events-auto"
      />
      <div
        ref={backdropRef}
        data-testid={WEB_AI_API_CHECK_TEST_IDS.backdrop}
        className="pointer-events-auto absolute inset-0 bg-black/40"
        onClick={() => {
          if (isRunningAll || isAnyProbeRunning) return
          close()
        }}
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="api-check-modal-title"
          tabIndex={-1}
          className="border-border bg-background pointer-events-auto max-h-[90vh] w-full max-w-[860px] overflow-hidden rounded-lg border shadow-xl"
          onKeyDown={stopHostPageKeyboardShortcuts}
          onKeyUp={stopHostPageKeyboardShortcuts}
        >
          <div className="border-border flex items-start justify-between gap-3 border-b p-4">
            <div className="min-w-0">
              <div
                id="api-check-modal-title"
                className="text-foreground text-base font-semibold"
              >
                {t("webAiApiCheck:modal.title")}
              </div>
              <div className="text-muted-foreground truncate text-xs">
                {t("webAiApiCheck:modal.privacyHint")}
              </div>
            </div>
            <IconButton
              aria-label={t("common:actions.close")}
              variant="ghost"
              size="sm"
              onClick={close}
              disabled={isRunningAll || isAnyProbeRunning}
            >
              <XMarkIcon className="h-4 w-4" />
            </IconButton>
          </div>

          <div
            ref={scrollContainerRef}
            className="max-h-[calc(90vh-64px)] overflow-y-auto overscroll-contain p-4"
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-foreground text-sm font-medium">
                  {t("webAiApiCheck:modal.sourceText.label")}
                </div>
                <Textarea
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  rows={4}
                  placeholder={t("webAiApiCheck:modal.sourceText.placeholder")}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="text-muted-foreground text-xs">
                    {t("webAiApiCheck:modal.fields.baseUrl")}
                  </div>
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://example.com/api"
                  />
                  {renderCandidateButtons(
                    "baseUrl",
                    extractionMetadata?.candidates.baseUrls ?? [],
                    baseUrl,
                    setBaseUrl,
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="text-muted-foreground text-xs">
                    {t("webAiApiCheck:modal.fields.apiKey")}
                  </div>
                  <Input
                    type="password"
                    revealable
                    revealed={apiKeyVisible}
                    onRevealedChange={setApiKeyVisible}
                    revealLabels={{
                      show: t("webAiApiCheck:modal.actions.showKey"),
                      hide: t("webAiApiCheck:modal.actions.hideKey"),
                    }}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                  />
                  {renderCandidateButtons(
                    "apiKey",
                    extractionMetadata?.candidates.apiKeys ?? [],
                    apiKey,
                    setApiKey,
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="text-muted-foreground text-xs">
                    {t("webAiApiCheck:modal.fields.apiType")}
                  </div>
                  <select
                    className={cn(inputVariants({}), "dark:bg-input/30 h-9")}
                    value={apiType}
                    onChange={(e) =>
                      setApiType(e.target.value as ApiVerificationApiType)
                    }
                    disabled={isRunningAll}
                  >
                    {apiTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="text-muted-foreground text-xs">
                    {t("webAiApiCheck:modal.fields.modelId")}
                  </div>

                  <SearchableSelect
                    aria-label={t("webAiApiCheck:modal.fields.modelId")}
                    data-testid={WEB_AI_API_CHECK_TEST_IDS.modelId}
                    options={modelIdsOptions}
                    value={modelId}
                    onChange={setModelId}
                    portalContainer={popoverPortalContainer ?? undefined}
                    placeholder={
                      isFetchingModels
                        ? t("webAiApiCheck:modal.actions.fetchingModels")
                        : "gpt-4o-mini"
                    }
                    allowCustomValue
                  />
                </div>
              </div>

              {validationError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
                  {validationError}
                </div>
              ) : null}

              {!hasAnyResult ? (
                <div className="text-muted-foreground text-xs">
                  {t("webAiApiCheck:modal.hints.saveWithoutTest")}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-2">
                {modelListSupported ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleFetchModels}
                    disabled={isFetchingModels || isRunningAll}
                  >
                    {isFetchingModels
                      ? t("webAiApiCheck:modal.actions.fetchingModels")
                      : t("webAiApiCheck:modal.actions.fetchModels")}
                  </Button>
                ) : null}

                <Button
                  type="button"
                  variant={isRunningAll ? "outline" : "default"}
                  onClick={isRunningAll ? stopRunAll : runAll}
                  disabled={
                    isStoppingRunAll ||
                    (!isRunningAll && (isFetchingModels || isAnyProbeRunning))
                  }
                >
                  {isRunningAll
                    ? isStoppingRunAll
                      ? t("webAiApiCheck:modal.actions.stopping")
                      : t("webAiApiCheck:modal.actions.stopTest")
                    : t("webAiApiCheck:modal.actions.test")}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  data-testid={WEB_AI_API_CHECK_TEST_IDS.saveToProfilesButton}
                  onClick={handleSaveProfile}
                  disabled={!canSaveProfile}
                >
                  {isSavingProfile
                    ? t("webAiApiCheck:modal.actions.saving")
                    : t("webAiApiCheck:modal.actions.saveToProfiles")}
                </Button>
              </div>

              {fetchModelsError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
                  {fetchModelsError}
                </div>
              ) : null}

              {testStoppedMessage ? (
                <Notice tone="warning" description={testStoppedMessage} />
              ) : null}

              <div className="space-y-2">
                {probes.map((probe) => {
                  const result = probe.result

                  const summary = result?.summaryKey
                    ? translateApiVerificationSummary(
                        t,
                        result.summaryKey,
                        result.summaryParams,
                      ) ?? result.summary
                    : result?.summary

                  const notRunYet = t("webAiApiCheck:modal.probes.notRunYet")

                  return (
                    <div
                      key={probe.id}
                      data-testid={getWebAiApiCheckProbeTestId(probe.id)}
                      className="border-border rounded-md border p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-foreground min-w-0 truncate text-sm font-medium">
                              {getApiVerificationProbeLabel(t, probe.id)}
                            </div>
                            {result ? (
                              <ProbeStatusBadge result={result} />
                            ) : null}
                            <div className="text-muted-foreground text-xs">
                              {result
                                ? `${Math.round(result.latencyMs)}ms`
                                : " "}
                            </div>
                          </div>
                          <div className="text-muted-foreground mt-1 text-xs">
                            {result ? summary : notRunYet}
                          </div>
                        </div>

                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            probe.isRunning
                              ? stopProbe(probe.id)
                              : runProbe(probe.id)
                          }
                          disabled={
                            isRunningAll ||
                            (!probe.isRunning && isFetchingModels)
                          }
                        >
                          {probe.isRunning
                            ? isRunningAll
                              ? t("webAiApiCheck:modal.actions.running")
                              : t("webAiApiCheck:modal.actions.stopTest")
                            : probe.attempts > 0
                              ? t("webAiApiCheck:modal.actions.retry")
                              : t("webAiApiCheck:modal.actions.runOne")}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
