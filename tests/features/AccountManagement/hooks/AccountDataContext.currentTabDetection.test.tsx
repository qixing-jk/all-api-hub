import { act, render, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  AccountDataProvider,
  useAccountDataContext,
} from "~/features/AccountManagement/hooks/AccountDataContext"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { getActiveTabs } from "~/utils/browser/browserApi"
import { testI18n } from "~~/tests/test-utils/i18n"

let activeTabs: any[] = []
let tabUpdatedListeners: any[] = []

type MockIndexedAccountSearchEntry = {
  __indexed: true
  account: any
}

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}

const {
  mockResetExpiredCheckIns,
  mockGetAllAccounts,
  mockGetAllBookmarks,
  mockGetOrderedList,
  mockGetPinnedList,
  mockGetAccountStats,
  mockConvertToDisplayData,
  mockGetTagStore,
} = vi.hoisted(() => ({
  mockResetExpiredCheckIns: vi.fn(),
  mockGetAllAccounts: vi.fn(),
  mockGetAllBookmarks: vi.fn(),
  mockGetOrderedList: vi.fn(),
  mockGetPinnedList: vi.fn(),
  mockGetAccountStats: vi.fn(),
  mockConvertToDisplayData: vi.fn(),
  mockGetTagStore: vi.fn(),
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    resetExpiredCheckIns: mockResetExpiredCheckIns,
    getAllAccounts: mockGetAllAccounts,
    getAllBookmarks: mockGetAllBookmarks,
    getOrderedList: mockGetOrderedList,
    getPinnedList: mockGetPinnedList,
    getAccountStats: mockGetAccountStats,
    convertToDisplayData: mockConvertToDisplayData,
  },
}))

vi.mock("~/services/tags/tagStorage", () => ({
  tagStorage: {
    getTagStore: mockGetTagStore,
    createTag: vi.fn(),
    renameTag: vi.fn(),
    deleteTag: vi.fn(),
  },
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    currencyType: "USD",
    showTodayCashflow: true,
    sortField: "name",
    sortOrder: "asc",
    updateSortConfig: vi.fn(),
    refreshOnOpen: false,
    sortingPriorityConfig: {
      lastModified: Date.now(),
      criteria: [{ id: "current_site", enabled: true, priority: 0 }],
    },
    preferences: {
      balanceHistory: {
        estimatedTodayIncome: { enabled: false },
      },
    },
  }),
}))

vi.mock("~/services/search/accountSearch", () => ({
  buildAccountSearchIndex: vi.fn(
    (accounts: any[]): MockIndexedAccountSearchEntry[] =>
      accounts.map((account) => ({
        __indexed: true,
        account,
      })),
  ),
  searchAccountSearchIndex: vi.fn(() => []),
}))

vi.mock("~/utils/browser/browserApi", () => ({
  getActiveTabs: vi.fn(async () => activeTabs),
  getAllTabs: vi.fn(async () => []),
  onRuntimeMessage: vi.fn(() => () => {}),
  onTabActivated: vi.fn(() => () => {}),
  onTabRemoved: vi.fn(() => () => {}),
  onTabUpdated: vi.fn((listener: any) => {
    tabUpdatedListeners.push(listener)
    return () => {
      tabUpdatedListeners = tabUpdatedListeners.filter(
        (currentListener) => currentListener !== listener,
      )
    }
  }),
  sendTabMessage: vi.fn(
    (
      tabId: number,
      message: unknown,
      options?: browser.tabs._SendMessageOptions,
    ) =>
      typeof options === "undefined"
        ? globalThis.browser.tabs.sendMessage(tabId, message)
        : globalThis.browser.tabs.sendMessage(tabId, message, options),
  ),
}))

/**
 * Captures the latest AccountDataContext value for assertions.
 */
function ContextProbe({
  onChange,
}: {
  onChange: (ctx: ReturnType<typeof useAccountDataContext>) => void
}) {
  const ctx = useAccountDataContext()
  useEffect(() => {
    onChange(ctx)
  }, [ctx, onChange])
  return null
}

/**
 * Builds a persisted account fixture with a given baseUrl and userId.
 */
function createAccount({
  id,
  baseUrl,
  userId,
  siteType = SITE_TYPES.UNKNOWN,
}: {
  id: string
  baseUrl: string
  userId: string
  siteType?: string
}) {
  return {
    id,
    site_name: "Test",
    site_url: baseUrl,
    health: { status: SiteHealthStatus.Healthy },
    site_type: siteType,
    exchange_rate: 7,
    account_info: {
      id: userId,
      access_token: "token",
      username: `user-${userId}`,
      quota: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
    last_sync_time: 0,
    updated_at: 0,
    created_at: 0,
    notes: "",
    tagIds: [],
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
  } as any
}

describe("AccountDataContext current tab detection", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    activeTabs = []
    tabUpdatedListeners = []
  })

  it("distinguishes site-level match vs user-level match by re-verifying website userId", async () => {
    activeTabs = [{ id: 101, url: "https://foo.example.com/dashboard" }]

    const account1 = createAccount({
      id: "acc-1",
      baseUrl: "https://foo.example.com",
      userId: "1",
    })
    const account2 = createAccount({
      id: "acc-2",
      baseUrl: "https://foo.example.com",
      userId: "2",
    })

    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([account1, account2])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue([])
    mockGetPinnedList.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue({
      total_quota: 0,
      today_total_consumption: 0,
      today_total_requests: 0,
      today_total_prompt_tokens: 0,
      today_total_completion_tokens: 0,
      today_total_income: 0,
    })
    mockConvertToDisplayData.mockReturnValue([{ id: "acc-1" }, { id: "acc-2" }])

    const sendMessageSpy = vi
      .spyOn(browser.tabs, "sendMessage")
      .mockResolvedValue({
        success: true,
        data: { userId: "2", user: { id: 2 } },
      } as any)

    let latestCtx: ReturnType<typeof useAccountDataContext> | null = null

    render(
      <I18nextProvider i18n={testI18n}>
        <AccountDataProvider>
          <ContextProbe onChange={(ctx) => (latestCtx = ctx)} />
        </AccountDataProvider>
      </I18nextProvider>,
    )

    await waitFor(() => {
      expect(latestCtx?.detectedSiteAccounts).toHaveLength(2)
      expect(latestCtx?.detectedAccount?.id).toBe("acc-2")
    })

    expect(sendMessageSpy).toHaveBeenCalledTimes(1)
  })

  it("matches AIHubMix current tab across main and console origins", async () => {
    activeTabs = [{ id: 104, url: "https://aihubmix.com/statistics" }]

    const aihubmixAccount = createAccount({
      id: "acc-aihubmix",
      baseUrl: "https://console.aihubmix.com",
      userId: "aihubmix-user",
      siteType: SITE_TYPES.AIHUBMIX,
    })
    aihubmixAccount.account_info.username = "AIHubMix User"

    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([aihubmixAccount])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue([])
    mockGetPinnedList.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue({
      total_quota: 0,
      today_total_consumption: 0,
      today_total_requests: 0,
      today_total_prompt_tokens: 0,
      today_total_completion_tokens: 0,
      today_total_income: 0,
    })
    mockConvertToDisplayData.mockReturnValue([{ id: "acc-aihubmix" }])

    const sendMessageSpy = vi
      .spyOn(browser.tabs, "sendMessage")
      .mockResolvedValue({
        success: true,
        data: { userId: "aihubmix-user", user: { username: "aihubmix-user" } },
      } as any)

    let latestCtx: ReturnType<typeof useAccountDataContext> | null = null

    render(
      <I18nextProvider i18n={testI18n}>
        <AccountDataProvider>
          <ContextProbe onChange={(ctx) => (latestCtx = ctx)} />
        </AccountDataProvider>
      </I18nextProvider>,
    )

    await waitFor(() => {
      expect(
        latestCtx?.detectedSiteAccounts.map((account) => account.id),
      ).toEqual(["acc-aihubmix"])
      expect(latestCtx?.detectedAccount?.id).toBe("acc-aihubmix")
    })

    expect(sendMessageSpy).toHaveBeenCalledWith(
      104,
      expect.objectContaining({
        siteType: SITE_TYPES.AIHUBMIX,
      }),
    )
  })

  it("normalizes string identities from current-tab user verification before matching", async () => {
    activeTabs = [{ id: 102, url: "https://foo.example.com/dashboard" }]

    const matchingAccount = createAccount({
      id: "acc-aihubmix",
      baseUrl: "https://foo.example.com",
      userId: "aihubmix-user",
    })

    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([matchingAccount])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue([])
    mockGetPinnedList.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue({
      total_quota: 0,
      today_total_consumption: 0,
      today_total_requests: 0,
      today_total_prompt_tokens: 0,
      today_total_completion_tokens: 0,
      today_total_income: 0,
    })
    mockConvertToDisplayData.mockReturnValue([{ id: "acc-aihubmix" }])

    const sendMessageSpy = vi
      .spyOn(browser.tabs, "sendMessage")
      .mockResolvedValue({
        success: true,
        data: { userId: " aihubmix-user ", user: { id: "aihubmix-user" } },
      } as any)

    let latestCtx: ReturnType<typeof useAccountDataContext> | null = null

    render(
      <I18nextProvider i18n={testI18n}>
        <AccountDataProvider>
          <ContextProbe onChange={(ctx) => (latestCtx = ctx)} />
        </AccountDataProvider>
      </I18nextProvider>,
    )

    await waitFor(() => {
      expect(latestCtx?.detectedAccount?.id).toBe("acc-aihubmix")
    })

    expect(sendMessageSpy).toHaveBeenCalledWith(
      102,
      expect.objectContaining({
        siteType: SITE_TYPES.UNKNOWN,
      }),
    )
  })

  it("prefers a known same-origin site type for current-tab user verification", async () => {
    activeTabs = [{ id: 103, url: "https://aihubmix.com/statistics" }]

    const legacyUnknownAccount = createAccount({
      id: "acc-legacy",
      baseUrl: "https://console.aihubmix.com",
      userId: "legacy-user",
      siteType: SITE_TYPES.UNKNOWN,
    })
    const aihubmixAccount = createAccount({
      id: "acc-aihubmix",
      baseUrl: "https://console.aihubmix.com",
      userId: "aihubmix-user",
      siteType: SITE_TYPES.AIHUBMIX,
    })
    aihubmixAccount.account_info.username = "AIHubMix User"

    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([
      legacyUnknownAccount,
      aihubmixAccount,
    ])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue([])
    mockGetPinnedList.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue({
      total_quota: 0,
      today_total_consumption: 0,
      today_total_requests: 0,
      today_total_prompt_tokens: 0,
      today_total_completion_tokens: 0,
      today_total_income: 0,
    })
    mockConvertToDisplayData.mockReturnValue([
      { id: "acc-legacy" },
      { id: "acc-aihubmix" },
    ])

    const sendMessageSpy = vi
      .spyOn(browser.tabs, "sendMessage")
      .mockResolvedValue({
        success: true,
        data: { userId: "aihubmix-user", user: { username: "aihubmix-user" } },
      } as any)

    let latestCtx: ReturnType<typeof useAccountDataContext> | null = null

    render(
      <I18nextProvider i18n={testI18n}>
        <AccountDataProvider>
          <ContextProbe onChange={(ctx) => (latestCtx = ctx)} />
        </AccountDataProvider>
      </I18nextProvider>,
    )

    await waitFor(() => {
      expect(latestCtx?.detectedAccount?.id).toBe("acc-aihubmix")
    })

    expect(sendMessageSpy).toHaveBeenCalledWith(
      103,
      expect.objectContaining({
        siteType: SITE_TYPES.AIHUBMIX,
      }),
    )
  })

  it("prefers AIHubMix profile host aliases over same-origin account order for user verification", async () => {
    activeTabs = [{ id: 105, url: "https://console.aihubmix.com/dashboard" }]

    const newApiAccount = createAccount({
      id: "acc-new-api",
      baseUrl: "https://console.aihubmix.com",
      userId: "new-api-user",
      siteType: SITE_TYPES.NEW_API,
    })
    const aihubmixAccount = createAccount({
      id: "acc-aihubmix",
      baseUrl: "https://console.aihubmix.com",
      userId: "aihubmix-stable-id",
      siteType: SITE_TYPES.AIHUBMIX,
    })
    aihubmixAccount.account_info.username = "AIHubMix User"

    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([newApiAccount, aihubmixAccount])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue([])
    mockGetPinnedList.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue({
      total_quota: 0,
      today_total_consumption: 0,
      today_total_requests: 0,
      today_total_prompt_tokens: 0,
      today_total_completion_tokens: 0,
      today_total_income: 0,
    })
    mockConvertToDisplayData.mockReturnValue([
      { id: "acc-new-api" },
      { id: "acc-aihubmix" },
    ])

    const sendMessageSpy = vi
      .spyOn(browser.tabs, "sendMessage")
      .mockResolvedValue({
        success: true,
        data: {
          userId: "aihubmix-stable-id",
          user: { username: "aihubmix-stable-id" },
        },
      } as any)

    let latestCtx: ReturnType<typeof useAccountDataContext> | null = null

    render(
      <I18nextProvider i18n={testI18n}>
        <AccountDataProvider>
          <ContextProbe onChange={(ctx) => (latestCtx = ctx)} />
        </AccountDataProvider>
      </I18nextProvider>,
    )

    await waitFor(() => {
      expect(latestCtx?.detectedAccount?.id).toBe("acc-aihubmix")
    })

    expect(sendMessageSpy).toHaveBeenCalledWith(
      105,
      expect.objectContaining({
        siteType: SITE_TYPES.AIHUBMIX,
      }),
    )
  })

  it("keeps site-level match when userId does not match any stored account", async () => {
    activeTabs = [{ id: 202, url: "https://foo.example.com/settings" }]

    const account1 = createAccount({
      id: "acc-1",
      baseUrl: "https://foo.example.com",
      userId: "1",
    })
    const account2 = createAccount({
      id: "acc-2",
      baseUrl: "https://foo.example.com",
      userId: "2",
    })

    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([account1, account2])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue([])
    mockGetPinnedList.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue({
      total_quota: 0,
      today_total_consumption: 0,
      today_total_requests: 0,
      today_total_prompt_tokens: 0,
      today_total_completion_tokens: 0,
      today_total_income: 0,
    })
    mockConvertToDisplayData.mockReturnValue([{ id: "acc-1" }, { id: "acc-2" }])

    vi.spyOn(browser.tabs, "sendMessage").mockResolvedValue({
      success: true,
      data: { userId: "999", user: { id: 999 } },
    } as any)

    let latestCtx: ReturnType<typeof useAccountDataContext> | null = null

    render(
      <I18nextProvider i18n={testI18n}>
        <AccountDataProvider>
          <ContextProbe onChange={(ctx) => (latestCtx = ctx)} />
        </AccountDataProvider>
      </I18nextProvider>,
    )

    await waitFor(() => {
      expect(latestCtx?.detectedSiteAccounts).toHaveLength(2)
      expect(latestCtx?.detectedAccount).toBeNull()
    })
  })

  it("records tabId to avoid duplicate userId re-verification on repeated tab updates", async () => {
    activeTabs = [{ id: 303, url: "https://foo.example.com" }]

    const account1 = createAccount({
      id: "acc-1",
      baseUrl: "https://foo.example.com",
      userId: "1",
    })
    const account2 = createAccount({
      id: "acc-2",
      baseUrl: "https://foo.example.com",
      userId: "2",
    })

    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([account1, account2])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue([])
    mockGetPinnedList.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue({
      total_quota: 0,
      today_total_consumption: 0,
      today_total_requests: 0,
      today_total_prompt_tokens: 0,
      today_total_completion_tokens: 0,
      today_total_income: 0,
    })
    mockConvertToDisplayData.mockReturnValue([{ id: "acc-1" }, { id: "acc-2" }])

    const sendMessageSpy = vi
      .spyOn(browser.tabs, "sendMessage")
      .mockResolvedValue({
        success: true,
        data: { userId: "2", user: { id: 2 } },
      } as any)

    let latestCtx: ReturnType<typeof useAccountDataContext> | null = null

    render(
      <I18nextProvider i18n={testI18n}>
        <AccountDataProvider>
          <ContextProbe onChange={(ctx) => (latestCtx = ctx)} />
        </AccountDataProvider>
      </I18nextProvider>,
    )

    await waitFor(() => {
      expect(latestCtx?.detectedAccount?.id).toBe("acc-2")
    })

    sendMessageSpy.mockClear()

    await act(async () => {
      for (const listener of tabUpdatedListeners) {
        await listener(303, {}, {})
        await listener(303, {}, {})
      }
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    // Cached userId (keyed by tabId+url) prevents duplicate reads.
    expect(sendMessageSpy).not.toHaveBeenCalled()
  })

  it("matches from cached user id when cached user payload is unavailable", async () => {
    activeTabs = [{ id: 306, url: "https://foo.example.com" }]

    const matchingAccount = createAccount({
      id: "acc-2",
      baseUrl: "https://foo.example.com",
      userId: "2",
    })

    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([matchingAccount])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue([])
    mockGetPinnedList.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue({
      total_quota: 0,
      today_total_consumption: 0,
      today_total_requests: 0,
      today_total_prompt_tokens: 0,
      today_total_completion_tokens: 0,
      today_total_income: 0,
    })
    mockConvertToDisplayData.mockReturnValue([{ id: "acc-2" }])

    const sendMessageSpy = vi
      .spyOn(browser.tabs, "sendMessage")
      .mockResolvedValue({
        success: true,
        data: { userId: "2" },
      } as any)

    let latestCtx: ReturnType<typeof useAccountDataContext> | null = null

    render(
      <I18nextProvider i18n={testI18n}>
        <AccountDataProvider>
          <ContextProbe onChange={(ctx) => (latestCtx = ctx)} />
        </AccountDataProvider>
      </I18nextProvider>,
    )

    await waitFor(() => {
      expect(latestCtx?.detectedAccount?.id).toBe("acc-2")
    })

    sendMessageSpy.mockClear()

    await act(async () => {
      for (const listener of tabUpdatedListeners) {
        await listener(306, {}, {})
      }
    })

    await waitFor(() => {
      expect(latestCtx?.detectedAccount?.id).toBe("acc-2")
    })
    expect(sendMessageSpy).not.toHaveBeenCalled()
  })

  it("keeps AIHubMix username identity match when reusing current-tab user cache", async () => {
    activeTabs = [{ id: 404, url: "https://aihubmix.com/statistics" }]

    const aihubmixAccount = createAccount({
      id: "acc-aihubmix",
      baseUrl: "https://console.aihubmix.com",
      userId: "aihubmix-user",
      siteType: SITE_TYPES.AIHUBMIX,
    })
    aihubmixAccount.account_info.username = "AIHubMix User"

    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([aihubmixAccount])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue([])
    mockGetPinnedList.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue({
      total_quota: 0,
      today_total_consumption: 0,
      today_total_requests: 0,
      today_total_prompt_tokens: 0,
      today_total_completion_tokens: 0,
      today_total_income: 0,
    })
    mockConvertToDisplayData.mockReturnValue([{ id: "acc-aihubmix" }])

    const firstUserResponse = createDeferred<any>()
    const sendMessageSpy = vi
      .spyOn(browser.tabs, "sendMessage")
      .mockReturnValue(firstUserResponse.promise as any)

    let latestCtx: ReturnType<typeof useAccountDataContext> | null = null

    render(
      <I18nextProvider i18n={testI18n}>
        <AccountDataProvider>
          <ContextProbe onChange={(ctx) => (latestCtx = ctx)} />
        </AccountDataProvider>
      </I18nextProvider>,
    )

    await waitFor(() => {
      expect(sendMessageSpy).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      firstUserResponse.resolve({
        success: true,
        data: {
          userId: "aihubmix-user",
          user: {
            id: "numeric-aihubmix-id",
            username: "aihubmix-user",
          },
        },
      })
      await firstUserResponse.promise
    })

    await waitFor(() => {
      expect(latestCtx?.detectedAccount?.id).toBe("acc-aihubmix")
    })

    sendMessageSpy.mockClear()
    const updateListenerActiveTabs = Promise.resolve(activeTabs)
    const cacheReuseActiveTabs = createDeferred<any[]>()
    vi.mocked(getActiveTabs)
      .mockReturnValueOnce(updateListenerActiveTabs)
      .mockReturnValueOnce(cacheReuseActiveTabs.promise)

    act(() => {
      for (const listener of tabUpdatedListeners) {
        void listener(404, {}, {})
      }
    })

    await waitFor(() => {
      expect(getActiveTabs).toHaveBeenCalledTimes(3)
      expect(latestCtx?.isDetecting).toBe(true)
    })

    await act(async () => {
      cacheReuseActiveTabs.resolve(activeTabs)
      await cacheReuseActiveTabs.promise
    })

    await waitFor(() => {
      expect(latestCtx?.isDetecting).toBe(false)
      expect(latestCtx?.detectedAccount?.id).toBe("acc-aihubmix")
    })
    expect(sendMessageSpy).not.toHaveBeenCalled()
  })
})
