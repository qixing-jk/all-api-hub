import {
  accountCheckInState,
  isAutomaticCheckInDiscoveryCurrent,
} from "~/services/accounts/accountStorage/accountCheckInState"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { discoverAccountCheckInMethods } from "~/services/checkin/autoCheckin/accountDiscovery"
import { shouldAutomaticallyDiscoverAccountCheckIn } from "~/services/checkin/autoCheckin/inspection"
import type { AutoCheckinProviderContext } from "~/services/checkin/autoCheckin/providers/contracts"
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
    const discovery = await discoverAccountCheckInMethods(
      account,
      input.context,
      account.checkIn.methodKnowledge.lastAutomaticDiscoveryAttemptAt,
    )
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
