import {
  AccountUpdateUserTimestampMode,
  applySiteAccountUpdates,
  createPersistedSiteAccount,
} from "~/services/accounts/accountDefaults"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import type { SiteAccount } from "~/types"
import type { DeepPartial } from "~/types/utils"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import { accountConfigStore } from "./accountConfigStore"
import { createAccountDeletedEntryRecord } from "./configPolicies"

const logger = createLogger("AccountMutations")

export type UpdateAccountOptions = {
  userTimestampMode: AccountUpdateUserTimestampMode
}

class AccountMutations {
  async addAccount(
    accountData: Omit<
      SiteAccount,
      "id" | "created_at" | "updated_at" | "user_updated_at"
    >,
  ): Promise<string> {
    try {
      logger.info("开始添加新账号", { siteName: accountData.site_name })
      return await accountConfigStore.mutate((config) => {
        const now = Date.now()
        const account = createPersistedSiteAccount({
          account: accountData,
          id: safeRandomUUID("account"),
          now,
        })
        config.accounts.push(account)
        return { result: account.id, changed: true }
      })
    } catch (error) {
      logger.error("添加账号失败", error)
      throw error
    }
  }

  async updateAccount(
    id: string,
    updates: DeepPartial<SiteAccount>,
    options: UpdateAccountOptions,
  ): Promise<boolean> {
    try {
      return await accountConfigStore.mutateAccount(id, (account) => ({
        nextAccount: applySiteAccountUpdates({
          account,
          updates,
          now: Date.now(),
          userTimestampMode: options.userTimestampMode,
        }),
        result: true,
        changed: true,
      }))
    } catch (error) {
      logger.error(t("messages:storage.updateFailed", { error: "" }), error)
      return false
    }
  }

  async setAccountDisabled(id: string, disabled: boolean): Promise<boolean> {
    const normalized = Boolean(disabled)
    try {
      const { updated, didDisable } = await accountConfigStore.mutateAccount(
        id,
        (account) => ({
          nextAccount: applySiteAccountUpdates({
            account,
            updates: { disabled: normalized },
            now: Date.now(),
            userTimestampMode: AccountUpdateUserTimestampMode.Touch,
          }),
          result: {
            updated: true,
            didDisable: normalized && account.disabled !== normalized,
          },
          changed: true,
        }),
      )

      if (didDisable) {
        const marked = await autoCheckinStorage.markAccountDisabledInStatus(id)
        if (!marked) {
          logger.warn("禁用账号后更新自动签到状态失败", { accountId: id })
        }
      }
      return updated
    } catch (error) {
      logger.error(t("messages:storage.updateFailed", { error: "" }), error)
      return false
    }
  }

  async setAccountsDisabled(
    ids: string[],
    disabled: boolean,
  ): Promise<{ updatedCount: number; updatedIds: string[] }> {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
    if (uniqueIds.length === 0) return { updatedCount: 0, updatedIds: [] }

    const idSet = new Set(uniqueIds)
    const normalized = Boolean(disabled)
    try {
      const changedAccountIds: string[] = []
      const result = await accountConfigStore.mutate((config) => {
        const now = Date.now()
        let updatedCount = 0
        config.accounts = config.accounts.map((account) => {
          if (!idSet.has(account.id) || account.disabled === normalized) {
            return account
          }
          updatedCount += 1
          changedAccountIds.push(account.id)
          return applySiteAccountUpdates({
            account,
            updates: { disabled: normalized },
            now,
            userTimestampMode: AccountUpdateUserTimestampMode.Touch,
          })
        })
        return {
          result: { updatedCount, updatedIds: changedAccountIds },
          changed: updatedCount > 0,
        }
      })

      if (normalized && changedAccountIds.length > 0) {
        const marked = await autoCheckinStorage.markAccountsDisabledInStatus(
          changedAccountIds.map((accountId) => ({ accountId })),
        )
        if (!marked) {
          logger.warn("批量禁用账号后更新自动签到状态失败", {
            accountIds: changedAccountIds,
          })
        }
      }
      return result
    } catch (error) {
      logger.error("批量更新账号禁用状态失败", {
        accountIds: uniqueIds,
        disabled: normalized,
        error,
      })
      return { updatedCount: 0, updatedIds: [] }
    }
  }

  async deleteAccount(id: string): Promise<boolean> {
    try {
      const deleted = await accountConfigStore.mutate((config) => {
        const account = config.accounts.find((item) => item.id === id)
        if (!account) {
          logger.warn("Attempted to delete missing account", {
            accountId: id,
            existingAccounts: config.accounts.map((item) => ({
              id: item.id,
              name: item.site_name,
            })),
          })
          throw new Error(t("messages:storage.accountNotFound", { id }))
        }

        config.accounts = config.accounts.filter((item) => item.id !== id)
        config.pinnedAccountIds = config.pinnedAccountIds.filter(
          (entryId) => entryId !== id,
        )
        config.orderedAccountIds = config.orderedAccountIds.filter(
          (entryId) => entryId !== id,
        )
        config.deletedEntryRecords = {
          ...(config.deletedEntryRecords || {}),
          [id]: createAccountDeletedEntryRecord(account, Date.now()),
        }
        return { result: true, changed: true }
      })
      void autoCheckinStorage.pruneStatusForAccountIds([id]).catch((error) => {
        logger.error("清理自动签到账号状态失败", { accountId: id, error })
      })
      return deleted
    } catch (error) {
      logger.error("删除账号失败", { accountId: id, error })
      throw error
    }
  }

  async deleteAccounts(
    ids: string[],
  ): Promise<{ deletedCount: number; deletedIds: string[] }> {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
    if (uniqueIds.length === 0) return { deletedCount: 0, deletedIds: [] }
    const idSet = new Set(uniqueIds)

    try {
      const result = await accountConfigStore.mutate((config) => {
        const deletedAccounts = config.accounts.filter((account) =>
          idSet.has(account.id),
        )
        const deletedIds = deletedAccounts.map((account) => account.id)
        if (deletedIds.length === 0) {
          return {
            result: { deletedCount: 0, deletedIds: [] },
            changed: false,
          }
        }

        config.accounts = config.accounts.filter(
          (account) => !idSet.has(account.id),
        )
        config.pinnedAccountIds = config.pinnedAccountIds.filter(
          (entryId) => !idSet.has(entryId),
        )
        config.orderedAccountIds = config.orderedAccountIds.filter(
          (entryId) => !idSet.has(entryId),
        )
        const now = Date.now()
        config.deletedEntryRecords = {
          ...(config.deletedEntryRecords || {}),
          ...Object.fromEntries(
            deletedAccounts.map((account) => [
              account.id,
              createAccountDeletedEntryRecord(account, now),
            ]),
          ),
        }
        return {
          result: { deletedCount: deletedIds.length, deletedIds },
          changed: true,
        }
      })

      if (result.deletedCount > 0) {
        void autoCheckinStorage
          .pruneStatusForAccountIds(result.deletedIds)
          .catch((error) => {
            logger.error("批量清理自动签到账号状态失败", {
              accountIds: result.deletedIds,
              error,
            })
          })
      }
      return result
    } catch (error) {
      logger.error("批量删除账号失败", { accountIds: uniqueIds, error })
      throw error
    }
  }

  async updateSyncTime(id: string): Promise<boolean> {
    return this.updateAccount(
      id,
      { last_sync_time: Date.now() },
      { userTimestampMode: AccountUpdateUserTimestampMode.Preserve },
    )
  }
}

export const accountMutations = new AccountMutations()
