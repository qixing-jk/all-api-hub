import userEvent from "@testing-library/user-event"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
import BalanceDisplay from "~/features/AccountManagement/components/AccountList/BalanceDisplay"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import { getDisplayMoneyValue } from "~/utils/core/money"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

const {
  mockUseAccountActionsContext,
  mockUseAccountDataContext,
  mockUseUserPreferencesContext,
} = vi.hoisted(() => ({
  mockUseAccountActionsContext: vi.fn(),
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

vi.mock("~/features/AccountManagement/hooks/AccountActionsContext", () => ({
  useAccountActionsContext: () => mockUseAccountActionsContext(),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => mockUseAccountDataContext(),
}))

describe("BalanceDisplay", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: "USD",
      showTodayCashflow: true,
      preferences: {
        balanceHistory: {
          estimatedTodayIncome: { enabled: false },
        },
      },
    })
    mockUseAccountDataContext.mockReturnValue({
      isInitialLoad: false,
      prevBalances: {
        "account-1": { USD: 10, CNY: 70 },
      },
    })
    mockUseAccountActionsContext.mockReturnValue({
      handleRefreshAccount: vi.fn().mockResolvedValue(undefined),
      refreshingAccountId: null,
    })
  })

  it("renders clickable balance and cashflow values from the selected currency and refreshes on click", async () => {
    const user = userEvent.setup()
    const site = buildDisplaySiteData({
      balance: { USD: 25.25, CNY: 176.75 },
      todayConsumption: { USD: 3, CNY: 21 },
      todayIncome: { USD: 2, CNY: 14 },
    })
    const updatedSite = buildDisplaySiteData({
      ...site,
      balance: { USD: 30.25, CNY: 211.75 },
      todayConsumption: { USD: 4, CNY: 28 },
      todayIncome: { USD: 3, CNY: 21 },
    })
    const handleRefreshAccount = vi.fn().mockResolvedValue(undefined)

    mockUseAccountActionsContext.mockReturnValue({
      handleRefreshAccount,
      refreshingAccountId: null,
    })

    const { rerender } = render(<BalanceDisplay site={site} />)
    expect(screen.queryByTestId("countup")).toBeNull()
    expect(
      screen.getByTitle("account:list.balance.refreshBalance"),
    ).toHaveTextContent("$25.25")

    rerender(<BalanceDisplay site={updatedSite} />)

    const [balanceValue, consumptionValue, incomeValue] =
      screen.getAllByTestId("countup")

    expect(balanceValue).toHaveAttribute(
      "data-start",
      String(getDisplayMoneyValue(10)),
    )
    expect(balanceValue).toHaveAttribute(
      "data-end",
      String(getDisplayMoneyValue(30.25)),
    )
    expect(balanceValue).toHaveAttribute(
      "data-duration",
      String(UI_CONSTANTS.ANIMATION.FAST_DURATION),
    )

    const balanceNode = screen.getByTitle("account:list.balance.refreshBalance")
    const consumptionNode = screen.getByTitle(
      "account:list.balance.refreshCashflow",
    )
    const incomeNode = screen.getByTitle("account:list.balance.refreshIncome")

    expect(balanceNode).toHaveClass("cursor-pointer")
    expect(balanceNode).toHaveClass("ml-auto", "text-right")
    expect(consumptionNode).toHaveClass("text-green-500")
    expect(consumptionNode).toHaveClass("ml-auto", "text-right")
    expect(incomeNode).toHaveClass("text-blue-500")
    expect(incomeNode).toHaveClass("ml-auto", "text-right")
    expect(consumptionValue).toHaveAttribute("data-end", "4")
    expect(incomeValue).toHaveAttribute("data-end", "3")

    await user.click(balanceNode)

    expect(handleRefreshAccount).toHaveBeenCalledWith(updatedSite, true)
  })

  it("animates an initial-load balance update slowly from zero", () => {
    const site = buildDisplaySiteData({
      balance: { USD: 25.25, CNY: 176.75 },
    })
    const updatedSite = buildDisplaySiteData({
      ...site,
      balance: { USD: 30.25, CNY: 211.75 },
    })
    mockUseAccountDataContext.mockReturnValue({
      isInitialLoad: true,
      prevBalances: {
        [site.id]: { USD: 25.25, CNY: 176.75 },
      },
    })

    const { rerender } = render(<BalanceDisplay site={site} />)
    expect(screen.queryByTestId("countup")).toBeNull()

    rerender(<BalanceDisplay site={updatedSite} />)

    const balanceValue = within(
      screen.getByTitle("account:list.balance.refreshBalance"),
    ).getByTestId("countup")
    expect(balanceValue).toHaveAttribute("data-start", "0")
    expect(balanceValue).toHaveAttribute(
      "data-duration",
      String(UI_CONSTANTS.ANIMATION.SLOW_DURATION),
    )
  })

  it("qualifies partial daily values without hiding their refresh actions", async () => {
    const user = userEvent.setup()
    const handleRefreshAccount = vi.fn().mockResolvedValue(undefined)
    const site = buildDisplaySiteData({
      todayConsumption: { USD: 3, CNY: 21 },
      todayIncome: { USD: 2, CNY: 14 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability({
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
          reason: ACCOUNT_TODAY_METRIC_REASONS.PageLimit,
        },
      }),
    })
    mockUseAccountActionsContext.mockReturnValue({
      handleRefreshAccount,
      refreshingAccountId: null,
    })

    render(<BalanceDisplay site={site} />)

    const partialValue = screen.getByRole("button", {
      name: /account:todayMetricAvailability\.partial/,
    })
    expect(partialValue).toHaveTextContent("-$3.00")
    expect(partialValue).toHaveAccessibleName(
      /-\$3\.00.*account:todayMetricAvailability\.partial/,
    )

    await user.tab()
    await user.tab()
    expect(partialValue).toHaveFocus()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "account:todayMetricAvailability.partial",
    )

    await user.click(partialValue)
    expect(handleRefreshAccount).toHaveBeenCalledWith(site, true)
  })

  it("renders unavailable daily values as em dashes without animating compatibility numbers", async () => {
    const user = userEvent.setup()
    const handleRefreshAccount = vi.fn().mockResolvedValue(undefined)
    const site = buildDisplaySiteData({
      todayConsumption: { USD: 999, CNY: 6993 },
      todayIncome: { USD: 888, CNY: 6216 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability({
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
        },
      }),
    })
    mockUseAccountActionsContext.mockReturnValue({
      handleRefreshAccount,
      refreshingAccountId: null,
    })

    render(<BalanceDisplay site={site} />)

    const unavailableValues = screen.getAllByRole("button", {
      name: /account:todayMetricAvailability\.unavailable/,
    })
    expect(unavailableValues).toHaveLength(2)
    expect(unavailableValues[0]).toHaveTextContent("—")
    expect(unavailableValues[1]).toHaveTextContent("—")
    expect(screen.queryByText(/999|888/)).not.toBeInTheDocument()

    await user.click(unavailableValues[0])
    expect(handleRefreshAccount).toHaveBeenCalledWith(site, true)
  })

  it("shows a visible legacy refresh action with dedicated help copy", async () => {
    const user = userEvent.setup()
    const handleRefreshAccount = vi.fn().mockResolvedValue(undefined)
    const site = buildDisplaySiteData({
      todayConsumption: { USD: 999, CNY: 6993 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability({
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
        },
      }),
    })
    mockUseAccountActionsContext.mockReturnValue({
      handleRefreshAccount,
      refreshingAccountId: null,
    })

    render(<BalanceDisplay site={site} />)

    const legacyValue = screen.getByRole("button", {
      name: /account:todayMetricAvailability\.refreshActionHelp/,
    })
    expect(legacyValue).toHaveTextContent(
      "account:todayMetricAvailability.clickToRefresh",
    )
    expect(legacyValue).not.toHaveTextContent("—")
    expect(
      screen.queryByRole("button", {
        name: /account:todayMetricAvailability\.unavailable/,
      }),
    ).not.toBeInTheDocument()

    await user.tab()
    await user.tab()
    expect(legacyValue).toHaveFocus()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "account:todayMetricAvailability.refreshActionHelp",
    )

    await user.click(legacyValue)
    expect(handleRefreshAccount).toHaveBeenCalledWith(site, true)
  })

  it("renders the account estimated income when enabled and available", async () => {
    const user = userEvent.setup()
    const site = buildDisplaySiteData({
      balance: { USD: 25.25, CNY: 176.75 },
      todayConsumption: { USD: 3, CNY: 21 },
      todayIncome: { USD: 2, CNY: 14 },
      estimatedTodayIncome: { USD: 5.5, CNY: 38.5 },
    })
    const updatedSite = buildDisplaySiteData({
      ...site,
      estimatedTodayIncome: { USD: 6.5, CNY: 45.5 },
    })
    const handleRefreshAccount = vi.fn().mockResolvedValue(undefined)

    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: "USD",
      showTodayCashflow: true,
      preferences: {
        balanceHistory: {
          estimatedTodayIncome: { enabled: true },
        },
      },
    })
    mockUseAccountActionsContext.mockReturnValue({
      handleRefreshAccount,
      refreshingAccountId: null,
    })

    const { rerender } = render(<BalanceDisplay site={site} />)

    expect(screen.queryByTestId("countup")).toBeNull()

    rerender(<BalanceDisplay site={updatedSite} />)

    const estimatedNode = screen.getByTitle(
      "account:stats.estimatedTodayIncome",
    )
    expect(
      screen.getByRole("button", {
        name: "account:stats.estimatedTodayIncome",
      }),
    ).toHaveTextContent("~$6.50")
    expect(estimatedNode).toHaveClass("text-indigo-500")
    expect(estimatedNode).toHaveTextContent("~$6.50")
    expect(screen.getAllByTestId("countup").at(-1)).toHaveAttribute(
      "data-end",
      "6.5",
    )

    await user.click(estimatedNode)

    expect(handleRefreshAccount).toHaveBeenCalledWith(updatedSite, true)
  })

  it("hides account estimated income when the preference is disabled or unavailable", () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: "USD",
      showTodayCashflow: true,
      preferences: {
        balanceHistory: {
          estimatedTodayIncome: { enabled: false },
        },
      },
    })

    const { rerender } = render(
      <BalanceDisplay
        site={buildDisplaySiteData({
          estimatedTodayIncome: { USD: 5.5, CNY: 38.5 },
        })}
      />,
    )

    expect(
      screen.queryByTitle("account:stats.estimatedTodayIncome"),
    ).not.toBeInTheDocument()

    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: "USD",
      showTodayCashflow: true,
      preferences: {
        balanceHistory: {
          estimatedTodayIncome: { enabled: true },
        },
      },
    })

    rerender(
      <BalanceDisplay
        site={buildDisplaySiteData({ estimatedTodayIncome: null })}
      />,
    )

    expect(
      screen.queryByTitle("account:stats.estimatedTodayIncome"),
    ).not.toBeInTheDocument()
  })

  it("renders neutral disabled estimated income without a refresh action", async () => {
    const user = userEvent.setup()
    const handleRefreshAccount = vi.fn().mockResolvedValue(undefined)

    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: "USD",
      showTodayCashflow: true,
      preferences: {
        balanceHistory: {
          estimatedTodayIncome: { enabled: true },
        },
      },
    })
    mockUseAccountActionsContext.mockReturnValue({
      handleRefreshAccount,
      refreshingAccountId: null,
    })

    render(
      <BalanceDisplay
        site={buildDisplaySiteData({
          disabled: true,
          estimatedTodayIncome: { USD: 0, CNY: 0 },
        })}
      />,
    )

    const disabledValues = screen.getAllByTitle("account:list.site.disabled")
    const estimatedNode = disabledValues.at(-1)!
    expect(estimatedNode).toHaveTextContent("~$0.00")
    expect(estimatedNode).toHaveClass("text-gray-400")
    expect(
      screen.queryByRole("button", {
        name: "account:stats.estimatedTodayIncome",
      }),
    ).not.toBeInTheDocument()

    await user.click(estimatedNode)

    expect(handleRefreshAccount).not.toHaveBeenCalled()
  })

  it("renders a neutral enabled estimated income as a refresh action", async () => {
    const user = userEvent.setup()
    const handleRefreshAccount = vi.fn().mockResolvedValue(undefined)

    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: "USD",
      showTodayCashflow: true,
      preferences: {
        balanceHistory: {
          estimatedTodayIncome: { enabled: true },
        },
      },
    })
    mockUseAccountActionsContext.mockReturnValue({
      handleRefreshAccount,
      refreshingAccountId: null,
    })

    const site = buildDisplaySiteData({
      disabled: false,
      estimatedTodayIncome: { USD: 0, CNY: 0 },
    })
    render(<BalanceDisplay site={site} />)

    const estimatedButton = screen.getByRole("button", {
      name: "account:stats.estimatedTodayIncome",
    })
    expect(estimatedButton).toHaveTextContent("~$0.00")
    expect(estimatedButton).toHaveClass("text-gray-400")

    await user.click(estimatedButton)

    expect(handleRefreshAccount).toHaveBeenCalledWith(site, true)
  })

  it("shows disabled titles and neutral cashflow styling without refreshing disabled accounts", async () => {
    const user = userEvent.setup()
    const site = buildDisplaySiteData({
      disabled: true,
      balance: { USD: 5, CNY: 35 },
      todayConsumption: { USD: 0, CNY: 0 },
      todayIncome: { USD: 0, CNY: 0 },
    })
    const handleRefreshAccount = vi.fn().mockResolvedValue(undefined)

    mockUseAccountActionsContext.mockReturnValue({
      handleRefreshAccount,
      refreshingAccountId: null,
    })

    render(<BalanceDisplay site={site} />)

    const disabledValues = screen.getAllByTitle("account:list.site.disabled")
    expect(disabledValues).toHaveLength(3)
    expect(disabledValues[0]).not.toHaveClass("cursor-pointer")
    expect(disabledValues[1]).toHaveClass("text-gray-400")
    expect(disabledValues[2]).toHaveClass("text-gray-400")

    await user.click(disabledValues[0])

    expect(handleRefreshAccount).not.toHaveBeenCalled()
  })

  it("keeps disabled partial cashflow static while exposing each value and localized qualifier", async () => {
    const user = userEvent.setup()
    const handleRefreshAccount = vi.fn().mockResolvedValue(undefined)
    const site = buildDisplaySiteData({
      disabled: true,
      todayConsumption: { USD: 3, CNY: 21 },
      todayIncome: { USD: 2, CNY: 14 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability({
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
          reason: ACCOUNT_TODAY_METRIC_REASONS.PageLimit,
        },
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
          reason: ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
        },
      }),
    })
    mockUseAccountActionsContext.mockReturnValue({
      handleRefreshAccount,
      refreshingAccountId: null,
    })

    render(<BalanceDisplay site={site} />)

    const partialValues = screen.getAllByLabelText(
      /account:todayMetricAvailability\.partial/,
    )
    expect(partialValues).toHaveLength(2)
    expect(partialValues[0]).toHaveTextContent("-$3.00")
    expect(partialValues[1]).toHaveTextContent("+$2.00")
    partialValues.forEach((value) => {
      expect(value).not.toHaveAttribute("role", "button")
      expect(value).toHaveAttribute("tabindex", "0")
      expect(value).toHaveAttribute("title", "account:list.site.disabled")
    })

    await user.click(partialValues[0])
    expect(handleRefreshAccount).not.toHaveBeenCalled()
  })

  it("keeps disabled unavailable cashflow static and hides compatibility values behind an accessible status", async () => {
    const user = userEvent.setup()
    const handleRefreshAccount = vi.fn().mockResolvedValue(undefined)
    const site = buildDisplaySiteData({
      disabled: true,
      todayConsumption: { USD: 999, CNY: 6993 },
      todayIncome: { USD: 888, CNY: 6216 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability({
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
        },
      }),
    })
    mockUseAccountActionsContext.mockReturnValue({
      handleRefreshAccount,
      refreshingAccountId: null,
    })

    render(<BalanceDisplay site={site} />)

    const unavailableValues = screen.getAllByLabelText(
      /account:todayMetricAvailability\.unavailable/,
    )
    expect(unavailableValues).toHaveLength(2)
    unavailableValues.forEach((value) => {
      expect(value).toHaveTextContent("—")
      expect(value).not.toHaveAttribute("role", "button")
      expect(value).not.toHaveAttribute("tabindex")
    })
    expect(screen.queryByText(/999|888/)).not.toBeInTheDocument()

    await user.click(unavailableValues[0])
    expect(handleRefreshAccount).not.toHaveBeenCalled()
  })

  it("shows disabled legacy cashflow as a focusable pending status instead of a refresh action", async () => {
    const user = userEvent.setup()
    const handleRefreshAccount = vi.fn().mockResolvedValue(undefined)
    const site = buildDisplaySiteData({
      disabled: true,
      todayConsumption: { USD: 999, CNY: 6993 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability({
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
        },
      }),
    })
    mockUseAccountActionsContext.mockReturnValue({
      handleRefreshAccount,
      refreshingAccountId: null,
    })

    render(<BalanceDisplay site={site} />)

    const pendingValue = screen.getByLabelText(
      "account:todayMetricAvailability.pendingRefreshHelp",
    )
    expect(pendingValue).toHaveTextContent(
      "account:todayMetricAvailability.pendingRefresh",
    )
    expect(pendingValue).not.toHaveTextContent(
      "account:todayMetricAvailability.clickToRefresh",
    )
    expect(pendingValue).not.toHaveAttribute("role", "button")
    expect(
      screen.queryByRole("button", {
        name: /account:todayMetricAvailability\.refreshActionHelp/,
      }),
    ).not.toBeInTheDocument()

    await user.tab()
    expect(pendingValue).toHaveFocus()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "account:todayMetricAvailability.pendingRefreshHelp",
    )
    expect(handleRefreshAccount).not.toHaveBeenCalled()
  })

  it("animates from zero when no previous balance snapshot exists for the account", () => {
    const site = buildDisplaySiteData({
      balance: { USD: 14.5, CNY: 101.5 },
      todayConsumption: { USD: 0, CNY: 0 },
      todayIncome: { USD: 0, CNY: 0 },
    })
    const updatedSite = buildDisplaySiteData({
      ...site,
      balance: { USD: 16.5, CNY: 115.5 },
    })

    mockUseAccountDataContext.mockReturnValue({
      isInitialLoad: false,
      prevBalances: {},
    })

    const { rerender } = render(<BalanceDisplay site={site} />)

    expect(screen.queryByTestId("countup")).toBeNull()

    rerender(<BalanceDisplay site={updatedSite} />)

    const [balanceValue] = screen.getAllByTestId("countup")

    expect(balanceValue).toHaveAttribute("data-start", "0")
    expect(balanceValue).toHaveAttribute(
      "data-end",
      String(getDisplayMoneyValue(16.5)),
    )
    expect(balanceValue).toHaveAttribute(
      "data-duration",
      String(UI_CONSTANTS.ANIMATION.FAST_DURATION),
    )
  })

  it("keeps the refreshing state visible and ignores repeat refresh clicks while the account is already refreshing", async () => {
    const user = userEvent.setup()
    const site = buildDisplaySiteData({
      balance: { USD: 18, CNY: 126 },
      todayConsumption: { USD: 1, CNY: 7 },
      todayIncome: { USD: 0, CNY: 0 },
    })
    const handleRefreshAccount = vi.fn().mockResolvedValue(undefined)

    mockUseAccountActionsContext.mockReturnValue({
      handleRefreshAccount,
      refreshingAccountId: site.id,
    })

    render(<BalanceDisplay site={site} />)

    const balanceNode = screen.getByTitle("account:list.balance.refreshBalance")
    expect(balanceNode).toHaveClass("animate-pulse", "opacity-60")
    expect(balanceNode).toBeDisabled()
    expect(balanceNode).not.toHaveAttribute("aria-busy")
    expect(
      screen.getByRole("button", {
        name: "account:list.balance.refreshCashflow",
      }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: "account:list.balance.refreshCashflow",
      }),
    ).not.toHaveAttribute("aria-busy")

    await user.click(balanceNode)

    expect(handleRefreshAccount).not.toHaveBeenCalled()
  })

  it.each([
    "account:list.balance.refreshBalance",
    "account:list.balance.refreshCashflow",
    "account:list.balance.refreshIncome",
  ])(
    "marks only %s busy and restores every metric after a rejected refresh",
    async (initiatorName) => {
      const user = userEvent.setup()
      const site = buildDisplaySiteData({
        balance: { USD: 18, CNY: 126 },
        todayConsumption: { USD: 1, CNY: 7 },
        todayIncome: { USD: 2, CNY: 14 },
      })
      const deferredRefresh = createDeferred<void>()
      const handleRefreshAccount = vi.fn(() => deferredRefresh.promise)

      mockUseAccountActionsContext.mockReturnValue({
        handleRefreshAccount,
        refreshingAccountId: null,
      })

      render(<BalanceDisplay site={site} />)

      const balanceButton = screen.getByRole("button", {
        name: "account:list.balance.refreshBalance",
      })
      const cashflowButton = screen.getByRole("button", {
        name: "account:list.balance.refreshCashflow",
      })
      const incomeButton = screen.getByRole("button", {
        name: "account:list.balance.refreshIncome",
      })

      const buttons = [balanceButton, cashflowButton, incomeButton]
      const initiator = screen.getByRole("button", { name: initiatorName })
      const siblings = buttons.filter((button) => button !== initiator)

      await user.click(initiator)

      expect(initiator).toHaveAttribute("aria-busy", "true")
      expect(initiator).toBeDisabled()
      for (const sibling of siblings) {
        expect(sibling).toBeDisabled()
        expect(sibling).not.toHaveAttribute("aria-busy")
      }

      await user.click(initiator)
      await user.click(siblings[0])
      expect(handleRefreshAccount).toHaveBeenCalledTimes(1)

      deferredRefresh.reject(new Error("refresh failed"))

      await waitFor(() => {
        expect(initiator).toBeEnabled()
      })
      for (const button of buttons) {
        expect(button).toBeEnabled()
        expect(button).not.toHaveAttribute("aria-busy")
      }
    },
  )

  it("renders static values on the first paint and hides today cashflow when that preference is disabled", () => {
    const site = buildDisplaySiteData({
      balance: { USD: 4, CNY: 28 },
      todayConsumption: { USD: 9, CNY: 63 },
      todayIncome: { USD: 8, CNY: 56 },
    })

    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: "CNY",
      showTodayCashflow: false,
    })
    mockUseAccountDataContext.mockReturnValue({
      isInitialLoad: true,
      prevBalances: {
        [site.id]: { USD: 100, CNY: 700 },
      },
    })

    render(<BalanceDisplay site={site} />)

    const balanceNode = screen.getByTitle("account:list.balance.refreshBalance")

    expect(
      screen.queryByTitle("account:list.balance.refreshCashflow"),
    ).toBeNull()
    expect(screen.queryByTitle("account:list.balance.refreshIncome")).toBeNull()
    expect(screen.queryByTestId("countup")).toBeNull()
    expect(balanceNode).toHaveTextContent("¥28.00")
  })

  it("renders provider usage and subscription details when account data exposes them", () => {
    render(
      <BalanceDisplay
        site={buildDisplaySiteData({
          usage: {
            scope: "current_period",
            totalRequests: 42,
            totalTokens: 12345,
            totalCost: 6.5,
            lastRequestTime: "2026-07-01T12:00:00.000Z",
          },
          subscription: {
            name: "Codex Pro",
            billingType: "amount",
            remainingAmount: 13.5,
            amountLimit: 20,
            remainingCount: 8,
            usedCount: 2,
            periodResetTime: "2026-08-01T00:00:00.000Z",
            expireTime: "2026-12-31T23:59:59.000Z",
            isActive: true,
          },
        } as any)}
      />,
    )

    expect(
      screen.getByTitle("account:stats.subscriptionTitle"),
    ).toHaveTextContent("Codex Pro")
    expect(screen.getByTitle("account:stats.usageRequests")).toHaveTextContent(
      "42",
    )
    expect(screen.getByTitle("account:stats.usageTokens")).toHaveTextContent(
      "12.3K",
    )
    expect(
      screen.getByTitle("account:stats.subscriptionRemainingCount"),
    ).toHaveTextContent("8")
  })

  it("marks inactive provider subscriptions so stale remaining quota is not shown as healthy", () => {
    render(
      <BalanceDisplay
        site={buildDisplaySiteData({
          subscription: {
            name: "codex 公益 每日100刀",
            billingType: "amount",
            remainingAmount: 100,
            amountLimit: 100,
            remainingCount: 100,
            periodResetTime: "2026-07-03T00:00:00.000+08:00",
            expireTime: "2026-06-13T00:00:00.000+08:00",
            isActive: false,
          },
        } as any)}
      />,
    )

    expect(
      screen.getByTitle("account:stats.subscriptionStatus"),
    ).toHaveTextContent("account:stats.subscriptionInactive")
    expect(
      screen.queryByTitle("account:stats.subscriptionRemainingCount"),
    ).not.toBeInTheDocument()
  })
})
