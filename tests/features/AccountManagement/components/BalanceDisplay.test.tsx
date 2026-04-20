import userEvent from "@testing-library/user-event"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
import BalanceDisplay from "~/features/AccountManagement/components/AccountList/BalanceDisplay"
import { getDisplayMoneyValue } from "~/utils/core/money"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { render, screen } from "~~/tests/test-utils/render"

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
    expect(consumptionNode).toHaveClass("text-green-500")
    expect(incomeNode).toHaveClass("text-blue-500")
    expect(consumptionValue).toHaveAttribute("data-end", "4")
    expect(incomeValue).toHaveAttribute("data-end", "3")

    await user.click(balanceNode)

    expect(handleRefreshAccount).toHaveBeenCalledWith(updatedSite, true)
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

    await user.click(balanceNode)

    expect(handleRefreshAccount).not.toHaveBeenCalled()
  })

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
})
