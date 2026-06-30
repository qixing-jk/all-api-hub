import type { ExecutionResult } from "~/types/managedSiteModelSync"

import type { ProductAnalyticsActionDiagnostics } from "./actions"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  type ProductAnalyticsManagedSiteType,
  type ProductAnalyticsModeId,
  type ProductAnalyticsSourceKind,
} from "./contracts"

type BuildManagedSiteModelSyncDiagnosticsOptions = {
  managedSiteType: ProductAnalyticsManagedSiteType
  sourceKind?: ProductAnalyticsSourceKind
  mode: ProductAnalyticsModeId
  execution: ExecutionResult
  backgroundExecution?: boolean
}

/**
 * Counts synced models without exposing model names.
 */
function getModelCount(execution: ExecutionResult) {
  return execution.items.reduce((count, item) => {
    const itemModelCount = item.newModels?.length ?? item.oldModels?.length ?? 0
    return count + itemModelCount
  }, 0)
}

/**
 * Finds the highest retry count across sync items.
 */
function getRetryCount(execution: ExecutionResult) {
  return execution.items.reduce(
    (maxRetryCount, item) =>
      Math.max(maxRetryCount, Math.max(item.attempts - 1, 0)),
    0,
  )
}

/**
 * Builds privacy-safe diagnostics for managed-site model sync.
 */
export function buildManagedSiteModelSyncDiagnostics({
  managedSiteType,
  sourceKind,
  mode,
  execution,
  backgroundExecution,
}: BuildManagedSiteModelSyncDiagnosticsOptions): ProductAnalyticsActionDiagnostics {
  const retryCount = getRetryCount(execution)
  const failureCount = execution.statistics.failureCount
  const successCount = execution.statistics.successCount
  const itemCount = execution.statistics.total
  const skippedCount = Math.max(itemCount - successCount - failureCount, 0)

  return {
    context: {
      managedSiteType,
      ...(sourceKind ? { sourceKind } : {}),
      mode,
    },
    execution: {
      retryAttempted: retryCount > 0,
      retryCount,
      ...(typeof backgroundExecution === "boolean"
        ? { backgroundExecution }
        : {}),
    },
    outcome: {
      itemCount,
      successCount,
      failureCount,
      skippedCount,
      modelCount: getModelCount(execution),
    },
    ...(failureCount > 0
      ? {
          failure: {
            category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
            stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
            reason:
              successCount > 0
                ? PRODUCT_ANALYTICS_FAILURE_REASONS.PartialSuccess
                : PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
          },
        }
      : {}),
  }
}
