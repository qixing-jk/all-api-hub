import type { TFunction } from "i18next"

import { compareAccountDisplayNames } from "~/services/accounts/utils/accountDisplayName"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  translateAutoCheckinSkipReason,
  type AutoCheckinAccountSnapshot,
} from "~/types/autoCheckin"

export const SNAPSHOT_READINESS_FILTER = {
  ALL: "all",
  READY: "ready",
  SETUP_REQUIRED: "setup_required",
  DISABLED: "disabled",
  UNSUPPORTED: "unsupported",
  TEMPORARILY_UNAVAILABLE: "temporarily_unavailable",
} as const

export type SnapshotReadinessFilter =
  (typeof SNAPSHOT_READINESS_FILTER)[keyof typeof SNAPSHOT_READINESS_FILTER]

export const SNAPSHOT_STATUS_FILTER = {
  ALL: "all",
  SUCCESS: "success",
  FAILED: "failed",
  SKIPPED: "skipped",
  PENDING: "pending",
} as const

export type SnapshotStatusFilter =
  (typeof SNAPSHOT_STATUS_FILTER)[keyof typeof SNAPSHOT_STATUS_FILTER]

/**
 * Returns whether an account has every prerequisite needed for execution.
 */
function isAutoCheckinSnapshotReady(
  snapshot: AutoCheckinAccountSnapshot,
): boolean {
  return (
    snapshot.detectionEnabled &&
    snapshot.autoCheckinEnabled &&
    snapshot.providerAvailable
  )
}

/** Groups precise account reasons into actionable readiness categories. */
export function getAutoCheckinSnapshotReadinessCategory(
  snapshot: AutoCheckinAccountSnapshot,
): SnapshotReadinessFilter {
  const reason = snapshot.skipReason ?? snapshot.lastResult?.reasonCode
  switch (reason) {
    case AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED:
    case AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED:
    case AUTO_CHECKIN_SKIP_REASON.DETECTION_DISABLED:
    case AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED:
      return SNAPSHOT_READINESS_FILTER.DISABLED
    case AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER:
    case AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED:
      return SNAPSHOT_READINESS_FILTER.UNSUPPORTED
    case AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE:
    case AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR:
    case AUTO_CHECKIN_SKIP_REASON.SOURCE_UNAVAILABLE:
    case AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE:
    case AUTO_CHECKIN_SKIP_REASON.TIMEOUT:
      return SNAPSHOT_READINESS_FILTER.TEMPORARILY_UNAVAILABLE
    case AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DATA_MISSING:
    case AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED:
    case AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING:
    case AUTO_CHECKIN_SKIP_REASON.METHOD_NOT_MATCHED:
    case AUTO_CHECKIN_SKIP_REASON.METHOD_UNAVAILABLE:
    case AUTO_CHECKIN_SKIP_REASON.NO_SELECTED_METHOD:
    case AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED:
      return SNAPSHOT_READINESS_FILTER.SETUP_REQUIRED
  }

  if (isAutoCheckinSnapshotReady(snapshot)) {
    return SNAPSHOT_READINESS_FILTER.READY
  }
  if (!snapshot.autoCheckinEnabled) {
    return SNAPSHOT_READINESS_FILTER.DISABLED
  }
  return SNAPSHOT_READINESS_FILTER.SETUP_REQUIRED
}

/**
 * Maps snapshot history and skip metadata to the status displayed by the table.
 */
export function getAutoCheckinSnapshotStatus(
  snapshot: AutoCheckinAccountSnapshot,
): SnapshotStatusFilter {
  switch (snapshot.lastResult?.status) {
    case CHECKIN_RESULT_STATUS.SUCCESS:
    case CHECKIN_RESULT_STATUS.ALREADY_CHECKED:
      return SNAPSHOT_STATUS_FILTER.SUCCESS
    case CHECKIN_RESULT_STATUS.FAILED:
    case CHECKIN_RESULT_STATUS.UNCERTAIN:
      return SNAPSHOT_STATUS_FILTER.FAILED
    case CHECKIN_RESULT_STATUS.SKIPPED:
      return SNAPSHOT_STATUS_FILTER.SKIPPED
  }

  return snapshot.skipReason
    ? SNAPSHOT_STATUS_FILTER.SKIPPED
    : SNAPSHOT_STATUS_FILTER.PENDING
}

/**
 * Applies all readiness-table filters and returns rows in account display order.
 */
export function filterAutoCheckinSnapshots(
  snapshots: AutoCheckinAccountSnapshot[],
  readinessFilter: SnapshotReadinessFilter,
  statusFilter: SnapshotStatusFilter,
  keyword: string,
  t: TFunction,
): AutoCheckinAccountSnapshot[] {
  const normalizedKeyword = keyword.trim().toLowerCase()

  return snapshots
    .filter((snapshot) => {
      const matchesReadiness =
        readinessFilter === SNAPSHOT_READINESS_FILTER.ALL ||
        getAutoCheckinSnapshotReadinessCategory(snapshot) === readinessFilter
      if (!matchesReadiness) return false

      const matchesStatus =
        statusFilter === SNAPSHOT_STATUS_FILTER.ALL ||
        getAutoCheckinSnapshotStatus(snapshot) === statusFilter
      if (!matchesStatus) return false
      if (!normalizedKeyword) return true

      const skipReason = snapshot.skipReason
        ? translateAutoCheckinSkipReason(t, snapshot.skipReason)
        : ""
      const latestReason = snapshot.lastResult?.reasonCode
        ? translateAutoCheckinSkipReason(t, snapshot.lastResult.reasonCode)
        : ""
      return (
        snapshot.accountName.toLowerCase().includes(normalizedKeyword) ||
        String(snapshot.accountId).toLowerCase().includes(normalizedKeyword) ||
        skipReason.toLowerCase().includes(normalizedKeyword) ||
        latestReason.toLowerCase().includes(normalizedKeyword)
      )
    })
    .sort((a, b) =>
      compareAccountDisplayNames(
        { id: a.accountId, name: a.accountName },
        { id: b.accountId, name: b.accountName },
      ),
    )
}
