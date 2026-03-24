import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"
import type { DeepPartial } from "~/types/utils"
import { DEFAULT_WEBDAV_SETTINGS } from "~/types/webdav"
import { isPlainObject } from "~/utils/core/object"

import type { UserPreferences } from "./userPreferences"

type PreferenceTimestampLike = {
  lastUpdated?: number
  sharedPreferencesLastUpdated?: number
}

type WebdavSharedPreferences = Omit<
  UserPreferences,
  "accountAutoRefresh" | "webdav"
>

const WEBDAV_LOCAL_ONLY_PREFERENCE_ROOT_KEYS = new Set<string>([
  "accountAutoRefresh",
  "webdav",
])

/**
 * Reads a finite numeric preference timestamp, otherwise returns `undefined`.
 */
function getFinitePreferenceTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

/**
 * WebDAV sync keeps a small preference subset device-local.
 *
 * Any field rooted at `accountAutoRefresh` or `webdav` MUST stay on the current
 * device during WebDAV upload/download/merge flows, even though manual file
 * import/export continues to operate on the full preferences object.
 */
function isWebdavLocalPreferencePath(path: string[]): boolean {
  return path.length > 0 && WEBDAV_LOCAL_ONLY_PREFERENCE_ROOT_KEYS.has(path[0])
}

/**
 * Returns the timestamp that represents the freshness of syncable/shared
 * preferences for WebDAV arbitration.
 */
export function getSharedPreferencesLastUpdated(
  preferences: PreferenceTimestampLike | null | undefined,
): number {
  if (!preferences) {
    return 0
  }

  const sharedTimestamp = getFinitePreferenceTimestamp(
    preferences.sharedPreferencesLastUpdated,
  )
  if (sharedTimestamp !== undefined) {
    return sharedTimestamp
  }

  const legacyTimestamp = getFinitePreferenceTimestamp(preferences.lastUpdated)
  if (legacyTimestamp !== undefined) {
    return legacyTimestamp
  }

  return 0
}

/**
 * Backfills the shared-preferences timestamp for legacy stored preferences or
 * older WebDAV payloads that only carried `lastUpdated`.
 */
export function normalizeSharedPreferencesMetadata<
  T extends PreferenceTimestampLike,
>(preferences: T): T {
  const sharedPreferencesLastUpdated =
    getSharedPreferencesLastUpdated(preferences)

  if (
    preferences.sharedPreferencesLastUpdated === sharedPreferencesLastUpdated
  ) {
    return preferences
  }

  return {
    ...preferences,
    sharedPreferencesLastUpdated,
  }
}

/**
 * Checks whether a partial preference value touches any shared WebDAV-synced field.
 */
function patchTouchesSharedPreferenceValue(
  value: unknown,
  path: string[],
): boolean {
  if (isWebdavLocalPreferencePath(path)) {
    return false
  }

  if (!isPlainObject(value)) {
    return true
  }

  const entries = Object.entries(value)
  if (entries.length === 0) {
    return false
  }

  return entries.some(([key, nestedValue]) =>
    patchTouchesSharedPreferenceValue(nestedValue, [...path, key]),
  )
}

/**
 * Determines whether an incoming partial update changes any preference fields
 * that participate in the shared WebDAV preference payload.
 */
export function patchTouchesSharedPreferences(
  patch: DeepPartial<UserPreferences>,
): boolean {
  return Object.entries(patch).some(([key, value]) =>
    patchTouchesSharedPreferenceValue(value, [key]),
  )
}

/**
 * Builds the preference snapshot that is safe to serialize into a shared WebDAV
 * backup. Device-local fields are excluded and the legacy `lastUpdated` field is
 * aligned to the shared timestamp so older clients do not treat local-only edits
 * as shared preference changes.
 */
export function buildWebdavSharedPreferences(
  preferences: UserPreferences,
): WebdavSharedPreferences {
  const normalizedPreferences = normalizeSharedPreferencesMetadata(preferences)
  const sharedPreferencesLastUpdated = getSharedPreferencesLastUpdated(
    normalizedPreferences,
  )
  const {
    accountAutoRefresh: _accountAutoRefresh,
    webdav: _webdav,
    ...sharedPreferences
  } = normalizedPreferences

  return {
    ...sharedPreferences,
    lastUpdated: sharedPreferencesLastUpdated,
    sharedPreferencesLastUpdated,
  }
}

/**
 * Reapplies the current device's WebDAV-local preference fields onto an
 * imported/shared preference snapshot before it is saved locally.
 */
export function restoreWebdavLocalOnlyPreferences(
  importedPreferences: UserPreferences,
  localPreferences: UserPreferences,
): UserPreferences {
  const normalizedPreferences =
    normalizeSharedPreferencesMetadata(importedPreferences)

  return {
    ...normalizedPreferences,
    accountAutoRefresh:
      localPreferences.accountAutoRefresh ?? DEFAULT_ACCOUNT_AUTO_REFRESH,
    webdav: localPreferences.webdav ?? DEFAULT_WEBDAV_SETTINGS,
    lastUpdated:
      typeof normalizedPreferences.lastUpdated === "number"
        ? normalizedPreferences.lastUpdated
        : getSharedPreferencesLastUpdated(normalizedPreferences),
    sharedPreferencesLastUpdated: getSharedPreferencesLastUpdated(
      normalizedPreferences,
    ),
  }
}
