import type { TFunction } from "i18next"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { ApiCheckOpenModalDetail } from "~/features/WebAiApiCheck/content/events"
import {
  buildApiCheckAnalyticsInsights,
  contentApiCheckAnalyticsScope,
  getProbeAnalyticsResult,
} from "~/features/WebAiApiCheck/content/modal/apiCheckModalAnalytics"
import { API_CHECK_VALIDATION_ERRORS } from "~/features/WebAiApiCheck/content/modal/apiCheckModalTypes"
import type {
  ApiCheckValidationError,
  ProbeItemState,
} from "~/features/WebAiApiCheck/content/modal/apiCheckModalTypes"
import { createApiCheckProbeSession } from "~/features/WebAiApiCheck/content/probes/apiCheckProbeSession"
import { useModelMetadataLookup } from "~/hooks/verification/useModelMetadataLookup"
import { useVerificationConcurrency } from "~/hooks/verification/useVerificationConcurrency"
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
} from "~/services/productAnalytics/contracts"
import { resolveProductAnalyticsErrorCategoryFromProbeResult } from "~/services/productAnalytics/facts/verification"
import {
  getProbesForModality,
  resolveModelTestModality,
  type ApiVerificationApiType,
  type ApiVerificationMode,
  type ApiVerificationProbeId,
  type ApiVerificationProbePromptOverrides,
  type ApiVerificationProbeResult,
  type ApiVerificationRequestProfile,
} from "~/services/verification/aiApiVerification"
import { getVerificationRequestProfileOptions } from "~/services/verification/aiApiVerification/requestProfiles"
import { API_VERIFICATION_REQUEST_PROFILES } from "~/services/verification/aiApiVerification/types"
import { VERIFICATION_CONCURRENCY_KINDS } from "~/services/verification/concurrency"
import { subscribeGenerationProgress } from "~/services/verification/webAiApiCheck/generationProgress"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import { safeRandomUUID } from "~/utils/core/identifier"

import { runApiCheckProbeBatch } from "./apiCheckProbeBatch"
import {
  API_CHECK_TEST_STOP_PHASES,
  buildFailedProbeResult,
  buildMissingModelResult,
  buildProbeState,
  markProbeStopped,
  type ApiCheckProbeResultWithAnalyticsCategory,
  type ApiCheckRunProbeOptions,
  type ApiCheckTestStopPhase,
} from "./apiCheckProbeState"

type UseApiCheckProbeRunnerOptions = {
  getProbePromptOverrides?: () => ApiVerificationProbePromptOverrides
  t: TFunction<["webAiApiCheck", "common", "aiApiVerification"]>
  apiType: ApiVerificationApiType
  verificationMode: ApiVerificationMode
  requestProfileEnhanced?: boolean
  requestProfile?: ApiVerificationRequestProfile
  trigger: ApiCheckOpenModalDetail["trigger"]
  baseUrl: string
  apiKey: string
  modelId: string
  setValidationError: (error: ApiCheckValidationError | null) => void
  recordBaseUrlHistory: (baseUrl: string) => void
}

interface VerificationResultsSnapshot {
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
  modelId?: string
  results: ApiVerificationProbeResult[]
}

/**
 * Owns the API verification probe state machine, cancellation, and probe analytics.
 */
export function useApiCheckProbeRunner({
  getProbePromptOverrides,
  t,
  apiType,
  verificationMode,
  requestProfile = API_VERIFICATION_REQUEST_PROFILES.Default,
  requestProfileEnhanced = false,
  trigger,
  baseUrl,
  apiKey,
  modelId,
  setValidationError,
  recordBaseUrlHistory,
}: UseApiCheckProbeRunnerOptions) {
  const concurrency = useVerificationConcurrency(
    VERIFICATION_CONCURRENCY_KINDS.Routine,
  )
  const [isRunningAll, setIsRunningAll] = useState(false)
  const [probes, setProbes] = useState<ProbeItemState[]>(() =>
    buildProbeState(apiType, resolveModelTestModality({ modelId })),
  )
  const isAnyProbeRunning = probes.some((probe) => probe.isRunning)
  const metadataLookup = useModelMetadataLookup(
    !isRunningAll && !isAnyProbeRunning,
  )
  const modelModality = useMemo(
    () => resolveModelTestModality({ modelId }, metadataLookup),
    [modelId, metadataLookup],
  )

  const probeDefinitions = useMemo(
    () => getProbesForModality(modelModality, apiType),
    [apiType, modelModality],
  )

  useEffect(() => {
    setProbes((prev) => {
      const existingById = new Map(prev.map((p) => [p.id, p]))
      return probeDefinitions.map((def): ProbeItemState => {
        const existing = existingById.get(def.id)
        if (existing) {
          return {
            ...existing,
            requiresModelId: def.requiresModelId,
          }
        }
        return {
          id: def.id,
          requiresModelId: def.requiresModelId,
          isRunning: false,
          attempts: 0,
          result: null,
        }
      })
    })
  }, [probeDefinitions])
  const [isStoppingRunAll, setIsStoppingRunAll] = useState(false)
  const [testStopPhase, setTestStopPhase] =
    useState<ApiCheckTestStopPhase | null>(null)
  const testStoppedMessage =
    testStopPhase === API_CHECK_TEST_STOP_PHASES.Stopping
      ? t("webAiApiCheck:modal.messages.stoppingTest")
      : testStopPhase === API_CHECK_TEST_STOP_PHASES.Stopped
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

  const modelModalityRef = useRef(modelModality)
  modelModalityRef.current = modelModality

  const hasAnyResult = useMemo(
    () => probes.some((probe) => probe.result !== null),
    [probes],
  )

  const resetProbeState = useCallback(
    (nextApiType: ApiVerificationApiType) => {
      session.reset()
      setProbes(buildProbeState(nextApiType, modelModalityRef.current))
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
      options: ApiCheckRunProbeOptions = {},
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
        setValidationError(API_CHECK_VALIDATION_ERRORS.MissingCredentials)
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
        setValidationError(API_CHECK_VALIDATION_ERRORS.MissingModel)
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
                progress: undefined,
                startedAt: Date.now(),
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
      const unsubscribe = subscribeGenerationProgress(runId, (progress) => {
        if (run.shouldIgnoreResult() || options.shouldIgnoreResult?.()) return
        setProbes((prev) =>
          prev.map((probe) =>
            probe.id === probeId ? { ...probe, progress } : probe,
          ),
        )
      })
      const acceptResult = (result: ApiVerificationProbeResult) => {
        if (run.shouldIgnoreResult() || options.shouldIgnoreResult?.()) {
          if (run.isCurrent()) {
            setProbes((prev) =>
              markProbeStopped(prev, probeId, verificationMode),
            )
          }
          return false
        }
        return updateProbeResult(probeId, result, run.acceptResult)
      }
      try {
        const response = await sendWebAiApiCheckMessage(
          WebAiApiCheckMessageTypes.RunProbe,
          {
            runId,
            apiType,
            mode: verificationMode,
            ...getVerificationRequestProfileOptions(
              requestProfile,
              requestProfileEnhanced,
            ),
            baseUrl: trimmedBaseUrl,
            apiKey: trimmedApiKey,
            modelId: modelId.trim() || undefined,
            probeId,
            probePromptOverrides: getProbePromptOverrides?.(),
          },
        )

        if (response.success && response.result) {
          const result =
            response.result as ApiCheckProbeResultWithAnalyticsCategory
          if (!acceptResult(result)) return null
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

        const fallback = buildFailedProbeResult(
          apiType,
          trimmedBaseUrl,
          probeId,
          verificationMode,
          failedResponse?.errorCategory,
          message,
        )

        if (!acceptResult(fallback)) return null
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
        const fallback = buildFailedProbeResult(
          apiType,
          trimmedBaseUrl,
          probeId,
          verificationMode,
          errorCategory,
        )

        if (!acceptResult(fallback)) return null
        tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory,
          insights: buildApiCheckAnalyticsInsights(apiType, trigger, {
            mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
          }),
        })
        return fallback
      } finally {
        unsubscribe()
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
      getProbePromptOverrides,
      session,
      verificationMode,
      requestProfile,
      requestProfileEnhanced,
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

      setProbes((prev) => markProbeStopped(prev, probeId, verificationMode))
    },
    [apiType, trigger, session, verificationMode],
  )

  const stopRunAll = useCallback(() => {
    if (!session.stopBatch()) return
    setIsStoppingRunAll(true)
    setTestStopPhase(API_CHECK_TEST_STOP_PHASES.Stopping)
  }, [session])

  const runAll = useCallback(
    () =>
      runApiCheckProbeBatch({
        apiKey,
        apiType,
        baseUrl,
        modelId,
        probeDefinitions,
        recordBaseUrlHistory,
        runProbe,
        concurrency: concurrency.value,
        setValidationError,
        trigger,
        verificationMode,
        session,
        recordMissingModel: (id, result) =>
          setProbes((prev) =>
            prev.map((probe) =>
              probe.id === id
                ? { ...probe, attempts: probe.attempts + 1, result }
                : probe,
            ),
          ),
        onStart: () => {
          setIsStoppingRunAll(false)
          setTestStopPhase(null)
          setIsRunningAll(true)
        },
        onStopped: () => setTestStopPhase(API_CHECK_TEST_STOP_PHASES.Stopped),
        onFinish: () => {
          setIsRunningAll(false)
          setIsStoppingRunAll(false)
        },
      }),
    [
      apiKey,
      apiType,
      baseUrl,
      modelId,
      probeDefinitions,
      recordBaseUrlHistory,
      runProbe,
      concurrency.value,
      setValidationError,
      trigger,
      verificationMode,
      session,
    ],
  )

  return {
    concurrency,
    modelModality,
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
