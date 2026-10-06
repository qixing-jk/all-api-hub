import { type AccountLoginProvider } from "~/constants/accountLogin"
import {
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { resolveLoginProviderOwners } from "~/services/accountLogin/providerClaims"
import { loginProviderEvidence } from "~/services/accountLogin/providerEvidence"
import { accountCheckInState } from "~/services/accounts/accountStorage/accountCheckInState"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountRefresh } from "~/services/accounts/accountStorage/accountRefresh"
import { buildAccountDisplayNameMap } from "~/services/accounts/utils/accountDisplayName"
import { prepareAutomaticCheckIn } from "~/services/checkin/autoCheckin/automaticDiscovery"
import {
  getSelectedCheckInStatus,
  resolveSelectedCheckInMethod,
} from "~/services/checkin/autoCheckin/inspection"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  resolveProviderErrorResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import { recordSiteTypeObservationForResult } from "~/services/checkin/autoCheckin/recordSiteTypeObservation"
import {
  CHECK_IN_STATUS_REFRESH_OUTCOMES,
  refreshSelectedStatus,
} from "~/services/checkin/autoCheckin/refresh"
import { notifyTaskResult } from "~/services/notifications/taskNotificationService"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { PRODUCT_ANALYTICS_MODE_IDS } from "~/services/productAnalytics/contracts"
import { type ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { starPromotionState } from "~/services/starPromotion/state"
import { type SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_RUN_RESULT,
  AUTO_CHECKIN_RUN_TYPE,
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RECONCILIATION_OUTCOME,
  CHECKIN_RESULT_STATUS,
  getAutoCheckinRunResultFromSummary,
  getAutoCheckinSkipReasonTranslationKey,
  type AutoCheckinAccountSnapshot,
  type AutoCheckinPreferences,
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
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"

import {
  executeAccountCheckin,
  isAutomaticExecutionEnabled,
  type RunAccountCheckinOptions,
} from "./accountExecution"
import { logger } from "./diagnostics"
import {
  canAutomaticallyRetryCheckinResult,
  isRetryableCheckinResult,
} from "./resultPolicy"
import { mergeRetryRunOutcomes, mergeRunResults } from "./retryQueue"
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

interface AutoCheckinRetryScheduling {
  clearRetryAlarm(maxAttempts?: number): Promise<void>
  clearRetryAlarmAndState(): Promise<void>
  scheduleRetryAlarm(config: AutoCheckinPreferences): Promise<void>
}

type PostCheckinRefreshOutcome = "refreshed" | "unchanged" | "failed"

export class AutoCheckinRunEngine {
  constructor(private readonly retryScheduling: AutoCheckinRetryScheduling) {}

  /**
   * Post-checkin account refresh to ensure balances/quotas reflect the effect of a successful check-in.
   *
   * Notes:
   * - This MUST NOT invoke provider `checkIn` again; it uses the existing account refresh pipeline.
   * - Best-effort: failures are swallowed so check-in completion semantics are unchanged.
   * - API/page resources are limited by their owning lower layers.
   */
  private async refreshAccountsAfterSuccessfulCheckins(params: {
    accountIds: string[]
    force?: boolean
    tempWindowRequestSource?: TempWindowRequestSource
    protectionBypassExecution?: ProtectionBypassExecution
  }): Promise<void> {
    try {
      const uniqueAccountIds = Array.from(new Set(params.accountIds)).filter(
        (id) => typeof id === "string" && id.trim().length > 0,
      )

      if (uniqueAccountIds.length === 0) {
        return
      }

      let refreshedCount = 0
      let failedCount = 0

      const force = params.force ?? true
      const results = await Promise.all(
        uniqueAccountIds.map(
          async (accountId): Promise<PostCheckinRefreshOutcome> => {
            try {
              const result = params.tempWindowRequestSource
                ? await accountRefresh.refreshAccount(accountId, force, {
                    tempWindowRequestSource: params.tempWindowRequestSource,
                    ...(params.protectionBypassExecution
                      ? {
                          protectionBypassExecution:
                            params.protectionBypassExecution,
                        }
                      : {}),
                  })
                : await accountRefresh.refreshAccount(accountId, force)
              if (result?.refreshed === true) return "refreshed"
              if (result == null) return "failed"
              return "unchanged"
            } catch {
              return "failed"
            }
          },
        ),
      )

      for (const result of results) {
        if (result === "refreshed") {
          refreshedCount += 1
        } else if (result === "failed") {
          failedCount += 1
        }
      }

      logger.debug("Post-checkin refresh finished", {
        total: uniqueAccountIds.length,
        refreshedCount,
        failedCount,
      })
    } catch (error) {
      logger.warn("Post-checkin refresh failed", {
        error: getErrorMessage(error),
      })
    }
  }

  /**
   * Reports successful check-ins to the star promotion value signal. Non-positive
   * counts are no-ops in the state service, so callers can pass a raw tally.
   */
  private async recordStarPromotionCheckinSuccesses(
    count: number,
  ): Promise<void> {
    try {
      await starPromotionState.addCheckinSuccesses(count)
    } catch (error) {
      logger.warn("Failed to record star promotion check-in progress", {
        error: getErrorMessage(error),
      })
    }
  }

  /**
   * Resolves provider ownership together with the last observed login outcomes.
   *
   * Callers resolve this once per run so ownership cannot shift mid-run while
   * their own attempts are producing new evidence.
   */
  private async resolveLoginProviderOwners(
    accounts: readonly SiteAccount[],
  ): Promise<Map<AccountLoginProvider, SiteAccount>> {
    return resolveLoginProviderOwners(
      accounts,
      await loginProviderEvidence.readAll(),
    )
  }

  /**
   * Execute provider check-in for a single account and normalize the result.
   *
   * Notes:
   * - Provider `already_checked` is treated as a successful outcome (and should not enter retries).
   * - We mark the account as checked-in only for successful outcomes to keep local status fresh.
   * - A result a wrong site type explains leaves an observation other features read.
   */
  private async runAccountCheckin(
    account: SiteAccount,
    accountName: string,
    tempWindowRequestSource: TempWindowRequestSource,
    protectionBypassExecution: ProtectionBypassExecution,
    options: RunAccountCheckinOptions = {},
  ): Promise<{
    result: CheckinAccountResult
  }> {
    const outcome = await executeAccountCheckin(
      account,
      accountName,
      tempWindowRequestSource,
      protectionBypassExecution,
      options,
    )

    await recordSiteTypeObservationForResult(account, outcome.result, {
      protectionBypassExecution,
    })

    return outcome
  }

  private async runAccountCheckins(params: {
    accounts: SiteAccount[]
    accountDisplayNameById: Map<string, string>
    tempWindowRequestSource: TempWindowRequestSource
    protectionBypassExecution: ProtectionBypassExecution
    loginProviderOwners: ReadonlyMap<AccountLoginProvider, SiteAccount>
    allowAutomaticDiscovery?: boolean
  }): Promise<
    Array<{
      result: CheckinAccountResult
    }>
  > {
    return Promise.all(
      params.accounts.map(async (account) => {
        const accountName =
          params.accountDisplayNameById.get(account.id) ?? account.id
        try {
          return await this.runAccountCheckin(
            account,
            accountName,
            params.tempWindowRequestSource,
            params.protectionBypassExecution,
            {
              allowAutomaticDiscovery: params.allowAutomaticDiscovery,
              loginProviderOwners: params.loginProviderOwners,
            },
          )
        } catch (error) {
          // An unexpected throw never dispatched a mutation, so it is a plain
          // failure that still has to carry a filterable reason.
          const { reasonCode, messageKey, messageParams } =
            resolveProviderErrorResult({
              error,
              mutationDispatched: false,
            })
          const methodId = resolveSelectedCheckInMethod({
            config: account.checkIn,
            siteType: account.site_type,
            siteUrl: account.site_url,
          })
          return {
            result: {
              accountId: account.id,
              accountName,
              status: CHECKIN_RESULT_STATUS.FAILED,
              ...(methodId ? { methodId } : {}),
              ...(reasonCode ? { reasonCode } : {}),
              ...(messageKey ? { messageKey } : {}),
              ...(messageParams ? { messageParams } : {}),
              rawMessage: getErrorMessage(error),
              retryable: canAutomaticallyRetryCheckinResult(
                { status: CHECKIN_RESULT_STATUS.FAILED, reasonCode },
                methodId ?? undefined,
              ),
              timestamp: Date.now(),
            },
          }
        }
      }),
    )
  }

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
  async runCheckins(options: {
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

      return [
        ...nextSnapshots,
        ...attachResultsToSnapshots(missing, nextResults),
      ]
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
      const accountDisplayNameById =
        buildAccountDisplayNameMap(availableAccounts)
      // Resolve claims over every stored account, not the run's target subset:
      // a manual run of one account must still see the accounts that hold the
      // other provider claims. Last login outcomes decide between duplicates so
      // ownership settles on whichever account can actually sign in.
      const loginProviderOwners =
        await this.resolveLoginProviderOwners(availableAccounts)
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

      const checkinOutcomes = await this.runAccountCheckins({
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

      await this.recordStarPromotionCheckinSuccesses(updatedAccountIds.length)

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
          const mergedSummary = mergeSummaryIfNeeded(
            current,
            summary,
            perAccount,
          )
          const pendingRetry = Boolean(
            retryState?.day === today &&
              retryState.pendingAccountIds.length > 0,
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

      await this.refreshAccountsAfterSuccessfulCheckins({
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
  async runRetryCheckins(
    tempWindowRequestSource: TempWindowRequestSource,
    protectionBypassExecution: ProtectionBypassExecution,
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
      await this.retryScheduling.clearRetryAlarmAndState()
      return
    }

    // Same-day queue only. Do not require the daily alarm to have run.
    if (currentStatus?.retryState?.day !== today) {
      logger.info("Retry skipped (no same-day queue)")
      await this.retryScheduling.clearRetryAlarmAndState()
      return
    }

    // Ensure we have a retry state with pending accounts
    const retryState = currentStatus.retryState
    if (!retryState || retryState.pendingAccountIds.length === 0) {
      logger.info("Retry skipped (no pending accounts)")
      await this.retryScheduling.clearRetryAlarm(
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
      await this.resolveLoginProviderOwners(allAccounts)

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
          messageKey: getAutoCheckinSkipReasonTranslationKey(
            snapshot.skipReason,
          ),
          reasonCode: snapshot.skipReason,
          timestamp: Date.now(),
        }
        continue
      }

      const outcome = await this.runAccountCheckin(
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

    await this.recordStarPromotionCheckinSuccesses(updatedAccountIds.length)
    const summary =
      retryOutcome?.summary ?? recalculateSummaryFromResults(updates)
    const accountsSnapshot = retryOutcome?.accountsSnapshot
    const nextRetryState = retryOutcome?.nextRetryState

    await this.refreshAccountsAfterSuccessfulCheckins({
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

  /**
   * Manual retry for a single account.
   *
   * If this account is currently in today's retry queue, a successful manual retry removes it
   * from the pending list (and may clear the retry alarm if nothing else remains).
   */
  async retryAccount(
    accountId: string,
    tempWindowRequestSource: TempWindowRequestSource,
    protectionBypassExecution: ProtectionBypassExecution,
  ) {
    const today = formatLocalDayKey()
    const allAccounts = await accountQueries.getAllAccounts()
    const account = allAccounts.find((item) => item.id === accountId)
    const accountDisplayNameById = buildAccountDisplayNameMap(allAccounts)
    const loginProviderOwners =
      await this.resolveLoginProviderOwners(allAccounts)

    if (!account) {
      throw new Error(t("messages:storage.accountNotFound", { id: accountId }))
    }

    const result: CheckinAccountResult =
      account.disabled === true
        ? {
            accountId: account.id,
            accountName: accountDisplayNameById.get(account.id) ?? account.id,
            status: CHECKIN_RESULT_STATUS.SKIPPED,
            messageKey: getAutoCheckinSkipReasonTranslationKey(
              AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
            ),
            reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
            timestamp: Date.now(),
          }
        : (
            await this.runAccountCheckin(
              account,
              accountDisplayNameById.get(account.id) ?? account.id,
              tempWindowRequestSource,
              protectionBypassExecution,
              { loginProviderOwners },
            )
          ).result

    // Derived from the stored status inside the update so a run that persisted
    // while this one was executing is not reverted. The result carries what was
    // persisted back to the caller below.
    const retryPreferences = await userPreferences.getPreferences()
    const manualRetryConfig =
      retryPreferences.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin
    const manualRetryStrategy = manualRetryConfig?.retryStrategy
    const { result: retryOutcome } = await autoCheckinStorage.updateStatus(
      (current) => {
        const perAccount: Record<string, CheckinAccountResult> = {
          ...(current?.perAccount ?? {}),
          [result.accountId]: result,
        }

        const summary = recalculateSummaryFromResults(
          perAccount,
          current?.summary,
        )

        const retryState = mergeRunResults({
          today,
          // One strategy reading for every path. A manual retry must not admit a
          // queue that the retry run and the alarm would then refuse to process.
          enabled:
            manualRetryConfig?.globalEnabled === true &&
            manualRetryStrategy?.enabled === true,
          maxAttempts: manualRetryStrategy?.maxAttemptsPerDay ?? 0,
          current: current?.retryState,
          results: { [result.accountId]: result },
          replacePendingWithResults: false,
        })

        const pendingRetry = Boolean(
          retryState?.day === today && retryState.pendingAccountIds.length > 0,
        )

        return {
          result: { summary, pendingRetry },
          patch: {
            lastRunAt: new Date().toISOString(),
            lastRunResult: getAutoCheckinRunResultFromSummary(summary),
            perAccount,
            summary,
            retryState,
            pendingRetry,
            accountsSnapshot: updateSnapshotWithResult(
              current?.accountsSnapshot,
              result,
            ),
          },
        }
      },
    )

    if (isSuccessfulCheckinStatus(result.status)) {
      await this.recordStarPromotionCheckinSuccesses(1)
    }
    const summary: AutoCheckinRunSummary =
      retryOutcome?.summary ??
      recalculateSummaryFromResults({ [result.accountId]: result })
    const pendingRetry = retryOutcome?.pendingRetry ?? false

    // Reschedule retry alarm if needed (never touches the daily alarm schedule).
    const prefs = await userPreferences.getPreferences()
    const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
    await this.retryScheduling.scheduleRetryAlarm(config)

    return {
      result,
      summary,
      pendingRetry,
    }
  }

  /** Read the selected method status without executing a check-in mutation. */
  async verifyAccountStatus(accountId: string) {
    const account = await accountQueries.getAccountById(accountId)
    if (!account) {
      return {
        outcome: "account_not_found" as const,
        error: t("messages:storage.accountNotFound", { id: accountId }),
      }
    }

    let refreshOutcome
    const refreshedCheckIn = await refreshSelectedStatus({
      config: account.checkIn,
      siteType: account.site_type,
      account,
      observedAt: Date.now(),
      onOutcome: (outcome) => {
        refreshOutcome = outcome
      },
    })
    if (refreshOutcome === CHECK_IN_STATUS_REFRESH_OUTCOMES.Unsupported) {
      return {
        outcome: "unsupported" as const,
        error: t("autoCheckin:messages.error.statusVerificationUnsupported"),
      }
    }
    if (refreshOutcome !== CHECK_IN_STATUS_REFRESH_OUTCOMES.Read) {
      return {
        outcome: "unavailable" as const,
        error: t("autoCheckin:messages.error.statusVerificationFailed"),
      }
    }

    const persistedAccount =
      await accountCheckInState.prepareAccountForSelectedCheckIn(
        account.id,
        refreshedCheckIn,
      )
    if (!persistedAccount) {
      return {
        outcome: "not_saved" as const,
        error: t("autoCheckin:messages.error.statusVerificationNotSaved"),
      }
    }

    const selectedStatus = getSelectedCheckInStatus({
      config: refreshedCheckIn,
      siteType: account.site_type,
      siteUrl: account.site_url,
    })
    const isCheckedInToday =
      selectedStatus?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known &&
      selectedStatus.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked
    const isNotCheckedInToday =
      selectedStatus?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known &&
      selectedStatus.today === CHECK_IN_METHOD_TODAY_STATUSES.NotChecked

    const now = Date.now()
    const today = formatLocalDayKey()
    const allAccounts = await accountQueries.getAllAccounts()
    const accountDisplayNameById = buildAccountDisplayNameMap(allAccounts)
    const accountName = accountDisplayNameById.get(account.id) ?? account.id
    const selectedMethodId = resolveSelectedCheckInMethod({
      config: refreshedCheckIn,
      siteType: account.site_type,
      siteUrl: account.site_url,
    })
    const prefs = await userPreferences.getPreferences()
    const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!

    const statusUpdate = await autoCheckinStorage.updateStatus((current) => {
      if (!current) return { patch: null, result: false }

      const currentResult = current.perAccount?.[account.id]
      let updatedResult: CheckinAccountResult | undefined

      if (isCheckedInToday) {
        const sameDayReward =
          currentResult &&
          isSuccessfulCheckinStatus(currentResult.status) &&
          formatLocalDayKey(new Date(currentResult.timestamp)) === today
            ? currentResult.reward
            : undefined
        updatedResult = {
          accountId: account.id,
          accountName,
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          messageKey:
            AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
          reconciliation: CHECKIN_RECONCILIATION_OUTCOME.CHECKED,
          methodId: selectedMethodId ?? currentResult?.methodId,
          ...(sameDayReward !== undefined ? { reward: sameDayReward } : {}),
          timestamp: now,
        }
      } else if (isNotCheckedInToday) {
        const reasonCode =
          currentResult?.reasonCode ??
          AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED
        updatedResult = {
          accountId: account.id,
          accountName,
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode,
          messageKey: currentResult?.reasonCode
            ? currentResult.messageKey
            : getAutoCheckinSkipReasonTranslationKey(
                AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
              ),
          rawMessage: currentResult?.rawMessage,
          reconciliation: CHECKIN_RECONCILIATION_OUTCOME.NOT_CHECKED,
          retryable: canAutomaticallyRetryCheckinResult(
            {
              status: CHECKIN_RESULT_STATUS.FAILED,
              reasonCode,
            },
            selectedMethodId ?? currentResult?.methodId,
          ),
          methodId: selectedMethodId ?? currentResult?.methodId,
          timestamp: now,
        }
      }

      if (!updatedResult) {
        return { patch: null, result: false }
      }

      const perAccount: Record<string, CheckinAccountResult> = {
        ...(current.perAccount ?? {}),
        [account.id]: updatedResult,
      }
      const summary = recalculateSummaryFromResults(perAccount, current.summary)

      let retryState = current.retryState
      if (isCheckedInToday && retryState?.day === today) {
        const pendingAccountIds = retryState.pendingAccountIds.filter(
          (id) => id !== account.id,
        )
        retryState = {
          ...retryState,
          pendingAccountIds,
        }
      } else if (isNotCheckedInToday) {
        retryState = mergeRunResults({
          today,
          enabled:
            config.globalEnabled === true &&
            config.retryStrategy?.enabled === true,
          maxAttempts: config.retryStrategy?.maxAttemptsPerDay ?? 0,
          current: retryState,
          results: { [account.id]: updatedResult },
          replacePendingWithResults: false,
        })
      }

      const pendingRetry = Boolean(
        retryState?.day === today && retryState.pendingAccountIds.length > 0,
      )

      return {
        result: true,
        patch: {
          lastRunResult: getAutoCheckinRunResultFromSummary(summary),
          perAccount,
          summary,
          retryState,
          pendingRetry,
          accountsSnapshot: updateSnapshotWithResult(
            current.accountsSnapshot,
            updatedResult,
          ),
        },
      }
    })

    if (
      (isCheckedInToday || isNotCheckedInToday) &&
      (!statusUpdate.ok || statusUpdate.result !== true)
    ) {
      return {
        outcome: "not_saved" as const,
        error: t("autoCheckin:messages.error.statusVerificationNotSaved"),
      }
    }

    if (isCheckedInToday || isNotCheckedInToday) {
      await this.retryScheduling.scheduleRetryAlarm(config)
    }

    const verifiedStatus = isCheckedInToday
      ? ("checked" as const)
      : isNotCheckedInToday
        ? ("not_checked" as const)
        : ("unknown" as const)

    return {
      outcome: "verified" as const,
      verifiedStatus,
    }
  }
}
