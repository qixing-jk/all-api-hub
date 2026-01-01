import { act, render, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it, vi } from "vitest"

import {
  AccountDataProvider,
  useAccountDataContext,
} from "~/features/AccountManagement/hooks/AccountDataContext"
import i18nInstance from "~/tests/test-utils/i18n"

const {
  mockGetAllAccounts,
  mockGetOrderedList,
  mockGetPinnedList,
  mockGetAccountStats,
  mockConvertToDisplayData,
  mockResetExpiredCheckIns,
  mockSetPinnedList,
  mockSetOrderedList,
} = vi.hoisted(() => ({
  mockGetAllAccounts: vi.fn(),
  mockGetOrderedList: vi.fn(),
  mockGetPinnedList: vi.fn(),
  mockGetAccountStats: vi.fn(),
  mockConvertToDisplayData: vi.fn(),
  mockResetExpiredCheckIns: vi.fn(),
  mockSetPinnedList: vi.fn(),
  mockSetOrderedList: vi.fn(),
}))

vi.mock("~/services/accountStorage", () => ({
  accountStorage: {
    resetExpiredCheckIns: mockResetExpiredCheckIns,
    getAllAccounts: mockGetAllAccounts,
    getOrderedList: mockGetOrderedList,
    getPinnedList: mockGetPinnedList,
    getAccountStats: mockGetAccountStats,
    convertToDisplayData: mockConvertToDisplayData,
    setPinnedList: mockSetPinnedList,
    setOrderedList: mockSetOrderedList,
    checkUrlExists: vi.fn(async () => null),
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
  onRuntimeMessage: vi.fn(() => () => {}),
  onTabActivated: vi.fn(() => () => {}),
  onTabRemoved: vi.fn(() => () => {}),
  onTabUpdated: vi.fn(() => () => {}),
}))

vi.mock("~/services/search/accountSearch", () => ({
  searchAccounts: vi.fn(() => []),
}))

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
    mockGetAllAccounts.mockResolvedValue([])
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
    mockSetPinnedList.mockResolvedValue(true)
    mockSetOrderedList.mockResolvedValue(true)

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

    expect(mockSetPinnedList).toHaveBeenCalledWith(["p-2", "p-1"])
    expect(mockSetOrderedList).toHaveBeenCalledWith(["p-2", "p-1", "u-1"])
  })

  it("keeps pinned list stable when non-pinned items move around", async () => {
    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetAllAccounts.mockResolvedValue([])
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
    mockSetPinnedList.mockResolvedValue(true)
    mockSetOrderedList.mockResolvedValue(true)

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

    mockSetPinnedList.mockClear()
    mockSetOrderedList.mockClear()

    await act(async () => {
      await latestCtx!.handleReorder(["u-1", "p-1", "p-2"])
    })

    expect(mockSetPinnedList).not.toHaveBeenCalled()
    expect(mockSetOrderedList).toHaveBeenCalledWith(["p-1", "p-2", "u-1"])
  })
})
