import type { TFunction } from "i18next"
import { useCallback, useMemo, useRef, useState } from "react"

import {
  resolveProductAnalyticsErrorCategoryFromError,
  startProductAnalyticsAction,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  type ProductAnalyticsErrorCategory,
} from "~/services/productAnalytics/contracts"
import { resolveProductAnalyticsErrorCategoryFromProbeResult } from "~/services/productAnalytics/verification"
import {
  getApiVerificationProbeDefinitions,
  type ApiVerificationApiType,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import { safeRandomUUID } from "~/utils/core/identifier"

import type { ApiCheckOpenModalDetail } from "../events"
import {
  buildApiCheckAnalyticsInsights,
  contentApiCheckAnalyticsScope,
  getProbeAnalyticsResult,
} from "./apiCheckModalAnalytics"
import type { ProbeItemState } from "./apiCheckModalTypes"

type ApiCheckProbeResultWithAnalyticsCategory = ApiVerificationProbeResult & {
  analyticsErrorCategory?: ProductAnalyticsErrorCategory
}

type UseApiCheckProbeRunnerOptions = {
  t: TFunction<["webAiApiCheck", "common", "aiApiVerification"]>
  apiType: ApiVerificationApiType
  trigger: ApiCheckOpenModalDetail["trigger"]
  baseUrl: string
  apiKey: string
  modelId: string
  setValidationError: (message: string | null) => void
  recordBaseUrlHistory: (baseUrl: string) => void
}

type RunProbeOptions = {
  trackIndividual?: boolean
  recordHistory?: boolean
  runId?: string
  shouldIgnoreResult?: () => boolean
}

interface VerificationResultsSnapshot {
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
  modelId?: string
  results: ApiVerificationProbeResult[]
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
 * Extract completed probe results from the current UI state.
 */
function extractProbeResultsForContext(
  probes: ProbeItemState[],
  resultContextKeys: ReadonlyMap<ApiVerificationProbeId, string>,
  contextKey: string,
): ApiVerificationProbeResult[] {
  return probes
    .filter((probe) => resultContextKeys.get(probe.id) === contextKey)
    .map((probe) => probe.result)
    .filter((result): result is ApiVerificationProbeResult => result !== null)
}

/**
 * Serializes the credential context represented by a probe run.
 */
function createVerificationContextKey(params: {
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
  modelId: string
}) {
  return [
    params.apiType,
    params.baseUrl.trim(),
    params.apiKey.trim(),
    params.modelId.trim(),
  ].join("\n")
}

/**
 * Build the local validation result for probes that cannot run without a model.
 */
function buildMissingModelResult(
  apiType: ApiVerificationApiType,
  baseUrl: string,
  probeId: ApiVerificationProbeId,
): ApiCheckProbeResultWithAnalyticsCategory {
  return {
    id: probeId,
    status: "fail",
    latencyMs: 0,
    summary: "No model id provided",
    summaryKey: "verifyDialog.requiresModelId",
    analyticsErrorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
    input: {
      apiType,
      baseUrl,
    },
  }
}

/**
 * Owns the API verification probe state machine, cancellation, and probe analytics.
 */
export function useApiCheckProbeRunner({
  t,
  apiType,
  trigger,
  baseUrl,
  apiKey,
  modelId,
  setValidationError,
  recordBaseUrlHistory,
}: UseApiCheckProbeRunnerOptions) {
  const [probes, setProbes] = useState<ProbeItemState[]>(() =>
    buildProbeState(apiType),
  )
  const [isRunningAll, setIsRunningAll] = useState(false)
  const [isStoppingRunAll, setIsStoppingRunAll] = useState(false)
  const [testStoppedMessage, setTestStoppedMessage] = useState<string | null>(
    null,
  )
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
  const probeResultContextKeysRef = useRef(
    new Map<ApiVerificationProbeId, string>(),
  )

  const probeDefinitions = useMemo(
    () => getApiVerificationProbeDefinitions(apiType),
    [apiType],
  )

  const hasAnyResult = useMemo(
    () => probes.some((probe) => probe.result !== null),
    [probes],
  )

  const isAnyProbeRunning = probes.some((probe) => probe.isRunning)

  const resetProbeState = useCallback((nextApiType: ApiVerificationApiType) => {
    setProbes(buildProbeState(nextApiType))
    setTestStoppedMessage(null)
    probeResultContextKeysRef.current.clear()
  }, [])

  const updateProbeResult = useCallback(
    (probeId: ApiVerificationProbeId, result: ApiVerificationProbeResult) => {
      probeResultContextKeysRef.current.set(
        probeId,
        createVerificationContextKey({
          apiType,
          baseUrl,
          apiKey,
          modelId,
        }),
      )
      setProbes((prev) =>
        prev.map((probe) =>
          probe.id === probeId ? { ...probe, isRunning: false, result } : probe,
        ),
      )
    },
    [apiKey, apiType, baseUrl, modelId],
  )

  const getCurrentVerificationResultsSnapshot =
    useCallback((): VerificationResultsSnapshot | null => {
      const currentContextKey = createVerificationContextKey({
        apiType,
        baseUrl,
        apiKey,
        modelId,
      })

      const results = extractProbeResultsForContext(
        probes,
        probeResultContextKeysRef.current,
        currentContextKey,
      )
      if (results.length === 0) return null

      const trimmedModelId = modelId.trim()
      return {
        apiType,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        ...(trimmedModelId ? { modelId: trimmedModelId } : {}),
        results,
      }
    }, [apiKey, apiType, baseUrl, modelId, probes])

  const runProbe = useCallback(
    async (
      probeId: ApiVerificationProbeId,
      options: RunProbeOptions = {},
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
      if (options.recordHistory !== false) {
        recordBaseUrlHistory(trimmedBaseUrl)
      }

      const probeDefinition = probeDefinitions.find(
        (definition) => definition.id === probeId,
      )
      if (probeDefinition?.requiresModelId && !modelId.trim()) {
        const fallback = buildMissingModelResult(
          apiType,
          trimmedBaseUrl,
          probeId,
        )
        setValidationError(t("aiApiVerification:verifyDialog.requiresModelId"))
        setProbes((prev) =>
          prev.map((probe) =>
            probe.id === probeId
              ? {
                  ...probe,
                  attempts: probe.attempts + 1,
                  result: fallback,
                }
              : probe,
          ),
        )
        tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          insights: buildApiCheckAnalyticsInsights(apiType, trigger, {
            mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
          }),
        })
        return fallback
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

      const runId =
        options.runId ?? safeRandomUUID(`web-ai-api-check-${probeId}`)
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
          updateProbeResult(probeId, result)
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
          failedResponse?.error ||
          t("webAiApiCheck:modal.errors.runProbeFailed")

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

        updateProbeResult(probeId, fallback)
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
        const errorCategory =
          resolveProductAnalyticsErrorCategoryFromError(error)
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
        updateProbeResult(probeId, fallback)
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
    },
    [
      apiKey,
      apiType,
      baseUrl,
      modelId,
      probeDefinitions,
      recordBaseUrlHistory,
      setValidationError,
      t,
      trigger,
      updateProbeResult,
    ],
  )

  const stopProbe = useCallback(
    (probeId: ApiVerificationProbeId) => {
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
    },
    [apiType, trigger],
  )

  const stopRunAll = useCallback(() => {
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
  }, [t])

  const runAll = useCallback(async () => {
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
    recordBaseUrlHistory(trimmedBaseUrl)

    shouldStopRunAllRef.current = false
    setIsStoppingRunAll(false)
    setTestStoppedMessage(null)
    setIsRunningAll(true)
    const results: ApiCheckProbeResultWithAnalyticsCategory[] = []
    try {
      for (const def of probeDefinitions) {
        if (shouldStopRunAllRef.current) break
        if (def.requiresModelId && !modelId.trim()) {
          const fallback = buildMissingModelResult(
            apiType,
            trimmedBaseUrl,
            def.id,
          )
          setValidationError(
            t("aiApiVerification:verifyDialog.requiresModelId"),
          )
          setProbes((prev) =>
            prev.map((probe) =>
              probe.id === def.id
                ? {
                    ...probe,
                    attempts: probe.attempts + 1,
                    result: fallback,
                  }
                : probe,
            ),
          )
          results.push(fallback)
          continue
        }
        // Run sequentially so the UI updates progressively and we avoid bursty network traffic.
        const runId = safeRandomUUID(`web-ai-api-check-${def.id}`)
        activeRunAllProbeIdRef.current = def.id
        const result = await runProbe(def.id, {
          trackIndividual: false,
          recordHistory: false,
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
  }, [
    apiKey,
    apiType,
    baseUrl,
    modelId,
    probeDefinitions,
    recordBaseUrlHistory,
    runProbe,
    setValidationError,
    t,
    trigger,
  ])

  return {
    probes,
    isRunningAll,
    isStoppingRunAll,
    testStoppedMessage,
    hasAnyResult,
    isAnyProbeRunning,
    getCurrentVerificationResultsSnapshot,
    resetProbeState,
    runProbe: (probeId: ApiVerificationProbeId) => {
      void runProbe(probeId)
    },
    stopProbe,
    runAll: () => {
      void runAll()
    },
    stopRunAll,
  }
}
