import { accountDataTransfer } from "~/services/accounts/accountStorage/accountDataTransfer"
import {
  canonicalizeV6Accounts,
  readChannelConfigSnapshot,
} from "~/services/importExport/backupCodec"
import {
  IMPORT_EXPORT_ERROR_CODES,
  IMPORT_SECTION_KEYS,
  IMPORT_SECTION_STRATEGIES,
  ImportExportError,
  type ImportFromBackupOptions,
  type ImportPlan,
  type ImportResult,
  type RawBackupData,
} from "~/services/importExport/backupContracts"
import { importBackupFeatureGuidance } from "~/services/importExport/preferencesImport"
import { channelConfigStorage } from "~/services/managedSites/configuration/channelConfigStorage"
import { userPreferences } from "~/services/preferences/userPreferences"
import { tagStorage } from "~/services/tags/tagStorage"
import type { SiteAccount } from "~/types"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to import/export helpers for backups and preferences.
 */
const logger = createLogger("ImportExportService")

/**
 * Returns whether a legacy import should write a section for the current plan.
 */
function shouldImportSection(
  plan: ImportPlan | undefined,
  section: keyof ImportPlan,
) {
  return !plan || plan[section] !== IMPORT_SECTION_STRATEGIES.Skip
}

/**
 * Handles legacy (V1) backup payloads by importing accounts/preferences/channel configs when present.
 */
export async function importV1Backup(
  data: RawBackupData,
  options?: ImportFromBackupOptions,
): Promise<ImportResult> {
  let accountsImported = false
  let preferencesImported = false
  let channelConfigsImported = false

  const accountsRequested = Boolean(data.accounts || data.type === "accounts")
  const preferencesRequested = Boolean(
    data.preferences || data.type === "preferences",
  )
  const channelConfigSnapshot = readChannelConfigSnapshot(data)
  const channelConfigsRequested = channelConfigSnapshot !== null
  const plan = options?.plan

  // accounts: support both legacy partial exports and older full exports
  if (
    accountsRequested &&
    shouldImportSection(plan, IMPORT_SECTION_KEYS.Accounts)
  ) {
    const rawTagStore = (data as any).tagStore ?? (data.data as any)?.tagStore
    if (rawTagStore) {
      await tagStorage.importTagStore(rawTagStore)
    }

    const accountsData =
      (data.accounts as any)?.accounts ??
      (data.data as any)?.accounts ??
      data.accounts

    if (accountsData) {
      await accountDataTransfer.importData({
        accounts: canonicalizeV6Accounts(accountsData) as SiteAccount[],
      })
      // Ensure legacy imports (string tags) are migrated to tag ids.
      await tagStorage.ensureLegacyMigration()
      accountsImported = true
    }
  }

  // preferences
  if (
    preferencesRequested &&
    shouldImportSection(plan, IMPORT_SECTION_KEYS.Preferences)
  ) {
    const preferencesData = data.preferences || data.data?.preferences
    if (preferencesData) {
      const writeResult = options?.preserveWebdav
        ? await userPreferences.importPreferences(preferencesData, {
            preserveWebdav: true,
          })
        : await userPreferences.importPreferences(preferencesData)
      if (writeResult.ok) {
        await importBackupFeatureGuidance(data)
        preferencesImported = true
      } else {
        logger.error("Failed to import user preferences from legacy backup")
        throw new ImportExportError(IMPORT_EXPORT_ERROR_CODES.ImportFailed)
      }
    }
  }

  // channel configs: best-effort support if present in V1 backups
  if (
    channelConfigsRequested &&
    shouldImportSection(plan, IMPORT_SECTION_KEYS.ChannelConfigs)
  ) {
    await channelConfigStorage.importConfigs(channelConfigSnapshot)
    channelConfigsImported = true
  }

  const anyImported =
    accountsImported || preferencesImported || channelConfigsImported

  if (!anyImported) {
    throw new ImportExportError(IMPORT_EXPORT_ERROR_CODES.NoImportableData)
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
      apiCredentialProfiles: false,
    },
  }
}
