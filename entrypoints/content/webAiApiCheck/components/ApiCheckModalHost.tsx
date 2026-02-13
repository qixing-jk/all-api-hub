import { EyeIcon, EyeSlashIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Button,
  IconButton,
  Input,
  SearchableSelect,
  Textarea,
} from "~/components/ui"
import { inputVariants } from "~/components/ui/input"
import { ProbeStatusBadge } from "~/components/VerifyApiDialog/ProbeStatusBadge"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { cn } from "~/lib/utils"
import {
  API_TYPES,
  getApiVerificationProbeDefinitions,
  type ApiVerificationApiType,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "~/services/aiApiVerification"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { extractApiCheckCredentialsFromText } from "~/utils/webAiApiCheck"

import {
  API_CHECK_OPEN_MODAL_EVENT,
  dispatchApiCheckModalClosed,
  dispatchApiCheckModalHostReady,
  type ApiCheckOpenModalDetail,
} from "../events"

type ProbeItemState = {
  id: ApiVerificationProbeId
  requiresModelId: boolean
  isRunning: boolean
  attempts: number
  result: ApiVerificationProbeResult | null
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
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
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
  const fetchModelsRequestIdRef = useRef(0)
  const hasSignaledHostReadyRef = useRef(false)

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

  const [probes, setProbes] = useState<ProbeItemState[]>([])
  const [isRunningAll, setIsRunningAll] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const probeDefinitions = useMemo(
    () => getApiVerificationProbeDefinitions(apiType),
    [apiType],
  )

  const hasAnyResult = useMemo(
    () => probes.some((probe) => probe.result !== null),
    [probes],
  )

  const hasFetchedModels = modelIds.length > 0

  const modelListSupported =
    apiType === API_TYPES.OPENAI_COMPATIBLE ||
    apiType === API_TYPES.OPENAI ||
    apiType === API_TYPES.ANTHROPIC ||
    apiType === API_TYPES.GOOGLE

  const resetProbeState = (nextApiType: ApiVerificationApiType) => {
    const defs = getApiVerificationProbeDefinitions(nextApiType)
    setProbes(
      defs.map(
        (def): ProbeItemState => ({
          id: def.id,
          requiresModelId: def.requiresModelId,
          isRunning: false,
          attempts: 0,
          result: null,
        }),
      ),
    )
  }

  useEffect(() => {
    resetProbeState(apiType)
    // Reset model list UI when apiType changes.
    setModelIds([])
    setFetchModelsError(null)
    setValidationError(null)
  }, [apiType])

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
      setSourceText(nextSourceText)

      const extracted = extractApiCheckCredentialsFromText(nextSourceText)
      setBaseUrl(extracted.baseUrl ?? "")
      setApiKey(extracted.apiKey ?? "")

      setApiKeyVisible(false)
      setModelId("")
      setModelIds([])
      setFetchModelsError(null)
      setValidationError(null)
      resetProbeState(apiType)

      setIsOpen(true)
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
    dispatchApiCheckModalClosed({
      pageUrl: pageUrl || window.location.href,
      trigger,
      reason,
    })
    lastAutoFetchKeyRef.current = null
    setIsOpen(false)
  }

  // Keep baseUrl + apiKey in sync with the source text so users don't need
  // a manual "Re-extract" action after editing/pasting into the textarea.
  useEffect(() => {
    if (!isOpen) return
    const extracted = extractApiCheckCredentialsFromText(sourceText)
    if (extracted.baseUrl) setBaseUrl(extracted.baseUrl)
    if (extracted.apiKey) setApiKey(extracted.apiKey)
  }, [isOpen, sourceText])

  const fetchModels = useCallback(
    async (origin: "auto" | "manual") => {
      setFetchModelsError(null)
      if (origin === "manual") setValidationError(null)

      if (!modelListSupported) return

      const trimmedBaseUrl = baseUrl.trim()
      const trimmedApiKey = apiKey.trim()
      if (!trimmedBaseUrl || !trimmedApiKey) {
        if (origin === "manual") {
          setValidationError(
            t("webAiApiCheck:modal.errors.missingBaseUrlOrKey"),
          )
        }
        return
      }

      const requestId = (fetchModelsRequestIdRef.current += 1)
      setIsFetchingModels(true)
      try {
        const response: any = await sendRuntimeMessage({
          action: RuntimeActionIds.ApiCheckFetchModels,
          apiType,
          baseUrl: trimmedBaseUrl,
          apiKey: trimmedApiKey,
        })

        // Ignore stale responses when a newer request is already in-flight.
        if (fetchModelsRequestIdRef.current !== requestId) return

        if (response?.success) {
          const ids = Array.isArray(response.modelIds) ? response.modelIds : []
          setModelIds(ids)
          if (!modelId.trim() && ids.length > 0) {
            // Provide a helpful default to reduce friction.
            setModelId(ids[0] ?? "")
          }
        } else {
          setFetchModelsError(
            response?.error ||
              t("webAiApiCheck:modal.errors.fetchModelsFailed"),
          )
        }
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
    setModelIds([])
    setFetchModelsError(null)
  }, [apiType, baseUrl, apiKey, isOpen])

  // Auto-fetch model list for supported APIs once we have credentials.
  useEffect(() => {
    if (!isOpen) return
    if (!modelListSupported) return
    if (isFetchingModels) return

    const trimmedBaseUrl = baseUrl.trim()
    const trimmedApiKey = apiKey.trim()
    if (!trimmedBaseUrl || !trimmedApiKey) return

    const fetchKey = `${apiType}::${trimmedBaseUrl}::${trimmedApiKey}`
    if (lastAutoFetchKeyRef.current === fetchKey) return

    const timeoutId = window.setTimeout(() => {
      // Double-check inside timer to avoid firing after state has moved on.
      if (!isOpen) return
      if (lastAutoFetchKeyRef.current === fetchKey) return
      lastAutoFetchKeyRef.current = fetchKey
      void fetchModels("auto")
    }, 300)

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

  const runProbe = async (probeId: ApiVerificationProbeId) => {
    setValidationError(null)

    const trimmedBaseUrl = baseUrl.trim()
    const trimmedApiKey = apiKey.trim()

    if (!trimmedBaseUrl || !trimmedApiKey) {
      setValidationError(t("webAiApiCheck:modal.errors.missingBaseUrlOrKey"))
      return
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

    try {
      const response: any = await sendRuntimeMessage({
        action: RuntimeActionIds.ApiCheckRunProbe,
        apiType,
        baseUrl: trimmedBaseUrl,
        apiKey: trimmedApiKey,
        modelId: modelId.trim() || undefined,
        probeId,
      })

      const result = response?.result as ApiVerificationProbeResult | undefined
      if (response?.success && result) {
        setProbes((prev) =>
          prev.map((probe) =>
            probe.id === probeId
              ? { ...probe, isRunning: false, result }
              : probe,
          ),
        )
        return
      }

      const message =
        response?.error || t("webAiApiCheck:modal.errors.runProbeFailed")

      const fallback: ApiVerificationProbeResult = {
        id: probeId,
        status: "fail",
        latencyMs: 0,
        summary: message,
        input: {
          apiType,
          baseUrl: trimmedBaseUrl,
        },
      }

      setProbes((prev) =>
        prev.map((probe) =>
          probe.id === probeId
            ? { ...probe, isRunning: false, result: fallback }
            : probe,
        ),
      )
    } catch {
      setProbes((prev) =>
        prev.map((probe) =>
          probe.id === probeId
            ? {
                ...probe,
                isRunning: false,
                result: {
                  id: probeId,
                  status: "fail",
                  latencyMs: 0,
                  summary: t("webAiApiCheck:modal.errors.runProbeFailed"),
                  input: {
                    apiType,
                    baseUrl: trimmedBaseUrl,
                  },
                },
              }
            : probe,
        ),
      )
    }
  }

  const runAll = async () => {
    setIsRunningAll(true)
    try {
      for (const def of probeDefinitions) {
        // Run sequentially so the UI updates progressively and we avoid bursty network traffic.
        await runProbe(def.id)
      }
    } finally {
      setIsRunningAll(false)
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
      data-testid="api-check-modal"
      className="pointer-events-none fixed inset-0 z-2147483647"
    >
      <div
        ref={popoverPortalContainerRef}
        data-slot="api-check-portal-container"
        className="pointer-events-auto"
      />
      <div
        className="pointer-events-auto absolute inset-0 bg-black/40"
        onClick={close}
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3">
        <div className="border-border bg-background pointer-events-auto max-h-[90vh] w-full max-w-[860px] overflow-hidden rounded-lg border shadow-xl">
          <div className="border-border flex items-start justify-between gap-3 border-b p-4">
            <div className="min-w-0">
              <div className="text-foreground text-base font-semibold">
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
              disabled={isRunningAll || probes.some((p) => p.isRunning)}
            >
              <XMarkIcon className="h-4 w-4" />
            </IconButton>
          </div>

          <div className="max-h-[calc(90vh-64px)] overflow-y-auto p-4">
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
                </div>

                <div className="space-y-1.5">
                  <div className="text-muted-foreground text-xs">
                    {t("webAiApiCheck:modal.fields.apiKey")}
                  </div>
                  <Input
                    type={apiKeyVisible ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    rightIcon={
                      <IconButton
                        variant="ghost"
                        size="sm"
                        onClick={() => setApiKeyVisible((prev) => !prev)}
                        aria-label={
                          apiKeyVisible
                            ? t("webAiApiCheck:modal.actions.hideKey")
                            : t("webAiApiCheck:modal.actions.showKey")
                        }
                      >
                        {apiKeyVisible ? (
                          <EyeSlashIcon className="h-4 w-4" />
                        ) : (
                          <EyeIcon className="h-4 w-4" />
                        )}
                      </IconButton>
                    }
                  />
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
                    data-testid="api-check-model-id"
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
                  onClick={runAll}
                  disabled={
                    isRunningAll ||
                    isFetchingModels ||
                    probes.some((p) => p.isRunning)
                  }
                >
                  {isRunningAll
                    ? t("webAiApiCheck:modal.actions.testing")
                    : t("webAiApiCheck:modal.actions.test")}
                </Button>
              </div>

              {fetchModelsError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
                  {fetchModelsError}
                </div>
              ) : null}

              <div className="space-y-2">
                {probes.map((probe) => {
                  const result = probe.result
                  const nameKey = `verifyDialog.probes.${probe.id}` as const

                  const summary = result?.summaryKey
                    ? t(
                        `aiApiVerification:${result.summaryKey}` as any,
                        result.summaryParams,
                      )
                    : result?.summary

                  const notRunYet = t("webAiApiCheck:modal.probes.notRunYet")

                  return (
                    <div
                      key={probe.id}
                      data-testid={`api-check-probe-${probe.id}`}
                      className="border-border rounded-md border p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-foreground min-w-0 truncate text-sm font-medium">
                              {t(`aiApiVerification:${nameKey}`)}
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
                          onClick={() => runProbe(probe.id)}
                          disabled={
                            isRunningAll || isFetchingModels || probe.isRunning
                          }
                        >
                          {probe.isRunning
                            ? t("webAiApiCheck:modal.actions.running")
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
