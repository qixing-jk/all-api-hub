import { act, render, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_CREATED_AT,
} from "~/constants"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  AccountDataProvider,
  useAccountDataContext,
} from "~/features/AccountManagement/hooks/AccountDataContext"
import type { SearchResult } from "~/services/search/accountSearch"
import type { DisplaySiteData } from "~/types"
import { SortingCriteriaType } from "~/types/sorting"
import { testI18n } from "~~/tests/test-utils/i18n"

type MockIndexedAccountSearchEntry = {
  __indexed: true
  account: DisplaySiteData
}

function createMockIndexedAccountSearchEntries(
  accounts: DisplaySiteData[],
): MockIndexedAccountSearchEntry[] {
  return accounts.map((account) => ({
    __indexed: true,
    account,
  }))
}

const {
  mockGetAllAccounts,
  mockGetAllBookmarks,
  mockGetOrderedList,
  mockGetPinnedList,
  mockGetAccountStats,
  mockGetAccountById,
  mockConvertToDisplayData,
  mockResetExpiredCheckIns,
  mockSetPinnedList,
  mockSetOrderedList,
  mockSetPinnedListSubset,
  mockSetOrderedListSubset,
  mockGetTagStore,
  mockCreateTag,
  mockRenameTag,
  mockDeleteTag,
  mockPinAccount,
  mockUnpinAccount,
  mockRefreshAllAccounts,
  mockToastPromise,
  mockGetActiveTabs,
  mockGetAllTabs,
  mockOnRuntimeMessage,
  mockOnTabActivated,
  mockOnTabRemoved,
  mockOnTabUpdated,
  mockBuildAccountSearchIndex,
  mockSearchAccountSearchIndex,
  mockUpdateSortConfig,
} = vi.hoisted(() => ({
  mockGetAllAccounts: vi.fn(),
  mockGetAllBookmarks: vi.fn(),
  mockGetOrderedList: vi.fn(),
  mockGetPinnedList: vi.fn(),
  mockGetAccountStats: vi.fn(),
  mockGetAccountById: vi.fn(),
  mockConvertToDisplayData: vi.fn(),
  mockResetExpiredCheckIns: vi.fn(),
  mockSetPinnedList: vi.fn(),
  mockSetOrderedList: vi.fn(),
  mockSetPinnedListSubset: vi.fn(),
  mockSetOrderedListSubset: vi.fn(),
  mockGetTagStore: vi.fn(),
  mockCreateTag: vi.fn(),
  mockRenameTag: vi.fn(),
  mockDeleteTag: vi.fn(),
  mockPinAccount: vi.fn(),
  mockUnpinAccount: vi.fn(),
  mockRefreshAllAccounts: vi.fn(),
  mockToastPromise: vi.fn(),
  mockGetActiveTabs: vi.fn<() => Promise<browser.tabs.Tab[]>>(async () => []),
  mockGetAllTabs: vi.fn<() => Promise<browser.tabs.Tab[]>>(async () => []),
  mockOnRuntimeMessage: vi.fn<
    (
      listener: (
        message: any,
        sender: browser.runtime.MessageSender,
        sendResponse: (response?: any) => void,
      ) => void | boolean,
    ) => () => void
  >((listener) => {
    ;(globalThis as any).__accountDataContextRuntimeListener = listener
    return () => {
      ;(globalThis as any).__accountDataContextRuntimeListener = undefined
    }
  }),
  mockOnTabActivated: vi.fn<
    (
      listener: (activeInfo: browser.tabs._OnActivatedActiveInfo) => void,
    ) => () => void
  >((_listener) => () => {}),
  mockOnTabRemoved: vi.fn<
    (
      listener: (
        tabId: number,
        removeInfo: browser.tabs._OnRemovedRemoveInfo,
      ) => void,
    ) => () => void
  >((_listener) => () => {}),
  mockOnTabUpdated: vi.fn<
    (
      listener: (
        tabId: number,
        changeInfo: browser.tabs._OnUpdatedChangeInfo,
        tab: browser.tabs.Tab,
      ) => void | Promise<void>,
    ) => () => void
  >((_listener) => () => {}),
  mockBuildAccountSearchIndex: vi.fn(
    (accounts: DisplaySiteData[]): MockIndexedAccountSearchEntry[] =>
      createMockIndexedAccountSearchEntries(accounts),
  ),
  mockSearchAccountSearchIndex: vi.fn<
    (accounts: MockIndexedAccountSearchEntry[], query: string) => SearchResult[]
  >(() => []),
  mockUpdateSortConfig: vi.fn(),
}))

const mockUserPreferencesContext = vi.hoisted(() => ({
  current: {
    currencyType: "USD",
    sortField: "name",
    sortOrder: "asc",
    updateSortConfig: mockUpdateSortConfig,
    refreshOnOpen: false,
    sortingPriorityConfig: {
      lastModified: Date.now(),
      criteria: [
        { id: "pinned", enabled: true, priority: 0 },
        { id: "manual_order", enabled: true, priority: 1 },
      ],
    },
    showTodayCashflow: true,
  },
}))

vi.mock("react-hot-toast", () => ({
  default: {
    promise: mockToastPromise,
  },
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    resetExpiredCheckIns: mockResetExpiredCheckIns,
    getAllAccounts: mockGetAllAccounts,
    getAllBookmarks: mockGetAllBookmarks,
    getAccountById: mockGetAccountById,
    getOrderedList: mockGetOrderedList,
    getPinnedList: mockGetPinnedList,
    getAccountStats: mockGetAccountStats,
    convertToDisplayData: mockConvertToDisplayData,
    setPinnedList: mockSetPinnedList,
    setOrderedList: mockSetOrderedList,
    setPinnedListSubset: mockSetPinnedListSubset,
    setOrderedListSubset: mockSetOrderedListSubset,
    pinAccount: mockPinAccount,
    unpinAccount: mockUnpinAccount,
    refreshAllAccounts: mockRefreshAllAccounts,
    checkUrlExists: vi.fn(async () => null),
  },
}))

vi.mock("~/services/tags/tagStorage", () => ({
  tagStorage: {
    getTagStore: mockGetTagStore,
    createTag: mockCreateTag,
    renameTag: mockRenameTag,
    deleteTag: mockDeleteTag,
  },
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => mockUserPreferencesContext.current,
}))

vi.mock("~/utils/browser/browserApi", () => ({
  getActiveTabs: mockGetActiveTabs,
  getAllTabs: mockGetAllTabs,
  onRuntimeMessage: mockOnRuntimeMessage,
  onTabActivated: mockOnTabActivated,
  onTabRemoved: mockOnTabRemoved,
  onTabUpdated: mockOnTabUpdated,
}))

vi.mock("~/services/search/accountSearch", () => ({
  buildAccountSearchIndex: mockBuildAccountSearchIndex,
  searchAccountSearchIndex: mockSearchAccountSearchIndex,
}))

afterEach(() => {
  /**
   * Prevent leaked runtime listeners between tests.
   *
   * The mocked `onRuntimeMessage` stores its latest listener on `globalThis` so individual
   * tests can invoke it directly. Tests may not always unmount cleanly, so delete the global
   * reference here to ensure each test starts with no stale listener.
   */
  delete (globalThis as any).__accountDataContextRuntimeListener
})

beforeEach(() => {
  vi.clearAllMocks()

  mockUserPreferencesContext.current = {
    currencyType: "USD",
    sortField: "name",
    sortOrder: "asc",
    updateSortConfig: mockUpdateSortConfig,
    refreshOnOpen: false,
    sortingPriorityConfig: {
      lastModified: Date.now(),
      criteria: [
        { id: "pinned", enabled: true, priority: 0 },
        { id: "manual_order", enabled: true, priority: 1 },
      ],
    },
    showTodayCashflow: true,
  }

  mockResetExpiredCheckIns.mockResolvedValue(undefined)
  mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
  mockGetAllAccounts.mockResolvedValue([])
  mockGetAllBookmarks.mockResolvedValue([])
  mockGetOrderedList.mockResolvedValue([])
  mockGetPinnedList.mockResolvedValue([])
  mockGetAccountStats.mockResolvedValue(createEmptyStats())
  mockConvertToDisplayData.mockImplementation((input: any) => {
    const accounts = Array.isArray(input) ? input : [input]
    const display = accounts.map((account: any) => ({
      ...account,
      id: account.id,
      tagIds: account.tagIds ?? [],
    }))
    return Array.isArray(input) ? display : display[0]
  })
  mockRefreshAllAccounts.mockResolvedValue({
    success: 0,
    failed: 0,
    refreshedCount: 0,
    latestSyncTime: 0,
  })
  mockToastPromise.mockImplementation((promise: Promise<any>) => promise)
  mockGetActiveTabs.mockResolvedValue([])
  mockGetAllTabs.mockResolvedValue([])
  mockOnRuntimeMessage.mockImplementation((listener: any) => {
    ;(globalThis as any).__accountDataContextRuntimeListener = listener
    return () => {
      ;(globalThis as any).__accountDataContextRuntimeListener = undefined
    }
  })
  mockOnTabActivated.mockImplementation(() => () => {})
  mockOnTabRemoved.mockImplementation(() => () => {})
  mockOnTabUpdated.mockImplementation(() => () => {})
  mockPinAccount.mockResolvedValue(true)
  mockUnpinAccount.mockResolvedValue(true)
  mockBuildAccountSearchIndex.mockImplementation(
    (accounts: DisplaySiteData[]) =>
      createMockIndexedAccountSearchEntries(accounts),
  )
  mockSearchAccountSearchIndex.mockReturnValue([])
  mockUpdateSortConfig.mockResolvedValue(true)
  ;(globalThis as any).browser = {
    ...(globalThis as any).browser,
    tabs: {
      ...((globalThis as any).browser?.tabs ?? {}),
      sendMessage: vi.fn(),
    },
  }
})

function createEmptyStats() {
  return {
    total_quota: 0,
    today_total_consumption: 0,
    today_total_requests: 0,
    today_total_prompt_tokens: 0,
    today_total_completion_tokens: 0,
    today_total_income: 0,
  }
}

function createBrowserTab(
  overrides: Partial<browser.tabs.Tab> = {},
): browser.tabs.Tab {
  return {
    active: true,
    highlighted: true,
    id: 0,
    incognito: false,
    index: 0,
    pinned: false,
    windowId: 1,
    ...overrides,
  } as browser.tabs.Tab
}

async function renderAccountDataProvider() {
  let latestCtx: ReturnType<typeof useAccountDataContext> | null = null

  render(
    <I18nextProvider i18n={testI18n}>
      <AccountDataProvider>
        <ContextProbe onChange={(ctx) => (latestCtx = ctx)} />
      </AccountDataProvider>
    </I18nextProvider>,
  )

  await waitFor(() => {
    expect(latestCtx).not.toBeNull()
  })

  return () => latestCtx as ReturnType<typeof useAccountDataContext>
}

async function flushReactMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

/**
 * Captures the latest AccountDataContext value for assertions in tests.
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

describe("AccountDataContext handleReorder", () => {
  it("persists pinned order when pinned accounts are reordered", async () => {
    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue(["p-1", "p-2", "u-1"])
    mockGetPinnedList.mockResolvedValue(["p-1", "p-2"])
    mockGetAccountStats.mockResolvedValue({
      total_quota: 0,
      today_total_consumption: 0,
      today_total_requests: 0,
      today_total_prompt_tokens: 0,
      today_total_completion_tokens: 0,
      today_total_income: 0,
    })
    mockConvertToDisplayData.mockReturnValue([
      { id: "p-1" },
      { id: "p-2" },
      { id: "u-1" },
    ])
    mockSetPinnedListSubset.mockResolvedValue(true)
    mockSetOrderedListSubset.mockResolvedValue(true)

    let latestCtx: ReturnType<typeof useAccountDataContext> | null = null

    render(
      <I18nextProvider i18n={testI18n}>
        <AccountDataProvider>
          <ContextProbe onChange={(ctx) => (latestCtx = ctx)} />
        </AccountDataProvider>
      </I18nextProvider>,
    )

    await waitFor(() => {
      expect(latestCtx?.displayData).toHaveLength(3)
      expect(latestCtx?.pinnedAccountIds).toEqual(["p-1", "p-2"])
    })

    await act(async () => {
      await latestCtx!.handleReorder(["p-2", "p-1", "u-1"])
    })

    expect(mockSetPinnedListSubset).toHaveBeenCalledWith({
      entryType: "account",
      ids: ["p-2", "p-1"],
    })
    expect(mockSetOrderedListSubset).toHaveBeenCalledWith({
      entryType: "account",
      ids: ["p-2", "p-1", "u-1"],
    })
  })

  it("keeps pinned list stable when non-pinned items move around", async () => {
    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue(["p-1", "p-2", "u-1"])
    mockGetPinnedList.mockResolvedValue(["p-1", "p-2"])
    mockGetAccountStats.mockResolvedValue({
      total_quota: 0,
      today_total_consumption: 0,
      today_total_requests: 0,
      today_total_prompt_tokens: 0,
      today_total_completion_tokens: 0,
      today_total_income: 0,
    })
    mockConvertToDisplayData.mockReturnValue([
      { id: "p-1" },
      { id: "p-2" },
      { id: "u-1" },
    ])
    mockSetPinnedListSubset.mockResolvedValue(true)
    mockSetOrderedListSubset.mockResolvedValue(true)

    let latestCtx: ReturnType<typeof useAccountDataContext> | null = null

    render(
      <I18nextProvider i18n={testI18n}>
        <AccountDataProvider>
          <ContextProbe onChange={(ctx) => (latestCtx = ctx)} />
        </AccountDataProvider>
      </I18nextProvider>,
    )

    await waitFor(() => {
      expect(latestCtx?.displayData).toHaveLength(3)
      expect(latestCtx?.pinnedAccountIds).toEqual(["p-1", "p-2"])
    })

    mockSetPinnedListSubset.mockClear()
    mockSetOrderedListSubset.mockClear()

    await act(async () => {
      await latestCtx!.handleReorder(["u-1", "p-1", "p-2"])
    })

    expect(mockSetPinnedListSubset).not.toHaveBeenCalled()
    expect(mockSetOrderedListSubset).toHaveBeenCalledWith({
      entryType: "account",
      ids: ["p-1", "p-2", "u-1"],
    })
  })

  it("optimistically updates account order before persistence finishes", async () => {
    let resolveOrderedWrite: ((value: boolean) => void) | null = null

    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([{ id: "acc-1" }, { id: "acc-2" }])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue(["acc-1", "acc-2"])
    mockGetPinnedList.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue(createEmptyStats())
    mockSetOrderedListSubset.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveOrderedWrite = resolve
        }),
    )

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().orderedAccountIds).toEqual(["acc-1", "acc-2"])
    })

    let reorderPromise: Promise<void> | undefined

    act(() => {
      reorderPromise = getLatestCtx().handleReorder(["acc-2", "acc-1"])
    })

    await waitFor(() => {
      expect(getLatestCtx().orderedAccountIds).toEqual(["acc-2", "acc-1"])
    })

    await act(async () => {
      mockGetPinnedList.mockResolvedValueOnce([])
      mockGetOrderedList.mockResolvedValueOnce(["acc-2", "acc-1"])
      resolveOrderedWrite?.(true)
      await reorderPromise
    })

    await waitFor(() => {
      expect(getLatestCtx().orderedAccountIds).toEqual(["acc-2", "acc-1"])
    })
  })
})

describe("AccountDataContext initial load orchestration", () => {
  it("keeps initial load active until current-tab and open-tab checks complete", async () => {
    let resolveActiveTabs: ((tabs: browser.tabs.Tab[]) => void) | undefined
    let resolveAllTabs: ((tabs: browser.tabs.Tab[]) => void) | undefined

    mockGetAllAccounts.mockResolvedValue([
      {
        id: "acc-1",
        site_url: "https://alpha.example.com",
        account_info: { id: 1 },
        last_sync_time: 0,
      },
    ])
    mockConvertToDisplayData.mockReturnValue([
      {
        id: "acc-1",
        name: "Alpha",
        username: "alice",
        baseUrl: "https://alpha.example.com",
        token: "token",
        tagIds: [],
        tags: [],
        balance: { USD: 0, CNY: 0 },
        todayConsumption: { USD: 0, CNY: 0 },
        todayIncome: { USD: 0, CNY: 0 },
        checkIn: { enableDetection: false },
      },
    ])
    mockGetActiveTabs.mockReturnValue(
      new Promise((resolve) => {
        resolveActiveTabs = resolve
      }),
    )
    mockGetAllTabs.mockReturnValue(
      new Promise((resolve) => {
        resolveAllTabs = resolve
      }),
    )

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().displayData).toHaveLength(1)
      expect(mockGetActiveTabs).toHaveBeenCalled()
      expect(mockGetAllTabs).toHaveBeenCalled()
    })

    expect(getLatestCtx().isInitialLoad).toBe(true)

    await act(async () => {
      resolveActiveTabs?.([])
      await flushReactMicrotasks()
    })

    expect(getLatestCtx().isInitialLoad).toBe(true)

    await act(async () => {
      resolveAllTabs?.([])
      await flushReactMicrotasks()
    })

    await waitFor(() => {
      expect(getLatestCtx().isInitialLoad).toBe(false)
    })
  })

  it("keeps initial load active when open-tab matching resolves before current-tab detection", async () => {
    let resolveActiveTabs: ((tabs: browser.tabs.Tab[]) => void) | undefined
    let resolveAllTabs: ((tabs: browser.tabs.Tab[]) => void) | undefined

    mockGetAllAccounts.mockResolvedValue([
      {
        id: "acc-1",
        site_url: "https://alpha.example.com",
        account_info: { id: 1 },
        last_sync_time: 0,
      },
    ])
    mockConvertToDisplayData.mockReturnValue([
      {
        id: "acc-1",
        name: "Alpha",
        username: "alice",
        baseUrl: "https://alpha.example.com",
        token: "token",
        tagIds: [],
        tags: [],
        balance: { USD: 0, CNY: 0 },
        todayConsumption: { USD: 0, CNY: 0 },
        todayIncome: { USD: 0, CNY: 0 },
        checkIn: { enableDetection: false },
      },
    ])
    mockGetActiveTabs.mockReturnValue(
      new Promise((resolve) => {
        resolveActiveTabs = resolve
      }),
    )
    mockGetAllTabs.mockReturnValue(
      new Promise((resolve) => {
        resolveAllTabs = resolve
      }),
    )

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().displayData).toHaveLength(1)
      expect(mockGetActiveTabs).toHaveBeenCalled()
      expect(mockGetAllTabs).toHaveBeenCalled()
    })

    expect(getLatestCtx().isInitialLoad).toBe(true)

    await act(async () => {
      resolveAllTabs?.([])
      await flushReactMicrotasks()
    })

    expect(getLatestCtx().isInitialLoad).toBe(true)

    await act(async () => {
      resolveActiveTabs?.([])
      await flushReactMicrotasks()
    })

    await waitFor(() => {
      expect(getLatestCtx().isInitialLoad).toBe(false)
    })
  })

  it("resolves the initial load when current-tab detection fails", async () => {
    mockGetAllAccounts.mockResolvedValue([
      {
        id: "acc-1",
        site_url: "https://alpha.example.com",
        account_info: { id: 1 },
        last_sync_time: 0,
      },
    ])
    mockConvertToDisplayData.mockReturnValue([
      {
        id: "acc-1",
        name: "Alpha",
        username: "alice",
        baseUrl: "https://alpha.example.com",
        token: "token",
        tagIds: [],
        tags: [],
        balance: { USD: 0, CNY: 0 },
        todayConsumption: { USD: 0, CNY: 0 },
        todayIncome: { USD: 0, CNY: 0 },
        checkIn: { enableDetection: false },
      },
    ])
    mockGetActiveTabs.mockRejectedValue(new Error("tabs query failed"))
    mockGetAllTabs.mockResolvedValue([])

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().isInitialLoad).toBe(false)
    })
  })

  it("resolves the initial load when open-tab matching fails", async () => {
    mockGetAllAccounts.mockResolvedValue([
      {
        id: "acc-1",
        site_url: "https://alpha.example.com",
        account_info: { id: 1 },
        last_sync_time: 0,
      },
    ])
    mockConvertToDisplayData.mockReturnValue([
      {
        id: "acc-1",
        name: "Alpha",
        username: "alice",
        baseUrl: "https://alpha.example.com",
        token: "token",
        tagIds: [],
        tags: [],
        balance: { USD: 0, CNY: 0 },
        todayConsumption: { USD: 0, CNY: 0 },
        todayIncome: { USD: 0, CNY: 0 },
        checkIn: { enableDetection: false },
      },
    ])
    mockGetActiveTabs.mockResolvedValue([])
    mockGetAllTabs.mockRejectedValue(new Error("tab scan failed"))

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().isInitialLoad).toBe(false)
    })
  })

  it("resolves the initial load even when account storage reads fail", async () => {
    mockGetAllAccounts.mockRejectedValue(new Error("storage unavailable"))

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().isInitialLoad).toBe(false)
    })
  })
})

describe("AccountDataContext actions", () => {
  it("hydrates tags, filters stale ordering ids, and keeps the latest sync timestamp", async () => {
    const accountA = {
      id: "acc-1",
      site_url: "https://api.example.com/a",
      account_info: { id: 1 },
      last_sync_time: 1_710_000_000_000,
      tagIds: ["tag-2", "missing"],
    }
    const accountB = {
      id: "acc-2",
      site_url: "https://api.example.com/b",
      account_info: { id: 2 },
      last_sync_time: 1_710_000_100_000,
      tagIds: ["tag-1", "tag-2"],
    }

    mockGetAllAccounts.mockResolvedValue([accountA, accountB])
    mockGetAllBookmarks.mockResolvedValue([{ id: "bookmark-1" }])
    mockGetOrderedList.mockResolvedValue([
      "missing-entry",
      "acc-2",
      "bookmark-1",
      "acc-1",
    ])
    mockGetPinnedList.mockResolvedValue(["missing-pin", "bookmark-1", "acc-1"])
    mockGetTagStore.mockResolvedValue({
      version: 1,
      tagsById: {
        "tag-1": { id: "tag-1", name: "Beta" },
        "tag-2": { id: "tag-2", name: "alpha" },
      },
    })
    mockConvertToDisplayData.mockImplementation((input: any) => {
      const accounts = Array.isArray(input) ? input : [input]
      const display = accounts.map((account: any) => ({
        id: account.id,
        name: account.id,
        site_url: account.site_url,
        tagIds: account.tagIds ?? [],
        tags: ["legacy-tag"],
        balance: { USD: 0, CNY: 0 },
        todayConsumption: { USD: 0, CNY: 0 },
        todayIncome: { USD: 0, CNY: 0 },
      }))
      return Array.isArray(input) ? display : display[0]
    })

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().orderedAccountIds).toEqual([
        "acc-2",
        "bookmark-1",
        "acc-1",
      ])
      expect(getLatestCtx().pinnedAccountIds).toEqual(["bookmark-1", "acc-1"])
      expect(getLatestCtx().tags).toEqual([
        { id: "tag-2", name: "alpha" },
        { id: "tag-1", name: "Beta" },
      ])
      expect(getLatestCtx().tagCountsById).toEqual({
        missing: 1,
        "tag-1": 1,
        "tag-2": 2,
      })
      expect(getLatestCtx().displayData).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "acc-1",
            tags: ["alpha"],
          }),
          expect.objectContaining({
            id: "acc-2",
            tags: ["Beta", "alpha"],
          }),
        ]),
      )
      expect(getLatestCtx().lastUpdateTime?.getTime()).toBe(1_710_000_100_000)
      expect(getLatestCtx().isInitialLoad).toBe(false)
    })
  })

  it("reloads tag data after create, rename, and delete operations", async () => {
    let currentTagStore = {
      version: 1,
      tagsById: {},
    }

    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetAllAccounts.mockResolvedValue([])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue([])
    mockGetPinnedList.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue(createEmptyStats())
    mockGetTagStore.mockImplementation(async () => currentTagStore as any)

    mockCreateTag.mockImplementation(async (name: string) => {
      const created = { id: "tag-1", name }
      currentTagStore = {
        version: 1,
        tagsById: { "tag-1": created },
      }
      return created
    })
    mockRenameTag.mockImplementation(async (tagId: string, name: string) => {
      const updated = { id: tagId, name }
      currentTagStore = {
        version: 1,
        tagsById: { [tagId]: updated },
      }
      return updated
    })
    mockDeleteTag.mockImplementation(async () => {
      currentTagStore = {
        version: 1,
        tagsById: {},
      }
      return { updatedAccounts: 2 }
    })

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().tags).toEqual([])
    })

    await act(async () => {
      await expect(getLatestCtx().createTag("Work")).resolves.toEqual({
        id: "tag-1",
        name: "Work",
      })
    })
    await waitFor(() => {
      expect(getLatestCtx().tags).toEqual([{ id: "tag-1", name: "Work" }])
    })

    await act(async () => {
      await expect(
        getLatestCtx().renameTag("tag-1", "Office"),
      ).resolves.toEqual({
        id: "tag-1",
        name: "Office",
      })
    })
    await waitFor(() => {
      expect(getLatestCtx().tags).toEqual([{ id: "tag-1", name: "Office" }])
    })

    await act(async () => {
      await expect(getLatestCtx().deleteTag("tag-1")).resolves.toEqual({
        updatedAccounts: 2,
      })
    })
    await waitFor(() => {
      expect(getLatestCtx().tags).toEqual([])
    })
  })

  it("reorders bookmarks with bookmark-scoped pinned persistence", async () => {
    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([])
    mockGetAllBookmarks.mockResolvedValue([
      { id: "b1" },
      { id: "b2" },
      { id: "b3" },
    ])
    mockGetOrderedList.mockResolvedValue(["b1", "b2", "b3"])
    mockGetPinnedList.mockResolvedValue(["b1", "b2"])
    mockGetAccountStats.mockResolvedValue(createEmptyStats())
    mockSetPinnedListSubset.mockResolvedValue(true)
    mockSetOrderedListSubset.mockResolvedValue(true)

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().pinnedAccountIds).toEqual(["b1", "b2"])
    })

    mockGetPinnedList.mockResolvedValueOnce(["b2", "b1"])
    mockGetOrderedList.mockResolvedValueOnce(["b2", "b1", "b3"])

    await act(async () => {
      await getLatestCtx().handleBookmarkReorder(["b2", "b1", "b3"])
    })

    expect(mockSetPinnedListSubset).toHaveBeenCalledWith({
      entryType: "bookmark",
      ids: ["b2", "b1"],
    })
    expect(mockSetOrderedListSubset).toHaveBeenCalledWith({
      entryType: "bookmark",
      ids: ["b2", "b1", "b3"],
    })

    await waitFor(() => {
      expect(getLatestCtx().pinnedAccountIds).toEqual(["b2", "b1"])
      expect(getLatestCtx().orderedAccountIds).toEqual(["b2", "b1", "b3"])
    })
  })

  it("toggles pin state through the provider and keeps local pinned ids in sync", async () => {
    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([])
    mockGetAllBookmarks.mockResolvedValue([{ id: "acc-1" }])
    mockGetOrderedList.mockResolvedValue(["acc-1"])
    mockGetPinnedList.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue(createEmptyStats())
    mockPinAccount.mockResolvedValue(true)
    mockUnpinAccount.mockResolvedValue(true)

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().pinnedAccountIds).toEqual([])
      expect(getLatestCtx().orderedAccountIds).toEqual(["acc-1"])
    })

    await act(async () => {
      await expect(getLatestCtx().togglePinAccount("acc-1")).resolves.toBe(true)
    })

    expect(mockPinAccount).toHaveBeenCalledWith("acc-1")
    await waitFor(() => {
      expect(getLatestCtx().pinnedAccountIds).toEqual(["acc-1"])
      expect(getLatestCtx().isAccountPinned("acc-1")).toBe(true)
    })

    await act(async () => {
      await expect(getLatestCtx().togglePinAccount("acc-1")).resolves.toBe(true)
    })

    expect(mockUnpinAccount).toHaveBeenCalledWith("acc-1")
    await waitFor(() => {
      expect(getLatestCtx().pinnedAccountIds).toEqual([])
      expect(getLatestCtx().isAccountPinned("acc-1")).toBe(false)
    })
  })

  it("keeps local pin state unchanged when pin and unpin persistence fail", async () => {
    mockGetAllBookmarks.mockResolvedValue([{ id: "acc-1" }])
    mockGetOrderedList.mockResolvedValue(["acc-1"])
    mockGetPinnedList.mockResolvedValue([])
    mockPinAccount.mockResolvedValue(false)
    mockUnpinAccount.mockResolvedValue(false)

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().pinnedAccountIds).toEqual([])
    })

    await act(async () => {
      await expect(getLatestCtx().pinAccount("acc-1")).resolves.toBe(false)
    })

    expect(getLatestCtx().pinnedAccountIds).toEqual([])
    expect(getLatestCtx().isAccountPinned("acc-1")).toBe(false)

    mockGetPinnedList.mockResolvedValue(["acc-1"])
    const repinnedCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(repinnedCtx().pinnedAccountIds).toEqual(["acc-1"])
    })

    await act(async () => {
      await expect(repinnedCtx().unpinAccount("acc-1")).resolves.toBe(false)
    })

    expect(repinnedCtx().pinnedAccountIds).toEqual(["acc-1"])
    expect(repinnedCtx().isAccountPinned("acc-1")).toBe(true)
  })
})

describe("AccountDataContext current tab detection", () => {
  it("detects same-origin accounts and matches the active website user to a specific stored account", async () => {
    const matchingAccount = {
      id: "acc-2",
      site_url: "https://api.example.com/v1",
      account_info: { id: 42 },
      last_sync_time: 0,
    }
    const sameSiteDifferentUser = {
      id: "acc-1",
      site_url: "https://api.example.com/dashboard",
      account_info: { id: 7 },
      last_sync_time: 0,
    }
    const otherSite = {
      id: "acc-3",
      site_url: "https://other.example.com",
      account_info: { id: 99 },
      last_sync_time: 0,
    }

    mockGetAllAccounts.mockResolvedValue([
      sameSiteDifferentUser,
      matchingAccount,
      otherSite,
    ])
    mockGetActiveTabs.mockResolvedValue([
      createBrowserTab({ id: 7, url: "https://api.example.com/settings" }),
    ])
    vi.mocked(globalThis.browser.tabs.sendMessage).mockResolvedValue({
      success: true,
      data: { userId: 42 },
    } as any)

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(
        getLatestCtx().detectedSiteAccounts.map((account) => account.id),
      ).toEqual(["acc-1", "acc-2"])
      expect(getLatestCtx().detectedAccount?.id).toBe("acc-2")
    })

    expect(globalThis.browser.tabs.sendMessage).toHaveBeenCalledWith(7, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: "https://api.example.com",
    })
  })

  it("keeps site-level detection but clears the exact account when user verification fails", async () => {
    const sameSiteAccount = {
      id: "acc-1",
      site_url: "https://api.example.com/v1",
      account_info: { id: 7 },
      last_sync_time: 0,
    }

    mockGetAllAccounts.mockResolvedValue([sameSiteAccount])
    mockGetActiveTabs.mockResolvedValue([
      createBrowserTab({ id: 8, url: "https://api.example.com/settings" }),
    ])
    vi.mocked(globalThis.browser.tabs.sendMessage).mockRejectedValue(
      new Error("content script unavailable"),
    )

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(
        getLatestCtx().detectedSiteAccounts.map((account) => account.id),
      ).toEqual(["acc-1"])
      expect(getLatestCtx().detectedAccount).toBeNull()
      expect(getLatestCtx().isDetecting).toBe(false)
    })
  })

  it("ignores non-web active tabs and clears any existing detection hints", async () => {
    mockGetAllAccounts.mockResolvedValue([
      {
        id: "acc-1",
        site_url: "https://api.example.com",
        account_info: { id: 7 },
        last_sync_time: 0,
      },
    ])
    mockGetActiveTabs.mockResolvedValue([
      createBrowserTab({ id: 9, url: "chrome://extensions" }),
    ])

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().detectedSiteAccounts).toEqual([])
      expect(getLatestCtx().detectedAccount).toBeNull()
      expect(getLatestCtx().isDetecting).toBe(false)
    })

    expect(globalThis.browser.tabs.sendMessage).not.toHaveBeenCalled()
  })

  it("clears previously detected hints when the active tab context disappears", async () => {
    const matchingAccount = {
      id: "acc-1",
      site_url: "https://api.example.com/v1",
      account_info: { id: 7 },
      last_sync_time: 0,
    }

    let activeTabs: Array<{ id?: number; url?: string }> = [
      { id: 7, url: "https://api.example.com/settings" },
    ]
    const activatedListeners: Array<() => void | Promise<void>> = []

    mockGetAllAccounts.mockResolvedValue([matchingAccount])
    mockGetActiveTabs.mockImplementation(async () => activeTabs as any)
    mockOnTabActivated.mockImplementation((listener: any) => {
      activatedListeners.push(listener)
      return () => {
        const index = activatedListeners.indexOf(listener)
        if (index >= 0) {
          activatedListeners.splice(index, 1)
        }
      }
    })
    vi.mocked(globalThis.browser.tabs.sendMessage).mockResolvedValue({
      success: true,
      data: { userId: 7 },
    } as any)

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(
        getLatestCtx().detectedSiteAccounts.map((account) => account.id),
      ).toEqual(["acc-1"])
      expect(getLatestCtx().detectedAccount?.id).toBe("acc-1")
    })

    activeTabs = []

    await act(async () => {
      for (const listener of activatedListeners) {
        await listener()
      }
    })

    await waitFor(() => {
      expect(getLatestCtx().detectedSiteAccounts).toEqual([])
      expect(getLatestCtx().detectedAccount).toBeNull()
      expect(getLatestCtx().isDetecting).toBe(false)
    })

    expect(globalThis.browser.tabs.sendMessage).toHaveBeenCalledTimes(1)
  })

  it("rechecks only when the updated tab is still active", async () => {
    const matchingAccount = {
      id: "acc-1",
      site_url: "https://api.example.com/v1",
      account_info: { id: 7 },
      last_sync_time: 0,
    }

    let activeTabs: Array<{ id: number; url: string }> = [
      { id: 7, url: "https://api.example.com/settings" },
    ]
    const updatedListeners: Array<(tabId: number) => void | Promise<void>> = []

    mockGetAllAccounts.mockResolvedValue([matchingAccount])
    mockGetActiveTabs.mockImplementation(async () => activeTabs as any)
    mockOnTabUpdated.mockImplementation((listener: any) => {
      updatedListeners.push(listener)
      return () => {
        const index = updatedListeners.indexOf(listener)
        if (index >= 0) {
          updatedListeners.splice(index, 1)
        }
      }
    })
    vi.mocked(globalThis.browser.tabs.sendMessage).mockResolvedValue({
      success: true,
      data: { userId: 7 },
    } as any)

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().detectedAccount?.id).toBe("acc-1")
    })

    activeTabs = [{ id: 7, url: "https://api.example.com/profile" }]

    await act(async () => {
      for (const listener of updatedListeners) {
        await listener(999)
      }
    })

    expect(globalThis.browser.tabs.sendMessage).toHaveBeenCalledTimes(1)

    await act(async () => {
      for (const listener of updatedListeners) {
        await listener(7)
      }
    })

    await waitFor(() => {
      expect(globalThis.browser.tabs.sendMessage).toHaveBeenCalledTimes(2)
      expect(getLatestCtx().detectedAccount?.id).toBe("acc-1")
    })
  })
})

describe("AccountDataContext refresh orchestration", () => {
  it("refreshes data on demand, exposes the pending state, and stores the returned sync time", async () => {
    let resolveRefresh!: (value: any) => void
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve
    })

    mockGetAllAccounts.mockResolvedValue([
      {
        id: "acc-1",
        site_url: "https://api.example.com",
        account_info: { id: 1 },
        last_sync_time: 0,
      },
    ])
    mockRefreshAllAccounts.mockReturnValueOnce(refreshPromise)

    const getLatestCtx = await renderAccountDataProvider()

    await act(async () => {
      void getLatestCtx().handleRefresh(true)
    })

    await waitFor(() => {
      expect(getLatestCtx().isRefreshing).toBe(true)
    })

    resolveRefresh({
      success: 1,
      failed: 0,
      refreshedCount: 1,
      latestSyncTime: 1_710_123_456_789,
    })

    await waitFor(() => {
      expect(getLatestCtx().isRefreshing).toBe(false)
      expect(getLatestCtx().lastUpdateTime?.getTime()).toBe(1_710_123_456_789)
    })

    expect(mockRefreshAllAccounts).toHaveBeenCalledWith(true)
  })

  it("reloads account data after refresh failures and clears the refreshing state", async () => {
    mockGetAllAccounts.mockResolvedValue([{ id: "acc-1" }])
    mockRefreshAllAccounts.mockRejectedValueOnce(new Error("refresh failed"))

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().isInitialLoad).toBe(false)
    })

    const initialLoadCalls = mockGetAllAccounts.mock.calls.length

    await act(async () => {
      await expect(getLatestCtx().handleRefresh()).rejects.toThrow(
        "refresh failed",
      )
    })

    await waitFor(() => {
      expect(getLatestCtx().isRefreshing).toBe(false)
      expect(mockGetAllAccounts.mock.calls.length).toBeGreaterThan(
        initialLoadCalls,
      )
    })
  })

  it("announces refresh-on-open through toast.promise and exposes the partial-skip message path", async () => {
    mockUserPreferencesContext.current = {
      ...mockUserPreferencesContext.current,
      refreshOnOpen: true,
    }
    mockGetAllAccounts.mockResolvedValue([
      {
        id: "acc-1",
        site_url: "https://api.example.com",
        account_info: { id: 1 },
        last_sync_time: 1_710_000_000_000,
      },
    ])
    mockRefreshAllAccounts.mockResolvedValue({
      success: 2,
      failed: 0,
      refreshedCount: 1,
      latestSyncTime: 1_710_000_000_000,
    })

    await renderAccountDataProvider()

    await waitFor(() => {
      expect(mockToastPromise).toHaveBeenCalledTimes(1)
      expect(mockRefreshAllAccounts).toHaveBeenCalledWith(false)
    })

    const [, toastOptions] = mockToastPromise.mock.calls[0]
    const t = testI18n.getFixedT(null, "account")
    expect(
      toastOptions.success({ success: 2, failed: 0, refreshedCount: 1 }),
    ).toBe(
      t("refresh.refreshPartialSkipped", {
        success: 1,
        skipped: 1,
      }),
    )
  })

  it("uses the zero-result and failed-result refresh-on-open toast branches", async () => {
    mockUserPreferencesContext.current = {
      ...mockUserPreferencesContext.current,
      refreshOnOpen: true,
    }
    mockGetAllAccounts.mockResolvedValue([
      {
        id: "acc-1",
        site_url: "https://api.example.com",
        account_info: { id: 1 },
        last_sync_time: 0,
      },
    ])
    mockRefreshAllAccounts.mockResolvedValue({
      success: 0,
      failed: 0,
      refreshedCount: 0,
      latestSyncTime: 0,
    })

    await renderAccountDataProvider()

    await waitFor(() => {
      expect(mockToastPromise).toHaveBeenCalledTimes(1)
    })

    const [, toastOptions] = mockToastPromise.mock.calls[0]
    const t = testI18n.getFixedT(null, "account")

    expect(
      toastOptions.success({ success: 0, failed: 0, refreshedCount: 0 }),
    ).toBeNull()
    expect(
      toastOptions.success({ success: 1, failed: 2, refreshedCount: 1 }),
    ).toBe(
      t("refresh.refreshComplete", {
        success: 1,
        failed: 2,
      }),
    )
  })

  it("reloads account data when background refresh and tag-store runtime messages arrive", async () => {
    mockGetAllAccounts.mockResolvedValue([{ id: "acc-1", last_sync_time: 0 }])

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().isInitialLoad).toBe(false)
      expect(mockGetAllAccounts.mock.calls.length).toBeGreaterThan(0)
    })

    const initialLoadCalls = mockGetAllAccounts.mock.calls.length
    const listener = (globalThis as any).__accountDataContextRuntimeListener as
      | ((message: any) => void)
      | undefined
    expect(listener).toBeTypeOf("function")

    await act(async () => {
      listener!({
        type: "AUTO_REFRESH_UPDATE",
        payload: { type: "refresh_completed" },
      })
      listener!({
        type: "TAG_STORE_UPDATE",
      })
    })

    await waitFor(() => {
      expect(mockGetAllAccounts.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    expect(initialLoadCalls).toBeGreaterThan(0)
  })
})

describe("AccountDataContext sorting behavior", () => {
  it("ignores hidden today-cashflow sorts and falls back invalid saved selections to balance", async () => {
    mockUserPreferencesContext.current = {
      ...mockUserPreferencesContext.current,
      showTodayCashflow: false,
      sortField: DATA_TYPE_CONSUMPTION,
      sortOrder: "asc",
    }

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().sortField).toBe(DATA_TYPE_BALANCE)
    })

    expect(mockUpdateSortConfig).toHaveBeenCalledWith(DATA_TYPE_BALANCE, "asc")

    mockUpdateSortConfig.mockClear()

    act(() => {
      getLatestCtx().handleSort(DATA_TYPE_CONSUMPTION)
    })

    expect(getLatestCtx().sortField).toBe(DATA_TYPE_BALANCE)
    expect(mockUpdateSortConfig).not.toHaveBeenCalled()
  })

  it("toggles sort order when the same field is selected twice", async () => {
    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().sortField).toBe("name")
      expect(getLatestCtx().sortOrder).toBe("asc")
    })

    act(() => {
      getLatestCtx().handleSort(DATA_TYPE_BALANCE)
    })

    await waitFor(() => {
      expect(getLatestCtx().sortField).toBe(DATA_TYPE_BALANCE)
      expect(getLatestCtx().sortOrder).toBe("asc")
    })

    act(() => {
      getLatestCtx().handleSort(DATA_TYPE_BALANCE)
    })

    await waitFor(() => {
      expect(getLatestCtx().sortField).toBe(DATA_TYPE_BALANCE)
      expect(getLatestCtx().sortOrder).toBe("desc")
    })

    expect(mockUpdateSortConfig).toHaveBeenNthCalledWith(
      1,
      DATA_TYPE_BALANCE,
      "asc",
    )
    expect(mockUpdateSortConfig).toHaveBeenNthCalledWith(
      2,
      DATA_TYPE_BALANCE,
      "desc",
    )
  })

  it("initializes created-time sorting to newest first and then toggles", async () => {
    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().sortField).toBe("name")
      expect(getLatestCtx().sortOrder).toBe("asc")
    })

    act(() => {
      getLatestCtx().handleSort(DATA_TYPE_CREATED_AT)
    })

    await waitFor(() => {
      expect(getLatestCtx().sortField).toBe(DATA_TYPE_CREATED_AT)
      expect(getLatestCtx().sortOrder).toBe("desc")
    })

    act(() => {
      getLatestCtx().handleSort(DATA_TYPE_CREATED_AT)
    })

    await waitFor(() => {
      expect(getLatestCtx().sortField).toBe(DATA_TYPE_CREATED_AT)
      expect(getLatestCtx().sortOrder).toBe("asc")
    })

    expect(mockUpdateSortConfig).toHaveBeenNthCalledWith(
      1,
      DATA_TYPE_CREATED_AT,
      "desc",
    )
    expect(mockUpdateSortConfig).toHaveBeenNthCalledWith(
      2,
      DATA_TYPE_CREATED_AT,
      "asc",
    )
  })

  it("prioritizes accounts matched by open tabs when that sorting criterion is enabled", async () => {
    mockUserPreferencesContext.current = {
      ...mockUserPreferencesContext.current,
      sortField: "name",
      sortOrder: "asc",
      sortingPriorityConfig: {
        lastModified: Date.now(),
        criteria: [
          {
            id: SortingCriteriaType.MATCHED_OPEN_TABS,
            enabled: true,
            priority: 0,
          },
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 1,
          },
        ],
      },
    }

    mockGetAllAccounts.mockResolvedValue([
      {
        id: "acc-a",
        site_url: "https://a.example.com",
        account_info: { id: 1 },
        last_sync_time: 0,
      },
      {
        id: "acc-b",
        site_url: "https://b.example.com",
        account_info: { id: 2 },
        last_sync_time: 0,
      },
    ])
    mockConvertToDisplayData.mockReturnValue([
      {
        id: "acc-a",
        name: "Alpha",
        balance: { USD: 0, CNY: 0 },
        todayConsumption: { USD: 0, CNY: 0 },
        todayIncome: { USD: 0, CNY: 0 },
      },
      {
        id: "acc-b",
        name: "Beta",
        balance: { USD: 0, CNY: 0 },
        todayConsumption: { USD: 0, CNY: 0 },
        todayIncome: { USD: 0, CNY: 0 },
      },
    ])
    mockGetAllTabs.mockResolvedValue([
      createBrowserTab({
        id: 10,
        url: "https://b.example.com/dashboard",
        title: "Beta workspace",
      }),
    ])
    const builtIndex = createMockIndexedAccountSearchEntries([
      { id: "acc-a" } as DisplaySiteData,
      { id: "acc-b" } as DisplaySiteData,
    ])
    mockBuildAccountSearchIndex.mockReturnValue(builtIndex)
    mockSearchAccountSearchIndex.mockImplementation(
      (_indexedAccounts, query: string) => {
        if (query === "https://b.example.com/dashboard") {
          return [
            {
              account: { id: "acc-b" } as DisplaySiteData,
              score: 4,
              matchedFields: [],
            },
          ]
        }
        if (query === "Beta workspace") {
          return [
            {
              account: { id: "acc-b" } as DisplaySiteData,
              score: 2,
              matchedFields: [],
            },
          ]
        }
        return []
      },
    )

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().sortedData.map((item) => item.id)).toEqual([
        "acc-b",
        "acc-a",
      ])
    })

    expect(mockSearchAccountSearchIndex).toHaveBeenCalledWith(
      builtIndex,
      "https://b.example.com/dashboard",
    )
    expect(mockSearchAccountSearchIndex).toHaveBeenCalledWith(
      builtIndex,
      "Beta workspace",
    )
  })
})

describe("AccountDataContext auto-checkin runCompleted handling", () => {
  it("updates only accounts listed in updatedAccountIds", async () => {
    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })

    const accountA: any = {
      id: "a",
      checkIn: { siteStatus: { isCheckedInToday: false } },
    }
    const accountB: any = {
      id: "b",
      checkIn: { siteStatus: { isCheckedInToday: false } },
    }

    mockGetAllAccounts.mockResolvedValue([accountA, accountB])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue(["a", "b"])
    mockGetPinnedList.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue({
      total_quota: 0,
      today_total_consumption: 0,
      today_total_requests: 0,
      today_total_prompt_tokens: 0,
      today_total_completion_tokens: 0,
      today_total_income: 0,
    })

    mockConvertToDisplayData.mockImplementation((input: any) => {
      const accounts = Array.isArray(input) ? input : [input]
      const display = accounts.map((account: any) => ({
        id: account.id,
        name: account.id,
        checkIn: account.checkIn,
      }))
      return Array.isArray(input) ? display : display[0]
    })

    const updatedAccountA: any = {
      id: "a",
      checkIn: { siteStatus: { isCheckedInToday: true } },
    }
    mockGetAccountById.mockResolvedValue(updatedAccountA)

    let latestCtx: ReturnType<typeof useAccountDataContext> | null = null

    render(
      <I18nextProvider i18n={testI18n}>
        <AccountDataProvider>
          <ContextProbe onChange={(ctx) => (latestCtx = ctx)} />
        </AccountDataProvider>
      </I18nextProvider>,
    )

    await waitFor(() => {
      expect(latestCtx?.displayData).toHaveLength(2)
    })

    const listener = (globalThis as any).__accountDataContextRuntimeListener as
      | ((message: any) => void)
      | undefined
    expect(listener).toBeTypeOf("function")

    await act(async () => {
      listener!({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        updatedAccountIds: ["a"],
      })
    })

    await waitFor(() => {
      const byId = Object.fromEntries(
        (latestCtx?.displayData ?? []).map((item: any) => [item.id, item]),
      )
      expect(byId.a?.checkIn?.siteStatus?.isCheckedInToday).toBe(true)
      expect(byId.b?.checkIn?.siteStatus?.isCheckedInToday).toBe(false)
    })

    expect(mockGetAccountById).toHaveBeenCalledTimes(1)
    expect(mockGetAccountById).toHaveBeenCalledWith("a")
  })

  it("skips reload work when auto-checkin completion does not include any valid account ids", async () => {
    mockGetAllAccounts.mockResolvedValue([{ id: "a" }])

    await renderAccountDataProvider()

    mockGetAllAccounts.mockClear()

    const listener = (globalThis as any).__accountDataContextRuntimeListener as
      | ((message: any) => void)
      | undefined
    expect(listener).toBeTypeOf("function")

    mockGetAllAccounts.mockClear()

    await act(async () => {
      listener!({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        updatedAccountIds: ["", null, 0, undefined],
      })
    })

    await waitFor(() => {
      expect(mockGetAccountById).not.toHaveBeenCalled()
    })
  })

  it("appends newly reloaded accounts that were not in the previous snapshot", async () => {
    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })

    const accountA: any = {
      id: "a",
      checkIn: { siteStatus: { isCheckedInToday: false } },
    }

    mockGetAllAccounts.mockResolvedValue([accountA])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue(["a"])
    mockGetPinnedList.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue(createEmptyStats())

    mockConvertToDisplayData.mockImplementation((input: any) => {
      const accounts = Array.isArray(input) ? input : [input]
      const display = accounts.map((account: any) => ({
        id: account.id,
        name: account.id,
        checkIn: account.checkIn,
      }))
      return Array.isArray(input) ? display : display[0]
    })

    mockGetAccountById.mockResolvedValue({
      id: "b",
      checkIn: { siteStatus: { isCheckedInToday: true } },
    })

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().displayData.map((item) => item.id)).toEqual(["a"])
    })

    const listener = (globalThis as any).__accountDataContextRuntimeListener as
      | ((message: any) => void)
      | undefined
    expect(listener).toBeTypeOf("function")

    await act(async () => {
      listener!({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        updatedAccountIds: ["b"],
      })
    })

    await waitFor(() => {
      expect(getLatestCtx().displayData.map((item) => item.id)).toEqual([
        "a",
        "b",
      ])
    })
  })

  it("falls back to loadAccountData() when a targeted reload fails", async () => {
    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([{ id: "a" }, { id: "b" }])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue(["a", "b"])
    mockGetPinnedList.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue({
      total_quota: 0,
      today_total_consumption: 0,
      today_total_requests: 0,
      today_total_prompt_tokens: 0,
      today_total_completion_tokens: 0,
      today_total_income: 0,
    })
    mockConvertToDisplayData.mockReturnValue([{ id: "a" }, { id: "b" }])

    render(
      <I18nextProvider i18n={testI18n}>
        <AccountDataProvider>
          <ContextProbe onChange={vi.fn()} />
        </AccountDataProvider>
      </I18nextProvider>,
    )

    await waitFor(() => {
      expect(mockGetAllAccounts).toHaveBeenCalled()
    })

    mockGetAllAccounts.mockClear()
    mockGetAccountById.mockResolvedValue(null)

    const listener = (globalThis as any).__accountDataContextRuntimeListener as
      | ((message: any) => void)
      | undefined
    expect(listener).toBeTypeOf("function")

    await act(async () => {
      listener!({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        updatedAccountIds: ["missing"],
      })
    })

    await waitFor(() => {
      expect(mockGetAllAccounts).toHaveBeenCalledTimes(1)
    })
  })

  it("merges concurrent targeted reloads against the latest account snapshot", async () => {
    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })

    const accountA: any = {
      id: "a",
      checkIn: { siteStatus: { isCheckedInToday: false } },
    }
    const accountB: any = {
      id: "b",
      checkIn: { siteStatus: { isCheckedInToday: false } },
    }

    mockGetAllAccounts.mockResolvedValue([accountA, accountB])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue(["a", "b"])
    mockGetPinnedList.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue({
      total_quota: 0,
      today_total_consumption: 0,
      today_total_requests: 0,
      today_total_prompt_tokens: 0,
      today_total_completion_tokens: 0,
      today_total_income: 0,
    })

    mockConvertToDisplayData.mockImplementation((input: any) => {
      const accounts = Array.isArray(input) ? input : [input]
      const display = accounts.map((account: any) => ({
        id: account.id,
        name: account.id,
        checkIn: account.checkIn,
      }))
      return Array.isArray(input) ? display : display[0]
    })

    let resolveReloadA!: (value: any) => void
    let resolveReloadB!: (value: any) => void
    const reloadAPromise = new Promise<any>((resolve) => {
      resolveReloadA = resolve
    })
    const reloadBPromise = new Promise<any>((resolve) => {
      resolveReloadB = resolve
    })

    mockGetAccountById.mockImplementation((accountId: string) => {
      if (accountId === "a") {
        return reloadAPromise
      }
      if (accountId === "b") {
        return reloadBPromise
      }
      return Promise.resolve(null)
    })

    let latestCtx: ReturnType<typeof useAccountDataContext> | null = null

    render(
      <I18nextProvider i18n={testI18n}>
        <AccountDataProvider>
          <ContextProbe onChange={(ctx) => (latestCtx = ctx)} />
        </AccountDataProvider>
      </I18nextProvider>,
    )

    await waitFor(() => {
      expect(latestCtx?.displayData).toHaveLength(2)
    })

    const listener = (globalThis as any).__accountDataContextRuntimeListener as
      | ((message: any) => void)
      | undefined
    expect(listener).toBeTypeOf("function")

    await act(async () => {
      listener!({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        updatedAccountIds: ["a"],
      })
      listener!({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        updatedAccountIds: ["b"],
      })
    })

    await act(async () => {
      resolveReloadA({
        id: "a",
        checkIn: { siteStatus: { isCheckedInToday: true } },
      })
      await reloadAPromise
    })

    await waitFor(() => {
      const byId = Object.fromEntries(
        (latestCtx?.displayData ?? []).map((item: any) => [item.id, item]),
      )
      expect(byId.a?.checkIn?.siteStatus?.isCheckedInToday).toBe(true)
      expect(byId.b?.checkIn?.siteStatus?.isCheckedInToday).toBe(false)
    })

    await act(async () => {
      resolveReloadB({
        id: "b",
        checkIn: { siteStatus: { isCheckedInToday: true } },
      })
      await reloadBPromise
    })

    await waitFor(() => {
      const byId = Object.fromEntries(
        (latestCtx?.displayData ?? []).map((item: any) => [item.id, item]),
      )
      expect(byId.a?.checkIn?.siteStatus?.isCheckedInToday).toBe(true)
      expect(byId.b?.checkIn?.siteStatus?.isCheckedInToday).toBe(true)
    })
  })
})
