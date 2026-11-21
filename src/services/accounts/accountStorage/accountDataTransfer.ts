import {
  buildEntryIdSets,
  filterKnownUniqueEntryIds,
} from "~/services/accounts/accountEntryLayoutPolicy"
import {
  normalizeAccountStorageConfigForRead,
  normalizeSiteAccount,
} from "~/services/accounts/editing/accountDefaults"
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
    return accountConfigStore.read()
  }

  async importData(data: {
    schemaVersion?: 1
    accounts?: SiteAccount[]
    bookmarks?: SiteBookmark[]
    pinnedAccountIds?: string[]
    orderedAccountIds?: string[]
    deletedEntryRecords?: AccountStorageConfig["deletedEntryRecords"]
  }): Promise<{ migratedCount: number }> {
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("unsupported_or_invalid_account_storage")
    const incoming = normalizeAccountStorageConfigForRead({
      ...data,
      accounts: data.accounts === undefined ? [] : data.accounts,
    } as AccountStorageConfig)
    return accountConfigStore.runExclusive(async (transaction) => {
      const backupConfig = accountConfigStore.clone(await transaction.read())
      try {
        const { accounts, migratedCount } = migrateAccountsConfig(
          incoming.accounts,
        )
        const generation = await transaction.reserveFinancialGeneration()
        const normalizedAccounts = accounts.map((account) => ({
          ...normalizeSiteAccount(account),
          balanceRefreshGeneration: generation,
        }))
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
        // Validation happens before the single storage write. Rewriting a
        // normalized backup here would modify data after a rejected import.
        logger.error(
          "Import migration failed; existing accounts retained",
          error,
        )
        throw error
      }
    })
  }
}

export const accountDataTransfer = new AccountDataTransfer()
