import { beforeEach, describe, expect, it, vi } from "vitest"

import { BASIC_SETTINGS_TAB_IDS } from "~/constants/basicSettingsTabs"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useBalanceHistoryData } from "~/features/BalanceHistory/data/useBalanceHistoryData"
import { useBalanceHistoryReporting } from "~/features/BalanceHistory/reporting/useBalanceHistoryReporting"
import { useBalanceHistoryViewModel } from "~/features/BalanceHistory/workspace/useBalanceHistoryViewModel"
import type { SiteAccount, TagStore } from "~/types"
import type { DailyBalanceHistoryStore } from "~/types/dailyBalanceHistory"
import { pushWithinOptionsPage } from "~/utils/navigation/optionsPage"
import { act, renderHook } from "~~/tests/test-utils/render"

vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/features/BalanceHistory/data/useBalanceHistoryData", () => ({
  useBalanceHistoryData: vi.fn(),
}))

vi.mock(
  "~/features/BalanceHistory/reporting/useBalanceHistoryReporting",
  () => ({
    useBalanceHistoryReporting: vi.fn(),
  }),
)

vi.mock("~/utils/navigation/optionsPage", () => ({
  pushWithinOptionsPage: vi.fn(),
}))

describe("useBalanceHistoryViewModel", () => {
  const updateCurrencyTypeMock = vi.fn()
  const handleRefreshNowMock = vi.fn()
  const handlePruneNowMock = vi.fn()

  const defaultPreferences = {
    showTodayCashflow: true,
    balanceHistory: {
      enabled: true,
      retentionDays: 30,
      estimatedTodayIncome: { enabled: false },
      endOfDayCapture: { enabled: false },
    },
  }

  const sampleAccounts: SiteAccount[] = [
    {
      id: "acc-1",
      name: "Account 1",
      site_name: "Site Alpha",
      site_url: "https://alpha.example.com",
      site_type: "new-api",
      account_info: { username: "user-alpha" },
      tagIds: ["tag-1"],
      exchange_rate: 1,
    } as unknown as SiteAccount,
    {
      id: "acc-2",
      name: "Account 2",
      site_name: "Site Beta",
      site_url: "https://beta.example.com",
      site_type: "sub-api",
      account_info: { username: "user-beta" },
      tagIds: ["tag-2"],
      exchange_rate: 7.2,
      manualBalanceUsd: "100.50",
    } as unknown as SiteAccount,
  ]

  const sampleTagStore: TagStore = {
    version: 1,
    tagsById: {
      "tag-1": { id: "tag-1", name: "Work", createdAt: 0, updatedAt: 0 },
      "tag-2": { id: "tag-2", name: "Personal", createdAt: 0, updatedAt: 0 },
    },
  }

  const sampleStore: DailyBalanceHistoryStore = {
    schemaVersion: 1,
    snapshotsByAccountId: {
      "acc-1": {
        "2026-10-01": {
          quota: 10,
          today_income: 1,
          today_quota_consumption: 0,
          capturedAt: 12345678,
          source: "refresh",
        },
      },
    },
  }

  const defaultReportingResult = {
    perAccountSeries: {
      coverageByDay: [
        {
          dayKey: "2026-10-01",
          snapshotAccounts: 1,
          cashflowAccounts: 1,
          incomeAccounts: 1,
          outcomeAccounts: 1,
          estimatedIncomeAccounts: 0,
          totalAccounts: 2,
        },
      ],
    },
    totalTrendValues: [10, 20],
    totalTrendCoverageSummary: {
      partialDays: 1,
      totalAccounts: 2,
    },
    trendOption: {},
    breakdownData: { hasNegativeValues: false },
    breakdownOption: {},
    overviewTotals: {},
    tableRows: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: defaultPreferences,
      currencyType: "USD",
      updateCurrencyType: updateCurrencyTypeMock,
    } as unknown as ReturnType<typeof useUserPreferencesContext>)

    vi.mocked(useBalanceHistoryData).mockReturnValue({
      accounts: sampleAccounts,
      tagStore: sampleTagStore,
      store: sampleStore,
      isLoading: false,
      handleRefreshNow: handleRefreshNowMock,
      handlePruneNow: handlePruneNowMock,
    })

    vi.mocked(useBalanceHistoryReporting).mockReturnValue(
      defaultReportingResult as unknown as ReturnType<
        typeof useBalanceHistoryReporting
      >,
    )
  })

  it("initializes with default metrics, range, and options", () => {
    const { result } = renderHook(() => useBalanceHistoryViewModel())

    expect(result.current.effectiveTrendMetric).toBe("balance")
    expect(result.current.effectiveBreakdownMetric).toBe("balance")
    expect(result.current.trendScope).toBe("accounts")
    expect(result.current.trendChartType).toBe("line")
    expect(result.current.breakdownChartType).toBe("pie")
    expect(result.current.currencySymbol).toBe("$")
    expect(result.current.isInitialLoading).toBe(false)
    expect(result.current.isStoreEmpty).toBe(false)
    expect(result.current.tagOptions).toHaveLength(2)
    expect(result.current.tagOptions[0]).toEqual({
      value: "tag-2",
      label: "Personal",
      count: 1,
      variant: "outline",
    })
    expect(result.current.tagOptions[1]).toEqual({
      value: "tag-1",
      label: "Work",
      count: 1,
      variant: "outline",
    })
    expect(result.current.accountOptions).toHaveLength(2)
  })

  it.each([
    [12.5, "12.50", "$12.50"],
    ["-3.25", "-3.25", "$-3.25"],
    ["invalid", "", "-"],
    [Infinity, "", "-"],
  ])(
    "formats chart values %s without displaying non-finite money",
    (value, axis, tooltip) => {
      renderHook(() => useBalanceHistoryViewModel())
      const [options] = vi.mocked(useBalanceHistoryReporting).mock.calls.at(-1)!

      expect(options.formatAxisMoneyValue(value, 0)).toBe(axis)
      expect(options.formatTooltipMoneyValue(value, 0)).toBe(tooltip)
    },
  )

  it("navigates to settings when openBalanceHistorySettings is called", () => {
    const { result } = renderHook(() => useBalanceHistoryViewModel())

    act(() => {
      result.current.openBalanceHistorySettings()
    })

    expect(pushWithinOptionsPage).toHaveBeenCalledWith(
      `#${MENU_ITEM_IDS.BASIC}`,
      {
        tab: BASIC_SETTINGS_TAB_IDS.BalanceHistory,
        anchor: SETTINGS_ANCHORS.BALANCE_HISTORY,
      },
    )
  })

  it("updates currency type on currency change", () => {
    const { result } = renderHook(() => useBalanceHistoryViewModel())

    act(() => {
      result.current.handleCurrencyChange("CNY")
    })

    expect(updateCurrencyTypeMock).toHaveBeenCalledWith("CNY")

    // Calling with same currency does nothing
    updateCurrencyTypeMock.mockClear()
    act(() => {
      result.current.handleCurrencyChange("USD")
    })
    expect(updateCurrencyTypeMock).not.toHaveBeenCalled()
  })

  it("falls back to income metric if estimatedIncome is selected when estimatedTodayIncome is disabled", () => {
    const { result } = renderHook(() => useBalanceHistoryViewModel())

    act(() => {
      result.current.setTrendMetric("estimatedIncome")
      result.current.setBreakdownMetric("estimatedIncome")
    })

    expect(result.current.effectiveTrendMetric).toBe("income")
    expect(result.current.effectiveBreakdownMetric).toBe("income")
  })

  it("allows estimatedIncome when estimatedTodayIncome is enabled in preferences", () => {
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: {
        ...defaultPreferences,
        balanceHistory: {
          ...defaultPreferences.balanceHistory,
          estimatedTodayIncome: { enabled: true },
        },
      },
      currencyType: "USD",
      updateCurrencyType: updateCurrencyTypeMock,
    } as unknown as ReturnType<typeof useUserPreferencesContext>)

    const { result } = renderHook(() => useBalanceHistoryViewModel())

    act(() => {
      result.current.setTrendMetric("estimatedIncome")
      result.current.setBreakdownMetric("estimatedIncome")
    })

    expect(result.current.effectiveTrendMetric).toBe("estimatedIncome")
    expect(result.current.effectiveBreakdownMetric).toBe("estimatedIncome")
  })

  it("switches pie chart to bar chart when breakdown data contains negative values", () => {
    vi.mocked(useBalanceHistoryReporting).mockReturnValue({
      ...defaultReportingResult,
      breakdownData: { hasNegativeValues: true },
    } as unknown as ReturnType<typeof useBalanceHistoryReporting>)

    const { result } = renderHook(() => useBalanceHistoryViewModel())

    expect(result.current.breakdownChartType).toBe("bar")
  })

  it("filters effectiveAccountIds when selectedTagIds or selectedAccountIds are set", () => {
    const { result } = renderHook(() => useBalanceHistoryViewModel())

    act(() => {
      result.current.setSelectedTagIds(["tag-1"])
    })

    // Expect useBalanceHistoryReporting to receive filtered accounts
    expect(useBalanceHistoryReporting).toHaveBeenLastCalledWith(
      expect.objectContaining({
        effectiveAccountIds: ["acc-1"],
      }),
    )

    act(() => {
      result.current.setSelectedAccountIds(["acc-2"])
    })

    // acc-2 is not in tag-1, so intersection is empty
    expect(useBalanceHistoryReporting).toHaveBeenLastCalledWith(
      expect.objectContaining({
        effectiveAccountIds: [],
      }),
    )
  })

  it("computes shouldShowCashflowWarning when cashflow is disabled and endOfDayCapture is not enabled", () => {
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: {
        ...defaultPreferences,
        showTodayCashflow: false,
        balanceHistory: {
          enabled: true,
          endOfDayCapture: { enabled: false },
        },
      },
      currencyType: "USD",
      updateCurrencyType: updateCurrencyTypeMock,
    } as unknown as ReturnType<typeof useUserPreferencesContext>)

    const { result } = renderHook(() => useBalanceHistoryViewModel())
    expect(result.current.shouldShowCashflowWarning).toBe(true)
  })

  it("computes shouldShowEnableBalanceHistoryHint when balance history is disabled", () => {
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: {
        ...defaultPreferences,
        balanceHistory: {
          enabled: false,
        },
      },
      currencyType: "USD",
      updateCurrencyType: updateCurrencyTypeMock,
    } as unknown as ReturnType<typeof useUserPreferencesContext>)

    const { result } = renderHook(() => useBalanceHistoryViewModel())
    expect(result.current.shouldShowEnableBalanceHistoryHint).toBe(true)
  })

  it("clamps custom date range within retention window", () => {
    const { result } = renderHook(() => useBalanceHistoryViewModel())

    act(() => {
      result.current.setStartDayKey("2000-01-01") // Way before minDayKey
      result.current.setEndDayKey("2099-12-31") // Way after maxDayKey
    })

    expect(result.current.startDayKey >= result.current.minDayKey).toBe(true)
    expect(result.current.endDayKey <= result.current.maxDayKey).toBe(true)
  })

  it("shows incomplete total hint when total trend has partial days for multiple accounts", () => {
    const { result } = renderHook(() => useBalanceHistoryViewModel())

    act(() => {
      result.current.setTrendScope("total")
    })

    expect(result.current.shouldShowIncompleteTotalHint).toBe(true)
    expect(result.current.hasAnyTrendMetricData).toBe(true)
  })
})
