import { t } from "i18next"
import toast from "react-hot-toast"

import { accountStorage } from "~/services/accounts/accountStorage"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import {
  BACKUP_VERSION,
  ImportExportError,
  importFromBackupObject as importFromBackupObjectService,
  normalizeBackupForMerge,
  parseBackupSummary,
  type BackupAccountsPartialV2,
  type BackupFullV2,
  type BackupPreferencesPartialV2,
  type BackupV2,
  type ImportFromBackupOptions,
  type ImportResult,
  type ParsedBackupSummary,
  type RawBackupData,
} from "~/services/importExport/importExportService"
import { channelConfigStorage } from "~/services/managedSites/channelConfigStorage"
import { userPreferences } from "~/services/preferences/userPreferences"
import { tagStorage } from "~/services/tags/tagStorage"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to import/export UI wrappers for backups and preferences.
 */
const logger = createLogger("ImportExportUtils")

export { BACKUP_VERSION, normalizeBackupForMerge, parseBackupSummary }
export type {
  ParsedBackupSummary,
  BackupFullV2,
  BackupAccountsPartialV2,
  BackupPreferencesPartialV2,
  BackupV2,
  RawBackupData,
  ImportResult,
  ImportFromBackupOptions,
}

/**
 * Import data from a backup object, which may be a full backup or a partial backup
 */
export async function importFromBackupObject(
  data: RawBackupData,
  options?: ImportFromBackupOptions,
): Promise<ImportResult> {
  try {
    return await importFromBackupObjectService(data, options)
  } catch (error) {
    if (error instanceof ImportExportError) {
      switch (error.code) {
        case "FORMAT_NOT_CORRECT":
          throw new Error(t("importExport:import.formatNotCorrect"))
        case "NO_IMPORTABLE_DATA":
          throw new Error(t("importExport:import.noImportableData"))
      }
    }

    throw error
  }
}

// 导出所有数据
/**
 * Export all persisted data (accounts, preferences, channelConfigs) as a
 * full V2 backup file and trigger a browser download.
 */
export const handleExportAll = async (
  setIsExporting: (isExporting: boolean) => void,
) => {
  try {
    setIsExporting(true)

    // 获取账号数据、用户偏好设置以及通道配置
    const [
      accountData,
      tagStore,
      preferencesData,
      channelConfigs,
      apiCredentialProfiles,
    ] = await Promise.all([
      accountStorage.exportData(),
      tagStorage.exportTagStore(),
      userPreferences.exportPreferences(),
      channelConfigStorage.exportConfigs(),
      apiCredentialProfilesStorage.exportConfig(),
    ])

    const exportData: BackupFullV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accounts: accountData,
      tagStore,
      preferences: preferencesData,
      channelConfigs,
      apiCredentialProfiles,
    }

    // 创建下载链接
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `all-api-hub-backup-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success(t("importExport:export.dataExported"))
  } catch (error) {
    logger.error("导出失败", error)
    toast.error(t("importExport:export.exportFailed"))
  } finally {
    setIsExporting(false)
  }
}

// 导出账号数据
/**
 * Export only account-related data as a partial V2 backup with
 * `type: "accounts"`.
 */
export const handleExportAccounts = async (
  setIsExporting: (isExporting: boolean) => void,
) => {
  try {
    setIsExporting(true)

    const [accountData, tagStore] = await Promise.all([
      accountStorage.exportData(),
      tagStorage.exportTagStore(),
    ])
    const exportData: BackupAccountsPartialV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      type: "accounts",
      accounts: accountData,
      tagStore,
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `accounts-backup-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success(t("importExport:export.accountsExported"))
  } catch (error) {
    logger.error("导出账号数据失败", error)
    toast.error(t("importExport:export.exportFailed"))
  } finally {
    setIsExporting(false)
  }
}

// 导出用户设置
/**
 * Export only user preference data as a partial V2 backup with
 * `type: "preferences"`.
 */
export const handleExportPreferences = async (
  setIsExporting: (isExporting: boolean) => void,
) => {
  try {
    setIsExporting(true)

    const preferencesData = await userPreferences.exportPreferences()
    const exportData: BackupPreferencesPartialV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      type: "preferences",
      preferences: preferencesData,
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `preferences-backup-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success(t("importExport:export.settingsExported"))
  } catch (error) {
    logger.error("导出用户设置失败", error)
    toast.error(t("importExport:export.exportFailed"))
  } finally {
    setIsExporting(false)
  }
}
