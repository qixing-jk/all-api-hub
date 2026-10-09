import { isAccountSiteType } from "~/constants/siteType"
import { removeEntryIdsFromLayout } from "~/services/accounts/accountEntryLayoutPolicy"
import {
  AccountUpdateUserTimestampMode,
  applySiteAccountUpdates,
  createPersistedSiteAccount,
  type AccountUpdateOptions,
} from "~/services/accounts/editing/accountDefaults"
import {
  hasSameAccountRequestIdentity,
  hasSameCheckInRequestCredentials,
} from "~/services/accounts/identity/accountIdentity"
import { getAutoCheckinCandidateMethodIds } from "~/services/checkin/autoCheckin/providers/registry"
import {
  invalidateCheckInDiscovery,
  mergeDiscoveredCheckInDraft,
  mergeRefreshedCheckInStatus,
  mergeUserOwnedCheckInDraft,
} from "~/services/checkin/autoCheckin/state"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import {
  AccountWriteRejectedError,
  type AccountWriteGuard,
} from "~/services/core/accountWriteGuard"
import { verificationResultHistoryStorage } from "~/services/verification/verificationResultHistory"
import type { AccountStorageConfig, SiteAccount } from "~/types"
import type { CheckInMethodSelection } from "~/types/checkIn"
import type { DeepPartial } from "~/types/utils"
import { formatLocalDayKey } from "~/utils/core/dayKey"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import { accountConfigStore } from "./accountConfigStore"
import { createAccountDeletedEntryRecord } from "./configPolicies"

const logger = createLogger("AccountMutations")

/**
 * Drops persisted verification results owned by accounts that no longer exist.
 *
 * Runs after the account write has committed, never inside the account lock: the
 * verification store takes its own write lock and the lock is not reentrant. A
 * failure is logged rather than propagated, so a cleanup problem cannot fail the
 * deletion the caller asked for.
 */
async function pruneDeletedAccountVerificationResults(
  accountIds: string[],
): Promise<void> {
  if (accountIds.length === 0) return

  try {
    await verificationResultHistoryStorage.reconcileOwners({
      removeAccountIds: accountIds,
    })
  } catch (error) {
    logger.error("清理账号验证结果失败", { accountIds, error })
  }
}

type UpdateAccountOptions = AccountUpdateOptions

const removeAccountsFromConfig = (
  config: AccountStorageConfig,
  deletedAccounts: SiteAccount[],
  layoutIdsToRemove: Set<string>,
  now: number,
): void => {
  const deletedIds = new Set(deletedAccounts.map((account) => account.id))
  config.accounts = config.accounts.filter(
    (account) => !deletedIds.has(account.id),
  )
  removeEntryIdsFromLayout(config, layoutIdsToRemove)
  config.deletedEntryRecords = {
    ...(config.deletedEntryRecords || {}),
    ...Object.fromEntries(
      deletedAccounts.map((account) => [
        account.id,
        createAccountDeletedEntryRecord(account, now),
      ]),
    ),
  }
}

class AccountMutations {
  async updateAccountWithCheckInDraft(
    id: string,
    updates: Omit<DeepPartial<SiteAccount>, "checkIn">,
    draft: SiteAccount["checkIn"],
    options: AccountUpdateOptions & {
      selectionChanged?: boolean
      discoveryBaseSelection?: CheckInMethodSelection
      refreshed?: SiteAccount["checkIn"]
      /** Runs inside the account storage lock; throwing aborts the update. */
      guard?: AccountWriteGuard
      /** Credential pair loaded by the editor, before any background rotation. */
      loadedKimiAuth?: {
        accessToken: string
        refreshToken?: string
        organizationId?: string
      }
    },
  ): Promise<boolean> {
    const { guard, ...mutationOptions } = options
    try {
      return await accountConfigStore.mutateAccount(
        id,
        (account) => {
          const loaded = mutationOptions.loadedKimiAuth
          const effectiveUpdates = { ...updates }
          // An unchanged editor does not own session credentials. Preserve the
          // latest pair atomically with the unrelated form edit.
          if (
            loaded &&
            updates.account_info?.access_token === loaded.accessToken &&
            updates.kimiOpenPlatformAuth?.refreshToken ===
              loaded.refreshToken &&
            updates.kimiOpenPlatformAuth?.organizationId ===
              loaded.organizationId &&
            (account.account_info.access_token !== loaded.accessToken ||
              account.kimiOpenPlatformAuth?.refreshToken !==
                loaded.refreshToken ||
              account.kimiOpenPlatformAuth?.organizationId !==
                loaded.organizationId)
          ) {
            delete effectiveUpdates.kimiOpenPlatformAuth
            if (effectiveUpdates.account_info) {
              effectiveUpdates.account_info = {
                ...effectiveUpdates.account_info,
              }
              delete effectiveUpdates.account_info.access_token
            }
          }
          const effectiveSiteType = isAccountSiteType(updates.site_type)
            ? updates.site_type
            : account.site_type
          const mergedUserDraft = mutationOptions.discoveryBaseSelection
            ? mergeDiscoveredCheckInDraft({
                latest: account.checkIn,
                draft,
                candidateMethodIds: getAutoCheckinCandidateMethodIds(
                  effectiveSiteType,
                  updates.site_url ?? account.site_url,
                ),
                discoveryBaseSelection: mutationOptions.discoveryBaseSelection,
                selectionChanged: mutationOptions.selectionChanged,
              })
            : mergeUserOwnedCheckInDraft({
                latest: account.checkIn,
                draft,
                selectionChanged: mutationOptions.selectionChanged,
              })
          const checkIn = mutationOptions.refreshed
            ? mergeRefreshedCheckInStatus({
                latest: mergedUserDraft,
                refreshed: mutationOptions.refreshed,
              })
            : mergedUserDraft

          const nextAccount = applySiteAccountUpdates({
            account,
            updates: { ...effectiveUpdates, checkIn },
            now: Date.now(),
            userTimestampMode: mutationOptions.userTimestampMode,
          })
          const hasFreshDraftDiscovery =
            mutationOptions.discoveryBaseSelection &&
            (checkIn.methodKnowledge.lastFullDiscoveryAt ?? 0) >
              (account.checkIn.methodKnowledge.lastFullDiscoveryAt ?? 0)
          if (
            !hasSameCheckInRequestCredentials(nextAccount, account) &&
            !hasFreshDraftDiscovery
          ) {
            // Existing facts may still be useful, but a different credential
            // must establish its own completed discovery after this save.
            nextAccount.checkIn = invalidateCheckInDiscovery(
              nextAccount.checkIn,
            )
          }
          return {
            nextAccount,
            result: true,
            changed: true,
          }
        },
        { guard },
      )
    } catch (error) {
      // A rejected guard is a decided outcome, not a storage failure: the caller
      // reports why the update was refused instead of a generic save error.
      if (error instanceof AccountWriteRejectedError) throw error
      logger.error(t("messages:storage.updateFailed", { error: "" }), error)
      return false
    }
  }

  async updateAccountCheckInDraft(
    id: string,
    draft: SiteAccount["checkIn"],
    options: {
      selectionChanged?: boolean
      discoveryBaseSelection?: CheckInMethodSelection
      refreshed?: SiteAccount["checkIn"]
    } = {},
  ): Promise<boolean> {
    return this.updateAccountWithCheckInDraft(id, {}, draft, {
      ...options,
      userTimestampMode: AccountUpdateUserTimestampMode.Touch,
    })
  }

  /** Applies remote refresh data without replacing newer user-owned fields. */
  async updateAccountFromRefresh(
    id: string,
    updates: DeepPartial<SiteAccount>,
    refreshedCheckIn?: SiteAccount["checkIn"],
    requestSnapshot?: SiteAccount,
  ): Promise<boolean> {
    try {
      return await accountConfigStore.mutateAccount(id, (account) => {
        if (
          requestSnapshot &&
          !hasSameAccountRequestIdentity(account, requestSnapshot)
        ) {
          return { nextAccount: account, result: false, changed: false }
        }
        const effectiveUpdates = {
          ...updates,
          account_info: { ...updates.account_info },
        }
        if (
          requestSnapshot &&
          account.account_info.username !==
            requestSnapshot.account_info.username
        ) {
          delete effectiveUpdates.account_info.username
        }
        if (
          requestSnapshot &&
          (account.authType !== requestSnapshot.authType ||
            account.account_info.access_token !==
              requestSnapshot.account_info.access_token ||
            account.cookieAuth?.sessionCookie !==
              requestSnapshot.cookieAuth?.sessionCookie ||
            account.sub2apiAuth?.refreshToken !==
              requestSnapshot.sub2apiAuth?.refreshToken ||
            account.kimiOpenPlatformAuth?.refreshToken !==
              requestSnapshot.kimiOpenPlatformAuth?.refreshToken)
        ) {
          delete effectiveUpdates.account_info.access_token
          delete effectiveUpdates.account_info.id
          delete effectiveUpdates.account_info.username
          delete effectiveUpdates.sub2apiAuth
          delete effectiveUpdates.kimiOpenPlatformAuth
        }
        let checkIn = account.checkIn
        if (refreshedCheckIn) {
          checkIn = mergeRefreshedCheckInStatus({
            latest: checkIn,
            refreshed: refreshedCheckIn,
          })
        }

        const today = formatLocalDayKey()
        if (
          refreshedCheckIn &&
          checkIn.customCheckIn?.url &&
          checkIn.customCheckIn.lastCheckInDate &&
          checkIn.customCheckIn.lastCheckInDate !== today
        ) {
          checkIn = {
            ...checkIn,
            customCheckIn: {
              ...checkIn.customCheckIn,
              isCheckedInToday: false,
              lastCheckInDate: undefined,
            },
          }
        }

        return {
          nextAccount: applySiteAccountUpdates({
            account,
            updates: { ...effectiveUpdates, checkIn },
            now: Date.now(),
            userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
          }),
          result: true,
          changed: true,
        }
      })
    } catch (error) {
      logger.error(t("messages:storage.updateFailed", { error: "" }), error)
      return false
    }
  }

  /**
   * Appends one account under the account storage lock.
   *
   * An optional guard runs inside that lock before the account is appended, so a
   * cross-account rule cannot race a concurrent save. Throwing aborts the write
   * with the in-memory config untouched.
   */
  async addAccount(
    accountData: Omit<
      SiteAccount,
      "id" | "created_at" | "updated_at" | "user_updated_at"
    >,
    options: { guard?: AccountWriteGuard } = {},
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
        options.guard?.(config, account)
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

        removeAccountsFromConfig(config, [account], new Set([id]), Date.now())
        return { result: true, changed: true }
      })
      void autoCheckinStorage.pruneStatusForAccountIds([id]).catch((error) => {
        logger.error("清理自动签到账号状态失败", { accountId: id, error })
      })
      await pruneDeletedAccountVerificationResults([id])
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

        const now = Date.now()
        removeAccountsFromConfig(config, deletedAccounts, idSet, now)
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
        await pruneDeletedAccountVerificationResults(result.deletedIds)
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
