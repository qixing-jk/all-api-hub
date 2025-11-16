import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
import type {
  CurrencyType,
  SiteAccount,
  SiteHealthStatus,
  StorageConfig
} from "~/types"

import { accountStorage, AccountStorageUtils } from "../../accountStorage"
import {
  migrateAccountConfig,
  migrateAccountsConfig,
  needsConfigMigration
} from "../../configMigration/account/accountDataMigration"
import { userPreferences } from "../../userPreferences"

// Mock @plasmohq/storage
vi.mock("@plasmohq/storage", () => ({
  Storage: vi.fn().mockImplementation(function () {
    return {
      get: vi.fn().mockImplementation(async (key: string) => {
        return inMemoryStorage.get(key)
      }),
      set: vi.fn().mockImplementation(async (key: string, value: any) => {
        inMemoryStorage.set(key, value)
      }),
      remove: vi.fn().mockImplementation(async (key: string) => {
        inMemoryStorage.delete(key)
      })
    }
  })
}))

// Mock migration functions
vi.mock("../../configMigration/account/accountDataMigration", () => ({
  migrateAccountConfig: vi.fn(),
  migrateAccountsConfig: vi.fn(),
  needsConfigMigration: vi.fn()
}))

// Mock user preferences
vi.mock("../../userPreferences", () => ({
  userPreferences: {
    getPreferences: vi.fn()
  }
}))

// Mock error utils
vi.mock("~/utils/error", () => ({
  getErrorMessage: vi.fn((error) => `${String(error)}`)
}))

// Mock i18next
vi.mock("i18next", () => ({
  t: vi.fn((key, options) => `${key}${options?.id ? `:${options.id}` : ""}`)
}))

describe("AccountStorage Persistence", () => {
  let inMemoryStorage: Map<string, any>
  let mockStorage: any

  // Helper to create a minimal SiteAccount fixture
  const createSiteAccount = (
    overrides: Partial<SiteAccount> = {}
  ): SiteAccount => ({
    id: "account_test_123",
    emoji: "🧪",
    site_name: "Test Site",
    site_url: "https://test.example.com",
    health: { status: "healthy" },
    site_type: "test-site",
    exchange_rate: 7.2,
    account_info: {
      id: 1,
      access_token: "test-token-123",
      username: "test-user",
      quota: 100000,
      today_prompt_tokens: 1000,
      today_completion_tokens: 500,
      today_quota_consumption: 5000,
      today_requests_count: 10,
      today_income: 0
    },
    last_sync_time: Date.now(),
    updated_at: Date.now(),
    created_at: Date.now(),
    authType: "access_token" as const,
    checkIn: {
      enableDetection: false,
      isCheckedInToday: false
    },
    ...overrides
  })

  // Helper to seed storage with config
  const seedStorageConfig = (config: Partial<StorageConfig> = {}) => {
    const defaultConfig: StorageConfig = {
      accounts: [],
      last_updated: Date.now(),
      ...config
    }
    inMemoryStorage.set("site_accounts", defaultConfig)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    inMemoryStorage = new Map()

    // Setup mock storage with in-memory implementation
    mockStorage = {
      get: vi.fn().mockImplementation(async (key: string) => {
        return inMemoryStorage.get(key)
      }),
      set: vi.fn().mockImplementation(async (key: string, value: any) => {
        inMemoryStorage.set(key, value)
      }),
      remove: vi.fn().mockImplementation(async (key: string) => {
        inMemoryStorage.delete(key)
      })
    }

    // Replace the storage instance on the accountStorage singleton
    Object.defineProperty(accountStorage, "storage", {
      value: mockStorage,
      writable: true
    })

    // Reset migration mocks
    vi.mocked(migrateAccountsConfig).mockReturnValue({
      accounts: [],
      migratedCount: 0
    })
    vi.mocked(migrateAccountConfig).mockImplementation((account) => account)
    vi.mocked(needsConfigMigration).mockReturnValue(false)

    // Reset user preferences mock
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      accountAutoRefresh: {
        enabled: true,
        interval: 300,
        minInterval: 60,
        refreshOnOpen: false
      }
    })

    // Clear mock call counts
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("getAllAccounts", () => {
    it("handles migration responses and saves when accounts are migrated", async () => {
      const accounts = [createSiteAccount()]
      seedStorageConfig({ accounts: [] })

      vi.mocked(migrateAccountsConfig).mockReturnValue({
        accounts,
        migratedCount: 1
      })

      const result = await accountStorage.getAllAccounts()

      expect(migrateAccountsConfig).toHaveBeenCalled()
      expect(result).toEqual(accounts)
      expect(mockStorage.set).toHaveBeenCalledWith(
        "site_accounts",
        expect.objectContaining({
          accounts,
          last_updated: expect.any(Number)
        })
      )
    })

    it("returns accounts without saving when no migration needed", async () => {
      const accounts = [createSiteAccount()]
      seedStorageConfig({ accounts })

      vi.mocked(migrateAccountsConfig).mockReturnValue({
        accounts,
        migratedCount: 0
      })

      const result = await accountStorage.getAllAccounts()

      expect(migrateAccountsConfig).toHaveBeenCalled()
      expect(result).toEqual(accounts)
      expect(mockStorage.set).not.toHaveBeenCalledWith(
        "site_accounts",
        expect.any(Object)
      )
    })

    it("returns empty array on error", async () => {
      mockStorage.get.mockRejectedValue(new Error("Storage error"))

      const result = await accountStorage.getAllAccounts()

      expect(result).toEqual([])
    })
  })

  describe("getAccountById", () => {
    it("returns account before migration when found", async () => {
      const account = createSiteAccount()
      seedStorageConfig({ accounts: [account] })

      const result = await accountStorage.getAccountById(account.id)

      expect(result).toEqual(account)
    })

    it("migrates and updates single account when needed", async () => {
      const account = createSiteAccount()
      const migratedAccount = { ...account, site_name: "Migrated Site" }
      seedStorageConfig({ accounts: [account] })

      vi.mocked(needsConfigMigration).mockReturnValue(true)
      vi.mocked(migrateAccountConfig).mockReturnValue(migratedAccount)

      const result = await accountStorage.getAccountById(account.id)

      expect(needsConfigMigration).toHaveBeenCalledWith(account)
      expect(migrateAccountConfig).toHaveBeenCalledWith(account)
      expect(mockStorage.set).toHaveBeenCalledWith(
        "site_accounts",
        expect.objectContaining({
          accounts: [migratedAccount]
        })
      )
      expect(result).toEqual(migratedAccount)
    })

    it("returns null when account not found", async () => {
      seedStorageConfig({ accounts: [] })

      const result = await accountStorage.getAccountById("nonexistent")

      expect(result).toBeNull()
    })

    it("returns null on error", async () => {
      mockStorage.get.mockRejectedValue(new Error("Storage error"))

      const result = await accountStorage.getAccountById("test-id")

      expect(result).toBeNull()
    })
  })

  describe("getAccountByBaseUrlAndUserId", () => {
    it("returns account before migration when found", async () => {
      const account = createSiteAccount({
        site_url: "https://test.example.com",
        account_info: { ...createSiteAccount().account_info, id: 123 }
      })
      seedStorageConfig({ accounts: [account] })

      const result = await accountStorage.getAccountByBaseUrlAndUserId(
        "https://test.example.com",
        123
      )

      expect(result).toEqual(account)
    })

    it("migrates and updates account when needed", async () => {
      const account = createSiteAccount({
        site_url: "https://test.example.com",
        account_info: { ...createSiteAccount().account_info, id: 123 }
      })
      const migratedAccount = { ...account, site_name: "Migrated Site" }
      seedStorageConfig({ accounts: [account] })

      vi.mocked(needsConfigMigration).mockReturnValue(true)
      vi.mocked(migrateAccountConfig).mockReturnValue(migratedAccount)

      const result = await accountStorage.getAccountByBaseUrlAndUserId(
        "https://test.example.com",
        123
      )

      expect(migrateAccountConfig).toHaveBeenCalledWith(account)
      expect(mockStorage.set).toHaveBeenCalledWith(
        "site_accounts",
        expect.objectContaining({
          accounts: [migratedAccount]
        })
      )
      expect(result).toEqual(migratedAccount)
    })

    it("returns null when account not found", async () => {
      seedStorageConfig({ accounts: [] })

      const result = await accountStorage.getAccountByBaseUrlAndUserId(
        "https://test.example.com",
        123
      )

      expect(result).toBeNull()
    })
  })

  describe("checkUrlExists", () => {
    it("matches accounts by origin", async () => {
      const account = createSiteAccount({
        site_url: "https://test.example.com/api"
      })
      seedStorageConfig({ accounts: [account] })

      const result = await accountStorage.checkUrlExists(
        "https://test.example.com"
      )

      expect(result).toEqual(account)
    })

    it("returns null for invalid URLs", async () => {
      const result = await accountStorage.checkUrlExists("invalid-url")

      expect(result).toBeNull()
    })

    it("returns null when no matching origin found", async () => {
      const account = createSiteAccount({
        site_url: "https://different.example.com"
      })
      seedStorageConfig({ accounts: [account] })

      const result = await accountStorage.checkUrlExists(
        "https://test.example.com"
      )

      expect(result).toBeNull()
    })

    it("handles accounts with invalid URLs gracefully", async () => {
      const account = createSiteAccount({
        site_url: "invalid-url"
      })
      seedStorageConfig({ accounts: [account] })

      const result = await accountStorage.checkUrlExists(
        "https://test.example.com"
      )

      expect(result).toBeNull()
    })
  })

  describe("addAccount", () => {
    it("assigns new ID, persists to storage, and increments counts", async () => {
      const accountData = {
        ...createSiteAccount(),
        id: undefined as any,
        created_at: undefined as any,
        updated_at: undefined as any
      }

      const result = await accountStorage.addAccount(accountData)

      expect(typeof result).toBe("string")
      expect(result).toMatch(/^account_\d+_[a-z0-9]+$/)

      expect(mockStorage.set).toHaveBeenCalledWith(
        "site_accounts",
        expect.objectContaining({
          accounts: expect.arrayContaining([
            expect.objectContaining({
              id: result,
              created_at: expect.any(Number),
              updated_at: expect.any(Number)
            })
          ])
        })
      )
    })
  })

  describe("updateAccount", () => {
    it("success path merges data and returns true", async () => {
      const account = createSiteAccount()
      seedStorageConfig({ accounts: [account] })

      const updates = { site_name: "Updated Site" }
      const result = await accountStorage.updateAccount(account.id, updates)

      expect(result).toBe(true)
      expect(mockStorage.set).toHaveBeenCalledWith(
        "site_accounts",
        expect.objectContaining({
          accounts: expect.arrayContaining([
            expect.objectContaining({
              id: account.id,
              site_name: "Updated Site",
              updated_at: expect.any(Number)
            })
          ])
        })
      )
    })

    it("failure path returns false when ID missing", async () => {
      seedStorageConfig({ accounts: [] })

      const result = await accountStorage.updateAccount("nonexistent", {
        site_name: "Updated Site"
      })

      expect(result).toBe(false)
    })
  })

  describe("deleteAccount", () => {
    it("removes entries, updates pinned list, and throws on missing ID", async () => {
      const account = createSiteAccount()
      seedStorageConfig({
        accounts: [account],
        pinnedAccountIds: [account.id]
      })

      const result = await accountStorage.deleteAccount(account.id)

      expect(result).toBe(true)
      expect(mockStorage.set).toHaveBeenCalledWith(
        "site_accounts",
        expect.objectContaining({
          accounts: [],
          pinnedAccountIds: []
        })
      )
    })

    it("throws when account not found", async () => {
      seedStorageConfig({ accounts: [] })

      await expect(
        accountStorage.deleteAccount("nonexistent")
      ).rejects.toThrow()
    })
  })

  describe("Pinned list operations", () => {
    const testAccountId = "test-account-1"
    const testAccountId2 = "test-account-2"

    beforeEach(() => {
      seedStorageConfig({
        accounts: [
          createSiteAccount({ id: testAccountId }),
          createSiteAccount({ id: testAccountId2 })
        ]
      })

      // Reset storage mock for this specific test group
      mockStorage.set.mockClear()
    })

    it("getPinnedList returns pinned IDs", async () => {
      seedStorageConfig({ pinnedAccountIds: [testAccountId] })

      const result = await accountStorage.getPinnedList()

      expect(result).toEqual([testAccountId])
    })

    it("setPinnedList dedupes and validates IDs", async () => {
      await accountStorage.setPinnedList([
        testAccountId,
        testAccountId,
        "invalid"
      ])

      expect(mockStorage.set).toHaveBeenCalledWith(
        "site_accounts",
        expect.objectContaining({
          pinnedAccountIds: [testAccountId]
        })
      )
    })

    it("pinAccount moves existing pin to front", async () => {
      seedStorageConfig({ pinnedAccountIds: [testAccountId2, testAccountId] })

      await accountStorage.pinAccount(testAccountId)

      expect(mockStorage.set).toHaveBeenCalledWith(
        "site_accounts",
        expect.objectContaining({
          pinnedAccountIds: [testAccountId, testAccountId2]
        })
      )
    })

    it("unpinAccount removes ID from list", async () => {
      seedStorageConfig({ pinnedAccountIds: [testAccountId, testAccountId2] })

      await accountStorage.unpinAccount(testAccountId)

      expect(mockStorage.set).toHaveBeenCalledWith(
        "site_accounts",
        expect.objectContaining({
          pinnedAccountIds: [testAccountId2]
        })
      )
    })

    it("isPinned checks if account is pinned", async () => {
      seedStorageConfig({ pinnedAccountIds: [testAccountId] })

      expect(await accountStorage.isPinned(testAccountId)).toBe(true)
      expect(await accountStorage.isPinned(testAccountId2)).toBe(false)
    })
  })

  describe("markAccountAsCheckedIn", () => {
    beforeEach(() => {
      seedStorageConfig({ accounts: [createSiteAccount()] })

      // Reset storage mock for this specific test group
      mockStorage.set.mockClear()
    })
    it("updates check-in status successfully", async () => {
      const account = createSiteAccount({
        checkIn: { enableDetection: false, isCheckedInToday: false }
      })
      seedStorageConfig({ accounts: [account] })

      const result = await accountStorage.markAccountAsCheckedIn(account.id)

      expect(result).toBe(true)
      expect(mockStorage.set).toHaveBeenCalledWith(
        "site_accounts",
        expect.objectContaining({
          accounts: expect.arrayContaining([
            expect.objectContaining({
              checkIn: expect.objectContaining({
                isCheckedInToday: true,
                lastCheckInDate: expect.any(String)
              })
            })
          ])
        })
      )
    })

    it("returns false when account not found", async () => {
      seedStorageConfig({ accounts: [] })

      const result = await accountStorage.markAccountAsCheckedIn("nonexistent")

      expect(result).toBe(false)
    })
  })

  describe("updateSyncTime", () => {
    beforeEach(() => {
      seedStorageConfig({ accounts: [createSiteAccount()] })

      // Reset storage mock for this specific test group
      mockStorage.set.mockClear()
    })
    it("updates sync time successfully", async () => {
      const account = createSiteAccount()
      seedStorageConfig({ accounts: [account] })

      const result = await accountStorage.updateSyncTime(account.id)

      expect(result).toBe(true)
      expect(mockStorage.set).toHaveBeenCalledWith(
        "site_accounts",
        expect.objectContaining({
          accounts: expect.arrayContaining([
            expect.objectContaining({
              last_sync_time: expect.any(Number)
            })
          ])
        })
      )
    })

    it("returns false when account not found", async () => {
      seedStorageConfig({ accounts: [] })

      const result = await accountStorage.updateSyncTime("nonexistent")

      expect(result).toBe(false)
    })
  })

  describe("convertToDisplayData", () => {
    const account = createSiteAccount({
      account_info: {
        ...createSiteAccount().account_info,
        quota: 100000, // $0.20 USD, ¥1.44 CNY
        today_quota_consumption: 5000, // $0.01 USD, ¥0.07 CNY
        today_income: 2500 // $0.005 USD, ¥0.036 CNY
      },
      exchange_rate: 7.2
    })

    it("converts single account with correct currency calculations", () => {
      const result = accountStorage.convertToDisplayData(account)

      expect(result.balance.USD).toBe(0.2)
      expect(result.balance.CNY).toBe(1.44)
      expect(result.todayConsumption.USD).toBe(0.01)
      expect(result.todayConsumption.CNY).toBe(0.07)
      expect(result.todayIncome.USD).toBe(0.01) // Rounded from 0.005
      expect(result.todayIncome.CNY).toBe(0.04) // Rounded from 0.036
    })

    it("converts array of accounts", () => {
      const accounts = [account, createSiteAccount({ id: "account2" })]
      const result = accountStorage.convertToDisplayData(accounts)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe(account.id)
      expect(result[1].id).toBe("account2")
    })

    it("handles zero income correctly", () => {
      const accountWithZeroIncome = createSiteAccount({
        account_info: {
          ...createSiteAccount().account_info,
          today_income: 0
        }
      })

      const result = accountStorage.convertToDisplayData(accountWithZeroIncome)

      expect(result.todayIncome.USD).toBe(0)
      expect(result.todayIncome.CNY).toBe(0)
    })
  })

  describe("clearAllData", () => {
    it("removes all storage keys", async () => {
      const result = await accountStorage.clearAllData()

      expect(result).toBe(true)
      expect(mockStorage.remove).toHaveBeenCalledWith("site_accounts")
      expect(mockStorage.remove).toHaveBeenCalledWith("storage_config")
    })
  })

  describe("exportData", () => {
    it("reads current config from storage", async () => {
      const config = { accounts: [], last_updated: Date.now() }
      seedStorageConfig(config)

      const result = await accountStorage.exportData()

      expect(result.accounts).toEqual(config.accounts)
      expect(result.last_updated).toBeCloseTo(config.last_updated, -3) // Allow 1 second difference
    })
  })

  describe("importData", () => {
    beforeEach(() => {
      seedStorageConfig({ accounts: [createSiteAccount({ id: "existing" })] })

      // Reset storage mock for this specific test group
      mockStorage.set.mockClear()
    })
    it("success path migrates imported data and pinned IDs", async () => {
      const existingAccounts = [createSiteAccount({ id: "existing" })]
      const importedAccounts = [createSiteAccount({ id: "imported" })]
      const migratedAccounts = [createSiteAccount({ id: "migrated" })]

      seedStorageConfig({ accounts: existingAccounts })

      vi.mocked(migrateAccountsConfig).mockReturnValue({
        accounts: migratedAccounts,
        migratedCount: 1
      })

      const result = await accountStorage.importData({
        accounts: importedAccounts,
        pinnedAccountIds: ["migrated", "invalid"]
      })

      expect(result.migratedCount).toBe(1)
      expect(migrateAccountsConfig).toHaveBeenCalledWith(importedAccounts)
      expect(mockStorage.set).toHaveBeenCalledWith(
        "site_accounts",
        expect.objectContaining({
          accounts: migratedAccounts,
          pinnedAccountIds: ["migrated"]
        })
      )
    })

    it("failure path restores previous accounts and rethrows", async () => {
      const existingAccounts = [createSiteAccount({ id: "existing" })]
      const importedAccounts = [createSiteAccount({ id: "imported" })]

      seedStorageConfig({ accounts: existingAccounts })

      vi.mocked(migrateAccountsConfig).mockReturnValue({
        accounts: importedAccounts,
        migratedCount: 1
      })

      // Mock saveAccounts to throw
      mockStorage.set.mockRejectedValue(new Error("Save failed"))

      await expect(
        accountStorage.importData({ accounts: importedAccounts })
      ).rejects.toThrow("Save failed")

      // Verify restoration
      expect(mockStorage.set).toHaveBeenCalledTimes(2) // One for import attempt, one for restoration
    })
  })

  describe("AccountStorageUtils", () => {
    describe("formatBalance", () => {
      it("formats USD correctly", () => {
        expect(AccountStorageUtils.formatBalance(123.456, "USD")).toBe(
          "$123.46"
        )
        expect(AccountStorageUtils.formatBalance(0, "USD")).toBe("$0.00")
      })

      it("formats CNY correctly", () => {
        expect(AccountStorageUtils.formatBalance(123.456, "CNY")).toBe(
          "¥123.46"
        )
        expect(AccountStorageUtils.formatBalance(0, "CNY")).toBe("¥0.00")
      })
    })

    describe("formatTokenCount", () => {
      it("formats millions correctly", () => {
        expect(AccountStorageUtils.formatTokenCount(1500000)).toBe("1.5M")
        expect(AccountStorageUtils.formatTokenCount(1000000)).toBe("1.0M")
      })

      it("formats thousands correctly", () => {
        expect(AccountStorageUtils.formatTokenCount(1500)).toBe("1.5K")
        expect(AccountStorageUtils.formatTokenCount(1000)).toBe("1.0K")
      })

      it("returns string for small numbers", () => {
        expect(AccountStorageUtils.formatTokenCount(500)).toBe("500")
        expect(AccountStorageUtils.formatTokenCount(0)).toBe("0")
      })
    })

    describe("validateAccount", () => {
      it("returns no errors for valid account", () => {
        const account = createSiteAccount()
        const errors = AccountStorageUtils.validateAccount(account)

        expect(errors).toEqual([])
      })

      it("returns errors for missing required fields", () => {
        const account = {} as Partial<SiteAccount>
        const errors = AccountStorageUtils.validateAccount(account)

        expect(errors).toContain("站点名称不能为空")
        expect(errors).toContain("站点 URL 不能为空")
        expect(errors).toContain("访问令牌不能为空")
        expect(errors).toContain("用户名不能为空")
        expect(errors).toContain("站点健康状态不能为空")
        expect(errors).toContain("充值比例必须为正数")
      })
    })

    describe("getHealthStatusInfo", () => {
      it("returns correct info for healthy status", () => {
        const info = AccountStorageUtils.getHealthStatusInfo("healthy")

        expect(info.text).toBe("正常")
        expect(info.color).toBe("text-green-600")
        expect(info.bgColor).toBe("bg-green-50")
      })

      it("returns correct info for warning status", () => {
        const info = AccountStorageUtils.getHealthStatusInfo("warning")

        expect(info.text).toBe("警告")
        expect(info.color).toBe("text-yellow-600")
        expect(info.bgColor).toBe("bg-yellow-50")
      })

      it("returns correct info for error status", () => {
        const info = AccountStorageUtils.getHealthStatusInfo("error")

        expect(info.text).toBe("错误")
        expect(info.color).toBe("text-red-600")
        expect(info.bgColor).toBe("bg-red-50")
      })

      it("returns correct info for unknown status", () => {
        const info = AccountStorageUtils.getHealthStatusInfo("unknown")

        expect(info.text).toBe("未知")
        expect(info.color).toBe("text-gray-500")
        expect(info.bgColor).toBe("bg-gray-50")
      })
    })

    describe("isAccountStale", () => {
      it("returns false for fresh accounts", () => {
        const account = createSiteAccount({
          last_sync_time: Date.now() - 10 * 60 * 1000 // 10 minutes ago
        })

        expect(AccountStorageUtils.isAccountStale(account, 30)).toBe(false)
      })

      it("returns true for stale accounts", () => {
        const account = createSiteAccount({
          last_sync_time: Date.now() - 60 * 60 * 1000 // 1 hour ago
        })

        expect(AccountStorageUtils.isAccountStale(account, 30)).toBe(true)
      })

      it("handles accounts with no sync time", () => {
        const account = createSiteAccount({ last_sync_time: undefined })

        expect(AccountStorageUtils.isAccountStale(account, 30)).toBe(true)
      })
    })

    describe("getStaleAccounts", () => {
      it("filters stale accounts from array", () => {
        const freshAccount = createSiteAccount({
          id: "fresh",
          last_sync_time: Date.now() - 10 * 60 * 1000
        })
        const staleAccount = createSiteAccount({
          id: "stale",
          last_sync_time: Date.now() - 60 * 60 * 1000
        })

        const result = AccountStorageUtils.getStaleAccounts(
          [freshAccount, staleAccount],
          30
        )

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe("stale")
      })
    })
  })
})
