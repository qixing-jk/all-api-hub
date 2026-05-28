import type { ApiVerificationProbeResult } from "~/services/verification/aiApiVerification"

import { resolveProductAnalyticsErrorCategoryFromError } from "./actions"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  type ProductAnalyticsErrorCategory,
} from "./events"

/**
 * Maps structured API verification diagnostics without reading provider text.
 */
export function resolveProductAnalyticsErrorCategoryFromProbeResult(
  result?: Pick<ApiVerificationProbeResult, "status" | "output">,
  fallbackCategory: ProductAnalyticsErrorCategory = PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
): ProductAnalyticsErrorCategory {
  if (!result) return fallbackCategory
  if (result.status === "unsupported") {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported
  }

  const output = result.output
  const status =
    output &&
    typeof output === "object" &&
    typeof (output as { inferredHttpStatus?: unknown }).inferredHttpStatus ===
      "number"
      ? (output as { inferredHttpStatus: number }).inferredHttpStatus
      : undefined

  return typeof status === "number"
    ? resolveProductAnalyticsErrorCategoryFromError({ statusCode: status })
    : fallbackCategory
}
