import {
  PRODUCT_ANALYTICS_EVENTS,
  type ProductAnalyticsStorageArea,
  type ProductAnalyticsStorageFailureStage,
  type ProductAnalyticsStorageOperation,
} from "~/services/productAnalytics/contracts"
import { trackProductAnalyticsEvent } from "~/services/productAnalytics/runtime/dispatch"

/**
 * Reports one failure per operation and stage within this window, so an
 * environment-level storage outage stays visible without flooding events.
 */
const STORAGE_WRITE_FAILURE_REPORT_INTERVAL_MS = 10 * 60 * 1000

const lastReportedAtByOperationStage = new Map<string, number>()

export type StorageWriteFailureParams = {
  storageArea: ProductAnalyticsStorageArea
  operation: ProductAnalyticsStorageOperation
  failureStage: ProductAnalyticsStorageFailureStage
  error?: unknown
}

/**
 * Resolves a low-cardinality `Error.name` (for example `QuotaExceededError`)
 * without ever leaking messages, storage keys, or paths.
 */
function resolveErrorName(error: unknown): string {
  if (error && typeof error === "object") {
    const name = (error as { name?: unknown }).name
    if (typeof name === "string" && name.length > 0) {
      return name
    }
  }
  return "unknown"
}

/**
 * Reports a failed storage update as best-effort product analytics.
 *
 * Returns whether this call dispatched an event; repeats inside the cooldown
 * window for the same operation and stage are skipped.
 */
export function trackStorageWriteFailure(
  params: StorageWriteFailureParams,
): boolean {
  const key = `${params.operation}:${params.failureStage}`
  const now = Date.now()
  const lastReportedAt = lastReportedAtByOperationStage.get(key)
  if (
    typeof lastReportedAt === "number" &&
    now - lastReportedAt < STORAGE_WRITE_FAILURE_REPORT_INTERVAL_MS
  ) {
    return false
  }
  lastReportedAtByOperationStage.set(key, now)

  void trackProductAnalyticsEvent(PRODUCT_ANALYTICS_EVENTS.StorageWriteFailed, {
    storage_area: params.storageArea,
    storage_operation: params.operation,
    storage_failure_stage: params.failureStage,
    error_name: resolveErrorName(params.error),
  })
  return true
}
