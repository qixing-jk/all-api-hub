import {
  accountCheckInState,
  isAutomaticCheckInDiscoveryCurrent,
} from "~/services/accounts/accountStorage/accountCheckInState"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { discoverCheckInMethods } from "~/services/checkin/autoCheckin/discovery"
import { shouldAutomaticallyDiscoverAccountCheckIn } from "~/services/checkin/autoCheckin/inspection"
import type { AutoCheckinProviderContext } from "~/services/checkin/autoCheckin/providers/contracts"
import { getEffectiveAuthType } from "~/services/checkin/autoCheckin/providers/shared"
import type { SiteAccount } from "~/types"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("AutomaticCheckInDiscovery")

/** Prepares automatic selection without executing a check-in or changing user intent. */
export async function prepareAutomaticCheckIn(input: {
  account: SiteAccount
  context: AutoCheckinProviderContext
  isAutomaticExecutionEnabled: () => Promise<boolean>
}): Promise<{ account: SiteAccount | null; discovered: boolean }> {
  const unchanged = { account: input.account, discovered: false }
  try {
    if (
      !shouldAutomaticallyDiscoverAccountCheckIn(input.account) ||
      !(await input.isAutomaticExecutionEnabled())
    ) {
      return unchanged
    }

    const claim = await accountCheckInState.claimAutomaticCheckInDiscovery(
      input.account.id,
    )
    if (!claim) return { account: null, discovered: false }
    if (!claim.claimed) return { account: claim.account, discovered: false }

    // The global switch can change while the cooldown claim waits for storage.
    if (!(await input.isAutomaticExecutionEnabled())) {
      return { account: claim.account, discovered: false }
    }
    const account = await accountQueries.getAccountById(claim.account.id)
    if (
      !account ||
      !isAutomaticCheckInDiscoveryCurrent(account, claim.account)
    ) {
      return { account, discovered: false }
    }
    const discovery = await discoverCheckInMethods({
      account,
      config: account.checkIn,
      observedAt:
        account.checkIn.methodKnowledge.lastAutomaticDiscoveryAttemptAt,
      request: {
        accountId: account.id,
        baseUrl: account.site_url,
        auth: {
          authType: getEffectiveAuthType(account),
          userId: account.account_info.id,
          accessToken: account.account_info.access_token,
        },
        cookieAuthSessionCookie: account.cookieAuth?.sessionCookie,
        tempWindowRequestSource: input.context.tempWindowRequestSource,
        protectionBypassExecution: input.context.protectionBypassExecution,
      },
    })
    if (!(await input.isAutomaticExecutionEnabled())) {
      return {
        account: await accountQueries.getAccountById(account.id),
        discovered: false,
      }
    }

    const updated = await accountCheckInState.completeAutomaticCheckInDiscovery(
      account,
      discovery.config,
    )
    if (updated?.applied) {
      logger.info("Automatic check-in discovery completed", {
        accountId: account.id,
        outcome: discovery.decision.outcome,
        previousMethodId: account.checkIn.selection.methodId,
        selectedMethodId: updated.account.checkIn.selection.methodId,
      })
    }
    return {
      account: updated?.account ?? null,
      discovered: updated?.applied ?? false,
    }
  } catch (error) {
    logger.warn("Automatic check-in discovery preparation failed", {
      accountId: input.account.id,
      error,
    })
    return { account: null, discovered: false }
  }
}
