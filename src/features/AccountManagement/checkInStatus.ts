import {
  CHECK_IN_EXECUTION_SKIP_REASONS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_SELECTION_STATUSES,
} from "~/constants/checkIn"
import {
  getSelectedCheckInStatus,
  inspectAccountCheckIn,
  resolveSelectedCheckInMethod,
} from "~/services/checkin/autoCheckin/discovery/inspection"
import { supportsCheckInStatusReadback } from "~/services/checkin/autoCheckin/providers/registry"
import type { DisplaySiteData } from "~/types"
import type {
  CheckInExecutionSkipReason,
  CheckInMethodStatus,
} from "~/types/checkIn"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"

export const SITE_CHECK_IN_DISPLAY_KINDS = {
  Current: "current",
  Outdated: "outdated",
  Failed: "failed",
  Pending: "pending",
  Manual: "manual",
  SiteDisabled: "site-disabled",
  Configuration: "configuration",
} as const

export const ACCOUNT_CHECK_IN_AUTOMATION_KINDS = {
  AccountDisabled: "account-disabled",
  Disabled: "disabled",
  GloballyDisabled: "globally-disabled",
  Blocked: "blocked",
  Enabled: "enabled",
} as const

export const CHECK_IN_CONFIGURATION_ACTIONS = {
  Configure: "configure",
  Redetect: "redetect",
} as const

type StatusAccount = Pick<DisplaySiteData, "checkIn" | "siteType"> &
  Partial<Pick<DisplaySiteData, "baseUrl" | "disabled">>
type KnownStatus = Extract<
  CheckInMethodStatus,
  { outcome: typeof CHECK_IN_METHOD_STATUS_OUTCOMES.Known }
>
type SiteCheckInDisplayState =
  | { kind: typeof SITE_CHECK_IN_DISPLAY_KINDS.Current; checkedIn: boolean }
  | { kind: typeof SITE_CHECK_IN_DISPLAY_KINDS.Outdated; observedAt?: number }
  | {
      kind: typeof SITE_CHECK_IN_DISPLAY_KINDS.Failed
      attemptedAt: number
      lastKnown?: KnownStatus
    }
  | {
      kind:
        | typeof SITE_CHECK_IN_DISPLAY_KINDS.Pending
        | typeof SITE_CHECK_IN_DISPLAY_KINDS.Manual
        | typeof SITE_CHECK_IN_DISPLAY_KINDS.SiteDisabled
    }
  | {
      kind: typeof SITE_CHECK_IN_DISPLAY_KINDS.Configuration
      action:
        | typeof CHECK_IN_CONFIGURATION_ACTIONS.Configure
        | typeof CHECK_IN_CONFIGURATION_ACTIONS.Redetect
      reason: CheckInExecutionSkipReason
    }

/** Returns the timestamp of a confirmed observation without reusing failed-attempt time. */
export function getCheckInObservationTime(
  status: KnownStatus,
): number | undefined {
  return status.evidence.source ===
    CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.LegacyMigration
    ? status.evidence.legacyObservedAt
    : status.evidence.observedAt
}

/** Returns whether the selected method status was observed for the current day. */
export function isSelectedCheckInStatusCurrent(
  account: StatusAccount,
): boolean {
  const status = getSelectedCheckInStatus({
    config: account.checkIn,
    siteType: account.siteType,
    siteUrl: account.baseUrl,
  })
  if (!status || status.outcome !== CHECK_IN_METHOD_STATUS_OUTCOMES.Known) {
    return false
  }

  if (
    status.evidence.source === CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe ||
    status.evidence.source === CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Execution
  ) {
    return isCheckInStatusDetectedToday(status.evidence.observedAt)
  }

  if (status.evidence.legacyObservedAt !== undefined) {
    return isCheckInStatusDetectedToday(status.evidence.legacyObservedAt)
  }

  const todayKey = getDayKeyFromUnixSeconds(Math.floor(Date.now() / 1000))
  return status.evidence.legacyDayKey === todayKey
}

/** Shared projection for the account icon and filter. Execution preference never changes observed status. */
export function getSiteCheckInDisplayState(
  account: StatusAccount,
): SiteCheckInDisplayState | null {
  const input = {
    config: account.checkIn,
    siteType: account.siteType,
    siteUrl: account.baseUrl,
  }
  const methodId = resolveSelectedCheckInMethod(input)
  if (!methodId) {
    if (!account.checkIn.automaticExecutionEnabled) return null
    const inspection = inspectAccountCheckIn(input)
    return {
      kind: SITE_CHECK_IN_DISPLAY_KINDS.Configuration,
      action:
        inspection.selectionState.status === CHECK_IN_SELECTION_STATUSES.Stale
          ? CHECK_IN_CONFIGURATION_ACTIONS.Redetect
          : CHECK_IN_CONFIGURATION_ACTIONS.Configure,
      reason: inspection.executionEligibility.eligible
        ? CHECK_IN_EXECUTION_SKIP_REASONS.NoSelectedMethod
        : inspection.executionEligibility.skipReason,
    }
  }
  const status = getSelectedCheckInStatus(input)
  if (
    status?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known &&
    status.availability === CHECK_IN_METHOD_AVAILABILITIES.Disabled &&
    !(status.today !== undefined && isSelectedCheckInStatusCurrent(account))
  )
    return { kind: SITE_CHECK_IN_DISPLAY_KINDS.SiteDisabled }
  const readable = supportsCheckInStatusReadback(methodId)
  if (status?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown) {
    return readable
      ? {
          kind: SITE_CHECK_IN_DISPLAY_KINDS.Failed,
          attemptedAt: status.attemptedAt,
          lastKnown: status.lastKnown,
        }
      : { kind: SITE_CHECK_IN_DISPLAY_KINDS.Manual }
  }
  if (
    status?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known &&
    (status.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked ||
      status.today === CHECK_IN_METHOD_TODAY_STATUSES.NotChecked)
  ) {
    if (isSelectedCheckInStatusCurrent(account))
      return {
        kind: SITE_CHECK_IN_DISPLAY_KINDS.Current,
        checkedIn: status.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked,
      }
    return readable
      ? {
          kind: SITE_CHECK_IN_DISPLAY_KINDS.Outdated,
          observedAt: getCheckInObservationTime(status),
        }
      : { kind: SITE_CHECK_IN_DISPLAY_KINDS.Manual }
  }
  return {
    kind: readable
      ? SITE_CHECK_IN_DISPLAY_KINDS.Pending
      : SITE_CHECK_IN_DISPLAY_KINDS.Manual,
  }
}

/** Returns whether a persisted check-in detection belongs to the current local day. */
function isCheckInStatusDetectedToday(detectedAt?: number): boolean {
  if (typeof detectedAt !== "number" || !Number.isFinite(detectedAt)) {
    return false
  }

  const todayKey = getDayKeyFromUnixSeconds(Math.floor(Date.now() / 1000))
  const detectedKey = getDayKeyFromUnixSeconds(Math.floor(detectedAt / 1000))
  return detectedKey === todayKey
}

/** Summarizes saved intent and known execution gates without claiming a provider request will succeed. */
export function getAccountCheckInAutomationState(
  account: StatusAccount,
  globalEnabled: boolean,
) {
  if (account.disabled)
    return { kind: ACCOUNT_CHECK_IN_AUTOMATION_KINDS.AccountDisabled }
  if (!account.checkIn.automaticExecutionEnabled)
    return { kind: ACCOUNT_CHECK_IN_AUTOMATION_KINDS.Disabled }
  if (!globalEnabled)
    return { kind: ACCOUNT_CHECK_IN_AUTOMATION_KINDS.GloballyDisabled }
  const { executionEligibility } = inspectAccountCheckIn({
    config: account.checkIn,
    siteType: account.siteType,
    siteUrl: account.baseUrl,
  })
  if (
    !executionEligibility.eligible &&
    executionEligibility.skipReason !==
      CHECK_IN_EXECUTION_SKIP_REASONS.AlreadyChecked
  ) {
    return {
      kind: ACCOUNT_CHECK_IN_AUTOMATION_KINDS.Blocked,
      reason: executionEligibility.skipReason,
    }
  }
  return { kind: ACCOUNT_CHECK_IN_AUTOMATION_KINDS.Enabled }
}
