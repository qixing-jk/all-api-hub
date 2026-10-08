import { coerceApiCredentialProfilesConfig } from "~/services/apiCredentialProfiles/storage/configCodec"
import {
  importV2AccountsWithMerge,
  importV2AccountsWithReplace,
} from "~/services/importExport/accountImport"
import {
  normalizeV2BackupForMerge,
  readChannelConfigSnapshot,
} from "~/services/importExport/backupCodec"
import {
  IMPORT_EXPORT_ERROR_CODES,
  IMPORT_SECTION_STRATEGIES,
  ImportExportError,
  type BackupFullV2,
  type BackupV2,
  type ImportFromBackupOptions,
  type ImportPlan,
  type ImportResult,
  type ImportSectionStrategy,
  type ImportWriteStrategy,
} from "~/services/importExport/backupContracts"
import { importV2ApiCredentialProfiles } from "~/services/importExport/credentialProfileImport"
import { importV2Preferences } from "~/services/importExport/preferencesImport"
import { channelConfigStorage } from "~/services/managedSites/configuration/channelConfigStorage"
import type { ApiCredentialProfilesConfig } from "~/types/apiCredentialProfiles"

/**
 * Narrows a selected import strategy to the strategies that write data.
 */
function hasWriteStrategy(
  strategy: ImportSectionStrategy | undefined,
): strategy is ImportWriteStrategy {
  return Boolean(strategy && strategy !== IMPORT_SECTION_STRATEGIES.Skip)
}

/**
 * Converts any non-skip section strategy into the storage write strategy.
 */
function toWriteStrategy(strategy: ImportSectionStrategy): ImportWriteStrategy {
  return strategy === IMPORT_SECTION_STRATEGIES.Replace
    ? IMPORT_SECTION_STRATEGIES.Replace
    : IMPORT_SECTION_STRATEGIES.Merge
}

/**
 * Import a canonical flat V2-V4 backup (full or partial) into local storage.
 */
export async function importV2Backup(
  data: BackupV2,
  options?: ImportFromBackupOptions,
): Promise<ImportResult> {
  if (options?.plan) {
    return importV2BackupWithPlan(data, options.plan, options)
  }

  if (options?.mode === IMPORT_SECTION_STRATEGIES.Merge) {
    return importV2BackupWithPlan(
      data,
      {
        accounts: IMPORT_SECTION_STRATEGIES.Merge,
        preferences: IMPORT_SECTION_STRATEGIES.Skip,
        channelConfigs: IMPORT_SECTION_STRATEGIES.Merge,
        apiCredentialProfiles: IMPORT_SECTION_STRATEGIES.Merge,
      },
      options,
    )
  }

  let accountsImported = false
  let preferencesImported = false
  let channelConfigsImported = false
  let apiCredentialProfilesImported = false

  const accountsRequested = "accounts" in data
  const preferencesRequested = "preferences" in data
  const channelConfigSnapshot = readChannelConfigSnapshot(data)
  const channelConfigsRequested = channelConfigSnapshot !== null
  const apiCredentialProfilesRequested =
    "apiCredentialProfiles" in data &&
    Boolean((data as BackupFullV2).apiCredentialProfiles)

  // V2-V4 use a flat structure with sections directly on the root.

  if (accountsRequested) {
    await importV2AccountsWithReplace(data)
    accountsImported = true
  }

  if (preferencesRequested) {
    preferencesImported = await importV2Preferences(data, options)
  }

  if (channelConfigsRequested) {
    await channelConfigStorage.importConfigs(channelConfigSnapshot)
    channelConfigsImported = true
  }

  if (apiCredentialProfilesRequested) {
    await importV2ApiCredentialProfiles(data, IMPORT_SECTION_STRATEGIES.Merge, {
      reconcileTags: !accountsRequested,
    })
    apiCredentialProfilesImported = true
  }

  const anyImported =
    accountsImported ||
    preferencesImported ||
    channelConfigsImported ||
    apiCredentialProfilesImported

  if (!anyImported) {
    throw new ImportExportError(IMPORT_EXPORT_ERROR_CODES.NoImportableData)
  }

  const allImported =
    (!accountsRequested || accountsImported) &&
    (!preferencesRequested || preferencesImported) &&
    (!channelConfigsRequested || channelConfigsImported) &&
    (!apiCredentialProfilesRequested || apiCredentialProfilesImported)

  return {
    allImported,
    sections: {
      accounts: accountsImported,
      preferences: preferencesImported,
      channelConfigs: channelConfigsImported,
      apiCredentialProfiles: apiCredentialProfilesImported,
    },
  }
}

/** Imports V2 channel configuration by replacing current channel configuration. */
async function importV2ChannelConfigsWithReplace(data: BackupV2) {
  const snapshot = readChannelConfigSnapshot(data)
  if (!snapshot) return
  await channelConfigStorage.importConfigs(snapshot)
}

/** Merges V2 channel configuration into current channel configuration. */
async function importV2ChannelConfigsWithMerge(data: BackupV2) {
  const normalizedRemote = normalizeV2BackupForMerge(data as BackupFullV2, null)
  if (!normalizedRemote.channelConfigs) return
  await channelConfigStorage.mergeConfigs(normalizedRemote.channelConfigs)
}

/** Imports V2 backups according to a per-section user import plan. */
async function importV2BackupWithPlan(
  data: BackupV2,
  plan: ImportPlan,
  options?: ImportFromBackupOptions,
): Promise<ImportResult> {
  let accountsImported = false
  let preferencesImported = false
  let channelConfigsImported = false
  let apiCredentialProfilesImported = false

  const accountsRequested = "accounts" in data
  const preferencesRequested = "preferences" in data
  const channelConfigsRequested = readChannelConfigSnapshot(data) !== null
  const apiCredentialProfilesRequested =
    "apiCredentialProfiles" in data &&
    Boolean((data as BackupFullV2).apiCredentialProfiles)
  const accountStrategy = plan.accounts
  const preferenceStrategy = plan.preferences
  const channelConfigStrategy = plan.channelConfigs
  const apiCredentialProfilesStrategy = plan.apiCredentialProfiles
  const apiCredentialProfilesConfig = apiCredentialProfilesRequested
    ? coerceApiCredentialProfilesConfig(
        (data as BackupFullV2).apiCredentialProfiles,
      )
    : null
  let remappedApiCredentialProfiles:
    | ApiCredentialProfilesConfig["profiles"]
    | undefined

  if (accountsRequested && hasWriteStrategy(accountStrategy)) {
    if (accountStrategy === IMPORT_SECTION_STRATEGIES.Replace) {
      await importV2AccountsWithReplace(data)
    } else {
      const mergeResult = await importV2AccountsWithMerge(
        data,
        apiCredentialProfilesConfig?.profiles ?? [],
      )
      remappedApiCredentialProfiles = mergeResult.remoteApiCredentialProfiles
    }
    accountsImported = true
  }

  if (preferencesRequested && hasWriteStrategy(preferenceStrategy)) {
    if (!(await importV2Preferences(data, options))) {
      throw new ImportExportError(IMPORT_EXPORT_ERROR_CODES.ImportFailed)
    }
    preferencesImported = true
  }

  if (channelConfigsRequested && hasWriteStrategy(channelConfigStrategy)) {
    if (channelConfigStrategy === IMPORT_SECTION_STRATEGIES.Replace) {
      await importV2ChannelConfigsWithReplace(data)
    } else {
      await importV2ChannelConfigsWithMerge(data)
    }
    channelConfigsImported = true
  }

  if (
    apiCredentialProfilesRequested &&
    hasWriteStrategy(apiCredentialProfilesStrategy)
  ) {
    await importV2ApiCredentialProfiles(
      data,
      toWriteStrategy(apiCredentialProfilesStrategy),
      {
        reconcileTags:
          !accountsImported ||
          accountStrategy !== IMPORT_SECTION_STRATEGIES.Replace,
        remoteApiCredentialProfiles: remappedApiCredentialProfiles,
      },
    )
    apiCredentialProfilesImported = true
  }

  const anyImported =
    accountsImported ||
    preferencesImported ||
    channelConfigsImported ||
    apiCredentialProfilesImported

  if (!anyImported) {
    throw new ImportExportError(IMPORT_EXPORT_ERROR_CODES.NoImportableData)
  }

  const allImported =
    (!accountsRequested || accountsImported) &&
    (!preferencesRequested || preferencesImported) &&
    (!channelConfigsRequested || channelConfigsImported) &&
    (!apiCredentialProfilesRequested || apiCredentialProfilesImported)

  return {
    allImported,
    sections: {
      accounts: accountsImported,
      preferences: preferencesImported,
      channelConfigs: channelConfigsImported,
      apiCredentialProfiles: apiCredentialProfilesImported,
    },
  }
}
