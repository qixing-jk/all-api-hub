import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  type ProductAnalyticsErrorCategory,
} from "~/services/productAnalytics/contracts"
import {
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
  getProbesForModality,
  type ApiVerificationApiType,
  type ApiVerificationMode,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
  type ModelTestModality,
} from "~/services/verification/aiApiVerification"
import { buildStoppedProbeResult } from "~/services/verification/aiApiVerification/utils"

import type { ProbeItemState } from "../modal/apiCheckModalTypes"

export const API_CHECK_TEST_STOP_PHASES = {
  Stopping: "stopping",
  Stopped: "stopped",
} as const
export type ApiCheckTestStopPhase =
  (typeof API_CHECK_TEST_STOP_PHASES)[keyof typeof API_CHECK_TEST_STOP_PHASES]

export type ApiCheckProbeResultWithAnalyticsCategory =
  ApiVerificationProbeResult & {
    analyticsErrorCategory?: ProductAnalyticsErrorCategory
  }

/**
 * Build the initial probe UI state for the selected API type.
 */
export function buildProbeState(
  apiType: ApiVerificationApiType,
  modality?: ModelTestModality,
): ProbeItemState[] {
  return getProbesForModality(modality, apiType).map((def): ProbeItemState => ({
    id: def.id,
    requiresModelId: def.requiresModelId,
    isRunning: false,
    attempts: 0,
    result: null,
  }))
}

/**
 * Retain partial evidence while replacing any verdict from an earlier attempt.
 */
export function markProbeStopped(
  probes: ProbeItemState[],
  probeId: ApiVerificationProbeId,
  mode: ApiVerificationMode,
): ProbeItemState[] {
  return probes.map((probe) =>
    probe.id === probeId
      ? {
          ...probe,
          isRunning: false,
          result: buildStoppedProbeResult(probeId, mode),
        }
      : probe,
  )
}

/**
 * Build the local validation result for probes that cannot run without a model.
 */
export function buildMissingModelResult(
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

/** Normalize transport failures without discarding a useful upstream message. */
export function buildFailedProbeResult(
  apiType: ApiVerificationApiType,
  baseUrl: string,
  probeId: ApiVerificationProbeId,
  mode: ApiVerificationMode,
  errorCategory?: ProductAnalyticsErrorCategory,
  message?: string,
): ApiCheckProbeResultWithAnalyticsCategory {
  return {
    id: probeId,
    mode: probeId === API_VERIFICATION_PROBE_IDS.Models ? undefined : mode,
    status: API_VERIFICATION_PROBE_STATUSES.Fail,
    latencyMs: 0,
    summary: message || "Probe failed.",
    ...(message
      ? {}
      : { summaryKey: "webAiApiCheck:modal.errors.runProbeFailed" }),
    analyticsErrorCategory: errorCategory,
    input: { apiType, baseUrl },
  }
}

export type ApiCheckRunProbeOptions = {
  trackIndividual?: boolean
  recordHistory?: boolean
  runId?: string
  shouldIgnoreResult?: () => boolean
}
