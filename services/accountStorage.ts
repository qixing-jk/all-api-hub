import { t } from "i18next"
import merge from "lodash-es/merge"

import { Storage } from "@plasmohq/storage"

import { UI_CONSTANTS } from "~/constants/ui"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type AccountStats,
  type CurrencyType,
  type DisplaySiteData,
  type SiteAccount,
  type StorageConfig
} from "~/types"

import { getErrorMessage } from "../utils/error" // 存储键名常量
import {
  fetchTodayIncome,
  refreshAccountData,
  validateAccountConnection
} from "./apiService"
import {
  migrateAccountConfig,
  migrateAccountsConfig,
  needsConfigMigration
} from "./configMigration/account/accountDataMigration.ts"
import { userPreferences } from "./userPreferences"

// 存储键名常量
const STORAGE_KEYS = {
  ACCOUNTS: "site_accounts",
  CONFIG: "storage_config"
} as const

// 默认配置
const DEFAULT_CONFIG: StorageConfig = {
  accounts: [],
  last_updated: Date.now()
}

class AccountStorageService {
  private storage: Storage

  constructor() {
    this.storage = new Storage({
      area: "local"
    })
  }

  /**
   * 获取所有账号信息
   */
  async getAllAccounts(): Promise<SiteAccount[]> {
    try {
      const config = await this.getStorageConfig()
      const { accounts, migratedCount } = migrateAccountsConfig(config.accounts)

      if (migratedCount > 0) {
        console.log(
          `[AccountStorage] ${migratedCount} accounts migrated, saving updated accounts...`
        )
        await this.saveAccounts(accounts)
      }

      return accounts
    } catch (error) {
      console.error("获取账号信息失败:", error)
      return []
    }
  }

  /**
   * 根据 ID 获取单个账号信息
   */
  async getAccountById(id: string): Promise<SiteAccount | null> {
    try {
      const accounts = await this.getAllAccounts()
      const account = accounts.find((acc) => acc.id === id)

      if (account && needsConfigMigration(account)) {
        console.log(
          `[AccountStorage] Migrating single account ${account.id} on fetch.`
        )
        const migratedAccount = migrateAccountConfig(account)
        await this.updateAccount(id, migratedAccount)
        return migratedAccount
      }

      return account || null
    } catch (error) {
      console.error("获取账号信息失败:", error)
      return null
    }
  }

  /**
   * 根据 baseUrl 和 userId 获取单个账号信息
   */
  async getAccountByBaseUrlAndUserId(
    baseUrl: string,
    userId: string | number
  ): Promise<SiteAccount | null> {
    try {
      console.log(
        `[AccountStorage] Searching for account with baseUrl: ${baseUrl}, userId: ${userId}`
      )
      const accounts = await this.getAllAccounts()
      const account = accounts.find(
        (acc) =>
          acc.site_url === baseUrl && acc.account_info.id.toString() === userId
      )

      if (account && needsConfigMigration(account)) {
        console.log(
          `[AccountStorage] Migrating account ${account.id} (baseUrl: ${baseUrl}, userId: ${userId}) on fetch.`
        )
        const migratedAccount = migrateAccountConfig(account)
        await this.updateAccount(account.id, migratedAccount)
        return migratedAccount
      }

      if (account) {
        console.log(
          `[AccountStorage] Found account: ${account.site_name} (id: ${account.id})`
        )
      } else {
        console.log(
          `[AccountStorage] No account found with baseUrl: ${baseUrl}, userId: ${userId}`
        )
      }

      return account || null
    } catch (error) {
      console.error(
        `[AccountStorage] Failed to get account by baseUrl and userId:`,
        error
      )
      return null
    }
  }

  /**
   * 检查给定 URL 是否已存在
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
            return accountUrl.origin === currentUrl.origin
          } catch {
            return false
          }
        }) || null
      )
    } catch (error) {
      console.error("检查 URL 是否存在时出错:", error)
      return null
    }
  }

  /**
   * 添加新账号
   */
  async addAccount(
    accountData: Omit<SiteAccount, "id" | "created_at" | "updated_at">
  ): Promise<string> {
    try {
      console.log("[AccountStorage] 开始添加新账号:", accountData.site_name)
      const accounts = await this.getAllAccounts()
      console.log("[AccountStorage] 当前账号数量:", accounts.length)

      const now = Date.now()
      const newAccount: SiteAccount = {
        ...accountData,
        id: this.generateId(),
        created_at: now,
        updated_at: now
      }

      accounts.push(newAccount)
      console.log("[AccountStorage] 准备保存账号，总数量:", accounts.length)
      await this.saveAccounts(accounts)
      console.log("[AccountStorage] 账号保存成功，ID:", newAccount.id)

      return newAccount.id
    } catch (error) {
      console.error("[AccountStorage] 添加账号失败:", error)
      throw error
    }
  }

  /**
   * 更新账号信息
   */
  async updateAccount(
    id: string,
    updates: Partial<Omit<SiteAccount, "id" | "created_at">>
  ): Promise<boolean> {
    try {
      const accounts = await this.getAllAccounts()
      const index = accounts.findIndex((account) => account.id === id)

      if (index === -1) {
        throw new Error(t("messages:storage.accountNotFound", { id }))
      }

      accounts[index] = merge(
        {},
        accounts[index], // 原对象
        updates, // 更新数据
        { updated_at: Date.now() } // 强制更新字段
      )

      await this.saveAccounts(accounts)
      return true
    } catch (error) {
      console.error(t("messages:storage.updateFailed", { error: "" }), error)
      return false
    }
  }

  /**
   * 删除账号
   */
  async deleteAccount(id: string): Promise<boolean> {
    try {
      const accounts = await this.getAllAccounts()
      const filteredAccounts = accounts.filter((account) => account.id !== id)

      if (filteredAccounts.length === accounts.length) {
        console.error(
          `账号 ${id} 不存在，当前账号列表:`,
          accounts.map((acc) => ({ id: acc.id, name: acc.site_name }))
        )
        throw new Error(t("messages:storage.accountNotFound", { id }))
      }

      await this.saveAccounts(filteredAccounts)

      // Clean up from pinned list if present
      await this.unpinAccount(id)

      return true
    } catch (error) {
      console.error("删除账号失败:", error)
      throw error // 重新抛出错误，让调用者处理
    }
  }

  /**
   * 获取置顶账号ID列表
   */
  async getPinnedList(): Promise<string[]> {
    try {
      const config = await this.getStorageConfig()
      return config.pinnedAccountIds || []
    } catch (error) {
      console.error("获取置顶账号列表失败:", error)
      return []
    }
  }

  /**
   * 设置置顶账号ID列表
   */
  async setPinnedList(ids: string[]): Promise<boolean> {
    try {
      const config = await this.getStorageConfig()
      const uniqueIds = Array.from(new Set(ids))
      const validIds = uniqueIds.filter((id) =>
        config.accounts.some((account) => account.id === id)
      )
      config.pinnedAccountIds = validIds
      config.last_updated = Date.now()
      await this.storage.set(STORAGE_KEYS.ACCOUNTS, config)
      return true
    } catch (error) {
      console.error("设置置顶账号列表失败:", error)
      return false
    }
  }

  /**
   * 置顶账号
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
      console.error("置顶账号失败:", error)
      return false
    }
  }

  /**
   * 取消置顶账号
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
      console.error("取消置顶账号失败:", error)
      return false
    }
  }

  /**
   * 检查账号是否已置顶
   */
  async isPinned(id: string): Promise<boolean> {
    try {
      const pinnedIds = await this.getPinnedList()
      return pinnedIds.includes(id)
    } catch (error) {
      console.error("检查账号置顶状态失败:", error)
      return false
    }
  }

  /**
   * 更新账号同步时间
   */
  async updateSyncTime(id: string): Promise<boolean> {
    return this.updateAccount(id, {
      last_sync_time: Date.now()
    })
  }

  /**
   * 标记账号为已签到
   */
  async markAccountAsCheckedIn(id: string): Promise<boolean> {
    try {
      const account = await this.getAccountById(id)

      if (!account) {
        throw new Error(t("messages:storage.accountNotFound", { id }))
      }

      const today = new Date()
      const todayDate = today.toISOString().split("T")[0]
      const currentCheckIn = account.checkIn ?? { enableDetection: false }

      return this.updateAccount(id, {
        checkIn: {
          ...currentCheckIn,
          isCheckedInToday: true,
          lastCheckInDate: todayDate
        }
      })
    } catch (error) {
      console.error("标记账号为已签到失败:", error)
      return false
    }
  }

  /**
   * 重置过期的签到状态（针对自定义签到URL的账号）
   */
  async resetExpiredCheckIns(): Promise<void> {
    try {
      const accounts = await this.getAllAccounts()
      const today = new Date().toISOString().split("T")[0]
      let needsSave = false

      for (const account of accounts) {
        if (
          account.checkIn?.customCheckInUrl &&
          account.checkIn.lastCheckInDate &&
          account.checkIn.lastCheckInDate !== today &&
          account.checkIn.isCheckedInToday === true
        ) {
          // 日期已过，重置签到状态
          account.checkIn.isCheckedInToday = false
          account.checkIn.lastCheckInDate = undefined
          needsSave = true
        }
      }

      if (needsSave) {
        await this.saveAccounts(accounts)
        console.log("[AccountStorage] 已重置过期的签到状态")
      }
    } catch (error) {
      console.error("重置签到状态失败:", error)
    }
  }

  /**
   * 刷新单个账号数据
   */
  async refreshAccount(id: string, force: boolean = false) {
    try {
      const account = await this.getAccountById(id)

      if (!account) {
        throw new Error(t("messages:storage.accountNotFound", { id }))
      }
      const DisplaySiteData = accountStorage.convertToDisplayData(account)

      if (await this.shouldSkipRefresh(account, force)) {
        console.log(
          `[AccountStorage] 账号 ${account.site_name} 刷新间隔未到，跳过刷新`
        )
        return { account, refreshed: false }
      }

      // 使用同步导入的API服务
      const result = await refreshAccountData(
        account.site_url,
        account.account_info.id,
        account.account_info.access_token,
        account.checkIn,
        account.authType
      )

      // 构建更新数据
      const updateData: Partial<Omit<SiteAccount, "id" | "created_at">> = {
        health: {
          status: result.healthStatus.status,
          reason: result.healthStatus.message
        },
        last_sync_time: Date.now()
      }

      // 如果成功获取数据，更新账号信息
      if (result.success && result.data) {
        // 处理签到配置
        if (account.checkIn?.customCheckInUrl) {
          // 有自定义签到URL的账号，需要检查日期重置
          const today = new Date().toISOString().split("T")[0]
          const lastCheckInDate = account.checkIn.lastCheckInDate

          if (lastCheckInDate && lastCheckInDate !== today) {
            // 日期变了，重置签到状态
            updateData.checkIn = {
              ...account.checkIn,
              isCheckedInToday: false,
              lastCheckInDate: undefined
            }
          } else {
            // 保留当前的签到状态（不被刷新覆盖）
            updateData.checkIn = account.checkIn
          }
        } else {
          // 没有自定义签到URL，使用API返回的签到状态
          updateData.checkIn = result.data.checkIn
        }

        updateData.account_info = {
          ...account.account_info,
          quota: result.data.quota,
          today_prompt_tokens: result.data.today_prompt_tokens,
          today_completion_tokens: result.data.today_completion_tokens,
          today_quota_consumption: result.data.today_quota_consumption,
          today_requests_count: result.data.today_requests_count
        }
      }

      // 获取今日收入数据
      try {
        const todayIncome = await fetchTodayIncome(DisplaySiteData)
        updateData.account_info = {
          ...(updateData.account_info || account.account_info),
          today_income: todayIncome.today_income
        }
      } catch (error) {
        console.error(`获取账号 ${account.site_name} 今日收入失败:`, error)
        // 如果获取收入失败，设置为0
        updateData.account_info = {
          ...(updateData.account_info || account.account_info),
          today_income: 0
        }
      }

      // 更新账号信息
      await this.updateAccount(id, updateData)
      const updatedAccount = await this.getAccountById(id)

      // 记录健康状态变化
      if (account.health?.status !== result.healthStatus.status) {
        console.log(
          `账号 ${account.site_name} 健康状态变化: ${account.health?.status} -> ${result.healthStatus.status}`
        )
        console.log(`状态详情: ${result.healthStatus.message}`)
      }

      return { account: updatedAccount, refreshed: true }
    } catch (error) {
      console.error("刷新账号数据失败:", error)
      // 在出现异常时也尝试更新健康状态为unknown
      try {
        await this.updateAccount(id, {
          health: {
            status: SiteHealthStatus.Unknown,
            reason: getErrorMessage(error)
          },
          last_sync_time: Date.now()
        })
      } catch (updateError) {
        console.error("更新健康状态失败:", updateError)
      }
      return null
    }
  }

  /**
   * 刷新所有账号数据
   */
  async refreshAllAccounts(force: boolean = false) {
    const accounts = await this.getAllAccounts()
    let successCount = 0
    let failedCount = 0
    let refreshedCount = 0
    let latestSyncTime = 0

    // 使用 Promise.allSettled 来并发刷新，避免单个失败影响其他账号
    const results = await Promise.allSettled(
      accounts.map((account) => this.refreshAccount(account.id, force))
    )

    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value) {
        successCount++
        latestSyncTime = Math.max(
          result.value.account?.last_sync_time || 0,
          latestSyncTime
        )
        if (result.value.refreshed) {
          refreshedCount++
        }
      } else {
        failedCount++
        console.error(
          `刷新账号 ${accounts[index].site_name} 失败:`,
          result.status === "rejected" ? result.reason : "未知错误"
        )
      }
    })

    return {
      success: successCount,
      failed: failedCount,
      latestSyncTime,
      refreshedCount
    }
  }

  /**
   * 计算账号统计信息
   */
  async getAccountStats(): Promise<AccountStats> {
    try {
      const accounts = await this.getAllAccounts()

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
            stats.today_total_income + (account.account_info.today_income || 0)
        }),
        {
          total_quota: 0,
          today_total_consumption: 0,
          today_total_requests: 0,
          today_total_prompt_tokens: 0,
          today_total_completion_tokens: 0,
          today_total_income: 0
        }
      )
    } catch (error) {
      console.error("计算统计信息失败:", error)
      return {
        total_quota: 0,
        today_total_consumption: 0,
        today_total_requests: 0,
        today_total_prompt_tokens: 0,
        today_total_completion_tokens: 0,
        today_total_income: 0
      }
    }
  }

  convertToDisplayData(input: SiteAccount): DisplaySiteData
  convertToDisplayData(input: SiteAccount[]): DisplaySiteData[]

  /**
   * 转换为展示用的数据格式 (兼容当前 UI)
   */
  convertToDisplayData(
    input: SiteAccount | SiteAccount[]
  ): DisplaySiteData | DisplaySiteData[] {
    const transform = (account: SiteAccount): DisplaySiteData => ({
      id: account.id,
      icon: account.emoji,
      name: account.site_name,
      username: account.account_info.username,
      balance: {
        USD: parseFloat(
          (
            account.account_info.quota /
            UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
          ).toFixed(2)
        ),
        CNY: parseFloat(
          (
            (account.account_info.quota /
              UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR) *
            account.exchange_rate
          ).toFixed(2)
        )
      },
      todayConsumption: {
        USD: parseFloat(
          (
            account.account_info.today_quota_consumption /
            UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
          ).toFixed(2)
        ),
        CNY: parseFloat(
          (
            (account.account_info.today_quota_consumption /
              UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR) *
            account.exchange_rate
          ).toFixed(2)
        )
      },
      todayIncome: {
        USD: parseFloat(
          (
            (account.account_info.today_income || 0) /
            UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
          ).toFixed(2)
        ),
        CNY: parseFloat(
          (
            ((account.account_info.today_income || 0) /
              UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR) *
            account.exchange_rate
          ).toFixed(2)
        )
      },
      todayTokens: {
        upload: account.account_info.today_prompt_tokens,
        download: account.account_info.today_completion_tokens
      },
      health: account.health,
      last_sync_time: account.last_sync_time,
      baseUrl: account.site_url,
      token: account.account_info.access_token,
      userId: account.account_info.id,
      notes: account.notes,
      siteType: account.site_type,
      checkIn: account.checkIn,
      can_check_in: account.can_check_in,
      supports_check_in: account.supports_check_in,
      authType: account.authType || AuthTypeEnum.AccessToken
    })

    // 判断是否是数组
    if (Array.isArray(input)) {
      return input.map(transform)
    } else {
      return transform(input)
    }
  }

  /**
   * 清空所有数据
   */
  async clearAllData(): Promise<boolean> {
    try {
      await this.storage.remove(STORAGE_KEYS.ACCOUNTS)
      await this.storage.remove(STORAGE_KEYS.CONFIG)
      return true
    } catch (error) {
      console.error("清空数据失败:", error)
      return false
    }
  }

  /**
   * 导出数据
   */
  async exportData(): Promise<StorageConfig> {
    return this.getStorageConfig()
  }

  /**
   * 导入数据
   */
  async importData(data: {
    accounts?: SiteAccount[]
    pinnedAccountIds?: string[]
  }): Promise<{
    migratedCount: number
  }> {
    const existingAccounts = await this.getAllAccounts()
    const existingPinnedIds = await this.getPinnedList()
    try {
      const accountsToImport = data.accounts || []

      const { accounts: migratedAccounts, migratedCount } =
        migrateAccountsConfig(accountsToImport)

      if (migratedCount > 0) {
        console.log(
          `[Migration] Upgraded ${migratedCount} imported account(s) to config v1`
        )
      }

      await this.saveAccounts(migratedAccounts)

      // Import pinned account IDs if provided
      if (data.pinnedAccountIds) {
        // Clean up invalid IDs (accounts that don't exist)
        const validPinnedIds = data.pinnedAccountIds.filter((id) =>
          migratedAccounts.some((account) => account.id === id)
        )
        await this.setPinnedList(validPinnedIds)
        console.log(
          `[Import] Imported ${validPinnedIds.length} pinned account(s)`
        )
      }

      return { migratedCount }
    } catch (error) {
      console.error(
        "[Migration Error] Import migration failed, restoring from backup:",
        error
      )
      await this.saveAccounts(existingAccounts)
      await this.setPinnedList(existingPinnedIds)
      console.log("[Migration] Safety fallback: restored accounts from backup")
      throw error // Re-throw to inform caller of failure
    }
  }

  // 私有方法

  /**
   * 获取存储配置
   */
  private async getStorageConfig(): Promise<StorageConfig> {
    try {
      const config = (await this.storage.get(
        STORAGE_KEYS.ACCOUNTS
      )) as StorageConfig
      return config || DEFAULT_CONFIG
    } catch (error) {
      console.error("获取存储配置失败:", error)
      return DEFAULT_CONFIG
    }
  }

  /**
   * 保存账号数据
   */
  private async saveAccounts(accounts: SiteAccount[]): Promise<void> {
    console.log("[AccountStorage] 开始保存账号数据，数量:", accounts.length)
    const existingConfig = await this.getStorageConfig()
    const filteredPinnedIds = (existingConfig.pinnedAccountIds || []).filter(
      (id) => accounts.some((account) => account.id === id)
    )
    const config: StorageConfig = {
      ...existingConfig,
      accounts,
      pinnedAccountIds: filteredPinnedIds,
      last_updated: Date.now()
    }

    console.log("[AccountStorage] 保存的配置数据:", {
      accountCount: config.accounts.length,
      pinnedCount: config.pinnedAccountIds?.length || 0,
      last_updated: config.last_updated,
      storageKey: STORAGE_KEYS.ACCOUNTS
    })

    await this.storage.set(STORAGE_KEYS.ACCOUNTS, config)
    console.log("[AccountStorage] 账号数据保存完成")
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `account_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }

  /**
   * 检查是否应跳过刷新
   */
  private async shouldSkipRefresh(
    account: SiteAccount,
    force: boolean = false
  ): Promise<boolean> {
    if (force) {
      return false // 强制刷新，不跳过
    }

    const preferences = await userPreferences.getPreferences()
    const minIntervalMs = preferences.accountAutoRefresh.minInterval * 1000
    const timeSinceLastRefresh = Date.now() - (account.last_sync_time || 0)

    return timeSinceLastRefresh < minIntervalMs
  }
}

// 创建单例实例
export const accountStorage = new AccountStorageService()

// 工具函数
export const AccountStorageUtils = {
  /**
   * 格式化余额显示
   */
  formatBalance(amount: number, currency: CurrencyType): string {
    const symbol = currency === "USD" ? "$" : "¥"
    return `${symbol}${amount.toFixed(2)}`
  },

  /**
   * 格式化 token 数量
   */
  formatTokenCount(count: number): string {
    if (count >= 1000000) {
      return (count / 1000000).toFixed(1) + "M"
    } else if (count >= 1000) {
      return (count / 1000).toFixed(1) + "K"
    }
    return count.toString()
  },

  /**
   * 验证账号数据
   */
  validateAccount(account: Partial<SiteAccount>): string[] {
    const errors: string[] = []

    if (!account.site_name?.trim()) {
      errors.push("站点名称不能为空")
    }

    if (!account.site_url?.trim()) {
      errors.push("站点 URL 不能为空")
    }

    if (!account.account_info?.access_token?.trim()) {
      errors.push("访问令牌不能为空")
    }

    if (!account.account_info?.username?.trim()) {
      errors.push("用户名不能为空")
    }

    if (!account.health?.status) {
      errors.push("站点健康状态不能为空")
    }

    if (!account.exchange_rate || account.exchange_rate <= 0) {
      errors.push("充值比例必须为正数")
    }

    return errors
  },

  /**
   * 生成默认 emoji（已禁用）
   */
  getRandomEmoji(): string {
    return "" // 不再使用 emoji
  },

  /**
   * 获取健康状态的显示文本和样式
   */
  getHealthStatusInfo(status: SiteHealthStatus): {
    text: string
    color: string
    bgColor: string
  } {
    switch (status) {
      case "healthy":
        return { text: "正常", color: "text-green-600", bgColor: "bg-green-50" }
      case "warning":
        return {
          text: "警告",
          color: "text-yellow-600",
          bgColor: "bg-yellow-50"
        }
      case "error":
        return { text: "错误", color: "text-red-600", bgColor: "bg-red-50" }
      case "unknown":
      default:
        return { text: "未知", color: "text-gray-500", bgColor: "bg-gray-50" }
    }
  },

  /**
   * 检查账号是否需要刷新（基于最后同步时间）
   */
  isAccountStale(account: SiteAccount, maxAgeMinutes: number = 30): boolean {
    const now = Date.now()
    const ageMinutes = (now - (account.last_sync_time || 0)) / (1000 * 60)
    return ageMinutes > maxAgeMinutes
  },

  /**
   * 获取过期的账号列表
   */
  getStaleAccounts(
    accounts: SiteAccount[],
    maxAgeMinutes: number = 30
  ): SiteAccount[] {
    return accounts.filter((account) =>
      this.isAccountStale(account, maxAgeMinutes)
    )
  },

  /**
   * 批量验证账号信息
   */
  async validateAccounts(
    accounts: SiteAccount[]
  ): Promise<{ valid: SiteAccount[]; invalid: SiteAccount[] }> {
    const valid: SiteAccount[] = []
    const invalid: SiteAccount[] = []

    const validationPromises = accounts.map(async (account) => {
      try {
        const isValid = await validateAccountConnection(
          account.site_url,
          account.account_info.id,
          account.account_info.access_token
        )
        return { account, isValid }
      } catch {
        return { account, isValid: false }
      }
    })

    const results = await Promise.allSettled(validationPromises)

    results.forEach((result, index) => {
      const account = accounts[index]
      if (result.status === "fulfilled" && result.value.isValid) {
        valid.push(account)
      } else {
        invalid.push(account)
      }
    })

    return { valid, invalid }
  }
}
