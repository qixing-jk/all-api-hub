import { type AccountLoginProvider } from "~/constants/accountLogin"
import { resolveLoginProviderOwners } from "~/services/accountLogin/providerClaims"
import { loginProviderEvidence } from "~/services/accountLogin/providerEvidence"
import { accountRefresh } from "~/services/accounts/accountStorage/accountRefresh"
import { resolveSelectedCheckInMethod } from "~/services/checkin/autoCheckin/inspection"
import { resolveProviderErrorResult } from "~/services/checkin/autoCheckin/providers/shared"
import { recordSiteTypeObservationForResult } from "~/services/checkin/autoCheckin/recordSiteTypeObservation"
import { type ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { starPromotionState } from "~/services/starPromotion/state"
import { type SiteAccount } from "~/types"
import {
  CHECKIN_RESULT_STATUS,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import { type TempWindowRequestSource } from "~/types/tempWindowFetch"
import { getErrorMessage } from "~/utils/core/error"

import {
  executeAccountCheckin,
  type RunAccountCheckinOptions,
} from "./accountExecution"
import { logger } from "./diagnostics"
import { canAutomaticallyRetryCheckinResult } from "./resultPolicy"

type PostCheckinRefreshOutcome = "refreshed" | "unchanged" | "failed"

/** Owns run-level account execution, observation and best-effort result effects. */
class AccountCheckinRunWorkflow {
  /**
   * Post-checkin account refresh to ensure balances/quotas reflect the effect of a successful check-in.
   *
   * Notes:
   * - This MUST NOT invoke provider `checkIn` again; it uses the existing account refresh pipeline.
   * - Best-effort: failures are swallowed so check-in completion semantics are unchanged.
   * - API/page resources are limited by their owning lower layers.
   */
  async refreshAccountsAfterSuccessfulCheckins(params: {
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
  async recordStarPromotionCheckinSuccesses(count: number): Promise<void> {
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
  async resolveLoginProviderOwners(
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
  async runAccountCheckin(
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

  async runAccountCheckins(params: {
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
}

export const accountCheckinRunWorkflow = new AccountCheckinRunWorkflow()
