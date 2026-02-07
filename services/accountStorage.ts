import { t } from "i18next"

import { Storage } from "@plasmohq/storage"

import { SUB2API, UNKNOWN_SITE } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { getApiService } from "~/services/apiService"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type AccountStats,
  type AccountStorageConfig,
  type DisplaySiteData,
  type SiteAccount,
  type SiteBookmark,
} from "~/types"
import { DeepPartial } from "~/types/utils"
import { deepOverride } from "~/utils"
import { getErrorMessage } from "~/utils/error"
import { safeRandomUUID } from "~/utils/identifier"
import { createLogger } from "~/utils/logger"

import {
  migrateAccountConfig,
  migrateAccountsConfig,
  needsConfigMigration,
} from "./configMigration/account/accountDataMigration"
import { ensureAccountTagsStorageMigrated } from "./configMigration/accountTags/accountTagsStorageMigration"
import { getSiteType } from "./detectSiteType"
import { ACCOUNT_STORAGE_KEYS, STORAGE_LOCKS } from "./storageKeys"
import { withExtensionStorageWriteLock } from "./storageWriteLock"
import { userPreferences } from "./userPreferences"

// Re-export for backward compatibility across the codebase.
export { ACCOUNT_STORAGE_KEYS }

const logger = createLogger("AccountStorage")

// 默认配置
const createDefaultAccountConfig = (): AccountStorageConfig => ({
  accounts: [],
  bookmarks: [],
  pinnedAccountIds: [],
  orderedAccountIds: [],
  last_updated: Date.now(),
})

class AccountStorageService {
  private storage: Storage

  constructor() {
    this.storage = new Storage({
      area: "local",
    })
  }

  /**
   * Backward-compatible guard: treat missing/undefined as enabled.
   */
  private static isAccountDisabled(account: Pick<SiteAccount, "disabled">) {
    return account.disabled === true
  }

  /**
   * Backward-compatible guard: treat missing/undefined as included in Total Balance.
   */
  private static isAccountExcludedFromTotalBalance(
    account: Pick<SiteAccount, "excludeFromTotalBalance">,
  ) {
    return account.excludeFromTotalBalance === true
  }

  /**
   * Run a storage mutation under an exclusive lock to prevent cross-context
   * (popup/options/background) concurrent read-modify-write races.
   *
   * Prefers the Web Locks API when available to coordinate across extension
   * contexts; falls back to an in-memory queue when locks are not supported.
   */
  private async withStorageWriteLock<T>(work: () => Promise<T>): Promise<T> {
    return withExtensionStorageWriteLock(STORAGE_LOCKS.ACCOUNT_STORAGE, work)
  }

  private cloneConfig(config: AccountStorageConfig): AccountStorageConfig {
    if (typeof structuredClone === "function") {
      return structuredClone(config)
    }
    return JSON.parse(JSON.stringify(config)) as AccountStorageConfig
  }

  private normalizeConfig(config: AccountStorageConfig): AccountStorageConfig {
    return {
      ...createDefaultAccountConfig(),
      ...config,
      accounts: config.accounts || [],
      bookmarks: Array.isArray(config.bookmarks) ? config.bookmarks : [],
      pinnedAccountIds: config.pinnedAccountIds || [],
      orderedAccountIds: config.orderedAccountIds || [],
      last_updated: Date.now(),
    }
  }

  private coerceConfigForRead(
    raw: AccountStorageConfig | undefined,
  ): AccountStorageConfig {
    return {
      accounts: Array.isArray(raw?.accounts) ? raw.accounts : [],
      bookmarks: Array.isArray(raw?.bookmarks) ? raw.bookmarks : [],
      pinnedAccountIds: Array.isArray(raw?.pinnedAccountIds)
        ? raw.pinnedAccountIds
        : [],
      orderedAccountIds: Array.isArray(raw?.orderedAccountIds)
        ? raw.orderedAccountIds
        : [],
      last_updated:
        typeof raw?.last_updated === "number" ? raw.last_updated : Date.now(),
    }
  }

  /**
   * Atomically mutate the stored config (read-modify-write) under an exclusive lock.
   * The mutation callback receives a cloned config and may mutate it in-place.
   */
  private async mutateStorageConfig<T>(
    mutation: (config: AccountStorageConfig) => { result: T; changed: boolean },
  ): Promise<T> {
    return this.withStorageWriteLock(async () => {
      const current = this.cloneConfig(await this.getStorageConfig())
      const { result, changed } = mutation(current)
      if (!changed) {
        return result
      }

      const next = this.normalizeConfig(current)
      await this.storage.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, next)
      return result
    })
  }

  /**
   * Get all accounts (migrates legacy configs if needed).
   */
  async getAllAccounts(): Promise<SiteAccount[]> {
    try {
      // Ensure tag data is migrated on reads so downstream consumers always see
      // `tagIds` and a consistent global tag store.
      await ensureAccountTagsStorageMigrated(this.storage)

      const config = await this.getStorageConfig()
      const { accounts, migratedCount } = migrateAccountsConfig(config.accounts)

      if (migratedCount > 0) {
        // If any account schemas were upgraded, persist the normalized set immediately
        logger.info("Accounts migrated; persisting updated accounts", {
          migratedCount,
        })
        await this.saveAccounts(accounts)
      }

      return accounts
    } catch (error) {
      logger.error("获取账号信息失败", error)
      return []
    }
  }

  /**
   * Get only enabled accounts (excludes disabled accounts by default).
   *
   * This is the safe default for any non-management feature (stats, background
   * jobs, selectors), so disabled accounts remain discoverable only in the
   * Account Management list where they can be re-enabled.
   */
  async getEnabledAccounts(): Promise<SiteAccount[]> {
    const accounts = await this.getAllAccounts()
    return accounts.filter(
      (account) => !AccountStorageService.isAccountDisabled(account),
    )
  }

  /**
   * Get single account by id (auto-migrates if outdated).
   */
  async getAccountById(id: string): Promise<SiteAccount | null> {
    try {
      const accounts = await this.getAllAccounts()
      const account = accounts.find((acc) => acc.id === id)

      if (account && needsConfigMigration(account)) {
        logger.debug("Migrating single account on fetch", {
          accountId: account.id,
        })
        const migratedAccount = migrateAccountConfig(account)
        await this.updateAccount(id, migratedAccount)
        return migratedAccount
      }

      return account || null
    } catch (error) {
      logger.error("获取账号信息失败", error)
      return null
    }
  }

  /**
   * Get account by baseUrl + userId (auto-migrates if outdated).
   */
  async getAccountByBaseUrlAndUserId(
    baseUrl: string,
    userId?: string | number,
  ): Promise<SiteAccount | null> {
    try {
      logger.debug("Searching for account by baseUrl + userId", {
        baseUrl,
        userId,
      })
      const accounts = await this.getAllAccounts()
      const account = accounts.find(
        (acc) =>
          acc.site_url === baseUrl &&
          String(acc.account_info.id) === String(userId),
      )

      if (account && needsConfigMigration(account)) {
        logger.debug("Migrating account on fetch", {
          accountId: account.id,
          baseUrl,
          userId,
        })
        const migratedAccount = migrateAccountConfig(account)
        await this.updateAccount(account.id, migratedAccount)
        return migratedAccount
      }

      if (account) {
        logger.debug("Account found", {
          accountId: account.id,
          siteName: account.site_name,
        })
      } else {
        logger.debug("No account found", { baseUrl, userId })
      }

      return account || null
    } catch (error) {
      logger.error("Failed to get account by baseUrl and userId", {
        baseUrl,
        userId,
        error,
      })
      return null
    }
  }

  /**
   * Check whether a given URL (origin) already exists.
   */
  async checkUrlExists(url: string): Promise<SiteAccount | null> {
    if (!url) return null
    try {
      const currentUrl = new URL(url)
      const accounts = await this.getAllAccounts()

      return (
        accounts.find((account) => {
          try {
            const accountUrl = new URL(account.site_url)
            return accountUrl.origin === currentUrl.origin // compare origins only; ignore path/query differences
          } catch {
            return false
          }
        }) || null
      )
    } catch (error) {
      logger.error("检查 URL 是否存在时出错", error)
      return null
    }
  }

  /**
   * Add a new account; generates id/timestamps and saves.
   */
  async addAccount(
    accountData: Omit<SiteAccount, "id" | "created_at" | "updated_at">,
  ): Promise<string> {
    try {
      logger.info("开始添加新账号", { siteName: accountData.site_name })
      return await this.mutateStorageConfig((config) => {
        const now = Date.now()
        const newAccount: SiteAccount = {
          ...accountData,
          disabled: accountData.disabled ?? false,
          excludeFromTotalBalance: accountData.excludeFromTotalBalance ?? false,
          id: this.generateId(),
          created_at: now,
          updated_at: now,
        }

        config.accounts = config.accounts || []
        config.accounts.push(newAccount)
        return { result: newAccount.id, changed: true }
      })
    } catch (error) {
      logger.error("添加账号失败", error)
      throw error
    }
  }

  /**
   * Update an account by id (partial), refreshes updated_at.
   */
  async updateAccount(
    id: string,
    updates: DeepPartial<SiteAccount>,
  ): Promise<boolean> {
    try {
      return await this.mutateStorageConfig((config) => {
        const accounts = config.accounts || []
        const index = accounts.findIndex((account) => account.id === id)

        if (index === -1) {
          throw new Error(t("messages:storage.accountNotFound", { id }))
        }

        const merged = deepOverride<SiteAccount>(accounts[index], {
          ...updates,
          updated_at: Date.now(),
        } as DeepPartial<SiteAccount>)

        if (
          updates.health &&
          Object.prototype.hasOwnProperty.call(updates.health, "code") &&
          updates.health.code === undefined &&
          merged.health &&
          Object.prototype.hasOwnProperty.call(merged.health, "code")
        ) {
          delete (merged.health as { code?: unknown }).code
        }

        accounts[index] = merged
        config.accounts = accounts
        return { result: true, changed: true }
      })
    } catch (error) {
      logger.error(t("messages:storage.updateFailed", { error: "" }), error)
      return false
    }
  }

  /**
   * Enable/disable an account. Disabling is persisted in storage and used as a
   * single source of truth for gating background and UI operations.
   * @param id Account id to mutate.
   * @param disabled When true, disables the account; when false, enables it.
   */
  async setAccountDisabled(id: string, disabled: boolean): Promise<boolean> {
    const normalized = Boolean(disabled)
    return this.updateAccount(id, { disabled: normalized })
  }

  /**
   * Delete an account; also unpins and removes from ordered list.
   */
  async deleteAccount(id: string): Promise<boolean> {
    try {
      return await this.mutateStorageConfig((config) => {
        const accounts = config.accounts || []
        const filteredAccounts = accounts.filter((account) => account.id !== id)

        if (filteredAccounts.length === accounts.length) {
          logger.warn("Attempted to delete missing account", {
            accountId: id,
            existingAccounts: accounts.map((acc) => ({
              id: acc.id,
              name: acc.site_name,
            })),
          })
          throw new Error(t("messages:storage.accountNotFound", { id }))
        }

        config.accounts = filteredAccounts
        config.pinnedAccountIds = (config.pinnedAccountIds || []).filter(
          (pinnedId) => pinnedId !== id,
        )
        config.orderedAccountIds = (config.orderedAccountIds || []).filter(
          (orderedId) => orderedId !== id,
        )
        return { result: true, changed: true }
      })
    } catch (error) {
      logger.error("删除账号失败", { accountId: id, error })
      throw error // 重新抛出错误，让调用者处理
    }
  }

  /**
   * Get pinned account ids.
   */
  async getPinnedList(): Promise<string[]> {
    try {
      const config = await this.getStorageConfig()
      return config.pinnedAccountIds || []
    } catch (error) {
      logger.error("获取置顶账号列表失败", error)
      return []
    }
  }

  /**
   * Get ordered account ids.
   */
  async getOrderedList(): Promise<string[]> {
    try {
      const config = await this.getStorageConfig()
      return config.orderedAccountIds || []
    } catch (error) {
      logger.error("获取自定义排序列表失败", error)
      return []
    }
  }

  /**
   * Set pinned ids (filters to existing entries, de-dupes).
   */
  async setPinnedList(ids: string[]): Promise<boolean> {
    try {
      return await this.mutateStorageConfig((config) => {
        const uniqueIds = Array.from(new Set(ids))
        const { entryIds } = AccountStorageService.buildEntryIdSets(config)
        const validIds = uniqueIds.filter((id) => entryIds.has(id))
        config.pinnedAccountIds = validIds
        return { result: true, changed: true }
      })
    } catch (error) {
      logger.error("设置置顶账号列表失败", error)
      return false
    }
  }

  /**
   * Set ordered ids (filters to existing entries, de-dupes).
   */
  async setOrderedList(ids: string[]): Promise<boolean> {
    try {
      return await this.mutateStorageConfig((config) => {
        const uniqueIds = Array.from(new Set(ids))
        const { entryIds } = AccountStorageService.buildEntryIdSets(config)
        const validIds = uniqueIds.filter((id) => entryIds.has(id))
        config.orderedAccountIds = validIds
        return { result: true, changed: true }
      })
    } catch (error) {
      logger.error("设置自定义排序列表失败", error)
      return false
    }
  }

  /**
   * Update pinned ids for a single entry type (accounts vs bookmarks), preserving the other type.
   */
  async setPinnedListSubset(input: {
    entryType: "account" | "bookmark"
    ids: string[]
  }): Promise<boolean> {
    try {
      return await this.mutateStorageConfig((config) => {
        const { accountIds, bookmarkIds, entryIds } =
          AccountStorageService.buildEntryIdSets(config)
        const subsetIdSet =
          input.entryType === "account" ? accountIds : bookmarkIds

        const merged = AccountStorageService.replaceIdListSubset({
          existingIds: config.pinnedAccountIds || [],
          subsetIdSet,
          nextSubsetIds: Array.from(new Set(input.ids)),
        })

        config.pinnedAccountIds = merged.filter((id) => entryIds.has(id))
        return { result: true, changed: true }
      })
    } catch (error) {
      logger.error("设置置顶列表失败", { entryType: input.entryType, error })
      return false
    }
  }

  /**
   * Update ordered ids for a single entry type (accounts vs bookmarks), preserving the other type.
   */
  async setOrderedListSubset(input: {
    entryType: "account" | "bookmark"
    ids: string[]
  }): Promise<boolean> {
    try {
      return await this.mutateStorageConfig((config) => {
        const { accountIds, bookmarkIds, entryIds } =
          AccountStorageService.buildEntryIdSets(config)
        const subsetIdSet =
          input.entryType === "account" ? accountIds : bookmarkIds

        const merged = AccountStorageService.replaceIdListSubset({
          existingIds: config.orderedAccountIds || [],
          subsetIdSet,
          nextSubsetIds: Array.from(new Set(input.ids)),
        })

        config.orderedAccountIds = merged.filter((id) => entryIds.has(id))
        return { result: true, changed: true }
      })
    } catch (error) {
      logger.error("设置排序列表失败", { entryType: input.entryType, error })
      return false
    }
  }

  /**
   * Pin account (moves to front).
   */
  async pinAccount(id: string): Promise<boolean> {
    try {
      const pinnedIds = await this.getPinnedList()

      // If already pinned, move to front
      const filteredIds = pinnedIds.filter((pinnedId) => pinnedId !== id)

      // Add to front of the list
      const newPinnedIds = [id, ...filteredIds]

      return await this.setPinnedList(newPinnedIds)
    } catch (error) {
      logger.error("置顶账号失败", { accountId: id, error })
      return false
    }
  }

  /**
   * Unpin account (no-op if already removed).
   */
  async unpinAccount(id: string): Promise<boolean> {
    try {
      const pinnedIds = await this.getPinnedList()
      const newPinnedIds = pinnedIds.filter((pinnedId) => pinnedId !== id)

      // Only save if the list actually changed
      if (newPinnedIds.length !== pinnedIds.length) {
        return await this.setPinnedList(newPinnedIds)
      }

      return true
    } catch (error) {
      logger.error("取消置顶账号失败", { accountId: id, error })
      return false
    }
  }

  /**
   * Check if account is pinned.
   */
  async isPinned(id: string): Promise<boolean> {
    try {
      const pinnedIds = await this.getPinnedList()
      return pinnedIds.includes(id)
    } catch (error) {
      logger.error("检查账号置顶状态失败", { accountId: id, error })
      return false
    }
  }

  /**
   * Update account last_sync_time to now.
   */
  async updateSyncTime(id: string): Promise<boolean> {
    return this.updateAccount(id, {
      last_sync_time: Date.now(),
    })
  }

  /**
   * Mark account as checked-in for today via the site check-in flow
   * (sets date + flag under checkIn.siteStatus).
   */
  async markAccountAsSiteCheckedIn(id: string): Promise<boolean> {
    try {
      const account = await this.getAccountById(id)

      if (!account) {
        throw new Error(t("messages:storage.accountNotFound", { id }))
      }
      if (AccountStorageService.isAccountDisabled(account)) {
        return false
      }

      const today = new Date()
      const todayDate = today.toISOString().split("T")[0]
      const detectedAt = today.getTime()
      const currentCheckIn = account.checkIn ?? { enableDetection: false }

      return this.updateAccount(id, {
        checkIn: {
          ...currentCheckIn,
          siteStatus: {
            ...(currentCheckIn.siteStatus ?? {}),
            isCheckedInToday: true,
            lastCheckInDate: todayDate,
            lastDetectedAt: detectedAt,
          },
        },
      })
    } catch (error) {
      logger.error("标记账号为已签到失败", { accountId: id, error })
      return false
    }
  }

  /**
   * Mark account as checked-in for today via the custom check-in URL flow
   * (sets date + flag under checkIn.customCheckIn).
   */
  async markAccountAsCustomCheckedIn(id: string): Promise<boolean> {
    try {
      const account = await this.getAccountById(id)

      if (!account) {
        throw new Error(t("messages:storage.accountNotFound", { id }))
      }
      if (AccountStorageService.isAccountDisabled(account)) {
        return false
      }

      const url = account.checkIn?.customCheckIn?.url
      if (typeof url !== "string" || url.trim() === "") {
        return false
      }

      const today = new Date()
      const todayDate = today.toISOString().split("T")[0]
      const currentCheckIn = account.checkIn ?? { enableDetection: false }

      return this.updateAccount(id, {
        checkIn: {
          ...currentCheckIn,
          customCheckIn: {
            ...(currentCheckIn.customCheckIn ?? {}),
            isCheckedInToday: true,
            lastCheckInDate: todayDate,
          },
        },
      })
    } catch (error) {
      logger.error("标记账号外部签到为已完成失败", { accountId: id, error })
      return false
    }
  }

  /**
   * Reset expired check-in flags for accounts with custom check-in URLs.
   */
  async resetExpiredCheckIns(): Promise<void> {
    try {
      const today = new Date().toISOString().split("T")[0]
      const didReset = await this.mutateStorageConfig((config) => {
        const accounts = config.accounts || []
        let needsSave = false

        for (const account of accounts) {
          if (
            account.checkIn?.customCheckIn?.url &&
            account.checkIn.customCheckIn.lastCheckInDate &&
            account.checkIn.customCheckIn.lastCheckInDate !== today &&
            account.checkIn.customCheckIn.isCheckedInToday === true
          ) {
            account.checkIn.customCheckIn.isCheckedInToday = false
            needsSave = true
          }
        }

        config.accounts = accounts
        return { result: needsSave, changed: needsSave }
      })

      if (didReset) {
        logger.info("已重置过期的签到状态")
      }
    } catch (error) {
      logger.error("重置签到状态失败", error)
    }
  }

  /**
   * Refresh a single account (API calls, check-in resets, health/status updates).
   */
  async refreshAccount(
    id: string,
    force: boolean = false,
    options?: {
      includeTodayCashflow?: boolean
    },
  ) {
    const runRefresh = async () => {
      let account = await this.getAccountById(id)

      if (!account) {
        throw new Error(t("messages:storage.accountNotFound", { id }))
      }

      if (AccountStorageService.isAccountDisabled(account)) {
        logger.debug("账号已禁用，跳过刷新", {
          accountId: account.id,
          siteName: account.site_name,
        })
        return { account, refreshed: false, skippedReason: "account_disabled" }
      }

      account = await this.refreshSiteMetadataIfNeeded(account)

      if (await this.shouldSkipRefresh(account, force)) {
        logger.debug("账号刷新间隔未到，跳过刷新", {
          accountId: account.id,
          siteName: account.site_name,
        })
        return { account, refreshed: false }
      }

      const normalizedUrl = this.normalizeBaseUrl(account.site_url)
      const baseUrl = normalizedUrl ?? account.site_url
      const auth = {
        authType: account.authType,
        userId: account.account_info.id,
        accessToken: account.account_info.access_token,
        cookie: account.cookieAuth?.sessionCookie,
        refreshToken: account.sub2apiAuth?.refreshToken,
        tokenExpiresAt: account.sub2apiAuth?.tokenExpiresAt,
      }

      // Refresh check-in support status together with account refresh.
      const currentCheckIn = account.checkIn ?? { enableDetection: false }
      let checkInForRefresh = {
        ...currentCheckIn,
        enableDetection: currentCheckIn.enableDetection ?? false,
      }

      try {
        const support = await getApiService(
          account.site_type,
        ).fetchSupportCheckIn({
          baseUrl,
          auth,
        })

        if (typeof support === "boolean") {
          checkInForRefresh = {
            ...checkInForRefresh,
            enableDetection: support,
          }
        }
      } catch (error) {
        logger.warn("Failed to determine check-in support", { baseUrl, error })
      }

      const includeTodayCashflow =
        options?.includeTodayCashflow ??
        (await userPreferences.getPreferences()).showTodayCashflow ??
        true

      // 刷新账号数据
      const result = await getApiService(account.site_type).refreshAccountData({
        baseUrl: account.site_url,
        accountId: account.id,
        checkIn: checkInForRefresh,
        auth,
        includeTodayCashflow,
      })

      // 构建更新数据
      const updateData: Partial<Omit<SiteAccount, "id" | "created_at">> = {
        health: {
          status: result.healthStatus.status,
          reason: result.healthStatus.message,
          code: result.healthStatus.code,
        },
        last_sync_time: Date.now(),
      }

      // 如果成功获取数据，更新账号信息
      if (result.success && result.data) {
        const manualBalanceUsd = account.manualBalanceUsd?.trim()
        const manualQuota =
          manualBalanceUsd && manualBalanceUsd.length > 0
            ? (() => {
                const amount = Number.parseFloat(manualBalanceUsd)
                if (!Number.isFinite(amount) || amount < 0) return undefined
                return Math.round(
                  amount * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
                )
              })()
            : undefined

        // Merge API check-in status (siteStatus) with local custom check-in state.
        const today = new Date().toISOString().split("T")[0]
        const nextCheckIn = { ...(result.data.checkIn ?? account.checkIn) }

        if (
          nextCheckIn.customCheckIn?.url &&
          nextCheckIn.customCheckIn.lastCheckInDate &&
          nextCheckIn.customCheckIn.lastCheckInDate !== today
        ) {
          nextCheckIn.customCheckIn = {
            ...nextCheckIn.customCheckIn,
            isCheckedInToday: false,
            lastCheckInDate: undefined,
          }
        }

        updateData.checkIn = nextCheckIn

        updateData.account_info = {
          ...account.account_info,
          quota: manualQuota ?? result.data.quota,
          today_prompt_tokens: result.data.today_prompt_tokens,
          today_completion_tokens: result.data.today_completion_tokens,
          today_quota_consumption: result.data.today_quota_consumption,
          today_requests_count: result.data.today_requests_count,
          today_income: result.data.today_income,
        }

        // Persist any refreshed credentials/identity discovered during refresh.
        // (Example: Sub2API JWT re-sync after an HTTP 401.)
        const authUpdate = result.authUpdate
        if (authUpdate) {
          updateData.account_info = {
            ...(updateData.account_info || account.account_info),
            ...(typeof authUpdate.accessToken === "string" &&
            authUpdate.accessToken.trim()
              ? { access_token: authUpdate.accessToken.trim() }
              : {}),
            ...(typeof authUpdate.userId === "number" &&
            Number.isFinite(authUpdate.userId)
              ? { id: authUpdate.userId }
              : {}),
            ...(typeof authUpdate.username === "string" &&
            authUpdate.username.trim()
              ? { username: authUpdate.username.trim() }
              : {}),
          }

          if (
            account.site_type === SUB2API &&
            authUpdate.sub2apiAuth &&
            typeof authUpdate.sub2apiAuth.refreshToken === "string" &&
            authUpdate.sub2apiAuth.refreshToken.trim()
          ) {
            updateData.sub2apiAuth = {
              refreshToken: authUpdate.sub2apiAuth.refreshToken.trim(),
              ...(typeof authUpdate.sub2apiAuth.tokenExpiresAt === "number" &&
              Number.isFinite(authUpdate.sub2apiAuth.tokenExpiresAt)
                ? { tokenExpiresAt: authUpdate.sub2apiAuth.tokenExpiresAt }
                : {}),
            }
          }
        }
      }

      // 更新账号信息
      await this.updateAccount(id, updateData)
      const updatedAccount = await this.getAccountById(id)

      // 记录健康状态变化
      if (account.health?.status !== result.healthStatus.status) {
        logger.info("账号健康状态变化", {
          accountId: account.id,
          siteName: account.site_name,
          from: account.health?.status,
          to: result.healthStatus.status,
          detail: result.healthStatus.message,
        })
      }

      return { account: updatedAccount, refreshed: true }
    }

    try {
      const account = await this.getAccountById(id)
      const shouldSerializeSub2ApiRefresh =
        account?.site_type === SUB2API &&
        typeof account.sub2apiAuth?.refreshToken === "string" &&
        account.sub2apiAuth.refreshToken.trim().length > 0

      if (shouldSerializeSub2ApiRefresh) {
        return await withExtensionStorageWriteLock(
          `all-api-hub:sub2api-refresh:${id}`,
          runRefresh,
        )
      }

      return await runRefresh()
    } catch (error) {
      logger.error("刷新账号数据失败", { accountId: id, error })
      // 在出现异常时也尝试更新健康状态为unknown
      try {
        await this.updateAccount(id, {
          health: {
            status: SiteHealthStatus.Unknown,
            reason: getErrorMessage(error),
            code: undefined,
          },
          last_sync_time: Date.now(),
        })
      } catch (updateError) {
        logger.error("更新健康状态失败", { accountId: id, error: updateError })
      }
      return null
    }
  }

  /**
   * Refresh all accounts concurrently; summarizes results.
   */
  async refreshAllAccounts(force: boolean = false) {
    const accounts = await this.getAllAccounts()
    const includeTodayCashflow =
      (await userPreferences.getPreferences()).showTodayCashflow ?? true
    let successCount = 0
    let failedCount = 0
    let refreshedCount = 0
    let latestSyncTime = 0

    // 使用 Promise.allSettled 来并发刷新，避免单个失败影响其他账号
    const results = await Promise.allSettled(
      accounts.map((account) =>
        this.refreshAccount(account.id, force, { includeTodayCashflow }),
      ),
    )

    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value) {
        successCount++
        latestSyncTime = Math.max(
          result.value.account?.last_sync_time || 0,
          latestSyncTime,
        )
        if (result.value.refreshed) {
          refreshedCount++
        }
      } else {
        failedCount++
        logger.error("刷新账号失败", {
          accountId: accounts[index]?.id,
          siteName: accounts[index]?.site_name,
          reason: result.status === "rejected" ? result.reason : "未知错误",
        })
      }
    })

    return {
      success: successCount,
      failed: failedCount,
      latestSyncTime,
      refreshedCount,
    }
  }

  /**
   * Compute aggregate account stats (quota, usage, income).
   */
  async getAccountStats(): Promise<AccountStats> {
    try {
      const accounts = await this.getEnabledAccounts()

      return accounts.reduce(
        (stats, account) => ({
          total_quota: stats.total_quota + account.account_info.quota,
          today_total_consumption:
            stats.today_total_consumption +
            account.account_info.today_quota_consumption,
          today_total_requests:
            stats.today_total_requests +
            account.account_info.today_requests_count,
          today_total_prompt_tokens:
            stats.today_total_prompt_tokens +
            account.account_info.today_prompt_tokens,
          today_total_completion_tokens:
            stats.today_total_completion_tokens +
            account.account_info.today_completion_tokens,
          today_total_income:
            stats.today_total_income + (account.account_info.today_income || 0),
        }),
        {
          total_quota: 0,
          today_total_consumption: 0,
          today_total_requests: 0,
          today_total_prompt_tokens: 0,
          today_total_completion_tokens: 0,
          today_total_income: 0,
        },
      )
    } catch (error) {
      logger.error("计算统计信息失败", error)
      return {
        total_quota: 0,
        today_total_consumption: 0,
        today_total_requests: 0,
        today_total_prompt_tokens: 0,
        today_total_completion_tokens: 0,
        today_total_income: 0,
      }
    }
  }

  /**
   * Convert persistence-layer SiteAccount data into the shape consumed by the UI.
   *
   * The UI expects currency values in both USD/CNY, token counts, and display
   * helpers like tags and health summaries. This adapter ensures we never leak
   * the raw storage format into presentation logic.
   * @param input Single account or array of accounts.
   * @returns Display-ready representation preserving existing metadata.
   */
  convertToDisplayData(input: SiteAccount): DisplaySiteData
  convertToDisplayData(input: SiteAccount[]): DisplaySiteData[]
  convertToDisplayData(
    input: SiteAccount | SiteAccount[],
  ): DisplaySiteData | DisplaySiteData[] {
    const transform = (account: SiteAccount): DisplaySiteData => ({
      id: account.id,
      name: account.site_name,
      username: account.account_info.username,
      disabled: AccountStorageService.isAccountDisabled(account),
      excludeFromTotalBalance:
        AccountStorageService.isAccountExcludedFromTotalBalance(account),
      balance: {
        USD:
          account.account_info.quota /
          UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
        CNY:
          (account.account_info.quota /
            UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR) *
          account.exchange_rate,
      },
      todayConsumption: {
        USD:
          account.account_info.today_quota_consumption /
          UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
        CNY:
          (account.account_info.today_quota_consumption /
            UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR) *
          account.exchange_rate,
      },
      todayIncome: {
        USD:
          (account.account_info.today_income || 0) /
          UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
        CNY:
          ((account.account_info.today_income || 0) /
            UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR) *
          account.exchange_rate,
      },
      todayTokens: {
        upload: account.account_info.today_prompt_tokens,
        download: account.account_info.today_completion_tokens,
      },
      health: account.health,
      last_sync_time: account.last_sync_time,
      baseUrl: account.site_url,
      token: account.account_info.access_token,
      userId: account.account_info.id,
      notes: account.notes,
      tagIds: account.tagIds || [],
      tags: account.tags || [],
      siteType: account.site_type,
      checkIn: account.checkIn,
      can_check_in: account.can_check_in,
      supports_check_in: account.supports_check_in,
      authType: account.authType || AuthTypeEnum.AccessToken,
    })

    // 判断是否是数组
    if (Array.isArray(input)) {
      return input.map(transform)
    } else {
      return transform(input)
    }
  }

  /**
   * Clear every stored account + metadata blob.
   *
   * Primarily used by troubleshooting tools when the user wants a clean slate.
   */
  async clearAllData(): Promise<boolean> {
    try {
      await this.storage.remove(ACCOUNT_STORAGE_KEYS.ACCOUNTS)
      return true
    } catch (error) {
      logger.error("清空数据失败", error)
      return false
    }
  }

  /**
   * Export the current storage configuration, preserving ordering + pinned info.
   */
  async exportData(): Promise<AccountStorageConfig> {
    return this.getStorageConfig()
  }

  /**
   * Import a full config dump (accounts + bookmarks + optional pinned/order ids).
   *
   * Accounts are migrated before persisting to ensure compatibility. In case of
   * failure we restore the earlier snapshot to avoid partial imports.
   */
  async importData(data: {
    accounts?: SiteAccount[]
    bookmarks?: SiteBookmark[]
    pinnedAccountIds?: string[]
    orderedAccountIds?: string[]
  }): Promise<{ migratedCount: number }> {
    return this.withStorageWriteLock(async () => {
      const backupConfig = this.cloneConfig(await this.getStorageConfig())
      try {
        const accountsToImport = data.accounts || []
        const bookmarksToImport = data.bookmarks
          ? AccountStorageService.sanitizeBookmarks(data.bookmarks)
          : backupConfig.bookmarks || []

        const { accounts: migratedAccounts, migratedCount } =
          migrateAccountsConfig(accountsToImport)

        if (migratedCount > 0) {
          logger.info("Upgraded imported account(s) during import migration", {
            migratedCount,
          })
        }

        const { entryIds } = AccountStorageService.buildEntryIdSets({
          accounts: migratedAccounts,
          bookmarks: bookmarksToImport,
        })

        const filteredPinnedIds = (backupConfig.pinnedAccountIds || []).filter(
          (id) => entryIds.has(id),
        )

        const filteredOrderedIds = (
          backupConfig.orderedAccountIds || []
        ).filter((id) => entryIds.has(id))

        const pinnedToPersist = data.pinnedAccountIds
          ? Array.from(new Set(data.pinnedAccountIds)).filter((id) =>
              entryIds.has(id),
            )
          : filteredPinnedIds

        const orderedToPersist = data.orderedAccountIds
          ? Array.from(new Set(data.orderedAccountIds)).filter((id) =>
              entryIds.has(id),
            )
          : filteredOrderedIds

        const nextConfig = this.normalizeConfig({
          ...backupConfig,
          accounts: migratedAccounts,
          bookmarks: bookmarksToImport,
          pinnedAccountIds: pinnedToPersist,
          orderedAccountIds: orderedToPersist,
        })

        await this.storage.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, nextConfig)

        if (data.pinnedAccountIds) {
          logger.info("Imported pinned entry id(s)", {
            pinnedCount: pinnedToPersist.length,
          })
        }

        return { migratedCount }
      } catch (error) {
        logger.error("Import migration failed; restoring from backup", error)
        await this.storage.set(
          ACCOUNT_STORAGE_KEYS.ACCOUNTS,
          this.normalizeConfig(backupConfig),
        )
        logger.warn("Safety fallback applied: restored accounts from backup")
        throw error // Re-throw to inform caller of failure
      }
    })
  }

  /**
   * Read the persisted storage config (with DEFAULT fallback on first run).
   */
  private async getStorageConfig(): Promise<AccountStorageConfig> {
    try {
      const config = (await this.storage.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)) as
        | AccountStorageConfig
        | undefined
      return this.coerceConfigForRead(config)
    } catch (error) {
      logger.error("获取存储配置失败", error)
      return createDefaultAccountConfig()
    }
  }

  /**
   * Save the full account list while also pruning stale pinned/ordered ids.
   *
   * This keeps derived collections in sync so the UI never references missing
   * accounts after deletions or imports.
   */
  private async saveAccounts(accounts: SiteAccount[]): Promise<void> {
    logger.debug("开始保存账号数据", { accountCount: accounts.length })
    await this.mutateStorageConfig((existingConfig) => {
      const { entryIds } = AccountStorageService.buildEntryIdSets({
        accounts,
        bookmarks: existingConfig.bookmarks || [],
      })
      const filteredPinnedIds = (existingConfig.pinnedAccountIds || []).filter(
        (id) => entryIds.has(id),
      )
      const filteredOrderedIds = (
        existingConfig.orderedAccountIds || []
      ).filter((id) => entryIds.has(id))
      existingConfig.accounts = accounts
      existingConfig.pinnedAccountIds = filteredPinnedIds
      existingConfig.orderedAccountIds = filteredOrderedIds

      logger.debug("保存的配置数据", {
        accountCount: accounts.length,
        pinnedCount: filteredPinnedIds.length,
        orderedCount: filteredOrderedIds.length,
        storageKey: ACCOUNT_STORAGE_KEYS.ACCOUNTS,
      })
      return { result: undefined, changed: true }
    })
    logger.debug("账号数据保存完成")
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return safeRandomUUID("account")
  }

  private generateBookmarkId(): string {
    return safeRandomUUID("bookmark")
  }

  private static normalizeBookmarkInput(input: {
    name: string
    url: string
    tagIds?: unknown
    notes?: unknown
  }): Pick<SiteBookmark, "name" | "url" | "tagIds" | "notes"> {
    const name = input.name?.trim() ?? ""
    const url = input.url?.trim() ?? ""
    if (!name) {
      throw new Error(t("messages:errors.validation.bookmarkNameRequired"))
    }
    if (!url) {
      throw new Error(t("messages:errors.validation.bookmarkUrlRequired"))
    }

    const tagIds = Array.isArray(input.tagIds)
      ? Array.from(
          new Set(
            input.tagIds
              .filter((id): id is string => typeof id === "string")
              .map((id) => id.trim())
              .filter(Boolean),
          ),
        )
      : []

    const notes = typeof input.notes === "string" ? input.notes : ""

    return { name, url, tagIds, notes }
  }

  private static sanitizeBookmarks(raw: unknown): SiteBookmark[] {
    if (!Array.isArray(raw)) return []

    const byId = new Map<string, SiteBookmark>()

    for (const item of raw) {
      if (!item || typeof item !== "object") continue
      const candidate = item as Partial<Record<keyof SiteBookmark, unknown>>

      const id = typeof candidate.id === "string" ? candidate.id.trim() : ""
      const name =
        typeof candidate.name === "string" ? candidate.name.trim() : ""
      const url = typeof candidate.url === "string" ? candidate.url.trim() : ""

      if (!id || !name || !url) continue

      const tagIds = Array.isArray(candidate.tagIds)
        ? Array.from(
            new Set(
              candidate.tagIds
                .filter((value): value is string => typeof value === "string")
                .map((value) => value.trim())
                .filter(Boolean),
            ),
          )
        : []

      const notes = typeof candidate.notes === "string" ? candidate.notes : ""
      const created_at =
        typeof candidate.created_at === "number" ? candidate.created_at : 0
      const updated_at =
        typeof candidate.updated_at === "number"
          ? candidate.updated_at
          : created_at || 0

      const bookmark: SiteBookmark = {
        id,
        name,
        url,
        tagIds,
        notes,
        created_at,
        updated_at,
      }

      const existing = byId.get(id)
      if (
        !existing ||
        (bookmark.updated_at || 0) >= (existing.updated_at || 0)
      ) {
        byId.set(id, bookmark)
      }
    }

    return Array.from(byId.values())
  }

  private static buildEntryIdSets(
    config: Pick<AccountStorageConfig, "accounts" | "bookmarks">,
  ) {
    const accountIds = new Set(
      (Array.isArray(config.accounts) ? config.accounts : []).map(
        (account) => account.id,
      ),
    )
    const bookmarkIds = new Set(
      (Array.isArray(config.bookmarks) ? config.bookmarks : []).map(
        (bookmark) => bookmark.id,
      ),
    )
    const entryIds = new Set<string>([...accountIds, ...bookmarkIds])
    return { accountIds, bookmarkIds, entryIds }
  }

  private static replaceIdListSubset(input: {
    existingIds: string[]
    subsetIdSet: Set<string>
    nextSubsetIds: string[]
  }): string[] {
    const existingIds = Array.isArray(input.existingIds)
      ? input.existingIds
      : []
    const subsetIdSet = input.subsetIdSet

    const seenSubset = new Set<string>()
    const uniqueNextSubsetIds: string[] = []
    for (const raw of input.nextSubsetIds) {
      if (!subsetIdSet.has(raw)) continue
      if (seenSubset.has(raw)) continue
      seenSubset.add(raw)
      uniqueNextSubsetIds.push(raw)
    }

    const existingSubsetIds = existingIds.filter((id) => subsetIdSet.has(id))
    const missingExistingSubsetIds = existingSubsetIds.filter(
      (id) => !seenSubset.has(id),
    )

    const queue = [...uniqueNextSubsetIds, ...missingExistingSubsetIds]

    const result: string[] = []
    const seen = new Set<string>()

    const queueCursor = { index: 0 }
    const takeNextSubset = () => {
      while (queueCursor.index < queue.length) {
        const next = queue[queueCursor.index]
        queueCursor.index += 1
        if (seen.has(next)) continue
        seen.add(next)
        return next
      }
      return null
    }

    for (const id of existingIds) {
      if (subsetIdSet.has(id)) {
        const next = takeNextSubset()
        if (next) {
          result.push(next)
        }
        continue
      }
      if (seen.has(id)) continue
      seen.add(id)
      result.push(id)
    }

    while (queueCursor.index < queue.length) {
      const next = takeNextSubset()
      if (!next) break
      result.push(next)
    }

    return result
  }

  /**
   * Determines whether an account refresh should be skipped based on the
   * global refresh preferences and the timestamp of the last sync.
   * @param account - The account whose refresh cadence is being evaluated.
   * @param force - When true, bypasses the interval guardrail entirely.
   * @returns True when the refresh interval has not elapsed and force isn't set.
   */
  private async shouldSkipRefresh(
    account: SiteAccount,
    force: boolean = false,
  ): Promise<boolean> {
    if (force) {
      return false // 强制刷新，不跳过
    }

    const preferences = await userPreferences.getPreferences()
    const minIntervalMs = preferences.accountAutoRefresh.minInterval * 1000
    const timeSinceLastRefresh = Date.now() - (account.last_sync_time || 0)

    return timeSinceLastRefresh < minIntervalMs
  }

  /**
   * Normalizes a URL into its protocol + host origin to ensure consistent
   * comparisons across the storage layer.
   * @param url - Raw URL string that may contain paths or query strings.
   * @returns The normalized origin string or null when parsing fails.
   */
  private normalizeBaseUrl(url?: string): string | null {
    if (!url) {
      return null
    }
    try {
      const parsed = new URL(url)
      return `${parsed.protocol}//${parsed.host}`
    } catch {
      return null
    }
  }

  /**
   * List all stored bookmarks.
   */
  async getAllBookmarks(): Promise<SiteBookmark[]> {
    try {
      const config = await this.getStorageConfig()
      return config.bookmarks || []
    } catch (error) {
      logger.error("获取书签信息失败", error)
      return []
    }
  }

  /**
   * Get a bookmark by id.
   */
  async getBookmarkById(id: string): Promise<SiteBookmark | null> {
    if (!id) return null
    try {
      const bookmarks = await this.getAllBookmarks()
      return bookmarks.find((bookmark) => bookmark.id === id) || null
    } catch (error) {
      logger.error("根据ID获取书签失败", { bookmarkId: id, error })
      return null
    }
  }

  /**
   * Add a new bookmark; generates id/timestamps and saves.
   */
  async addBookmark(input: {
    name: string
    url: string
    tagIds?: unknown
    notes?: unknown
  }): Promise<string> {
    try {
      const normalized = AccountStorageService.normalizeBookmarkInput(input)
      return await this.mutateStorageConfig((config) => {
        const now = Date.now()

        const existingEntryIds = new Set([
          ...(config.accounts || []).map((account) => account.id),
          ...(config.bookmarks || []).map((bookmark) => bookmark.id),
        ])

        let id = this.generateBookmarkId()
        while (existingEntryIds.has(id)) {
          id = this.generateBookmarkId()
        }

        const bookmark: SiteBookmark = {
          id,
          ...normalized,
          created_at: now,
          updated_at: now,
        }

        config.bookmarks = Array.isArray(config.bookmarks)
          ? config.bookmarks
          : []
        config.bookmarks.push(bookmark)

        return { result: bookmark.id, changed: true }
      })
    } catch (error) {
      logger.error("添加书签失败", error)
      throw error
    }
  }

  /**
   * Update a bookmark by id (partial), refreshes updated_at.
   */
  async updateBookmark(
    id: string,
    updates: Partial<Pick<SiteBookmark, "name" | "url" | "tagIds" | "notes">>,
  ): Promise<boolean> {
    try {
      return await this.mutateStorageConfig((config) => {
        const bookmarks = Array.isArray(config.bookmarks)
          ? config.bookmarks
          : []
        const index = bookmarks.findIndex((bookmark) => bookmark.id === id)
        if (index === -1) {
          throw new Error(
            t("messages:errors.operation.failed", {
              error: "Bookmark not found",
            }),
          )
        }

        const current = bookmarks[index]
        const normalized = AccountStorageService.normalizeBookmarkInput({
          name: updates.name ?? current.name,
          url: updates.url ?? current.url,
          tagIds: updates.tagIds ?? current.tagIds,
          notes: updates.notes ?? current.notes,
        })

        bookmarks[index] = {
          ...current,
          ...normalized,
          created_at: current.created_at,
          updated_at: Date.now(),
        }

        config.bookmarks = bookmarks
        return { result: true, changed: true }
      })
    } catch (error) {
      logger.error("更新书签失败", { bookmarkId: id, error })
      return false
    }
  }

  /**
   * Delete a bookmark; also unpins and removes from ordered list.
   */
  async deleteBookmark(id: string): Promise<boolean> {
    try {
      return await this.mutateStorageConfig((config) => {
        const bookmarks = Array.isArray(config.bookmarks)
          ? config.bookmarks
          : []
        const filtered = bookmarks.filter((bookmark) => bookmark.id !== id)
        if (filtered.length === bookmarks.length) {
          throw new Error(
            t("messages:errors.operation.failed", {
              error: "Bookmark not found",
            }),
          )
        }

        config.bookmarks = filtered
        config.pinnedAccountIds = (config.pinnedAccountIds || []).filter(
          (pinnedId) => pinnedId !== id,
        )
        config.orderedAccountIds = (config.orderedAccountIds || []).filter(
          (orderedId) => orderedId !== id,
        )
        return { result: true, changed: true }
      })
    } catch (error) {
      logger.error("删除书签失败", { bookmarkId: id, error })
      return false
    }
  }

  /**
   * Enriches an account with derived metadata (site type)
   * when the value is missing or still set to legacy defaults.
   * @param account - The account record that may require metadata upgrades.
   * @returns The latest account representation after any metadata refresh.
   */
  private async refreshSiteMetadataIfNeeded(
    account: SiteAccount,
  ): Promise<SiteAccount> {
    const normalizedUrl = this.normalizeBaseUrl(account.site_url)
    if (!normalizedUrl) {
      return account
    }

    // Check if site_type is missing or set to UNKNOWN_SITE
    const needsSiteType =
      !account.site_type || account.site_type === UNKNOWN_SITE

    if (!needsSiteType) {
      return account
    }

    const updates: DeepPartial<SiteAccount> = {}

    if (needsSiteType) {
      // Remote inference fills in UNKNOWN_SITE entries after migrations
      try {
        const detectedType = await getSiteType(normalizedUrl)
        if (detectedType && detectedType !== UNKNOWN_SITE) {
          updates.site_type = detectedType
        }
      } catch (error) {
        logger.warn("Failed to detect site type", {
          baseUrl: normalizedUrl,
          error,
        })
      }
    }

    if (Object.keys(updates).length === 0) {
      return account
    }

    const success = await this.updateAccount(account.id, updates)
    if (success) {
      const refreshed = await this.getAccountById(account.id)
      if (refreshed) {
        return refreshed
      }
    }

    return deepOverride<SiteAccount>(account, updates)
  }
}

// 创建单例实例
export const accountStorage = new AccountStorageService()
