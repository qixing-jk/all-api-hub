import { beforeEach, describe, expect, it, vi } from "vitest"

import { accountStorage } from "~/services/accountStorage"
import { ACCOUNT_STORAGE_KEYS } from "~/services/storageKeys"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  TEMP_WINDOW_HEALTH_STATUS_CODES,
  type AccountStorageConfig,
  type SiteAccount,
} from "~/types"

const storageData = new Map<string, any>()

const storageHooks: {
  beforeGet: (key: string) => Promise<void>
  beforeSet: (key: string, value: any) => Promise<void>
  beforeRemove: (key: string) => Promise<void>
} = {
  beforeGet: async () => {},
  beforeSet: async () => {},
  beforeRemove: async () => {},
}
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
    async set(key: string, value: any) {
      await storageHooks.beforeSet(key, value)
      storageData.set(key, value)
    }

    async get(key: string) {
      await storageHooks.beforeGet(key)
      return storageData.get(key)
    }

    async remove(key: string) {
      await storageHooks.beforeRemove(key)
      storageData.delete(key)
    }
  }

  return { Storage }
})

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(() => ({
    fetchTodayIncome: mockFetchTodayIncome,
    refreshAccountData: mockRefreshAccountData,
    validateAccountConnection: mockValidateAccountConnection,
    fetchSupportCheckIn: mockFetchSupportCheckIn,
  })),
}))

vi.mock("~/services/detectSiteType", () => ({
  getSiteType: mockGetSiteType,
}))

const seedStorage = (
  accounts: SiteAccount[],
  pinnedAccountIds: string[] = [],
) => {
  storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
    accounts,
    pinnedAccountIds,
    last_updated: Date.now(),
  })
}

const createAccount = (overrides: Partial<SiteAccount> = {}): SiteAccount => {
  const numericId = overrides.id?.replace(/\D/g, "") || "1"

  return {
    id: overrides.id || "account-1",
    disabled: overrides.disabled,
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
    tagIds: overrides.tagIds ?? [],
    tags: overrides.tags,
    can_check_in: overrides.can_check_in,
    supports_check_in: overrides.supports_check_in,
    authType: overrides.authType ?? AuthTypeEnum.AccessToken,
    checkIn: overrides.checkIn || {
      enableDetection: true,
      autoCheckInEnabled: true,
      siteStatus: { isCheckedInToday: false },
    },
  }
}

describe("accountStorage core behaviors", () => {
  beforeEach(() => {
    storageData.clear()
    storageHooks.beforeGet = async () => {}
    storageHooks.beforeSet = async () => {}
    storageHooks.beforeRemove = async () => {}
    mockValidateAccountConnection.mockReset()
    mockFetchSupportCheckIn.mockReset()
    mockGetSiteType.mockReset()
    mockRefreshAccountData.mockReset()
    mockFetchTodayIncome.mockReset()

    mockRefreshAccountData.mockImplementation(async (request) => ({
      success: true,
      data: {
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        checkIn: {
          ...(request.checkIn ?? { enableDetection: false }),
          siteStatus: {
            ...((request.checkIn?.siteStatus ?? {}) as any),
            isCheckedInToday: false,
          },
        },
      },
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: "",
        code: undefined,
      },
    }))

    mockFetchTodayIncome.mockResolvedValue({ today_income: 0 })
  })

  it("migrates legacy string tags on reads (account.tags -> tagIds + global tag store)", async () => {
    const account = createAccount({
      id: "with-legacy-tags",
      tags: [" Work "] as any,
    })

    seedStorage([account])

    const accounts = await accountStorage.getAllAccounts()
    expect(accounts).toHaveLength(1)
    expect(accounts[0].tagIds).toHaveLength(1)
    expect((accounts[0] as any).tags).toBeUndefined()

    const persistedConfig = storageData.get(
      ACCOUNT_STORAGE_KEYS.ACCOUNTS,
    ) as AccountStorageConfig
    expect(persistedConfig.accounts[0].tagIds).toHaveLength(1)
    expect((persistedConfig.accounts[0] as any).tags).toBeUndefined()

    const persistedTagStore = storageData.get("global_tag_store") as any
    expect(
      Object.values(persistedTagStore.tagsById).map((t: any) => t.name),
    ).toEqual(["Work"])
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

  it("updateAccount should allow clearing tagIds array", async () => {
    const account = createAccount({
      id: "with-tags",
      tagIds: ["tag-1", "tag-2"],
    })
    seedStorage([account])

    const success = await accountStorage.updateAccount("with-tags", {
      tagIds: [],
    })
    expect(success).toBe(true)

    const accounts = await accountStorage.getAllAccounts()
    const updated = accounts.find((acc) => acc.id === "with-tags")

    expect(updated?.tagIds).toEqual([])
  })

  it("updateAccount should not lose parallel updates to different accounts", async () => {
    /**
     * Concurrency stress test:
     * - If accountStorage performs a naive read-modify-write without a lock/queue,
     *   concurrent updates will overwrite each other (last write wins).
     * - The production implementation uses an exclusive lock/queue around mutations,
     *   so all updates should be preserved even when callers fire them in parallel.
     */
    const parallelUpdates = 10

    const accounts = Array.from({ length: parallelUpdates }, (_, index) =>
      createAccount({ id: `a-${index + 1}` }),
    )
    seedStorage(accounts)

    const expectedNotesById = new Map(
      accounts.map((account, index) => [account.id, `note-${index + 1}`]),
    )

    await Promise.all(
      accounts.map((account) =>
        accountStorage.updateAccount(account.id, {
          notes: expectedNotesById.get(account.id),
        }),
      ),
    )

    const saved = storageData.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)
    expect(saved?.accounts).toHaveLength(parallelUpdates)
    for (const account of saved?.accounts ?? []) {
      if (!expectedNotesById.has(account.id)) continue
      expect(account.notes).toBe(expectedNotesById.get(account.id))
    }
  })

  it("markAccountAsSiteCheckedIn should persist today's check-in state", async () => {
    const account = createAccount({
      id: "check-1",
      checkIn: {
        enableDetection: true,
        siteStatus: {
          isCheckedInToday: false,
        },
      },
    })
    seedStorage([account])

    const today = new Date().toISOString().split("T")[0]
    const success = await accountStorage.markAccountAsSiteCheckedIn("check-1")

    expect(success).toBe(true)

    const updatedConfig = storageData.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)
    const updatedAccount = updatedConfig?.accounts.find(
      (acc: { id: string }) => acc.id === "check-1",
    )

    expect(updatedAccount?.checkIn?.siteStatus?.isCheckedInToday).toBe(true)
    expect(updatedAccount?.checkIn?.siteStatus?.lastCheckInDate).toBe(today)
  })

  it("markAccountAsCustomCheckedIn should persist today's custom check-in state", async () => {
    const account = createAccount({
      id: "custom-1",
      checkIn: {
        enableDetection: true,
        customCheckIn: {
          url: "https://example.com/check",
          isCheckedInToday: false,
        },
      },
    })
    seedStorage([account])

    const today = new Date().toISOString().split("T")[0]
    const success =
      await accountStorage.markAccountAsCustomCheckedIn("custom-1")

    expect(success).toBe(true)

    const accounts = await accountStorage.getAllAccounts()
    const updatedAccount = accounts.find((acc) => acc.id === "custom-1")

    expect(updatedAccount?.checkIn?.customCheckIn?.isCheckedInToday).toBe(true)
    expect(updatedAccount?.checkIn?.customCheckIn?.lastCheckInDate).toBe(today)
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

  it("getAccountStats should exclude disabled accounts", async () => {
    const disabledAccount = createAccount({
      id: "stats-disabled",
      disabled: true,
      account_info: {
        id: 1,
        access_token: "token",
        username: "userDisabled",
        quota: 1_000_000,
        today_prompt_tokens: 100,
        today_completion_tokens: 200,
        today_quota_consumption: 50_000,
        today_requests_count: 5,
        today_income: 10_000,
      },
    })

    const enabledAccount = createAccount({
      id: "stats-enabled",
      account_info: {
        id: 2,
        access_token: "token",
        username: "userEnabled",
        quota: 2_500_000,
        today_prompt_tokens: 300,
        today_completion_tokens: 400,
        today_quota_consumption: 75_000,
        today_requests_count: 7,
        today_income: 5_000,
      },
    })

    seedStorage([disabledAccount, enabledAccount])

    const stats = await accountStorage.getAccountStats()

    expect(stats).toEqual({
      total_quota: 2_500_000,
      today_total_consumption: 75_000,
      today_total_requests: 7,
      today_total_prompt_tokens: 300,
      today_total_completion_tokens: 400,
      today_total_income: 5_000,
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

    const config = storageData.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)
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
        customCheckIn: {
          url: "https://example.com/check",
          isCheckedInToday: true,
          lastCheckInDate: "2000-01-01",
        },
      },
    })

    const freshAccount = createAccount({
      id: "fresh",
      checkIn: {
        enableDetection: true,
        customCheckIn: {
          url: "https://example.com/check",
          isCheckedInToday: true,
          lastCheckInDate: new Date().toISOString().split("T")[0],
        },
      },
    })

    seedStorage([staleAccount, freshAccount])

    await accountStorage.resetExpiredCheckIns()

    const accounts = await accountStorage.getAllAccounts()
    const updatedStale = accounts.find((acc) => acc.id === "stale")
    const updatedFresh = accounts.find((acc) => acc.id === "fresh")

    expect(updatedStale?.checkIn?.customCheckIn?.isCheckedInToday).toBe(false)
    expect(updatedStale?.checkIn?.customCheckIn?.lastCheckInDate).toBe(
      staleAccount.checkIn.customCheckIn?.lastCheckInDate,
    )
    expect(updatedFresh?.checkIn?.customCheckIn?.isCheckedInToday).toBe(true)
    expect(updatedFresh?.checkIn?.customCheckIn?.lastCheckInDate).toBe(
      freshAccount.checkIn.customCheckIn?.lastCheckInDate,
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
    expect(mockFetchSupportCheckIn).toHaveBeenCalledWith({
      baseUrl: "https://foo.example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "token",
      },
    })
    expect(updatedAccount?.site_type).toBe("one-api")
    expect(updatedAccount?.checkIn?.enableDetection).toBe(true)
  })

  it("refreshAccount should skip disabled accounts and avoid network calls", async () => {
    const account = createAccount({
      id: "disabled-refresh",
      disabled: true,
      site_url: "https://disabled.example.com",
      site_type: "unknown",
      checkIn: {} as any,
    })
    seedStorage([account])

    const result = await accountStorage.refreshAccount("disabled-refresh", true)

    expect(result).toEqual(
      expect.objectContaining({
        refreshed: false,
        skippedReason: "account_disabled",
      }),
    )
    expect(mockGetSiteType).not.toHaveBeenCalled()
    expect(mockFetchSupportCheckIn).not.toHaveBeenCalled()
    expect(mockRefreshAccountData).not.toHaveBeenCalled()
    expect(mockFetchTodayIncome).not.toHaveBeenCalled()
  })

  it("refreshAccount should skip re-detection when site metadata is complete", async () => {
    const account = createAccount({
      id: "known-site",
      site_url: "https://bar.example.com",
      site_type: "one-api",
      checkIn: { enableDetection: true },
    })
    seedStorage([account])

    mockFetchSupportCheckIn.mockResolvedValue(false)

    await accountStorage.refreshAccount("known-site", true)

    expect(mockGetSiteType).not.toHaveBeenCalled()
    expect(mockFetchSupportCheckIn).toHaveBeenCalledWith({
      baseUrl: "https://bar.example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "token",
      },
    })
    const updatedAccount = await accountStorage.getAccountById("known-site")
    expect(updatedAccount?.site_type).toBe("one-api")
    expect(updatedAccount?.checkIn?.enableDetection).toBe(false)
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
          siteStatus: {
            isCheckedInToday: false,
          },
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
