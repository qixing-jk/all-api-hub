import { beforeEach, describe, expect, it, vi } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  ACCOUNT_STORAGE_KEYS,
  STORAGE_KEYS,
  USER_PREFERENCES_STORAGE_KEYS,
} from "~/services/core/storageKeys"
import { getDayKeyFromUnixSeconds } from "~/services/history/dailyBalanceHistory/dayKeys"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  TEMP_WINDOW_HEALTH_STATUS_CODES,
  type AccountStorageConfig,
  type SiteAccount,
  type SiteBookmark,
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
  markAccountDisabledInStatusMock,
  markAccountsDisabledInStatusMock,
  pruneStatusForAccountIdsMock,
} = vi.hoisted(() => ({
  mockValidateAccountConnection: vi.fn(),
  mockFetchSupportCheckIn: vi.fn(),
  mockGetSiteType: vi.fn(),
  mockRefreshAccountData: vi.fn(),
  mockFetchTodayIncome: vi.fn(),
  markAccountDisabledInStatusMock: vi.fn(),
  markAccountsDisabledInStatusMock: vi.fn(),
  pruneStatusForAccountIdsMock: vi.fn(),
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

vi.mock("~/services/siteDetection/detectSiteType", () => ({
  getSiteType: mockGetSiteType,
}))

vi.mock("~/services/checkin/autoCheckin/storage", () => ({
  autoCheckinStorage: {
    markAccountDisabledInStatus: markAccountDisabledInStatusMock,
    markAccountsDisabledInStatus: markAccountsDisabledInStatusMock,
    pruneStatusForAccountIds: pruneStatusForAccountIdsMock,
  },
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
    disabled: overrides.disabled === true,
    excludeFromTotalBalance: overrides.excludeFromTotalBalance === true,
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
    notes: overrides.notes ?? "",
    manualBalanceUsd: overrides.manualBalanceUsd,
    sub2apiAuth: overrides.sub2apiAuth,
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

const createBookmark = (
  overrides: Partial<SiteBookmark> = {},
): SiteBookmark => {
  return {
    id: overrides.id ?? "bookmark-1",
    name: overrides.name ?? "Bookmark 1",
    url: overrides.url ?? "https://bookmark.example.com",
    tagIds: overrides.tagIds ?? [],
    notes: overrides.notes ?? "",
    created_at: overrides.created_at ?? Date.now(),
    updated_at: overrides.updated_at ?? Date.now(),
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
    markAccountDisabledInStatusMock.mockReset()
    markAccountsDisabledInStatusMock.mockReset()
    pruneStatusForAccountIdsMock.mockReset()
    markAccountDisabledInStatusMock.mockResolvedValue(true)
    markAccountsDisabledInStatusMock.mockResolvedValue(true)
    pruneStatusForAccountIdsMock.mockResolvedValue(true)

    mockRefreshAccountData.mockImplementation(async (request) => ({
      success: true,
      data: {
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
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

  it("convertToDisplayData should disambiguate duplicate names only for list conversions", () => {
    const duplicateNamed = createAccount({
      id: "duplicate-a",
      site_name: "My Site",
      account_info: {
        id: 1,
        access_token: "token-a",
        username: "alice",
        quota: 100,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })
    const duplicateWithoutUsername = createAccount({
      id: "duplicate-b",
      site_name: "ｍｙ　 site",
      account_info: {
        id: 2,
        access_token: "token-b",
        username: "   ",
        quota: 100,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })
    const uniqueNamed = createAccount({
      id: "unique-c",
      site_name: "Unique Site",
      account_info: {
        id: 3,
        access_token: "token-c",
        username: "carol",
        quota: 100,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })

    const displayData = accountStorage.convertToDisplayData([
      duplicateNamed,
      duplicateWithoutUsername,
      uniqueNamed,
    ]) as any[]

    expect(displayData.map((account) => account.name)).toEqual([
      "My Site · alice",
      "ｍｙ　 site",
      "Unique Site",
    ])
  })

  it("convertToDisplayData should honor a broader duplicate-name context", () => {
    const visibleAccount = createAccount({
      id: "visible-a",
      site_name: "Shared Site",
      account_info: {
        id: 1,
        access_token: "token-a",
        username: "alice",
        quota: 100,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })
    const hiddenDuplicate = createAccount({
      id: "hidden-b",
      site_name: " shared   site ",
      disabled: true,
      account_info: {
        id: 2,
        access_token: "token-b",
        username: "bob",
        quota: 100,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })

    const displayData = accountStorage.convertToDisplayData(
      [visibleAccount],
      [visibleAccount, hiddenDuplicate],
    ) as any[]

    expect(displayData.map((account) => account.name)).toEqual([
      "Shared Site · alice",
    ])
  })

  it("convertToDisplayData single-account overload should preserve the base name", () => {
    const account = createAccount({
      site_name: "My Site",
      account_info: {
        id: 1,
        access_token: "token",
        username: "alice",
        quota: 100,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })

    const display = accountStorage.convertToDisplayData(account)

    expect(display.name).toBe("My Site")
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

  it("setPinnedList should fail closed when reading storage fails", async () => {
    const accounts = [createAccount({ id: "valid-1" })]
    seedStorage(accounts, ["valid-1"])

    const originalConfig = JSON.parse(
      JSON.stringify(storageData.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)),
    ) as AccountStorageConfig

    storageHooks.beforeGet = async (key) => {
      if (key === ACCOUNT_STORAGE_KEYS.ACCOUNTS) {
        throw new Error("storage get failed")
      }
    }

    const success = await accountStorage.setPinnedList(["missing"])

    expect(success).toBe(false)
    expect(storageData.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)).toEqual(
      originalConfig,
    )
  })

  it("getPinnedList should keep a safe default when reading storage fails", async () => {
    storageHooks.beforeGet = async (key) => {
      if (key === ACCOUNT_STORAGE_KEYS.ACCOUNTS) {
        throw new Error("storage get failed")
      }
    }

    expect(await accountStorage.getPinnedList()).toEqual([])
  })

  it("getOrderedList should keep a safe default when reading storage fails", async () => {
    storageHooks.beforeGet = async (key) => {
      if (key === ACCOUNT_STORAGE_KEYS.ACCOUNTS) {
        throw new Error("storage get failed")
      }
    }

    expect(await accountStorage.getOrderedList()).toEqual([])
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
    vi.useFakeTimers()
    const fixedNow = new Date(2026, 0, 2, 10, 0, 0)
    vi.setSystemTime(fixedNow)

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

    try {
      const today = fixedNow.toISOString().split("T")[0]
      const success = await accountStorage.markAccountAsSiteCheckedIn("check-1")

      expect(success).toBe(true)

      const updatedConfig = storageData.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)
      const updatedAccount = updatedConfig?.accounts.find(
        (acc: { id: string }) => acc.id === "check-1",
      )

      expect(updatedAccount?.checkIn?.siteStatus?.isCheckedInToday).toBe(true)
      expect(updatedAccount?.checkIn?.siteStatus?.lastCheckInDate).toBe(today)
      expect(updatedAccount?.checkIn?.siteStatus?.lastDetectedAt).toBe(
        fixedNow.getTime(),
      )
    } finally {
      vi.useRealTimers()
    }
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

  it("markAccountAsSiteCheckedIn returns false for missing or disabled accounts", async () => {
    seedStorage([
      createAccount({
        id: "disabled-check-in",
        disabled: true,
      }),
    ])

    await expect(
      accountStorage.markAccountAsSiteCheckedIn("missing-account"),
    ).resolves.toBe(false)
    await expect(
      accountStorage.markAccountAsSiteCheckedIn("disabled-check-in"),
    ).resolves.toBe(false)
  })

  it("markAccountAsCustomCheckedIn returns false for missing, disabled, or invalid custom URLs", async () => {
    seedStorage([
      createAccount({
        id: "disabled-custom-check-in",
        disabled: true,
        checkIn: {
          enableDetection: true,
          customCheckIn: {
            url: "https://example.com/check",
            isCheckedInToday: false,
          },
        },
      }),
      createAccount({
        id: "empty-custom-url",
        checkIn: {
          enableDetection: true,
          customCheckIn: {
            url: "   ",
            isCheckedInToday: false,
          },
        },
      }),
    ])

    await expect(
      accountStorage.markAccountAsCustomCheckedIn("missing-account"),
    ).resolves.toBe(false)
    await expect(
      accountStorage.markAccountAsCustomCheckedIn("disabled-custom-check-in"),
    ).resolves.toBe(false)
    await expect(
      accountStorage.markAccountAsCustomCheckedIn("empty-custom-url"),
    ).resolves.toBe(false)
  })

  it("refreshAllAccounts summarizes refreshed, reused, and failed refreshes", async () => {
    seedStorage([
      createAccount({ id: "refresh-1" }),
      createAccount({ id: "refresh-2" }),
      createAccount({ id: "refresh-3" }),
    ])
    storageData.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      showTodayCashflow: false,
    })

    const refreshAccountSpy = vi
      .spyOn(accountStorage, "refreshAccount")
      .mockResolvedValueOnce({
        refreshed: true,
        account: { last_sync_time: 100 },
      } as any)
      .mockResolvedValueOnce({
        refreshed: false,
        account: { last_sync_time: 250 },
      } as any)
      .mockRejectedValueOnce(new Error("refresh exploded"))

    try {
      const result = await accountStorage.refreshAllAccounts()

      expect(refreshAccountSpy).toHaveBeenNthCalledWith(1, "refresh-1", false, {
        includeTodayCashflow: false,
      })
      expect(refreshAccountSpy).toHaveBeenNthCalledWith(2, "refresh-2", false, {
        includeTodayCashflow: false,
      })
      expect(refreshAccountSpy).toHaveBeenNthCalledWith(3, "refresh-3", false, {
        includeTodayCashflow: false,
      })
      expect(result).toEqual({
        success: 2,
        failed: 1,
        latestSyncTime: 250,
        refreshedCount: 1,
      })
    } finally {
      refreshAccountSpy.mockRestore()
    }
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

  it("checkUrlExists should fail closed for blank and malformed URLs", async () => {
    seedStorage([createAccount({ id: "origin-match" })])

    await expect(accountStorage.checkUrlExists("")).resolves.toBeNull()
    await expect(accountStorage.checkUrlExists("not a url")).resolves.toBeNull()
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
    expect(pruneStatusForAccountIdsMock).toHaveBeenCalledWith(["to-delete"])
  })

  it("deleteAccount should surface a missing-account error", async () => {
    seedStorage([createAccount({ id: "present" })])

    await expect(accountStorage.deleteAccount("missing")).rejects.toThrow(
      "messages:storage.accountNotFound",
    )
  })

  it("deleteAccounts should de-dupe ids and prune pinned and ordered references", async () => {
    const accounts = [
      createAccount({ id: "bulk-a" }),
      createAccount({ id: "bulk-b" }),
      createAccount({ id: "bulk-c" }),
    ]
    storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
      accounts,
      bookmarks: [],
      pinnedAccountIds: ["bulk-b", "bulk-c", "missing"],
      orderedAccountIds: ["bulk-a", "bulk-b", "bulk-c", "missing"],
      last_updated: Date.now(),
    } satisfies AccountStorageConfig)

    const result = await accountStorage.deleteAccounts([
      "bulk-b",
      "bulk-c",
      "bulk-b",
      "",
    ])

    expect(result).toEqual({
      deletedCount: 2,
      deletedIds: ["bulk-b", "bulk-c"],
    })

    const config = storageData.get(
      ACCOUNT_STORAGE_KEYS.ACCOUNTS,
    ) as AccountStorageConfig
    expect(config.accounts.map((account) => account.id)).toEqual(["bulk-a"])
    expect(config.pinnedAccountIds).toEqual(["missing"])
    expect(config.orderedAccountIds).toEqual(["bulk-a", "missing"])
    expect(pruneStatusForAccountIdsMock).toHaveBeenCalledWith([
      "bulk-b",
      "bulk-c",
    ])
  })

  it("deleteAccounts should no-op when no surviving account ids match", async () => {
    const accounts = [createAccount({ id: "bulk-a" })]
    const existingConfig: AccountStorageConfig = {
      accounts,
      bookmarks: [],
      pinnedAccountIds: ["bulk-a"],
      orderedAccountIds: ["bulk-a"],
      last_updated: 123,
    }
    storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, existingConfig)

    const result = await accountStorage.deleteAccounts(["missing", "missing"])

    expect(result).toEqual({ deletedCount: 0, deletedIds: [] })
    expect(storageData.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)).toEqual(
      existingConfig,
    )
  })

  it("setAccountDisabled should persist disable and re-enable state", async () => {
    const account = createAccount({
      id: "toggle-disabled",
      disabled: false,
    })
    seedStorage([account])

    expect(
      await accountStorage.setAccountDisabled("toggle-disabled", true),
    ).toBe(true)
    expect(
      (await accountStorage.getAccountById("toggle-disabled"))?.disabled,
    ).toBe(true)
    expect(markAccountDisabledInStatusMock).toHaveBeenCalledWith(
      "toggle-disabled",
    )

    expect(
      await accountStorage.setAccountDisabled("toggle-disabled", false),
    ).toBe(true)
    expect(
      (await accountStorage.getAccountById("toggle-disabled"))?.disabled,
    ).toBe(false)
    expect(markAccountDisabledInStatusMock).toHaveBeenCalledTimes(1)
  })

  it("setAccountDisabled should still persist when auto check-in marking fails", async () => {
    const account = createAccount({
      id: "toggle-disabled-warning",
      disabled: false,
    })
    seedStorage([account])
    markAccountDisabledInStatusMock.mockResolvedValueOnce(false)

    expect(
      await accountStorage.setAccountDisabled("toggle-disabled-warning", true),
    ).toBe(true)
    expect(
      (await accountStorage.getAccountById("toggle-disabled-warning"))
        ?.disabled,
    ).toBe(true)
    expect(markAccountDisabledInStatusMock).toHaveBeenCalledWith(
      "toggle-disabled-warning",
    )
  })

  it("setAccountsDisabled should update only matching accounts that need changes", async () => {
    const accounts = [
      createAccount({ id: "disable-a", disabled: false }),
      createAccount({ id: "disable-b", disabled: true }),
      createAccount({ id: "disable-c", disabled: false }),
    ]
    seedStorage(accounts)

    const result = await accountStorage.setAccountsDisabled(
      ["disable-a", "disable-b", "disable-a", "missing", ""],
      true,
    )

    expect(result).toEqual({
      updatedCount: 1,
      updatedIds: ["disable-a"],
    })
    expect((await accountStorage.getAccountById("disable-a"))?.disabled).toBe(
      true,
    )
    expect((await accountStorage.getAccountById("disable-b"))?.disabled).toBe(
      true,
    )
    expect((await accountStorage.getAccountById("disable-c"))?.disabled).toBe(
      false,
    )
    expect(markAccountsDisabledInStatusMock).toHaveBeenCalledWith([
      { accountId: "disable-a" },
    ])
  })

  it("setAccountsDisabled should still return updates when bulk auto check-in marking fails", async () => {
    const accounts = [
      createAccount({ id: "disable-warning-a", disabled: false }),
      createAccount({ id: "disable-warning-b", disabled: false }),
    ]
    seedStorage(accounts)
    markAccountsDisabledInStatusMock.mockResolvedValueOnce(false)

    const result = await accountStorage.setAccountsDisabled(
      ["disable-warning-a", "disable-warning-b"],
      true,
    )

    expect(result).toEqual({
      updatedCount: 2,
      updatedIds: ["disable-warning-a", "disable-warning-b"],
    })
    expect(markAccountsDisabledInStatusMock).toHaveBeenCalledWith([
      { accountId: "disable-warning-a" },
      { accountId: "disable-warning-b" },
    ])
  })

  it("setAccountsDisabled should not mutate auto check-in status when re-enabling accounts", async () => {
    const accounts = [
      createAccount({ id: "enable-a", disabled: true }),
      createAccount({ id: "enable-b", disabled: false }),
    ]
    seedStorage(accounts)

    const result = await accountStorage.setAccountsDisabled(
      ["enable-a", "enable-b"],
      false,
    )

    expect(result).toEqual({
      updatedCount: 1,
      updatedIds: ["enable-a"],
    })
    expect(markAccountsDisabledInStatusMock).not.toHaveBeenCalled()
  })

  it("setAccountsDisabled should no-op for empty id input", async () => {
    expect(await accountStorage.setAccountsDisabled([], true)).toEqual({
      updatedCount: 0,
      updatedIds: [],
    })
    expect(markAccountsDisabledInStatusMock).not.toHaveBeenCalled()
  })

  it("setAccountDisabled should fail closed for missing accounts", async () => {
    seedStorage([createAccount({ id: "present" })])

    await expect(
      accountStorage.setAccountDisabled("missing", true),
    ).resolves.toBe(false)
    expect(markAccountDisabledInStatusMock).not.toHaveBeenCalled()
  })

  it("updateSyncTime should persist a fresh last_sync_time for the target account", async () => {
    vi.useFakeTimers()
    const fixedNow = new Date("2026-03-30T12:34:56.000Z")

    try {
      const account = createAccount({
        id: "sync-target",
        last_sync_time: 1000,
        updated_at: 2000,
      })
      const otherAccount = createAccount({
        id: "sync-other",
        last_sync_time: 3000,
        updated_at: 4000,
      })
      seedStorage([account, otherAccount])

      vi.setSystemTime(fixedNow)

      expect(await accountStorage.updateSyncTime("sync-target")).toBe(true)

      const updatedTarget = await accountStorage.getAccountById("sync-target")
      const untouchedOther = await accountStorage.getAccountById("sync-other")

      expect(updatedTarget?.last_sync_time).toBe(fixedNow.getTime())
      expect(updatedTarget?.updated_at).toBe(fixedNow.getTime())
      expect(untouchedOther?.last_sync_time).toBe(3000)
      expect(untouchedOther?.updated_at).toBe(4000)
    } finally {
      vi.useRealTimers()
    }
  })

  it("getAllAccounts should fail closed when storage reads throw", async () => {
    storageHooks.beforeGet = async (key) => {
      if (key === ACCOUNT_STORAGE_KEYS.ACCOUNTS) {
        throw new Error("read failed")
      }
    }

    await expect(accountStorage.getAllAccounts()).resolves.toEqual([])
  })

  it("getAccountById should return null when the underlying read fails", async () => {
    storageHooks.beforeGet = async (key) => {
      if (key === ACCOUNT_STORAGE_KEYS.ACCOUNTS) {
        throw new Error("read failed")
      }
    }

    await expect(accountStorage.getAccountById("missing")).resolves.toBeNull()
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

  it("unpinAccount should be a no-op when the account is already absent from the pinned list", async () => {
    storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
      accounts: [createAccount({ id: "a-1" }), createAccount({ id: "a-2" })],
      bookmarks: [],
      pinnedAccountIds: ["a-1"],
      orderedAccountIds: [],
      last_updated: Date.now(),
    } satisfies AccountStorageConfig)

    await expect(accountStorage.unpinAccount("a-2")).resolves.toBe(true)
    expect(await accountStorage.getPinnedList()).toEqual(["a-1"])
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

  it("refreshAccount should skip network refreshes when the min interval has not elapsed", async () => {
    const fixedNow = new Date("2026-03-30T12:00:00.000Z")
    vi.useFakeTimers()

    try {
      vi.setSystemTime(fixedNow)
      storageData.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
        ...DEFAULT_PREFERENCES,
        accountAutoRefresh: {
          ...DEFAULT_PREFERENCES.accountAutoRefresh,
          minInterval: 60,
        },
      })

      const account = createAccount({
        id: "too-soon",
        last_sync_time: fixedNow.getTime() - 15_000,
      })
      seedStorage([account])

      const result = await accountStorage.refreshAccount("too-soon", false)

      expect(result).toEqual(
        expect.objectContaining({
          refreshed: false,
          account: expect.objectContaining({ id: "too-soon" }),
        }),
      )
      expect(mockRefreshAccountData).not.toHaveBeenCalled()
      expect(mockFetchTodayIncome).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
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
    expect(mockFetchTodayIncome).not.toHaveBeenCalled()
    const updatedAccount = await accountStorage.getAccountById("known-site")
    expect(updatedAccount?.site_type).toBe("one-api")
    expect(updatedAccount?.checkIn?.enableDetection).toBe(false)
  })

  it("refreshAccount should continue when check-in support detection throws", async () => {
    const account = createAccount({
      id: "support-check-fails",
      site_url: "https://support.example.com",
      site_type: "one-api",
      checkIn: {
        enableDetection: true,
        autoCheckInEnabled: true,
        siteStatus: { isCheckedInToday: false },
      },
    })
    seedStorage([account])

    mockFetchSupportCheckIn.mockRejectedValueOnce(new Error("support failed"))

    const result = await accountStorage.refreshAccount(
      "support-check-fails",
      true,
    )
    const updatedAccount = await accountStorage.getAccountById(
      "support-check-fails",
    )

    expect(result).toEqual(
      expect.objectContaining({
        refreshed: true,
      }),
    )
    expect(mockRefreshAccountData).toHaveBeenCalledWith(
      expect.objectContaining({
        checkIn: expect.objectContaining({
          enableDetection: true,
        }),
      }),
    )
    expect(updatedAccount?.health?.status).toBe(SiteHealthStatus.Healthy)
  })

  it("refreshAccount should persist today_income from refreshAccountData", async () => {
    const account = createAccount({
      id: "income-sync",
      site_url: "https://income.example.com",
      site_type: "one-api",
      checkIn: { enableDetection: true },
    })
    seedStorage([account])

    mockRefreshAccountData.mockResolvedValueOnce({
      success: true,
      data: {
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 123_456,
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

    await accountStorage.refreshAccount("income-sync", true)

    const updatedAccount = await accountStorage.getAccountById("income-sync")
    expect(updatedAccount?.account_info.today_income).toBe(123_456)
    expect(mockFetchTodayIncome).not.toHaveBeenCalled()
  })

  it("refreshAccount should persist Sub2API refresh-token auth updates", async () => {
    const account = createAccount({
      id: "sub2api-refresh",
      site_url: "https://sub2.example.com",
      site_type: "sub2api",
      account_info: {
        id: 1,
        username: "alice",
        access_token: "old-jwt",
        quota: 1_000_000,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      sub2apiAuth: {
        refreshToken: "old-refresh",
        tokenExpiresAt: 123,
      },
    })
    seedStorage([account])

    mockFetchSupportCheckIn.mockResolvedValue(false)
    mockRefreshAccountData.mockResolvedValueOnce({
      success: true,
      data: {
        quota: 42,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
        checkIn: {
          enableDetection: false,
        },
      },
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: "",
      },
      authUpdate: {
        accessToken: "new-jwt",
        sub2apiAuth: {
          refreshToken: "new-refresh",
          tokenExpiresAt: 456,
        },
        userId: 1,
        username: "alice",
      },
    })

    await accountStorage.refreshAccount("sub2api-refresh", true)

    expect(mockRefreshAccountData).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://sub2.example.com",
        auth: expect.objectContaining({
          refreshToken: "old-refresh",
          tokenExpiresAt: 123,
        }),
      }),
    )

    const updatedAccount =
      await accountStorage.getAccountById("sub2api-refresh")
    expect(updatedAccount?.account_info.access_token).toBe("new-jwt")
    expect(updatedAccount?.sub2apiAuth).toEqual({
      refreshToken: "new-refresh",
      tokenExpiresAt: 456,
    })
  })

  it("refreshAccount ignores blank auth updates and invalid Sub2API token refresh payloads", async () => {
    const account = createAccount({
      id: "sub2api-blank-auth",
      site_url: "https://sub2.example.com",
      site_type: "sub2api",
      account_info: {
        id: 7,
        access_token: "old-jwt",
        username: "old-user",
        quota: 1_000_000,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      sub2apiAuth: {
        refreshToken: "old-refresh",
        tokenExpiresAt: 123,
      },
    })
    seedStorage([account])

    mockFetchSupportCheckIn.mockResolvedValue(false)
    mockRefreshAccountData.mockResolvedValueOnce({
      success: true,
      data: {
        quota: 42,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
        checkIn: {
          enableDetection: false,
        },
      },
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: "",
      },
      authUpdate: {
        accessToken: "   ",
        userId: Number.NaN,
        username: " ",
        sub2apiAuth: {
          refreshToken: "   ",
          tokenExpiresAt: Number.NaN,
        },
      },
    })

    await accountStorage.refreshAccount("sub2api-blank-auth", true)

    const updatedAccount =
      await accountStorage.getAccountById("sub2api-blank-auth")
    expect(updatedAccount?.account_info.access_token).toBe("old-jwt")
    expect(updatedAccount?.account_info.id).toBe(7)
    expect(updatedAccount?.account_info.username).toBe("old-user")
    expect(updatedAccount?.sub2apiAuth).toEqual({
      refreshToken: "old-refresh",
      tokenExpiresAt: 123,
    })
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
        today_income: 0,
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

  it("refreshAccount should preserve manual balance quota when set", async () => {
    const manualBalanceUsd = "1.23"
    const manualQuota = Math.round(
      Number.parseFloat(manualBalanceUsd) *
        UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
    )
    const account = createAccount({
      id: "manual-quota",
      manualBalanceUsd,
    })
    account.account_info.quota = manualQuota
    seedStorage([account])

    await accountStorage.refreshAccount("manual-quota", true)

    const updatedAccount = await accountStorage.getAccountById("manual-quota")
    expect(updatedAccount?.manualBalanceUsd).toBe(manualBalanceUsd)
    expect(updatedAccount?.account_info.quota).toBe(manualQuota)
  })

  it("refreshAccount captures daily balance snapshots when enabled", async () => {
    vi.useFakeTimers()
    const fixedNow = new Date(Date.UTC(2026, 1, 7, 12, 0, 0))
    vi.setSystemTime(fixedNow)

    try {
      const account = createAccount({ id: "balance-history" })
      seedStorage([account])

      storageData.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
        ...DEFAULT_PREFERENCES,
        showTodayCashflow: true,
        balanceHistory: {
          enabled: true,
          endOfDayCapture: { enabled: false },
          retentionDays: 365,
        },
      })

      mockRefreshAccountData.mockResolvedValueOnce({
        success: true,
        data: {
          quota: 123,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 7,
          today_requests_count: 0,
          today_income: 5,
          checkIn: {
            enableDetection: true,
            siteStatus: { isCheckedInToday: false },
          },
        },
        healthStatus: {
          status: SiteHealthStatus.Healthy,
          message: "",
          code: undefined,
        },
      })

      await accountStorage.refreshAccount("balance-history", true)

      const nowUnixSeconds = Math.floor(Date.now() / 1000)
      const dayKey = getDayKeyFromUnixSeconds(nowUnixSeconds)
      const stored = storageData.get(
        STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE,
      ) as any

      expect(
        stored?.snapshotsByAccountId?.["balance-history"]?.[dayKey],
      ).toEqual(
        expect.objectContaining({
          quota: 123,
          today_income: 5,
          today_quota_consumption: 7,
          source: "refresh",
          capturedAt: fixedNow.getTime(),
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it("refreshAccount captures quota but leaves cashflow null when showTodayCashflow is disabled", async () => {
    vi.useFakeTimers()
    const fixedNow = new Date(Date.UTC(2026, 1, 7, 12, 0, 0))
    vi.setSystemTime(fixedNow)

    try {
      const account = createAccount({ id: "balance-history-no-cashflow" })
      seedStorage([account])

      storageData.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
        ...DEFAULT_PREFERENCES,
        showTodayCashflow: false,
        balanceHistory: {
          enabled: true,
          endOfDayCapture: { enabled: false },
          retentionDays: 365,
        },
      })

      mockRefreshAccountData.mockResolvedValueOnce({
        success: true,
        data: {
          quota: 456,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
          checkIn: {
            enableDetection: true,
            siteStatus: { isCheckedInToday: false },
          },
        },
        healthStatus: {
          status: SiteHealthStatus.Healthy,
          message: "",
          code: undefined,
        },
      })

      await accountStorage.refreshAccount("balance-history-no-cashflow", true)

      const nowUnixSeconds = Math.floor(Date.now() / 1000)
      const dayKey = getDayKeyFromUnixSeconds(nowUnixSeconds)
      const stored = storageData.get(
        STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE,
      ) as any

      expect(
        stored?.snapshotsByAccountId?.["balance-history-no-cashflow"]?.[dayKey],
      ).toEqual(
        expect.objectContaining({
          quota: 456,
          today_income: null,
          today_quota_consumption: null,
          source: "refresh",
          capturedAt: fixedNow.getTime(),
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it("refreshAccount skips snapshot capture when refresh fails", async () => {
    const account = createAccount({ id: "balance-history-failed" })
    seedStorage([account])

    storageData.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      balanceHistory: {
        enabled: true,
        endOfDayCapture: { enabled: false },
        retentionDays: 365,
      },
    })

    mockRefreshAccountData.mockResolvedValueOnce({
      success: false,
      healthStatus: {
        status: SiteHealthStatus.Error,
        message: "fail",
        code: undefined,
      },
    })

    await accountStorage.refreshAccount("balance-history-failed", true)

    const stored = storageData.get(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE)
    expect(stored).toBeUndefined()
  })

  it("refreshAccount marks the account health as unknown when refresh throws", async () => {
    const originalSyncTime = 1_700_000_000_000
    const account = createAccount({
      id: "refresh-throws",
      last_sync_time: originalSyncTime,
      health: {
        status: SiteHealthStatus.Healthy,
      },
    })
    seedStorage([account])

    mockRefreshAccountData.mockRejectedValueOnce(new Error("network down"))

    const result = await accountStorage.refreshAccount("refresh-throws", true)

    expect(result).toBeNull()

    const stored = storageData.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS) as
      | AccountStorageConfig
      | undefined
    const updated = stored?.accounts.find(
      (item) => item.id === "refresh-throws",
    )

    expect(updated?.health).toEqual({
      status: SiteHealthStatus.Unknown,
      reason: "network down",
      code: undefined,
    })
    expect(updated?.last_sync_time).toBeGreaterThan(originalSyncTime)
  })
})

describe("accountStorage bookmarks", () => {
  beforeEach(() => {
    storageData.clear()
    storageHooks.beforeGet = async () => {}
  })

  it("getAllBookmarks falls back to an empty list when bookmark reads fail", async () => {
    storageHooks.beforeGet = async (key) => {
      if (key === ACCOUNT_STORAGE_KEYS.ACCOUNTS) {
        throw new Error("bookmark read failed")
      }
    }

    await expect(accountStorage.getAllBookmarks()).resolves.toEqual([])
  })

  it("getBookmarkById returns null for empty ids and missing bookmarks", async () => {
    storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
      accounts: [createAccount({ id: "a-1" })],
      bookmarks: [createBookmark({ id: "b-1" })],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: Date.now(),
    } satisfies AccountStorageConfig)

    await expect(accountStorage.getBookmarkById("")).resolves.toBeNull()
    await expect(accountStorage.getBookmarkById("missing")).resolves.toBeNull()
  })

  it("addBookmark persists a bookmark with normalized fields and timestamps", async () => {
    vi.useFakeTimers()
    const fixedNow = new Date(2026, 1, 5, 12, 0, 0)
    vi.setSystemTime(fixedNow)

    try {
      seedStorage([createAccount({ id: "a-1" })])

      const id = await accountStorage.addBookmark({
        name: "  Console  ",
        url: "  https://example.com/console  ",
        tagIds: [" t1 ", "t1", 123 as any, "" as any],
        notes: null as any,
      })

      expect(id).toMatch(/^bookmark-/)

      const saved = storageData.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS) as
        | AccountStorageConfig
        | undefined

      expect(saved?.bookmarks).toHaveLength(1)
      expect(saved?.bookmarks?.[0]).toEqual(
        expect.objectContaining({
          id,
          name: "Console",
          url: "https://example.com/console",
          tagIds: ["t1"],
          notes: "",
          created_at: fixedNow.getTime(),
          updated_at: fixedNow.getTime(),
        }),
      )

      // Persisted config always includes array fields.
      expect(Array.isArray(saved?.bookmarks)).toBe(true)
      expect(Array.isArray(saved?.orderedAccountIds)).toBe(true)
      expect(Array.isArray(saved?.pinnedAccountIds)).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it("addBookmark rejects missing required fields", async () => {
    seedStorage([createAccount({ id: "a-1" })])

    await expect(
      accountStorage.addBookmark({
        name: "   ",
        url: "https://example.com",
      }),
    ).rejects.toThrow("messages:errors.validation.bookmarkNameRequired")

    await expect(
      accountStorage.addBookmark({
        name: "Console",
        url: "   ",
      }),
    ).rejects.toThrow("messages:errors.validation.bookmarkUrlRequired")
  })

  it("addBookmark regenerates the id when the first generated bookmark id already exists", async () => {
    seedStorage([createAccount({ id: "a-1" })])

    storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
      accounts: [createAccount({ id: "a-1" })],
      bookmarks: [createBookmark({ id: "bookmark-existing" })],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: Date.now(),
    } satisfies AccountStorageConfig)

    const generateBookmarkIdSpy = vi
      .spyOn(accountStorage as never, "generateBookmarkId" as never)
      .mockReturnValueOnce("bookmark-existing" as never)
      .mockReturnValueOnce("bookmark-new" as never)

    try {
      const id = await accountStorage.addBookmark({
        name: "Console",
        url: "https://example.com/console",
      })

      expect(id).toBe("bookmark-new")

      const saved = storageData.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS) as
        | AccountStorageConfig
        | undefined
      expect(saved?.bookmarks.map((bookmark) => bookmark.id)).toEqual([
        "bookmark-existing",
        "bookmark-new",
      ])
    } finally {
      generateBookmarkIdSpy.mockRestore()
    }
  })

  it("updateBookmark preserves created_at and updates updated_at", async () => {
    vi.useFakeTimers()
    const initialNow = new Date(2026, 1, 5, 12, 0, 0)
    vi.setSystemTime(initialNow)

    const bookmark = createBookmark({
      id: "b-1",
      name: "Old",
      url: "https://example.com/old",
      tagIds: ["t1"],
      notes: "old",
      created_at: initialNow.getTime(),
      updated_at: initialNow.getTime(),
    })

    storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
      accounts: [createAccount({ id: "a-1" })],
      bookmarks: [bookmark],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: initialNow.getTime(),
    } satisfies AccountStorageConfig)

    try {
      const updatedNow = new Date(2026, 1, 5, 12, 5, 0)
      vi.setSystemTime(updatedNow)

      const success = await accountStorage.updateBookmark("b-1", {
        name: "  New  ",
        url: " https://example.com/new ",
        tagIds: ["t2", "t2", ""],
        notes: "",
      })

      expect(success).toBe(true)

      const saved = storageData.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS) as
        | AccountStorageConfig
        | undefined

      expect(saved?.bookmarks).toHaveLength(1)
      expect(saved?.bookmarks?.[0]).toEqual(
        expect.objectContaining({
          id: "b-1",
          name: "New",
          url: "https://example.com/new",
          tagIds: ["t2"],
          notes: "",
          created_at: initialNow.getTime(),
          updated_at: updatedNow.getTime(),
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it("deleteBookmark removes bookmark id from pinned and ordered lists", async () => {
    const bookmark = createBookmark({ id: "b-1" })

    storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
      accounts: [createAccount({ id: "a-1" })],
      bookmarks: [bookmark],
      pinnedAccountIds: ["a-1", "b-1"],
      orderedAccountIds: ["b-1", "a-1"],
      last_updated: Date.now(),
    } satisfies AccountStorageConfig)

    const success = await accountStorage.deleteBookmark("b-1")
    expect(success).toBe(true)

    const saved = storageData.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS) as
      | AccountStorageConfig
      | undefined

    expect(saved?.bookmarks).toEqual([])
    expect(saved?.pinnedAccountIds).toEqual(["a-1"])
    expect(saved?.orderedAccountIds).toEqual(["a-1"])
  })

  it("updateBookmark and deleteBookmark fail closed when the bookmark is missing", async () => {
    storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
      accounts: [createAccount({ id: "a-1" })],
      bookmarks: [createBookmark({ id: "b-1" })],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: Date.now(),
    } satisfies AccountStorageConfig)

    await expect(
      accountStorage.updateBookmark("missing", { name: "Next" }),
    ).resolves.toBe(false)
    await expect(accountStorage.deleteBookmark("missing")).resolves.toBe(false)
  })

  it("setOrderedListSubset updates bookmark ids without dropping account ids", async () => {
    storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
      accounts: [
        createAccount({ id: "a-1" }),
        createAccount({ id: "a-2" }),
        createAccount({ id: "a-3" }),
      ],
      bookmarks: [createBookmark({ id: "b-1" }), createBookmark({ id: "b-2" })],
      pinnedAccountIds: [],
      orderedAccountIds: ["a-1", "b-1", "a-2", "b-2", "a-3"],
      last_updated: Date.now(),
    } satisfies AccountStorageConfig)

    const success = await accountStorage.setOrderedListSubset({
      entryType: "bookmark",
      ids: ["b-2", "b-1", "missing"],
    })

    expect(success).toBe(true)
    expect(await accountStorage.getOrderedList()).toEqual([
      "a-1",
      "b-2",
      "a-2",
      "b-1",
      "a-3",
    ])
  })

  it("setPinnedListSubset updates bookmark pinned order while preserving account pinned order", async () => {
    storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
      accounts: [createAccount({ id: "a-1" }), createAccount({ id: "a-2" })],
      bookmarks: [createBookmark({ id: "b-1" }), createBookmark({ id: "b-2" })],
      pinnedAccountIds: ["a-1", "b-1", "a-2", "b-2"],
      orderedAccountIds: [],
      last_updated: Date.now(),
    } satisfies AccountStorageConfig)

    const success = await accountStorage.setPinnedListSubset({
      entryType: "bookmark",
      ids: ["b-2", "b-1"],
    })

    expect(success).toBe(true)
    expect(await accountStorage.getPinnedList()).toEqual([
      "a-1",
      "b-2",
      "a-2",
      "b-1",
    ])
  })

  it("setPinnedListSubset updates account pinned order while preserving bookmark pinned order", async () => {
    storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
      accounts: [
        createAccount({ id: "a-1" }),
        createAccount({ id: "a-2" }),
        createAccount({ id: "a-3" }),
      ],
      bookmarks: [createBookmark({ id: "b-1" }), createBookmark({ id: "b-2" })],
      pinnedAccountIds: ["a-1", "b-1", "a-2", "b-2", "a-3"],
      orderedAccountIds: [],
      last_updated: Date.now(),
    } satisfies AccountStorageConfig)

    const success = await accountStorage.setPinnedListSubset({
      entryType: "account",
      ids: ["a-3", "a-1"],
    })

    expect(success).toBe(true)
    expect(await accountStorage.getPinnedList()).toEqual([
      "a-3",
      "b-1",
      "a-1",
      "b-2",
      "a-2",
    ])
  })

  describe("replaceIdListSubset (via set*ListSubset APIs)", () => {
    it("appends subset ids when existingIds is empty", async () => {
      storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
        accounts: [createAccount({ id: "a-1" })],
        bookmarks: [
          createBookmark({ id: "b-1" }),
          createBookmark({ id: "b-2" }),
        ],
        pinnedAccountIds: [],
        orderedAccountIds: [],
        last_updated: Date.now(),
      } satisfies AccountStorageConfig)

      const success = await accountStorage.setOrderedListSubset({
        entryType: "bookmark",
        ids: ["b-2", "b-1"],
      })

      expect(success).toBe(true)
      expect(await accountStorage.getOrderedList()).toEqual(["b-2", "b-1"])
    })

    it("is a no-op when nextSubsetIds is empty", async () => {
      storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
        accounts: [createAccount({ id: "a-1" }), createAccount({ id: "a-2" })],
        bookmarks: [
          createBookmark({ id: "b-1" }),
          createBookmark({ id: "b-2" }),
        ],
        pinnedAccountIds: [],
        orderedAccountIds: ["a-1", "b-1", "a-2", "b-2"],
        last_updated: Date.now(),
      } satisfies AccountStorageConfig)

      const success = await accountStorage.setOrderedListSubset({
        entryType: "bookmark",
        ids: [],
      })

      expect(success).toBe(true)
      expect(await accountStorage.getOrderedList()).toEqual([
        "a-1",
        "b-1",
        "a-2",
        "b-2",
      ])
    })

    it("adds subset ids that are missing from existingIds", async () => {
      storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
        accounts: [createAccount({ id: "a-1" }), createAccount({ id: "a-2" })],
        bookmarks: [
          createBookmark({ id: "b-1" }),
          createBookmark({ id: "b-2" }),
        ],
        pinnedAccountIds: [],
        orderedAccountIds: ["a-1", "a-2"],
        last_updated: Date.now(),
      } satisfies AccountStorageConfig)

      const success = await accountStorage.setOrderedListSubset({
        entryType: "bookmark",
        ids: ["b-2"],
      })

      expect(success).toBe(true)
      expect(await accountStorage.getOrderedList()).toEqual([
        "a-1",
        "a-2",
        "b-2",
      ])
    })

    it("de-dupes duplicates in existingIds and nextSubsetIds", async () => {
      storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
        accounts: [createAccount({ id: "a-1" })],
        bookmarks: [
          createBookmark({ id: "b-1" }),
          createBookmark({ id: "b-2" }),
        ],
        pinnedAccountIds: [],
        orderedAccountIds: ["a-1", "b-1", "a-1", "b-1", "b-1"],
        last_updated: Date.now(),
      } satisfies AccountStorageConfig)

      const success = await accountStorage.setOrderedListSubset({
        entryType: "bookmark",
        ids: ["b-2", "b-2", "b-1", "b-1"],
      })

      expect(success).toBe(true)
      expect(await accountStorage.getOrderedList()).toEqual([
        "a-1",
        "b-2",
        "b-1",
      ])
    })

    it("preserves non-subset ids while replacing subset slots in order", async () => {
      storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
        accounts: [
          createAccount({ id: "a-1" }),
          createAccount({ id: "a-2" }),
          createAccount({ id: "a-3" }),
        ],
        bookmarks: [
          createBookmark({ id: "b-1" }),
          createBookmark({ id: "b-2" }),
        ],
        pinnedAccountIds: [],
        orderedAccountIds: ["a-1", "b-1", "a-2", "b-2", "a-3"],
        last_updated: Date.now(),
      } satisfies AccountStorageConfig)

      const success = await accountStorage.setOrderedListSubset({
        entryType: "account",
        ids: ["a-3", "a-1"],
      })

      expect(success).toBe(true)
      expect(await accountStorage.getOrderedList()).toEqual([
        "a-3",
        "b-1",
        "a-1",
        "b-2",
        "a-2",
      ])
    })
  })

  describe("export and import resilience", () => {
    it("getAccountByBaseUrlAndUserId migrates matched legacy accounts before returning", async () => {
      const legacyAccount = createAccount({
        id: "legacy-target",
        site_url: "https://legacy.example.com",
        account_info: {
          id: 321,
          access_token: "token",
          username: "legacy-user",
          quota: 100,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
        },
      })
      delete (legacyAccount as any).disabled
      delete (legacyAccount as any).excludeFromTotalBalance
      seedStorage([legacyAccount])

      const found = await accountStorage.getAccountByBaseUrlAndUserId(
        "https://legacy.example.com",
        321,
      )

      expect(found?.id).toBe("legacy-target")
      expect(found?.disabled).toBe(false)
      expect(found?.excludeFromTotalBalance).toBe(false)

      const persisted = storageData.get(
        ACCOUNT_STORAGE_KEYS.ACCOUNTS,
      ) as AccountStorageConfig
      expect(persisted.accounts[0].disabled).toBe(false)
      expect(persisted.accounts[0].excludeFromTotalBalance).toBe(false)
    })

    it("exportData falls back to a safe default config when storage reads fail", async () => {
      seedStorage([createAccount({ id: "existing-1" })])

      let getCalls = 0
      storageHooks.beforeGet = async (key) => {
        if (key === ACCOUNT_STORAGE_KEYS.ACCOUNTS) {
          getCalls += 1
          if (getCalls > 1) {
            throw new Error("storage get failed")
          }
        }
      }

      const exported = await accountStorage.exportData()

      expect(exported.accounts).toEqual([])
      expect(exported.bookmarks).toEqual([])
      expect(exported.pinnedAccountIds).toEqual([])
      expect(exported.orderedAccountIds).toEqual([])
    })

    it("importData restores the backup config when the migrated write fails", async () => {
      storageHooks.beforeGet = async () => {}

      const backupAccount = createAccount({ id: "backup-1" })
      const backupBookmark = createBookmark({ id: "bookmark-1" })
      storageData.set(ACCOUNT_STORAGE_KEYS.ACCOUNTS, {
        accounts: [backupAccount],
        bookmarks: [backupBookmark],
        pinnedAccountIds: ["backup-1", "bookmark-1"],
        orderedAccountIds: ["bookmark-1", "backup-1"],
        last_updated: Date.now(),
      } satisfies AccountStorageConfig)

      let setCalls = 0
      storageHooks.beforeSet = async (key) => {
        if (key === ACCOUNT_STORAGE_KEYS.ACCOUNTS) {
          setCalls += 1
          if (setCalls === 1) {
            throw new Error("primary write failed")
          }
        }
      }

      await expect(
        accountStorage.importData({
          accounts: [createAccount({ id: "imported-1" })],
          pinnedAccountIds: ["imported-1"],
        }),
      ).rejects.toThrow("primary write failed")

      const restored = storageData.get(
        ACCOUNT_STORAGE_KEYS.ACCOUNTS,
      ) as AccountStorageConfig
      expect(restored.accounts).toHaveLength(1)
      expect(restored.accounts[0].id).toBe("backup-1")
      expect(restored.bookmarks).toEqual([backupBookmark])
      expect(restored.pinnedAccountIds).toEqual(["backup-1", "bookmark-1"])
      expect(restored.orderedAccountIds).toEqual(["bookmark-1", "backup-1"])
    })

    it("importData sanitizes bookmarks and filters pinned and ordered ids to surviving entries", async () => {
      const result = await accountStorage.importData({
        accounts: [createAccount({ id: "imported-1" })],
        bookmarks: [
          null as any,
          {
            id: "dup",
            name: " Older ",
            url: " https://old.example.com ",
            tagIds: [" t1 ", "t1", 123 as any],
            notes: 123 as any,
            created_at: 1,
            updated_at: 2,
          },
          {
            id: "dup",
            name: " Newer ",
            url: " https://new.example.com ",
            tagIds: ["t2", "t2", "" as any],
            notes: "note",
            created_at: 3,
            updated_at: 4,
          },
          {
            id: "bookmark-2",
            name: " Bookmark 2 ",
            url: " https://bookmark2.example.com ",
            created_at: 5,
          } as any,
          {
            id: "",
            name: "Missing Id",
            url: "https://skip.example.com",
          } as any,
        ],
        pinnedAccountIds: ["dup", "imported-1", "missing", "dup"],
        orderedAccountIds: [
          "missing",
          "dup",
          "imported-1",
          "bookmark-2",
          "dup",
        ],
      })

      expect(result).toEqual({
        migratedCount: expect.any(Number),
      })

      const imported = storageData.get(
        ACCOUNT_STORAGE_KEYS.ACCOUNTS,
      ) as AccountStorageConfig

      expect(imported.bookmarks).toEqual([
        {
          id: "dup",
          name: "Newer",
          url: "https://new.example.com",
          tagIds: ["t2"],
          notes: "note",
          created_at: 3,
          updated_at: 4,
        },
        {
          id: "bookmark-2",
          name: "Bookmark 2",
          url: "https://bookmark2.example.com",
          tagIds: [],
          notes: "",
          created_at: 5,
          updated_at: 5,
        },
      ])
      expect(imported.pinnedAccountIds).toEqual(["dup", "imported-1"])
      expect(imported.orderedAccountIds).toEqual([
        "dup",
        "imported-1",
        "bookmark-2",
      ])
    })
  })

  it("clearAllData returns false when storage removal fails", async () => {
    seedStorage([createAccount({ id: "to-clear" })])

    storageHooks.beforeRemove = async (key) => {
      if (key === ACCOUNT_STORAGE_KEYS.ACCOUNTS) {
        throw new Error("remove failed")
      }
    }

    await expect(accountStorage.clearAllData()).resolves.toBe(false)
    expect(storageData.get(ACCOUNT_STORAGE_KEYS.ACCOUNTS)).toBeDefined()
  })
})
