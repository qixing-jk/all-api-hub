import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import UsageHistorySyncTab from "~/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySyncTab"
import { accountStorage } from "~/services/accounts/accountStorage"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import { hasAlarmsAPI, sendRuntimeMessage } from "~/utils/browser/browserApi"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

const { mockToast, mockShowWarningToast } = vi.hoisted(() => ({
  mockToast: Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
  }),
  mockShowWarningToast: vi.fn(),
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()
  return {
    ...actual,
    useUserPreferencesContext: vi.fn(),
  }
})

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: { getAllAccounts: vi.fn(), getEnabledAccounts: vi.fn() },
}))

vi.mock("~/services/history/usageHistory/storage", () => ({
  usageHistoryStorage: { getStore: vi.fn() },
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    hasAlarmsAPI: vi.fn(() => true),
    sendRuntimeMessage: vi.fn(),
  }
})

vi.mock("react-hot-toast", () => ({
  default: mockToast,
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  showWarningToast: mockShowWarningToast,
}))

describe("UsageHistorySyncTab", () => {
  const createContextValue = (overrides: Record<string, unknown> = {}) => ({
    preferences: {
      usageHistory: {
        enabled: true,
        retentionDays: 30,
        scheduleMode: "afterRefresh",
        syncIntervalMinutes: 360,
      },
    },
    loadPreferences: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  })

  const createEnabledAccounts = () =>
    [
      { id: "a1", site_name: "Account 1" },
      { id: "a2", site_name: "Account 2" },
    ] as any

  const createStore = (overrides: Record<string, unknown> = {}) =>
    ({
      schemaVersion: 2,
      accounts: {
        a1: { status: { state: "never" } },
        a2: { status: { state: "never" } },
      },
      ...overrides,
    }) as any

  const createDeferred = <T,>() => {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })

    return { promise, resolve, reject }
  }

  const renderSubject = () => render(<UsageHistorySyncTab />)

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useUserPreferencesContext).mockReturnValue(
      createContextValue() as any,
    )
    vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue(
      createEnabledAccounts(),
    )
    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue(createStore())
    vi.mocked(hasAlarmsAPI).mockReturnValue(true)
    vi.mocked(sendRuntimeMessage).mockResolvedValue({ success: true } as any)
    vi.mocked(toast.loading).mockReturnValue("sync-toast")
  })

  it("sends usageHistory:updateSettings with current form values", async () => {
    const loadPreferences = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: {
        usageHistory: {
          enabled: true,
          retentionDays: 14,
          scheduleMode: "afterRefresh",
          syncIntervalMinutes: 180,
        },
      },
      loadPreferences,
    } as any)

    vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([
      { id: "a1", site_name: "Account 1" },
    ] as any)
    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: {},
    } as any)

    vi.mocked(sendRuntimeMessage).mockResolvedValue({ success: true } as any)

    renderSubject()

    const applyButton = await screen.findByText(
      "usageAnalytics:actions.applySettings",
    )
    fireEvent.click(applyButton)

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.UsageHistoryUpdateSettings,
        settings: {
          enabled: true,
          retentionDays: 14,
          scheduleMode: "afterRefresh",
          syncIntervalMinutes: 180,
        },
      })
    })

    await waitFor(() => {
      expect(loadPreferences).toHaveBeenCalled()
    })
  })

  it("shows the schedule fallback warning and reloads preferences when settings save succeeds with a warning", async () => {
    const loadPreferences = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useUserPreferencesContext).mockReturnValue(
      createContextValue({ loadPreferences }) as any,
    )
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: true,
      data: { warning: "alarms unavailable" },
    } as any)

    renderSubject()

    fireEvent.click(
      await screen.findByRole("button", {
        name: "usageAnalytics:actions.applySettings",
      }),
    )

    await waitFor(() => {
      expect(mockShowWarningToast).toHaveBeenCalledWith(
        "usageAnalytics:messages.warning.scheduleFallback",
      )
    })

    expect(toast.success).not.toHaveBeenCalled()
    expect(loadPreferences).toHaveBeenCalledTimes(1)
    expect(accountStorage.getEnabledAccounts).toHaveBeenCalledTimes(2)
    expect(usageHistoryStorage.getStore).toHaveBeenCalledTimes(2)
  })

  it("surfaces translated save failures without reloading preferences when settings persistence fails", async () => {
    const loadPreferences = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useUserPreferencesContext).mockReturnValue(
      createContextValue({ loadPreferences }) as any,
    )
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: false,
      error: "bad config",
    } as any)

    renderSubject()

    fireEvent.click(
      await screen.findByRole("button", {
        name: "usageAnalytics:actions.applySettings",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "usageAnalytics:messages.error.settingsSaveFailed",
      )
    })

    expect(loadPreferences).not.toHaveBeenCalled()
    expect(accountStorage.getEnabledAccounts).toHaveBeenCalledTimes(1)
    expect(usageHistoryStorage.getStore).toHaveBeenCalledTimes(1)
  })

  it("uses default settings, shows the alarms unsupported and no-accounts states, and converts sync hours back to minutes", async () => {
    vi.mocked(useUserPreferencesContext).mockReturnValue(
      createContextValue({
        preferences: {},
      }) as any,
    )
    vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([] as any)
    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: {},
    } as any)
    vi.mocked(hasAlarmsAPI).mockReturnValue(false)

    renderSubject()

    expect(
      await screen.findByText("usageAnalytics:settings.alarmUnsupported"),
    ).toBeInTheDocument()
    expect(
      await screen.findByText("usageAnalytics:syncTab.noAccounts"),
    ).toBeInTheDocument()

    const switches = screen.getAllByRole("switch")
    fireEvent.click(switches[0])

    const numberInputs = screen.getAllByRole("spinbutton")
    fireEvent.change(numberInputs[0], { target: { value: "45" } })
    fireEvent.change(numberInputs[1], { target: { value: "2" } })

    fireEvent.click(
      screen.getByRole("button", {
        name: "usageAnalytics:actions.applySettings",
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.UsageHistoryUpdateSettings,
        settings: {
          enabled: true,
          retentionDays: 45,
          scheduleMode: "afterRefresh",
          syncIntervalMinutes: 120,
        },
      })
    })
  })

  it("syncs selected accounts via usageHistory:syncNow with accountIds", async () => {
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: {
        usageHistory: {
          enabled: true,
          retentionDays: 30,
          scheduleMode: "afterRefresh",
          syncIntervalMinutes: 360,
        },
      },
      loadPreferences: vi.fn().mockResolvedValue(undefined),
    } as any)

    vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([
      { id: "a1", site_name: "Account 1" },
      { id: "a2", site_name: "Account 2" },
    ] as any)
    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: {
        a1: { status: { state: "never" } },
        a2: { status: { state: "never" } },
      },
    } as any)

    vi.mocked(sendRuntimeMessage).mockResolvedValue({
      success: true,
      data: { totals: { success: 1, skipped: 0, error: 0, unsupported: 0 } },
    } as any)

    renderSubject()

    const syncSelectedButton = await screen.findByText(
      "usageAnalytics:syncTab.actions.syncSelected",
    )
    expect(syncSelectedButton).toBeDisabled()

    const account1Cell = await screen.findByText("Account 1")
    const account1Row = account1Cell.closest("tr")
    if (!account1Row) throw new Error("Missing account row for Account 1")

    const account1Checkbox = within(account1Row).getByRole("checkbox")
    fireEvent.click(account1Checkbox)

    await waitFor(() => {
      expect(syncSelectedButton).not.toBeDisabled()
    })

    fireEvent.click(syncSelectedButton)

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.UsageHistorySyncNow,
        accountIds: ["a1"],
      })
    })
  })

  it("shows the no-summary success path when syncing all accounts", async () => {
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: true,
      data: {},
    } as any)

    renderSubject()

    fireEvent.click(
      await screen.findByRole("button", {
        name: "usageAnalytics:actions.syncNow",
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.UsageHistorySyncNow,
      })
      expect(toast.loading).toHaveBeenCalledWith(
        "usageAnalytics:messages.loading.syncing",
      )
      expect(toast.success).toHaveBeenCalledWith(
        "usageAnalytics:messages.success.syncCompletedNoSummary",
        { id: "sync-toast" },
      )
    })

    expect(accountStorage.getEnabledAccounts).toHaveBeenCalledTimes(2)
    expect(usageHistoryStorage.getStore).toHaveBeenCalledTimes(2)
  })

  it("uses a warning toast when manual sync finishes with skipped or unsupported accounts", async () => {
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({
      success: true,
      data: {
        totals: { success: 1, skipped: 1, error: 0, unsupported: 1 },
      },
    } as any)

    renderSubject()

    fireEvent.click(
      await screen.findByRole("button", {
        name: "usageAnalytics:actions.syncNow",
      }),
    )

    await waitFor(() => {
      expect(mockShowWarningToast).toHaveBeenCalledWith(
        "usageAnalytics:messages.warning.syncCompletedWithIssues",
        expect.objectContaining({
          id: "sync-toast",
          action: expect.objectContaining({
            label: "usageAnalytics:syncTab.actions.viewStatus",
          }),
        }),
      )
    })

    const warningOptions = mockShowWarningToast.mock.calls[0]?.[1]
    const warningAction = warningOptions?.action
    expect(warningAction).toEqual(
      expect.objectContaining({
        label: "usageAnalytics:syncTab.actions.viewStatus",
      }),
    )

    const stateSection = document.getElementById("usage-history-sync-state")
    expect(stateSection).toBeTruthy()
    const scrollIntoViewMock = vi.fn()
    stateSection!.scrollIntoView = scrollIntoViewMock

    warningAction?.onClick()

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    })
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("clears the syncing state and shows an error toast when a full sync fails", async () => {
    const deferredResponse = createDeferred<any>()
    vi.mocked(sendRuntimeMessage).mockReturnValueOnce(deferredResponse.promise)

    renderSubject()

    const syncNowButton = await screen.findByRole("button", {
      name: "usageAnalytics:actions.syncNow",
    })

    fireEvent.click(syncNowButton)

    await waitFor(() => {
      expect(syncNowButton).toBeDisabled()
    })

    deferredResponse.resolve({
      success: false,
      error: "background down",
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "usageAnalytics:messages.error.syncFailed",
        { id: "sync-toast" },
      )
    })

    await waitFor(() => {
      expect(syncNowButton).not.toBeDisabled()
    })
  })

  it("renders duplicate-named accounts with disambiguated labels", async () => {
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: {
        usageHistory: {
          enabled: true,
          retentionDays: 30,
          scheduleMode: "afterRefresh",
          syncIntervalMinutes: 360,
        },
      },
      loadPreferences: vi.fn().mockResolvedValue(undefined),
    } as any)

    vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([
      {
        id: "a1",
        site_name: "Shared Site",
        account_info: { username: "alice" },
      },
      {
        id: "a2",
        site_name: "Shared Site",
        account_info: { username: "bob" },
      },
    ] as any)
    vi.mocked(usageHistoryStorage.getStore).mockResolvedValue({
      schemaVersion: 2,
      accounts: {
        a1: { status: { state: "never" } },
        a2: { status: { state: "never" } },
      },
    } as any)

    vi.mocked(sendRuntimeMessage).mockResolvedValue({
      success: true,
      data: { totals: { success: 1, skipped: 0, error: 0, unsupported: 0 } },
    } as any)

    renderSubject()

    const aliceCell = await screen.findByText("Shared Site · alice")
    expect(await screen.findByText("Shared Site · bob")).toBeInTheDocument()

    const aliceRow = aliceCell.closest("tr")
    if (!aliceRow) {
      throw new Error("Missing account row for Shared Site · alice")
    }

    fireEvent.click(within(aliceRow).getByRole("checkbox"))
    fireEvent.click(
      await screen.findByText("usageAnalytics:syncTab.actions.syncSelected"),
    )

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.UsageHistorySyncNow,
        accountIds: ["a1"],
      })
    })
  })

  it("filters by the computed display name and shows the filtered empty state when no rows match", async () => {
    vi.mocked(accountStorage.getEnabledAccounts).mockResolvedValue([
      {
        id: "a1",
        site_name: "Shared Site",
        account_info: { username: "alice" },
      },
      {
        id: "a2",
        site_name: "Shared Site",
        account_info: { username: "bob" },
      },
    ] as any)

    renderSubject()

    const searchInput = await screen.findByPlaceholderText(
      "usageAnalytics:syncTab.searchPlaceholder",
    )

    fireEvent.change(searchInput, { target: { value: "alice" } })

    expect(screen.getByText("Shared Site · alice")).toBeInTheDocument()
    expect(screen.queryByText("Shared Site · bob")).toBeNull()

    fireEvent.change(searchInput, { target: { value: "missing" } })

    expect(
      await screen.findByText("usageAnalytics:syncTab.table.empty"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("usageAnalytics:syncTab.noAccounts"),
    ).not.toBeInTheDocument()
  })
})
