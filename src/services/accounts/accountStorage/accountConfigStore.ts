import { Storage } from "@plasmohq/storage"

import {
  canonicalizeAccountStorageConfig,
  createDefaultAccountStorageConfig,
  normalizeAccountStorageConfigForWrite,
} from "~/services/accounts/accountDefaults"
import {
  ACCOUNT_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { ensureAccountTagsStorageMigrated } from "~/services/tags/migrations/accountTagsStorageMigration"
import type { AccountStorageConfig, SiteAccount } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("AccountConfigStore")

type AccountConfigMutation<T> = (config: AccountStorageConfig) => {
  result: T
  changed: boolean
}

type AccountMutation<T> = (account: SiteAccount) => {
  nextAccount: SiteAccount
  result: T
  changed: boolean
}

interface LockedAccountConfigTransaction {
  read(): Promise<AccountStorageConfig>
  write(config: AccountStorageConfig): Promise<void>
  remove(): Promise<void>
}

const cloneConfig = (config: AccountStorageConfig): AccountStorageConfig => {
  if (typeof structuredClone === "function") {
    return structuredClone(config)
  }
  return JSON.parse(JSON.stringify(config)) as AccountStorageConfig
}

/**
 * Owns the single persisted account envelope and its cross-context transaction.
 * Product workflows should depend on the use-case modules beside this file,
 * rather than importing this storage seam directly.
 */
class AccountConfigStore {
  private readonly storage = new Storage({ area: "local" })

  async read(): Promise<AccountStorageConfig> {
    return (await this.readSnapshot()).config
  }

  async readOrDefault(): Promise<AccountStorageConfig> {
    try {
      return await this.read()
    } catch (error) {
      logger.error("获取存储配置失败", error)
      return createDefaultAccountStorageConfig()
    }
  }

  async readMigratedEnvelope(): Promise<AccountStorageConfig> {
    await ensureAccountTagsStorageMigrated(this.storage)

    const { config, migratedCount } = await this.readSnapshot()
    if (migratedCount > 0) {
      logger.info("Accounts migrated; persisting updated accounts", {
        migratedCount,
      })
      await this.persistReadMigration()
    }

    return config
  }

  async readAccounts(): Promise<SiteAccount[]> {
    return (await this.readMigratedEnvelope()).accounts
  }

  async ensureTagsMigrated(): Promise<void> {
    await ensureAccountTagsStorageMigrated(this.storage)
  }

  async mutate<T>(mutation: AccountConfigMutation<T>): Promise<T> {
    return this.runExclusive(async (transaction) => {
      const current = cloneConfig(await transaction.read())
      const { result, changed } = mutation(current)
      if (changed) {
        await transaction.write(current)
      }
      return result
    })
  }

  async mutateAccount<T>(id: string, mutation: AccountMutation<T>): Promise<T> {
    return this.mutate((config) => {
      const index = config.accounts.findIndex((account) => account.id === id)
      if (index === -1) {
        throw new Error(t("messages:storage.accountNotFound", { id }))
      }

      const { nextAccount, result, changed } = mutation(config.accounts[index])
      config.accounts[index] = nextAccount
      return { result, changed }
    })
  }

  async runExclusive<T>(
    work: (transaction: LockedAccountConfigTransaction) => Promise<T>,
  ): Promise<T> {
    return withExtensionStorageWriteLock(
      STORAGE_LOCKS.ACCOUNT_STORAGE,
      async () =>
        work({
          read: () => this.read(),
          write: (config) => this.writeSnapshot(config),
          remove: async () => {
            await this.storage.remove(ACCOUNT_STORAGE_KEYS.ACCOUNTS)
          },
        }),
    )
  }

  clone(config: AccountStorageConfig): AccountStorageConfig {
    return cloneConfig(config)
  }

  private async readSnapshot(): Promise<{
    config: AccountStorageConfig
    migratedCount: number
  }> {
    const config = (await this.storage.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)) as
      | AccountStorageConfig
      | undefined
    return canonicalizeAccountStorageConfig(config)
  }

  private async writeSnapshot(config: AccountStorageConfig): Promise<void> {
    await this.storage.set(
      ACCOUNT_STORAGE_KEYS.ACCOUNTS,
      normalizeAccountStorageConfigForWrite(config),
    )
  }

  /** Re-reads inside the lock so a stale migration snapshot cannot win a race. */
  private async persistReadMigration(): Promise<void> {
    await withExtensionStorageWriteLock(
      STORAGE_LOCKS.ACCOUNT_STORAGE,
      async () => {
        const { config, migratedCount } = await this.readSnapshot()
        if (migratedCount === 0) return

        await this.writeSnapshot(config)
      },
    )
  }
}

export const accountConfigStore = new AccountConfigStore()
