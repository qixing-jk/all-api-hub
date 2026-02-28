import { act, render, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AccountDataProvider,
  useAccountDataContext,
} from "~/features/AccountManagement/hooks/AccountDataContext"
import i18nInstance from "~/tests/test-utils/i18n"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

let activeTabs: any[] = []
let tabUpdatedListener: any = null

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
  }),
}))

vi.mock("~/services/search/accountSearch", () => ({
  searchAccounts: vi.fn(() => []),
}))

vi.mock("~/utils/browserApi", () => ({
  getActiveTabs: vi.fn(async () => activeTabs),
  getAllTabs: vi.fn(async () => []),
  onRuntimeMessage: vi.fn(() => () => {}),
  onTabActivated: vi.fn(() => () => {}),
  onTabRemoved: vi.fn(() => () => {}),
  onTabUpdated: vi.fn((listener: any) => {
    tabUpdatedListener = listener
    return () => {
      tabUpdatedListener = null
    }
  }),
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
}: {
  id: string
  baseUrl: string
  userId: number
}) {
  return {
    id,
    site_name: "Test",
    site_url: baseUrl,
    health: { status: SiteHealthStatus.Healthy },
    site_type: "unknown",
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
    tabUpdatedListener = null
  })

  it("distinguishes site-level match vs user-level match by re-verifying website userId", async () => {
    activeTabs = [{ id: 101, url: "https://foo.example.com/dashboard" }]

    const account1 = createAccount({
      id: "acc-1",
      baseUrl: "https://foo.example.com",
      userId: 1,
    })
    const account2 = createAccount({
      id: "acc-2",
      baseUrl: "https://foo.example.com",
      userId: 2,
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
        data: { userId: 2, user: { id: 2 } },
      } as any)

    let latestCtx: ReturnType<typeof useAccountDataContext> | null = null

    render(
      <I18nextProvider i18n={i18nInstance}>
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

  it("keeps site-level match when userId does not match any stored account", async () => {
    activeTabs = [{ id: 202, url: "https://foo.example.com/settings" }]

    const account1 = createAccount({
      id: "acc-1",
      baseUrl: "https://foo.example.com",
      userId: 1,
    })
    const account2 = createAccount({
      id: "acc-2",
      baseUrl: "https://foo.example.com",
      userId: 2,
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
      data: { userId: 999, user: { id: 999 } },
    } as any)

    let latestCtx: ReturnType<typeof useAccountDataContext> | null = null

    render(
      <I18nextProvider i18n={i18nInstance}>
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
      userId: 1,
    })
    const account2 = createAccount({
      id: "acc-2",
      baseUrl: "https://foo.example.com",
      userId: 2,
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
        data: { userId: 2, user: { id: 2 } },
      } as any)

    let latestCtx: ReturnType<typeof useAccountDataContext> | null = null

    render(
      <I18nextProvider i18n={i18nInstance}>
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
      await tabUpdatedListener?.(303, {}, {})
      await tabUpdatedListener?.(303, {}, {})
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    // Cached userId (keyed by tabId+url) prevents duplicate reads.
    expect(sendMessageSpy).not.toHaveBeenCalled()
  })
})
