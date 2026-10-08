import {
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { accountCheckInState } from "~/services/accounts/accountStorage/accountCheckInState"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { buildAccountDisplayNameMap } from "~/services/accounts/utils/accountDisplayName"
import {
  getSelectedCheckInStatus,
  resolveSelectedCheckInMethod,
} from "~/services/checkin/autoCheckin/inspection"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS } from "~/services/checkin/autoCheckin/providers/shared"
import {
  CHECK_IN_STATUS_REFRESH_OUTCOMES,
  refreshSelectedStatus,
} from "~/services/checkin/autoCheckin/refresh"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import { type ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RECONCILIATION_OUTCOME,
  CHECKIN_RESULT_STATUS,
  getAutoCheckinRunResultFromSummary,
  getAutoCheckinSkipReasonTranslationKey,
  type AutoCheckinRunSummary,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import { type TempWindowRequestSource } from "~/types/tempWindowFetch"
import { formatLocalDayKey } from "~/utils/core/dayKey"
import { t } from "~/utils/i18n/core"

import { canAutomaticallyRetryCheckinResult } from "./resultPolicy"
import { mergeRunResults } from "./retryQueue"
import { accountCheckinRunWorkflow } from "./runAccountWorkflow"
import type { AutoCheckinRetryScheduling } from "./runContracts"
import {
  isSuccessfulCheckinStatus,
  recalculateSummaryFromResults,
  updateSnapshotWithResult,
} from "./runResults"
import { autoCheckinStorage } from "./storage"

/**
 * Manual retry for a single account.
 *
 * If this account is currently in today's retry queue, a successful manual retry removes it
 * from the pending list (and may clear the retry alarm if nothing else remains).
 */
export async function retryAccount(
  accountId: string,
  tempWindowRequestSource: TempWindowRequestSource,
  protectionBypassExecution: ProtectionBypassExecution,
  retryScheduling: AutoCheckinRetryScheduling,
) {
  const today = formatLocalDayKey()
  const allAccounts = await accountQueries.getAllAccounts()
  const account = allAccounts.find((item) => item.id === accountId)
  const accountDisplayNameById = buildAccountDisplayNameMap(allAccounts)
  const loginProviderOwners =
    await accountCheckinRunWorkflow.resolveLoginProviderOwners(allAccounts)

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
          await accountCheckinRunWorkflow.runAccountCheckin(
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
    await accountCheckinRunWorkflow.recordStarPromotionCheckinSuccesses(1)
  }
  const summary: AutoCheckinRunSummary =
    retryOutcome?.summary ??
    recalculateSummaryFromResults({ [result.accountId]: result })
  const pendingRetry = retryOutcome?.pendingRetry ?? false

  // Reschedule retry alarm if needed (never touches the daily alarm schedule).
  const prefs = await userPreferences.getPreferences()
  const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
  await retryScheduling.scheduleRetryAlarm(config)

  return {
    result,
    summary,
    pendingRetry,
  }
}

/** Read the selected method status without executing a check-in mutation. */
export async function verifyAccountStatus(
  accountId: string,
  retryScheduling: AutoCheckinRetryScheduling,
) {
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
    await retryScheduling.scheduleRetryAlarm(config)
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
