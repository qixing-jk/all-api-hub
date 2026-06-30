import { WEBDAV_SYNC_STRATEGIES, type WebDAVSyncStrategy } from "~/types/webdav"

import type { ProductAnalyticsActionDiagnostics } from "./actions"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_MODE_IDS,
  type ProductAnalyticsErrorCategory,
  type ProductAnalyticsFailureReason,
  type ProductAnalyticsFailureStage,
  type ProductAnalyticsModeId,
  type ProductAnalyticsSourceKind,
} from "./contracts"
import { buildActionFailureDiagnostics } from "./diagnosticsError"

type BuildWebDavSyncDiagnosticsOptions = {
  mode?: ProductAnalyticsModeId
  sourceKind?: ProductAnalyticsSourceKind
  retryAttempted?: boolean
  retryCount?: number
  itemCount?: number
  successCount?: number
  failureCount?: number
  skippedCount?: number
  error?: unknown
  statusCode?: number
  errorCategory?: ProductAnalyticsErrorCategory
  failureStage?: ProductAnalyticsFailureStage
  failureReason?: ProductAnalyticsFailureReason
}

/**
 * Maps a WebDAV sync strategy to the analytics mode id.
 */
export function getWebdavSyncStrategyMode(
  strategy: WebDAVSyncStrategy | undefined,
): ProductAnalyticsModeId {
  if (strategy === WEBDAV_SYNC_STRATEGIES.UPLOAD_ONLY) {
    return PRODUCT_ANALYTICS_MODE_IDS.WebDavUploadOnly
  }
  if (strategy === WEBDAV_SYNC_STRATEGIES.DOWNLOAD_ONLY) {
    return PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly
  }
  return PRODUCT_ANALYTICS_MODE_IDS.WebDavMerge
}

/**
 * Builds privacy-safe diagnostics for WebDAV sync actions.
 */
export function buildWebDavSyncDiagnostics({
  mode,
  sourceKind,
  retryAttempted,
  retryCount,
  itemCount,
  successCount,
  failureCount,
  skippedCount,
  error,
  statusCode,
  errorCategory,
  failureStage,
  failureReason,
}: BuildWebDavSyncDiagnosticsOptions): ProductAnalyticsActionDiagnostics {
  const failed = typeof failureCount === "number" && failureCount > 0
  const hasFailureInput =
    failed ||
    error ||
    typeof statusCode === "number" ||
    errorCategory ||
    failureStage ||
    failureReason

  return {
    ...(mode || sourceKind
      ? {
          context: {
            ...(sourceKind ? { sourceKind } : {}),
            ...(mode ? { mode } : {}),
          },
        }
      : {}),
    ...(typeof retryAttempted === "boolean" || typeof retryCount === "number"
      ? {
          execution: {
            ...(typeof retryAttempted === "boolean" ? { retryAttempted } : {}),
            ...(typeof retryCount === "number" ? { retryCount } : {}),
          },
        }
      : {}),
    ...(typeof itemCount === "number" ||
    typeof successCount === "number" ||
    typeof failureCount === "number" ||
    typeof skippedCount === "number"
      ? {
          outcome: {
            ...(typeof itemCount === "number" ? { itemCount } : {}),
            ...(typeof successCount === "number" ? { successCount } : {}),
            ...(typeof failureCount === "number" ? { failureCount } : {}),
            ...(typeof skippedCount === "number" ? { skippedCount } : {}),
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
              (!error && typeof statusCode !== "number"
                ? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
                : undefined),
            stage: failureStage,
            reason: failureReason,
          }),
        }
      : {}),
  }
}
