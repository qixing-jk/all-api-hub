import { t } from "i18next"
import toast from "react-hot-toast"

import { accountStorage } from "~/services/accountStorage"
import { channelConfigStorage } from "~/services/channelConfigStorage"
import { userPreferences } from "~/services/userPreferences"

/**
 * Current backup schema version.
 *
 * V1: legacy backups, may use nested structures (e.g. accounts.accounts, data.accounts).
 * V2: flat structure with accounts / preferences / channelConfigs on the root object.
 *
 * When introducing V3+, prefer adding a dedicated import handler and updating
 * importFromBackupObject + normalizeBackupForMerge dispatch logic.
 */
export const BACKUP_VERSION = "2.0"

export interface ParsedBackupSummary {
  valid: boolean
  hasAccounts: boolean
  hasPreferences: boolean
  hasChannelConfigs: boolean
  timestamp: string
}

/**
 * Raw backup payload as stored in files / WebDAV.
 *
 * This type intentionally captures both legacy (V1) and current (V2) shapes:
 * - V1/legacy may use nested accounts.accounts and/or data.accounts / data.preferences.
 * - V2 uses a flat structure with accounts / preferences / channelConfigs at root.
 */
interface RawBackupData {
  version?: string
  timestamp?: number | string
  type?: "accounts" | "preferences" | "channelConfigs" | string
  // full backup shape
  accounts?: any
  preferences?: any
  channelConfigs?: any
  // legacy partial export shape
  data?: any
}

export function parseBackupSummary(
  importData: string,
  unknownLabel: string
): ParsedBackupSummary | { valid: false } | null {
  if (!importData.trim()) return null

  try {
    const data = JSON.parse(importData) as RawBackupData

    const hasAccounts = Boolean(data.accounts || data.type === "accounts")
    const hasPreferences = Boolean(
      data.preferences || data.type === "preferences"
    )
    const hasChannelConfigs = Boolean(
      data.channelConfigs || data.type === "channelConfigs"
    )

    const ts =
      data.timestamp && !Number.isNaN(new Date(data.timestamp).getTime())
        ? new Date(data.timestamp).toLocaleString()
        : unknownLabel

    return {
      valid: true,
      hasAccounts,
      hasPreferences,
      hasChannelConfigs,
      timestamp: ts
    }
  } catch {
    return { valid: false }
  }
}

async function importV1Backup(data: RawBackupData) {
  let importSuccess = false

  // accounts: support both legacy partial exports and older full exports
  if (data.accounts || data.type === "accounts") {
    const accountsData =
      (data.accounts as any)?.accounts ??
      (data.data as any)?.accounts ??
      data.accounts

    if (accountsData) {
      const { migratedCount } = await accountStorage.importData({
        accounts: accountsData
      })
      importSuccess = true
      return { imported: true, migratedCount }
    }
  }

  // preferences
  if (data.preferences || data.type === "preferences") {
    const preferencesData = data.preferences || data.data
    if (preferencesData) {
      const success = await userPreferences.importPreferences(preferencesData)
      if (success) {
        importSuccess = true
        return { imported: true }
      }
    }
  }

  // channel configs: best-effort support if present in V1 backups
  if (data.channelConfigs || data.type === "channelConfigs") {
    const channelConfigsData = data.channelConfigs || data.data
    if (channelConfigsData) {
      const importedChannelConfigsCount =
        await channelConfigStorage.importConfigs(channelConfigsData)
      importSuccess = true
      return { imported: true, importedChannelConfigsCount }
    }
  }

  if (!importSuccess) {
    throw new Error(t("importExport:import.noImportableData"))
  }

  return { imported: false }
}

/**
 * Normalize a backup object for use in merge operations (e.g. WebDAV auto-sync).
 *
 * Returns a version-agnostic shape: { accounts, accountsTimestamp, preferences }.
 * - For V2 (BACKUP_VERSION): assumes flat structure; tolerant of { accounts, last_updated }.
 * - For V1 / unknown versions: tolerant of legacy shapes (accounts.accounts, data.accounts,
 *   data.preferences, etc.) and falls back to localPreferences where needed.
 *
 * This helper is separate from importFromBackupObject because merge flows often
 * treat remote data differently (e.g. two-way merge) compared to one-shot imports.
 */
export function normalizeBackupForMerge(
  data: RawBackupData | null,
  localPreferences: any
): {
  accounts: any[]
  accountsTimestamp: number
  preferences: any | null
} {
  if (!data) {
    return {
      accounts: [],
      accountsTimestamp: 0,
      preferences: null
    }
  }

  const version = data.version ?? "1.0"

  if (version === BACKUP_VERSION) {
    return normalizeV2BackupForMerge(data, localPreferences)
  }

  // V1 and unknown versions: use tolerant legacy-normalization
  return normalizeV1BackupForMerge(data, localPreferences)
}

function normalizeV2BackupForMerge(
  data: RawBackupData,
  localPreferences: any
): {
  accounts: any[]
  accountsTimestamp: number
  preferences: any | null
} {
  const accountsField: any = data.accounts
  const accounts = Array.isArray(accountsField)
    ? accountsField
    : accountsField?.accounts || []

  const accountsTimestamp =
    accountsField?.last_updated || (data.timestamp as number) || 0

  return {
    accounts,
    accountsTimestamp,
    preferences: data.preferences || localPreferences
  }
}

function normalizeV1BackupForMerge(
  data: RawBackupData,
  localPreferences: any
): {
  accounts: any[]
  accountsTimestamp: number
  preferences: any | null
} {
  const accountsField: any = data.accounts
  const accounts =
    accountsField?.accounts ||
    (data.data as any)?.accounts ||
    (Array.isArray(accountsField) ? accountsField : [])

  const accountsTimestamp =
    accountsField?.last_updated || (data.timestamp as number) || 0

  const preferences =
    data.preferences || (data.data as any)?.preferences || localPreferences

  return {
    accounts,
    accountsTimestamp,
    preferences
  }
}

async function importV2Backup(data: RawBackupData) {
  let importSuccess = false

  // V2 assumes flat structure: accounts / preferences / channelConfigs directly on root

  if (data.accounts) {
    const { migratedCount } = await accountStorage.importData({
      accounts: data.accounts
    })
    importSuccess = true
    return { imported: true, migratedCount }
  }

  if (data.preferences) {
    const success = await userPreferences.importPreferences(data.preferences)
    if (success) {
      importSuccess = true
      return { imported: true }
    }
  }

  if (data.channelConfigs) {
    const importedChannelConfigsCount =
      await channelConfigStorage.importConfigs(data.channelConfigs)
    importSuccess = true
    return { imported: true, importedChannelConfigsCount }
  }

  if (!importSuccess) {
    throw new Error(t("importExport:import.noImportableData"))
  }

  return { imported: false }
}

/**
 * Import a backup object into local storage in a version-aware way.
 *
 * Dispatches to specific handlers per version:
 * - V1 (or missing version): tolerant of legacy shapes and tries to import
 *   accounts, preferences and channelConfigs when present.
 * - V2 (BACKUP_VERSION): expects a flat structure with accounts / preferences /
 *   channelConfigs at root.
 * - Future versions: currently fall back to V2 behavior; when adding V3+ define
 *   an importV3Backup and extend this dispatcher.
 */
export async function importFromBackupObject(data: RawBackupData) {
  // timestamp is required for all versions; version is optional for backward compatibility
  if (!data.timestamp) {
    throw new Error(t("importExport:import.formatNotCorrect"))
  }

  const version = data.version ?? "1.0"

  if (version === "1.0") {
    return importV1Backup(data)
  }

  if (version === BACKUP_VERSION) {
    return importV2Backup(data)
  }

  // Unknown future version: use latest V2 behavior as best-effort
  return importV2Backup(data)
}

// 导出所有数据
export const handleExportAll = async (
  setIsExporting: (isExporting: boolean) => void
) => {
  try {
    setIsExporting(true)

    // 获取账号数据、用户偏好设置以及通道配置
    const [accountData, preferencesData, channelConfigs] = await Promise.all([
      accountStorage.exportData(),
      userPreferences.exportPreferences(),
      channelConfigStorage.exportConfigs()
    ])

    const exportData = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accounts: accountData,
      preferences: preferencesData,
      channelConfigs
    }

    // 创建下载链接
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json"
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
    console.error("导出失败:", error)
    toast.error(t("importExport:export.exportFailed"))
  } finally {
    setIsExporting(false)
  }
}

// 导出账号数据
export const handleExportAccounts = async (
  setIsExporting: (isExporting: boolean) => void
) => {
  try {
    setIsExporting(true)

    const accountData = await accountStorage.exportData()
    const exportData = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      type: "accounts",
      data: accountData
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json"
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
    console.error("导出账号数据失败:", error)
    toast.error(t("importExport:export.exportFailed"))
  } finally {
    setIsExporting(false)
  }
}

// 导出用户设置
export const handleExportPreferences = async (
  setIsExporting: (isExporting: boolean) => void
) => {
  try {
    setIsExporting(true)

    const preferencesData = await userPreferences.exportPreferences()
    const exportData = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      type: "preferences",
      data: preferencesData
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json"
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
    console.error("导出用户设置失败:", error)
    toast.error(t("importExport:export.exportFailed"))
  } finally {
    setIsExporting(false)
  }
}
