import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  buildPageControlDefinition,
  buildPageSectionDefinition,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

import { WEBDAV_AUTO_SYNC_TARGET_IDS, WEBDAV_TARGET_IDS } from "./searchTargets"

export const importExportPageSearchSections: OptionsSearchItemDefinition[] = [
  buildPageSectionDefinition(
    "section:import-export-export",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    "export-section",
    "importExport:export.title",
    430,
    {
      descriptionKey: "importExport:export.description",
      keywords: ["backup", "export"],
    },
  ),
  buildPageSectionDefinition(
    "section:import-export-import",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    "import-section",
    "importExport:import.title",
    431,
    {
      descriptionKey: "importExport:import.description",
      keywords: ["backup", "import", "restore"],
    },
  ),
  buildPageSectionDefinition(
    "section:import-export-webdav",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    "webdav",
    "importExport:webdav.title",
    432,
    {
      descriptionKey: "importExport:webdav.configDesc",
      keywords: ["webdav", "backup", "sync"],
    },
  ),
  buildPageSectionDefinition(
    "section:import-export-webdav-auto-sync",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    "webdav-auto-sync",
    "importExport:webdav.autoSync.title",
    433,
    {
      descriptionKey: "importExport:webdav.autoSync.description",
      keywords: ["webdav", "auto sync", "schedule"],
    },
  ),
]

export const importExportPageSearchControls: OptionsSearchItemDefinition[] = [
  buildPageControlDefinition(
    "control:export-full-backup",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    "export-full-backup",
    "importExport:export.fullBackup",
    740,
    {
      descriptionKey: "importExport:export.fullBackupDescription",
      keywords: ["export", "backup"],
    },
  ),
  buildPageControlDefinition(
    "control:export-account-data",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    "export-account-data",
    "importExport:export.accountData",
    741,
    {
      descriptionKey: "importExport:export.accountDataDescription",
      keywords: ["export", "accounts"],
    },
  ),
  buildPageControlDefinition(
    "control:export-user-settings",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    "export-user-settings",
    "importExport:export.userSettings",
    742,
    {
      descriptionKey: "importExport:export.userSettingsDescription",
      keywords: ["export", "settings", "preferences"],
    },
  ),
  buildPageControlDefinition(
    "control:import-backup-file",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    "import-backup-file",
    "importExport:import.selectBackupFile",
    743,
    {
      descriptionKey: "importExport:import.description",
      keywords: ["import", "file", "json"],
    },
  ),
  buildPageControlDefinition(
    "control:import-data-preview",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    "import-data-preview",
    "importExport:import.dataPreview",
    744,
    {
      descriptionKey: "importExport:import.pasteJsonData",
      keywords: ["import", "json", "preview"],
    },
  ),
  buildPageControlDefinition(
    "control:webdav-restore-policy",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    WEBDAV_TARGET_IDS.restorePolicy,
    "importExport:webdav.restorePolicy.title",
    745,
    {
      descriptionKey: "importExport:webdav.restorePolicy.description",
      keywords: ["webdav", "restore policy"],
    },
  ),
  buildPageControlDefinition(
    "control:webdav-sync-data",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    WEBDAV_TARGET_IDS.syncData,
    "importExport:webdav.syncData.title",
    746,
    {
      descriptionKey: "importExport:webdav.syncData.description",
      keywords: ["webdav", "sync data"],
    },
  ),
  buildPageControlDefinition(
    "control:webdav-sync-data-accounts",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    WEBDAV_TARGET_IDS.syncDataAccounts,
    "importExport:webdav.syncData.accounts",
    746.1,
    {
      descriptionKey: "importExport:webdav.syncData.description",
      keywords: ["webdav", "sync data", "accounts"],
    },
  ),
  buildPageControlDefinition(
    "control:webdav-sync-data-bookmarks",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    WEBDAV_TARGET_IDS.syncDataBookmarks,
    "importExport:webdav.syncData.bookmarks",
    746.2,
    {
      descriptionKey: "importExport:webdav.syncData.description",
      keywords: ["webdav", "sync data", "bookmarks"],
    },
  ),
  buildPageControlDefinition(
    "control:webdav-sync-data-api-credential-profiles",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    WEBDAV_TARGET_IDS.syncDataApiCredentialProfiles,
    "importExport:webdav.syncData.apiCredentialProfiles",
    746.3,
    {
      descriptionKey: "importExport:webdav.syncData.description",
      keywords: [
        "webdav",
        "sync data",
        "api credential profiles",
        "credential profiles",
      ],
    },
  ),
  buildPageControlDefinition(
    "control:webdav-sync-data-preferences",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    WEBDAV_TARGET_IDS.syncDataPreferences,
    "importExport:webdav.syncData.preferences",
    746.4,
    {
      descriptionKey: "importExport:webdav.syncData.description",
      keywords: ["webdav", "sync data", "preferences", "settings"],
    },
  ),
  buildPageControlDefinition(
    "control:webdav-encryption-enable",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    WEBDAV_TARGET_IDS.encryptionEnable,
    "importExport:webdav.encryption.title",
    746.5,
    {
      descriptionKey: "importExport:webdav.encryption.enableDesc",
      keywords: ["webdav", "encryption", "backup encryption"],
    },
  ),
  buildPageControlDefinition(
    "control:webdav-encryption-password",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    WEBDAV_TARGET_IDS.encryptionPassword,
    "importExport:webdav.encryption.password",
    747,
    {
      descriptionKey: "importExport:webdav.encryption.passwordDesc",
      keywords: ["webdav", "encryption", "password"],
    },
  ),
  buildPageControlDefinition(
    "control:webdav-save-config",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    WEBDAV_TARGET_IDS.saveConfig,
    "importExport:webdav.saveConfig",
    748,
    {
      descriptionKey: "importExport:webdav.configDesc",
      keywords: ["webdav", "save"],
    },
  ),
  buildPageControlDefinition(
    "control:webdav-test-connection",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    WEBDAV_TARGET_IDS.testConnection,
    "importExport:webdav.testConnection",
    749,
    {
      descriptionKey: "importExport:webdav.configDesc",
      keywords: ["webdav", "test connection"],
    },
  ),
  buildPageControlDefinition(
    "control:webdav-upload-backup",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    WEBDAV_TARGET_IDS.uploadBackup,
    "importExport:webdav.uploadBackup",
    750,
    {
      descriptionKey: "importExport:webdav.configDesc",
      keywords: ["webdav", "upload", "backup"],
    },
  ),
  buildPageControlDefinition(
    "control:webdav-download-import",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    WEBDAV_TARGET_IDS.downloadImport,
    "importExport:webdav.downloadImport",
    751,
    {
      descriptionKey: "importExport:import.description",
      keywords: ["webdav", "download", "import"],
    },
  ),
  buildPageControlDefinition(
    "control:webdav-auto-sync-interval",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    WEBDAV_AUTO_SYNC_TARGET_IDS.interval,
    "importExport:webdav.autoSync.interval",
    752,
    {
      descriptionKey: "importExport:webdav.autoSync.intervalDesc",
      keywords: ["webdav", "auto sync", "interval"],
    },
  ),
  buildPageControlDefinition(
    "control:webdav-auto-sync-strategy",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    WEBDAV_AUTO_SYNC_TARGET_IDS.strategy,
    "importExport:webdav.autoSync.strategy",
    753,
    {
      descriptionKey: "importExport:webdav.autoSync.strategyDesc",
      keywords: ["webdav", "auto sync", "strategy"],
    },
  ),
  buildPageControlDefinition(
    "control:webdav-auto-sync-save-settings",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    WEBDAV_AUTO_SYNC_TARGET_IDS.saveSettings,
    "importExport:webdav.autoSync.saveSettings",
    754,
    {
      descriptionKey: "importExport:webdav.autoSync.description",
      keywords: ["webdav", "auto sync", "save"],
    },
  ),
  buildPageControlDefinition(
    "control:webdav-auto-sync-sync-now",
    MENU_ITEM_IDS.IMPORT_EXPORT,
    WEBDAV_AUTO_SYNC_TARGET_IDS.syncNow,
    "importExport:webdav.autoSync.syncNow",
    755,
    {
      descriptionKey: "importExport:webdav.autoSync.description",
      keywords: ["webdav", "auto sync", "sync now"],
    },
  ),
]
