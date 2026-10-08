import { type AccountLoginProvider } from "~/constants/accountLogin"
import { buildAutoCheckinAccountSnapshot } from "~/services/checkin/autoCheckin/accountSnapshot"
import { isRetryableCheckinResult } from "~/services/checkin/autoCheckin/execution/resultPolicy"
import { type SiteAccount } from "~/types"
import {
  CHECKIN_RESULT_STATUS,
  type AutoCheckinAccountSnapshot,
  type AutoCheckinRunSummary,
  type CheckinAccountResult,
  type CheckinResultStatus,
} from "~/types/autoCheckin"

export const isSuccessfulCheckinStatus = (
  status: CheckinResultStatus,
): boolean =>
  status === CHECKIN_RESULT_STATUS.SUCCESS ||
  status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED

export const isFailedCheckinStatus = (status: CheckinResultStatus): boolean =>
  status === CHECKIN_RESULT_STATUS.FAILED

/** Rebuilds run counts while preserving the prior eligible-account total. */
export function recalculateSummaryFromResults(
  perAccount: Record<string, CheckinAccountResult>,
  previousSummary?: AutoCheckinRunSummary,
): AutoCheckinRunSummary {
  const values = Object.values(perAccount)
  const successCount = values.filter((value) =>
    isSuccessfulCheckinStatus(value.status),
  ).length
  const alreadyCheckedCount = values.filter(
    (value) => value.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
  ).length
  const failedCount = values.filter((value) =>
    isFailedCheckinStatus(value.status),
  ).length
  const skippedCount = values.filter(
    (value) => value.status === CHECKIN_RESULT_STATUS.SKIPPED,
  ).length
  const uncertainCount = values.filter(
    (value) => value.status === CHECKIN_RESULT_STATUS.UNCERTAIN,
  ).length

  const executed = successCount + failedCount + uncertainCount
  const totalEligible =
    previousSummary?.totalEligible ?? executed + skippedCount

  return {
    totalEligible,
    executed,
    successCount,
    ...(alreadyCheckedCount > 0 ? { alreadyCheckedCount } : {}),
    failedCount,
    skippedCount,
    ...(uncertainCount > 0 ? { uncertainCount } : {}),
    needsRetry: values.some(isRetryableCheckinResult),
  }
}

/** Updates the matching account snapshot without replacing unrelated entries. */
export function updateSnapshotWithResult(
  snapshots: AutoCheckinAccountSnapshot[] | undefined,
  result: CheckinAccountResult,
): AutoCheckinAccountSnapshot[] | undefined {
  if (!snapshots || snapshots.length === 0) {
    return snapshots
  }

  let updated = false
  const nextSnapshots = snapshots.map((snapshot) => {
    if (snapshot.accountId !== result.accountId) {
      return snapshot
    }
    updated = true
    return {
      ...snapshot,
      lastResult: result,
    }
  })

  return updated ? nextSnapshots : snapshots
}

/** Projects account readiness and login ownership for an execution. */
export function buildAccountSnapshot(
  account: SiteAccount,
  accountName: string,
  loginProviderOwners?: ReadonlyMap<AccountLoginProvider, SiteAccount>,
): AutoCheckinAccountSnapshot {
  return buildAutoCheckinAccountSnapshot(
    account,
    accountName,
    loginProviderOwners,
  )
}

/** Attaches this run's results to account snapshots. */
export function attachResultsToSnapshots(
  snapshots: AutoCheckinAccountSnapshot[],
  results: Record<string, CheckinAccountResult>,
): AutoCheckinAccountSnapshot[] {
  return snapshots.map((snapshot) => ({
    ...snapshot,
    lastResult: results[snapshot.accountId],
  }))
}

/** Builds account observations for the completed run. */
export function buildAnalyticsSnapshots(
  accounts: SiteAccount[],
  accountDisplayNameById: Map<string, string>,
  results: Record<string, CheckinAccountResult>,
  loginProviderOwners?: ReadonlyMap<AccountLoginProvider, SiteAccount>,
): AutoCheckinAccountSnapshot[] {
  return attachResultsToSnapshots(
    accounts.map((account) =>
      buildAccountSnapshot(
        account,
        accountDisplayNameById.get(account.id) ?? account.id,
        loginProviderOwners,
      ),
    ),
    results,
  )
}
