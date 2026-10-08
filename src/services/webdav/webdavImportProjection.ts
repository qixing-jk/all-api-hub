import { BACKUP_VERSION } from "~/constants/importExport"
import { coerceApiCredentialProfilesConfig } from "~/services/apiCredentialProfiles/profileConfigCodec"
import type { RawBackupData } from "~/services/importExport/backupContracts"
import { type UserPreferences } from "~/services/preferences/preferencesSchema"
import { restoreWebdavLocalOnlyPreferences } from "~/services/preferences/webdavSharedPreferences"
import { migrateAccountTagsData } from "~/services/tags/migrations/accountTagsDataMigration"
import {
  createDefaultTagStore,
  mergeTagStoresAndRemapAccounts,
  sanitizeTagStore,
} from "~/services/tags/tagStoreUtils"
import { readWebdavBackupFacts } from "~/services/webdav/webdavBackupFacts"
import { projectWebdavEntries } from "~/services/webdav/webdavEntryProjection"
import {
  type AccountStorageConfig,
  type SiteAccount,
  type SiteBookmark,
  type TagStore,
} from "~/types"
import type { ApiCredentialProfilesConfig } from "~/types/apiCredentialProfiles"
import type { ChannelConfigSnapshot } from "~/types/channelConfig"
import { type WebDAVSyncDataSelection } from "~/types/webdav"

type WebdavImportLocalState = {
  accountsConfig: AccountStorageConfig
  tagStore: TagStore
  preferences: UserPreferences
  channelConfigs: ChannelConfigSnapshot
  apiCredentialProfiles: ApiCredentialProfilesConfig
}

/**
 * Build the import payload for a selective WebDAV restore.
 *
 * The returned payload is safe to hand to `importFromBackupObject()`:
 * - Selected remote accounts/bookmarks keep their tag references valid.
 * - Existing local tag-backed entities (notably API credential profiles) keep
 *   their tags because the remote tag store is merged with the local store.
 * - Incoming remote API credential profiles are remapped to the merged tag ids.
 */
export function createWebdavImportPayloadBySelection(input: {
  rawBackup: RawBackupData
  selection: WebDAVSyncDataSelection
  localState: WebdavImportLocalState
}): RawBackupData {
  const { rawBackup, selection, localState } = input

  const { presence, normalized: normalizedRemote } = readWebdavBackupFacts(
    rawBackup,
    localState.preferences,
  )

  const remoteTimestamp =
    typeof rawBackup?.timestamp === "number"
      ? rawBackup.timestamp
      : Number(rawBackup?.timestamp)
  const timestamp = Number.isFinite(remoteTimestamp)
    ? remoteTimestamp
    : Date.now()

  const importAccountsFromRemote =
    selection.accounts && presence.hasAccountsList
  const importBookmarksFromRemote =
    selection.bookmarks && presence.hasBookmarksList
  const shouldImportAccounts =
    importAccountsFromRemote || importBookmarksFromRemote

  const importPreferencesFromRemote =
    selection.preferences && presence.hasPreferences

  const remoteApiCredentialProfiles = coerceApiCredentialProfilesConfig(
    normalizedRemote.apiCredentialProfiles,
  )
  const localApiCredentialProfiles = coerceApiCredentialProfilesConfig(
    localState.apiCredentialProfiles,
  )

  const importApiCredentialProfilesFromRemote =
    selection.apiCredentialProfiles &&
    presence.hasApiCredentialProfiles &&
    remoteApiCredentialProfiles.profiles.length > 0

  const localTagStore = sanitizeTagStore(
    localState.tagStore ?? createDefaultTagStore(),
  )
  const remoteTagStore = sanitizeTagStore(
    normalizedRemote.tagStore ?? createDefaultTagStore(),
  )

  const migratedLocal = migrateAccountTagsData({
    accounts: localState.accountsConfig.accounts,
    tagStore: localTagStore,
  })
  const migratedRemote = migrateAccountTagsData({
    accounts: normalizedRemote.accounts as SiteAccount[],
    tagStore: remoteTagStore,
  })

  const mergedTagData =
    shouldImportAccounts || importApiCredentialProfilesFromRemote
      ? mergeTagStoresAndRemapAccounts({
          localTagStore: migratedLocal.tagStore,
          remoteTagStore: migratedRemote.tagStore,
          localAccounts: migratedLocal.accounts,
          remoteAccounts: migratedRemote.accounts,
          localBookmarks: (localState.accountsConfig.bookmarks || []) as
            | SiteBookmark[]
            | undefined,
          remoteBookmarks: normalizedRemote.bookmarks as SiteBookmark[],
          localTaggables: localApiCredentialProfiles.profiles,
          remoteTaggables: importApiCredentialProfilesFromRemote
            ? remoteApiCredentialProfiles.profiles
            : [],
        })
      : null

  const localAccounts = mergedTagData
    ? mergedTagData.localAccounts
    : migratedLocal.accounts
  const remoteAccounts = mergedTagData
    ? mergedTagData.remoteAccounts
    : migratedRemote.accounts
  const localBookmarks = mergedTagData
    ? mergedTagData.localBookmarks
    : ((localState.accountsConfig.bookmarks || []) as SiteBookmark[])
  const remoteBookmarks = mergedTagData
    ? mergedTagData.remoteBookmarks
    : (normalizedRemote.bookmarks as SiteBookmark[])

  const payload: RawBackupData = {
    version: BACKUP_VERSION,
    timestamp,
    channelConfigs:
      normalizedRemote.channelConfigs || localState.channelConfigs,
  }

  if (shouldImportAccounts) {
    payload.accounts = projectWebdavEntries({
      prioritized: {
        accounts: remoteAccounts,
        bookmarks: remoteBookmarks,
        pinnedAccountIds: normalizedRemote.pinnedAccountIds,
        orderedAccountIds: normalizedRemote.orderedAccountIds,
      },
      preserved: {
        accounts: localAccounts,
        bookmarks: localBookmarks,
        pinnedAccountIds: localState.accountsConfig.pinnedAccountIds,
        orderedAccountIds: localState.accountsConfig.orderedAccountIds,
      },
      domains: {
        accounts: importAccountsFromRemote,
        bookmarks: importBookmarksFromRemote,
      },
      metadata: {
        usePrioritizedPinned: presence.hasPinnedAccountIds,
        usePrioritizedOrder: presence.hasOrderedAccountIds,
        completeOrder: true,
      },
      tombstones: {
        localRecords: localState.accountsConfig.deletedEntryRecords,
        remoteRecords: normalizedRemote.deletedEntryRecords,
        includeLocalAccounts: importAccountsFromRemote,
        includeLocalBookmarks: importBookmarksFromRemote,
        includeRemoteAccounts: importAccountsFromRemote,
        includeRemoteBookmarks: importBookmarksFromRemote,
      },
      include: { section: true, accounts: true, bookmarks: true },
      lastUpdated: Date.now(),
    }) as any
  }

  if (shouldImportAccounts || importApiCredentialProfilesFromRemote) {
    payload.tagStore = mergedTagData?.tagStore ?? localTagStore
  }

  if (importPreferencesFromRemote) {
    payload.preferences = restoreWebdavLocalOnlyPreferences(
      (normalizedRemote.preferences ||
        localState.preferences) as UserPreferences,
      localState.preferences,
    )
    if (normalizedRemote.featureGuidance) {
      payload.featureGuidance = normalizedRemote.featureGuidance
    }
  }

  if (importApiCredentialProfilesFromRemote) {
    payload.apiCredentialProfiles = {
      ...remoteApiCredentialProfiles,
      profiles:
        mergedTagData?.remoteTaggables ?? remoteApiCredentialProfiles.profiles,
    }
  }

  return payload
}
