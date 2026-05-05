import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

import { WEBDAV_AUTO_SYNC_TARGET_IDS, WEBDAV_TARGET_IDS } from "./searchTargets"

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
    WEBDAV_TARGET_IDS.url,
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
    WEBDAV_TARGET_IDS.username,
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
    WEBDAV_TARGET_IDS.password,
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
    WEBDAV_AUTO_SYNC_TARGET_IDS.enable,
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
    WEBDAV_TARGET_IDS.restorePolicy,
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
    WEBDAV_TARGET_IDS.syncData,
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
    WEBDAV_TARGET_IDS.syncDataAccounts,
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
    WEBDAV_TARGET_IDS.syncDataBookmarks,
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
    WEBDAV_TARGET_IDS.syncDataApiCredentialProfiles,
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
    WEBDAV_TARGET_IDS.syncDataPreferences,
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
    WEBDAV_TARGET_IDS.encryptionEnable,
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
    WEBDAV_TARGET_IDS.encryptionPassword,
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
    WEBDAV_TARGET_IDS.saveConfig,
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
    WEBDAV_TARGET_IDS.testConnection,
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
    WEBDAV_TARGET_IDS.uploadBackup,
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
    WEBDAV_TARGET_IDS.downloadImport,
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
    WEBDAV_AUTO_SYNC_TARGET_IDS.interval,
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
    WEBDAV_AUTO_SYNC_TARGET_IDS.strategy,
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
    WEBDAV_AUTO_SYNC_TARGET_IDS.saveSettings,
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
    WEBDAV_AUTO_SYNC_TARGET_IDS.syncNow,
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
