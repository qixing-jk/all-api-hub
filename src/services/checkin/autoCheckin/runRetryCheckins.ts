import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { buildAccountDisplayNameMap } from "~/services/accounts/utils/accountDisplayName"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { PRODUCT_ANALYTICS_MODE_IDS } from "~/services/productAnalytics/contracts"
import { type ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  getAutoCheckinRunResultFromSummary,
  getAutoCheckinSkipReasonTranslationKey,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import { type TempWindowRequestSource } from "~/types/tempWindowFetch"
import { formatLocalDayKey } from "~/utils/core/dayKey"

import { logger } from "./diagnostics"
import { mergeRetryRunOutcomes } from "./retryQueue"
import { accountCheckinRunWorkflow } from "./runAccountWorkflow"
import type { AutoCheckinRetryScheduling } from "./runContracts"
import {
  notifyScheduledRunResult,
  notifyUiRunCompleted,
  trackBackgroundAutoCheckinCompleted,
  trackBackgroundAutoCheckinRunAnalytics,
} from "./runPresentation"
import {
  buildAccountSnapshot,
  isSuccessfulCheckinStatus,
  recalculateSummaryFromResults,
  updateSnapshotWithResult,
} from "./runResults"
import { autoCheckinStorage } from "./storage"

/**
 * Execute account-level retries for the current day.
 *
 * This MUST only retry accounts from today's retry queue.
 *
 * Attempt counting:
 * - `attemptsByAccount[id]` starts at 1 for the initial daily run failure.
 * - Each automatic retry increments the count.
 * - Retries stop once `attempts >= retryStrategy.maxAttemptsPerDay`.
 */
export async function runRetryCheckins(
  tempWindowRequestSource: TempWindowRequestSource,
  protectionBypassExecution: ProtectionBypassExecution,
  retryScheduling: AutoCheckinRetryScheduling,
): Promise<void> {
  const startTime = Date.now()
  const now = new Date()
  const today = formatLocalDayKey(now)

  const prefs = await userPreferences.getPreferences()
  const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
  // Treat missing values as enabled to preserve backward compatibility with older stored prefs.
  const notifyUiOnCompletion = config.notifyUiOnCompletion !== false
  const currentStatus = await autoCheckinStorage.getStatus()
  const allAccounts = await accountQueries.getAllAccounts()
  const accountDisplayNameById = buildAccountDisplayNameMap(allAccounts)

  if (!config.globalEnabled || !config.retryStrategy?.enabled) {
    logger.info("Retry skipped (feature disabled)")
    await retryScheduling.clearRetryAlarmAndState()
    return
  }

  // Same-day queue only. Do not require the daily alarm to have run.
  if (currentStatus?.retryState?.day !== today) {
    logger.info("Retry skipped (no same-day queue)")
    await retryScheduling.clearRetryAlarmAndState()
    return
  }

  // Ensure we have a retry state with pending accounts
  const retryState = currentStatus.retryState
  if (!retryState || retryState.pendingAccountIds.length === 0) {
    logger.info("Retry skipped (no pending accounts)")
    await retryScheduling.clearRetryAlarm(
      config.retryStrategy.maxAttemptsPerDay,
    )
    return
  }

  const maxAttempts = config.retryStrategy.maxAttemptsPerDay
  const retryPendingBefore = retryState.pendingAccountIds.length
  let retryExhausted = 0

  const updates: Record<string, CheckinAccountResult> = {}
  const attemptedAccountIds: string[] = []
  const updatedAccountIds: string[] = []
  const accountIdsToRefresh: string[] = []
  const loginProviderOwners =
    await accountCheckinRunWorkflow.resolveLoginProviderOwners(allAccounts)

  for (const accountId of retryState.pendingAccountIds) {
    // Default to 1 to represent the initial daily run failure when the stored map is missing.
    const attempts = retryState.attemptsByAccount?.[accountId] ?? 1
    if (attempts >= maxAttempts) {
      retryExhausted += 1
      continue
    }

    const account = await accountQueries.getAccountById(accountId)
    if (!account || account.disabled === true) {
      updates[accountId] = {
        accountId,
        accountName: account
          ? accountDisplayNameById.get(account.id) ?? account.id
          : accountId,
        status: CHECKIN_RESULT_STATUS.SKIPPED,
        messageKey: getAutoCheckinSkipReasonTranslationKey(
          AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
        ),
        reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
        timestamp: Date.now(),
      }
      continue
    }

    const snapshot = buildAccountSnapshot(
      account,
      accountDisplayNameById.get(account.id) ?? account.id,
      loginProviderOwners,
    )
    if (snapshot.skipReason) {
      updates[accountId] = {
        accountId,
        accountName: snapshot.accountName,
        status: CHECKIN_RESULT_STATUS.SKIPPED,
        messageKey: getAutoCheckinSkipReasonTranslationKey(snapshot.skipReason),
        reasonCode: snapshot.skipReason,
        timestamp: Date.now(),
      }
      continue
    }

    const outcome = await accountCheckinRunWorkflow.runAccountCheckin(
      account,
      accountDisplayNameById.get(account.id) ?? account.id,
      tempWindowRequestSource,
      protectionBypassExecution,
      {
        requireStatusConfirmationBeforeMutation: true,
        loginProviderOwners,
      },
    )
    // This account spent one of the day's attempts, whatever the outcome.
    attemptedAccountIds.push(accountId)
    updates[accountId] = outcome.result
    if (isSuccessfulCheckinStatus(outcome.result.status)) {
      updatedAccountIds.push(outcome.result.accountId)
    }
    if (outcome.result.status === CHECKIN_RESULT_STATUS.SUCCESS) {
      accountIdsToRefresh.push(outcome.result.accountId)
    }
  }

  // Derived from the stored status inside the update so a run that persisted
  // while this one was executing is not reverted. The result carries what was
  // persisted to the notifications and analytics below.
  const { result: retryOutcome } = await autoCheckinStorage.updateStatus(
    (current) => {
      const perAccount: Record<string, CheckinAccountResult> = {
        ...(current?.perAccount ?? {}),
        ...updates,
      }

      const summary = recalculateSummaryFromResults(
        perAccount,
        current?.summary,
      )

      let nextSnapshots = current?.accountsSnapshot
      for (const result of Object.values(updates)) {
        nextSnapshots = updateSnapshotWithResult(nextSnapshots, result)
      }

      const nextRetryState = mergeRetryRunOutcomes({
        today,
        maxAttempts,
        current: current?.retryState,
        attemptedAccountIds,
        results: updates,
      })

      return {
        result: {
          summary,
          accountsSnapshot: nextSnapshots,
          nextRetryState,
        },
        patch: {
          lastRunAt: new Date().toISOString(),
          lastRunResult: getAutoCheckinRunResultFromSummary(summary),
          perAccount,
          summary,
          accountsSnapshot: nextSnapshots,
          retryState: nextRetryState,
          pendingRetry: Boolean(nextRetryState?.pendingAccountIds.length),
          nextRetryScheduledAt: undefined,
          retryAlarmTargetDay: undefined,
        },
      }
    },
  )

  await accountCheckinRunWorkflow.recordStarPromotionCheckinSuccesses(
    updatedAccountIds.length,
  )
  const summary =
    retryOutcome?.summary ?? recalculateSummaryFromResults(updates)
  const accountsSnapshot = retryOutcome?.accountsSnapshot
  const nextRetryState = retryOutcome?.nextRetryState

  await accountCheckinRunWorkflow.refreshAccountsAfterSuccessfulCheckins({
    accountIds: accountIdsToRefresh,
    force: true,
    tempWindowRequestSource,
    protectionBypassExecution,
  })

  if (notifyUiOnCompletion) {
    await notifyUiRunCompleted({
      runKind: "retry",
      updatedAccountIds,
      summary,
    })
  }

  const retryResults = Object.values(updates)
  const retrySuccessCount = retryResults.filter((result) =>
    isSuccessfulCheckinStatus(result.status),
  ).length
  const retryAlreadyCheckedCount = retryResults.filter(
    (result) => result.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
  ).length
  const retryFailedCount = retryResults.filter(
    (result) => result.status === CHECKIN_RESULT_STATUS.FAILED,
  ).length
  const retryUncertainCount = retryResults.filter(
    (result) => result.status === CHECKIN_RESULT_STATUS.UNCERTAIN,
  ).length
  const retrySkippedCount = retryResults.filter(
    (result) => result.status === CHECKIN_RESULT_STATUS.SKIPPED,
  ).length

  if (retryResults.length > 0) {
    await notifyScheduledRunResult({
      successCount: retrySuccessCount,
      alreadyCheckedCount: retryAlreadyCheckedCount,
      failedCount: retryFailedCount,
      uncertainCount: retryUncertainCount,
      skippedCount: retrySkippedCount,
      total: retryResults.length,
    })
    trackBackgroundAutoCheckinCompleted({
      summary: {
        totalEligible: retryResults.length,
        executed: retrySuccessCount + retryFailedCount + retryUncertainCount,
        successCount: retrySuccessCount,
        ...(retryAlreadyCheckedCount > 0
          ? { alreadyCheckedCount: retryAlreadyCheckedCount }
          : {}),
        failedCount: retryFailedCount,
        ...(retryUncertainCount > 0
          ? { uncertainCount: retryUncertainCount }
          : {}),
        skippedCount: retrySkippedCount,
        needsRetry: Boolean(nextRetryState?.pendingAccountIds.length),
      },
      durationMs: Date.now() - startTime,
      mode: PRODUCT_ANALYTICS_MODE_IDS.RetryFailed,
      retryAttempted: true,
      retryCount: retryResults.length,
    })
    trackBackgroundAutoCheckinRunAnalytics({
      runKind: "retry",
      snapshots:
        accountsSnapshot?.filter((snapshot) => updates[snapshot.accountId]) ??
        [],
      accounts: allAccounts,
      retryEnabled: config.retryStrategy?.enabled === true,
      retryPendingBefore,
      retryAttempted: retryResults.length,
      retryRescued: retrySuccessCount,
      retryPendingAfter: nextRetryState?.pendingAccountIds.length ?? 0,
      retryExhausted,
    })
  }
}
