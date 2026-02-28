import { act, render, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  AccountDataProvider,
  useAccountDataContext,
} from "~/features/AccountManagement/hooks/AccountDataContext"
import i18nInstance from "~/tests/test-utils/i18n"

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
    checkUrlExists: vi.fn(async () => null),
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
    sortField: "name",
    sortOrder: "asc",
    updateSortConfig: vi.fn(),
    refreshOnOpen: false,
    sortingPriorityConfig: {
      lastModified: Date.now(),
      criteria: [
        { id: "pinned", enabled: true, priority: 0 },
        { id: "manual_order", enabled: true, priority: 1 },
      ],
    },
  }),
}))

vi.mock("~/utils/browserApi", () => ({
  getActiveTabs: vi.fn(async () => []),
  getAllTabs: vi.fn(async () => []),
  onRuntimeMessage: vi.fn((listener: any) => {
    ;(globalThis as any).__accountDataContextRuntimeListener = listener
    return () => {
      ;(globalThis as any).__accountDataContextRuntimeListener = undefined
    }
  }),
  onTabActivated: vi.fn(() => () => {}),
  onTabRemoved: vi.fn(() => () => {}),
  onTabUpdated: vi.fn(() => () => {}),
}))

vi.mock("~/services/search/accountSearch", () => ({
  searchAccounts: vi.fn(() => []),
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
      <I18nextProvider i18n={i18nInstance}>
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
      <I18nextProvider i18n={i18nInstance}>
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
      <I18nextProvider i18n={i18nInstance}>
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
      <I18nextProvider i18n={i18nInstance}>
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
})
