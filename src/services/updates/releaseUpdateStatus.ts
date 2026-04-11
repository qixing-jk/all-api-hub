export const RELEASE_UPDATE_REASONS = {
  ChromiumDevelopment: "chromium-development",
  StoreBuild: "store-build",
  FirefoxAmbiguous: "firefox-ambiguous",
  SafariUnsupported: "safari-unsupported",
  ApiUnavailable: "api-unavailable",
  Unknown: "unknown",
} as const

export type ReleaseUpdateReason =
  (typeof RELEASE_UPDATE_REASONS)[keyof typeof RELEASE_UPDATE_REASONS]

export const RELEASE_UPDATE_REASON_VALUES = Object.values(
  RELEASE_UPDATE_REASONS,
) as ReleaseUpdateReason[]

export type ReleaseUpdateStatus = {
  eligible: boolean
  reason: ReleaseUpdateReason
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseUrl: string
  checkedAt: number | null
  lastError: string | null
}

export const LATEST_STABLE_RELEASE_URL =
  "https://github.com/qixing-jk/all-api-hub/releases/latest"

/**
 * Create a baseline release-update status before any remote check runs.
 */
export function createDefaultReleaseUpdateStatus(
  currentVersion: string,
): ReleaseUpdateStatus {
  return {
    eligible: false,
    reason: RELEASE_UPDATE_REASONS.Unknown,
    currentVersion,
    latestVersion: null,
    updateAvailable: false,
    releaseUrl: LATEST_STABLE_RELEASE_URL,
    checkedAt: null,
    lastError: null,
  }
}
