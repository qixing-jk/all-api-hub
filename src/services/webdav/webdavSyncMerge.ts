import { mergeApiCredentialProfilesConfigs } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { migrateAccountTagsData } from "~/services/tags/migrations/accountTagsDataMigration"
import { tagStorage } from "~/services/tags/tagStorage"
import {
  createDefaultTagStore,
  sanitizeTagStore,
} from "~/services/tags/tagStoreUtils"
import {
  DELETED_ENTRY_KIND,
  type AccountStorageConfig,
  type DeletedEntryKind,
  type SiteAccount,
  type SiteBookmark,
  type TagStore,
} from "~/types"
import { type ApiCredentialProfilesConfig } from "~/types/apiCredentialProfiles"
import {
  resolveWebdavSyncDataSelection,
  type WebDAVSyncDataSelection,
} from "~/types/webdav"
import { createLogger } from "~/utils/core/logger"

import { type UserPreferences } from "../preferences/userPreferences"

const logger = createLogger("WebdavAutoSync")

interface WebdavSyncMergeSnapshot {
  accounts: SiteAccount[]
  bookmarks: SiteBookmark[]
  deletedEntryRecords?: AccountStorageConfig["deletedEntryRecords"]
  accountsTimestamp: number
  tagStore: TagStore
  preferences: UserPreferences
  preferencesTimestamp: number
  apiCredentialProfiles: ApiCredentialProfilesConfig
}

/**
 * Merge local and remote data based on timestamps (latest wins).
 * Channel configs are intentionally merged later at their locked storage seam.
 * @returns Merged accounts, preferences, profiles, tags, and deletion metadata.
 */
export function mergeWebdavSyncData(
  local: WebdavSyncMergeSnapshot,
  remote: WebdavSyncMergeSnapshot,
  selection: WebDAVSyncDataSelection = resolveWebdavSyncDataSelection(null),
): {
  accounts: SiteAccount[]
  bookmarks: SiteBookmark[]
  tagStore: TagStore
  preferences: UserPreferences
  apiCredentialProfiles: ApiCredentialProfilesConfig
  deletedEntryRecords: NonNullable<AccountStorageConfig["deletedEntryRecords"]>
} {
  logger.debug("开始合并数据", {
    localAccountCount: local.accounts.length,
    remoteAccountCount: remote.accounts.length,
    localBookmarkCount: local.bookmarks.length,
    remoteBookmarkCount: remote.bookmarks.length,
  })

  // Migrate legacy string tags (if any) into tag ids on both sides.
  const localTagStore = sanitizeTagStore(
    local.tagStore ?? createDefaultTagStore(),
  )
  const remoteTagStore = sanitizeTagStore(
    remote.tagStore ?? createDefaultTagStore(),
  )
  const migratedLocal = migrateAccountTagsData({
    accounts: local.accounts,
    tagStore: localTagStore,
  })
  const migratedRemote = migrateAccountTagsData({
    accounts: remote.accounts,
    tagStore: remoteTagStore,
  })

  // Merge tag stores and remap accounts so tag ids always resolve.
  const tagMerge = tagStorage.mergeTagStoresForSync({
    localTagStore: migratedLocal.tagStore,
    remoteTagStore: migratedRemote.tagStore,
    localAccounts: migratedLocal.accounts,
    remoteAccounts: migratedRemote.accounts,
    localBookmarks: local.bookmarks,
    remoteBookmarks: remote.bookmarks,
    localTaggables: local.apiCredentialProfiles.profiles,
    remoteTaggables: remote.apiCredentialProfiles.profiles,
  })

  // 合并账号数据
  const accountMap = new Map<string, SiteAccount>()
  const deletedEntryRecords = mergeDeletedEntryRecords({
    localRecords: local.deletedEntryRecords,
    remoteRecords: remote.deletedEntryRecords,
    includeRemoteAccounts: selection.accounts,
    includeRemoteBookmarks: selection.bookmarks,
  })

  // 首先添加本地账号
  tagMerge.localAccounts.forEach((account) => {
    if (
      isEntrySuppressedByDeletionRecord({
        id: account.id,
        kind: DELETED_ENTRY_KIND.ACCOUNT,
        entryUpdatedAt: account.updated_at,
        entryUserUpdatedAt: account.user_updated_at,
        deletedEntryRecords,
      })
    ) {
      return
    }

    accountMap.set(account.id, account)
  })

  // 然后处理远程账号（按 updated_at 选择较新版本）
  if (selection.accounts) {
    tagMerge.remoteAccounts.forEach((remoteAccount) => {
      const localAccount = accountMap.get(remoteAccount.id)

      if (!localAccount) {
        if (
          isEntrySuppressedByDeletionRecord({
            id: remoteAccount.id,
            kind: DELETED_ENTRY_KIND.ACCOUNT,
            entryUpdatedAt: remoteAccount.updated_at,
            entryUserUpdatedAt: remoteAccount.user_updated_at,
            deletedEntryRecords,
          })
        ) {
          logger.debug("忽略已删除账号的旧远程副本", {
            accountId: remoteAccount.id,
            siteName: remoteAccount.site_name,
          })
          return
        }

        // 远程账号在本地不存在，直接添加
        accountMap.set(remoteAccount.id, remoteAccount)
        logger.debug("添加远程账号", {
          accountId: remoteAccount.id,
          siteName: remoteAccount.site_name,
        })
      } else {
        // 账号在两边都存在，比较时间戳
        const localUpdatedAt = localAccount.updated_at || 0
        const remoteUpdatedAt = remoteAccount.updated_at || 0

        if (remoteUpdatedAt > localUpdatedAt) {
          // 远程更新，使用远程数据
          accountMap.set(remoteAccount.id, remoteAccount)
          logger.debug("使用远程账号（远程更新）", {
            accountId: remoteAccount.id,
            siteName: remoteAccount.site_name,
          })
        } else {
          logger.debug("保留本地账号（本地更新）", {
            accountId: localAccount.id,
            siteName: localAccount.site_name,
          })
        }
      }
    })
  }

  const mergedAccounts = Array.from(accountMap.values())

  const bookmarkMap = new Map<string, SiteBookmark>()
  tagMerge.localBookmarks.forEach((bookmark) => {
    if (
      isEntrySuppressedByDeletionRecord({
        id: bookmark.id,
        kind: DELETED_ENTRY_KIND.BOOKMARK,
        entryUpdatedAt: bookmark.updated_at,
        deletedEntryRecords,
      })
    ) {
      return
    }

    bookmarkMap.set(bookmark.id, bookmark)
  })

  if (selection.bookmarks) {
    tagMerge.remoteBookmarks.forEach((remoteBookmark) => {
      const localBookmark = bookmarkMap.get(remoteBookmark.id)
      if (!localBookmark) {
        if (
          isEntrySuppressedByDeletionRecord({
            id: remoteBookmark.id,
            kind: DELETED_ENTRY_KIND.BOOKMARK,
            entryUpdatedAt: remoteBookmark.updated_at,
            deletedEntryRecords,
          })
        ) {
          return
        }

        bookmarkMap.set(remoteBookmark.id, remoteBookmark)
        return
      }

      const localUpdatedAt = localBookmark.updated_at || 0
      const remoteUpdatedAt = remoteBookmark.updated_at || 0
      if (remoteUpdatedAt > localUpdatedAt) {
        bookmarkMap.set(remoteBookmark.id, remoteBookmark)
      }
    })
  }

  const mergedBookmarks = Array.from(bookmarkMap.values())

  const deletedEntryRecordsToKeep = pruneResolvedDeletedEntryRecords({
    records: deletedEntryRecords,
    accounts: mergedAccounts,
    bookmarks: mergedBookmarks,
  })

  const apiCredentialProfiles = selection.apiCredentialProfiles
    ? mergeApiCredentialProfilesConfigs({
        local: {
          ...local.apiCredentialProfiles,
          profiles: tagMerge.localTaggables,
        },
        incoming: {
          ...remote.apiCredentialProfiles,
          profiles: tagMerge.remoteTaggables,
        },
      })
    : {
        ...local.apiCredentialProfiles,
        profiles: tagMerge.localTaggables,
      }

  // Compare shared-preference timestamps so device-local WebDAV/refresh edits do
  // not change merge arbitration.
  const preferences = selection.preferences
    ? remote.preferencesTimestamp > local.preferencesTimestamp
      ? remote.preferences
      : local.preferences
    : local.preferences

  logger.info("合并完成", {
    accountCount: mergedAccounts.length,
    preferencesSource:
      selection.preferences &&
      remote.preferencesTimestamp > local.preferencesTimestamp
        ? "remote"
        : "local",
  })

  return {
    accounts: mergedAccounts,
    bookmarks: mergedBookmarks,
    tagStore:
      selection.accounts ||
      selection.bookmarks ||
      selection.apiCredentialProfiles
        ? tagMerge.tagStore
        : localTagStore,
    preferences,
    apiCredentialProfiles,
    deletedEntryRecords: deletedEntryRecordsToKeep,
  }
}

/** Combine selected remote tombstones with the latest local deletion records. */
function mergeDeletedEntryRecords(input: {
  localRecords?: AccountStorageConfig["deletedEntryRecords"]
  remoteRecords?: AccountStorageConfig["deletedEntryRecords"]
  includeRemoteAccounts?: boolean
  includeRemoteBookmarks?: boolean
}): NonNullable<AccountStorageConfig["deletedEntryRecords"]> {
  const records: NonNullable<AccountStorageConfig["deletedEntryRecords"]> = {}

  for (const [id, record] of Object.entries(input.remoteRecords || {})) {
    const includeRemoteRecord =
      (record.kind === DELETED_ENTRY_KIND.ACCOUNT &&
        input.includeRemoteAccounts !== false) ||
      (record.kind === DELETED_ENTRY_KIND.BOOKMARK &&
        input.includeRemoteBookmarks !== false)

    if (!includeRemoteRecord) {
      continue
    }

    records[id] = record
  }

  for (const [id, record] of Object.entries(input.localRecords || {})) {
    const current = records[id]
    if (!current || record.deletedAt > current.deletedAt) {
      records[id] = record
    }
  }

  return records
}

/** Keep entries deleted until an explicit user update exceeds the deletion boundary. */
function isEntrySuppressedByDeletionRecord(input: {
  id: string
  kind: DeletedEntryKind
  entryUpdatedAt?: number
  entryUserUpdatedAt?: number
  deletedEntryRecords: AccountStorageConfig["deletedEntryRecords"]
}) {
  const record = input.deletedEntryRecords?.[input.id]
  if (!record || record.kind !== input.kind) {
    return false
  }

  const entryUpdatedAt =
    typeof input.entryUpdatedAt === "number" ? input.entryUpdatedAt : 0
  const entryUserUpdatedAt =
    typeof input.entryUserUpdatedAt === "number"
      ? input.entryUserUpdatedAt
      : entryUpdatedAt
  const deletionBoundary = Math.max(record.deletedAt, record.entryUpdatedAt)
  return entryUserUpdatedAt <= deletionBoundary
}

/** Remove tombstones for entries retained by the completed merge. */
function pruneResolvedDeletedEntryRecords(input: {
  records: NonNullable<AccountStorageConfig["deletedEntryRecords"]>
  accounts: SiteAccount[]
  bookmarks: SiteBookmark[]
}) {
  const records = { ...input.records }
  for (const account of input.accounts) {
    delete records[account.id]
  }
  for (const bookmark of input.bookmarks) {
    delete records[bookmark.id]
  }
  return records
}
