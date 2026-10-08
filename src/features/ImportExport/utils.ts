import { BACKUP_VERSION } from "~/constants/importExport"
import toast from "~/lib/notify"
import { accountDataTransfer } from "~/services/accounts/accountStorage/accountDataTransfer"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/storage/profiles"
import { featureGuidanceState } from "~/services/featureGuidance/featureGuidanceState"
import {
  IMPORT_EXPORT_ERROR_CODES,
  ImportExportError,
  type BackupAccountsPartialV2,
  type BackupFullV2,
  type BackupPreferencesPartialV2,
  type ImportFromBackupOptions,
  type ImportResult,
  type RawBackupData,
} from "~/services/importExport/backupContracts"
import { importFromBackupObject as importFromBackupObjectService } from "~/services/importExport/importExportService"
import { channelConfigStorage } from "~/services/managedSites/channelConfigStorage"
import {
  ensureLegacyChannelConfigMigrationReady,
  LegacyChannelConfigMigrationDeferredError,
} from "~/services/managedSites/legacyChannelConfigMigration"
import { userPreferences } from "~/services/preferences/userPreferences"
import { tagStorage } from "~/services/tags/tagStorage"
import { formatUtcDayKey } from "~/utils/core/dayKey"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

/**
 * Unified logger scoped to import/export UI wrappers for backups and preferences.
 */
const logger = createLogger("ImportExportUtils")

/** Maps owned backup and migration failures to user-facing localized copy. */
export function getImportExportErrorMessage(error: unknown): string | null {
  if (error instanceof ImportExportError) {
    switch (error.code) {
      case IMPORT_EXPORT_ERROR_CODES.FormatNotCorrect:
        return t("importExport:import.formatNotCorrect")
      case IMPORT_EXPORT_ERROR_CODES.ImportFailed:
        return t("importExport:import.importOperationFailed")
      case IMPORT_EXPORT_ERROR_CODES.NoImportableData:
        return t("importExport:import.noImportableData")
      case IMPORT_EXPORT_ERROR_CODES.VersionNotSupported:
        return t("importExport:import.versionNotSupported")
    }
  }

  if (error instanceof LegacyChannelConfigMigrationDeferredError) {
    return t("importExport:import.channelConfigMigrationDeferred")
  }

  return null
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
    const message = getImportExportErrorMessage(error)
    if (message) {
      throw new Error(message)
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
    await ensureLegacyChannelConfigMigrationReady({ bypassBackoff: true })

    // 获取账号数据、用户偏好设置以及通道配置
    const [
      accountData,
      tagStore,
      preferencesData,
      featureGuidance,
      channelConfigs,
      apiCredentialProfiles,
    ] = await Promise.all([
      accountDataTransfer.exportData(),
      tagStorage.exportTagStore(),
      userPreferences.exportPreferencesForBackup(),
      featureGuidanceState.getState(),
      channelConfigStorage.exportConfigs(),
      apiCredentialProfilesStorage.exportConfig(),
    ])

    const exportData: BackupFullV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accounts: accountData,
      tagStore,
      preferences: preferencesData,
      featureGuidance,
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
    link.download = `all-api-hub-backup-${formatUtcDayKey()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success(t("importExport:export.dataExported"))
  } catch (error) {
    logger.error("导出失败", error)
    toast.error(t("importExport:export.exportFailed"))
    throw error
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
      accountDataTransfer.exportData(),
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
    link.download = `accounts-backup-${formatUtcDayKey()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success(t("importExport:export.accountsExported"))
  } catch (error) {
    logger.error("导出账号数据失败", error)
    toast.error(t("importExport:export.exportFailed"))
    throw error
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

    const [preferencesData, featureGuidance] = await Promise.all([
      userPreferences.exportPreferencesForBackup(),
      featureGuidanceState.getState(),
    ])
    const exportData: BackupPreferencesPartialV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      type: "preferences",
      preferences: preferencesData,
      featureGuidance,
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `preferences-backup-${formatUtcDayKey()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success(t("importExport:export.settingsExported"))
  } catch (error) {
    logger.error("导出用户设置失败", error)
    toast.error(t("importExport:export.exportFailed"))
    throw error
  } finally {
    setIsExporting(false)
  }
}
