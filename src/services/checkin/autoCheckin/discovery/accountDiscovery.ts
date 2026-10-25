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
import { discoverCheckInRouteOverrides } from "~/services/checkin/autoCheckin/discovery/routeDiscovery"
import type { AutoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers/registry"
import { getEffectiveAuthType } from "~/services/checkin/autoCheckin/providers/shared"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

export interface CheckInDiscoveryContext {
  tempWindowRequestSource?: TempWindowRequestSource
  protectionBypassExecution?: ProtectionBypassExecution
  signal?: AbortSignal
  /**
   * Whether this round may learn a deployment's renamed routes from the site's
   * own assets. Explicit user redetection sets it; unattended discovery never
   * does, so a background run stays a bounded, side-effect-free set of probes.
   */
  allowRouteDiscovery?: boolean
}

/** Runs one read-only detection round against the configuration it was given. */
function runCheckInDiscovery(
  account: SiteAccount,
  config: SiteAccount["checkIn"],
  context: CheckInDiscoveryContext,
  observedAt: number | undefined,
  registry: AutoCheckinMethodRegistry | undefined,
) {
  return discoverCheckInMethods({
    registry,
    account,
    config,
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
  const discovery = await runCheckInDiscovery(
    account,
    account.checkIn,
    context,
    observedAt,
    registry,
  )
  if (!context.allowRouteDiscovery || context.signal?.aborted) return discovery

  // A route learned here changes what the next round probes, so the same user
  // action reports the method's real outcome instead of a second click.
  const withRoutes = await discoverCheckInRouteOverrides({
    account,
    config: discovery.config,
    detections: discovery.detections,
    context,
  })
  if (withRoutes === discovery.config || context.signal?.aborted) {
    return discovery
  }
  // Providers resolve their own endpoint from `account.checkIn`, so the learned
  // route has to reach the account, not just this round's configuration.
  return await runCheckInDiscovery(
    { ...account, checkIn: withRoutes },
    withRoutes,
    context,
    observedAt,
    registry,
  )
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
    { ...context, allowRouteDiscovery: true },
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
