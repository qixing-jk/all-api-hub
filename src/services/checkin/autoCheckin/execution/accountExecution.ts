import { type AccountLoginProvider } from "~/constants/accountLogin"
import {
  CHECK_IN_EXECUTION_SKIP_REASONS,
  CHECK_IN_METHOD_EXECUTION_RESULT_KINDS,
} from "~/constants/checkIn"
import { getLoginProviderClaimedByAnother } from "~/services/accountLogin/providerClaims"
import { accountCheckInState } from "~/services/accounts/accountStorage/accountCheckInState"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { toAutoCheckinSkipReason as toSchedulerSkipReason } from "~/services/checkin/autoCheckin/accountSnapshot"
import { logger } from "~/services/checkin/autoCheckin/diagnostics"
import { prepareAutomaticCheckIn } from "~/services/checkin/autoCheckin/discovery/automaticDiscovery"
import { resolveSelectedCheckInMethod } from "~/services/checkin/autoCheckin/discovery/inspection"
import { canAutomaticallyRetryCheckinResult } from "~/services/checkin/autoCheckin/execution/resultPolicy"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { resolveProviderErrorResult } from "~/services/checkin/autoCheckin/providers/shared"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import { type ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { type SiteAccount } from "~/types"
import {
  CHECKIN_ACCOUNT_STATE_DURABILITY,
  CHECKIN_RECONCILIATION_OUTCOME,
  CHECKIN_RESULT_STATUS,
  getAutoCheckinSkipReasonTranslationKey,
  type CheckinAccountResult,
  type CheckinResultStatus,
} from "~/types/autoCheckin"
import { type TempWindowRequestSource } from "~/types/tempWindowFetch"
import { getErrorMessage } from "~/utils/core/error"

export interface RunAccountCheckinOptions {
  requireStatusConfirmationBeforeMutation?: boolean
  allowAutomaticDiscovery?: boolean
  /**
   * Provider ownership resolved over the full stored account list. Absent means
   * the guard could not be evaluated and the run stays unblocked.
   */
  loginProviderOwners?: ReadonlyMap<AccountLoginProvider, SiteAccount>
}

/** Executes the selected method and preserves mutation certainty, discovery, and persistence outcomes. */
export async function executeAccountCheckin(
  account: SiteAccount,
  accountName: string,
  tempWindowRequestSource: TempWindowRequestSource,
  protectionBypassExecution: ProtectionBypassExecution,
  {
    requireStatusConfirmationBeforeMutation = false,
    allowAutomaticDiscovery = false,
    loginProviderOwners,
  }: RunAccountCheckinOptions = {},
): Promise<{
  result: CheckinAccountResult
}> {
  const buildResult = (
    status: CheckinResultStatus,
    partial?: Partial<
      Pick<
        CheckinAccountResult,
        | "message"
        | "messageKey"
        | "messageParams"
        | "rawMessage"
        | "reasonCode"
        | "retryable"
        | "methodId"
        | "reconciliation"
        | "accountStateDurability"
        | "reward"
      >
    >,
  ): CheckinAccountResult =>
    ({
      accountId: account.id,
      accountName,
      status,
      ...(partial ?? {}),
      timestamp: Date.now(),
    }) as CheckinAccountResult

  // One shared browser login context per provider: only the owning account may
  // run, so stale or imported duplicates are skipped before any network or
  // browser work instead of driving a second OAuth identity. The eligibility
  // inspection carries the guard, so this skips with the same reason code as
  // the snapshot path. Callers that already filtered the account out through
  // its snapshot never reach this.
  try {
    const context = { tempWindowRequestSource, protectionBypassExecution }
    const execute = async () =>
      executeSelectedCheckIn({
        account,
        globalAutomaticExecutionEnabled:
          !allowAutomaticDiscovery || (await isAutomaticExecutionEnabled()),
        loginProviderClaimedByAnother:
          getLoginProviderClaimedByAnother(account, loginProviderOwners) !==
          null,
        ...(allowAutomaticDiscovery
          ? {
              isAutomaticExecutionEnabled: () => isAutomaticExecutionEnabled(),
            }
          : {}),
        context,
        revalidateAccount: (refreshedConfig) =>
          accountCheckInState.prepareAccountForSelectedCheckIn(
            account.id,
            refreshedConfig,
            account,
          ),
        requireStatusConfirmationBeforeMutation,
      })

    let execution = await execute()
    if (
      allowAutomaticDiscovery &&
      !requireStatusConfirmationBeforeMutation &&
      execution.kind === CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped &&
      execution.reason === CHECK_IN_EXECUTION_SKIP_REASONS.MethodUnsupported
    ) {
      // This result proves the old method stopped before POST. Recover at most
      // once; failed or uncertain mutation results never enter this path.
      const latest = await accountQueries.getAccountById(account.id)
      const prepared = latest
        ? await prepareAutomaticCheckIn({
            account: latest,
            context,
            isAutomaticExecutionEnabled: () => isAutomaticExecutionEnabled(),
          })
        : { account: null, discovered: false }
      if (!prepared.account) {
        execution = {
          kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Blocked,
          reason: CHECK_IN_EXECUTION_SKIP_REASONS.AccountUnavailable,
          retryable: false,
        }
      } else if (prepared.discovered) {
        account = prepared.account
        execution = await execute()
      }
    }
    if (execution.kind !== CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Executed) {
      const reasonCode = toSchedulerSkipReason(execution.reason)
      const blocked =
        execution.kind === CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Blocked
      return {
        result: buildResult(
          blocked
            ? CHECKIN_RESULT_STATUS.FAILED
            : CHECKIN_RESULT_STATUS.SKIPPED,
          {
            messageKey: getAutoCheckinSkipReasonTranslationKey(reasonCode),
            reasonCode,
            ...(execution.kind ===
            CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Blocked
              ? { retryable: execution.retryable }
              : {}),
          },
        ),
      }
    }
    const providerResult = execution.result
    const result = buildResult(providerResult.status, {
      messageKey: providerResult.messageKey,
      messageParams: providerResult.messageParams,
      rawMessage: providerResult.rawMessage,
      reasonCode: providerResult.reasonCode,
      methodId: execution.methodId,
      reconciliation: providerResult.reconciliation,
      reward: providerResult.reward,
      ...(providerResult.status === CHECKIN_RESULT_STATUS.FAILED ||
      providerResult.status === CHECKIN_RESULT_STATUS.UNCERTAIN
        ? { retryable: execution.retryable === true }
        : {}),
    })

    if (
      providerResult.status === CHECKIN_RESULT_STATUS.SUCCESS ||
      providerResult.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED
    ) {
      const persisted = await accountCheckInState.markAccountAsSiteCheckedIn(
        account.id,
      )
      result.accountStateDurability =
        persisted === false
          ? CHECKIN_ACCOUNT_STATE_DURABILITY.FAILED
          : CHECKIN_ACCOUNT_STATE_DURABILITY.PERSISTED
      logger.info("Check-in completed", {
        accountId: account.id,
        siteName: account.site_name,
        status: providerResult.status,
        message: providerResult.rawMessage ?? providerResult.messageKey ?? "",
      })
      return { result }
    }

    logger.warn("Check-in failed", {
      accountId: account.id,
      siteName: account.site_name,
      status: providerResult.status,
      message: providerResult.rawMessage ?? providerResult.messageKey ?? "",
    })
    return { result }
  } catch (error) {
    const errorMessage = getErrorMessage(error)
    const normalizedError = resolveProviderErrorResult({ error })
    logger.error("Check-in error", {
      accountId: account.id,
      siteName: account.site_name,
      error: errorMessage,
    })
    // The provider graph crashed instead of reporting an outcome, so this
    // result is produced here instead of by the execution layer. It still
    // goes through the shared retry authority: the same reason codes that
    // admit a reported failure admit this one, and a dead end stays refused.
    const methodId = resolveSelectedCheckInMethod({
      config: account.checkIn,
      siteType: account.site_type,
      siteUrl: account.site_url,
    })
    const retryable = canAutomaticallyRetryCheckinResult(
      normalizedError,
      methodId ?? undefined,
    )
    return {
      result: buildResult(normalizedError.status, {
        // Every other produced result names its method. Naming it here too
        // keeps capability gating (status readback, the not-repeat-safe set)
        // working for a row that came from a crash.
        ...(methodId ? { methodId } : {}),
        messageKey: normalizedError.messageKey,
        messageParams: normalizedError.messageParams,
        rawMessage: normalizedError.rawMessage,
        reasonCode: normalizedError.reasonCode,
        ...(normalizedError.status === CHECKIN_RESULT_STATUS.FAILED ||
        normalizedError.status === CHECKIN_RESULT_STATUS.UNCERTAIN
          ? { retryable }
          : {}),
        ...(normalizedError.status === CHECKIN_RESULT_STATUS.UNCERTAIN
          ? {
              reconciliation: CHECKIN_RECONCILIATION_OUTCOME.UNAVAILABLE,
            }
          : {}),
      }),
    }
  }
}

/** Reads the latest global switch before automatic discovery or execution. */
export async function isAutomaticExecutionEnabled(): Promise<boolean> {
  const preferences = await userPreferences.getPreferences()
  return (preferences.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!)
    .globalEnabled
}
