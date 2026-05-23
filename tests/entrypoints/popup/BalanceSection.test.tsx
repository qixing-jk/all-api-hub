import { act, fireEvent } from "@testing-library/react"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
import AccountBalanceSummary from "~/entrypoints/popup/components/BalanceSection/AccountBalanceSummary"
import { UpdateTimeAndWarning } from "~/entrypoints/popup/components/BalanceSection/UpdateTimeAndWarning"
import { render, screen } from "~~/tests/test-utils/render"

const {
  formatFullTimeMock,
  formatRelativeTimeMock,
  mockUseAccountDataContext,
  mockUseUserPreferencesContext,
} = vi.hoisted(() => ({
  formatFullTimeMock: vi.fn(),
  formatRelativeTimeMock: vi.fn(),
  mockUseAccountDataContext: vi.fn(),
  mockUseUserPreferencesContext: vi.fn(),
}))

vi.mock("react-countup", () => ({
  default: ({
    start,
    end,
    duration,
    decimals,
  }: {
    start: number
    end: number
    duration: number
    decimals: number
  }) => (
    <span
      data-testid="countup"
      data-start={String(start)}
      data-end={String(end)}
      data-duration={String(duration)}
      data-decimals={String(decimals)}
    >
      {end.toFixed(decimals)}
    </span>
  ),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useUserPreferencesContext: () => mockUseUserPreferencesContext(),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => mockUseAccountDataContext(),
}))

vi.mock("~/components/Tooltip", () => ({
  default: ({
    children,
    content,
  }: {
    children: React.ReactNode
    content: string
  }) => (
    <div data-testid="tooltip" data-content={content}>
      {children}
    </div>
  ),
}))

vi.mock("~/utils/core/formatters", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/core/formatters")>()

  return {
    ...actual,
    formatFullTime: (...args: Parameters<typeof actual.formatFullTime>) =>
      formatFullTimeMock(...args),
    formatRelativeTime: (
      ...args: Parameters<typeof actual.formatRelativeTime>
    ) => formatRelativeTimeMock(...args),
  }
})

const createAccountDataContextValue = (
  overrides: Record<string, unknown> = {},
) => ({
  accounts: [
    {
      id: "acc-enabled",
      account_info: {
        today_quota_consumption: 100_000,
      },
      exchange_rate: 7,
    },
    {
      id: "acc-disabled",
      account_info: {
        today_quota_consumption: 300_000,
      },
      exchange_rate: 8,
    },
  ],
  displayData: [
    {
      id: "acc-enabled",
      name: "Enabled Account",
      site_name: "Enabled Site",
      balance: { USD: 10, CNY: 70 },
      todayIncome: { USD: 1.25, CNY: 8.75 },
    },
    {
      id: "acc-disabled",
      name: "Disabled Account",
      site_name: "Disabled Site",
      disabled: true,
      balance: { USD: 20, CNY: 140 },
      todayIncome: { USD: 2, CNY: 14 },
    },
  ],
  stats: {
    today_total_consumption: 400_000,
    today_total_income: 250_000,
  },
  todayIncomeEstimateTotals: {
    trusted: { USD: 1.25, CNY: 8.75 },
    estimated: null,
    availableAccounts: 0,
    totalAccounts: 1,
  },
  isInitialLoad: false,
  prevTotalConsumption: { USD: 1.5, CNY: 10.5 },
  lastUpdateTime: new Date("2026-03-30T08:00:00.000Z"),
  detectedAccount: null,
  detectedSiteAccounts: [],
  ...overrides,
})

describe("popup BalanceSection components", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    formatFullTimeMock.mockReturnValue("2026/03/30 16:00:00")
    formatRelativeTimeMock.mockReturnValue("moments ago")

    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: "USD",
      showTodayCashflow: true,
      updateCurrencyType: vi.fn(),
      preferences: {
        balanceHistory: {
          estimatedTodayIncome: { enabled: false },
        },
      },
    })
    mockUseAccountDataContext.mockReturnValue(createAccountDataContextValue())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders enabled-account totals, signs, and toggles the popup currency across summary cards", async () => {
    const updateCurrencyType = vi.fn()

    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: "USD",
      showTodayCashflow: true,
      updateCurrencyType,
      preferences: {
        balanceHistory: {
          estimatedTodayIncome: { enabled: false },
        },
      },
    })

    render(<AccountBalanceSummary />)

    const [balanceValue, consumptionValue, incomeValue] =
      screen.getAllByTestId("countup")

    expect(balanceValue).toHaveAttribute("data-start", "0")
    expect(balanceValue).toHaveAttribute("data-end", "10")
    expect(balanceValue).toHaveAttribute(
      "data-duration",
      String(UI_CONSTANTS.ANIMATION.UPDATE_DURATION),
    )
    expect(
      screen.getAllByRole("button", {
        name: "common:currency.clickToSwitch",
      })[0],
    ).toHaveTextContent("$10.00")
    expect(
      screen.getAllByRole("button", {
        name: "common:currency.clickToSwitch",
      })[0],
    ).toHaveClass("text-3xl")

    expect(consumptionValue).toHaveAttribute("data-start", "1.5")
    expect(consumptionValue).toHaveAttribute("data-end", "0.8")
    expect(
      screen.getAllByRole("button", {
        name: "common:currency.clickToSwitch",
      })[1],
    ).toHaveTextContent("-$0.80")

    expect(incomeValue).toHaveAttribute("data-start", "0")
    expect(incomeValue).toHaveAttribute("data-end", "1.25")
    expect(
      screen.getAllByRole("button", {
        name: "common:currency.clickToSwitch",
      })[2],
    ).toHaveTextContent("+$1.25")

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "common:currency.clickToSwitch",
      })[0],
    )

    expect(updateCurrencyType).toHaveBeenCalledWith("CNY")
  })

  it("excludes disabled accounts and today-income opt-outs from popup income totals", () => {
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        displayData: [
          {
            id: "included",
            name: "Included Account",
            balance: { USD: 10, CNY: 70 },
            todayIncome: { USD: 1.25, CNY: 8.75 },
          },
          {
            id: "income-opt-out",
            name: "Income Opt Out",
            balance: { USD: 10, CNY: 70 },
            todayIncome: { USD: 9, CNY: 63 },
            excludeFromTodayIncome: true,
          },
          {
            id: "disabled",
            name: "Disabled",
            disabled: true,
            balance: { USD: 10, CNY: 70 },
            todayIncome: { USD: 5, CNY: 35 },
          },
        ],
        stats: {
          today_total_consumption: 400_000,
          today_total_income: 1_525_000,
        },
      }),
    )

    render(<AccountBalanceSummary />)

    const [, , incomeValue] = screen.getAllByTestId("countup")

    expect(incomeValue).toHaveAttribute("data-end", "1.25")
  })

  it("keeps one income card when estimated income display is disabled", () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: "USD",
      showTodayCashflow: true,
      updateCurrencyType: vi.fn(),
      preferences: {
        balanceHistory: {
          estimatedTodayIncome: { enabled: false },
        },
      },
    })

    render(<AccountBalanceSummary />)

    expect(screen.getByText("account:stats.todayIncome")).toBeInTheDocument()
    expect(
      screen.queryByText("account:stats.estimatedTodayIncome"),
    ).not.toBeInTheDocument()
  })

  it("shows trusted and estimated today income when enabled", () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: "USD",
      showTodayCashflow: true,
      updateCurrencyType: vi.fn(),
      preferences: {
        balanceHistory: {
          estimatedTodayIncome: { enabled: true },
        },
      },
    })
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        todayIncomeEstimateTotals: {
          trusted: { USD: 9, CNY: 63 },
          estimated: { USD: 2.75, CNY: 19.25 },
          availableAccounts: 1,
          totalAccounts: 1,
        },
      }),
    )

    render(<AccountBalanceSummary />)

    expect(
      screen.getByText("account:stats.trustedTodayIncome"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("account:stats.estimatedTodayIncome"),
    ).toBeInTheDocument()
    expect(screen.getAllByTestId("countup").at(-2)).toHaveAttribute(
      "data-end",
      "1.25",
    )
    expect(screen.getAllByTestId("countup").at(-1)).toHaveAttribute(
      "data-end",
      "2.75",
    )
  })

  it("shows unavailable marker when estimated today income is enabled but unavailable", () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: "USD",
      showTodayCashflow: true,
      updateCurrencyType: vi.fn(),
      preferences: {
        balanceHistory: {
          estimatedTodayIncome: { enabled: true },
        },
      },
    })
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        todayIncomeEstimateTotals: {
          trusted: { USD: 1.25, CNY: 8.75 },
          estimated: null,
          availableAccounts: 0,
          totalAccounts: 1,
        },
      }),
    )

    render(<AccountBalanceSummary />)

    expect(
      screen.getByText("account:stats.estimatedTodayIncome"),
    ).toBeInTheDocument()
    expect(screen.getByText("-")).toBeInTheDocument()
  })

  it("omits plus prefix for non-positive estimated today income values", () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: "USD",
      showTodayCashflow: true,
      updateCurrencyType: vi.fn(),
      preferences: {
        balanceHistory: {
          estimatedTodayIncome: { enabled: true },
        },
      },
    })
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        todayIncomeEstimateTotals: {
          trusted: { USD: 1.25, CNY: 8.75 },
          estimated: { USD: 0, CNY: -1 },
          availableAccounts: 1,
          totalAccounts: 1,
        },
      }),
    )

    render(<AccountBalanceSummary />)

    const estimatedValue = screen.getAllByRole("button", {
      name: "common:currency.clickToSwitch",
    })[3]
    expect(estimatedValue).toHaveTextContent("$0.00")
    expect(estimatedValue).not.toHaveTextContent("+$0.00")
    expect(screen.getAllByTestId("countup").at(-1)).toHaveAttribute(
      "data-end",
      "0",
    )
  })

  it("uses initial-load animation, hides cashflow cards when disabled, and shows CNY totals", () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: "CNY",
      showTodayCashflow: false,
      updateCurrencyType: vi.fn(),
      preferences: {
        balanceHistory: {
          estimatedTodayIncome: { enabled: false },
        },
      },
    })
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        isInitialLoad: true,
      }),
    )

    render(<AccountBalanceSummary />)

    const [balanceValue] = screen.getAllByTestId("countup")

    expect(balanceValue).toHaveAttribute("data-start", "0")
    expect(balanceValue).toHaveAttribute("data-end", "70")
    expect(balanceValue).toHaveAttribute(
      "data-duration",
      String(UI_CONSTANTS.ANIMATION.INITIAL_DURATION),
    )
    expect(
      screen.getByRole("button", { name: "common:currency.clickToSwitch" }),
    ).toHaveTextContent("¥70.00")
    expect(
      screen.queryByText("account:stats.todayConsumption"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("account:stats.todayIncome"),
    ).not.toBeInTheDocument()
  })

  it("shows detected-account naming, refreshes relative time on the interval tick, and renders the tooltip timestamp", () => {
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        detectedAccount: {
          id: "acc-enabled",
          site_name: "Fallback Login Name",
        },
        detectedSiteAccounts: [
          { id: "acc-enabled", site_name: "Fallback Site" },
        ],
      }),
    )
    formatRelativeTimeMock
      .mockReturnValueOnce("moments ago")
      .mockReturnValueOnce("1 minute ago")

    render(<UpdateTimeAndWarning />)

    expect(screen.getByTestId("tooltip")).toHaveAttribute(
      "data-content",
      "2026/03/30 16:00:00",
    )
    expect(screen.getByText("common:time.updatedAt")).toBeInTheDocument()
    expect(screen.getByText("account:currentLoginAdded")).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(UI_CONSTANTS.UPDATE_INTERVAL)
    })

    expect(formatRelativeTimeMock).toHaveBeenCalledTimes(2)
    expect(screen.getByText("common:time.updatedAt")).toBeInTheDocument()
  })

  it("falls back to site names for single-site detection and shows the count badge for multiple detected site accounts", () => {
    const { rerender } = render(<UpdateTimeAndWarning />)

    expect(
      screen.queryByText("account:currentSiteAdded"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("account:currentSiteAddedCount"),
    ).not.toBeInTheDocument()

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        detectedSiteAccounts: [
          { id: "missing", site_name: "Detected Fallback" },
        ],
      }),
    )

    rerender(<UpdateTimeAndWarning />)

    expect(screen.getByText("account:currentSiteAdded")).toBeInTheDocument()

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        detectedSiteAccounts: [
          { id: "first", site_name: "First Site" },
          { id: "second", site_name: "Second Site" },
        ],
      }),
    )

    rerender(<UpdateTimeAndWarning />)

    expect(
      screen.getByText("account:currentSiteAddedCount"),
    ).toBeInTheDocument()
  })
})
