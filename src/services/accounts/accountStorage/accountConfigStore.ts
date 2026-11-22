import { Storage } from "@plasmohq/storage"

import {
  canonicalizeAccountStorageConfig,
  createDefaultAccountStorageConfig,
  normalizeAccountStorageConfigForWrite,
} from "~/services/accounts/editing/accountDefaults"
import type { AccountWriteGuard } from "~/services/core/accountWriteGuard"
import {
  ACCOUNT_STORAGE_KEYS,
  STORAGE_LOCKS,
  TAG_STORAGE_KEYS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { ensureAccountTagsStorageMigrated } from "~/services/tags/migrations/accountTagsStorageMigration"
import { sanitizeTagStore } from "~/services/tags/tagStoreUtils"
import type { AccountStorageConfig, SiteAccount, TagStore } from "~/types"
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
  readTags(): Promise<TagStore>
  write(config: AccountStorageConfig, tags?: TagStore): Promise<void>
  remove(): Promise<void>
  reserveFinancialGeneration(config?: AccountStorageConfig): Promise<number>
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

  /**
   * Mutates one account under the account storage lock.
   *
   * An optional guard runs inside that lock against the config being written, so
   * a rule that must hold across accounts cannot race a concurrent write. The
   * guard's throw aborts the write untouched.
   */
  async mutateAccount<T>(
    id: string,
    mutation: AccountMutation<T>,
    options: { guard?: AccountWriteGuard } = {},
  ): Promise<T> {
    return this.mutate((config) => {
      const index = config.accounts.findIndex((account) => account.id === id)
      const account = index === -1 ? undefined : config.accounts[index]
      if (!account) {
        throw new Error(t("messages:storage.accountNotFound", { id }))
      }

      const { nextAccount, result, changed } = mutation(account)
      options.guard?.(config, nextAccount)
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
          readTags: async () =>
            sanitizeTagStore(
              await this.storage.get(TAG_STORAGE_KEYS.TAG_STORE),
            ),
          write: (config, tags) => this.writeSnapshot(config, tags),
          reserveFinancialGeneration: async (lockedConfig) => {
            const current = await this.storage.get<number>(
              ACCOUNT_STORAGE_KEYS.BALANCE_GENERATION,
            )
            if (
              current !== undefined &&
              (!Number.isSafeInteger(current) || current < 0)
            )
              throw new Error("invalid_balance_refresh_generation")
            // Upgrades may already have account-local generations but no shared
            // counter. Imports never restore the counter or move it backwards.
            const config = lockedConfig ?? (await this.read())
            const highest = config.accounts.reduce(
              (value, account) =>
                Math.max(value, account.balanceRefreshGeneration ?? 0),
              current ?? 0,
            )
            const next = highest + 1
            if (!Number.isSafeInteger(next))
              throw new Error("balance_refresh_generation_overflow")
            await this.storage.set(
              ACCOUNT_STORAGE_KEYS.BALANCE_GENERATION,
              next,
            )
            return next
          },
          remove: async () => {
            const raw = await this.storage.get<AccountStorageConfig>(
              ACCOUNT_STORAGE_KEYS.ACCOUNTS,
            )
            const counter = await this.storage.get<unknown>(
              ACCOUNT_STORAGE_KEYS.BALANCE_GENERATION,
            )
            const parsedCounter =
              typeof counter === "number" || typeof counter === "string"
                ? Number(counter)
                : 0
            const generations = Array.isArray(raw?.accounts)
              ? raw.accounts
                  .map((account) => account?.balanceRefreshGeneration)
                  .filter(
                    (value): value is number =>
                      typeof value === "number" &&
                      Number.isSafeInteger(value) &&
                      value >= 0,
                  )
              : []
            const highest = generations.reduce(
              (highest, value) => Math.max(highest, value),
              Number.isSafeInteger(parsedCounter) && parsedCounter >= 0
                ? parsedCounter
                : 0,
            )
            const next = highest + 1
            if (!Number.isSafeInteger(next))
              throw new Error("balance_refresh_generation_overflow")
            await this.storage.set(
              ACCOUNT_STORAGE_KEYS.BALANCE_GENERATION,
              next,
            )
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
      AccountStorageConfig | undefined
    return canonicalizeAccountStorageConfig(config)
  }

  private async writeSnapshot(
    config: AccountStorageConfig,
    tags?: TagStore,
  ): Promise<void> {
    if (tags !== undefined) {
      await this.storage.setMany({
        [ACCOUNT_STORAGE_KEYS.ACCOUNTS]:
          normalizeAccountStorageConfigForWrite(config),
        [TAG_STORAGE_KEYS.TAG_STORE]: sanitizeTagStore(tags),
      })
      return
    }
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
