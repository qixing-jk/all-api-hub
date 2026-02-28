import { Storage } from "@plasmohq/storage"

import {
  createDefaultTagStore,
  sanitizeTagStore,
} from "~/services/accountTags/tagStoreUtils"
import {
  migrateAccountTagsData,
  needsAccountTagsDataMigration,
} from "~/services/configMigration/accountTags/accountTagsDataMigration"
import {
  ACCOUNT_STORAGE_KEYS,
  STORAGE_LOCKS,
  TAG_STORAGE_KEYS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/storageWriteLock"
import type { AccountStorageConfig, TagStore } from "~/types"

export type LegacyTagsMigrationResult = {
  migratedAccountCount: number
  createdTagCount: number
}

/**
 * Ensures legacy `account.tags: string[]` are migrated into `account.tagIds: string[]`
 * and that the global tag store exists.
 *
 * When no legacy data exists, this is intentionally cheap and avoids acquiring
 * the storage write lock.
 *
 * IMPORTANT:
 * Do not call this while already holding the `STORAGE_LOCKS.ACCOUNT_STORAGE`
 * lock (non-reentrant); doing so can deadlock.
 */
export async function ensureAccountTagsStorageMigrated(
  storage: Storage,
): Promise<LegacyTagsMigrationResult> {
  const rawAccountsConfig = (await storage.get(
    ACCOUNT_STORAGE_KEYS.ACCOUNTS,
  )) as AccountStorageConfig | undefined
  const accountsConfig: AccountStorageConfig = {
    accounts: rawAccountsConfig?.accounts ?? [],
    bookmarks: Array.isArray(rawAccountsConfig?.bookmarks)
      ? rawAccountsConfig.bookmarks
      : [],
    pinnedAccountIds: rawAccountsConfig?.pinnedAccountIds ?? [],
    orderedAccountIds: rawAccountsConfig?.orderedAccountIds ?? [],
    last_updated: rawAccountsConfig?.last_updated ?? Date.now(),
  }

  if (!needsAccountTagsDataMigration(accountsConfig.accounts)) {
    return { migratedAccountCount: 0, createdTagCount: 0 }
  }

  return withExtensionStorageWriteLock(
    STORAGE_LOCKS.ACCOUNT_STORAGE,
    async () => {
      const lockedRawAccountsConfig = (await storage.get(
        ACCOUNT_STORAGE_KEYS.ACCOUNTS,
      )) as AccountStorageConfig | undefined
      const lockedAccountsConfig: AccountStorageConfig = {
        accounts: lockedRawAccountsConfig?.accounts ?? [],
        bookmarks: Array.isArray(lockedRawAccountsConfig?.bookmarks)
          ? lockedRawAccountsConfig.bookmarks
          : [],
        pinnedAccountIds: lockedRawAccountsConfig?.pinnedAccountIds ?? [],
        orderedAccountIds: lockedRawAccountsConfig?.orderedAccountIds ?? [],
        last_updated: lockedRawAccountsConfig?.last_updated ?? Date.now(),
      }

      if (!needsAccountTagsDataMigration(lockedAccountsConfig.accounts)) {
        return { migratedAccountCount: 0, createdTagCount: 0 }
      }

      const rawTagStore = (await storage.get(TAG_STORAGE_KEYS.TAG_STORE)) as
        | TagStore
        | undefined
      const tagStore = sanitizeTagStore(rawTagStore ?? createDefaultTagStore())

      const migration = migrateAccountTagsData({
        accounts: lockedAccountsConfig.accounts,
        tagStore,
      })

      const nextAccountsConfig: AccountStorageConfig = {
        ...lockedAccountsConfig,
        accounts: migration.accounts,
        last_updated: Date.now(),
      }

      await Promise.all([
        storage.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, nextAccountsConfig),
        storage.set(
          TAG_STORAGE_KEYS.TAG_STORE,
          sanitizeTagStore(migration.tagStore),
        ),
      ])

      return {
        migratedAccountCount: migration.migratedAccountCount,
        createdTagCount: migration.createdTagCount,
      }
    },
  )
}
