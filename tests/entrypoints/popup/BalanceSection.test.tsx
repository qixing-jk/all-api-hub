import { act, fireEvent, within } from "@testing-library/react"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import BalanceSection from "~/entrypoints/popup/components/BalanceSection"
import { UpdateTimeAndWarning } from "~/entrypoints/popup/components/BalanceSection/UpdateTimeAndWarning"
import { RELATIVE_TIME_REFRESH_INTERVAL_MS } from "~/entrypoints/popup/summaryConfig"
import AccountBalanceSummary from "~/features/AccountManagement/components/AccountBalanceSummary"
import { TokenStats } from "~/features/AccountManagement/components/TokenStats"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_NATURES,
  BALANCE_ROLES,
  BALANCE_VALIDITY_KINDS,
  FINANCIAL_COVERAGE,
} from "~/services/amounts/financialConstants"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import {
  buildAccountStats,
  buildCompleteTodayStatsAvailability,
} from "~~/tests/test-utils/accountTodayStats"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import {
  buildPeriodConsumption,
  buildPeriodIncome,
} from "~~/tests/test-utils/financialPeriod"
import { render, screen } from "~~/tests/test-utils/render"

const {
  formatFullTimeMock,
  formatRelativeTimeMock,
  mockUseAccountDataContext,
  mockUseUserPreferencesContext,
  trackActionStartedMock,
} = vi.hoisted(() => ({
  formatFullTimeMock: vi.fn(),
  formatRelativeTimeMock: vi.fn(),
  mockUseAccountDataContext: vi.fn(),
  mockUseUserPreferencesContext: vi.fn(),
  trackActionStartedMock: vi.fn(),
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

vi.mock("~/features/AccountManagement/data/AccountDataContext", () => ({
  useAccountDataContext: () => mockUseAccountDataContext(),
}))

vi.mock("~/services/productAnalytics/actions", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/productAnalytics/actions")
  >()),
  trackProductAnalyticsActionStarted: trackActionStartedMock,
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

function nativeBalance(accountId: string, value: string) {
  const scope = accountBalanceScope({
    baseUrl: "https://example.com",
    accountId,
  })
  return accountBalanceSnapshot(
    scope,
    [
      balancePosition({
        id: "wallet",
        scope,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        value,
        observedAt: 100,
        nature: BALANCE_NATURES.Prepaid,
        role: BALANCE_ROLES.Available,
        validity: { kind: BALANCE_VALIDITY_KINDS.NoExpiry },
        source: {
          adapter: "fixture",
          operation: "balance",
          contractVersion: "1",
          kind: "reported",
        },
      }),
    ],
    100,
    FINANCIAL_COVERAGE.Complete,
  )
}

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
      balanceSnapshot: nativeBalance("acc-enabled", "10"),
      balance: { USD: 10, CNY: 70 },
      todayConsumption: { USD: 0.8, CNY: 5.6 },
      todayIncome: { USD: 1.25, CNY: 8.75 },
      settledConsumption: [buildPeriodConsumption("acc-enabled", "0.8")],
      reportedIncome: [buildPeriodIncome("acc-enabled", "1.25")],
    }),
    buildDisplaySiteData({
      id: "acc-disabled",
      name: "Disabled Account",
      balanceSnapshot: nativeBalance("acc-disabled", "20"),
      disabled: true,
      balance: { USD: 20, CNY: 140 },
      todayConsumption: { USD: 9, CNY: 63 },
      todayIncome: { USD: 2, CNY: 14 },
      settledConsumption: [buildPeriodConsumption("acc-disabled", "9")],
      reportedIncome: [buildPeriodIncome("acc-disabled", "2")],
    }),
  ],
  stats: buildAccountStats({
    today_total_consumption: 400_000,
    today_total_income: 250_000,
    today_total_requests: 12,
    today_total_prompt_tokens: 300,
    today_total_completion_tokens: 700,
  }),
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
      currencyType: CURRENCIES.USD,
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

  it("renders enabled-account native financial totals under the selected currency preference", () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.CNY,
      showTodayCashflow: true,
      updateCurrencyType: vi.fn(),
      preferences: {
        balanceHistory: { estimatedTodayIncome: { enabled: false } },
      },
    })
    render(<AccountBalanceSummary />)
    expect(screen.getByText("¥72.00")).toBeInTheDocument()
    expect(
      screen.getByRole("region", { name: "account:stats.todayConsumption" }),
    ).toHaveTextContent(/CNY\s*5\.76/)
    expect(
      screen.getByRole("region", { name: "account:filteredTotals.income" }),
    ).toHaveTextContent(/CNY\s*9\.00/)
    fireEvent.click(
      screen.getByRole("button", { name: "account:financial.summary" }),
    )
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "account:financial.summary" }),
      ).getByRole("button", { name: "account:financial.assetCount" }),
    )
    expect(screen.getByText(/USD\s*10/)).toBeInTheDocument()
    expect(screen.queryByText(/USD\s*30/)).not.toBeInTheDocument()
  })

  it("excludes disabled accounts and today-income opt-outs from native popup income totals", () => {
    const sites = [
      buildDisplaySiteData({
        id: "included",
        reportedIncome: [buildPeriodIncome("included", "2")],
      }),
      buildDisplaySiteData({
        id: "excluded",
        excludeFromTodayIncome: true,
        reportedIncome: [buildPeriodIncome("excluded", "20")],
      }),
      buildDisplaySiteData({
        id: "disabled",
        disabled: true,
        reportedIncome: [buildPeriodIncome("disabled", "30")],
      }),
    ]
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({ displayData: sites }),
    )
    render(<AccountBalanceSummary />)
    const income = screen.getByRole("region", {
      name: "account:filteredTotals.income",
    })
    expect(income).toHaveTextContent(/USD\s*2/)
    expect(income).not.toHaveTextContent(/USD\s*(20|30|52)/)
  })

  it("explains partial native totals in details and preserves unavailable amounts", () => {
    const partial = buildDisplaySiteData({
      id: "partial",
      settledConsumption: [
        buildPeriodConsumption(
          "partial",
          "3",
          CURRENCIES.USD,
          FINANCIAL_COVERAGE.Partial,
        ),
      ],
    })
    const unavailable = buildDisplaySiteData({
      id: "unavailable",
      name: "Offline account",
      todayConsumption: { USD: 999, CNY: 6993 },
      todayStatsAvailability: buildCompleteTodayStatsAvailability({
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
        },
      }),
    })
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({ displayData: [partial, unavailable] }),
    )
    const { rerender } = render(<AccountBalanceSummary />)
    const consumption = screen.getByRole("region", {
      name: "account:stats.todayConsumption",
    })
    expect(consumption).toHaveTextContent(/USD\s*3/)
    expect(consumption).not.toHaveTextContent(
      "shareSnapshots:financial.partial",
    )
    expect(consumption).not.toHaveTextContent("999")
    fireEvent.click(
      screen.getByRole("button", { name: "account:financial.summary" }),
    )
    const partialDetails = screen.getByRole("group", {
      name: "account:stats.todayConsumption",
    })
    expect(partialDetails).toHaveTextContent(
      "account:todayMetricAvailability.coverage",
    )
    fireEvent.click(
      within(partialDetails).getByRole("button", {
        name: /account:financial\.exclusions\.heading/,
      }),
    )
    expect(partialDetails).toHaveTextContent(
      /Offline account.*financial\.exclusions\.requestFailed/,
    )
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({ displayData: [unavailable] }),
    )
    rerender(<AccountBalanceSummary />)
    expect(
      screen.getByRole("region", { name: "account:stats.todayConsumption" }),
    ).toHaveTextContent("account:financial.unavailable")
    fireEvent.click(
      screen.getByRole("button", { name: "account:financial.summary" }),
    )
    const unavailableSummary = screen.getByRole("group", {
      name: "account:stats.todayConsumption",
    })
    expect(unavailableSummary).toHaveTextContent(
      "account:todayMetricAvailability.unavailable",
    )
    expect(unavailableSummary).not.toHaveTextContent(/USD\s*0/)
  })

  it("shows pending-refresh guidance for unclassified legacy popup amounts", () => {
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
          reason: ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
        },
      }),
    })
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({ displayData: [legacy] }),
    )
    render(<AccountBalanceSummary />)
    fireEvent.click(
      screen.getByRole("button", { name: "account:financial.summary" }),
    )
    for (const name of [
      "account:stats.todayConsumption",
      "account:filteredTotals.income",
    ]) {
      const summary = screen.getByRole("group", { name })
      expect(summary).toHaveTextContent(
        "account:todayMetricAvailability.pendingRefresh",
      )
      expect(summary).not.toHaveTextContent("999")
    }
  })

  it("shows the compact token total in the overview and the complete counts in details", () => {
    const { rerender } = render(<TokenStats />)
    const label = "account:stats.todayTokens"
    expect(screen.getByRole("region", { name: label })).toHaveTextContent(
      "1.0K",
    )
    expect(screen.queryByText("account:stats.prompt")).not.toBeInTheDocument()

    rerender(<TokenStats detailed />)
    expect(screen.getByRole("heading", { name: label })).toBeVisible()
    expect(screen.getByText("account:stats.prompt")).toBeVisible()
    expect(screen.getByText("account:stats.completion")).toBeVisible()
    expect(screen.getByText("300")).toBeVisible()
    expect(screen.getByText("700")).toBeVisible()
  })

  it("reports partial token coverage without exposing incomplete input and output counts", () => {
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        stats: buildAccountStats({
          today_total_prompt_tokens: 300,
          today_total_completion_tokens: 700,
          todayStatsCoverage: {
            ...buildAccountStats().todayStatsCoverage,
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
    render(<TokenStats detailed />)

    expect(screen.getByText("1,000")).toBeVisible()
    expect(
      screen.getByText("account:todayMetricAvailability.coverageWithRefresh"),
    ).toBeVisible()
    expect(screen.queryByText("300")).not.toBeInTheDocument()
    expect(screen.queryByText("700")).not.toBeInTheDocument()
  })

  it.each([0, 1])(
    "explains unavailable token data with %s accounts pending refresh",
    (pending) => {
      mockUseAccountDataContext.mockReturnValue(
        createAccountDataContextValue({
          stats: buildAccountStats({
            today_total_prompt_tokens: 999,
            today_total_completion_tokens: 888,
            todayStatsCoverage: {
              ...buildAccountStats().todayStatsCoverage,
              tokens: {
                status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
                completeCount: 0,
                partialCount: 0,
                eligibleCount: 2,
                legacyUnclassifiedCount: pending,
              },
            },
          }),
        }),
      )
      render(<TokenStats detailed />)

      expect(
        screen.getByText(
          pending
            ? "account:todayMetricAvailability.pendingRefresh"
            : "account:financial.unavailable",
        ),
      ).toBeVisible()
      const help = screen.queryByText(
        "account:todayMetricAvailability.pendingRefreshHelp",
      )
      if (pending) expect(help).toBeVisible()
      else expect(help).not.toBeInTheDocument()
      expect(screen.queryByText(/999|888/)).not.toBeInTheDocument()
    },
  )

  it("preserves zero as an available token total", () => {
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        stats: buildAccountStats({
          today_total_prompt_tokens: 0,
          today_total_completion_tokens: 0,
        }),
      }),
    )
    render(<TokenStats />)
    expect(
      screen.getByRole("region", { name: "account:stats.todayTokens" }),
    ).toHaveTextContent("0")
  })

  it("hides cashflow when disabled and keeps original USD balance in details under the CNY preference", () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.CNY,
      showTodayCashflow: false,
      updateCurrencyType: vi.fn(),
      preferences: {
        balanceHistory: { estimatedTodayIncome: { enabled: false } },
      },
    })
    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({ isInitialLoad: true }),
    )
    render(<AccountBalanceSummary />)
    expect(screen.getByText("¥72.00")).toBeInTheDocument()
    expect(screen.queryByText(/CNY\s*70|¥70/)).not.toBeInTheDocument()
    expect(screen.queryByTestId("countup")).not.toBeInTheDocument()
    expect(
      screen.queryByText("account:stats.todayConsumption"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("region", { name: "account:filteredTotals.income" }),
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole("button", { name: "account:financial.summary" }),
    )
    fireEvent.click(
      screen.getByRole("button", { name: "account:financial.assetCount" }),
    )
    expect(screen.getByText(/USD\s*10/)).toBeInTheDocument()
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
      vi.advanceTimersByTime(RELATIVE_TIME_REFRESH_INTERVAL_MS)
    })

    expect(formatRelativeTimeMock).toHaveBeenCalledTimes(2)
    expect(screen.getByText("common:time.updatedAt")).toBeInTheDocument()
  })

  it("filters the account list to the detected site origin when the detected-accounts badge is clicked", () => {
    const onFilterCurrentSiteAccounts = vi.fn()

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        detectedAccount: {
          id: "acc-enabled",
          site_name: "Fallback Login Name",
          site_url: "https://login.example.com/console",
        },
        detectedSiteAccounts: [
          {
            id: "acc-enabled",
            site_name: "Fallback Site",
            site_url: "https://login.example.com/console",
          },
        ],
      }),
    )

    render(
      <UpdateTimeAndWarning
        onFilterCurrentSiteAccounts={onFilterCurrentSiteAccounts}
      />,
    )

    const filterTrigger = screen.getByRole("button", {
      name: /account:currentLoginAdded/,
    })
    expect(filterTrigger).toHaveTextContent("account:currentSiteFilterAction")

    fireEvent.click(filterTrigger)

    expect(onFilterCurrentSiteAccounts).toHaveBeenCalledTimes(1)
    expect(onFilterCurrentSiteAccounts).toHaveBeenCalledWith(
      "login.example.com",
    )
  })

  it("passes internationalized site URLs through the search index's own domain form", () => {
    const onFilterCurrentSiteAccounts = vi.fn()

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        detectedSiteAccounts: [
          {
            id: "acc-idn",
            site_name: "IDN Site",
            site_url: "https://例え.テスト/console",
          },
        ],
      }),
    )

    render(
      <UpdateTimeAndWarning
        onFilterCurrentSiteAccounts={onFilterCurrentSiteAccounts}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", { name: /account:currentSiteAdded/ }),
    )

    // The account search index keeps baseUrl in its original Unicode form, so
    // a punycode host from URL.host would never match it.
    expect(onFilterCurrentSiteAccounts).toHaveBeenCalledWith("例え.テスト")
  })

  it("tracks the detected-site filter click through the popup analytics scope", () => {
    const onFilterCurrentSiteAccounts = vi.fn()

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        detectedSiteAccounts: [
          {
            id: "acc-enabled",
            site_name: "Fallback Site",
            site_url: "https://login.example.com/console",
          },
        ],
      }),
    )

    render(
      <ProductAnalyticsScope
        entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Popup}
        surfaceId={PRODUCT_ANALYTICS_SURFACE_IDS.PopupStats}
      >
        <UpdateTimeAndWarning
          onFilterCurrentSiteAccounts={onFilterCurrentSiteAccounts}
        />
      </ProductAnalyticsScope>,
    )

    fireEvent.click(
      screen.getByRole("button", { name: /account:currentSiteAdded/ }),
    )

    expect(trackActionStartedMock).toHaveBeenCalledTimes(1)
    expect(trackActionStartedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.PopupStats,
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterAccounts,
      }),
    )
  })

  it("composes the balance section and forwards the detected-site filter to the badge", () => {
    const onFilterCurrentSiteAccounts = vi.fn()

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        detectedSiteAccounts: [
          {
            id: "acc-enabled",
            site_name: "Fallback Site",
            site_url: "https://login.example.com/console",
          },
        ],
      }),
    )

    render(
      <BalanceSection
        onFilterCurrentSiteAccounts={onFilterCurrentSiteAccounts}
      />,
    )

    const summary = screen.getByRole("region", {
      name: "account:financial.summary",
    })
    expect(
      within(summary).getByRole("region", {
        name: "account:stats.todayTokens",
      }),
    ).toHaveTextContent("1.0K")

    fireEvent.click(
      screen.getByRole("button", { name: /account:currentSiteAdded/ }),
    )

    expect(onFilterCurrentSiteAccounts).toHaveBeenCalledWith(
      "login.example.com",
    )
  })

  it("renders the detected-accounts badge as a static hint when the site origin cannot be resolved", () => {
    const onFilterCurrentSiteAccounts = vi.fn()

    mockUseAccountDataContext.mockReturnValue(
      createAccountDataContextValue({
        detectedSiteAccounts: [
          { id: "acc-enabled", site_name: "Fallback Site" },
        ],
      }),
    )

    render(
      <UpdateTimeAndWarning
        onFilterCurrentSiteAccounts={onFilterCurrentSiteAccounts}
      />,
    )

    expect(screen.getByText("account:currentSiteAdded")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
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
