import { t } from "i18next"
import toast from "react-hot-toast"

import { accountStorage } from "~/services/accountStorage"
import { channelConfigStorage } from "~/services/channelConfigStorage"
import type { UserPreferences } from "~/services/userPreferences"
import { userPreferences } from "~/services/userPreferences"
import type { AccountStorageConfig } from "~/types"
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
  accounts: AccountStorageConfig
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
  accounts: AccountStorageConfig
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

export interface ImportResult {
  allImported: boolean
  sections: {
    accounts: boolean
    preferences: boolean
    channelConfigs: boolean
  }
}

/**
 * Parse a raw backup JSON string into a lightweight summary used by the
 * import UI. This is tolerant of both legacy (V1) and V2 payload shapes and
 * never throws: on invalid JSON it returns `{ valid: false }`.
 */
export function parseBackupSummary(
  importData: string,
  unknownLabel: string,
): ParsedBackupSummary | { valid: false } | null {
  if (!importData.trim()) return null

  try {
    const data = JSON.parse(importData) as RawBackupData

    const hasAccounts = Boolean(data.accounts || data.type === "accounts")
    const hasPreferences = Boolean(
      data.preferences || data.type === "preferences",
    )
    const hasChannelConfigs = Boolean(
      data.channelConfigs || data.type === "channelConfigs",
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
      timestamp: ts,
    }
  } catch {
    return { valid: false }
  }
}

/**
 * Handles legacy (V1) backup payloads by importing accounts/preferences/channel configs when present.
 */
async function importV1Backup(data: RawBackupData): Promise<ImportResult> {
  let accountsImported = false
  let preferencesImported = false
  let channelConfigsImported = false

  const accountsRequested = Boolean(data.accounts || data.type === "accounts")
  const preferencesRequested = Boolean(
    data.preferences || data.type === "preferences",
  )
  const channelConfigsRequested = Boolean(
    data.channelConfigs || data.type === "channelConfigs",
  )

  // accounts: support both legacy partial exports and older full exports
  if (accountsRequested) {
    const accountsData =
      (data.accounts as any)?.accounts ??
      (data.data as any)?.accounts ??
      data.accounts

    if (accountsData) {
      await accountStorage.importData({
        accounts: accountsData,
      })
      accountsImported = true
    }
  }

  // preferences
  if (preferencesRequested) {
    const preferencesData = data.preferences || data.data?.preferences
    if (preferencesData) {
      const success = await userPreferences.importPreferences(preferencesData)
      if (success) {
        preferencesImported = true
      } else {
        console.error(
          "[Import] Failed to import user preferences from legacy backup",
        )
      }
    }
  }

  // channel configs: best-effort support if present in V1 backups
  if (channelConfigsRequested) {
    const channelConfigsData = data.channelConfigs || data.data?.channelConfigs
    if (channelConfigsData) {
      await channelConfigStorage.importConfigs(channelConfigsData)
      channelConfigsImported = true
    }
  }

  const anyImported =
    accountsImported || preferencesImported || channelConfigsImported

  if (!anyImported) {
    throw new Error(t("importExport:import.noImportableData"))
  }

  const allImported =
    (!accountsRequested || accountsImported) &&
    (!preferencesRequested || preferencesImported) &&
    (!channelConfigsRequested || channelConfigsImported)

  return {
    allImported,
    sections: {
      accounts: accountsImported,
      preferences: preferencesImported,
      channelConfigs: channelConfigsImported,
    },
  }
}

/**
 * Normalize an arbitrary backup payload (V1/V2/unknown) into a canonical
 * structure that `WebdavAutoSyncService` can merge. This is intentionally
 * tolerant so that older backups do not break newer clients.
 */
export function normalizeBackupForMerge(
  data: RawBackupData | null,
  localPreferences: any,
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
      channelConfigs: null,
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

/**
 * Normalize canonical V2 backups into the shape WebDAV merge expects.
 */
function normalizeV2BackupForMerge(
  data: BackupFullV2,
  localPreferences: any,
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
    channelConfigs,
  }
}

/**
 * Normalize legacy (V1/unknown) backups into merge-friendly structure.
 */
function normalizeV1BackupForMerge(
  data: RawBackupData,
  localPreferences: any,
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
    channelConfigs,
  }
}

/**
 * Import a canonical V2 backup (full or partial) into local storage.
 */
async function importV2Backup(data: BackupV2): Promise<ImportResult> {
  let accountsImported = false
  let preferencesImported = false
  let channelConfigsImported = false

  const accountsRequested = "accounts" in data
  const preferencesRequested = "preferences" in data
  const channelConfigsRequested =
    "channelConfigs" in data && Boolean((data as BackupFullV2).channelConfigs)

  // V2 assumes flat structure: accounts / preferences / channelConfigs directly on root

  if (accountsRequested) {
    const accountsConfig = (data as BackupFullV2 | BackupAccountsPartialV2)
      .accounts

    const accounts = Array.isArray(accountsConfig)
      ? accountsConfig
      : accountsConfig?.accounts || []

    const pinnedAccountIds =
      !Array.isArray(accountsConfig) &&
      Array.isArray((accountsConfig as AccountStorageConfig).pinnedAccountIds)
        ? (accountsConfig as AccountStorageConfig).pinnedAccountIds
        : []

    await accountStorage.importData({
      accounts,
      pinnedAccountIds,
    })
    accountsImported = true
  }

  if (preferencesRequested) {
    const { preferences } = data as BackupFullV2 | BackupPreferencesPartialV2
    const success = await userPreferences.importPreferences(preferences)
    if (success) {
      preferencesImported = true
    } else {
      console.error("[Import] Failed to import user preferences from V2 backup")
    }
  }

  if (channelConfigsRequested) {
    await channelConfigStorage.importConfigs(
      (data as BackupFullV2).channelConfigs,
    )
    channelConfigsImported = true
  }

  const anyImported =
    accountsImported || preferencesImported || channelConfigsImported

  if (!anyImported) {
    throw new Error(t("importExport:import.noImportableData"))
  }

  const allImported =
    (!accountsRequested || accountsImported) &&
    (!preferencesRequested || preferencesImported) &&
    (!channelConfigsRequested || channelConfigsImported)

  return {
    allImported,
    sections: {
      accounts: accountsImported,
      preferences: preferencesImported,
      channelConfigs: channelConfigsImported,
    },
  }
}

/**
 * Import a backup object into local storage in a version-aware way.
 *
 * Dispatches to specific handlers per version:
 * - V1 (or missing version): tolerant of legacy shapes and tries to import
 *   accounts, preferences and channelConfigs when present.
 * - V2 (BACKUP_VERSION): expects a flat structure with accounts / preferences /
 *   channelConfigs at root.
 * - Future versions: currently fall back to the tolerant V1-style import
 *   (importV1Backup). When adding V3+, define an importV3Backup and extend
 *   this dispatcher.
 */
export async function importFromBackupObject(
  data: RawBackupData,
): Promise<ImportResult> {
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
    const [accountData, preferencesData, channelConfigs] = await Promise.all([
      accountStorage.exportData(),
      userPreferences.exportPreferences(),
      channelConfigStorage.exportConfigs(),
    ])

    const exportData: BackupFullV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accounts: accountData,
      preferences: preferencesData,
      channelConfigs,
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
    console.error("导出失败:", error)
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

    const accountData = await accountStorage.exportData()
    const exportData: BackupAccountsPartialV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      type: "accounts",
      accounts: accountData,
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
    console.error("导出账号数据失败:", error)
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
    console.error("导出用户设置失败:", error)
    toast.error(t("importExport:export.exportFailed"))
  } finally {
    setIsExporting(false)
  }
}

/**
 * CC Switch provider configuration structure
 */
interface CCSwitchProvider {
  id: string
  app_type: string
  name: string
  settings_config: string
  website_url: string | null
  category: string | null
  created_at: number | null
  sort_index: number | null
  notes: string | null
  icon: string | null
  icon_color: string | null
  meta: string
  is_current: number
}

/**
 * CC Switch provider endpoint structure
 */
interface CCSwitchProviderEndpoint {
  id: number
  provider_id: string
  app_type: string
  url: string
  added_at: number | null
}

/**
 * Generate a UUID v4 string
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Escape a string for SQL insertion
 */
function escapeSqlString(str: string): string {
  return str.replace(/'/g, "''")
}

/**
 * Format a timestamp for SQL comment
 */
function formatSqlTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "")
}

/**
 * Export account data as CC Switch SQLite format.
 * This generates a SQL file compatible with CC Switch's import functionality.
 */
export const handleExportCCSwitch = async (
  setIsExporting: (isExporting: boolean) => void,
) => {
  try {
    setIsExporting(true)

    const accountData = await accountStorage.exportData()
    const accounts = accountData.accounts || []

    if (accounts.length === 0) {
      toast.error(t("importExport:export.noAccountsToExport"))
      return
    }

    const now = Date.now()
    const providers: CCSwitchProvider[] = []
    const providerEndpoints: CCSwitchProviderEndpoint[] = []
    let endpointId = 1

    for (const account of accounts) {
      const providerId = generateUUID()
      const baseUrl = account.site_url.replace(/\/$/, "")

      // Build settings_config JSON
      const settingsConfig = {
        env: {
          ANTHROPIC_AUTH_TOKEN: account.account_info.access_token,
          ANTHROPIC_BASE_URL: baseUrl,
        },
      }

      const provider: CCSwitchProvider = {
        id: providerId,
        app_type: "claude",
        name: account.site_name || baseUrl,
        settings_config: JSON.stringify(settingsConfig),
        website_url: baseUrl,
        category: null,
        created_at: account.created_at || now,
        sort_index: null,
        notes: account.notes || null,
        icon: null,
        icon_color: null,
        meta: "{}",
        is_current: 0,
      }
      providers.push(provider)

      const endpoint: CCSwitchProviderEndpoint = {
        id: endpointId++,
        provider_id: providerId,
        app_type: "claude",
        url: baseUrl,
        added_at: account.created_at || now,
      }
      providerEndpoints.push(endpoint)
    }

    // Generate SQL content
    let sql = `-- CC Switch SQLite 导出\n`
    sql += `-- 生成时间: ${formatSqlTimestamp(now)}\n`
    sql += `-- 来源: All API Hub\n`
    sql += `-- user_version: 1\n`
    sql += `PRAGMA foreign_keys=OFF;\n`
    sql += `PRAGMA user_version=1;\n`
    sql += `BEGIN TRANSACTION;\n`

    // Create tables
    sql += `CREATE TABLE IF NOT EXISTS mcp_servers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                server_config TEXT NOT NULL,
                description TEXT,
                homepage TEXT,
                docs TEXT,
                tags TEXT NOT NULL DEFAULT '[]',
                enabled_claude BOOLEAN NOT NULL DEFAULT 0,
                enabled_codex BOOLEAN NOT NULL DEFAULT 0,
                enabled_gemini BOOLEAN NOT NULL DEFAULT 0
            );\n`

    sql += `CREATE TABLE IF NOT EXISTS prompts (
                id TEXT NOT NULL,
                app_type TEXT NOT NULL,
                name TEXT NOT NULL,
                content TEXT NOT NULL,
                description TEXT,
                enabled BOOLEAN NOT NULL DEFAULT 1,
                created_at INTEGER,
                updated_at INTEGER,
                PRIMARY KEY (id, app_type)
            );\n`

    sql += `CREATE TABLE IF NOT EXISTS provider_endpoints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider_id TEXT NOT NULL,
                app_type TEXT NOT NULL,
                url TEXT NOT NULL,
                added_at INTEGER,
                FOREIGN KEY (provider_id, app_type) REFERENCES providers(id, app_type) ON DELETE CASCADE
            );\n`

    sql += `CREATE TABLE IF NOT EXISTS providers (
                id TEXT NOT NULL,
                app_type TEXT NOT NULL,
                name TEXT NOT NULL,
                settings_config TEXT NOT NULL,
                website_url TEXT,
                category TEXT,
                created_at INTEGER,
                sort_index INTEGER,
                notes TEXT,
                icon TEXT,
                icon_color TEXT,
                meta TEXT NOT NULL DEFAULT '{}',
                is_current BOOLEAN NOT NULL DEFAULT 0,
                PRIMARY KEY (id, app_type)
            );\n`

    sql += `CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );\n`

    sql += `CREATE TABLE IF NOT EXISTS skill_repos (
                owner TEXT NOT NULL,
                name TEXT NOT NULL,
                branch TEXT NOT NULL DEFAULT 'main',
                enabled BOOLEAN NOT NULL DEFAULT 1,
                PRIMARY KEY (owner, name)
            );\n`

    sql += `CREATE TABLE IF NOT EXISTS skills (
                key TEXT PRIMARY KEY,
                installed BOOLEAN NOT NULL DEFAULT 0,
                installed_at INTEGER NOT NULL DEFAULT 0
            );\n`

    // Insert provider endpoints
    for (const endpoint of providerEndpoints) {
      sql += `INSERT INTO "provider_endpoints" ("id", "provider_id", "app_type", "url", "added_at") VALUES (${endpoint.id}, '${escapeSqlString(endpoint.provider_id)}', '${escapeSqlString(endpoint.app_type)}', '${escapeSqlString(endpoint.url)}', ${endpoint.added_at});\n`
    }

    // Insert providers
    for (const provider of providers) {
      const websiteUrl =
        provider.website_url !== null
          ? `'${escapeSqlString(provider.website_url)}'`
          : "NULL"
      const category =
        provider.category !== null
          ? `'${escapeSqlString(provider.category)}'`
          : "NULL"
      const createdAt =
        provider.created_at !== null ? provider.created_at : "NULL"
      const sortIndex =
        provider.sort_index !== null ? provider.sort_index : "NULL"
      const notes =
        provider.notes !== null
          ? `'${escapeSqlString(provider.notes)}'`
          : "NULL"
      const icon =
        provider.icon !== null ? `'${escapeSqlString(provider.icon)}'` : "NULL"
      const iconColor =
        provider.icon_color !== null
          ? `'${escapeSqlString(provider.icon_color)}'`
          : "NULL"

      sql += `INSERT INTO "providers" ("id", "app_type", "name", "settings_config", "website_url", "category", "created_at", "sort_index", "notes", "icon", "icon_color", "meta", "is_current") VALUES ('${escapeSqlString(provider.id)}', '${escapeSqlString(provider.app_type)}', '${escapeSqlString(provider.name)}', '${escapeSqlString(provider.settings_config)}', ${websiteUrl}, ${category}, ${createdAt}, ${sortIndex}, ${notes}, ${icon}, ${iconColor}, '${escapeSqlString(provider.meta)}', ${provider.is_current});\n`
    }

    sql += `COMMIT;\n`
    sql += `PRAGMA foreign_keys=ON;\n`

    // Download the SQL file
    const blob = new Blob([sql], { type: "application/sql" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace("T", "_")
      .slice(0, 15)
    link.download = `cc-switch-export-${timestamp}.sql`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success(t("importExport:export.ccSwitchExported"))
  } catch (error) {
    console.error("导出 CC Switch 配置失败:", error)
    toast.error(t("importExport:export.exportFailed"))
  } finally {
    setIsExporting(false)
  }
}
