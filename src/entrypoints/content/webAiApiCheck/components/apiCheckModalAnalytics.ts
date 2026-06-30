import type { ProductAnalyticsActionInsights } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsResult,
  type ProductAnalyticsSourceKind,
} from "~/services/productAnalytics/contracts"
import type {
  ApiVerificationApiType,
  ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"

import type { ApiCheckOpenModalDetail } from "../events"

export const contentApiCheckAnalyticsScope = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckModal,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
} as const

/**
 * Classifies the modal opening source without carrying page content.
 */
export function getApiCheckSourceKind(
  trigger: ApiCheckOpenModalDetail["trigger"],
): ProductAnalyticsSourceKind {
  if (trigger === "autoDetect") return PRODUCT_ANALYTICS_SOURCE_KINDS.Auto
  return PRODUCT_ANALYTICS_SOURCE_KINDS.ContextMenu
}

/**
 * Classifies in-modal actions separately from modal launch sources.
 */
export function getApiCheckActionSourceKind(
  trigger: ApiCheckOpenModalDetail["trigger"],
): ProductAnalyticsSourceKind {
  return trigger === "autoDetect"
    ? PRODUCT_ANALYTICS_SOURCE_KINDS.Auto
    : PRODUCT_ANALYTICS_SOURCE_KINDS.Manual
}

/**
 * Adds common safe dimensions to API check action completions.
 */
export function buildApiCheckAnalyticsInsights(
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
export function getProbeAnalyticsResult(
  result: ApiVerificationProbeResult | undefined,
): ProductAnalyticsResult {
  if (!result) return PRODUCT_ANALYTICS_RESULTS.Failure
  if (result.status === "pass") return PRODUCT_ANALYTICS_RESULTS.Success
  if (result.status === "unsupported") return PRODUCT_ANALYTICS_RESULTS.Skipped
  return PRODUCT_ANALYTICS_RESULTS.Failure
}
