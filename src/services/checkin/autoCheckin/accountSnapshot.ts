import type { AccountLoginProvider } from "~/constants/accountLogin"
import {
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_SELECTION_STATUSES,
} from "~/constants/checkIn"
import {
  getLoginProviderClaimedByAnother,
  resolveLoginProviderOwners,
} from "~/services/accountLogin/providerClaims"
import { buildAccountDisplayNameMap } from "~/services/accounts/utils/accountDisplayName"
import { getSelectedCheckInStatus } from "~/services/checkin/autoCheckin/discovery/inspection"
import { inspectSelectedCheckInCompatibility } from "~/services/checkin/autoCheckin/methods"
import { toAutoCheckinSkipReason } from "~/services/checkin/autoCheckin/skipReasons"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  type AutoCheckinAccountSnapshot,
  type AutoCheckinSkipReason,
} from "~/types/autoCheckin"
import type { LoginProviderEvidenceMap } from "~/types/loginProviderEvidence"

/** Builds readiness from the same contracts used by execution. */
export function buildAutoCheckinAccountSnapshot(
  account: SiteAccount,
  accountName: string,
  loginProviderOwners?: ReadonlyMap<AccountLoginProvider, SiteAccount>,
  globalAutomaticExecutionEnabled = true,
): AutoCheckinAccountSnapshot {
  const compatibility = inspectSelectedCheckInCompatibility({
    account,
    // Scheduled runs have passed their execution gate; UI reads supply the current switch.
    globalAutomaticExecutionEnabled,
    loginProviderClaimedByAnother:
      getLoginProviderClaimedByAnother(account, loginProviderOwners) !== null,
  })
  const selectionState = compatibility.state.selectionState
  const detectionEnabled =
    selectionState.status === CHECK_IN_SELECTION_STATUSES.Selected
  const autoCheckinEnabled = account.checkIn.automaticExecutionEnabled
  const selectedStatus = getSelectedCheckInStatus({
    config: account.checkIn,
    siteType: account.site_type,
    siteUrl: account.site_url,
  })

  const executionEligibility = compatibility.state.executionEligibility
  let skipReason: AutoCheckinSkipReason | undefined =
    executionEligibility.eligible === false
      ? toAutoCheckinSkipReason(executionEligibility.skipReason)
      : undefined

  const providerAvailable = compatibility.providerAvailable
  if (!skipReason && !providerAvailable) {
    skipReason =
      compatibility.providerReadiness?.ready === false
        ? toAutoCheckinSkipReason(compatibility.providerReadiness.reason)
        : AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER
  }

  return {
    accountId: account.id,
    accountName,
    siteType: account.site_type,
    detectionEnabled,
    autoCheckinEnabled,
    providerAvailable,
    // Display-only field: DO NOT use this for eligibility decisions (provider outcomes are the source of truth).
    isCheckedInToday:
      selectedStatus?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known
        ? selectedStatus.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked
        : undefined,
    lastCheckInDate:
      selectedStatus?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known &&
      selectedStatus.evidence.source ===
        CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.LegacyMigration
        ? selectedStatus.evidence.legacyDayKey
        : undefined,
    skipReason,
  }
}

/** Reprojects current setup while preserving the historical execution result. */
export function refreshAutoCheckinAccountSnapshots(
  snapshots: AutoCheckinAccountSnapshot[],
  accounts: SiteAccount[],
  evidence: LoginProviderEvidenceMap = {},
  globalAutomaticExecutionEnabled = true,
): AutoCheckinAccountSnapshot[] {
  const accountsById = new Map(accounts.map((account) => [account.id, account]))
  const names = buildAccountDisplayNameMap(accounts)
  const owners = resolveLoginProviderOwners(accounts, evidence)
  return snapshots.map((snapshot) => {
    const account = accountsById.get(snapshot.accountId)
    return account
      ? {
          ...buildAutoCheckinAccountSnapshot(
            account,
            names.get(account.id) ?? account.id,
            owners,
            globalAutomaticExecutionEnabled,
          ),
          lastResult: snapshot.lastResult,
        }
      : snapshot
  })
}
