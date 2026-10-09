import type { TFunction } from "i18next"
import { useCallback, useEffect, useMemo, useState } from "react"

import type { ApiCheckOpenModalDetail } from "~/features/WebAiApiCheck/content/events"
import {
  buildApiCheckAnalyticsInsights,
  contentApiCheckAnalyticsScope,
  getProbeAnalyticsResult,
} from "~/features/WebAiApiCheck/content/modal/apiCheckModalAnalytics"
import type {
  ApiCheckValidationError,
  ProbeItemState,
} from "~/features/WebAiApiCheck/content/modal/apiCheckModalTypes"
import { createApiCheckProbeSession } from "~/features/WebAiApiCheck/content/probes/apiCheckProbeSession"
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
import { resolveProductAnalyticsErrorCategoryFromProbeResult } from "~/services/productAnalytics/facts/verification"
import {
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
  getApiVerificationProbeDefinitions,
  type ApiVerificationApiType,
  type ApiVerificationMode,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import { safeRandomUUID } from "~/utils/core/identifier"

type ApiCheckProbeResultWithAnalyticsCategory = ApiVerificationProbeResult & {
  analyticsErrorCategory?: ProductAnalyticsErrorCategory
}

type UseApiCheckProbeRunnerOptions = {
  t: TFunction<["webAiApiCheck", "common", "aiApiVerification"]>
  apiType: ApiVerificationApiType
  verificationMode: ApiVerificationMode
  trigger: ApiCheckOpenModalDetail["trigger"]
  baseUrl: string
  apiKey: string
  modelId: string
  setValidationError: (error: ApiCheckValidationError | null) => void
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
 * Build the local validation result for probes that cannot run without a model.
 */
function buildMissingModelResult(
  apiType: ApiVerificationApiType,
  baseUrl: string,
  probeId: ApiVerificationProbeId,
  mode: ApiVerificationMode,
): ApiCheckProbeResultWithAnalyticsCategory {
  return {
    id: probeId,
    mode,
    status: API_VERIFICATION_PROBE_STATUSES.Fail,
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
  verificationMode,
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
  const [testStopPhase, setTestStopPhase] = useState<
    "stopping" | "stopped" | null
  >(null)
  const testStoppedMessage =
    testStopPhase === "stopping"
      ? t("webAiApiCheck:modal.messages.stoppingTest")
      : testStopPhase === "stopped"
        ? t("webAiApiCheck:modal.messages.testStopped")
        : null
  const [session] = useState(() =>
    createApiCheckProbeSession({
      cancelRun: (runId) =>
        sendWebAiApiCheckMessage(WebAiApiCheckMessageTypes.CancelRunProbe, {
          runId,
        }),
    }),
  )
  useEffect(() => () => session.reset(), [session])

  const probeDefinitions = useMemo(
    () => getApiVerificationProbeDefinitions(apiType),
    [apiType],
  )

  const hasAnyResult = useMemo(
    () => probes.some((probe) => probe.result !== null),
    [probes],
  )

  const isAnyProbeRunning = probes.some((probe) => probe.isRunning)

  const resetProbeState = useCallback(
    (nextApiType: ApiVerificationApiType) => {
      session.reset()
      setProbes(buildProbeState(nextApiType))
      setTestStopPhase(null)
      setIsRunningAll(false)
      setIsStoppingRunAll(false)
    },
    [session],
  )

  const updateProbeResult = useCallback(
    (
      probeId: ApiVerificationProbeId,
      result: ApiVerificationProbeResult,
      acceptResult: (result: ApiVerificationProbeResult) => boolean,
    ) => {
      if (!acceptResult(result)) return false
      setProbes((prev) =>
        prev.map((probe) =>
          probe.id === probeId ? { ...probe, isRunning: false, result } : probe,
        ),
      )
      return true
    },
    [],
  )

  const getCurrentVerificationResultsSnapshot =
    useCallback((): VerificationResultsSnapshot | null => {
      const results = session.resultsForContext({
        apiType,
        baseUrl,
        apiKey,
        modelId,
      })
      if (results.length === 0) return null

      const trimmedModelId = modelId.trim()
      return {
        apiType,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        ...(trimmedModelId ? { modelId: trimmedModelId } : {}),
        results,
      }
    }, [apiKey, apiType, baseUrl, modelId, session])

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
        setValidationError("missing-credentials")
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
          verificationMode,
        )
        setValidationError("missing-model")
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
      const run = session.beginProbe(probeId, runId, tracker, {
        apiType,
        baseUrl,
        apiKey,
        modelId,
      })
      try {
        const response = await sendWebAiApiCheckMessage(
          WebAiApiCheckMessageTypes.RunProbe,
          {
            runId,
            apiType,
            mode: verificationMode,
            baseUrl: trimmedBaseUrl,
            apiKey: trimmedApiKey,
            modelId: modelId.trim() || undefined,
            probeId,
          },
        )

        if (response.success && response.result) {
          const result =
            response.result as ApiCheckProbeResultWithAnalyticsCategory
          if (run.shouldIgnoreResult() || options.shouldIgnoreResult?.()) {
            if (run.isCurrent()) {
              setProbes((prev) => markProbeNotRunning(prev, probeId))
            }
            return null
          }
          if (!updateProbeResult(probeId, result, run.acceptResult)) return null
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
        const message = failedResponse?.error

        const fallback: ApiCheckProbeResultWithAnalyticsCategory = {
          id: probeId,
          mode:
            probeId === API_VERIFICATION_PROBE_IDS.Models
              ? undefined
              : verificationMode,
          status: API_VERIFICATION_PROBE_STATUSES.Fail,
          latencyMs: 0,
          summary: message || "Probe failed.",
          ...(message
            ? {}
            : { summaryKey: "webAiApiCheck:modal.errors.runProbeFailed" }),
          analyticsErrorCategory: failedResponse?.errorCategory,
          input: {
            apiType,
            baseUrl: trimmedBaseUrl,
          },
        }

        if (run.shouldIgnoreResult() || options.shouldIgnoreResult?.()) {
          if (run.isCurrent()) {
            setProbes((prev) => markProbeNotRunning(prev, probeId))
          }
          return null
        }

        if (!updateProbeResult(probeId, fallback, run.acceptResult)) return null
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
          mode:
            probeId === API_VERIFICATION_PROBE_IDS.Models
              ? undefined
              : verificationMode,
          status: API_VERIFICATION_PROBE_STATUSES.Fail,
          latencyMs: 0,
          summary: "Probe failed.",
          summaryKey: "webAiApiCheck:modal.errors.runProbeFailed",
          analyticsErrorCategory: errorCategory,
          input: {
            apiType,
            baseUrl: trimmedBaseUrl,
          },
        }
        if (run.shouldIgnoreResult() || options.shouldIgnoreResult?.()) {
          if (run.isCurrent()) {
            setProbes((prev) => markProbeNotRunning(prev, probeId))
          }
          return null
        }
        if (!updateProbeResult(probeId, fallback, run.acceptResult)) return null
        tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory,
          insights: buildApiCheckAnalyticsInsights(apiType, trigger, {
            mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
          }),
        })
        return fallback
      } finally {
        run.finish()
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
      trigger,
      updateProbeResult,
      session,
      verificationMode,
    ],
  )

  const stopProbe = useCallback(
    (probeId: ApiVerificationProbeId) => {
      if (
        !session.stopProbe(probeId, {
          insights: buildApiCheckAnalyticsInsights(apiType, trigger, {
            mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
            failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.CancelledByUser,
          }),
        })
      )
        return

      setProbes((prev) => markProbeNotRunning(prev, probeId))
    },
    [apiType, trigger, session],
  )

  const stopRunAll = useCallback(() => {
    if (!session.stopBatch()) return
    setIsStoppingRunAll(true)
    setTestStopPhase("stopping")
  }, [session])

  const runAll = useCallback(async () => {
    const tracker = startProductAnalyticsAction({
      ...contentApiCheckAnalyticsScope,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunApiCredentialProbeSuite,
    })

    const trimmedBaseUrl = baseUrl.trim()
    const trimmedApiKey = apiKey.trim()
    if (!trimmedBaseUrl || !trimmedApiKey) {
      setValidationError("missing-credentials")
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

    const batch = session.beginBatch()
    setIsStoppingRunAll(false)
    setTestStopPhase(null)
    setIsRunningAll(true)
    const results: ApiCheckProbeResultWithAnalyticsCategory[] = []
    try {
      for (const def of probeDefinitions) {
        if (batch.isStopped()) break
        if (def.requiresModelId && !modelId.trim()) {
          const fallback = buildMissingModelResult(
            apiType,
            trimmedBaseUrl,
            def.id,
            verificationMode,
          )
          setValidationError("missing-model")
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
        batch.selectProbe(def.id)
        const result = await runProbe(def.id, {
          trackIndividual: false,
          recordHistory: false,
          runId,
          shouldIgnoreResult: () => batch.isStopped(),
        })
        if (!batch.isStopped() && result) results.push(result)
        if (batch.isStopped()) break
      }

      if (batch.isStopped()) {
        const successCount = results.filter(
          (result) => result.status === API_VERIFICATION_PROBE_STATUSES.Pass,
        ).length
        const failureCount = results.filter(
          (result) => result.status === API_VERIFICATION_PROBE_STATUSES.Fail,
        ).length
        const skippedCount = Math.max(
          probeDefinitions.length - successCount - failureCount,
          0,
        )

        if (batch.isCurrent()) {
          setProbes((prev) =>
            prev.map((probe) =>
              probe.isRunning ? { ...probe, isRunning: false } : probe,
            ),
          )
          setTestStopPhase("stopped")
        }
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
        (result) => result.status === API_VERIFICATION_PROBE_STATUSES.Pass,
      ).length
      const failureCount = results.filter(
        (result) => result.status === API_VERIFICATION_PROBE_STATUSES.Fail,
      ).length
      const skippedCount = results.filter(
        (result) =>
          result.status === API_VERIFICATION_PROBE_STATUSES.Unsupported,
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
                results.find(
                  (result) =>
                    result.status === API_VERIFICATION_PROBE_STATUSES.Fail,
                )?.analyticsErrorCategory ??
                resolveProductAnalyticsErrorCategoryFromProbeResult(
                  results.find(
                    (result) =>
                      result.status === API_VERIFICATION_PROBE_STATUSES.Fail,
                  ),
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
      if (batch.finish()) {
        setIsRunningAll(false)
        setIsStoppingRunAll(false)
      }
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
    trigger,
    verificationMode,
    session,
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
