import {
  createDefaultReleaseUpdateStatus,
  RELEASE_UPDATE_REASON_VALUES,
  type ReleaseUpdateReason,
  type ReleaseUpdateStatus,
} from "./releaseUpdateStatus"

/**
 * Check whether an unknown string is one of the supported release-update reasons.
 */
function isReleaseUpdateReason(value: unknown): value is ReleaseUpdateReason {
  return (
    typeof value === "string" &&
    RELEASE_UPDATE_REASON_VALUES.includes(value as ReleaseUpdateReason)
  )
}

/**
 * Validate and normalize a persisted/runtime release-update payload.
 */
export function parseReleaseUpdateStatus(
  raw: unknown,
): ReleaseUpdateStatus | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const record = raw as Record<string, unknown>
  const currentVersion = record.currentVersion
  if (typeof currentVersion !== "string" || !currentVersion.trim()) {
    return null
  }

  const fallback = createDefaultReleaseUpdateStatus(currentVersion)

  return {
    eligible:
      typeof record.eligible === "boolean"
        ? record.eligible
        : fallback.eligible,
    reason: isReleaseUpdateReason(record.reason)
      ? record.reason
      : fallback.reason,
    currentVersion,
    latestVersion:
      typeof record.latestVersion === "string" ? record.latestVersion : null,
    updateAvailable:
      typeof record.updateAvailable === "boolean"
        ? record.updateAvailable
        : fallback.updateAvailable,
    releaseUrl:
      typeof record.releaseUrl === "string" && record.releaseUrl
        ? record.releaseUrl
        : fallback.releaseUrl,
    checkedAt:
      typeof record.checkedAt === "number" && Number.isFinite(record.checkedAt)
        ? record.checkedAt
        : null,
    lastError: typeof record.lastError === "string" ? record.lastError : null,
  }
}
