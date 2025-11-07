import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SiteHealthStatus } from "~/types"
import type { SiteAccount, UserPreferences } from "~/types"
import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"

import { accountStorage, AccountStorageUtils } from "../../accountStorage"
import * as apiService from "../../apiService"
import {
  migrateAccountConfig,
  migrateAccountsConfig
} from "../../configMigration/account/accountDataMigration"
import { userPreferences } from "../../userPreferences"
import {
  createMockIncomeResult,
  createMockPreferences,
  createMockRefreshResult,
  createSiteAccount
} from "./helpers/fixtures"

// Mock dependencies
vi.mock("~/services/apiService", () => ({
  refreshAccountData: vi.fn(),
  fetchTodayIncome: vi.fn(),
  validateAccountConnection: vi.fn()
}))

vi.mock("~/services/userPreferences", () => ({
  userPreferences: {
    getPreferences: vi.fn()
  }
}))

vi.mock("~/services/configMigration/account/accountDataMigration", () => ({
  migrateAccountConfig: vi.fn(),
  migrateAccountsConfig: vi.fn(),
  needsConfigMigration: vi.fn()
}))

vi.mock("~/utils/error", () => ({
  getErrorMessage: vi.fn((error) =>
    error instanceof Error ? error.message : String(error)
  )
}))

vi.mock("i18next", () => ({
  t: vi.fn((key) => key)
}))

// Mock Plasmohq Storage
vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    get = vi.fn()
    set = vi.fn()
    remove = vi.fn()
  }
}))

describe("accountStorage.refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-01-15T10:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("resetExpiredCheckIns", () => {
    it("should reset expired custom check-in accounts and persist changes", async () => {
      const yesterday = "2024-01-14"
      const today = "2024-01-15"

      const accountWithExpiredCheckIn = createSiteAccount({
        id: "account-expired",
        checkIn: {
          enableDetection: true,
          customCheckInUrl: "https://test.com/checkin",
          lastCheckInDate: yesterday,
          isCheckedInToday: true
        }
      })

      const accountWithValidCheckIn = createSiteAccount({
        id: "account-valid",
        checkIn: {
          enableDetection: true,
          customCheckInUrl: "https://test.com/checkin",
          lastCheckInDate: today,
          isCheckedInToday: true
        }
      })

      const accountWithoutCustomUrl = createSiteAccount({
        id: "account-no-custom",
        checkIn: {
          enableDetection: true,
          isCheckedInToday: true
        }
      })

      const mockAccounts = [
        accountWithExpiredCheckIn,
        accountWithValidCheckIn,
        accountWithoutCustomUrl
      ]

      // Mock getAllAccounts to return test accounts
      vi.spyOn(accountStorage, "getAllAccounts").mockResolvedValue(mockAccounts)

      // Mock saveAccounts to capture the call
      const saveAccountsSpy = vi
        .spyOn(accountStorage as any, "saveAccounts")
        .mockResolvedValue(undefined)

      await accountStorage.resetExpiredCheckIns()

      expect(saveAccountsSpy).toHaveBeenCalledTimes(1)
      const savedAccounts = saveAccountsSpy.mock.calls[0][0] as SiteAccount[]

      // Check that expired check-in was reset
      const expiredAccount = savedAccounts.find(
        (a) => a.id === "account-expired"
      )
      expect(expiredAccount?.checkIn?.isCheckedInToday).toBe(false)
      expect(expiredAccount?.checkIn?.lastCheckInDate).toBeUndefined()

      // Check that valid check-in was not changed
      const validAccount = savedAccounts.find((a) => a.id === "account-valid")
      expect(validAccount?.checkIn?.isCheckedInToday).toBe(true)
      expect(validAccount?.checkIn?.lastCheckInDate).toBe(today)

      // Check that account without custom URL was not changed
      const noCustomAccount = savedAccounts.find(
        (a) => a.id === "account-no-custom"
      )
      expect(noCustomAccount?.checkIn?.isCheckedInToday).toBe(true)
    })

    it("should not persist changes when no accounts need reset", async () => {
      const today = "2024-01-15"

      const mockAccounts = [
        createSiteAccount({
          checkIn: {
            enableDetection: true,
            customCheckInUrl: "https://test.com/checkin",
            lastCheckInDate: today,
            isCheckedInToday: true
          }
        })
      ]

      vi.spyOn(accountStorage, "getAllAccounts").mockResolvedValue(mockAccounts)
      const saveAccountsSpy = vi
        .spyOn(accountStorage as any, "saveAccounts")
        .mockResolvedValue(undefined)

      await accountStorage.resetExpiredCheckIns()

      expect(saveAccountsSpy).not.toHaveBeenCalled()
    })

    it("should handle errors gracefully", async () => {
      vi.spyOn(accountStorage, "getAllAccounts").mockRejectedValue(
        new Error("Storage error")
      )
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      await accountStorage.resetExpiredCheckIns()

      expect(consoleSpy).toHaveBeenCalledWith(
        "重置签到状态失败:",
        expect.any(Error)
      )
      consoleSpy.mockRestore()
    })
  })

  describe("shouldSkipRefresh (private method)", () => {
    it("should return false when force is true", async () => {
      const account = createSiteAccount()
      const shouldSkipRefresh = (accountStorage as any).shouldSkipRefresh.bind(
        accountStorage
      )

      const result = await shouldSkipRefresh(account, true)
      expect(result).toBe(false)
    })

    it("should return true when last sync time is within min interval", async () => {
      const account = createSiteAccount({
        last_sync_time: Date.now() - 30000 // 30 seconds ago
      })

      const mockPreferences = createMockPreferences({
        accountAutoRefresh: {
          ...DEFAULT_ACCOUNT_AUTO_REFRESH,
          minInterval: 60 // 1 minute
        }
      })

      vi.mocked(userPreferences.getPreferences).mockResolvedValue(
        mockPreferences
      )

      const shouldSkipRefresh = (accountStorage as any).shouldSkipRefresh.bind(
        accountStorage
      )
      const result = await shouldSkipRefresh(account, false)

      expect(result).toBe(true)
    })

    it("should return false when last sync time exceeds min interval", async () => {
      const account = createSiteAccount({
        last_sync_time: Date.now() - 120000 // 2 minutes ago
      })

      const mockPreferences = createMockPreferences({
        accountAutoRefresh: {
          ...DEFAULT_ACCOUNT_AUTO_REFRESH,
          minInterval: 60 // 1 minute
        }
      })

      vi.mocked(userPreferences.getPreferences).mockResolvedValue(
        mockPreferences
      )

      const shouldSkipRefresh = (accountStorage as any).shouldSkipRefresh.bind(
        accountStorage
      )
      const result = await shouldSkipRefresh(account, false)

      expect(result).toBe(false)
    })

    it("should return false when last_sync_time is undefined", async () => {
      const account = createSiteAccount({
        last_sync_time: undefined
      })

      const mockPreferences = createMockPreferences()
      vi.mocked(userPreferences.getPreferences).mockResolvedValue(
        mockPreferences
      )

      const shouldSkipRefresh = (accountStorage as any).shouldSkipRefresh.bind(
        accountStorage
      )
      const result = await shouldSkipRefresh(account, false)

      expect(result).toBe(false)
    })
  })

  describe("refreshAccount", () => {
    it("should skip refresh when shouldSkipRefresh returns true", async () => {
      const account = createSiteAccount({
        last_sync_time: Date.now() - 30000 // 30 seconds ago
      })

      const mockPreferences = createMockPreferences({
        accountAutoRefresh: {
          ...DEFAULT_ACCOUNT_AUTO_REFRESH,
          minInterval: 60 // 1 minute
        }
      })

      vi.mocked(userPreferences.getPreferences).mockResolvedValue(
        mockPreferences
      )
      vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(account)

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

      const result = await accountStorage.refreshAccount(account.id, false)

      expect(result).toEqual({ account, refreshed: false })
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("刷新间隔未到，跳过刷新")
      )
      expect(apiService.refreshAccountData).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it("should successfully refresh account with all data", async () => {
      const account = createSiteAccount({
        last_sync_time: Date.now() - 120000 // 2 minutes ago
      })

      const mockRefreshResult = createMockRefreshResult()

      const mockIncomeResult = createMockIncomeResult(20)

      const updatedAccount = {
        ...account,
        account_info: {
          ...account.account_info,
          quota: 2000,
          today_prompt_tokens: 150,
          today_completion_tokens: 250,
          today_quota_consumption: 75,
          today_requests_count: 8,
          today_income: 20
        },
        health: {
          status: SiteHealthStatus.Healthy,
          reason: "Account is healthy"
        },
        last_sync_time: Date.now()
      }

      const mockPreferences = createMockPreferences()
      vi.mocked(userPreferences.getPreferences).mockResolvedValue(
        mockPreferences
      )

      const getAccountByIdSpy = vi
        .spyOn(accountStorage, "getAccountById")
        .mockResolvedValueOnce(account)
        .mockResolvedValueOnce(updatedAccount)

      vi.spyOn(accountStorage, "updateAccount").mockResolvedValue(true)

      vi.mocked(apiService.refreshAccountData).mockResolvedValue(
        mockRefreshResult
      )
      vi.mocked(apiService.fetchTodayIncome).mockResolvedValue(mockIncomeResult)

      const result = await accountStorage.refreshAccount(account.id, false)

      expect(apiService.refreshAccountData).toHaveBeenCalledWith(
        account.site_url,
        account.account_info.id,
        account.account_info.access_token,
        account.checkIn,
        account.authType
      )

      expect(apiService.fetchTodayIncome).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: account.site_url,
          userId: account.account_info.id,
          token: account.account_info.access_token
        })
      )

      expect(accountStorage.updateAccount).toHaveBeenCalledWith(
        account.id,
        expect.objectContaining({
          health: {
            status: SiteHealthStatus.Healthy,
            reason: "Account is healthy"
          },
          account_info: expect.objectContaining({
            quota: 2000,
            today_income: 20
          }),
          last_sync_time: expect.any(Number)
        })
      )

      expect(result).toEqual({
        account: updatedAccount,
        refreshed: true
      })
    })

    it("should handle custom check-in URL correctly", async () => {
      const yesterday = "2024-01-14"
      const account = createSiteAccount({
        last_sync_time: Date.now() - 120000,
        checkIn: {
          enableDetection: true,
          customCheckInUrl: "https://test.com/custom-checkin",
          lastCheckInDate: yesterday,
          isCheckedInToday: true
        }
      })

      const mockRefreshResult = createMockRefreshResult({
        checkIn: {
          enableDetection: true,
          isCheckedInToday: false // API says false, but custom should preserve
        }
      })

      const mockIncomeResult = createMockIncomeResult(20)

      const mockPreferences = createMockPreferences()
      vi.mocked(userPreferences.getPreferences).mockResolvedValue(
        mockPreferences
      )

      const getAccountByIdSpy = vi
        .spyOn(accountStorage, "getAccountById")
        .mockResolvedValueOnce(account)
        .mockResolvedValueOnce(account)

      vi.spyOn(accountStorage, "updateAccount").mockResolvedValue(true)

      vi.mocked(apiService.refreshAccountData).mockResolvedValue(
        mockRefreshResult
      )
      vi.mocked(apiService.fetchTodayIncome).mockResolvedValue(mockIncomeResult)

      await accountStorage.refreshAccount(account.id, false)

      // Should reset check-in status when date changed
      expect(accountStorage.updateAccount).toHaveBeenCalledWith(
        account.id,
        expect.objectContaining({
          checkIn: {
            enableDetection: true,
            customCheckInUrl: "https://test.com/custom-checkin",
            lastCheckInDate: undefined,
            isCheckedInToday: false
          }
        })
      )
    })

    it("should handle fetchTodayIncome failure and set to 0", async () => {
      const account = createSiteAccount({
        last_sync_time: Date.now() - 120000
      })

      const mockRefreshResult = createMockRefreshResult()

      const mockPreferences = createMockPreferences()
      vi.mocked(userPreferences.getPreferences).mockResolvedValue(
        mockPreferences
      )

      const getAccountByIdSpy = vi
        .spyOn(accountStorage, "getAccountById")
        .mockResolvedValueOnce(account)
        .mockResolvedValueOnce(account)

      vi.spyOn(accountStorage, "updateAccount").mockResolvedValue(true)

      vi.mocked(apiService.refreshAccountData).mockResolvedValue(
        mockRefreshResult
      )
      vi.mocked(apiService.fetchTodayIncome).mockRejectedValue(
        new Error("Income fetch failed")
      )

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      await accountStorage.refreshAccount(account.id, false)

      expect(consoleSpy).toHaveBeenCalledWith(
        `获取账号 ${account.site_name} 今日收入失败:`,
        expect.any(Error)
      )

      expect(accountStorage.updateAccount).toHaveBeenCalledWith(
        account.id,
        expect.objectContaining({
          account_info: expect.objectContaining({
            today_income: 0
          })
        })
      )

      consoleSpy.mockRestore()
    })

    it("should handle refresh failure and update health to unknown", async () => {
      const account = createSiteAccount({
        last_sync_time: Date.now() - 120000
      })

      const mockPreferences = createMockPreferences()
      vi.mocked(userPreferences.getPreferences).mockResolvedValue(
        mockPreferences
      )

      vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(account)
      vi.spyOn(accountStorage, "updateAccount").mockResolvedValue(true)

      vi.mocked(apiService.refreshAccountData).mockRejectedValue(
        new Error("Network error")
      )

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const result = await accountStorage.refreshAccount(account.id, false)

      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalledWith(
        "刷新账号数据失败:",
        expect.any(Error)
      )

      expect(accountStorage.updateAccount).toHaveBeenCalledWith(
        account.id,
        expect.objectContaining({
          health: {
            status: SiteHealthStatus.Unknown,
            reason: "Network error"
          },
          last_sync_time: expect.any(Number)
        })
      )

      consoleSpy.mockRestore()
    })

    it("should throw when account is missing and handle gracefully", async () => {
      const accountId = "non-existent-account"

      vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(null)

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const updateSpy = vi
        .spyOn(accountStorage, "updateAccount")
        .mockResolvedValue(true)

      const result = await accountStorage.refreshAccount(accountId, false)

      expect(result).toBeNull()
      expect(updateSpy).toHaveBeenCalledWith(
        accountId,
        expect.objectContaining({
          health: {
            status: SiteHealthStatus.Unknown,
            reason: expect.stringContaining("messages:storage.accountNotFound")
          }
        })
      )

      consoleSpy.mockRestore()
    })
  })

  describe("refreshAllAccounts", () => {
    it("should aggregate success/failed counts with mixture of results", async () => {
      const accounts = [
        createSiteAccount({ id: "account-1" }),
        createSiteAccount({ id: "account-2" }),
        createSiteAccount({ id: "account-3" })
      ]

      const mockPreferences = createMockPreferences()
      vi.mocked(userPreferences.getPreferences).mockResolvedValue(
        mockPreferences
      )

      vi.spyOn(accountStorage, "getAllAccounts").mockResolvedValue(accounts)

      // Mock refreshAccount to return different results
      const refreshAccountSpy = vi
        .spyOn(accountStorage, "refreshAccount")
        .mockResolvedValueOnce({ account: accounts[0], refreshed: true }) // success
        .mockResolvedValueOnce({ account: accounts[1], refreshed: false }) // success but not refreshed
        .mockResolvedValueOnce(null) // failed

      const result = await accountStorage.refreshAllAccounts(false)

      expect(result).toEqual({
        success: 2,
        failed: 1,
        latestSyncTime: expect.any(Number),
        refreshedCount: 1
      })

      expect(refreshAccountSpy).toHaveBeenCalledTimes(3)
    })

    it("should return latest sync time from successful refreshes", async () => {
      const now = Date.now()
      const accounts = [
        createSiteAccount({ id: "account-1", last_sync_time: now - 1000 }),
        createSiteAccount({ id: "account-2", last_sync_time: now })
      ]

      const mockPreferences = createMockPreferences()
      vi.mocked(userPreferences.getPreferences).mockResolvedValue(
        mockPreferences
      )

      vi.spyOn(accountStorage, "getAllAccounts").mockResolvedValue(accounts)

      vi.spyOn(accountStorage, "refreshAccount")
        .mockResolvedValueOnce({ account: accounts[0], refreshed: true })
        .mockResolvedValueOnce({ account: accounts[1], refreshed: true })

      const result = await accountStorage.refreshAllAccounts(false)

      expect(result.latestSyncTime).toBe(now)
    })
  })

  describe("getAccountStats", () => {
    it("should aggregate totals from stored accounts", async () => {
      const accounts = [
        createSiteAccount({
          account_info: {
            id: 1,
            access_token: "token1",
            username: "user1",
            quota: 1000,
            today_prompt_tokens: 100,
            today_completion_tokens: 200,
            today_quota_consumption: 50,
            today_requests_count: 5,
            today_income: 10
          }
        }),
        createSiteAccount({
          id: "account-2",
          account_info: {
            id: 2,
            access_token: "token2",
            username: "user2",
            quota: 2000,
            today_prompt_tokens: 150,
            today_completion_tokens: 250,
            today_quota_consumption: 75,
            today_requests_count: 8,
            today_income: 15
          }
        })
      ]

      vi.spyOn(accountStorage, "getAllAccounts").mockResolvedValue(accounts)

      const stats = await accountStorage.getAccountStats()

      expect(stats).toEqual({
        total_quota: 3000,
        today_total_consumption: 125,
        today_total_requests: 13,
        today_total_prompt_tokens: 250,
        today_total_completion_tokens: 450,
        today_total_income: 25
      })
    })

    it("should return zeros on failure", async () => {
      vi.spyOn(accountStorage, "getAllAccounts").mockRejectedValue(
        new Error("Storage error")
      )

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const stats = await accountStorage.getAccountStats()

      expect(stats).toEqual({
        total_quota: 0,
        today_total_consumption: 0,
        today_total_requests: 0,
        today_total_prompt_tokens: 0,
        today_total_completion_tokens: 0,
        today_total_income: 0
      })

      expect(consoleSpy).toHaveBeenCalledWith(
        "计算统计信息失败:",
        expect.any(Error)
      )
      consoleSpy.mockRestore()
    })

    it("should handle accounts with undefined today_income", async () => {
      const accounts = [
        createSiteAccount({
          account_info: {
            id: 1,
            access_token: "token1",
            username: "user1",
            quota: 1000,
            today_prompt_tokens: 100,
            today_completion_tokens: 200,
            today_quota_consumption: 50,
            today_requests_count: 5,
            today_income: undefined // undefined income
          }
        })
      ]

      vi.spyOn(accountStorage, "getAllAccounts").mockResolvedValue(accounts)

      const stats = await accountStorage.getAccountStats()

      expect(stats.today_total_income).toBe(0)
    })
  })

  describe("AccountStorageUtils.validateAccounts", () => {
    it("should partition valid/invalid entries based on validateAccountConnection", async () => {
      const accounts = [
        createSiteAccount({ id: "valid-1" }),
        createSiteAccount({ id: "valid-2" }),
        createSiteAccount({ id: "invalid-1" }),
        createSiteAccount({ id: "invalid-2" })
      ]

      vi.mocked(apiService.validateAccountConnection)
        .mockResolvedValueOnce(true) // valid-1
        .mockResolvedValueOnce(true) // valid-2
        .mockResolvedValueOnce(false) // invalid-1
        .mockRejectedValueOnce(new Error("Connection failed")) // invalid-2

      const result = await AccountStorageUtils.validateAccounts(accounts)

      expect(result.valid).toHaveLength(2)
      expect(result.invalid).toHaveLength(2)
      expect(result.valid.map((a) => a.id)).toEqual(["valid-1", "valid-2"])
      expect(result.invalid.map((a) => a.id)).toEqual([
        "invalid-1",
        "invalid-2"
      ])
    })

    it("should handle all valid accounts", async () => {
      const accounts = [
        createSiteAccount({ id: "valid-1" }),
        createSiteAccount({ id: "valid-2" })
      ]

      vi.mocked(apiService.validateAccountConnection)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)

      const result = await AccountStorageUtils.validateAccounts(accounts)

      expect(result.valid).toHaveLength(2)
      expect(result.invalid).toHaveLength(0)
    })

    it("should handle all invalid accounts", async () => {
      const accounts = [
        createSiteAccount({ id: "invalid-1" }),
        createSiteAccount({ id: "invalid-2" })
      ]

      vi.mocked(apiService.validateAccountConnection)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)

      const result = await AccountStorageUtils.validateAccounts(accounts)

      expect(result.valid).toHaveLength(0)
      expect(result.invalid).toHaveLength(2)
    })
  })
})
