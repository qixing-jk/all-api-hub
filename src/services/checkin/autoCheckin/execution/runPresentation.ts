import { RuntimeActionIds } from "~/constants/runtimeActions"
import { logger } from "~/services/checkin/autoCheckin/diagnostics"
import { notifyTaskResult } from "~/services/notifications/taskNotificationService"
import { trackProductAnalyticsActionCompleted } from "~/services/productAnalytics/actions"
import {
  buildAutoCheckinDiagnostics,
  trackAutoCheckinRunAnalytics,
} from "~/services/productAnalytics/autoCheckin"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type PRODUCT_ANALYTICS_MODE_IDS,
  type ProductAnalyticsResult,
} from "~/services/productAnalytics/contracts"
import { type SiteAccount } from "~/types"
import {
  type AutoCheckinAccountSnapshot,
  type AutoCheckinRunCompletedRuntimeMessage,
  type AutoCheckinRunKind,
  type AutoCheckinRunSummary,
} from "~/types/autoCheckin"
import {
  getTaskNotificationStatusFromCounts,
  TASK_NOTIFICATION_TASKS,
} from "~/types/taskNotifications"
import {
  isMessageReceiverUnavailableError,
  sendRuntimeMessage,
} from "~/utils/browser/runtimeMessages"
import { getErrorMessage } from "~/utils/core/error"

const AUTO_CHECKIN_BACKGROUND_ANALYTICS_CONTEXT = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundAutoCheckinScheduler,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
} as const

/**
 * Best-effort broadcast so open UI surfaces can refresh after an execution completes.
 *
 * This notification MUST never crash the scheduler: UI pages may be closed or not listening.
 */
export async function notifyUiRunCompleted(params: {
  runKind: AutoCheckinRunKind
  updatedAccountIds: string[]
  summary?: AutoCheckinRunSummary
}): Promise<void> {
  const message: AutoCheckinRunCompletedRuntimeMessage = {
    action: RuntimeActionIds.AutoCheckinRunCompleted,
    runKind: params.runKind,
    updatedAccountIds: params.updatedAccountIds,
    timestamp: Date.now(),
    summary: params.summary,
  }

  try {
    await sendRuntimeMessage(message, { maxAttempts: 1 })
  } catch (error) {
    const errorMessage = getErrorMessage(error)
    // Ignore "no receiver" errors (popup/options closed). Log others for diagnostics.
    if (isMessageReceiverUnavailableError(error)) {
      logger.debug("Run-completed UI notification ignored (no receiver)", {
        runKind: message.runKind,
        error: errorMessage,
      })
      return
    }

    logger.warn("Run-completed UI notification failed", {
      runKind: message.runKind,
      error: errorMessage,
    })
  }
}

/** Maps execution counts to the shared notification status. */
function getTaskNotificationStatus(successCount: number, failedCount: number) {
  return getTaskNotificationStatusFromCounts({
    successCount,
    failedCount,
  })
}

/** Publishes scheduled-run counts without counting already-checked accounts as new successes. */
export async function notifyScheduledRunResult(params: {
  successCount: number
  alreadyCheckedCount: number
  failedCount: number
  uncertainCount: number
  skippedCount: number
  total: number
}) {
  await notifyTaskResult({
    task: TASK_NOTIFICATION_TASKS.AutoCheckin,
    status: getTaskNotificationStatus(
      params.successCount,
      params.failedCount + params.uncertainCount,
    ),
    counts: {
      success: Math.max(params.successCount - params.alreadyCheckedCount, 0),
      alreadyChecked: params.alreadyCheckedCount,
      failed: params.failedCount,
      uncertain: params.uncertainCount,
      skipped: params.skippedCount,
      total: params.total,
    },
  })
}

/** Maps the aggregate run outcome to the shared analytics result. */
export function mapRunSummaryToProductAnalyticsResult(
  summary: Pick<
    AutoCheckinRunSummary,
    "executed" | "failedCount" | "skippedCount"
  >,
): ProductAnalyticsResult {
  if (summary.failedCount > 0) {
    return PRODUCT_ANALYTICS_RESULTS.Failure
  }
  if (summary.executed === 0) {
    return PRODUCT_ANALYTICS_RESULTS.Skipped
  }
  return PRODUCT_ANALYTICS_RESULTS.Success
}

/** Records completion diagnostics for a background run. */
export function trackBackgroundAutoCheckinCompleted(params: {
  summary: AutoCheckinRunSummary
  durationMs: number
  mode: (typeof PRODUCT_ANALYTICS_MODE_IDS)[keyof typeof PRODUCT_ANALYTICS_MODE_IDS]
  retryAttempted?: boolean
  retryCount?: number
}) {
  const result = mapRunSummaryToProductAnalyticsResult(params.summary)

  void trackProductAnalyticsActionCompleted({
    ...AUTO_CHECKIN_BACKGROUND_ANALYTICS_CONTEXT,
    result,
    durationMs: params.durationMs,
    diagnostics: buildAutoCheckinDiagnostics({
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Auto,
      mode: params.mode,
      summary: params.summary,
      backgroundExecution: true,
      ...(typeof params.retryAttempted === "boolean"
        ? { retryAttempted: params.retryAttempted }
        : {}),
      ...(typeof params.retryCount === "number"
        ? { retryCount: params.retryCount }
        : {}),
    }),
  })
}

/** Records account and retry observations for a completed background run. */
export function trackBackgroundAutoCheckinRunAnalytics(params: {
  runKind: AutoCheckinRunKind
  snapshots: AutoCheckinAccountSnapshot[]
  accounts: SiteAccount[]
  retryEnabled: boolean
  retryPendingBefore: number
  retryAttempted: number
  retryRescued: number
  retryPendingAfter: number
  retryExhausted: number
}) {
  trackAutoCheckinRunAnalytics({
    runKind: params.runKind,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    snapshots: params.snapshots,
    accountsById: new Map(
      params.accounts.map((account) => [
        account.id,
        {
          authType: account.authType,
          checkInSelectionMode: account.checkIn?.selection?.mode,
        },
      ]),
    ),
    retryEnabled: params.retryEnabled,
    retryPendingBefore: params.retryPendingBefore,
    retryAttempted: params.retryAttempted,
    retryRescued: params.retryRescued,
    retryPendingAfter: params.retryPendingAfter,
    retryExhausted: params.retryExhausted,
  })
}
