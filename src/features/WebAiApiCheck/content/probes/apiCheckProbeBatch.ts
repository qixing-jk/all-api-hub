import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { resolveProductAnalyticsErrorCategoryFromProbeResult } from "~/services/productAnalytics/facts/verification"
import {
  API_VERIFICATION_PROBE_STATUSES,
  type ApiVerificationApiType,
  type ApiVerificationMode,
  type ApiVerificationProbeId,
  type getProbesForModality,
} from "~/services/verification/aiApiVerification"
import { safeRandomUUID } from "~/utils/core/identifier"
import { mapWithConcurrency } from "~/utils/core/mapWithConcurrency"

import type { ApiCheckOpenModalDetail } from "../events"
import {
  buildApiCheckAnalyticsInsights,
  contentApiCheckAnalyticsScope,
} from "../modal/apiCheckModalAnalytics"
import {
  API_CHECK_VALIDATION_ERRORS,
  type ApiCheckValidationError,
} from "../modal/apiCheckModalTypes"
import type { createApiCheckProbeSession } from "./apiCheckProbeSession"
import {
  buildMissingModelResult,
  type ApiCheckProbeResultWithAnalyticsCategory,
  type ApiCheckRunProbeOptions,
} from "./apiCheckProbeState"

type ApiCheckProbeBatchOptions = {
  apiType: ApiVerificationApiType
  verificationMode: ApiVerificationMode
  trigger: ApiCheckOpenModalDetail["trigger"]
  baseUrl: string
  apiKey: string
  modelId: string
  probeDefinitions: ReturnType<typeof getProbesForModality>
  concurrency: number
  session: ReturnType<typeof createApiCheckProbeSession>
  runProbe: (
    id: ApiVerificationProbeId,
    options: ApiCheckRunProbeOptions,
  ) => Promise<ApiCheckProbeResultWithAnalyticsCategory | null>
  setValidationError: (error: ApiCheckValidationError | null) => void
  recordBaseUrlHistory: (baseUrl: string) => void
  recordMissingModel: (
    id: ApiVerificationProbeId,
    result: ApiCheckProbeResultWithAnalyticsCategory,
  ) => void
  onStart: () => void
  onStopped: () => void
  onFinish: () => void
}

/** Schedule one admitted batch and report its outcome without owning React state. */
export async function runApiCheckProbeBatch({
  apiType,
  verificationMode,
  trigger,
  baseUrl,
  apiKey,
  modelId,
  probeDefinitions,
  concurrency,
  session,
  runProbe,
  setValidationError,
  recordBaseUrlHistory,
  recordMissingModel,
  onStart,
  onStopped,
  onFinish,
}: ApiCheckProbeBatchOptions) {
  const tracker = startProductAnalyticsAction({
    ...contentApiCheckAnalyticsScope,
    actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunApiCredentialProbeSuite,
  })

  const trimmedBaseUrl = baseUrl.trim()
  const trimmedApiKey = apiKey.trim()
  if (!trimmedBaseUrl || !trimmedApiKey) {
    setValidationError(API_CHECK_VALIDATION_ERRORS.MissingCredentials)
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
  onStart()
  const results: ApiCheckProbeResultWithAnalyticsCategory[] = []
  try {
    await mapWithConcurrency(probeDefinitions, concurrency, async (def) => {
      if (batch.isStopped()) return
      if (def.requiresModelId && !modelId.trim()) {
        const fallback = buildMissingModelResult(
          apiType,
          trimmedBaseUrl,
          def.id,
          verificationMode,
        )
        setValidationError(API_CHECK_VALIDATION_ERRORS.MissingModel)
        recordMissingModel(def.id, fallback)
        results.push(fallback)
        return
      }
      const runId = safeRandomUUID(`web-ai-api-check-${def.id}`)
      batch.selectProbe(def.id, runId)
      const result = await runProbe(def.id, {
        trackIndividual: false,
        recordHistory: false,
        runId,
        shouldIgnoreResult: () => batch.isStopped(),
      })
      if (!batch.isStopped() && result) results.push(result)
      if (batch.isStopped()) return
    })

    const successCount = results.filter(
      (result) => result.status === API_VERIFICATION_PROBE_STATUSES.Pass,
    ).length
    const failureCount = results.filter(
      (result) => result.status === API_VERIFICATION_PROBE_STATUSES.Fail,
    ).length
    if (batch.isStopped()) {
      const skippedCount = Math.max(
        probeDefinitions.length - successCount - failureCount,
        0,
      )

      if (batch.isCurrent()) {
        onStopped()
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

    const skippedCount = results.filter(
      (result) => result.status === API_VERIFICATION_PROBE_STATUSES.Unsupported,
    ).length
    const analyticsResult =
      failureCount > 0
        ? PRODUCT_ANALYTICS_RESULTS.Failure
        : successCount > 0
          ? PRODUCT_ANALYTICS_RESULTS.Success
          : PRODUCT_ANALYTICS_RESULTS.Skipped

    const firstFailure = results.find(
      (result) => result.status === API_VERIFICATION_PROBE_STATUSES.Fail,
    )
    tracker.complete(analyticsResult, {
      ...(analyticsResult === PRODUCT_ANALYTICS_RESULTS.Failure
        ? {
            errorCategory:
              firstFailure?.analyticsErrorCategory ??
              resolveProductAnalyticsErrorCategoryFromProbeResult(firstFailure),
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
      onFinish()
    }
  }
}
