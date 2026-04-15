import toast from "react-hot-toast"

import { accountStorage } from "~/services/accounts/accountStorage"
import {
  canManageDisplayAccountTokens,
  fetchDisplayAccountTokens,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import {
  BACKUP_VERSION,
  ImportExportError,
  importFromBackupObject as importFromBackupObjectService,
  normalizeBackupForMerge,
  parseBackupSummary,
  type BackupAccountKeySnapshot,
  type BackupAccountKeySnapshotError,
  type BackupAccountsPartialV2,
  type BackupFullV2,
  type BackupPreferencesPartialV2,
  type BackupV2,
  type ImportFromBackupOptions,
  type ImportResult,
  type RawBackupData,
} from "~/services/importExport/importExportService"
import { channelConfigStorage } from "~/services/managedSites/channelConfigStorage"
import { userPreferences } from "~/services/preferences/userPreferences"
import { tagStorage } from "~/services/tags/tagStorage"
import type { AccountStorageConfig } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

/**
 * Unified logger scoped to import/export UI wrappers for backups and preferences.
 */
const logger = createLogger("ImportExportUtils")

export { BACKUP_VERSION, normalizeBackupForMerge, parseBackupSummary }
export type {
  BackupFullV2,
  BackupPreferencesPartialV2,
  BackupV2,
  RawBackupData,
}

interface ExportOptions {
  includeAccountKeys?: boolean
}

interface PreparedExportResult<TData> {
  data: TData
  accountKeySnapshots: BackupAccountKeySnapshot[]
  accountKeySnapshotErrors: BackupAccountKeySnapshotError[]
}

const BACKUP_EXPORT_ERROR_MESSAGE_FALLBACK = "unknown export error"
const BACKUP_EXPORT_ERROR_MESSAGE_MAX_LENGTH = 200

const summarizeBackupExportErrorMessage = (error: unknown) => {
  const rawMessage = getErrorMessage(
    error,
    BACKUP_EXPORT_ERROR_MESSAGE_FALLBACK,
  )
  const normalizedMessage = rawMessage.replace(/\s+/g, " ").trim()

  if (!normalizedMessage) {
    return BACKUP_EXPORT_ERROR_MESSAGE_FALLBACK
  }

  if (/<!doctype html|<html[\s>]/i.test(normalizedMessage)) {
    if (/just a moment|cloudflare/i.test(normalizedMessage)) {
      return "Cloudflare challenge page returned"
    }

    return "HTML error response returned"
  }

  if (normalizedMessage.length > BACKUP_EXPORT_ERROR_MESSAGE_MAX_LENGTH) {
    return `${normalizedMessage.slice(
      0,
      BACKUP_EXPORT_ERROR_MESSAGE_MAX_LENGTH,
    )}...`
  }

  return normalizedMessage
}

const downloadJsonFile = (data: unknown, filename: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const withOptionalAccountKeySections = <TData extends object>(
  data: TData,
  accountKeyExportResult?: {
    snapshots: BackupAccountKeySnapshot[]
    errors: BackupAccountKeySnapshotError[]
  },
) => {
  return {
    ...data,
    ...(accountKeyExportResult?.snapshots.length
      ? { accountKeySnapshots: accountKeyExportResult.snapshots }
      : {}),
    ...(accountKeyExportResult?.errors.length
      ? { accountKeySnapshotErrors: accountKeyExportResult.errors }
      : {}),
  }
}

const buildAccountKeySnapshots = async (
  accountData: AccountStorageConfig,
): Promise<{
  snapshots: BackupAccountKeySnapshot[]
  errors: BackupAccountKeySnapshotError[]
}> => {
  const displayAccounts = accountStorage.convertToDisplayData(
    accountData.accounts,
  )
  const manageableAccounts = displayAccounts.filter(
    canManageDisplayAccountTokens,
  )

  const results = await Promise.all(
    manageableAccounts.map(async (account) => {
      try {
        const tokens = await fetchDisplayAccountTokens(account)
        const resolvedTokens = await Promise.all(
          tokens.map((token) =>
            resolveDisplayAccountTokenForSecret(account, token),
          ),
        )

        return {
          ok: true as const,
          snapshot: {
            accountId: account.id,
            accountName: account.name,
            baseUrl: account.baseUrl,
            siteType: account.siteType,
            tokens: resolvedTokens,
          },
        }
      } catch (error) {
        logger.warn("Failed to export account keys for backup", {
          accountId: account.id,
          accountName: account.name,
          error,
        })

        return {
          ok: false as const,
          exportError: {
            accountId: account.id,
            accountName: account.name,
            baseUrl: account.baseUrl,
            siteType: account.siteType,
            errorMessage: summarizeBackupExportErrorMessage(error),
          },
        }
      }
    }),
  )

  return results.reduce<{
    snapshots: BackupAccountKeySnapshot[]
    errors: BackupAccountKeySnapshotError[]
  }>(
    (acc, result) => {
      if (result.ok) {
        acc.snapshots.push(result.snapshot)
      } else {
        acc.errors.push(result.exportError)
      }
      return acc
    },
    { snapshots: [], errors: [] },
  )
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

const prepareFullExport = async (
  options?: ExportOptions,
): Promise<PreparedExportResult<BackupFullV2>> => {
  const accountDataPromise = accountStorage.exportData()

  const [
    accountData,
    tagStore,
    preferencesData,
    channelConfigs,
    apiCredentialProfiles,
    accountKeyExportResult,
  ] = await Promise.all([
    accountDataPromise,
    tagStorage.exportTagStore(),
    userPreferences.exportPreferences(),
    channelConfigStorage.exportConfigs(),
    apiCredentialProfilesStorage.exportConfig(),
    options?.includeAccountKeys
      ? accountDataPromise.then(buildAccountKeySnapshots)
      : undefined,
  ])

  const data = withOptionalAccountKeySections(
    {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accounts: accountData,
      tagStore,
      preferences: preferencesData,
      channelConfigs,
      apiCredentialProfiles,
    } satisfies BackupFullV2,
    accountKeyExportResult,
  )

  return {
    data,
    accountKeySnapshots: accountKeyExportResult?.snapshots ?? [],
    accountKeySnapshotErrors: accountKeyExportResult?.errors ?? [],
  }
}

const prepareAccountsExport = async (
  options?: ExportOptions,
): Promise<PreparedExportResult<BackupAccountsPartialV2>> => {
  const accountData = await accountStorage.exportData()
  const [tagStore, accountKeyExportResult] = await Promise.all([
    tagStorage.exportTagStore(),
    options?.includeAccountKeys
      ? buildAccountKeySnapshots(accountData)
      : undefined,
  ])

  const data = withOptionalAccountKeySections(
    {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      type: "accounts",
      accounts: accountData,
      tagStore,
    } satisfies BackupAccountsPartialV2,
    accountKeyExportResult,
  )

  return {
    data,
    accountKeySnapshots: accountKeyExportResult?.snapshots ?? [],
    accountKeySnapshotErrors: accountKeyExportResult?.errors ?? [],
  }
}

const preparePreferencesExport = async (): Promise<
  PreparedExportResult<BackupPreferencesPartialV2>
> => {
  const preferencesData = await userPreferences.exportPreferences()

  return {
    data: {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      type: "preferences",
      preferences: preferencesData,
    },
    accountKeySnapshots: [],
    accountKeySnapshotErrors: [],
  }
}

const downloadPreparedExport = <TData extends object>(
  prepared: PreparedExportResult<TData>,
  filename: string,
) => {
  downloadJsonFile(prepared.data, filename)
}

// 导出所有数据
/**
 * Export all persisted data (accounts, preferences, channelConfigs) as a
 * full V2 backup file and trigger a browser download.
 */
export const handleExportAll = async (
  setIsExporting: (isExporting: boolean) => void,
  options?: ExportOptions,
) => {
  try {
    setIsExporting(true)

    const prepared = await prepareFullExport(options)

    downloadPreparedExport(
      prepared,
      `all-api-hub-backup-${new Date().toISOString().split("T")[0]}.json`,
    )

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
  options?: ExportOptions,
) => {
  try {
    setIsExporting(true)

    const prepared = await prepareAccountsExport(options)

    downloadPreparedExport(
      prepared,
      `accounts-backup-${new Date().toISOString().split("T")[0]}.json`,
    )

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

    const prepared = await preparePreferencesExport()

    downloadPreparedExport(
      prepared,
      `preferences-backup-${new Date().toISOString().split("T")[0]}.json`,
    )

    toast.success(t("importExport:export.settingsExported"))
  } catch (error) {
    logger.error("导出用户设置失败", error)
    toast.error(t("importExport:export.exportFailed"))
  } finally {
    setIsExporting(false)
  }
}
