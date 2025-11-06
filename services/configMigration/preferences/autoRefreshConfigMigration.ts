/**
 * Migration for auto-refresh configuration
 * Converts flat auto-refresh fields to nested object structure
 */

import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh.ts"

import type { UserPreferences } from "../../userPreferences.ts"

/**
 * Checks if the given user preferences object contains any of the old flat auto-refresh fields.
 * If any of the old fields are present, it means that the user preferences object needs to be migrated
 * to use the new nested accountAutoRefresh object.
 *
 * @param {UserPreferences} prefs - User preferences object to check
 * @returns {boolean} - True if the user preferences object needs to be migrated, false otherwise
 */
export function needAutoRefreshConfigMigration(
  prefs: UserPreferences
): boolean {
  return (
    "autoRefresh" in prefs ||
    "refreshInterval" in prefs ||
    "minRefreshInterval" in prefs ||
    "refreshOnOpen" in prefs
  )
}

/**
 * Migrate old flat auto-refresh fields to nested object structure
 *
 * @param {UserPreferences} prefs - User preferences object to migrate
 * @returns {UserPreferences} - Migrated user preferences object with nested accountAutoRefresh object
 */
export function migrateAutoRefreshConfig(
  prefs: UserPreferences
): UserPreferences {
  const hasNestedAccountAutoRefresh =
    "accountAutoRefresh" in prefs &&
    typeof prefs.accountAutoRefresh === "object"
  // If no old flat fields and has nested accountAutoRefresh, return as-is
  if (!needAutoRefreshConfigMigration(prefs) && hasNestedAccountAutoRefresh) {
    return prefs
  }

  // Migrate old flat fields to nested object
  const accountAutoRefreshSettings = {
    enabled: prefs?.autoRefresh ?? DEFAULT_ACCOUNT_AUTO_REFRESH.enabled,
    interval: prefs.refreshInterval ?? DEFAULT_ACCOUNT_AUTO_REFRESH.interval,
    minInterval:
      prefs.minRefreshInterval ?? DEFAULT_ACCOUNT_AUTO_REFRESH.minInterval,
    refreshOnOpen:
      prefs.refreshOnOpen ?? DEFAULT_ACCOUNT_AUTO_REFRESH.refreshOnOpen
  }

  console.log(
    "[PreferencesMigration] Migrated accountAutoRefresh settings:",
    accountAutoRefreshSettings
  )

  const {
    autoRefresh,
    refreshInterval,
    minRefreshInterval,
    refreshOnOpen,
    ...restOfPrefs
  } = prefs

  return {
    ...restOfPrefs,
    accountAutoRefresh: accountAutoRefreshSettings
  }
}
