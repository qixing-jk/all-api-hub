import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { accountStorage, AccountStorageUtils } from "~/services/accountStorage"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  TEMP_WINDOW_HEALTH_STATUS_CODES,
  type AccountStorageConfig,
  type SiteAccount,
} from "~/types"

const storageData = new Map<string, AccountStorageConfig>()
const STORAGE_KEY = "site_accounts"
const {
  mockValidateAccountConnection,
  mockFetchSupportCheckIn,
  mockGetSiteType,
  mockRefreshAccountData,
  mockFetchTodayIncome,
} = vi.hoisted(() => ({
  mockValidateAccountConnection: vi.fn(),
  mockFetchSupportCheckIn: vi.fn(),
  mockGetSiteType: vi.fn(),
  mockRefreshAccountData: vi.fn(),
  mockFetchTodayIncome: vi.fn(),
}))

vi.mock("@plasmohq/storage", () => {
  class Storage {
    async set(key: string, value: AccountStorageConfig) {
      storageData.set(key, value)
    }

    async get(key: string) {
      return storageData.get(key)
    }

    async remove(key: string) {
      storageData.delete(key)
    }
  }

  return { Storage }
})

vi.mock("~/services/apiService", () => ({
  fetchTodayIncome: mockFetchTodayIncome,
  refreshAccountData: mockRefreshAccountData,
  validateAccountConnection: mockValidateAccountConnection,
  fetchSupportCheckIn: mockFetchSupportCheckIn,
}))

vi.mock("~/services/detectSiteType", () => ({
  getSiteType: mockGetSiteType,
}))

const seedStorage = (
  accounts: SiteAccount[],
  pinnedAccountIds: string[] = [],
) => {
  storageData.set(STORAGE_KEY, {
    accounts,
    pinnedAccountIds,
    last_updated: Date.now(),
  })
}

const createAccount = (overrides: Partial<SiteAccount> = {}): SiteAccount => {
  const numericId = overrides.id?.replace(/\D/g, "") || "1"

  return {
    id: overrides.id || "account-1",
    site_name: overrides.site_name || "Test Site",
    site_url: overrides.site_url || "https://test.example.com",
    health: overrides.health || { status: SiteHealthStatus.Healthy },
    site_type: overrides.site_type || "test",
    exchange_rate: overrides.exchange_rate ?? 7.2,
    account_info: {
      id: overrides.account_info?.id ?? Number(numericId),
      access_token: overrides.account_info?.access_token || "token",
      username: overrides.account_info?.username || "tester",
      quota: overrides.account_info?.quota ?? 1_000_000,
      today_prompt_tokens: overrides.account_info?.today_prompt_tokens ?? 1_234,
      today_completion_tokens:
        overrides.account_info?.today_completion_tokens ?? 2_345,
      today_quota_consumption:
        overrides.account_info?.today_quota_consumption ?? 250_000,
      today_requests_count: overrides.account_info?.today_requests_count ?? 10,
      today_income: overrides.account_info?.today_income ?? 500_000,
    },
    last_sync_time: overrides.last_sync_time ?? Date.now(),
    updated_at: overrides.updated_at ?? Date.now(),
    created_at: overrides.created_at ?? Date.now(),
    notes: overrides.notes,
    tags: overrides.tags,
    can_check_in: overrides.can_check_in,
    supports_check_in: overrides.supports_check_in,
    authType: overrides.authType ?? AuthTypeEnum.AccessToken,
    checkIn: overrides.checkIn || { enableDetection: true },
  }
}

describe("accountStorage core behaviors", () => {
  beforeEach(() => {
    storageData.clear()
    mockValidateAccountConnection.mockReset()
    mockFetchSupportCheckIn.mockReset()
    mockGetSiteType.mockReset()
    mockRefreshAccountData.mockReset()
    mockFetchTodayIncome.mockReset()

    mockRefreshAccountData.mockResolvedValue({
      success: true,
      data: {
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        checkIn: {
          enableDetection: true,
          isCheckedInToday: false,
          customCheckInUrl: "",
          customRedeemUrl: "",
          openRedeemWithCheckIn: true,
        },
      },
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: "",
        code: undefined,
      },
    })

    mockFetchTodayIncome.mockResolvedValue({ today_income: 0 })
  })

  it("convertToDisplayData should normalize currency values", () => {
    const account = createAccount({
      exchange_rate: 7,
      account_info: {
        id: 1,
        access_token: "token",
        username: "tester",
        quota: 1_500_000,
        today_prompt_tokens: 600,
        today_completion_tokens: 400,
        today_quota_consumption: 500_000,
        today_requests_count: 8,
        today_income: 250_000,
      },
    })

    const display = accountStorage.convertToDisplayData(account)

    expect(display.balance.USD).toBeCloseTo(3)
    expect(display.balance.CNY).toBeCloseTo(21)
    expect(display.todayConsumption.USD).toBeCloseTo(1)
    expect(display.todayIncome.USD).toBeCloseTo(0.5)
    expect(display.todayTokens.upload).toBe(600)
    expect(display.todayTokens.download).toBe(400)
  })

  it("convertToDisplayData should handle arrays", () => {
    const accounts = [
      createAccount({ id: "account-1" }),
      createAccount({ id: "account-2" }),
    ]

    const displayData = accountStorage.convertToDisplayData(accounts)

    expect(Array.isArray(displayData)).toBe(true)
    expect(displayData as any[]).toHaveLength(2)
    expect((displayData as any[])[0].id).toBe("account-1")
    expect((displayData as any[])[1].id).toBe("account-2")
  })

  it("pinAccount should move ids to the front without duplicates", async () => {
    const accounts = [
      createAccount({ id: "a-1" }),
      createAccount({ id: "a-2" }),
      createAccount({ id: "a-3" }),
    ]
    seedStorage(accounts, ["a-2"])

    await accountStorage.pinAccount("a-3")
    expect(await accountStorage.getPinnedList()).toEqual(["a-3", "a-2"])

    await accountStorage.pinAccount("a-3")
    expect(await accountStorage.getPinnedList()).toEqual(["a-3", "a-2"])

    await accountStorage.pinAccount("a-1")
    expect(await accountStorage.getPinnedList()).toEqual(["a-1", "a-3", "a-2"])
  })

  it("setPinnedList should drop invalid ids and keep order", async () => {
    const accounts = [
      createAccount({ id: "valid-1" }),
      createAccount({ id: "valid-2" }),
    ]
    seedStorage(accounts)

    await accountStorage.setPinnedList([
      "valid-1",
      "missing",
      "valid-2",
      "valid-2",
    ])

    expect(await accountStorage.getPinnedList()).toEqual(["valid-1", "valid-2"])
  })

  it("setOrderedList should dedupe and drop invalid ids then persist", async () => {
    const accounts = [
      createAccount({ id: "a-1" }),
      createAccount({ id: "a-2" }),
      createAccount({ id: "a-3" }),
    ]
    seedStorage(accounts)

    await accountStorage.setOrderedList([
      "a-2",
      "missing",
      "a-1",
      "a-2", // duplicate
    ])

    expect(await accountStorage.getOrderedList()).toEqual(["a-2", "a-1"])

    // When accounts change, saveAccounts should drop invalid ordered ids
    await (accountStorage as any).saveAccounts(accounts.slice(0, 2))
    expect(await accountStorage.getOrderedList()).toEqual(["a-2", "a-1"])

    // After deleting an account, ordered ids should be cleaned
    await accountStorage.deleteAccount("a-2")
    expect(await accountStorage.getOrderedList()).toEqual(["a-1"])
  })

  it("updateAccount should allow clearing tags array", async () => {
    const account = createAccount({
      id: "with-tags",
      tags: ["group-a", "group-b"],
    })
    seedStorage([account])

    const success = await accountStorage.updateAccount("with-tags", {
      tags: [],
    })
    expect(success).toBe(true)

    const config = storageData.get(STORAGE_KEY)
    const updated = config?.accounts.find((acc) => acc.id === "with-tags")

    expect(updated?.tags).toEqual([])
  })

  it("markAccountAsCheckedIn should persist today's check-in state", async () => {
    const account = createAccount({
      id: "check-1",
      checkIn: {
        enableDetection: true,
        isCheckedInToday: false,
      },
    })
    seedStorage([account])

    const today = new Date().toISOString().split("T")[0]
    const success = await accountStorage.markAccountAsCheckedIn("check-1")

    expect(success).toBe(true)

    const updatedConfig = storageData.get(STORAGE_KEY)
    const updatedAccount = updatedConfig?.accounts.find(
      (acc) => acc.id === "check-1",
    )

    expect(updatedAccount?.checkIn?.isCheckedInToday).toBe(true)
    expect(updatedAccount?.checkIn?.lastCheckInDate).toBe(today)
  })

  it("getAccountStats should aggregate numeric fields across accounts", async () => {
    const accountA = createAccount({
      id: "stats-a",
      account_info: {
        id: 1,
        access_token: "token",
        username: "userA",
        quota: 1_000_000,
        today_prompt_tokens: 100,
        today_completion_tokens: 200,
        today_quota_consumption: 50_000,
        today_requests_count: 5,
        today_income: 10_000,
      },
    })

    const accountB = createAccount({
      id: "stats-b",
      account_info: {
        id: 2,
        access_token: "token",
        username: "userB",
        quota: 2_500_000,
        today_prompt_tokens: 300,
        today_completion_tokens: 400,
        today_quota_consumption: 75_000,
        today_requests_count: 7,
        today_income: 5_000,
      },
    })

    seedStorage([accountA, accountB])

    const stats = await accountStorage.getAccountStats()

    expect(stats).toEqual({
      total_quota: 3_500_000,
      today_total_consumption: 125_000,
      today_total_requests: 12,
      today_total_prompt_tokens: 400,
      today_total_completion_tokens: 600,
      today_total_income: 15_000,
    })
  })

  it("checkUrlExists should match accounts by origin and ignore paths", async () => {
    const account = createAccount({
      id: "origin-match",
      site_url: "https://foo.example.com/dashboard",
    })
    const otherAccount = createAccount({
      id: "origin-miss",
      site_url: "https://bar.example.com",
    })
    seedStorage([account, otherAccount])

    const match = await accountStorage.checkUrlExists(
      "https://foo.example.com/settings/profile",
    )
    const miss = await accountStorage.checkUrlExists("https://baz.example.com")

    expect(match?.id).toBe("origin-match")
    expect(miss).toBeNull()
  })

  it("getAccountByBaseUrlAndUserId should find matching account and return null otherwise", async () => {
    const targetAccount = createAccount({
      id: "target",
      site_url: "https://foo.example.com/api",
      account_info: {
        id: 123,
        access_token: "token",
        username: "target-user",
        quota: 100,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })
    const otherAccount = createAccount({
      id: "other",
      site_url: "https://bar.example.com",
      account_info: {
        id: 999,
        access_token: "token",
        username: "other",
        quota: 200,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })

    seedStorage([targetAccount, otherAccount])

    const found = await accountStorage.getAccountByBaseUrlAndUserId(
      "https://foo.example.com/api",
      "123",
    )
    const missing = await accountStorage.getAccountByBaseUrlAndUserId(
      "https://foo.example.com/api",
      "999",
    )

    expect(found?.id).toBe("target")
    expect(missing).toBeNull()
  })

  it("deleteAccount should remove account data and pinned references", async () => {
    const account = createAccount({ id: "to-delete" })
    seedStorage([account], ["to-delete"])

    await accountStorage.deleteAccount("to-delete")

    const config = storageData.get(STORAGE_KEY)
    expect(config?.accounts).toHaveLength(0)
    expect(config?.pinnedAccountIds).toEqual([])
  })

  it("isPinned should reflect pinned state after setPinnedList changes", async () => {
    const account = createAccount({ id: "pinned" })
    seedStorage([account])

    expect(await accountStorage.isPinned("pinned")).toBe(false)

    await accountStorage.setPinnedList(["pinned"])
    expect(await accountStorage.isPinned("pinned")).toBe(true)

    await accountStorage.unpinAccount("pinned")
    expect(await accountStorage.isPinned("pinned")).toBe(false)
  })

  it("resetExpiredCheckIns should clear outdated custom check-in flags", async () => {
    const staleAccount = createAccount({
      id: "stale",
      checkIn: {
        enableDetection: true,
        customCheckInUrl: "https://example.com/check",
        isCheckedInToday: true,
        lastCheckInDate: "2000-01-01",
      },
    })

    const freshAccount = createAccount({
      id: "fresh",
      checkIn: {
        enableDetection: true,
        customCheckInUrl: "https://example.com/check",
        isCheckedInToday: true,
        lastCheckInDate: new Date().toISOString().split("T")[0],
      },
    })

    seedStorage([staleAccount, freshAccount])

    await accountStorage.resetExpiredCheckIns()

    const config = storageData.get(STORAGE_KEY)
    const updatedStale = config?.accounts.find((acc) => acc.id === "stale")
    const updatedFresh = config?.accounts.find((acc) => acc.id === "fresh")

    expect(updatedStale?.checkIn?.isCheckedInToday).toBe(false)
    expect(updatedStale?.checkIn?.lastCheckInDate).toBe(
      staleAccount.checkIn.lastCheckInDate,
    )
    expect(updatedFresh?.checkIn?.isCheckedInToday).toBe(true)
    expect(updatedFresh?.checkIn?.lastCheckInDate).toBe(
      freshAccount.checkIn.lastCheckInDate,
    )
  })

  it("refreshAccount should re-detect unknown site type and check-in support", async () => {
    const account = createAccount({
      id: "needs-detect",
      site_url: "https://foo.example.com",
      site_type: "unknown",
      checkIn: {} as any,
    })
    seedStorage([account])

    mockGetSiteType.mockResolvedValue("one-api")
    mockFetchSupportCheckIn.mockResolvedValue(true)

    await accountStorage.refreshAccount("needs-detect", true)

    const updatedAccount = await accountStorage.getAccountById("needs-detect")

    expect(mockGetSiteType).toHaveBeenCalledWith("https://foo.example.com")
    expect(mockFetchSupportCheckIn).toHaveBeenCalledWith(
      "https://foo.example.com",
    )
    expect(updatedAccount?.site_type).toBe("one-api")
    expect(updatedAccount?.checkIn?.enableDetection).toBe(true)
  })

  it("refreshAccount should skip re-detection when site metadata is complete", async () => {
    const account = createAccount({
      id: "known-site",
      site_url: "https://bar.example.com",
      site_type: "one-api",
      checkIn: { enableDetection: true },
    })
    seedStorage([account])

    await accountStorage.refreshAccount("known-site", true)

    expect(mockGetSiteType).not.toHaveBeenCalled()
    expect(mockFetchSupportCheckIn).not.toHaveBeenCalled()
    const updatedAccount = await accountStorage.getAccountById("known-site")
    expect(updatedAccount?.site_type).toBe("one-api")
    expect(updatedAccount?.checkIn?.enableDetection).toBe(true)
  })

  it("refreshAccount should persist health code for actionable UI", async () => {
    const account = createAccount({
      id: "temp-window",
      site_url: "https://baz.example.com",
      site_type: "one-api",
      checkIn: { enableDetection: true },
    })
    seedStorage([account])

    mockRefreshAccountData.mockResolvedValueOnce({
      success: false,
      healthStatus: {
        status: SiteHealthStatus.Warning,
        message:
          "Temp-window protection bypass is disabled. Enable it in Settings > Data Refresh",
        code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      },
    })

    await accountStorage.refreshAccount("temp-window", true)

    const updatedAccount = await accountStorage.getAccountById("temp-window")
    expect(updatedAccount?.health?.code).toBe(
      TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
    )

    mockRefreshAccountData.mockResolvedValueOnce({
      success: true,
      data: {
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        checkIn: {
          enableDetection: true,
          isCheckedInToday: false,
          customCheckInUrl: "",
          customRedeemUrl: "",
          openRedeemWithCheckIn: true,
        },
      },
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: "",
      },
    })

    await accountStorage.refreshAccount("temp-window", true)
    const clearedAccount = await accountStorage.getAccountById("temp-window")
    expect(clearedAccount?.health?.code).toBeUndefined()
  })
})

describe("AccountStorageUtils", () => {
  describe("formatBalance", () => {
    it("should format USD and CNY balances with symbols", () => {
      expect(AccountStorageUtils.formatBalance(12.345, "USD")).toBe("$12.35")
      expect(AccountStorageUtils.formatBalance(9.1, "CNY")).toBe("¥9.10")
    })
  })

  describe("formatTokenCount", () => {
    it("should format large numbers into readable units", () => {
      expect(AccountStorageUtils.formatTokenCount(1500000)).toBe("1.5M")
      expect(AccountStorageUtils.formatTokenCount(1500)).toBe("1.5K")
      expect(AccountStorageUtils.formatTokenCount(500)).toBe("500")
    })
  })

  describe("validateAccount", () => {
    it("should collect all missing field errors", () => {
      const errors = AccountStorageUtils.validateAccount({})

      expect(errors).toEqual(
        expect.arrayContaining([
          "站点名称不能为空",
          "站点 URL 不能为空",
          "访问令牌不能为空",
          "用户名不能为空",
          "站点健康状态不能为空",
          "充值比例必须为正数",
        ]),
      )
    })

    it("should return empty errors for a fully populated account", () => {
      const errors = AccountStorageUtils.validateAccount(createAccount())
      expect(errors).toHaveLength(0)
    })
  })

  describe("validateAccounts", () => {
    it("should separate valid and invalid accounts based on connection", async () => {
      const accounts = [
        createAccount({ id: "valid" }),
        createAccount({ id: "invalid" }),
        createAccount({ id: "error" }),
      ]

      mockValidateAccountConnection
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockRejectedValueOnce(new Error("network"))

      const { valid, invalid } =
        await AccountStorageUtils.validateAccounts(accounts)

      expect(valid.map((acc) => acc.id)).toEqual(["valid"])
      expect(invalid.map((acc) => acc.id)).toEqual(["invalid", "error"])
    })
  })

  describe("getHealthStatusInfo", () => {
    it("should map health statuses to style tokens", () => {
      expect(
        AccountStorageUtils.getHealthStatusInfo(SiteHealthStatus.Healthy),
      ).toMatchObject({
        text: "正常",
      })
      expect(
        AccountStorageUtils.getHealthStatusInfo(SiteHealthStatus.Error),
      ).toMatchObject({
        color: "text-red-600",
      })
      expect(
        AccountStorageUtils.getHealthStatusInfo(SiteHealthStatus.Unknown),
      ).toMatchObject({
        bgColor: "bg-gray-50",
      })
    })
  })

  describe("staleness helpers", () => {
    const fixedNow = 1_700_000_000_000

    beforeEach(() => {
      vi.spyOn(Date, "now").mockReturnValue(fixedNow)
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it("isAccountStale should respect max age threshold", () => {
      const staleAccount = createAccount({
        last_sync_time: fixedNow - 40 * 60 * 1000,
      })
      const freshAccount = createAccount({
        last_sync_time: fixedNow - 10 * 60 * 1000,
      })

      expect(AccountStorageUtils.isAccountStale(staleAccount, 30)).toBe(true)
      expect(AccountStorageUtils.isAccountStale(freshAccount, 30)).toBe(false)
    })

    it("getStaleAccounts should only return accounts exceeding threshold", () => {
      const accounts = [
        createAccount({
          id: "fresh",
          last_sync_time: fixedNow - 5 * 60 * 1000,
        }),
        createAccount({
          id: "borderline",
          last_sync_time: fixedNow - 30 * 60 * 1000,
        }),
        createAccount({ id: "old", last_sync_time: fixedNow - 90 * 60 * 1000 }),
      ]

      const staleAccounts = AccountStorageUtils.getStaleAccounts(accounts, 30)

      expect(staleAccounts.map((acc) => acc.id)).toEqual(["old"])
    })
  })
})
