import { trimToNull } from "~/utils/core/string"
import { tryParseUrl } from "~/utils/core/urlParsing"

import {
  BROWSER_STORE_UPDATE_STATUS_VALUES,
  createDefaultBrowserStoreUpdateState,
  createDefaultReleaseUpdateStatus,
  RELEASE_UPDATE_REASON_VALUES,
  type BrowserStoreUpdateState,
  type BrowserStoreUpdateStatus,
  type ReleaseUpdateReason,
  type ReleaseUpdateStatus,
} from "./releaseUpdateStatus"

/**
 * Normalize a persisted release URL and fall back when the value is missing or unsafe.
 */
function normalizeReleaseUrl(value: unknown, fallback: string): string {
  const normalized = trimToNull(value)
  if (!normalized) {
    return fallback
  }

  const parsed = tryParseUrl(normalized)
  if (
    parsed &&
    (parsed.protocol === "http:" || parsed.protocol === "https:") &&
    parsed.hostname
  ) {
    return parsed.toString()
  }

  // Fall back to the latest stable release URL when persisted data is malformed.
  return fallback
}

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
 * Check whether an unknown string is one of the supported browser-store update statuses.
 */
function isBrowserStoreUpdateStatus(
  value: unknown,
): value is BrowserStoreUpdateStatus {
  return (
    typeof value === "string" &&
    BROWSER_STORE_UPDATE_STATUS_VALUES.includes(
      value as BrowserStoreUpdateStatus,
    )
  )
}

/**
 * Validate and normalize persisted/runtime browser-store update metadata.
 */
function parseBrowserStoreUpdateState(raw: unknown): BrowserStoreUpdateState {
  const fallback = createDefaultBrowserStoreUpdateState()
  if (!raw || typeof raw !== "object") {
    return fallback
  }

  const record = raw as Record<string, unknown>
  if (!isBrowserStoreUpdateStatus(record.status)) {
    return fallback
  }

  return {
    supported:
      typeof record.supported === "boolean"
        ? record.supported
        : record.status !== fallback.status,
    status: record.status,
    version: trimToNull(record.version),
  }
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
  const normalizedCurrentVersion = trimToNull(record.currentVersion)
  if (!normalizedCurrentVersion) {
    return null
  }

  const fallback = createDefaultReleaseUpdateStatus(normalizedCurrentVersion)

  return {
    eligible:
      typeof record.eligible === "boolean"
        ? record.eligible
        : fallback.eligible,
    reason: isReleaseUpdateReason(record.reason)
      ? record.reason
      : fallback.reason,
    currentVersion: normalizedCurrentVersion,
    latestVersion: trimToNull(record.latestVersion),
    updateAvailable:
      typeof record.updateAvailable === "boolean"
        ? record.updateAvailable
        : fallback.updateAvailable,
    releaseUrl: normalizeReleaseUrl(record.releaseUrl, fallback.releaseUrl),
    checkedAt:
      typeof record.checkedAt === "number" && Number.isFinite(record.checkedAt)
        ? record.checkedAt
        : null,
    lastError: trimToNull(record.lastError),
    storeUpdate: parseBrowserStoreUpdateState(record.storeUpdate),
  }
}
