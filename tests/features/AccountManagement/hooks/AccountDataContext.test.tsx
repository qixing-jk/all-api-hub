import { act, render, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CHECK_IN_REQUIREMENT,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_CREATED_AT,
} from "~/constants"
import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { QUOTA_PER_USD } from "~/constants/money"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  AccountDataProvider,
  useAccountDataContext,
} from "~/features/AccountManagement/hooks/AccountDataContext"
import type { AccountManagementSnapshot } from "~/services/accounts/accountStorage/accountReadModels"
import { createEmptyAccountStats } from "~/services/accounts/accountTodayStats"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/compatibilityConfig"
import { getSelectedCheckInStatus } from "~/services/checkin/autoCheckin/inspection"
import { mergeCompatibilityCheckInStatus } from "~/services/checkin/autoCheckin/state"
import type {
  ProtectionBypassSurface,
  ProtectionBypassUserCommand,
} from "~/services/protectionBypass/contracts"
import { TAG_STORE_VERSION } from "~/services/tags/tagStoreUtils"
import type { ActiveSortField } from "~/types"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import type { CheckInConfig } from "~/types/checkIn"
import { DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION } from "~/types/dailyBalanceHistory"
import { SortingCriteriaType } from "~/types/sorting"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  automaticExecution,
  userCommandExecution,
} from "~~/tests/services/protectionBypass/fixtures"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { testI18n } from "~~/tests/test-utils/i18n"

function buildCheckInStatus(isCheckedInToday: boolean): CheckInConfig {
  return mergeCompatibilityCheckInStatus({
    config: createCompatibilityCheckInConfig({
      siteType: "new-api",
      supported: true,
      automaticExecutionEnabled: true,
    }),
    methodId: AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
    isCheckedInToday,
    observedAt: 1,
  })
}

function readCheckInToday(config: CheckInConfig | undefined) {
  if (!config) return undefined

  const status = getSelectedCheckInStatus({ config, siteType: "new-api" })
  return status?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known
    ? status.today
    : undefined
}

const {
  mockLogger,
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
  mockSetAccountListOrder,
  mockSetPinnedListSubset,
  mockSetOrderedListSubset,
  mockGetTagStore,
  mockGetDailyBalanceHistoryStore,
  mockCreateTag,
  mockRenameTag,
  mockDeleteTag,
  mockPinAccount,
  mockUnpinAccount,
  mockRefreshAllAccounts,
  mockRefreshDisabledAccounts,
  mockToastPromise,
  mockReadAccountBrowserIdentityFromTab,
  mockGetActiveTabs,
  mockGetAllTabs,
  mockSendTabMessage,
  mockOnRuntimeMessage,
  mockOnTabActivated,
  mockOnTabRemoved,
  mockOnTabUpdated,
  mockUpdateSortConfig,
  mockGetCurrentTempWindowRequestSource,
  mockWithProtectionBypassUserCommand,
} = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
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
  mockSetAccountListOrder: vi.fn(),
  mockSetPinnedListSubset: vi.fn(),
  mockSetOrderedListSubset: vi.fn(),
  mockGetTagStore: vi.fn(),
  mockGetDailyBalanceHistoryStore: vi.fn(),
  mockCreateTag: vi.fn(),
  mockRenameTag: vi.fn(),
  mockDeleteTag: vi.fn(),
  mockPinAccount: vi.fn(),
  mockUnpinAccount: vi.fn(),
  mockRefreshAllAccounts: vi.fn(),
  mockRefreshDisabledAccounts: vi.fn(),
  mockToastPromise: vi.fn(),
  mockReadAccountBrowserIdentityFromTab: vi.fn(),
  mockGetActiveTabs: vi.fn<() => Promise<browser.tabs.Tab[]>>(async () => []),
  mockGetAllTabs: vi.fn<() => Promise<browser.tabs.Tab[]>>(async () => []),
  mockSendTabMessage: vi.fn(
    (
      tabId: number,
      message: unknown,
      options?: browser.tabs._SendMessageOptions,
    ) =>
      typeof options === "undefined"
        ? globalThis.browser.tabs.sendMessage(tabId, message)
        : globalThis.browser.tabs.sendMessage(tabId, message, options),
  ),
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
  mockUpdateSortConfig: vi.fn(),
  mockGetCurrentTempWindowRequestSource: vi.fn(),
  mockWithProtectionBypassUserCommand: vi.fn(),
}))

const mockUserPreferencesContext = vi.hoisted(() => ({
  current: {
    currencyType: "USD",
    sortField: "name" as ActiveSortField,
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
    preferences: {
      balanceHistory: {
        estimatedTodayIncome: { enabled: false },
      },
    },
    showTodayCashflow: true,
  },
}))

vi.mock("~/lib/notify", () => ({
  default: {
    promise: mockToastPromise,
  },
}))

vi.mock("~/services/accounts/accountStorage/accountCheckInState", () => ({
  accountCheckInState: { resetExpiredCheckIns: mockResetExpiredCheckIns },
}))
vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: {
    getAllAccounts: mockGetAllAccounts,
    getAccountById: mockGetAccountById,
    checkUrlExists: vi.fn(async () => null),
  },
}))
vi.mock("~/services/accounts/accountStorage/accountReadModels", () => ({
  accountReadModels: {
    getAccountManagementSnapshot:
      async (): Promise<AccountManagementSnapshot> => {
        const accounts = await mockGetAllAccounts()
        return {
          accounts,
          displayAccounts: [],
          bookmarks: await mockGetAllBookmarks(),
          orderedIds: await mockGetOrderedList(),
          pinnedIds: await mockGetPinnedList(),
          stats: await mockGetAccountStats(),
        }
      },
  },
}))
vi.mock("~/services/accounts/accountStorage/accountPresentation", () => ({
  accountPresentation: { convertToDisplayData: mockConvertToDisplayData },
}))
vi.mock("~/services/accounts/accountStorage/accountEntryLayout", () => ({
  accountEntryLayout: {
    getPinnedList: mockGetPinnedList,
    getOrderedList: mockGetOrderedList,
    setPinnedList: mockSetPinnedList,
    setOrderedList: mockSetOrderedList,
    setAccountListOrder: mockSetAccountListOrder,
    setPinnedListSubset: mockSetPinnedListSubset,
    setOrderedListSubset: mockSetOrderedListSubset,
    pinAccount: mockPinAccount,
    unpinAccount: mockUnpinAccount,
  },
}))
vi.mock("~/services/accounts/accountStorage/accountRefresh", () => ({
  accountRefresh: {
    refreshAllAccounts: mockRefreshAllAccounts,
    refreshDisabledAccounts: mockRefreshDisabledAccounts,
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

vi.mock("~/services/history/dailyBalanceHistory/storage", () => ({
  dailyBalanceHistoryStorage: {
    getStore: mockGetDailyBalanceHistoryStore,
  },
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => mockUserPreferencesContext.current,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => mockLogger,
}))

vi.mock("~/utils/browser/tempWindowRequestSource", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/utils/browser/tempWindowRequestSource")
    >()
  return {
    ...actual,
    getCurrentTempWindowRequestSource: mockGetCurrentTempWindowRequestSource,
  }
})

vi.mock("~/services/protectionBypass/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/protectionBypass/client")>()
  return {
    ...actual,
    withProtectionBypassUserCommand: mockWithProtectionBypassUserCommand,
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    getActiveTabs: mockGetActiveTabs,
    getAllTabs: mockGetAllTabs,
    sendTabMessageWithRetry: mockSendTabMessage,
    onRuntimeMessage: mockOnRuntimeMessage,
    onTabActivated: mockOnTabActivated,
    onTabRemoved: mockOnTabRemoved,
    onTabUpdated: mockOnTabUpdated,
  }
})

vi.mock("~/services/accountBrowserSession/identityReader", () => ({
  readAccountBrowserIdentityFromTab: mockReadAccountBrowserIdentityFromTab,
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
  vi.spyOn(browser.runtime, "sendMessage").mockResolvedValue({
    success: true,
    tabIds: [],
  })
  mockGetAllAccounts.mockReset()
  mockGetAllBookmarks.mockReset()
  mockGetOrderedList.mockReset()
  mockGetPinnedList.mockReset()
  mockGetAccountStats.mockReset()
  mockConvertToDisplayData.mockReset()
  mockGetCurrentTempWindowRequestSource.mockReturnValue(
    TEMP_WINDOW_REQUEST_SOURCES.Background,
  )
  mockWithProtectionBypassUserCommand.mockImplementation(
    async (
      command: ProtectionBypassUserCommand,
      surface: ProtectionBypassSurface,
      work: (execution: unknown) => Promise<unknown>,
    ) => work(userCommandExecution(command, surface)),
  )

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
    preferences: {
      balanceHistory: {
        estimatedTodayIncome: { enabled: false },
      },
    },
    showTodayCashflow: true,
  }

  mockResetExpiredCheckIns.mockResolvedValue(undefined)
  mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
  mockGetDailyBalanceHistoryStore.mockResolvedValue({
    schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
    snapshotsByAccountId: {},
  })
  mockGetAllAccounts.mockResolvedValue([])
  mockGetAllBookmarks.mockResolvedValue([])
  mockGetOrderedList.mockResolvedValue([])
  mockGetPinnedList.mockResolvedValue([])
  mockGetAccountStats.mockResolvedValue(createEmptyStats())
  mockSetAccountListOrder.mockResolvedValue(true)
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
  mockRefreshDisabledAccounts.mockResolvedValue({
    processedCount: 0,
    failedCount: 0,
    reEnabledCount: 0,
    latestSyncTime: 0,
  })
  mockToastPromise.mockImplementation((promise: Promise<any>) => promise)
  mockReadAccountBrowserIdentityFromTab.mockResolvedValue(null)
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
  return createEmptyAccountStats()
}

describe("AccountDataContext initial statistics", () => {
  it("reads a batch of updated accounts once instead of loading the full envelope per account", async () => {
    const accounts = Array.from({ length: 100 }, (_, index) => ({
      id: `account-${index}`,
      tagIds: [],
    }))
    mockGetAllAccounts.mockResolvedValue(accounts)
    mockGetAccountById.mockImplementation(async (id: string) =>
      accounts.find((account) => account.id === id),
    )
    const getContext = await renderAccountDataProvider()
    await waitFor(() => expect(getContext().displayData).toHaveLength(100))
    mockGetAllAccounts.mockClear()
    await act(async () => {
      await getContext().reloadAccountsById(
        accounts.map((account) => account.id),
      )
    })
    expect(getContext().displayData).toHaveLength(100)
    expect(mockGetAccountById).not.toHaveBeenCalled()
    expect(mockGetAllAccounts).toHaveBeenCalledTimes(1)
  })
  it("does not read balance history when estimated income is disabled", async () => {
    mockGetAllAccounts.mockResolvedValue([{ id: "a", tagIds: [] }])
    const getContext = await renderAccountDataProvider()
    await waitFor(() => expect(getContext().displayData).toHaveLength(1))
    expect(mockGetDailyBalanceHistoryStore).not.toHaveBeenCalled()

    mockGetAccountById.mockResolvedValue({ id: "a", tagIds: [] })
    await act(async () => {
      await getContext().reloadAccountsById(["a"])
    })
    expect(mockGetDailyBalanceHistoryStore).not.toHaveBeenCalled()
    expect(getContext().displayData[0].estimatedTodayIncome).toBeNull()
  })
  it("starts with unavailable empty statistics coverage", async () => {
    mockGetAllAccounts.mockReturnValue(new Promise(() => undefined))
    const getContext = await renderAccountDataProvider()

    expect(getContext().stats.todayStatsCoverage.consumption.status).toBe(
      ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    )
  })
})

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })

  return { promise, resolve }
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

    expect(mockSetAccountListOrder).toHaveBeenCalledWith({
      pinnedIds: ["p-2", "p-1"],
      orderedIds: ["p-2", "p-1", "u-1"],
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

    mockSetAccountListOrder.mockClear()

    await act(async () => {
      await latestCtx!.handleReorder(["u-1", "p-1", "p-2"])
    })

    expect(mockSetAccountListOrder).toHaveBeenCalledWith({
      pinnedIds: ["p-1", "p-2"],
      orderedIds: ["p-1", "p-2", "u-1"],
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
    mockSetAccountListOrder.mockImplementation(
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

  it("preserves hidden account ids when persisting a filtered reorder", async () => {
    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([
      { id: "a1" },
      { id: "a2" },
      { id: "a3" },
      { id: "a4" },
    ])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue(["a1", "a2", "a3", "a4"])
    mockGetPinnedList.mockResolvedValue(["a1", "a2", "a3"])
    mockGetAccountStats.mockResolvedValue(createEmptyStats())
    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().pinnedAccountIds).toEqual(["a1", "a2", "a3"])
      expect(getLatestCtx().orderedAccountIds).toEqual(["a1", "a2", "a3", "a4"])
    })

    mockGetPinnedList.mockResolvedValueOnce(["a3", "a2", "a1"])
    mockGetOrderedList.mockResolvedValueOnce(["a3", "a2", "a1", "a4"])

    await act(async () => {
      await getLatestCtx().handleReorder(["a3", "a1", "a4"])
    })

    expect(mockSetAccountListOrder).toHaveBeenCalledWith({
      pinnedIds: ["a3", "a2", "a1"],
      orderedIds: ["a3", "a2", "a1", "a4"],
    })

    await waitFor(() => {
      expect(getLatestCtx().pinnedAccountIds).toEqual(["a3", "a2", "a1"])
      expect(getLatestCtx().orderedAccountIds).toEqual(["a3", "a2", "a1", "a4"])
    })
  })

  it("rolls back failed account reorder writes and logs the account path", async () => {
    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([{ id: "acc-1" }, { id: "acc-2" }])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue(["acc-1", "acc-2"])
    mockGetPinnedList.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue(createEmptyStats())
    mockSetAccountListOrder.mockResolvedValue(false)

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().orderedAccountIds).toEqual(["acc-1", "acc-2"])
    })

    mockLogger.error.mockClear()

    await act(async () => {
      await expect(
        getLatestCtx().handleReorder(["acc-2", "acc-1"]),
      ).rejects.toThrow("Failed to persist account order")
    })

    await waitFor(() => {
      expect(getLatestCtx().orderedAccountIds).toEqual(["acc-1", "acc-2"])
    })

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Failed to persist account reorder",
      expect.objectContaining({
        ids: ["acc-2", "acc-1"],
        error: expect.any(Error),
      }),
    )

    const [, details] = mockLogger.error.mock.calls.at(-1)!
    expect(details.error).toBeInstanceOf(Error)
    expect(details.error.message).toBe("Failed to persist account order")
  })

  it("keeps the persisted optimistic order when storage readback fails", async () => {
    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([
      { id: "p-1" },
      { id: "p-2" },
      { id: "u-1" },
    ])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue(["p-1", "p-2", "u-1"])
    mockGetPinnedList.mockResolvedValue(["p-1", "p-2"])
    mockGetAccountStats.mockResolvedValue(createEmptyStats())

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().pinnedAccountIds).toEqual(["p-1", "p-2"])
      expect(getLatestCtx().orderedAccountIds).toEqual(["p-1", "p-2", "u-1"])
    })

    mockGetPinnedList.mockRejectedValueOnce(new Error("readback failed"))
    mockGetOrderedList.mockResolvedValueOnce(["p-2", "p-1", "u-1"])
    mockLogger.warn.mockClear()

    await act(async () => {
      await expect(
        getLatestCtx().handleReorder(["p-2", "p-1", "u-1"]),
      ).resolves.toBeUndefined()
    })

    expect(mockSetAccountListOrder).toHaveBeenCalledWith({
      pinnedIds: ["p-2", "p-1"],
      orderedIds: ["p-2", "p-1", "u-1"],
    })

    await waitFor(() => {
      expect(getLatestCtx().pinnedAccountIds).toEqual(["p-2", "p-1"])
      expect(getLatestCtx().orderedAccountIds).toEqual(["p-2", "p-1", "u-1"])
    })

    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Persisted account reorder but failed to refresh order",
      expect.objectContaining({
        error: expect.any(Error),
      }),
    )
  })
})

describe("AccountDataContext initial load orchestration", () => {
  it("excludes today-income opt-outs from estimated income totals", async () => {
    const factor = QUOTA_PER_USD

    mockUserPreferencesContext.current = {
      ...mockUserPreferencesContext.current,
      preferences: {
        balanceHistory: {
          estimatedTodayIncome: { enabled: true },
        },
      },
    }
    mockGetAllAccounts.mockResolvedValue([
      {
        id: "included",
        disabled: false,
        excludeFromTodayIncome: false,
        exchange_rate: 7,
        account_info: { id: 1 },
        last_sync_time: 0,
      },
      {
        id: "excluded",
        disabled: false,
        excludeFromTodayIncome: true,
        exchange_rate: 7,
        account_info: { id: 2 },
        last_sync_time: 0,
      },
    ])
    mockGetDailyBalanceHistoryStore.mockResolvedValue({
      schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
      snapshotsByAccountId: {
        included: {
          "2026-05-22": {
            quota: 10 * factor,
            today_income: 0,
            today_quota_consumption: 0,
            capturedAt: 1,
            source: "alarm",
          },
          "2026-05-23": {
            quota: 12 * factor,
            today_income: 0.5 * factor,
            today_quota_consumption: 1 * factor,
            capturedAt: 2,
            source: "refresh",
          },
        },
        excluded: {
          "2026-05-22": {
            quota: 20 * factor,
            today_income: 0,
            today_quota_consumption: 0,
            capturedAt: 1,
            source: "alarm",
          },
          "2026-05-23": {
            quota: 30 * factor,
            today_income: 9 * factor,
            today_quota_consumption: 1 * factor,
            capturedAt: 2,
            source: "refresh",
          },
        },
      },
    })
    vi.setSystemTime(new Date("2026-05-23T08:00:00.000Z"))

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().todayIncomeEstimateTotals).toMatchObject({
        trusted: { USD: 0.5, CNY: 3.5 },
        estimated: { USD: 3, CNY: 21 },
        availableAccounts: 1,
        totalAccounts: 1,
      })
    })
  })

  it("projects available estimated income onto display account rows", async () => {
    const factor = QUOTA_PER_USD

    mockUserPreferencesContext.current = {
      ...mockUserPreferencesContext.current,
      preferences: {
        balanceHistory: {
          estimatedTodayIncome: { enabled: true },
        },
      },
    }
    mockGetAllAccounts.mockResolvedValue([
      {
        id: "included",
        disabled: false,
        excludeFromTodayIncome: false,
        exchange_rate: 7,
        account_info: { id: 1 },
        last_sync_time: 0,
      },
      {
        id: "manual",
        disabled: false,
        excludeFromTodayIncome: false,
        manualBalanceUsd: "12.34",
        exchange_rate: 7,
        account_info: { id: 2 },
        last_sync_time: 0,
      },
    ])
    mockGetDailyBalanceHistoryStore.mockResolvedValue({
      schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
      snapshotsByAccountId: {
        included: {
          "2026-05-22": {
            quota: 10 * factor,
            today_income: 0,
            today_quota_consumption: 0,
            capturedAt: 1,
            source: "alarm",
          },
          "2026-05-23": {
            quota: 12 * factor,
            today_income: 0.5 * factor,
            today_quota_consumption: 1 * factor,
            capturedAt: 2,
            source: "refresh",
          },
        },
        manual: {
          "2026-05-22": {
            quota: 10 * factor,
            today_income: 0,
            today_quota_consumption: 0,
            capturedAt: 1,
            source: "alarm",
          },
          "2026-05-23": {
            quota: 12 * factor,
            today_income: 0.5 * factor,
            today_quota_consumption: 1 * factor,
            capturedAt: 2,
            source: "refresh",
          },
        },
      },
    })
    vi.setSystemTime(new Date("2026-05-23T08:00:00.000Z"))

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().displayData).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "included",
            estimatedTodayIncome: { USD: 3, CNY: 21 },
          }),
          expect.objectContaining({
            id: "manual",
            estimatedTodayIncome: null,
          }),
        ]),
      )
    })
  })

  it("keeps initial load active until open-tab matching completes", async () => {
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
        checkIn: buildCheckInConfig(),
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

  it("finishes initial load when open-tab matching resolves before current-tab detection", async () => {
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
        checkIn: buildCheckInConfig(),
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

    expect(getLatestCtx().isInitialLoad).toBe(false)

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
        checkIn: buildCheckInConfig(),
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
        checkIn: buildCheckInConfig(),
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
      version: TAG_STORE_VERSION,
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
        version: TAG_STORE_VERSION,
        tagsById: { "tag-1": created },
      }
      return created
    })
    mockRenameTag.mockImplementation(async (tagId: string, name: string) => {
      const updated = { id: tagId, name }
      currentTagStore = {
        version: TAG_STORE_VERSION,
        tagsById: { [tagId]: updated },
      }
      return updated
    })
    mockDeleteTag.mockImplementation(async () => {
      currentTagStore = {
        version: TAG_STORE_VERSION,
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

  it("preserves hidden bookmark ids when persisting a filtered reorder", async () => {
    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([])
    mockGetAllBookmarks.mockResolvedValue([
      { id: "b1" },
      { id: "b2" },
      { id: "b3" },
      { id: "b4" },
    ])
    mockGetOrderedList.mockResolvedValue(["b1", "b2", "b3", "b4"])
    mockGetPinnedList.mockResolvedValue(["b1", "b2", "b3"])
    mockGetAccountStats.mockResolvedValue(createEmptyStats())
    mockSetPinnedListSubset.mockResolvedValue(true)
    mockSetOrderedListSubset.mockResolvedValue(true)

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().pinnedAccountIds).toEqual(["b1", "b2", "b3"])
      expect(getLatestCtx().orderedAccountIds).toEqual(["b1", "b2", "b3", "b4"])
    })

    mockGetPinnedList.mockResolvedValueOnce(["b3", "b2", "b1"])
    mockGetOrderedList.mockResolvedValueOnce(["b3", "b2", "b1", "b4"])

    await act(async () => {
      await getLatestCtx().handleBookmarkReorder(["b3", "b1", "b4"])
    })

    expect(mockSetPinnedListSubset).toHaveBeenCalledWith({
      entryType: "bookmark",
      ids: ["b3", "b2", "b1"],
    })
    expect(mockSetOrderedListSubset).toHaveBeenCalledWith({
      entryType: "bookmark",
      ids: ["b3", "b2", "b1", "b4"],
    })

    await waitFor(() => {
      expect(getLatestCtx().pinnedAccountIds).toEqual(["b3", "b2", "b1"])
      expect(getLatestCtx().orderedAccountIds).toEqual(["b3", "b2", "b1", "b4"])
    })
  })

  it("rolls back failed bookmark reorder writes and logs the bookmark path", async () => {
    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    mockGetAllAccounts.mockResolvedValue([])
    mockGetAllBookmarks.mockResolvedValue([{ id: "b1" }, { id: "b2" }])
    mockGetOrderedList.mockResolvedValue(["b1", "b2"])
    mockGetPinnedList.mockResolvedValue([])
    mockGetAccountStats.mockResolvedValue(createEmptyStats())
    mockSetOrderedListSubset.mockResolvedValue(false)

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().orderedAccountIds).toEqual(["b1", "b2"])
    })

    mockLogger.error.mockClear()

    await act(async () => {
      await getLatestCtx().handleBookmarkReorder(["b2", "b1"])
    })

    await waitFor(() => {
      expect(getLatestCtx().orderedAccountIds).toEqual(["b1", "b2"])
    })

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Failed to persist bookmark reorder",
      expect.objectContaining({
        ids: ["b2", "b1"],
        error: expect.any(Error),
      }),
    )

    const [, details] = mockLogger.error.mock.calls.at(-1)!
    expect(details.error).toBeInstanceOf(Error)
    expect(details.error.message).toBe("Failed to persist bookmark order")
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
      site_type: "new-api",
      account_info: { id: 42 },
      last_sync_time: 0,
    }
    const sameSiteDifferentUser = {
      id: "acc-1",
      site_url: "https://api.example.com/dashboard",
      site_type: "new-api",
      account_info: { id: "7" },
      last_sync_time: 0,
    }
    const otherSite = {
      id: "acc-3",
      site_url: "https://other.example.com",
      site_type: "new-api",
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
    mockReadAccountBrowserIdentityFromTab.mockResolvedValueOnce("42")

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(
        getLatestCtx().detectedSiteAccounts.map((account) => account.id),
      ).toEqual(["acc-1", "acc-2"])
      expect(getLatestCtx().detectedAccount?.id).toBe("acc-2")
    })

    expect(mockReadAccountBrowserIdentityFromTab).toHaveBeenCalledWith({
      tabId: 7,
      baseUrl: "https://api.example.com",
      siteType: "new-api",
      candidateUserIds: ["42", "7"],
    })
  })

  it("keeps site-level detection but clears the exact account when user verification fails", async () => {
    const sameSiteAccount = {
      id: "acc-1",
      site_url: "https://api.example.com/v1",
      site_type: "new-api",
      account_info: { id: 7 },
      last_sync_time: 0,
    }

    mockGetAllAccounts.mockResolvedValue([sameSiteAccount])
    mockGetActiveTabs.mockResolvedValue([
      createBrowserTab({ id: 8, url: "https://api.example.com/settings" }),
    ])
    mockReadAccountBrowserIdentityFromTab.mockResolvedValueOnce(null)

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

    expect(mockReadAccountBrowserIdentityFromTab).not.toHaveBeenCalled()
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
    mockReadAccountBrowserIdentityFromTab.mockResolvedValueOnce("7")

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

    expect(mockReadAccountBrowserIdentityFromTab).toHaveBeenCalledTimes(1)
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
    const updatedListeners: Array<
      (tabId: number, changeInfo: { status: string }) => void | Promise<void>
    > = []

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
    mockReadAccountBrowserIdentityFromTab.mockResolvedValue("7")

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().detectedAccount?.id).toBe("acc-1")
    })

    activeTabs = [{ id: 7, url: "https://api.example.com/profile" }]

    await act(async () => {
      for (const listener of updatedListeners) {
        await listener(999, { status: "complete" })
      }
    })

    expect(mockReadAccountBrowserIdentityFromTab).toHaveBeenCalledTimes(1)

    await act(async () => {
      for (const listener of updatedListeners) {
        await listener(7, { status: "complete" })
      }
    })

    await waitFor(() => {
      expect(mockReadAccountBrowserIdentityFromTab).toHaveBeenCalledTimes(2)
      expect(getLatestCtx().detectedAccount?.id).toBe("acc-1")
    })
  })
})

describe("AccountDataContext refresh orchestration", () => {
  it("refreshes data on demand, exposes the pending state, and stores the returned sync time", async () => {
    mockGetCurrentTempWindowRequestSource.mockReturnValue(
      TEMP_WINDOW_REQUEST_SOURCES.Popup,
    )
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

    expect(mockRefreshAllAccounts).toHaveBeenCalledWith(true, {
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      protectionBypassExecution: expect.objectContaining(
        userCommandExecution("refresh_all_accounts", "popup"),
      ),
    })
    expect(mockWithProtectionBypassUserCommand).toHaveBeenCalledTimes(1)
    expect(mockGetCurrentTempWindowRequestSource).toHaveBeenCalledTimes(1)
  })

  it("refreshes disabled accounts on demand and stores the returned sync time", async () => {
    mockGetCurrentTempWindowRequestSource.mockReturnValue(
      TEMP_WINDOW_REQUEST_SOURCES.Popup,
    )
    let resolveRefresh!: (value: any) => void
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve
    })

    mockGetAllAccounts.mockResolvedValue([{ id: "disabled-1", disabled: true }])
    mockRefreshDisabledAccounts.mockReturnValueOnce(refreshPromise)

    const getLatestCtx = await renderAccountDataProvider()

    await act(async () => {
      void getLatestCtx().handleRefreshDisabledAccounts(true)
    })

    await waitFor(() => {
      expect(getLatestCtx().isRefreshingDisabledAccounts).toBe(true)
    })

    resolveRefresh({
      processedCount: 2,
      failedCount: 0,
      reEnabledCount: 1,
      latestSyncTime: 1_720_123_456_789,
    })

    await waitFor(() => {
      expect(getLatestCtx().isRefreshingDisabledAccounts).toBe(false)
      expect(getLatestCtx().lastUpdateTime?.getTime()).toBe(1_720_123_456_789)
    })

    expect(mockRefreshDisabledAccounts).toHaveBeenCalledWith(true, {
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      protectionBypassExecution: expect.objectContaining(
        userCommandExecution("refresh_disabled_accounts", "popup"),
      ),
    })
    expect(mockWithProtectionBypassUserCommand).toHaveBeenCalledTimes(1)
    expect(mockGetCurrentTempWindowRequestSource).toHaveBeenCalledTimes(1)
  })

  it("blocks duplicate all-account refreshes while intent creation is pending", async () => {
    let releaseIntent!: () => void
    const intentReady = new Promise<void>((resolve) => {
      releaseIntent = resolve
    })
    mockWithProtectionBypassUserCommand.mockImplementationOnce(
      async (
        command: ProtectionBypassUserCommand,
        surface: ProtectionBypassSurface,
        work: (execution: unknown) => Promise<unknown>,
      ) => {
        await intentReady
        return work(userCommandExecution(command, surface))
      },
    )
    mockGetAllAccounts.mockResolvedValue([])
    mockRefreshAllAccounts.mockResolvedValue({
      success: 0,
      failed: 0,
      refreshedCount: 0,
      latestSyncTime: 0,
    })

    const getLatestCtx = await renderAccountDataProvider()
    let firstRefresh!: Promise<unknown>
    act(() => {
      firstRefresh = getLatestCtx().handleRefresh()
      void getLatestCtx().handleRefresh()
    })

    expect(mockWithProtectionBypassUserCommand).toHaveBeenCalledTimes(1)
    expect(mockRefreshAllAccounts).not.toHaveBeenCalled()

    await act(async () => {
      releaseIntent()
      await firstRefresh
    })

    expect(mockRefreshAllAccounts).toHaveBeenCalledTimes(1)
  })

  it("runs a forced all-account refresh after a weaker in-flight refresh", async () => {
    let releaseFirstRefresh!: () => void
    mockRefreshAllAccounts
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirstRefresh = () =>
              resolve({
                success: 0,
                failed: 0,
                refreshedCount: 0,
                latestSyncTime: 0,
              })
          }),
      )
      .mockResolvedValueOnce({
        success: 0,
        failed: 0,
        refreshedCount: 0,
        latestSyncTime: 0,
      })

    const getLatestCtx = await renderAccountDataProvider()
    let regularRefresh!: Promise<unknown>
    let forcedRefresh!: Promise<unknown>
    act(() => {
      regularRefresh = getLatestCtx().handleRefresh(false)
      forcedRefresh = getLatestCtx().handleRefresh(true)
    })

    await waitFor(() => {
      expect(mockRefreshAllAccounts).toHaveBeenCalledTimes(1)
    })
    expect(mockRefreshAllAccounts.mock.calls[0]?.[0]).toBe(false)

    await act(async () => {
      releaseFirstRefresh()
      await Promise.all([regularRefresh, forcedRefresh])
    })

    expect(mockRefreshAllAccounts.mock.calls.map(([force]) => force)).toEqual([
      false,
      true,
    ])
  })

  it("blocks duplicate disabled-account refreshes while intent creation is pending", async () => {
    let releaseIntent!: () => void
    const intentReady = new Promise<void>((resolve) => {
      releaseIntent = resolve
    })
    mockWithProtectionBypassUserCommand.mockImplementationOnce(
      async (
        command: ProtectionBypassUserCommand,
        surface: ProtectionBypassSurface,
        work: (execution: unknown) => Promise<unknown>,
      ) => {
        await intentReady
        return work(userCommandExecution(command, surface))
      },
    )
    mockGetAllAccounts.mockResolvedValue([])
    mockRefreshDisabledAccounts.mockResolvedValue({
      processedCount: 0,
      failedCount: 0,
      reEnabledCount: 0,
      latestSyncTime: 0,
    })

    const getLatestCtx = await renderAccountDataProvider()
    let firstRefresh!: Promise<unknown>
    act(() => {
      firstRefresh = getLatestCtx().handleRefreshDisabledAccounts()
      void getLatestCtx().handleRefreshDisabledAccounts()
    })

    expect(mockWithProtectionBypassUserCommand).toHaveBeenCalledTimes(1)
    expect(mockRefreshDisabledAccounts).not.toHaveBeenCalled()

    await act(async () => {
      releaseIntent()
      await firstRefresh
    })

    expect(mockRefreshDisabledAccounts).toHaveBeenCalledTimes(1)
  })

  it("runs a forced disabled-account refresh after a weaker in-flight refresh", async () => {
    let releaseFirstRefresh!: () => void
    mockRefreshDisabledAccounts
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirstRefresh = () =>
              resolve({
                processedCount: 0,
                failedCount: 0,
                reEnabledCount: 0,
                latestSyncTime: 0,
              })
          }),
      )
      .mockResolvedValueOnce({
        processedCount: 0,
        failedCount: 0,
        reEnabledCount: 0,
        latestSyncTime: 0,
      })

    const getLatestCtx = await renderAccountDataProvider()
    let regularRefresh!: Promise<unknown>
    let forcedRefresh!: Promise<unknown>
    act(() => {
      regularRefresh = getLatestCtx().handleRefreshDisabledAccounts(false)
      forcedRefresh = getLatestCtx().handleRefreshDisabledAccounts(true)
    })

    await waitFor(() => {
      expect(mockRefreshDisabledAccounts).toHaveBeenCalledTimes(1)
    })
    expect(mockRefreshDisabledAccounts.mock.calls[0]?.[0]).toBe(false)

    await act(async () => {
      releaseFirstRefresh()
      await Promise.all([regularRefresh, forcedRefresh])
    })

    expect(
      mockRefreshDisabledAccounts.mock.calls.map(([force]) => force),
    ).toEqual([false, true])
  })

  it("reloads account data after disabled-account refresh failures and clears the refreshing state", async () => {
    const refreshError = new Error("disabled refresh failed")
    mockGetAllAccounts.mockResolvedValue([{ id: "disabled-1", disabled: true }])
    mockRefreshDisabledAccounts.mockRejectedValueOnce(refreshError)

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().isInitialLoad).toBe(false)
    })

    const initialLoadCalls = mockGetAllAccounts.mock.calls.length
    mockLogger.error.mockClear()

    await act(async () => {
      await expect(
        getLatestCtx().handleRefreshDisabledAccounts(true),
      ).rejects.toThrow("disabled refresh failed")
    })

    await waitFor(() => {
      expect(getLatestCtx().isRefreshingDisabledAccounts).toBe(false)
      expect(mockGetAllAccounts.mock.calls.length).toBeGreaterThan(
        initialLoadCalls,
      )
    })

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Failed to refresh disabled accounts",
      refreshError,
    )
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
      expect(mockRefreshAllAccounts).toHaveBeenCalledWith(false, {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        protectionBypassExecution: automaticExecution(
          "account_refresh",
          "ui_lifecycle",
          TEMP_WINDOW_REQUEST_SOURCES.Background,
        ),
      })
      expect(mockWithProtectionBypassUserCommand).not.toHaveBeenCalled()
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

  it.each([
    TEMP_WINDOW_REQUEST_SOURCES.Popup,
    TEMP_WINDOW_REQUEST_SOURCES.Options,
  ])(
    "uses the actual %s root for refresh-on-open authorization and presentation",
    async (surface) => {
      mockUserPreferencesContext.current = {
        ...mockUserPreferencesContext.current,
        refreshOnOpen: true,
      }
      mockGetCurrentTempWindowRequestSource.mockReturnValue(surface)
      mockGetAllAccounts.mockResolvedValue([
        {
          id: "acc-root-surface",
          site_url: "https://example.invalid",
          account_info: { id: 1 },
          last_sync_time: 1_710_000_000_000,
        },
      ])

      await renderAccountDataProvider()

      await waitFor(() => {
        expect(mockRefreshAllAccounts).toHaveBeenCalledWith(false, {
          tempWindowRequestSource: surface,
          protectionBypassExecution: automaticExecution(
            "account_refresh",
            "ui_lifecycle",
            surface,
          ),
        })
      })
    },
  )

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

  it("reloads a saved account into display data after a post-save refresh notification", async () => {
    mockGetAllAccounts.mockResolvedValue([
      { id: "saved-account-id", name: "before", last_sync_time: 0 },
    ])

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().displayData).toEqual([
        expect.objectContaining({
          id: "saved-account-id",
          name: "before",
          last_sync_time: 0,
        }),
      ])
    })

    mockGetAccountById.mockResolvedValueOnce({
      id: "saved-account-id",
      name: "after",
      last_sync_time: 1_710_123_456_789,
    })

    const listener = (globalThis as any).__accountDataContextRuntimeListener as
      | ((message: any) => void)
      | undefined
    expect(listener).toBeTypeOf("function")

    await act(async () => {
      listener!({
        action: RuntimeActionIds.AccountRefreshCompleted,
        updatedAccountIds: ["saved-account-id"],
      })
    })

    await waitFor(() => {
      expect(getLatestCtx().displayData).toEqual([
        expect.objectContaining({
          id: "saved-account-id",
          name: "after",
          last_sync_time: 1_710_123_456_789,
        }),
      ])
    })
  })

  it("does not let an older targeted reload overwrite a newer reload after balance history loads", async () => {
    mockUserPreferencesContext.current.preferences.balanceHistory.estimatedTodayIncome.enabled =
      true
    mockGetAllAccounts.mockResolvedValue([
      { id: "saved-account-id", name: "before", last_sync_time: 0 },
    ])
    const olderBalanceHistoryLoad = createDeferred<{
      schemaVersion: number
      snapshotsByAccountId: Record<string, never>
    }>()
    const balanceHistoryStore = {
      schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
      snapshotsByAccountId: {},
    }
    mockGetDailyBalanceHistoryStore.mockResolvedValue(balanceHistoryStore)

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().displayData).toEqual([
        expect.objectContaining({
          id: "saved-account-id",
          name: "before",
          last_sync_time: 0,
        }),
      ])
    })

    mockGetDailyBalanceHistoryStore.mockReset()
    mockGetDailyBalanceHistoryStore
      .mockReturnValueOnce(olderBalanceHistoryLoad.promise)
      .mockResolvedValueOnce(balanceHistoryStore)

    mockGetAccountById
      .mockResolvedValueOnce({
        id: "saved-account-id",
        name: "older",
        last_sync_time: 1,
      })
      .mockResolvedValueOnce({
        id: "saved-account-id",
        name: "newer",
        last_sync_time: 2,
      })

    const olderReload = getLatestCtx().reloadAccountsById(["saved-account-id"])

    await waitFor(() => {
      expect(mockGetDailyBalanceHistoryStore).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await getLatestCtx().reloadAccountsById(["saved-account-id"])
    })

    await waitFor(() => {
      expect(getLatestCtx().displayData).toEqual([
        expect.objectContaining({
          id: "saved-account-id",
          name: "newer",
          last_sync_time: 2,
        }),
      ])
    })

    await act(async () => {
      olderBalanceHistoryLoad.resolve(balanceHistoryStore)
      await olderReload
    })

    await waitFor(() => {
      expect(getLatestCtx().displayData).toEqual([
        expect.objectContaining({
          id: "saved-account-id",
          name: "newer",
          last_sync_time: 2,
        }),
      ])
    })
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

    const observedSortFields: ActiveSortField[] = []
    let latestContext: ReturnType<typeof useAccountDataContext> | null = null
    function ObserveSortField() {
      latestContext = useAccountDataContext()
      observedSortFields.push(latestContext.sortField)
      return null
    }
    render(
      <I18nextProvider i18n={testI18n}>
        <AccountDataProvider>
          <ObserveSortField />
        </AccountDataProvider>
      </I18nextProvider>,
    )
    expect(observedSortFields.length).toBeGreaterThan(0)
    expect(
      observedSortFields.every((field) => field === DATA_TYPE_BALANCE),
    ).toBe(true)

    const getLatestCtx = () =>
      latestContext as ReturnType<typeof useAccountDataContext>

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

  it("clears the active field sort without resetting the current sort direction", async () => {
    mockUserPreferencesContext.current = {
      ...mockUserPreferencesContext.current,
      sortField: DATA_TYPE_BALANCE,
      sortOrder: "desc",
    }

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().sortField).toBe(DATA_TYPE_BALANCE)
      expect(getLatestCtx().sortOrder).toBe("desc")
    })

    act(() => {
      getLatestCtx().clearSortConfig()
    })

    await waitFor(() => {
      expect(getLatestCtx().sortField).toBeNull()
      expect(getLatestCtx().sortOrder).toBe("desc")
    })

    expect(mockUpdateSortConfig).toHaveBeenCalledWith(null, "desc")
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

  it.each([
    DATA_TYPE_CHECK_IN_REQUIREMENT,
    "custom_check_in_url",
    "custom_redeem_url",
  ] as const)(
    "initializes %s sorting with matching accounts first and persists direction changes",
    async (field) => {
      const getLatestCtx = await renderAccountDataProvider()
      act(() => {
        getLatestCtx().handleSort(field)
      })
      await waitFor(() => {
        expect(getLatestCtx().sortField).toBe(field)
        expect(getLatestCtx().sortOrder).toBe("desc")
      })
      expect(mockUpdateSortConfig).toHaveBeenCalledWith(field, "desc")
      act(() => {
        getLatestCtx().handleSort(field)
      })
      await waitFor(() => expect(getLatestCtx().sortOrder).toBe("asc"))
      expect(mockUpdateSortConfig).toHaveBeenLastCalledWith(field, "asc")
    },
  )

  it.each([
    [
      "late match",
      { success: true, tabIds: [] },
      { success: true, tabIds: [10] },
      undefined,
    ],
    [
      "late exclusion",
      { success: true, tabIds: [10] },
      { success: true, tabIds: [] },
      "open-tabs",
    ],
    ["late failure", undefined, { success: true, tabIds: [] }, "open-tabs"],
  ])(
    "keeps the latest related-page scan when an older query settles: %s",
    async (_label, olderResponse, latestResponse, expectedBoost) => {
      mockUserPreferencesContext.current.sortingPriorityConfig = {
        lastModified: 1,
        criteria: [
          {
            id: SortingCriteriaType.MATCHED_OPEN_TABS,
            enabled: true,
            priority: 0,
          },
        ],
      }
      mockGetAllAccounts.mockResolvedValue([
        {
          id: "acc-b",
          site_url: "https://b.example.com",
          account_info: { id: 2 },
          last_sync_time: 0,
        },
      ])
      mockConvertToDisplayData.mockReturnValue([
        { id: "acc-b", name: "Beta", baseUrl: "https://b.example.com" },
      ])
      mockGetAllTabs.mockResolvedValue([
        createBrowserTab({ id: 10, url: "https://b.example.com" }),
      ])
      const send = vi
        .spyOn(browser.runtime, "sendMessage")
        .mockResolvedValue({ success: true, tabIds: [10] })
      const getLatestCtx = await renderAccountDataProvider()
      await waitFor(() => expect(getLatestCtx().isInitialLoad).toBe(false))
      const removed = mockOnTabRemoved.mock.calls.at(-1)![0]
      const older = createDeferred<unknown>()
      send.mockReturnValueOnce(older.promise)
      const before = send.mock.calls.length
      await act(async () =>
        removed(99, { windowId: 1, isWindowClosing: false }),
      )
      await waitFor(() => expect(send).toHaveBeenCalledTimes(before + 1))
      send.mockResolvedValue(latestResponse)
      await act(async () =>
        removed(98, { windowId: 1, isWindowClosing: false }),
      )
      await waitFor(() => expect(send).toHaveBeenCalledTimes(before + 2))
      expect(getLatestCtx().getAccountContextBoost("acc-b")).toBe(expectedBoost)
      await act(async () => {
        older.resolve(olderResponse)
        await older.promise
      })
      expect(getLatestCtx().getAccountContextBoost("acc-b")).toBe(expectedBoost)
    },
  )

  it("clears unconfirmed browsing boosts and recovers on a later successful scan", async () => {
    mockUserPreferencesContext.current.sortingPriorityConfig = {
      lastModified: 1,
      criteria: [
        { id: SortingCriteriaType.CURRENT_SITE, enabled: true, priority: 0 },
        {
          id: SortingCriteriaType.MATCHED_OPEN_TABS,
          enabled: true,
          priority: 1,
        },
      ],
    }
    mockGetAllAccounts.mockResolvedValue([
      {
        id: "acc-b",
        site_url: "https://b.example.com",
        account_info: { id: 2 },
        last_sync_time: 0,
      },
    ])
    mockConvertToDisplayData.mockReturnValue([
      { id: "acc-b", name: "Beta", baseUrl: "https://b.example.com" },
    ])
    const tab = createBrowserTab({ id: 10, url: "https://b.example.com" })
    mockGetActiveTabs.mockResolvedValue([tab])
    mockGetAllTabs.mockResolvedValue([tab])
    mockReadAccountBrowserIdentityFromTab.mockResolvedValue("2")
    const send = vi
      .spyOn(browser.runtime, "sendMessage")
      .mockResolvedValue({ success: true, tabIds: [] })
    const getLatestCtx = await renderAccountDataProvider()
    await waitFor(() =>
      expect(getLatestCtx().getAccountContextBoost("acc-b")).toBe(
        "current-site",
      ),
    )
    const activated = mockOnTabActivated.mock.calls.map(
      ([listener]) => listener,
    )
    send.mockResolvedValue(undefined)
    await act(async () => {
      for (const listener of activated) listener({ tabId: 10, windowId: 1 })
    })
    await waitFor(() => expect(getLatestCtx().isDetecting).toBe(false))
    expect(getLatestCtx().getAccountContextBoost("acc-b")).toBeUndefined()
    expect(getLatestCtx().detectedAccount).toBeNull()
    expect(getLatestCtx().sortedData.map(({ id }) => id)).toEqual(["acc-b"])
    send.mockResolvedValue({ success: true, tabIds: [] })
    await act(async () => {
      for (const listener of activated) listener({ tabId: 10, windowId: 1 })
    })
    await waitFor(() =>
      expect(getLatestCtx().getAccountContextBoost("acc-b")).toBe(
        "current-site",
      ),
    )
  })

  it.each([false, true])(
    "ignores internal temporary pages while retaining ordinary same-site tabs: %s",
    async (hasOrdinaryTab) => {
      mockUserPreferencesContext.current.sortingPriorityConfig = {
        lastModified: 1,
        criteria: [
          { id: SortingCriteriaType.CURRENT_SITE, enabled: true, priority: 0 },
          {
            id: SortingCriteriaType.MATCHED_OPEN_TABS,
            enabled: true,
            priority: 1,
          },
        ],
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
        { id: "acc-a", name: "Alpha", baseUrl: "https://a.example.com" },
        { id: "acc-b", name: "Beta", baseUrl: "https://b.example.com" },
      ])
      const temporaryTab = createBrowserTab({
        id: 10,
        url: "https://b.example.com/dashboard",
      })
      mockGetActiveTabs.mockResolvedValue([temporaryTab])
      mockGetAllTabs.mockResolvedValue(
        hasOrdinaryTab
          ? [temporaryTab, createBrowserTab({ id: 11, url: temporaryTab.url })]
          : [temporaryTab],
      )
      mockReadAccountBrowserIdentityFromTab.mockResolvedValue("2")
      const runtimeSpy = vi
        .spyOn(browser.runtime, "sendMessage")
        .mockResolvedValue({ success: true, tabIds: [10] })
      try {
        const getLatestCtx = await renderAccountDataProvider()
        await waitFor(() => expect(getLatestCtx().isInitialLoad).toBe(false))
        await waitFor(() => expect(getLatestCtx().isDetecting).toBe(false))
        expect(getLatestCtx().getAccountContextBoost("acc-b")).toBe(
          hasOrdinaryTab ? "open-tabs" : undefined,
        )
        expect(getLatestCtx().detectedAccount).toBeNull()
        expect(getLatestCtx().detectedSiteAccounts).toEqual([])
        expect(getLatestCtx().sortedData.map(({ id }) => id)).toEqual(
          hasOrdinaryTab ? ["acc-b", "acc-a"] : ["acc-a", "acc-b"],
        )
        expect(mockReadAccountBrowserIdentityFromTab).not.toHaveBeenCalled()
      } finally {
        runtimeSpy.mockRestore()
      }
    },
  )

  it.each([
    ["matching site", "https://b.example.com/dashboard", "Beta", true],
    ["unrelated title", "https://unrelated.test", "Beta", false],
    ["domain suffix", "https://b.example.com.evil.test", "Unrelated", false],
    ["shared path", "https://unrelated.test/api", "Unrelated", false],
    ["different port", "https://b.example.com:8443/api", "Unrelated", false],
    ["different scheme", "http://b.example.com/api", "Unrelated", false],
    [
      "normalized origin",
      "https://B.EXAMPLE.COM:443/other?q=1#section",
      "Unrelated",
      true,
    ],
    ["non-web tab", "chrome://b.example.com", "Beta", false],
    ["missing URL", undefined, "Beta", false],
    [
      "custom check-in page",
      "https://checkin.example.test/beta/checkin",
      "Unrelated",
      true,
    ],
    [
      "custom check-in trailing slash",
      "https://checkin.example.test/beta/checkin/?from=tab#top",
      "Unrelated",
      true,
    ],
    [
      "other page on check-in host",
      "https://checkin.example.test/other",
      "Unrelated",
      false,
    ],
    ["check-in host root", "https://checkin.example.test", "Unrelated", false],
    [
      "check-in path prefix",
      "https://checkin.example.test/beta/checkin-extra",
      "Unrelated",
      false,
    ],
    [
      "custom redeem page",
      "https://redeem.example.test/redeem?site=beta#/claim",
      "Unrelated",
      true,
    ],
    [
      "redeem extra query",
      "https://redeem.example.test/redeem?from=tab&site=beta#/claim",
      "Unrelated",
      true,
    ],
    [
      "other redeem tenant",
      "https://redeem.example.test/redeem?site=alpha#/claim",
      "Unrelated",
      false,
    ],
    [
      "missing redeem tenant",
      "https://redeem.example.test/redeem#/claim",
      "Unrelated",
      false,
    ],
    [
      "other redeem hash route",
      "https://redeem.example.test/redeem?site=beta#/other",
      "Unrelated",
      false,
    ],
  ])(
    "boosts only an opened account site or configured related page: %s",
    async (_label, url, title, matches) => {
      mockUserPreferencesContext.current = {
        ...mockUserPreferencesContext.current,
        sortField: null,
        sortOrder: "asc",
        sortingPriorityConfig: {
          lastModified: 1,
          criteria: [
            {
              id: SortingCriteriaType.MATCHED_OPEN_TABS,
              enabled: true,
              priority: 0,
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
          site_url: "https://b.example.com/api",
          account_info: { id: 2 },
          last_sync_time: 0,
        },
      ])
      mockConvertToDisplayData.mockReturnValue([
        {
          id: "acc-a",
          name: "Alpha",
          username: "alice",
          token: "",
          baseUrl: "https://a.example.com",
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
        },
        {
          id: "acc-b",
          name: "Beta",
          username: "bob",
          token: "",
          baseUrl: "https://b.example.com/api",
          checkIn: buildCheckInConfig({
            customCheckIn: {
              url: "https://checkin.example.test/beta/checkin",
              redeemUrl: "https://redeem.example.test/redeem?site=beta#/claim",
            },
          }),
          balance: { USD: 0, CNY: 0 },
          todayConsumption: { USD: 0, CNY: 0 },
          todayIncome: { USD: 0, CNY: 0 },
        },
      ])
      mockGetAllTabs.mockResolvedValue([
        createBrowserTab({ id: 10, url, title }),
      ])
      const getLatestCtx = await renderAccountDataProvider()
      await waitFor(() => expect(getLatestCtx().isInitialLoad).toBe(false))
      expect(getLatestCtx().getAccountContextBoost("acc-b")).toBe(
        matches ? "open-tabs" : undefined,
      )
      expect(getLatestCtx().sortedData.map(({ id }) => id)).toEqual(
        matches ? ["acc-b", "acc-a"] : ["acc-a", "acc-b"],
      )
    },
  )
})

describe("AccountDataContext auto-checkin runCompleted handling", () => {
  it("updates only accounts listed in updatedAccountIds", async () => {
    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })

    const accountA: any = {
      id: "a",
      checkIn: buildCheckInStatus(false),
    }
    const accountB: any = {
      id: "b",
      checkIn: buildCheckInStatus(false),
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
      checkIn: buildCheckInStatus(true),
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
      expect(readCheckInToday(byId.a?.checkIn)).toBe(
        CHECK_IN_METHOD_TODAY_STATUSES.Checked,
      )
      expect(readCheckInToday(byId.b?.checkIn)).toBe(
        CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      )
    })

    expect(mockGetAccountById).toHaveBeenCalledTimes(1)
    expect(mockGetAccountById).toHaveBeenCalledWith("a")
  })

  it("preserves estimated today income on targeted reload display rows", async () => {
    const factor = QUOTA_PER_USD

    mockUserPreferencesContext.current = {
      ...mockUserPreferencesContext.current,
      preferences: {
        balanceHistory: {
          estimatedTodayIncome: { enabled: true },
        },
      },
    }
    vi.setSystemTime(new Date("2026-05-23T08:00:00.000Z"))
    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })

    const accountA: any = {
      id: "a",
      disabled: false,
      excludeFromTodayIncome: false,
      exchange_rate: 7,
      checkIn: buildCheckInStatus(false),
      account_info: { id: 1 },
    }
    const accountB: any = {
      id: "b",
      disabled: false,
      excludeFromTodayIncome: false,
      exchange_rate: 7,
      checkIn: buildCheckInStatus(false),
      account_info: { id: 2 },
    }

    mockGetAllAccounts.mockResolvedValue([accountA, accountB])
    mockGetAllBookmarks.mockResolvedValue([])
    mockGetOrderedList.mockResolvedValue(["a", "b"])
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
    mockGetDailyBalanceHistoryStore.mockResolvedValue({
      schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
      snapshotsByAccountId: {
        a: {
          "2026-05-22": {
            quota: 10 * factor,
            today_income: 0,
            today_quota_consumption: 0,
            capturedAt: 1,
            source: "alarm",
          },
          "2026-05-23": {
            quota: 12 * factor,
            today_income: 0.5 * factor,
            today_quota_consumption: 1 * factor,
            capturedAt: 2,
            source: "refresh",
          },
        },
        b: {
          "2026-05-22": {
            quota: 20 * factor,
            today_income: 0,
            today_quota_consumption: 0,
            capturedAt: 1,
            source: "alarm",
          },
          "2026-05-23": {
            quota: 21 * factor,
            today_income: 0.5 * factor,
            today_quota_consumption: 1 * factor,
            capturedAt: 2,
            source: "refresh",
          },
        },
      },
    })
    mockGetAccountById.mockResolvedValue({
      ...accountA,
      checkIn: buildCheckInStatus(true),
    })

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().displayData).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "a",
            estimatedTodayIncome: { USD: 3, CNY: 21 },
          }),
        ]),
      )
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
        getLatestCtx().displayData.map((item: any) => [item.id, item]),
      )
      expect(readCheckInToday(byId.a?.checkIn)).toBe(
        CHECK_IN_METHOD_TODAY_STATUSES.Checked,
      )
      expect(byId.a?.estimatedTodayIncome).toEqual({ USD: 3, CNY: 21 })
      expect(byId.b?.estimatedTodayIncome).toEqual({ USD: 2, CNY: 14 })
      expect(getLatestCtx().todayIncomeEstimateTotals).toMatchObject({
        trusted: { USD: 1, CNY: 7 },
        estimated: { USD: 5, CNY: 35 },
        availableAccounts: 2,
        totalAccounts: 2,
      })
    })

    expect(mockGetDailyBalanceHistoryStore).toHaveBeenCalledTimes(2)
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
      checkIn: buildCheckInStatus(false),
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
      checkIn: buildCheckInStatus(true),
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
    mockUserPreferencesContext.current.preferences.balanceHistory.estimatedTodayIncome.enabled =
      true
    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    const emptyStore = {
      schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
      snapshotsByAccountId: {},
    }

    const accountA: any = {
      id: "a",
      checkIn: buildCheckInStatus(false),
    }
    const accountB: any = {
      id: "b",
      checkIn: buildCheckInStatus(false),
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
    mockGetDailyBalanceHistoryStore.mockResolvedValue(emptyStore)

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

    mockGetDailyBalanceHistoryStore.mockReset()
    const reloadAStore = createDeferred<typeof emptyStore>()
    const reloadBStore = createDeferred<typeof emptyStore>()
    mockGetDailyBalanceHistoryStore
      .mockReturnValueOnce(reloadAStore.promise)
      .mockReturnValueOnce(reloadBStore.promise)

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
        checkIn: buildCheckInStatus(true),
      })
      await reloadAPromise
    })

    await waitFor(() => {
      expect(mockGetDailyBalanceHistoryStore).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      resolveReloadB({
        id: "b",
        checkIn: buildCheckInStatus(true),
      })
      await reloadBPromise
    })

    await waitFor(() => {
      expect(mockGetDailyBalanceHistoryStore).toHaveBeenCalledTimes(2)
    })

    await act(async () => {
      reloadBStore.resolve(emptyStore)
      await reloadBStore.promise
    })

    await waitFor(() => {
      const byId = Object.fromEntries(
        (latestCtx?.displayData ?? []).map((item: any) => [item.id, item]),
      )
      expect(readCheckInToday(byId.a?.checkIn)).toBe(
        CHECK_IN_METHOD_TODAY_STATUSES.Checked,
      )
      expect(readCheckInToday(byId.b?.checkIn)).toBe(
        CHECK_IN_METHOD_TODAY_STATUSES.Checked,
      )
    })

    await act(async () => {
      reloadAStore.resolve(emptyStore)
      await reloadAStore.promise
    })

    await waitFor(() => {
      const byId = Object.fromEntries(
        (latestCtx?.displayData ?? []).map((item: any) => [item.id, item]),
      )
      expect(readCheckInToday(byId.a?.checkIn)).toBe(
        CHECK_IN_METHOD_TODAY_STATUSES.Checked,
      )
      expect(readCheckInToday(byId.b?.checkIn)).toBe(
        CHECK_IN_METHOD_TODAY_STATUSES.Checked,
      )
    })
  })

  it("ignores older targeted reloads for the same account after a newer reload completes", async () => {
    mockUserPreferencesContext.current.preferences.balanceHistory.estimatedTodayIncome.enabled =
      true
    mockResetExpiredCheckIns.mockResolvedValue(undefined)
    mockGetTagStore.mockResolvedValue({ version: 1, tagsById: {} })
    const emptyStore = {
      schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
      snapshotsByAccountId: {},
    }

    mockGetAllAccounts.mockResolvedValue([
      {
        id: "a",
        checkIn: buildCheckInStatus(false),
      },
    ])
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
    mockGetDailyBalanceHistoryStore.mockResolvedValue(emptyStore)

    const olderReload = createDeferred<any>()
    const newerReload = createDeferred<any>()
    mockGetAccountById
      .mockReturnValueOnce(olderReload.promise)
      .mockReturnValueOnce(newerReload.promise)

    const getLatestCtx = await renderAccountDataProvider()

    await waitFor(() => {
      expect(getLatestCtx().displayData).toEqual([
        expect.objectContaining({
          id: "a",
          checkIn: buildCheckInStatus(false),
        }),
      ])
    })

    const listener = (globalThis as any).__accountDataContextRuntimeListener as
      | ((message: any) => void)
      | undefined
    expect(listener).toBeTypeOf("function")

    mockGetDailyBalanceHistoryStore.mockClear()

    await act(async () => {
      listener!({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        updatedAccountIds: ["a"],
      })
      listener!({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        updatedAccountIds: ["a"],
      })
    })

    await act(async () => {
      newerReload.resolve({
        id: "a",
        checkIn: buildCheckInStatus(true),
      })
      await newerReload.promise
    })

    await waitFor(() => {
      expect(getLatestCtx().displayData[0]?.checkIn).toEqual(
        buildCheckInStatus(true),
      )
    })

    await act(async () => {
      olderReload.resolve({
        id: "a",
        checkIn: buildCheckInStatus(false),
      })
      await olderReload.promise
    })

    await waitFor(() => {
      expect(getLatestCtx().displayData[0]?.checkIn).toEqual(
        buildCheckInStatus(true),
      )
    })
    expect(mockGetDailyBalanceHistoryStore).toHaveBeenCalledTimes(1)
  })
})
