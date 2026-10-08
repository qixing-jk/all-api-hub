import {
  CHECK_IN_DISCOVERY_DECISION_OUTCOMES,
  CHECK_IN_SELECTION_MODES,
  CHECK_IN_SELECTION_STATUSES,
  FULL_CHECK_IN_DISCOVERY_TIMEOUT_MS,
} from "~/constants/checkIn"
import { accountCheckInState } from "~/services/accounts/accountStorage/accountCheckInState"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { getDevCheckInFixtureScenario } from "~/services/checkin/autoCheckin/discovery/devDiscoveryFixtureIdentity"
import { discoverCheckInMethods } from "~/services/checkin/autoCheckin/discovery/discovery"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/discovery/inspection"
import { getEffectiveAuthType } from "~/services/checkin/autoCheckin/providers/shared"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

export interface CheckInDiscoveryContext {
  tempWindowRequestSource?: TempWindowRequestSource
  protectionBypassExecution?: ProtectionBypassExecution
  signal?: AbortSignal
}

/** Uses the same authenticated, bounded read-only probe for drafts and saved accounts. */
export async function discoverAccountCheckInMethods(
  account: SiteAccount,
  context: CheckInDiscoveryContext,
  observedAt?: number,
) {
  const registry =
    import.meta.env.DEV && getDevCheckInFixtureScenario(account)
      ? await (
          await import(
            "~/services/checkin/autoCheckin/discovery/devDiscoveryFixtures"
          )
        ).resolveDevCheckInDiscoveryRegistry(account)
      : undefined
  return discoverCheckInMethods({
    registry,
    account,
    config: account.checkIn,
    observedAt,
    signal: context.signal,
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
      tempWindowRequestSource: context.tempWindowRequestSource,
      protectionBypassExecution: context.protectionBypassExecution,
    },
  })
}

/** Leaves a still-valid manual choice intact even when discovery finds alternatives. */
function requiresCheckInMethodSelection(account: SiteAccount): boolean {
  const state = inspectAccountCheckIn({
    config: account.checkIn,
    siteType: account.site_type,
    siteUrl: account.site_url,
  })
  return (
    state.decision.outcome === CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Ambiguous &&
    !(
      account.checkIn.selection.mode === CHECK_IN_SELECTION_MODES.Manual &&
      state.selectionState.status === CHECK_IN_SELECTION_STATUSES.Selected
    )
  )
}

/** Explicit user redetection bypasses scheduler cooldowns without enabling or executing check-in. */
export async function redetectSavedAccountCheckIn(
  accountId: string,
  context: CheckInDiscoveryContext,
) {
  const account = await accountQueries.getAccountById(accountId)
  if (!account || account.disabled || context.signal?.aborted) return null
  const discovery = await discoverAccountCheckInMethods(
    account,
    context,
    Math.max(
      Date.now(),
      (account.checkIn.methodKnowledge.lastFullDiscoveryAt ?? 0) + 1,
    ),
  )
  if (context.signal?.aborted) return null
  let updated = await accountCheckInState.completeUserCheckInDiscovery(
    account,
    discovery.config,
  )
  if (!updated) return null
  // An explicit redetection may replace an unusable manual choice with the sole
  // confirmed method. The guarded mutation rejects changes made after probing.
  const state = inspectAccountCheckIn({
    config: updated.account.checkIn,
    siteType: updated.account.site_type,
    siteUrl: updated.account.site_url,
  })
  if (
    updated.applied &&
    state.selectionState.status !== CHECK_IN_SELECTION_STATUSES.Selected &&
    state.decision.outcome === CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Resolved
  ) {
    if (context.signal?.aborted) return null
    updated = await accountCheckInState.selectDetectedCheckInMethod(
      updated.account,
      state.decision.methodId,
    )
    if (!updated) return null
  }
  return {
    ...updated,
    discovery,
    requiresSelection:
      updated.applied && requiresCheckInMethodSelection(updated.account),
  }
}
