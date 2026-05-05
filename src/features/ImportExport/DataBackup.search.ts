import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

export const dataBackupSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:import-export-entry",
    "dataBackup",
    "import-export-entry",
    "settings:dataBackup.importExport.title",
    420,
  ),
  buildSectionDefinition(
    "section:webdav",
    "dataBackup",
    "webdav",
    "importExport:webdav.title",
    421,
    {
      keywords: ["webdav"],
    },
  ),
  buildSectionDefinition(
    "section:webdav-auto-sync",
    "dataBackup",
    "webdav-auto-sync",
    "importExport:webdav.autoSync.title",
    422,
    {
      keywords: ["webdav", "sync"],
    },
  ),
]

export const dataBackupSearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:webdav-url",
    "dataBackup",
    "webdav-url",
    "importExport:webdav.webdavUrl",
    720,
    {
      descriptionKey: "importExport:webdav.configDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.title",
      ],
      keywords: ["webdav", "url", "backup"],
    },
  ),
  buildControlDefinition(
    "control:webdav-username",
    "dataBackup",
    "webdav-username",
    "importExport:webdav.username",
    721,
    {
      descriptionKey: "importExport:webdav.configDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.title",
      ],
      keywords: ["webdav", "username"],
    },
  ),
  buildControlDefinition(
    "control:webdav-password",
    "dataBackup",
    "webdav-password",
    "importExport:webdav.password",
    722,
    {
      descriptionKey: "importExport:webdav.configDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.title",
      ],
      keywords: ["webdav", "password"],
    },
  ),
  buildControlDefinition(
    "control:webdav-auto-sync-enable",
    "dataBackup",
    "webdav-auto-sync-enable",
    "importExport:webdav.autoSync.enable",
    723,
    {
      descriptionKey: "importExport:webdav.autoSync.enableDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.autoSync.title",
      ],
      keywords: ["webdav", "auto sync"],
    },
  ),
  buildControlDefinition(
    "control:webdav-restore-policy-data-backup",
    "dataBackup",
    "webdav-restore-policy",
    "importExport:webdav.restorePolicy.title",
    724,
    {
      descriptionKey: "importExport:webdav.restorePolicy.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.title",
      ],
      keywords: ["webdav", "restore policy"],
    },
  ),
  buildControlDefinition(
    "control:webdav-sync-data-data-backup",
    "dataBackup",
    "webdav-sync-data",
    "importExport:webdav.syncData.title",
    725,
    {
      descriptionKey: "importExport:webdav.syncData.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.title",
      ],
      keywords: ["webdav", "sync data"],
    },
  ),
  buildControlDefinition(
    "control:webdav-sync-data-accounts-data-backup",
    "dataBackup",
    "webdavSyncDataAccounts",
    "importExport:webdav.syncData.accounts",
    725.1,
    {
      descriptionKey: "importExport:webdav.syncData.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.title",
        "importExport:webdav.syncData.title",
      ],
      keywords: ["webdav", "sync data", "accounts"],
    },
  ),
  buildControlDefinition(
    "control:webdav-sync-data-bookmarks-data-backup",
    "dataBackup",
    "webdavSyncDataBookmarks",
    "importExport:webdav.syncData.bookmarks",
    725.2,
    {
      descriptionKey: "importExport:webdav.syncData.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.title",
        "importExport:webdav.syncData.title",
      ],
      keywords: ["webdav", "sync data", "bookmarks"],
    },
  ),
  buildControlDefinition(
    "control:webdav-sync-data-api-credential-profiles-data-backup",
    "dataBackup",
    "webdavSyncDataApiCredentialProfiles",
    "importExport:webdav.syncData.apiCredentialProfiles",
    725.3,
    {
      descriptionKey: "importExport:webdav.syncData.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.title",
        "importExport:webdav.syncData.title",
      ],
      keywords: [
        "webdav",
        "sync data",
        "api credential profiles",
        "credential profiles",
      ],
    },
  ),
  buildControlDefinition(
    "control:webdav-sync-data-preferences-data-backup",
    "dataBackup",
    "webdavSyncDataPreferences",
    "importExport:webdav.syncData.preferences",
    725.4,
    {
      descriptionKey: "importExport:webdav.syncData.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.title",
        "importExport:webdav.syncData.title",
      ],
      keywords: ["webdav", "sync data", "preferences", "settings"],
    },
  ),
  buildControlDefinition(
    "control:webdav-encryption-enable-data-backup",
    "dataBackup",
    "webdav-encryption-enable",
    "importExport:webdav.encryption.title",
    726,
    {
      descriptionKey: "importExport:webdav.encryption.enableDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.title",
      ],
      keywords: ["webdav", "encryption", "backup encryption"],
    },
  ),
  buildControlDefinition(
    "control:webdav-encryption-password-data-backup",
    "dataBackup",
    "webdav-encryption-password",
    "importExport:webdav.encryption.password",
    727,
    {
      descriptionKey: "importExport:webdav.encryption.passwordDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.title",
      ],
      keywords: ["webdav", "encryption", "password"],
    },
  ),
  buildControlDefinition(
    "control:webdav-save-config-data-backup",
    "dataBackup",
    "webdav-save-config",
    "importExport:webdav.saveConfig",
    728,
    {
      descriptionKey: "importExport:webdav.configDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.title",
      ],
      keywords: ["webdav", "save"],
    },
  ),
  buildControlDefinition(
    "control:webdav-test-connection-data-backup",
    "dataBackup",
    "webdav-test-connection",
    "importExport:webdav.testConnection",
    729,
    {
      descriptionKey: "importExport:webdav.configDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.title",
      ],
      keywords: ["webdav", "test connection"],
    },
  ),
  buildControlDefinition(
    "control:webdav-upload-backup-data-backup",
    "dataBackup",
    "webdav-upload-backup",
    "importExport:webdav.uploadBackup",
    730,
    {
      descriptionKey: "importExport:webdav.configDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.title",
      ],
      keywords: ["webdav", "upload", "backup"],
    },
  ),
  buildControlDefinition(
    "control:webdav-download-import-data-backup",
    "dataBackup",
    "webdav-download-import",
    "importExport:webdav.downloadImport",
    731,
    {
      descriptionKey: "importExport:import.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.title",
      ],
      keywords: ["webdav", "download", "import"],
    },
  ),
  buildControlDefinition(
    "control:webdav-auto-sync-interval-data-backup",
    "dataBackup",
    "webdav-auto-sync-interval",
    "importExport:webdav.autoSync.interval",
    732,
    {
      descriptionKey: "importExport:webdav.autoSync.intervalDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.autoSync.title",
      ],
      keywords: ["webdav", "auto sync", "interval"],
    },
  ),
  buildControlDefinition(
    "control:webdav-auto-sync-strategy-data-backup",
    "dataBackup",
    "webdav-auto-sync-strategy",
    "importExport:webdav.autoSync.strategy",
    733,
    {
      descriptionKey: "importExport:webdav.autoSync.strategyDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.autoSync.title",
      ],
      keywords: ["webdav", "auto sync", "strategy"],
    },
  ),
  buildControlDefinition(
    "control:webdav-auto-sync-save-settings-data-backup",
    "dataBackup",
    "webdav-auto-sync-save-settings",
    "importExport:webdav.autoSync.saveSettings",
    734,
    {
      descriptionKey: "importExport:webdav.autoSync.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.autoSync.title",
      ],
      keywords: ["webdav", "auto sync", "save"],
    },
  ),
  buildControlDefinition(
    "control:webdav-auto-sync-sync-now-data-backup",
    "dataBackup",
    "webdav-auto-sync-sync-now",
    "importExport:webdav.autoSync.syncNow",
    735,
    {
      descriptionKey: "importExport:webdav.autoSync.description",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.dataBackup",
        "importExport:webdav.autoSync.title",
      ],
      keywords: ["webdav", "auto sync", "sync now"],
    },
  ),
]
