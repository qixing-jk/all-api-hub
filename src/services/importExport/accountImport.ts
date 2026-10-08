import { accountDataTransfer } from "~/services/accounts/accountStorage/accountDataTransfer"
import {
  canonicalizeV6Accounts,
  normalizeV2BackupForMerge,
} from "~/services/importExport/backupCodec"
import {
  type BackupAccountsPartialV2,
  type BackupFullV2,
  type BackupV2,
} from "~/services/importExport/backupContracts"
import { tagStorage } from "~/services/tags/tagStorage"
import { createDefaultTagStore } from "~/services/tags/tagStoreUtils"
import type { AccountStorageConfig, SiteAccount } from "~/types"
import type { ApiCredentialProfilesConfig } from "~/types/apiCredentialProfiles"

/** Imports V2 accounts by replacing the current account/bookmark collection. */
export async function importV2AccountsWithReplace(data: BackupV2) {
  if ("tagStore" in (data as any) && (data as any).tagStore) {
    await tagStorage.importTagStore((data as any).tagStore)
  }

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

  const bookmarks =
    !Array.isArray(accountsConfig) &&
    Array.isArray((accountsConfig as AccountStorageConfig).bookmarks)
      ? (accountsConfig as AccountStorageConfig).bookmarks
      : []

  const orderedAccountIds =
    !Array.isArray(accountsConfig) &&
    Array.isArray((accountsConfig as AccountStorageConfig).orderedAccountIds)
      ? (accountsConfig as AccountStorageConfig).orderedAccountIds
      : []

  await accountDataTransfer.importData({
    accounts: canonicalizeV6Accounts(accounts) as SiteAccount[],
    bookmarks,
    pinnedAccountIds,
    orderedAccountIds,
    deletedEntryRecords: !Array.isArray(accountsConfig)
      ? (accountsConfig as AccountStorageConfig).deletedEntryRecords
      : undefined,
  })
  await tagStorage.ensureLegacyMigration()
}

/** Merges local and backup order lists while dropping ids absent from imported entries. */
function mergeEntryIdList(input: {
  localIds: string[]
  remoteIds: string[]
  validIds: Set<string>
}) {
  const merged: string[] = []
  const seen = new Set<string>()

  for (const id of [...input.localIds, ...input.remoteIds]) {
    if (!input.validIds.has(id) || seen.has(id)) continue
    seen.add(id)
    merged.push(id)
  }

  return merged
}

/** Merges records by id, keeping the newer backup record only when its timestamp wins. */
function mergeByLatestUpdatedAt<T extends { id: string; updated_at?: number }>(
  localItems: T[],
  remoteItems: T[],
) {
  const merged = new Map<string, T>()

  for (const item of localItems) {
    merged.set(item.id, item)
  }

  for (const remoteItem of remoteItems) {
    const localItem = merged.get(remoteItem.id)
    if (!localItem) {
      merged.set(remoteItem.id, remoteItem)
      continue
    }

    if ((remoteItem.updated_at || 0) > (localItem.updated_at || 0)) {
      merged.set(remoteItem.id, remoteItem)
    }
  }

  return Array.from(merged.values())
}

/** Merges V2 accounts/bookmarks into the current account storage. */
export async function importV2AccountsWithMerge(
  data: BackupV2,
  remoteApiCredentialProfiles: ApiCredentialProfilesConfig["profiles"] = [],
) {
  const [localAccountsConfig, localTagStore] = await Promise.all([
    accountDataTransfer.exportData(),
    tagStorage.exportTagStore(),
  ])
  const normalizedRemote = normalizeV2BackupForMerge(data as BackupFullV2, null)

  const tagMerge = tagStorage.mergeTagStoresForSync({
    localTagStore,
    remoteTagStore: normalizedRemote.tagStore ?? createDefaultTagStore(),
    localAccounts: localAccountsConfig.accounts,
    remoteAccounts: normalizedRemote.accounts,
    localBookmarks: localAccountsConfig.bookmarks,
    remoteBookmarks: normalizedRemote.bookmarks,
    localTaggables: [],
    remoteTaggables: remoteApiCredentialProfiles,
  })

  const accounts = mergeByLatestUpdatedAt(
    tagMerge.localAccounts,
    tagMerge.remoteAccounts,
  )
  const bookmarks = mergeByLatestUpdatedAt(
    tagMerge.localBookmarks,
    tagMerge.remoteBookmarks,
  )
  const entryIdSet = new Set([
    ...accounts.map((account) => account.id),
    ...bookmarks.map((bookmark) => bookmark.id),
  ])

  await tagStorage.importTagStore(tagMerge.tagStore)
  await accountDataTransfer.importData({
    accounts,
    bookmarks,
    pinnedAccountIds: mergeEntryIdList({
      localIds: localAccountsConfig.pinnedAccountIds || [],
      remoteIds: normalizedRemote.pinnedAccountIds,
      validIds: entryIdSet,
    }),
    orderedAccountIds: mergeEntryIdList({
      localIds: localAccountsConfig.orderedAccountIds || [],
      remoteIds: normalizedRemote.orderedAccountIds,
      validIds: entryIdSet,
    }),
    deletedEntryRecords: {
      ...(localAccountsConfig.deletedEntryRecords || {}),
      ...(normalizedRemote.deletedEntryRecords || {}),
    },
  })
  await tagStorage.ensureLegacyMigration()
  return {
    remoteApiCredentialProfiles: tagMerge.remoteTaggables,
  }
}
