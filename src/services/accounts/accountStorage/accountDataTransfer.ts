import {
  normalizeAccountStorageConfigForWrite,
  normalizeSiteAccount,
} from "~/services/accounts/accountDefaults"
import {
  buildEntryIdSets,
  filterKnownUniqueEntryIds,
} from "~/services/accounts/accountEntryLayoutPolicy"
import { migrateAccountsConfig } from "~/services/accounts/migrations/accountDataMigration"
import type { AccountStorageConfig, SiteAccount, SiteBookmark } from "~/types"
import { createLogger } from "~/utils/core/logger"

import { accountConfigStore } from "./accountConfigStore"
import {
  mergeDeletedEntryRecordMaps,
  sanitizeBookmarks,
} from "./configPolicies"

const logger = createLogger("AccountDataTransfer")

class AccountDataTransfer {
  async clearAllData(): Promise<boolean> {
    try {
      await accountConfigStore.runExclusive((transaction) =>
        transaction.remove(),
      )
      return true
    } catch (error) {
      logger.error("清空数据失败", error)
      return false
    }
  }

  async exportData(): Promise<AccountStorageConfig> {
    await accountConfigStore.ensureTagsMigrated()
    return accountConfigStore.readOrDefault()
  }

  async importData(data: {
    accounts?: SiteAccount[]
    bookmarks?: SiteBookmark[]
    pinnedAccountIds?: string[]
    orderedAccountIds?: string[]
    deletedEntryRecords?: AccountStorageConfig["deletedEntryRecords"]
  }): Promise<{ migratedCount: number }> {
    return accountConfigStore.runExclusive(async (transaction) => {
      const backupConfig = accountConfigStore.clone(await transaction.read())
      try {
        const { accounts, migratedCount } = migrateAccountsConfig(
          data.accounts || [],
        )
        const normalizedAccounts = accounts.map(normalizeSiteAccount)
        const bookmarks = data.bookmarks
          ? sanitizeBookmarks(data.bookmarks)
          : backupConfig.bookmarks

        if (migratedCount > 0) {
          logger.info("Upgraded imported account(s) during import migration", {
            migratedCount,
          })
        }

        const { entryIds } = buildEntryIdSets({
          accounts: normalizedAccounts,
          bookmarks,
        })
        const fallbackPinnedIds = backupConfig.pinnedAccountIds.filter((id) =>
          entryIds.has(id),
        )
        const fallbackOrderedIds = backupConfig.orderedAccountIds.filter((id) =>
          entryIds.has(id),
        )
        const pinnedAccountIds = data.pinnedAccountIds
          ? filterKnownUniqueEntryIds(data.pinnedAccountIds, entryIds)
          : fallbackPinnedIds
        const orderedAccountIds = data.orderedAccountIds
          ? filterKnownUniqueEntryIds(data.orderedAccountIds, entryIds)
          : fallbackOrderedIds
        const deletedEntryRecords = mergeDeletedEntryRecordMaps({
          existing: backupConfig.deletedEntryRecords,
          incoming: data.deletedEntryRecords,
        })
        for (const id of entryIds) delete deletedEntryRecords[id]

        await transaction.write({
          ...backupConfig,
          accounts: normalizedAccounts,
          bookmarks,
          pinnedAccountIds,
          orderedAccountIds,
          deletedEntryRecords,
        })

        if (data.pinnedAccountIds) {
          logger.info("Imported pinned entry id(s)", {
            pinnedCount: pinnedAccountIds.length,
          })
        }
        return { migratedCount }
      } catch (error) {
        logger.error("Import migration failed; restoring from backup", error)
        await transaction.write(
          normalizeAccountStorageConfigForWrite(backupConfig),
        )
        logger.warn("Safety fallback applied: restored accounts from backup")
        throw error
      }
    })
  }
}

export const accountDataTransfer = new AccountDataTransfer()
