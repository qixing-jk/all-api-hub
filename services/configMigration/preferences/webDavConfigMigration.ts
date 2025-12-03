import { UserPreferences } from "~/services/userPreferences"
import { DEFAULT_WEBDAV_SETTINGS } from "~/types/webdav"

/**
 * Checks if the given user preferences object contains any of the old flat WebDAV fields.
 * If any of the old fields are present, it means that the user preferences object needs to be migrated
 * to use the new nested WebDAVSettings object.
 *
 * @param {UserPreferences} prefs - User preferences object to check
 * @returns {boolean} - True if the user preferences object needs to be migrated, false otherwise
 */
export function needWebDavConfigMigration(prefs: UserPreferences): boolean {
  return (
    "webdavUrl" in prefs ||
    "webdavUsername" in prefs ||
    "webdavPassword" in prefs ||
    "webdavAutoSync" in prefs ||
    "webdavSyncInterval" in prefs ||
    "webdavSyncStrategy" in prefs
  )
}

/**
 * Migrate old flat WebDAV fields to a nested WebDAVSettings object
 *
 * @param {UserPreferences} prefs - User preferences object to migrate
 * @returns {UserPreferences} - Migrated user preferences object with nested WebDAVSettings
 */
export function migrateWebDavConfig(prefs: UserPreferences) {
  const hasNestedWebdav = "webdav" in prefs && typeof prefs.webdav === "object"
  // If no old flat fields and has nested webdav, return as-is
  if (!needWebDavConfigMigration(prefs) && hasNestedWebdav) {
    return prefs
  }

  // Migrate old flat fields to nested object
  const webdavSettings = {
    url: prefs.webdavUrl ?? DEFAULT_WEBDAV_SETTINGS.url,
    username: prefs.webdavUsername ?? DEFAULT_WEBDAV_SETTINGS.username,
    password: prefs.webdavPassword ?? DEFAULT_WEBDAV_SETTINGS.password,
    autoSync: prefs.webdavAutoSync ?? DEFAULT_WEBDAV_SETTINGS.autoSync,
    syncInterval:
      prefs.webdavSyncInterval ?? DEFAULT_WEBDAV_SETTINGS.syncInterval,
    syncStrategy:
      prefs.webdavSyncStrategy ?? DEFAULT_WEBDAV_SETTINGS.syncStrategy,
  }

  console.log(
    "[PreferencesMigration] Migrated WebDAV settings:",
    webdavSettings,
  )

  // Create new preferences object with nested webdav
  const {
    webdavUrl,
    webdavUsername,
    webdavPassword,
    webdavAutoSync,
    webdavSyncInterval,
    webdavSyncStrategy,
    ...restOfPrefs
  } = prefs

  return {
    ...restOfPrefs,
    webdav: webdavSettings,
  }
}
