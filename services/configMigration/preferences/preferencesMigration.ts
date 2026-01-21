/**
 * Centralized preferences migration system
 * Handles version-based migrations for UserPreferences configurations
 */

import { DATA_TYPE_CASHFLOW, DATA_TYPE_CONSUMPTION } from "~/constants"
import { migrateAutoRefreshConfig } from "~/services/configMigration/preferences/autoRefreshConfigMigration"
import { migrateNewApiConfig } from "~/services/configMigration/preferences/newApiConfigMigration"
import { migrateWebDavConfig } from "~/services/configMigration/preferences/webDavConfigMigration"

import type { UserPreferences } from "../../userPreferences"
import { migrateSortingConfig } from "./sortingConfigMigration"

// Current version of the preferences schema
export const CURRENT_PREFERENCES_VERSION = 9

/**
 * Migration function type
 * Takes preferences at version N and returns it at version N+1
 */
type PreferencesMigrationFunction = (prefs: UserPreferences) => UserPreferences

/**
 * Registry of migration functions
 * Key: target version number
 * Value: migration function to upgrade to that version
 */
const migrations: Record<number, PreferencesMigrationFunction> = {
  // Version 0 -> 1: Migrate sorting priority configuration
  1: (prefs: UserPreferences): UserPreferences => {
    console.log(
      "[PreferencesMigration] Migrating preferences from v0 to v1 (sorting config migration)",
    )

    // Migrate sorting priority config
    const migratedSortingConfig = migrateSortingConfig(
      prefs.sortingPriorityConfig,
    )

    return {
      ...prefs,
      sortingPriorityConfig: migratedSortingConfig,
      preferencesVersion: 1,
    }
  },

  // Version 1 -> 2: Add PINNED sorting criterion
  2: (prefs: UserPreferences): UserPreferences => {
    console.log(
      "[PreferencesMigration] Migrating preferences from v1 to v2 (add PINNED criterion)",
    )

    // Migrate sorting priority config to add PINNED criterion
    const migratedSortingConfig = migrateSortingConfig(
      prefs.sortingPriorityConfig,
    )

    return {
      ...prefs,
      sortingPriorityConfig: migratedSortingConfig,
      preferencesVersion: 2,
    }
  },

  // Version 2 -> 3: Migrate flat WebDAV fields to nested webdav object
  3: (prefs: UserPreferences): UserPreferences => {
    console.log(
      "[PreferencesMigration] Migrating preferences from v2 to v3 (WebDAV settings migration)",
    )

    const migratedPrefs = migrateWebDavConfig(prefs)

    return {
      ...migratedPrefs,
      preferencesVersion: 3,
    }
  },

  // Version 3 -> 4: Migrate flat auto-refresh fields to nested accountAutoRefresh object
  4: (prefs: UserPreferences): UserPreferences => {
    console.log(
      "[PreferencesMigration] Migrating preferences from v3 to v4 (auto-refresh config migration)",
    )

    const migratedPrefs = migrateAutoRefreshConfig(prefs)

    return {
      ...migratedPrefs,
      preferencesVersion: 4,
    }
  },

  // Version 4 -> 5: Migrate flat new-api fields to nested newApi object
  5: (prefs: UserPreferences): UserPreferences => {
    console.log(
      "[PreferencesMigration] Migrating preferences from v4 to v5 (new-api config migration)",
    )

    const migratedPrefs = migrateNewApiConfig(prefs)

    return {
      ...migratedPrefs,
      preferencesVersion: 5,
    }
  },
  // Version 5 -> 6: Ensure sorting priority config includes latest criteria (e.g. MANUAL_ORDER)
  6: (prefs: UserPreferences): UserPreferences => {
    console.log(
      "[PreferencesMigration] Migrating preferences from v5 to v6 (sorting config migration)",
    )

    const migratedSortingConfig = migrateSortingConfig(
      prefs.sortingPriorityConfig,
    )

    return {
      ...prefs,
      sortingPriorityConfig: migratedSortingConfig,
      preferencesVersion: 6,
    }
  },

  // Version 6 -> 7: Rename model sync config field newApiModelSync -> managedSiteModelSync
  7: (prefs: UserPreferences): UserPreferences => {
    console.log(
      "[PreferencesMigration] Migrating preferences from v6 to v7 (managed-site model sync rename)",
    )

    const legacyConfig = (prefs as any).newApiModelSync
    const currentConfig = (prefs as any).managedSiteModelSync

    if (currentConfig) {
      const { newApiModelSync: _legacy, ...rest } = prefs as any
      return {
        ...rest,
        preferencesVersion: 7,
      }
    }

    if (!legacyConfig) {
      return {
        ...prefs,
        preferencesVersion: 7,
      }
    }

    const { newApiModelSync: _legacy, ...rest } = prefs as any
    return {
      ...rest,
      managedSiteModelSync: legacyConfig,
      preferencesVersion: 7,
    }
  },

  // Version 7 -> 8: Rename dashboard tab value consumption -> cashflow
  8: (prefs: UserPreferences): UserPreferences => {
    console.log(
      "[PreferencesMigration] Migrating preferences from v7 to v8 (cashflow tab rename)",
    )

    /**
     * Historically the dashboard used `activeTab = \"consumption\"` for the first tab,
     * but that tab now represents today's cashflow (consumption + income).
     *
     * We keep storage backward-compatible by mapping the legacy value to the new one.
     */
    const legacyActiveTab = (prefs as any).activeTab
    if (legacyActiveTab !== DATA_TYPE_CONSUMPTION) {
      return {
        ...prefs,
        preferencesVersion: 8,
      }
    }

    return {
      ...prefs,
      activeTab: DATA_TYPE_CASHFLOW as any,
      preferencesVersion: 8,
    }
  },
  9: (prefs: UserPreferences): UserPreferences => {
    console.log(
      "[PreferencesMigration] Migrating preferences from v8 to v9 (disabled accounts sorting config)",
    )

    const migratedSortingConfig = migrateSortingConfig(
      prefs.sortingPriorityConfig,
    )

    return {
      ...prefs,
      sortingPriorityConfig: migratedSortingConfig,
      preferencesVersion: 9,
    }
  },
}

/**
 * Check if preferences need migration
 */
export function needsPreferencesMigration(
  prefs: UserPreferences | undefined,
): boolean {
  if (!prefs) return false
  const currentVersion = prefs.preferencesVersion ?? 0
  return currentVersion < CURRENT_PREFERENCES_VERSION
}

/**
 * Get the version of preferences
 */
export function getPreferencesVersion(
  prefs: UserPreferences | undefined,
): number {
  return prefs?.preferencesVersion ?? 0
}

/**
 * Migrate preferences to the latest version
 * Applies all necessary migrations sequentially
 */
export function migratePreferences(
  migratedPrefs: UserPreferences,
): UserPreferences {
  let currentVersion = getPreferencesVersion(migratedPrefs)

  // Apply migrations sequentially until we reach current version
  while (needsPreferencesMigration(migratedPrefs)) {
    const nextVersion = currentVersion + 1
    const migrationFn = migrations[nextVersion]

    if (!migrationFn) {
      console.error(
        `[PreferencesMigration] No migration defined for version ${nextVersion}`,
      )
      break
    }

    console.log(
      `[PreferencesMigration] Migrating preferences from v${currentVersion} to v${nextVersion}`,
    )
    migratedPrefs = migrationFn(migratedPrefs)
    currentVersion = nextVersion
  }

  return migratedPrefs
}
