import { accountDataTransfer } from "~/services/accounts/accountStorage/accountDataTransfer"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/storage/profiles"
import { mergeFeatureGuidanceStates } from "~/services/featureGuidance/featureGuidanceState"
import type {
  BackupFullV2,
  RawBackupData,
} from "~/services/importExport/backupContracts"
import { channelConfigStorage } from "~/services/managedSites/configuration/channelConfigStorage"
import { ensureLegacyChannelConfigMigrationReady } from "~/services/managedSites/configuration/legacyChannelConfigMigration"
import { userPreferences } from "~/services/preferences/userPreferences"
import { buildWebdavSharedPreferences } from "~/services/preferences/webdavSharedPreferences"
import { tagStorage } from "~/services/tags/tagStorage"
import { readWebdavBackupFacts } from "~/services/webdav/backup/webdavBackupFacts"
import {
  projectWebdavEntries,
  readWebdavBackupAccountsSection,
} from "~/services/webdav/backup/webdavEntryProjection"
import { createWebdavImportPayloadBySelection } from "~/services/webdav/backup/webdavImportProjection"
import { type WebDAVSyncDataSelection } from "~/types/webdav"

/**
 * Creates the common root payload shape shared by all WebDAV backup writers.
 */
function createBaseWebdavPayload(backup: BackupFullV2): RawBackupData {
  return {
    version: backup.version,
    timestamp: backup.timestamp,
    channelConfigs: backup.channelConfigs,
  }
}

/**
 * Returns whether the selection requires tag-store data to participate in sync.
 */
function shouldIncludeWebdavTagStore(
  selection: WebDAVSyncDataSelection,
): boolean {
  return (
    selection.accounts || selection.bookmarks || selection.apiCredentialProfiles
  )
}

/**
 * Resolves whether an upload should keep the local section, preserve the remote section, or omit it.
 */
function resolveWebdavUploadSection(input: {
  selected: boolean
  selectedValue: unknown
  hasRemoteValue: boolean
  rawRemoteValue: unknown
  normalizedRemoteValue: unknown
}): unknown {
  if (input.selected) {
    return input.selectedValue
  }

  if (!input.hasRemoteValue) {
    return undefined
  }

  return input.rawRemoteValue !== undefined
    ? input.rawRemoteValue
    : input.normalizedRemoteValue
}

/**
 * Resolves tag-store upload behavior while preserving remote tag data when the local snapshot has none.
 */
function resolveWebdavTagStoreUploadSection(input: {
  selection: WebDAVSyncDataSelection
  localTagStore: BackupFullV2["tagStore"]
  hasRemoteTagStore: boolean
  rawRemoteTagStore: unknown
  normalizedRemoteTagStore: unknown
}): unknown {
  if (shouldIncludeWebdavTagStore(input.selection) && input.localTagStore) {
    return input.localTagStore
  }

  if (!input.hasRemoteTagStore) {
    return undefined
  }

  return input.rawRemoteTagStore !== undefined
    ? input.rawRemoteTagStore
    : input.normalizedRemoteTagStore
}

/**
 * Build the final WebDAV upload payload.
 *
 * WebDAV uploads replace the entire remote file, so when only part of the
 * data is selected we must preserve the remote sections that were not chosen.
 * This function overlays selected local sections onto the existing remote
 * backup while keeping unselected remote sections intact.
 */
export function mergeWebdavBackupPayloadBySelection(input: {
  backup: BackupFullV2
  selection: WebDAVSyncDataSelection
  remoteBackup?: RawBackupData | null
}): RawBackupData {
  const { backup, selection, remoteBackup } = input
  const sharedPreferences = buildWebdavSharedPreferences(backup.preferences)

  if (!remoteBackup) {
    return filterWebdavBackupPayloadBySelection({
      backup,
      selection,
    })
  }

  const {
    presence: remotePresence,
    normalized: normalizedRemote,
    rawSections,
  } = readWebdavBackupFacts(remoteBackup, backup.preferences)
  const {
    preferences: remotePreferences,
    featureGuidance: remoteFeatureGuidance,
    apiCredentialProfiles: remoteApiCredentialProfiles,
    tagStore: remoteTagStore,
  } = rawSections
  const localAccountsSection = readWebdavBackupAccountsSection(backup)
  const shouldMergeAccountsSection = selection.accounts || selection.bookmarks
  const payload: RawBackupData = createBaseWebdavPayload(backup)
  const accountsSection = projectWebdavEntries({
    prioritized: localAccountsSection,
    preserved: {
      accounts: remotePresence.hasAccountsList ? normalizedRemote.accounts : [],
      bookmarks: remotePresence.hasBookmarksList
        ? normalizedRemote.bookmarks
        : [],
      pinnedAccountIds: remotePresence.hasPinnedAccountIds
        ? normalizedRemote.pinnedAccountIds
        : [],
      orderedAccountIds: remotePresence.hasOrderedAccountIds
        ? normalizedRemote.orderedAccountIds
        : [],
    },
    domains: selection,
    metadata: {
      usePrioritizedPinned: shouldMergeAccountsSection,
      usePrioritizedOrder: shouldMergeAccountsSection,
      completeOrder: true,
    },
    tombstones: {
      localRecords: localAccountsSection.deletedEntryRecords,
      remoteRecords: normalizedRemote.deletedEntryRecords || {},
      includeLocalAccounts: selection.accounts,
      includeLocalBookmarks: selection.bookmarks,
      includeRemoteAccounts: remotePresence.hasAccountsList,
      includeRemoteBookmarks: remotePresence.hasBookmarksList,
    },
    include: {
      section:
        shouldMergeAccountsSection ||
        remotePresence.hasAccounts ||
        remotePresence.hasAccountsList ||
        remotePresence.hasBookmarksList,
      accounts: selection.accounts || remotePresence.hasAccountsList,
      bookmarks: selection.bookmarks || remotePresence.hasBookmarksList,
    },
    lastUpdated: shouldMergeAccountsSection
      ? localAccountsSection.lastUpdated
      : normalizedRemote.accountsTimestamp || backup.timestamp,
  })
  if (accountsSection) payload.accounts = accountsSection as any

  const preferences = resolveWebdavUploadSection({
    selected: selection.preferences,
    selectedValue: sharedPreferences,
    hasRemoteValue: remotePresence.hasPreferences,
    rawRemoteValue: remotePreferences,
    normalizedRemoteValue: normalizedRemote.preferences,
  })
  if (preferences !== undefined) {
    payload.preferences = preferences as any
  }

  if (selection.preferences && backup.featureGuidance) {
    payload.featureGuidance = mergeFeatureGuidanceStates(
      backup.featureGuidance,
      normalizedRemote.featureGuidance,
    )
  } else if (remotePresence.hasFeatureGuidance) {
    payload.featureGuidance = remoteFeatureGuidance
  }

  if (selection.apiCredentialProfiles && backup.apiCredentialProfiles) {
    payload.apiCredentialProfiles = backup.apiCredentialProfiles
  } else if (remotePresence.hasApiCredentialProfiles) {
    payload.apiCredentialProfiles =
      remoteApiCredentialProfiles !== undefined
        ? (remoteApiCredentialProfiles as any)
        : normalizedRemote.apiCredentialProfiles
  }

  const tagStore = resolveWebdavTagStoreUploadSection({
    selection,
    localTagStore: backup.tagStore,
    hasRemoteTagStore: remotePresence.hasTagStore,
    rawRemoteTagStore: remoteTagStore,
    normalizedRemoteTagStore: normalizedRemote.tagStore,
  })
  if (tagStore !== undefined) {
    payload.tagStore = tagStore as any
  }

  return payload
}

/**
 * Load local state and build the selective import payload for WebDAV restore.
 */
export async function buildWebdavImportPayloadBySelection(input: {
  rawBackup: RawBackupData
  selection: WebDAVSyncDataSelection
}): Promise<RawBackupData> {
  await ensureLegacyChannelConfigMigrationReady({ bypassBackoff: true })
  const [
    accountsConfig,
    tagStore,
    preferences,
    channelConfigs,
    apiCredentialProfiles,
  ] = await Promise.all([
    accountDataTransfer.exportData(),
    tagStorage.exportTagStore(),
    userPreferences.exportPreferences(),
    channelConfigStorage.exportConfigs(),
    apiCredentialProfilesStorage.exportConfig(),
  ])

  return createWebdavImportPayloadBySelection({
    rawBackup: input.rawBackup,
    selection: input.selection,
    localState: {
      accountsConfig,
      tagStore,
      preferences,
      channelConfigs,
      apiCredentialProfiles,
    },
  })
}

/**
 * Build a filtered WebDAV backup payload based on the selected sections.
 */
export function filterWebdavBackupPayloadBySelection(input: {
  backup: BackupFullV2
  selection: WebDAVSyncDataSelection
}): RawBackupData {
  const { backup, selection } = input

  const localAccountsSection = readWebdavBackupAccountsSection(backup)
  const payload: RawBackupData = createBaseWebdavPayload(backup)
  const accountsSection = projectWebdavEntries({
    prioritized: localAccountsSection,
    preserved: { accounts: [], bookmarks: [] },
    domains: selection,
    metadata: {
      usePrioritizedPinned: true,
      usePrioritizedOrder: true,
      completeOrder: false,
    },
    tombstones: {
      localRecords: localAccountsSection.deletedEntryRecords,
      remoteRecords: {},
      includeLocalAccounts: selection.accounts,
      includeLocalBookmarks: selection.bookmarks,
      includeRemoteAccounts: false,
      includeRemoteBookmarks: false,
    },
    include: {
      section: selection.accounts || selection.bookmarks,
      accounts: selection.accounts,
      bookmarks: selection.bookmarks,
    },
    lastUpdated: localAccountsSection.lastUpdated,
  })
  if (accountsSection) payload.accounts = accountsSection as any

  if (selection.preferences) {
    payload.preferences = buildWebdavSharedPreferences(backup.preferences)
    if (backup.featureGuidance) {
      payload.featureGuidance = backup.featureGuidance
    }
  }

  if (selection.apiCredentialProfiles && backup.apiCredentialProfiles) {
    payload.apiCredentialProfiles = backup.apiCredentialProfiles
  }

  if (shouldIncludeWebdavTagStore(selection) && backup.tagStore) {
    payload.tagStore = backup.tagStore
  }

  return payload
}
