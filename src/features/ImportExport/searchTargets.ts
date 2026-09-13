import { CLOUD_SYNC_PROVIDERS, type CloudSyncProvider } from "~/types/cloudSync"

export const WEBDAV_TARGET_IDS = {
  root: "webdav",
  provider: "webdav-provider",
  url: "webdav-url",
  username: "webdav-username",
  password: "webdav-password",
  gistToken: "github-gist-token",
  gistId: "github-gist-id",
  gistUrl: "github-gist-url",
  restorePolicy: "webdav-restore-policy",
  syncData: "webdav-sync-data",
  syncDataAccounts: "webdavSyncDataAccounts",
  syncDataBookmarks: "webdavSyncDataBookmarks",
  syncDataApiCredentialProfiles: "webdavSyncDataApiCredentialProfiles",
  syncDataPreferences: "webdavSyncDataPreferences",
  encryption: "webdav-encryption",
  encryptionEnable: "webdav-encryption-enable",
  encryptionPassword: "webdav-encryption-password",
  // Keep the legacy save anchor on the connection settings.
  saveConfig: "webdav-save-config",
  // Preserve existing Gist creation links as an alias for the unified upload action.
  gistUpload: "github-gist-create",
  testConnection: "webdav-test-connection",
  uploadBackup: "webdav-upload-backup",
  downloadImport: "webdav-download-import",
} as const

export const WEBDAV_AUTO_SYNC_TARGET_IDS = {
  root: "webdav-auto-sync",
  enable: "webdav-auto-sync-enable",
  interval: "webdav-auto-sync-interval",
  strategy: "webdav-auto-sync-strategy",
  // Keep existing deep links usable after removing the save button.
  saveSettings: "webdav-auto-sync-save-settings",
  syncNow: "webdav-auto-sync-sync-now",
} as const

export const IMPORT_EXPORT_TARGET_IDS = {
  importMode: "import-mode",
} as const

/** Resolve the provider whose controls must be revealed for a deep link. */
export function getCloudSyncProviderForTarget(
  targetId: string | null,
): CloudSyncProvider | undefined {
  switch (targetId) {
    case WEBDAV_TARGET_IDS.gistToken:
    case WEBDAV_TARGET_IDS.gistId:
    case WEBDAV_TARGET_IDS.gistUrl:
    case WEBDAV_TARGET_IDS.gistUpload:
      return CLOUD_SYNC_PROVIDERS.GITHUB_GIST
    case WEBDAV_TARGET_IDS.url:
    case WEBDAV_TARGET_IDS.username:
    case WEBDAV_TARGET_IDS.password:
    case WEBDAV_TARGET_IDS.encryptionEnable:
      return CLOUD_SYNC_PROVIDERS.WEBDAV
    default:
      return undefined
  }
}
