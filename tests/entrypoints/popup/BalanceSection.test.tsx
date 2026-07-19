import { act, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
import AccountBalanceSummary from "~/entrypoints/popup/components/BalanceSection/AccountBalanceSummary"
import { TokenStats } from "~/entrypoints/popup/components/BalanceSection/TokenStats"
import { UpdateTimeAndWarning } from "~/entrypoints/popup/components/BalanceSection/UpdateTimeAndWarning"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import {
  buildAccountStats,
  buildCompleteTodayStatsAvailability,
} from "~~/tests/test-utils/accountTodayStats"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
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
    buildDisplaySiteData({
      id: "acc-enabled",
      name: "Enabled Account",
      balance: { USD: 10, CNY: 70 },
      todayConsumption: { USD: 0.8, CNY: 5.6 },
      todayIncome: { USD: 1.25, CNY: 8.75 },
    }),
    buildDisplaySiteData({
      id: "acc-disabled",
      name: "Disabled Account",
      disabled: true,
      balance: { USD: 20, CNY: 140 },
      todayConsumption: { USD: 9, CNY: 63 },
      todayIncome: { USD: 2, CNY: 14 },
    }),
  ],
  stats: buildAccountStats({
    today_total_consumption: 400_000,
    today_total_income: 250_000,
    today_total_requests: 12,
    today_total_prompt_tokens: 300,
    today_total_completion_tokens: 700,
  }),
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
        name: /common:currency\.clickToSwitch/,
      })[0],
    ).toHaveTextContent("$10.00")
    expect(
      screen.getAllByRole("button", {
        name: /common:currency\.clickToSwitch/,
      })[0],
    ).toHaveClass("text-3xl")

    expect(consumptionValue).toHaveAttribute("data-start", "1.5")
    expect(consumptionValue).toHaveAttribute("data-end", "0.8")
    expect(
      screen.getAllByRole("button", {
        name: /common:currency\.clickToSwitch/,
      })[1],
    ).toHaveTextContent("-$0.80")

    expect(incomeValue).toHaveAttribute("data-start", "0")
    expect(incomeValue).toHaveAttribute("data-end", "1.25")
    expect(
      screen.getAllByRole("button", {
        name: /common:currency\.clickToSwitch/,
      })[2],
    ).toHaveTextContent("+$1.25")

    fireEvent.click(
      screen.getAllByRole("button", {
        name: /common:currency\.clickToSwitch/,
      })[0],
    )

    expect(updateCurrencyType).toHaveBeenCalledWith("CNY")
  })

  it("excludes disabled accounts and today-income opt-outs from popup income totals", () => {
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        displayData: [
          buildDisplaySiteData({
            id: "included",
            name: "Included Account",
            balance: { USD: 10, CNY: 70 },
            todayConsumption: { USD: 0, CNY: 0 },
            todayIncome: { USD: 1.25, CNY: 8.75 },
          }),
          buildDisplaySiteData({
            id: "income-opt-out",
            name: "Income Opt Out",
            balance: { USD: 10, CNY: 70 },
            todayConsumption: { USD: 0, CNY: 0 },
            todayIncome: { USD: 9, CNY: 63 },
            excludeFromTodayIncome: true,
          }),
          buildDisplaySiteData({
            id: "disabled",
            name: "Disabled",
            disabled: true,
            balance: { USD: 10, CNY: 70 },
            todayConsumption: { USD: 0, CNY: 0 },
            todayIncome: { USD: 5, CNY: 35 },
          }),
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

  it("qualifies partial popup aggregates and renders unavailable aggregates as em dashes", () => {
    const partial = buildDisplaySiteData({
      id: "partial",
      todayConsumption: { USD: 3, CNY: 21 },
      todayIncome: { USD: 2, CNY: 14 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability({
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
          reason: ACCOUNT_TODAY_METRIC_REASONS.PageLimit,
        },
      }),
    })
    const unavailable = buildDisplaySiteData({
      id: "unavailable",
      todayConsumption: { USD: 999, CNY: 6993 },
      todayIncome: { USD: 888, CNY: 6216 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability({
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
      }),
    })
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({ displayData: [partial, unavailable] }),
    )

    const { rerender } = render(<AccountBalanceSummary />)

    const partialButton = screen.getAllByRole("button", {
      name: /account:todayMetricAvailability\.coverage/,
    })[0]
    expect(partialButton).toHaveTextContent("-$3.00")
    expect(partialButton).toHaveAccessibleName(
      /-\$3\.00.*account:todayMetricAvailability\.coverage/,
    )
    expect(screen.queryByText(/999|888/)).not.toBeInTheDocument()

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({ displayData: [unavailable] }),
    )
    rerender(<AccountBalanceSummary />)

    const unavailableButtons = screen.getAllByRole("button", {
      name: /account:todayMetricAvailability\.unavailable/,
    })
    expect(unavailableButtons).toHaveLength(2)
    expect(unavailableButtons[0]).toHaveTextContent("—")
    expect(unavailableButtons[1]).toHaveTextContent("—")
  })

  it("identifies legacy accounts in partial and unavailable popup aggregates", () => {
    const partial = buildDisplaySiteData({
      id: "partial",
      todayConsumption: { USD: 3, CNY: 21 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability({
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
          reason: ACCOUNT_TODAY_METRIC_REASONS.PageLimit,
        },
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
        },
      }),
    })
    const legacy = buildDisplaySiteData({
      id: "legacy",
      todayConsumption: { USD: 999, CNY: 6993 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability({
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
        },
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
      }),
    })
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({ displayData: [partial, legacy] }),
    )

    render(<AccountBalanceSummary />)

    const partialValue = screen.getByRole("button", {
      name: /account:todayMetricAvailability\.coverageWithRefresh/,
    })
    expect(partialValue).toHaveTextContent("-$3.00")
    expect(partialValue).toHaveTextContent(
      "account:todayMetricAvailability.includesPendingRefresh",
    )
    const pendingValue = screen.getByRole("button", {
      name: /account:todayMetricAvailability\.pendingRefreshHelp/,
    })
    expect(pendingValue).toHaveTextContent(
      "account:todayMetricAvailability.pendingRefresh",
    )
    expect(pendingValue).not.toHaveTextContent("—")
    expect(screen.queryByText("999")).not.toBeInTheDocument()
  })

  it("renders complete token buckets, a combined partial total, and unavailable as an em dash", () => {
    const completeStats = buildAccountStats({
      today_total_prompt_tokens: 300,
      today_total_completion_tokens: 700,
    })
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({ stats: completeStats }),
    )
    const { rerender } = render(<TokenStats />)

    expect(screen.getByText("300")).toBeInTheDocument()
    expect(screen.getByText("700")).toBeInTheDocument()

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        stats: buildAccountStats({
          today_total_prompt_tokens: 300,
          today_total_completion_tokens: 700,
          todayStatsCoverage: {
            ...completeStats.todayStatsCoverage,
            tokens: {
              status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
              completeCount: 1,
              partialCount: 1,
              eligibleCount: 3,
              legacyUnclassifiedCount: 0,
            },
          },
        }),
      }),
    )
    rerender(<TokenStats key="partial" />)

    expect(screen.getByText("1.0K")).toHaveAttribute("tabindex", "0")
    expect(screen.getByText("1.0K")).toHaveAccessibleName(
      /1\.0K.*account:todayMetricAvailability\.coverage/,
    )
    expect(screen.queryByText("300")).not.toBeInTheDocument()
    expect(screen.queryByText("700")).not.toBeInTheDocument()
    expect(screen.getByTestId("tooltip")).toHaveAttribute(
      "data-content",
      "account:todayMetricAvailability.coverage",
    )

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        stats: buildAccountStats({
          today_total_prompt_tokens: 999,
          today_total_completion_tokens: 888,
          todayStatsCoverage: {
            ...completeStats.todayStatsCoverage,
            tokens: {
              status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
              completeCount: 0,
              partialCount: 0,
              eligibleCount: 2,
              legacyUnclassifiedCount: 0,
            },
          },
        }),
      }),
    )
    rerender(<TokenStats key="unavailable" />)

    expect(
      screen.getByLabelText("account:todayMetricAvailability.unavailable"),
    ).toHaveTextContent("—")
    expect(screen.queryByText(/999|888/)).not.toBeInTheDocument()

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        stats: buildAccountStats({
          today_total_prompt_tokens: 300,
          today_total_completion_tokens: 700,
          todayStatsCoverage: {
            ...completeStats.todayStatsCoverage,
            tokens: {
              status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
              completeCount: 1,
              partialCount: 1,
              eligibleCount: 3,
              legacyUnclassifiedCount: 1,
            },
          },
        }),
      }),
    )
    rerender(<TokenStats key="partial-legacy" />)

    const partialLegacyValue = screen.getByLabelText(
      /account:todayMetricAvailability\.coverageWithRefresh/,
    )
    expect(partialLegacyValue).toHaveTextContent("1.0K")
    expect(partialLegacyValue).toHaveTextContent(
      "account:todayMetricAvailability.includesPendingRefresh",
    )

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        stats: buildAccountStats({
          today_total_prompt_tokens: 999,
          today_total_completion_tokens: 888,
          todayStatsCoverage: {
            ...completeStats.todayStatsCoverage,
            tokens: {
              status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
              completeCount: 0,
              partialCount: 0,
              eligibleCount: 2,
              legacyUnclassifiedCount: 1,
            },
          },
        }),
      }),
    )
    rerender(<TokenStats key="unavailable-legacy" />)

    expect(
      screen.getByLabelText(
        "account:todayMetricAvailability.pendingRefreshHelp",
      ),
    ).toHaveTextContent("account:todayMetricAvailability.pendingRefresh")

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        stats: buildAccountStats({
          today_total_prompt_tokens: 0,
          today_total_completion_tokens: 0,
        }),
      }),
    )
    rerender(<TokenStats key="complete-zero" />)

    expect(screen.getAllByText("0")).toHaveLength(2)
    expect(
      screen.queryByText("account:todayMetricAvailability.pendingRefresh"),
    ).not.toBeInTheDocument()
  })

  it("shows legacy token refresh guidance when the unavailable value receives keyboard focus", async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        stats: buildAccountStats({
          todayStatsCoverage: {
            ...buildAccountStats().todayStatsCoverage,
            tokens: {
              status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
              completeCount: 0,
              partialCount: 0,
              eligibleCount: 1,
              legacyUnclassifiedCount: 1,
            },
          },
        }),
      }),
    )

    render(<TokenStats />)

    const unavailableValue = screen.getByRole("status", {
      name: "account:todayMetricAvailability.pendingRefreshHelp",
    })
    await user.tab()
    expect(unavailableValue).toHaveFocus()
    expect(screen.getByTestId("tooltip")).toHaveAttribute(
      "data-content",
      "account:todayMetricAvailability.pendingRefreshHelp",
    )
  })

  it("exposes the complete token breakdown to keyboard users", async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    render(<TokenStats />)

    const breakdown = screen.getByRole("group", {
      name: /account:stats\.prompt.*account:stats\.completion/,
    })
    await user.tab()

    expect(breakdown).toHaveFocus()
    expect(breakdown).toHaveAccessibleName(
      /account:stats\.prompt.*account:stats\.completion/,
    )
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
      name: /common:currency\.clickToSwitch/,
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
      screen.getByRole("button", {
        name: /common:currency\.clickToSwitch/,
      }),
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
