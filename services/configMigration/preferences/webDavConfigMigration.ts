import { UserPreferences } from "~/services/userPreferences"
import { DEFAULT_WEBDAV_SETTINGS } from "~/types/webdav"
import { createLogger } from "~/utils/logger"

const logger = createLogger("WebDavConfigMigration")

/**
 * Checks if the given user preferences object contains any of the old flat WebDAV fields.
 * If any of the old fields are present, it means that the user preferences object needs to be migrated
 * to use the new nested WebDAVSettings object.
 * @param prefs - User preferences object to check
 * @returns - True if the user preferences object needs to be migrated, false otherwise
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
 * Notes:
 * - Older configurations did not include WebDAV backup encryption settings.
 *   During migration, `backupEncryptionEnabled` and `backupEncryptionPassword`
 *   are initialized from defaults for backwards compatibility.
 * @param prefs - User preferences object to migrate
 * @returns - Migrated user preferences object with nested WebDAVSettings
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
    backupEncryptionEnabled: DEFAULT_WEBDAV_SETTINGS.backupEncryptionEnabled,
    backupEncryptionPassword: DEFAULT_WEBDAV_SETTINGS.backupEncryptionPassword,
    autoSync: prefs.webdavAutoSync ?? DEFAULT_WEBDAV_SETTINGS.autoSync,
    syncInterval:
      prefs.webdavSyncInterval ?? DEFAULT_WEBDAV_SETTINGS.syncInterval,
    syncStrategy:
      prefs.webdavSyncStrategy ?? DEFAULT_WEBDAV_SETTINGS.syncStrategy,
  }

  logger.debug("Migrated WebDAV settings", {
    url: webdavSettings.url,
    username: webdavSettings.username,
    hasPassword: Boolean(webdavSettings.password),
    backupEncryptionEnabled: webdavSettings.backupEncryptionEnabled,
    hasBackupEncryptionPassword: Boolean(
      webdavSettings.backupEncryptionPassword,
    ),
    autoSync: webdavSettings.autoSync,
    syncInterval: webdavSettings.syncInterval,
    syncStrategy: webdavSettings.syncStrategy,
  })

  // Create new preferences object with nested webdav
  const {
    webdavUrl: _webdavUrl,
    webdavUsername: _webdavUsername,
    webdavPassword: _webdavPassword,
    webdavAutoSync: _webdavAutoSync,
    webdavSyncInterval: _webdavSyncInterval,
    webdavSyncStrategy: _webdavSyncStrategy,
    ...restOfPrefs
  } = prefs

  void _webdavUrl
  void _webdavUsername
  void _webdavPassword
  void _webdavAutoSync
  void _webdavSyncInterval
  void _webdavSyncStrategy

  return {
    ...restOfPrefs,
    webdav: webdavSettings,
  }
}
