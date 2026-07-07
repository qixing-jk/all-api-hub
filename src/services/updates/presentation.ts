import type { ReleaseUpdateStatus } from "./releaseUpdateStatus"
import {
  BROWSER_STORE_UPDATE_STATUSES,
  RELEASE_UPDATE_REASONS,
} from "./releaseUpdateStatus"

export const RELEASE_UPDATE_PRESENTATION_STATES = {
  Loading: "loading",
  Unavailable: "unavailable",
  StoreUpdateReady: "store-update-ready",
  StoreUpdatePending: "store-update-pending",
  UpdateAvailable: "update-available",
  CheckFailed: "check-failed",
  UpToDate: "up-to-date",
  NotChecked: "not-checked",
  Ineligible: "ineligible",
} as const

type ReleaseUpdatePresentationState =
  (typeof RELEASE_UPDATE_PRESENTATION_STATES)[keyof typeof RELEASE_UPDATE_PRESENTATION_STATES]

const RELEASE_UPDATE_ACTION_KINDS = {
  DownloadUpdate: "download-update",
  OpenLatest: "open-latest",
  ReloadToUpdate: "reload-to-update",
} as const

type ReleaseUpdateActionKind =
  (typeof RELEASE_UPDATE_ACTION_KINDS)[keyof typeof RELEASE_UPDATE_ACTION_KINDS]

export const RELEASE_UPDATE_CHECK_OUTCOMES = {
  CheckFailed: "check-failed",
  StoreUpdateReady: "store-update-ready",
  StoreUpdatePending: "store-update-pending",
  UpdateAvailable: "update-available",
  UpToDate: "up-to-date",
} as const

type ReleaseUpdateCheckOutcome =
  (typeof RELEASE_UPDATE_CHECK_OUTCOMES)[keyof typeof RELEASE_UPDATE_CHECK_OUTCOMES]

/**
 * Return a trimmed latest-version string when one is available.
 */
export function getReleaseUpdateLatestVersion(
  status: ReleaseUpdateStatus | null | undefined,
): string | null {
  return typeof status?.latestVersion === "string" &&
    status.latestVersion.trim()
    ? status.latestVersion
    : null
}

/**
 * Whether the current release-update status indicates a newer version exists.
 */
export function hasAvailableReleaseUpdate(
  status: ReleaseUpdateStatus | null | undefined,
): boolean {
  const latestVersion = getReleaseUpdateLatestVersion(status)
  if (!status?.updateAvailable || !latestVersion) {
    return false
  }

  if (isStoreReleasePending(status)) {
    return false
  }

  return true
}

/**
 * Store installs may see a newer GitHub release before the browser store has
 * published or rolled it out. That is informational, not an actionable update.
 */
function isStoreReleasePending(
  status: ReleaseUpdateStatus | null | undefined,
): boolean {
  return !!(
    status?.reason === RELEASE_UPDATE_REASONS.StoreBuild &&
    status.updateAvailable &&
    getReleaseUpdateLatestVersion(status) &&
    status.storeUpdate.status !== BROWSER_STORE_UPDATE_STATUSES.UpdateAvailable
  )
}

/**
 * Derive the semantic UI state used by release-update surfaces.
 */
export function deriveReleaseUpdatePresentation(options: {
  isLoading: boolean
  status: ReleaseUpdateStatus | null | undefined
}): {
  actionKind: ReleaseUpdateActionKind
  hasUpdate: boolean
  latestVersion: string | null
  state: ReleaseUpdatePresentationState
} {
  const { isLoading, status } = options
  const latestVersion = getReleaseUpdateLatestVersion(status)
  const hasUpdate = hasAvailableReleaseUpdate(status)

  if (isLoading) {
    return {
      actionKind: RELEASE_UPDATE_ACTION_KINDS.OpenLatest,
      hasUpdate,
      latestVersion,
      state: RELEASE_UPDATE_PRESENTATION_STATES.Loading,
    }
  }

  if (!status) {
    return {
      actionKind: RELEASE_UPDATE_ACTION_KINDS.OpenLatest,
      hasUpdate,
      latestVersion,
      state: RELEASE_UPDATE_PRESENTATION_STATES.Unavailable,
    }
  }

  if (
    status.storeUpdate.status === BROWSER_STORE_UPDATE_STATUSES.UpdateAvailable
  ) {
    return {
      actionKind: RELEASE_UPDATE_ACTION_KINDS.ReloadToUpdate,
      hasUpdate: true,
      latestVersion,
      state: RELEASE_UPDATE_PRESENTATION_STATES.StoreUpdateReady,
    }
  }

  if (isStoreReleasePending(status)) {
    return {
      actionKind: RELEASE_UPDATE_ACTION_KINDS.OpenLatest,
      hasUpdate: false,
      latestVersion,
      state: RELEASE_UPDATE_PRESENTATION_STATES.StoreUpdatePending,
    }
  }

  if (hasUpdate) {
    return {
      actionKind: RELEASE_UPDATE_ACTION_KINDS.DownloadUpdate,
      hasUpdate,
      latestVersion,
      state: RELEASE_UPDATE_PRESENTATION_STATES.UpdateAvailable,
    }
  }

  if (status.lastError) {
    return {
      actionKind: RELEASE_UPDATE_ACTION_KINDS.OpenLatest,
      hasUpdate,
      latestVersion,
      state: RELEASE_UPDATE_PRESENTATION_STATES.CheckFailed,
    }
  }

  if (latestVersion && status.checkedAt) {
    return {
      actionKind: RELEASE_UPDATE_ACTION_KINDS.OpenLatest,
      hasUpdate,
      latestVersion,
      state: RELEASE_UPDATE_PRESENTATION_STATES.UpToDate,
    }
  }

  if (status.eligible) {
    return {
      actionKind: RELEASE_UPDATE_ACTION_KINDS.OpenLatest,
      hasUpdate,
      latestVersion,
      state: RELEASE_UPDATE_PRESENTATION_STATES.NotChecked,
    }
  }

  return {
    actionKind: RELEASE_UPDATE_ACTION_KINDS.OpenLatest,
    hasUpdate,
    latestVersion,
    state: RELEASE_UPDATE_PRESENTATION_STATES.Ineligible,
  }
}

/**
 * Collapse a freshly fetched check result into the toast state shown to users.
 */
export function deriveReleaseUpdateCheckOutcome(
  status: ReleaseUpdateStatus | null | undefined,
): ReleaseUpdateCheckOutcome {
  if (!status) {
    return RELEASE_UPDATE_CHECK_OUTCOMES.CheckFailed
  }

  if (
    status.storeUpdate.status === BROWSER_STORE_UPDATE_STATUSES.UpdateAvailable
  ) {
    return RELEASE_UPDATE_CHECK_OUTCOMES.StoreUpdateReady
  }

  if (isStoreReleasePending(status)) {
    return RELEASE_UPDATE_CHECK_OUTCOMES.StoreUpdatePending
  }

  if (status.lastError) {
    return RELEASE_UPDATE_CHECK_OUTCOMES.CheckFailed
  }

  return hasAvailableReleaseUpdate(status)
    ? RELEASE_UPDATE_CHECK_OUTCOMES.UpdateAvailable
    : RELEASE_UPDATE_CHECK_OUTCOMES.UpToDate
}
