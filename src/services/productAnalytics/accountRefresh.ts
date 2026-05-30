import type { ProductAnalyticsActionDiagnostics } from "./actions"
import { buildActionFailureDiagnostics } from "./diagnosticsError"
import type {
  ProductAnalyticsErrorCategory,
  ProductAnalyticsFailureReason,
  ProductAnalyticsFailureStage,
  ProductAnalyticsModeId,
  ProductAnalyticsRequestedAuthMode,
  ProductAnalyticsSiteType,
  ProductAnalyticsSourceKind,
} from "./events"
import { PRODUCT_ANALYTICS_ERROR_CATEGORIES } from "./events"

type BuildAccountRefreshDiagnosticsOptions = {
  sourceKind?: ProductAnalyticsSourceKind
  mode?: ProductAnalyticsModeId
  siteType?: ProductAnalyticsSiteType
  requestedAuthMode?: ProductAnalyticsRequestedAuthMode
  tempContextUsed?: boolean
  incognitoContextUsed?: boolean
  fallbackAvailable?: boolean
  fallbackUsed?: boolean
  retryAttempted?: boolean
  retryCount?: number
  itemCount?: number
  successCount?: number
  failureCount?: number
  skippedCount?: number
  warningCount?: number
  error?: unknown
  statusCode?: number
  errorCategory?: ProductAnalyticsErrorCategory
  failureStage?: ProductAnalyticsFailureStage
  failureReason?: ProductAnalyticsFailureReason
}

/**
 * Builds privacy-safe diagnostics for account refresh actions.
 */
export function buildAccountRefreshDiagnostics({
  sourceKind,
  mode,
  siteType,
  requestedAuthMode,
  tempContextUsed,
  incognitoContextUsed,
  fallbackAvailable,
  fallbackUsed,
  retryAttempted,
  retryCount,
  itemCount,
  successCount,
  failureCount,
  skippedCount,
  warningCount,
  error,
  statusCode,
  errorCategory,
  failureStage,
  failureReason,
}: BuildAccountRefreshDiagnosticsOptions): ProductAnalyticsActionDiagnostics {
  const failed = typeof failureCount === "number" && failureCount > 0
  const hasFailureInput =
    failed ||
    error ||
    typeof statusCode === "number" ||
    errorCategory ||
    failureStage ||
    failureReason

  return {
    ...(sourceKind || mode || siteType || requestedAuthMode
      ? {
          context: {
            ...(sourceKind ? { sourceKind } : {}),
            ...(mode ? { mode } : {}),
            ...(siteType ? { siteType } : {}),
            ...(requestedAuthMode ? { requestedAuthMode } : {}),
          },
        }
      : {}),
    ...(typeof tempContextUsed === "boolean" ||
    typeof incognitoContextUsed === "boolean" ||
    typeof fallbackAvailable === "boolean" ||
    typeof fallbackUsed === "boolean" ||
    typeof retryAttempted === "boolean" ||
    typeof retryCount === "number"
      ? {
          execution: {
            ...(typeof tempContextUsed === "boolean"
              ? { tempContextUsed }
              : {}),
            ...(typeof incognitoContextUsed === "boolean"
              ? { incognitoContextUsed }
              : {}),
            ...(typeof fallbackAvailable === "boolean"
              ? { fallbackAvailable }
              : {}),
            ...(typeof fallbackUsed === "boolean" ? { fallbackUsed } : {}),
            ...(typeof retryAttempted === "boolean" ? { retryAttempted } : {}),
            ...(typeof retryCount === "number" ? { retryCount } : {}),
          },
        }
      : {}),
    ...(typeof itemCount === "number" ||
    typeof successCount === "number" ||
    typeof failureCount === "number" ||
    typeof skippedCount === "number" ||
    typeof warningCount === "number"
      ? {
          outcome: {
            ...(typeof itemCount === "number" ? { itemCount } : {}),
            ...(typeof successCount === "number" ? { successCount } : {}),
            ...(typeof failureCount === "number" ? { failureCount } : {}),
            ...(typeof skippedCount === "number" ? { skippedCount } : {}),
            ...(typeof warningCount === "number" ? { warningCount } : {}),
          },
        }
      : {}),
    ...(hasFailureInput
      ? {
          failure: buildActionFailureDiagnostics({
            error,
            statusCode,
            errorCategory:
              errorCategory ??
              (!error &&
              typeof statusCode !== "number" &&
              !failureReason &&
              !failureStage
                ? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
                : undefined),
            stage: failureStage,
            reason: failureReason,
          }),
        }
      : {}),
  }
}
