import { type Storage } from "@plasmohq/storage"

import {
  canonicalizeAccountStorageConfig,
  normalizeAccountStorageConfigForWrite,
} from "~/services/accounts/accountDefaults"
import {
  ACCOUNT_STORAGE_KEYS,
  STORAGE_LOCKS,
  TAG_STORAGE_KEYS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import {
  migrateAccountTagsData,
  needsAccountTagsDataMigration,
} from "~/services/tags/migrations/accountTagsDataMigration"
import {
  createDefaultTagStore,
  sanitizeTagStore,
} from "~/services/tags/tagStoreUtils"
import type { AccountStorageConfig, TagStore } from "~/types"

type LegacyTagsMigrationResult = {
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
  const { config: accountsConfig } =
    canonicalizeAccountStorageConfig(rawAccountsConfig)

  if (!needsAccountTagsDataMigration(accountsConfig.accounts)) {
    return { migratedAccountCount: 0, createdTagCount: 0 }
  }

  return withExtensionStorageWriteLock(
    STORAGE_LOCKS.ACCOUNT_STORAGE,
    async () => {
      const lockedRawAccountsConfig = (await storage.get(
        ACCOUNT_STORAGE_KEYS.ACCOUNTS,
      )) as AccountStorageConfig | undefined
      const { config: lockedAccountsConfig } = canonicalizeAccountStorageConfig(
        lockedRawAccountsConfig,
      )

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

      const nextAccountsConfig = normalizeAccountStorageConfigForWrite({
        ...lockedAccountsConfig,
        accounts: migration.accounts,
      })

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
