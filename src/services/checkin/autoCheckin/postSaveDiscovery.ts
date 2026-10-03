import {
  CHECK_IN_DISCOVERY_DECISION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  FULL_CHECK_IN_DISCOVERY_TIMEOUT_MS,
} from "~/constants/checkIn"
import { accountCheckInState } from "~/services/accounts/accountStorage/accountCheckInState"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { discoverCheckInMethods } from "~/services/checkin/autoCheckin/discovery"
import { inspectCheckInMethods } from "~/services/checkin/autoCheckin/domain"
import { getAutoCheckinCandidateMethodIds } from "~/services/checkin/autoCheckin/providers/registry"
import { getEffectiveAuthType } from "~/services/checkin/autoCheckin/providers/shared"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("PostSaveCheckInDiscovery")

/** Completes read-only method discovery after an account has been saved. */
export async function discoverSavedAccountCheckIn(
  account: SiteAccount,
  context: {
    tempWindowRequestSource?: TempWindowRequestSource
    protectionBypassExecution?: ProtectionBypassExecution
  },
): Promise<SiteAccount | null> {
  const candidateMethodIds = getAutoCheckinCandidateMethodIds(
    account.site_type,
    account.site_url,
  )
  if (account.disabled || candidateMethodIds.length === 0) return account
  const { decision } = inspectCheckInMethods({
    config: account.checkIn,
    candidateMethodIds,
  })
  const needsDiscovery =
    account.checkIn.methodKnowledge.lastFullDiscoveryAt === undefined ||
    decision.outcome === CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unknown ||
    candidateMethodIds.some(
      (id) =>
        account.checkIn.methodKnowledge.methods[id]?.status?.outcome ===
        CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
    )
  if (!needsDiscovery) return account

  try {
    // This is read-only discovery for a user save, independent of unattended
    // execution preferences, scheduler cooldowns, and account refresh latency.
    const discovery = await discoverCheckInMethods({
      account,
      config: account.checkIn,
      observedAt: Math.max(
        Date.now(),
        (account.checkIn.methodKnowledge.lastFullDiscoveryAt ?? 0) + 1,
      ),
      deadlineMs: FULL_CHECK_IN_DISCOVERY_TIMEOUT_MS,
      perAdapterTimeoutMs: FULL_CHECK_IN_DISCOVERY_TIMEOUT_MS,
      request: {
        accountId: account.id,
        baseUrl: account.site_url,
        auth: {
          authType: getEffectiveAuthType(account),
          userId: account.account_info.id,
          accessToken: account.account_info.access_token,
        },
        cookieAuthSessionCookie: account.cookieAuth?.sessionCookie,
        ...context,
      },
    })
    const updated = await accountCheckInState.completePostSaveCheckInDiscovery(
      account,
      discovery.config,
    )
    return updated?.account ?? null
  } catch (error) {
    logger.warn("Post-save check-in discovery failed", {
      accountId: account.id,
      error: getErrorMessage(error),
    })
    return accountQueries.getAccountById(account.id)
  }
}
