import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { buildAccountDisplayNameMap } from "~/services/accounts/utils/accountDisplayName"
import { prepareAutomaticCheckIn } from "~/services/checkin/autoCheckin/automaticDiscovery"
import { notifyTaskResult } from "~/services/notifications/taskNotificationService"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import { PRODUCT_ANALYTICS_MODE_IDS } from "~/services/productAnalytics/contracts"
import { type ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { type SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_RUN_RESULT,
  AUTO_CHECKIN_RUN_TYPE,
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  getAutoCheckinRunResultFromSummary,
  getAutoCheckinSkipReasonTranslationKey,
  type AutoCheckinAccountSnapshot,
  type AutoCheckinRunSummary,
  type AutoCheckinRunType,
  type AutoCheckinStatus,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import {
  TASK_NOTIFICATION_STATUSES,
  TASK_NOTIFICATION_TASKS,
} from "~/types/taskNotifications"
import {
  TEMP_WINDOW_REQUEST_SOURCES,
  type TempWindowRequestSource,
} from "~/types/tempWindowFetch"
import { formatLocalDayKey } from "~/utils/core/dayKey"

import { isAutomaticExecutionEnabled } from "./accountExecution"
import { logger } from "./diagnostics"
import { isRetryableCheckinResult } from "./resultPolicy"
import { mergeRunResults } from "./retryQueue"
import { accountCheckinRunWorkflow } from "./runAccountWorkflow"
import {
  notifyScheduledRunResult,
  notifyUiRunCompleted,
  trackBackgroundAutoCheckinCompleted,
  trackBackgroundAutoCheckinRunAnalytics,
} from "./runPresentation"
import {
  attachResultsToSnapshots,
  buildAccountSnapshot,
  buildAnalyticsSnapshots,
  isFailedCheckinStatus,
  isSuccessfulCheckinStatus,
  recalculateSummaryFromResults,
  updateSnapshotWithResult,
} from "./runResults"
import { autoCheckinStorage } from "./storage"

/**
 * Execute check-ins for all eligible accounts, optionally scoped to a target set.
 *
 * Run types:
 * - `AUTO_CHECKIN_RUN_TYPE.DAILY`: invoked by the daily alarm. Records `lastDailyRunDay` and builds a retry queue
 *   from today's *failed* runnable accounts only.
 * - `AUTO_CHECKIN_RUN_TYPE.MANUAL`: invoked by the UI. Does not create a new retry queue, but can shrink an
 *   existing queue for today based on the latest results.
 *
 * Persisted method status is a display projection and may be stale. Providers
 * must return `already_checked` when appropriate.
 */
export async function runCheckins(options: {
  runType?: AutoCheckinRunType
  targetAccountIds?: string[]
  tempWindowRequestSource?: TempWindowRequestSource
  protectionBypassExecution: ProtectionBypassExecution
}): Promise<void> {
  // Default to manual runs for UI-triggered or debug entry points.
  const runType = options?.runType ?? AUTO_CHECKIN_RUN_TYPE.MANUAL
  const isDailyRun = runType === AUTO_CHECKIN_RUN_TYPE.DAILY
  const targetAccountIds = options?.targetAccountIds
  const tempWindowRequestSource =
    options?.tempWindowRequestSource ?? TEMP_WINDOW_REQUEST_SOURCES.Background
  const protectionBypassExecution = options.protectionBypassExecution
  const targetAccountIdSet =
    !isDailyRun &&
    Array.isArray(targetAccountIds) &&
    targetAccountIds.length > 0
      ? new Set(targetAccountIds)
      : null
  let notifyUiOnCompletion: boolean | null = null

  logger.info("Starting check-in execution", {
    runType,
    targetAccountCount: targetAccountIdSet?.size ?? null,
  })
  const startTime = Date.now()
  const now = new Date()
  const today = formatLocalDayKey(now)
  const mergeHistory = Boolean(targetAccountIdSet)

  // Scoped runs merge their results into whatever the status holds when the
  // write happens, so `base` is threaded through from the patch instead of
  // being captured from a snapshot read here.
  const mergePerAccountIfNeeded = (
    base: AutoCheckinStatus | null,
    nextResults: Record<string, CheckinAccountResult>,
  ): Record<string, CheckinAccountResult> => {
    if (!mergeHistory) return nextResults
    return {
      ...(base?.perAccount ?? {}),
      ...nextResults,
    }
  }

  const mergeAccountsSnapshotIfNeeded = (
    base: AutoCheckinStatus | null,
    currentRunSnapshots: AutoCheckinAccountSnapshot[],
    nextResults: Record<string, CheckinAccountResult>,
  ): AutoCheckinAccountSnapshot[] => {
    if (!mergeHistory) {
      return attachResultsToSnapshots(currentRunSnapshots, nextResults)
    }

    let nextSnapshots = base?.accountsSnapshot
    if (!nextSnapshots || nextSnapshots.length === 0) {
      return attachResultsToSnapshots(currentRunSnapshots, nextResults)
    }

    for (const result of Object.values(nextResults)) {
      nextSnapshots =
        updateSnapshotWithResult(nextSnapshots, result) ?? nextSnapshots
    }

    const existingIds = new Set(
      nextSnapshots.map((snapshot) => snapshot.accountId),
    )
    const missing = currentRunSnapshots.filter(
      (snapshot) => !existingIds.has(snapshot.accountId),
    )
    if (missing.length === 0) return nextSnapshots

    return [...nextSnapshots, ...attachResultsToSnapshots(missing, nextResults)]
  }

  const mergeSummaryIfNeeded = (
    base: AutoCheckinStatus | null,
    summary: AutoCheckinRunSummary,
    perAccount: Record<string, CheckinAccountResult>,
  ): AutoCheckinRunSummary => {
    if (!mergeHistory) return summary
    return recalculateSummaryFromResults(perAccount, base?.summary ?? summary)
  }

  try {
    // Get preferences
    const prefs = await userPreferences.getPreferences()
    const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
    // Treat missing values as enabled to preserve backward compatibility with older stored prefs.
    notifyUiOnCompletion = config.notifyUiOnCompletion !== false

    // The global switch controls unattended automatic runs. Explicit manual
    // runs, including an unscoped batch run from the UI, remain available.
    if (!config.globalEnabled && isDailyRun) {
      logger.info("Global feature disabled; skipping")
      return
    }

    // Get all accounts, then exclude disabled accounts from runnable selection.
    // Disabled accounts must not participate, but we still record an explicit
    // skip reason so background status/history can explain why an account was skipped.
    const availableAccounts = await accountQueries.getAllAccounts()
    const accountDisplayNameById = buildAccountDisplayNameMap(availableAccounts)
    // Resolve claims over every stored account, not the run's target subset:
    // a manual run of one account must still see the accounts that hold the
    // other provider claims. Last login outcomes decide between duplicates so
    // ownership settles on whichever account can actually sign in.
    const loginProviderOwners =
      await accountCheckinRunWorkflow.resolveLoginProviderOwners(
        availableAccounts,
      )
    let allAccounts = targetAccountIdSet
      ? availableAccounts.filter((account) =>
          targetAccountIdSet.has(account.id),
        )
      : availableAccounts
    const preparationFailedIds = new Set<string>()
    if (isDailyRun) {
      // Unselected automatic accounts must reach discovery before readiness
      // filtering. Probes retain the normal transport's per-site limits.
      allAccounts = await Promise.all(
        allAccounts.map(async (account) => {
          const prepared = await prepareAutomaticCheckIn({
            account,
            context: { tempWindowRequestSource, protectionBypassExecution },
            isAutomaticExecutionEnabled: () => isAutomaticExecutionEnabled(),
          })
          if (!prepared.account) preparationFailedIds.add(account.id)
          return prepared.account ?? account
        }),
      )
    }
    const automaticExecutionEnabled =
      !isDailyRun || (await isAutomaticExecutionEnabled())
    const enabledAccounts = allAccounts.filter(
      (account) => account.disabled !== true,
    )
    const disabledAccounts = allAccounts.filter(
      (account) => account.disabled === true,
    )

    const accountSnapshots: AutoCheckinAccountSnapshot[] = []
    const runnableAccounts: SiteAccount[] = []

    // Build snapshots and determine runnable accounts
    for (const account of enabledAccounts) {
      const snapshot = buildAccountSnapshot(
        account,
        accountDisplayNameById.get(account.id) ?? account.id,
        loginProviderOwners,
      )
      if (!automaticExecutionEnabled) {
        snapshot.skipReason = AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED
      } else if (preparationFailedIds.has(account.id)) {
        snapshot.skipReason = AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE
      }
      accountSnapshots.push(snapshot)
      if (!snapshot.skipReason) {
        runnableAccounts.push(account)
      }
    }

    const results: Record<string, CheckinAccountResult> = {}
    const timestamp = Date.now()

    for (const account of disabledAccounts) {
      results[account.id] = {
        accountId: account.id,
        accountName: accountDisplayNameById.get(account.id) ?? account.id,
        status: CHECKIN_RESULT_STATUS.SKIPPED,
        messageKey: getAutoCheckinSkipReasonTranslationKey(
          AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
        ),
        reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
        timestamp,
      }
    }

    // Record skipped accounts to results
    for (const snapshot of accountSnapshots) {
      if (snapshot.skipReason) {
        results[snapshot.accountId] = {
          accountId: snapshot.accountId,
          accountName: snapshot.accountName,
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          messageKey: getAutoCheckinSkipReasonTranslationKey(
            snapshot.skipReason,
          ),
          reasonCode: snapshot.skipReason,
          timestamp,
        }
      }
    }

    logger.debug("Prepared check-in execution set", {
      selectedMethodCount: accountSnapshots.filter(
        (snapshot) => snapshot.detectionEnabled,
      ).length,
      runnableCount: runnableAccounts.length,
    })

    // If no accounts to run, save status and exit
    if (runnableAccounts.length === 0) {
      const summary: AutoCheckinRunSummary = {
        totalEligible: accountSnapshots.length,
        executed: 0,
        successCount: 0,
        failedCount: 0,
        skippedCount: accountSnapshots.length,
        needsRetry: false,
      }
      const analyticsSnapshots = buildAnalyticsSnapshots(
        allAccounts,
        accountDisplayNameById,
        results,
        loginProviderOwners,
      )

      const { result: runSummary } = await autoCheckinStorage.updateStatus(
        (current) => {
          const perAccount = mergePerAccountIfNeeded(current, results)
          const accountsSnapshot = mergeAccountsSnapshotIfNeeded(
            current,
            accountSnapshots,
            results,
          )
          const mergedSummary = mergeSummaryIfNeeded(
            current,
            summary,
            perAccount,
          )

          return {
            result: mergedSummary,
            patch: {
              lastRunAt: new Date().toISOString(),
              lastRunResult: AUTO_CHECKIN_RUN_RESULT.SKIPPED,
              perAccount,
              summary: mergedSummary,
              accountsSnapshot,
              ...(isDailyRun
                ? {
                    lastDailyRunDay: today,
                    retryState: undefined,
                    nextRetryScheduledAt: undefined,
                    retryAlarmTargetDay: undefined,
                    pendingRetry: false,
                  }
                : {}),
            },
          }
        },
      )
      const mergedSummary = runSummary ?? summary

      if (notifyUiOnCompletion) {
        await notifyUiRunCompleted({
          runKind: runType,
          updatedAccountIds: [],
          summary: mergedSummary,
        })
      }
      if (isDailyRun) {
        trackBackgroundAutoCheckinCompleted({
          summary: mergedSummary,
          durationMs: Date.now() - startTime,
          mode: PRODUCT_ANALYTICS_MODE_IDS.TelemetryAuto,
          retryAttempted: false,
          retryCount: 0,
        })
        trackBackgroundAutoCheckinRunAnalytics({
          runKind: runType,
          snapshots: analyticsSnapshots,
          accounts: allAccounts,
          retryEnabled: config.retryStrategy?.enabled === true,
          retryPendingBefore: 0,
          retryAttempted: 0,
          retryRescued: 0,
          retryPendingAfter: 0,
          retryExhausted: 0,
        })
      }
      return
    }

    // API/page resources are limited by their owning lower layers.
    let successCount = 0
    let alreadyCheckedCount = 0
    let failedCount = 0
    let uncertainCount = 0

    const checkinOutcomes = await accountCheckinRunWorkflow.runAccountCheckins({
      accounts: runnableAccounts,
      accountDisplayNameById,
      tempWindowRequestSource,
      protectionBypassExecution,
      loginProviderOwners,
      allowAutomaticDiscovery: isDailyRun,
    })

    for (const outcome of checkinOutcomes) {
      results[outcome.result.accountId] = outcome.result
      if (isSuccessfulCheckinStatus(outcome.result.status)) {
        successCount++
        if (outcome.result.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED) {
          alreadyCheckedCount++
        }
      } else if (isFailedCheckinStatus(outcome.result.status)) {
        failedCount++
      } else if (outcome.result.status === CHECKIN_RESULT_STATUS.UNCERTAIN) {
        uncertainCount++
      }
    }

    const runtimeSkippedCount = checkinOutcomes.filter(
      (outcome) => outcome.result.status === CHECKIN_RESULT_STATUS.SKIPPED,
    ).length
    const skippedCount =
      accountSnapshots.length - runnableAccounts.length + runtimeSkippedCount
    const summaryNeedsRetry = checkinOutcomes.some((outcome) =>
      isRetryableCheckinResult(outcome.result),
    )

    const summary: AutoCheckinRunSummary = {
      totalEligible: accountSnapshots.length,
      executed: successCount + failedCount + uncertainCount,
      successCount,
      ...(alreadyCheckedCount > 0 ? { alreadyCheckedCount } : {}),
      failedCount,
      skippedCount,
      ...(uncertainCount > 0 ? { uncertainCount } : {}),
      needsRetry: summaryNeedsRetry,
    }
    const updatedAccountIds = checkinOutcomes
      .filter((outcome) => isSuccessfulCheckinStatus(outcome.result.status))
      .map((outcome) => outcome.result.accountId)

    await accountCheckinRunWorkflow.recordStarPromotionCheckinSuccesses(
      updatedAccountIds.length,
    )

    const accountIdsToRefresh = checkinOutcomes
      .filter(
        (outcome) => outcome.result.status === CHECKIN_RESULT_STATUS.SUCCESS,
      )
      .map((outcome) => outcome.result.accountId)

    const analyticsSnapshots = buildAnalyticsSnapshots(
      allAccounts,
      accountDisplayNameById,
      results,
      loginProviderOwners,
    )

    // The retry queue and the merged history are derived from the stored
    // status, so they are computed inside the update: a run that finished
    // while this one was executing keeps its results instead of being
    // reverted.
    const { result: runOutcome } = await autoCheckinStorage.updateStatus(
      (current) => {
        const retryStrategy = config.retryStrategy
        const retryState = mergeRunResults({
          today,
          enabled:
            config.globalEnabled === true && retryStrategy?.enabled === true,
          maxAttempts: retryStrategy?.maxAttemptsPerDay ?? 0,
          current: current?.retryState,
          results,
          replacePendingWithResults: isDailyRun,
        })

        const perAccount = mergePerAccountIfNeeded(current, results)
        const accountsSnapshot = mergeAccountsSnapshotIfNeeded(
          current,
          accountSnapshots,
          results,
        )
        const mergedSummary = mergeSummaryIfNeeded(current, summary, perAccount)
        const pendingRetry = Boolean(
          retryState?.day === today && retryState.pendingAccountIds.length > 0,
        )

        return {
          result: {
            mergedSummary,
            retryPendingAfter: retryState?.pendingAccountIds.length ?? 0,
          },
          patch: {
            lastRunAt: new Date().toISOString(),
            lastRunResult: getAutoCheckinRunResultFromSummary(mergedSummary),
            perAccount,
            summary: mergedSummary,
            retryState,
            pendingRetry,
            accountsSnapshot,
            ...(isDailyRun
              ? {
                  lastDailyRunDay: today,
                  nextRetryScheduledAt: undefined,
                  retryAlarmTargetDay: undefined,
                }
              : {}),
          },
        }
      },
    )
    const mergedSummary = runOutcome?.mergedSummary ?? summary
    const retryPendingAfter = runOutcome?.retryPendingAfter ?? 0

    await accountCheckinRunWorkflow.refreshAccountsAfterSuccessfulCheckins({
      accountIds: accountIdsToRefresh,
      force: true,
      tempWindowRequestSource,
      protectionBypassExecution,
    })

    if (notifyUiOnCompletion) {
      await notifyUiRunCompleted({
        runKind: runType,
        updatedAccountIds,
        summary: mergedSummary,
      })
    }

    if (isDailyRun) {
      await notifyScheduledRunResult({
        successCount,
        alreadyCheckedCount,
        failedCount,
        uncertainCount,
        skippedCount,
        total: runnableAccounts.length + skippedCount,
      })
      trackBackgroundAutoCheckinCompleted({
        summary: mergedSummary,
        durationMs: Date.now() - startTime,
        mode: PRODUCT_ANALYTICS_MODE_IDS.TelemetryAuto,
        retryAttempted: false,
        retryCount: 0,
      })
      trackBackgroundAutoCheckinRunAnalytics({
        runKind: runType,
        snapshots: analyticsSnapshots,
        accounts: allAccounts,
        retryEnabled: config.retryStrategy?.enabled === true,
        retryPendingBefore: 0,
        retryAttempted: 0,
        retryRescued: 0,
        retryPendingAfter,
        retryExhausted: 0,
      })
    }

    const duration = Date.now() - startTime
    logger.info("Execution completed", {
      durationMs: duration,
      successCount,
      failedCount,
    })
  } catch (error) {
    logger.error("Execution failed", error)
    await autoCheckinStorage.updateStatus((current) => ({
      patch: {
        lastRunAt: new Date().toISOString(),
        lastRunResult: AUTO_CHECKIN_RUN_RESULT.FAILED,
        perAccount: mergeHistory ? current?.perAccount ?? {} : {},
        pendingRetry: false,
        retryState: isDailyRun ? undefined : current?.retryState,
        ...(isDailyRun
          ? {
              lastDailyRunDay: today,
              nextRetryScheduledAt: undefined,
              retryAlarmTargetDay: undefined,
            }
          : {}),
      },
    }))

    if (notifyUiOnCompletion === null) {
      try {
        const prefs = await userPreferences.getPreferences()
        const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
        notifyUiOnCompletion = config.notifyUiOnCompletion !== false
      } catch {
        // ignore; execution already persisted status
      }
    }

    if (notifyUiOnCompletion) {
      await notifyUiRunCompleted({
        runKind: runType,
        updatedAccountIds: [],
      })
    }

    if (isDailyRun) {
      await notifyTaskResult({
        task: TASK_NOTIFICATION_TASKS.AutoCheckin,
        status: TASK_NOTIFICATION_STATUSES.Failure,
      })
    }
  }
}
