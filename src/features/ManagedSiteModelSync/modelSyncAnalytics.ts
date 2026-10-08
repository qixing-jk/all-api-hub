import { useCallback, useMemo } from "react"

import type { ManagedSiteType } from "~/constants/siteType"
import {
  startProductAnalyticsAction,
  type ProductAnalyticsActionCompleteOptions,
  type ProductAnalyticsActionContext,
  type ProductAnalyticsActionInsights,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsResult,
} from "~/services/productAnalytics/contracts"
import { buildManagedSiteModelSyncDiagnostics } from "~/services/productAnalytics/facts/managedSiteModelSync"
import type { ExecutionResult } from "~/types/managedSiteModelSync"

export const hasModelSyncFailures = (execution: ExecutionResult) =>
  execution.statistics.failureCount > 0

const isEmptyModelSyncExecution = (execution: ExecutionResult) =>
  execution.statistics.total === 0 || execution.items.length === 0

const getModelSyncExecutionAnalyticsResult = (execution: ExecutionResult) => {
  if (isEmptyModelSyncExecution(execution)) {
    return PRODUCT_ANALYTICS_RESULTS.Skipped
  }

  if (hasModelSyncFailures(execution)) {
    return PRODUCT_ANALYTICS_RESULTS.Failure
  }

  return PRODUCT_ANALYTICS_RESULTS.Success
}

const getModelSyncExecutionAnalyticsCompletionOptions = (
  execution: ExecutionResult,
): ProductAnalyticsActionCompleteOptions => ({
  ...(hasModelSyncFailures(execution)
    ? { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown }
    : {}),
  insights: {
    itemCount: execution.statistics.total,
    successCount: execution.statistics.successCount,
    failureCount: execution.statistics.failureCount,
  },
})

export const actionBarAnalyticsScope = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncActionBar,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
}
export const manualPanelAnalyticsScope = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
  surfaceId:
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncManualPanel,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
}
export const resultsTableAnalyticsScope = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
  surfaceId:
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncResultsTable,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
}

export const startModelSyncAnalytics = (
  context: ProductAnalyticsActionContext,
) => startProductAnalyticsAction(context)

/** Keep completion facts and target attribution consistent across sync commands. */
export function useModelSyncAnalytics(managedSiteType: ManagedSiteType) {
  const managedSiteAnalyticsInsights = useMemo(
    () => ({
      managedSiteType,
    }),
    [managedSiteType],
  )

  const completeModelSyncActionAnalytics = useCallback(
    (
      tracker: ReturnType<typeof startProductAnalyticsAction>,
      result: ProductAnalyticsResult = PRODUCT_ANALYTICS_RESULTS.Success,
      options: ProductAnalyticsActionCompleteOptions = {},
    ) => {
      tracker.complete(result, {
        ...options,
        insights: {
          ...managedSiteAnalyticsInsights,
          ...options.insights,
        },
      })
    },
    [managedSiteAnalyticsInsights],
  )

  const completeModelSyncExecutionAnalytics = useCallback(
    (
      tracker: ReturnType<typeof startProductAnalyticsAction>,
      execution: ExecutionResult,
      insights?: ProductAnalyticsActionInsights,
    ) => {
      const result = getModelSyncExecutionAnalyticsResult(execution)
      const options = getModelSyncExecutionAnalyticsCompletionOptions(execution)

      completeModelSyncActionAnalytics(tracker, result, {
        ...options,
        diagnostics: buildManagedSiteModelSyncDiagnostics({
          managedSiteType,
          mode: insights?.mode ?? PRODUCT_ANALYTICS_MODE_IDS.All,
          sourceKind: insights?.sourceKind,
          execution,
        }),
        insights: {
          ...options.insights,
          ...insights,
        },
      })
    },
    [completeModelSyncActionAnalytics, managedSiteType],
  )

  const trackInstantModelSyncAction = useCallback(
    (
      context: ProductAnalyticsActionContext,
      insights?: ProductAnalyticsActionInsights,
    ) => {
      const tracker = startModelSyncAnalytics(context)
      completeModelSyncActionAnalytics(
        tracker,
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights,
        },
      )
    },
    [completeModelSyncActionAnalytics],
  )

  return {
    completeModelSyncActionAnalytics,
    completeModelSyncExecutionAnalytics,
    trackInstantModelSyncAction,
  }
}
