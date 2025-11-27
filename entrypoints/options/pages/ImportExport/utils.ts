import { t } from "i18next"
import toast from "react-hot-toast"

import { accountStorage } from "~/services/accountStorage"
import { channelConfigStorage } from "~/services/channelConfigStorage"
import type { UserPreferences } from "~/services/userPreferences"
import { userPreferences } from "~/services/userPreferences"
import type { StorageConfig } from "~/types"
import type { ChannelConfigMap } from "~/types/channelConfig"

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
 * V2 full backup payload (used by "export all" and WebDAV sync uploads).
 * This is the primary canonical structure we write from the app.
 */
export interface BackupFullV2 {
  version: string
  timestamp: number
  accounts: StorageConfig
  preferences: UserPreferences
  channelConfigs: ChannelConfigMap
}

/**
 * V2 partial backup: accounts only.
 */
export interface BackupAccountsPartialV2 {
  version: string
  timestamp: number
  type: "accounts"
  accounts: StorageConfig
}

/**
 * V2 partial backup: preferences only.
 */
export interface BackupPreferencesPartialV2 {
  version: string
  timestamp: number
  type: "preferences"
  preferences: UserPreferences
}

export type BackupV2 =
  | BackupFullV2
  | BackupAccountsPartialV2
  | BackupPreferencesPartialV2

/**
 * Legacy / tolerant backup payload (primarily for V1 and older shapes).
 * Kept broad on purpose to accept historical data from users.
 */
type LegacyBackupLike = {
  version?: string
  timestamp?: number | string
  type?: "accounts" | "preferences" | "channelConfigs" | string
  accounts?: any
  preferences?: any
  channelConfigs?: any
  data?: any
}

/**
 * Raw backup payload as stored in files / WebDAV.
 *
 * We keep this type deliberately tolerant (LegacyBackupLike) so that it can
 * accept both canonical V2 exports (BackupV2) and historical/unknown shapes.
 * The stricter V2 interfaces are still used at export call sites to guarantee
 * that what we write conforms to the latest schema.
 */
export type RawBackupData = LegacyBackupLike

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

async function importV1Backup(
  data: RawBackupData
): Promise<{ imported: boolean }> {
  let importSuccess = false

  // accounts: support both legacy partial exports and older full exports
  if (data.accounts || data.type === "accounts") {
    const accountsData =
      (data.accounts as any)?.accounts ??
      (data.data as any)?.accounts ??
      data.accounts

    if (accountsData) {
      await accountStorage.importData({
        accounts: accountsData
      })
      importSuccess = true
    }
  }

  // preferences
  if (data.preferences || data.type === "preferences") {
    const preferencesData = data.preferences || data.data
    if (preferencesData) {
      const success = await userPreferences.importPreferences(preferencesData)
      if (success) {
        importSuccess = true
      }
    }
  }

  // channel configs: best-effort support if present in V1 backups
  if (data.channelConfigs || data.type === "channelConfigs") {
    const channelConfigsData = data.channelConfigs || data.data
    if (channelConfigsData) {
      await channelConfigStorage.importConfigs(channelConfigsData)
      importSuccess = true
    }
  }

  if (!importSuccess) {
    throw new Error(t("importExport:import.noImportableData"))
  }

  return { imported: true }
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
  channelConfigs: ChannelConfigMap | null
} {
  if (!data) {
    return {
      accounts: [],
      accountsTimestamp: 0,
      preferences: null,
      channelConfigs: null
    }
  }

  const version = data.version ?? "1.0"

  if (version === BACKUP_VERSION) {
    // For V2, we expect the canonical full-backup shape
    return normalizeV2BackupForMerge(data as BackupFullV2, localPreferences)
  }

  // V1 and unknown versions: use tolerant legacy-normalization
  return normalizeV1BackupForMerge(data, localPreferences)
}

function normalizeV2BackupForMerge(
  data: BackupFullV2,
  localPreferences: any
): {
  accounts: any[]
  accountsTimestamp: number
  preferences: any | null
  channelConfigs: ChannelConfigMap | null
} {
  const accountsField: any = data.accounts
  const accounts = Array.isArray(accountsField)
    ? accountsField
    : accountsField?.accounts || []

  const accountsTimestamp =
    accountsField?.last_updated || (data.timestamp as number) || 0

  const rawChannelConfigs = data.channelConfigs
  const channelConfigs: ChannelConfigMap | null =
    rawChannelConfigs && typeof rawChannelConfigs === "object"
      ? (rawChannelConfigs as ChannelConfigMap)
      : null

  return {
    accounts,
    accountsTimestamp,
    preferences: data.preferences || localPreferences,
    channelConfigs
  }
}

function normalizeV1BackupForMerge(
  data: RawBackupData,
  localPreferences: any
): {
  accounts: any[]
  accountsTimestamp: number
  preferences: any | null
  channelConfigs: ChannelConfigMap | null
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

  const rawChannelConfigs =
    (data as any).channelConfigs || (data.data as any)?.channelConfigs
  const channelConfigs: ChannelConfigMap | null =
    rawChannelConfigs && typeof rawChannelConfigs === "object"
      ? (rawChannelConfigs as ChannelConfigMap)
      : null

  return {
    accounts,
    accountsTimestamp,
    preferences,
    channelConfigs
  }
}

async function importV2Backup(data: BackupV2): Promise<{ imported: boolean }> {
  let importSuccess = false

  // V2 assumes flat structure: accounts / preferences / channelConfigs directly on root

  if ("accounts" in data) {
    const accountsConfig = (data as BackupFullV2 | BackupAccountsPartialV2)
      .accounts

    await accountStorage.importData({
      accounts: accountsConfig.accounts
    })
    importSuccess = true
  }

  if ("preferences" in data) {
    const { preferences } = data as BackupFullV2 | BackupPreferencesPartialV2
    const success = await userPreferences.importPreferences(preferences)
    if (success) {
      importSuccess = true
    }
  }

  if ("channelConfigs" in data && (data as BackupFullV2).channelConfigs) {
    await channelConfigStorage.importConfigs(
      (data as BackupFullV2).channelConfigs
    )
    importSuccess = true
  }

  if (!importSuccess) {
    throw new Error(t("importExport:import.noImportableData"))
  }

  return { imported: true }
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
export async function importFromBackupObject(
  data: RawBackupData
): Promise<{ imported: boolean }> {
  // timestamp is required for all versions; version is optional for backward compatibility
  if (!data.timestamp) {
    throw new Error(t("importExport:import.formatNotCorrect"))
  }

  const version = data.version ?? "1.0"

  if (version === "1.0") {
    return importV1Backup(data)
  }

  if (version === BACKUP_VERSION) {
    return importV2Backup(data as BackupV2)
  }

  // Unknown future version: fall back to tolerant V1-style import
  return importV1Backup(data)
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

    const exportData: BackupFullV2 = {
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
    const exportData: BackupAccountsPartialV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      type: "accounts",
      accounts: accountData
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
    const exportData: BackupPreferencesPartialV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      type: "preferences",
      preferences: preferencesData
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
