import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { afterEach, expect, it, vi } from "vitest"

import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { OverviewUsageSnapshot } from "~/features/OptionsOverview/usage/OverviewUsageSnapshot"
import { buildUsageSnapshot } from "~/features/OptionsOverview/usage/usageSnapshot"
import { calculateAccountStats } from "~/services/accounts/accountStorage/accountStatistics"
import { observeAmount } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
} from "~/services/amounts/financialConstants"
import { USAGE_HISTORY_STORE_SCHEMA_VERSION } from "~/types/usageHistory"
import {
  buildCompleteTodayStatsAvailability,
  buildFinancialPeriodFact,
} from "~~/tests/test-utils/accountTodayStats"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { render, screen, within } from "~~/tests/test-utils/render"

// Hoisted fixtures load dependency-free runtime values before component imports.
const { CURRENCIES, CURRENCY_DISPLAY_MODES } = await vi.hoisted(
  () => import("~/constants/money"),
)

const siteDayDisplay = vi.hoisted(() => ({
  mode: CURRENCY_DISPLAY_MODES.Original as "original" | "USD" | "CNY",
}))
vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useUserPreferencesContext: () => ({
    currencyType: CURRENCIES.USD,
    currencyDisplay: siteDayDisplay.mode,
  }),
}))
afterEach(() => {
  siteDayDisplay.mode = CURRENCY_DISPLAY_MODES.Original
})

it.each([
  [CURRENCIES.USD, /USD\s2\b/],
  [CURRENCIES.CNY, /CNY\s21\b/],
] as const)(
  "shows one complete %s local-day cost in Options Overview and retains original groups",
  async (mode, expected) => {
    siteDayDisplay.mode = mode
    const accounts = ([CURRENCIES.USD, CURRENCIES.CNY] as const).map((code) => {
      const account = buildSiteAccount({
        id: code,
        exchange_rate: code === CURRENCIES.USD ? 7 : 14,
      })
      account.account_info.settledConsumption = [
        buildFinancialPeriodFact({
          accountId: code,
          value: code === CURRENCIES.USD ? "1" : "14",
          asset: { kind: ASSET_KINDS.Currency, code },
        }),
      ]
      return account
    })
    const snapshot = buildUsageSnapshot(calculateAccountStats(accounts), {
      schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
      accounts: {},
    })
    const props = {
      snapshot,
      t: ((key: string) => key) as TFunction,
      onNavigate: vi.fn(),
    }
    const { rerender } = render(<OverviewUsageSnapshot {...props} />)
    expect(await screen.findAllByText(expected)).toHaveLength(1)
    expect(
      screen.queryByText("optionsOverview:todayMetricAvailability.partial"),
    ).not.toBeInTheDocument()
    siteDayDisplay.mode = CURRENCY_DISPLAY_MODES.Original
    rerender(<OverviewUsageSnapshot {...props} />)
    expect(screen.getByText(/USD\s1\b/)).toBeVisible()
    expect(screen.getByText(/CNY\s14\b/)).toBeVisible()
    expect(snapshot.todayCostGroups).toHaveLength(2)
  },
)

it.each([
  {
    mode: CURRENCY_DISPLAY_MODES.Original,
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
    value: "140.123456789",
    expected: /CNY\s*140\.123456789/,
  },
  {
    mode: CURRENCIES.USD,
    asset: {
      kind: ASSET_KINDS.Quota,
      id: "fixture:tokens",
      label: "Token",
      displayScale: 1000000,
      displayLabel: "M Token",
    },
    value: "3123456.789",
    expected: /3\.123456789 M Token/,
  },
] as const)(
  "retains original or noncurrency site-day precision through the overview ($mode)",
  async ({ mode, asset, value, expected }) => {
    siteDayDisplay.mode = mode
    const observedAt = Date.now()
    const account = buildSiteAccount({
      exchange_rate: 14,
      last_sync_time: observedAt,
    })
    account.account_info.usage = {
      scope: ACCOUNT_USAGE_SCOPES.SiteToday,
      observedAt,
      cost: {
        asset,
        amount: observeAmount(
          value,
          {
            adapter: "fixture",
            operation: "daily",
            contractVersion: "1",
            kind: EVIDENCE_KINDS.Reported,
          },
          observedAt,
        ),
      },
    }
    const snapshot = buildUsageSnapshot(calculateAccountStats([account]), {
      schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
      accounts: {},
    })
    render(
      <OverviewUsageSnapshot
        snapshot={snapshot}
        t={((key: string) => key) as TFunction}
        onNavigate={vi.fn()}
      />,
    )
    const siteDay = await screen.findByRole("region", {
      name: "optionsOverview:usage.siteDay",
    })
    expect(within(siteDay).getByText(expected)).toBeVisible()
  },
)

it.each([
  [CURRENCIES.USD, CURRENCIES.CNY, "140", /USD\s*10(?:\.00)?/],
  [CURRENCIES.CNY, CURRENCIES.USD, "10", /CNY\s*140(?:\.00)?/],
  [
    CURRENCY_DISPLAY_MODES.Original,
    CURRENCIES.CNY,
    "140",
    /CNY\s*140(?:\.00)?/,
  ],
] as const)(
  "shows site-day %s costs with the persisted account rate through the overview",
  async (mode, code, value, expected) => {
    siteDayDisplay.mode = mode
    const observedAt = Date.now()
    const account = buildSiteAccount({
      id: "fourteen-rate",
      site_name: "Fourteen-rate site",
      exchange_rate: 14,
      last_sync_time: observedAt,
    })
    account.account_info.usage = {
      scope: ACCOUNT_USAGE_SCOPES.SiteToday,
      reportedDay: "2026-11-17",
      observedAt,
      cost: {
        asset: { kind: ASSET_KINDS.Currency, code },
        amount: observeAmount(
          value,
          {
            adapter: "fixture",
            operation: "daily",
            contractVersion: "1",
            kind: EVIDENCE_KINDS.Reported,
          },
          observedAt,
        ),
      },
    }
    const snapshot = buildUsageSnapshot(calculateAccountStats([account]), {
      schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
      accounts: {},
    })
    const props = {
      snapshot,
      t: ((key: string) => key) as TFunction,
      onNavigate: vi.fn(),
    }
    const { rerender } = render(<OverviewUsageSnapshot {...props} />)
    const siteDay = await screen.findByRole("region", {
      name: "optionsOverview:usage.siteDay",
    })
    expect(within(siteDay).getByText(expected)).toBeVisible()
    expect(within(siteDay).getByText("2026-11-17")).toBeVisible()
    siteDayDisplay.mode = CURRENCY_DISPLAY_MODES.Original
    rerender(<OverviewUsageSnapshot {...props} />)
    expect(
      within(siteDay).getByText(new RegExp(`${code}\\s*${value}(?:\\.00)?`)),
    ).toBeVisible()
  },
)

it("uses each site's own rate for provider-day costs instead of a shared conversion rate", async () => {
  siteDayDisplay.mode = CURRENCIES.USD
  const observedAt = Date.now()
  const accounts = [14, 7].map((exchange_rate) => {
    const account = buildSiteAccount({
      id: `rate-${exchange_rate}`,
      site_name: `Site rate ${exchange_rate}`,
      exchange_rate,
      last_sync_time: observedAt,
    })
    account.account_info.usage = {
      scope: ACCOUNT_USAGE_SCOPES.SiteToday,
      observedAt,
      cost: {
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
        amount: observeAmount(
          "140",
          {
            adapter: "fixture",
            operation: "daily",
            contractVersion: "1",
            kind: EVIDENCE_KINDS.Reported,
          },
          observedAt,
        ),
      },
    }
    return account
  })
  const snapshot = buildUsageSnapshot(calculateAccountStats(accounts), {
    schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
    accounts: {},
  })
  render(
    <OverviewUsageSnapshot
      snapshot={snapshot}
      t={((key: string) => key) as TFunction}
      onNavigate={vi.fn()}
    />,
  )
  const siteDay = await screen.findByRole("region", {
    name: "optionsOverview:usage.siteDay",
  })
  expect(within(siteDay).getByText(/USD\s*10(?:\.00)?/)).toBeVisible()
  expect(within(siteDay).getByText(/USD\s*20(?:\.00)?/)).toBeVisible()
})

it("keeps the site reporting day and window through statistics without calling old counts today's", async () => {
  const observedAt = Date.parse("2026-11-17T03:00:00Z")
  const account = buildSiteAccount({
    site_type: SITE_TYPES.SUB2API,
    site_name: "Previous day API",
    last_sync_time: Date.now(),
  })
  account.account_info.usage = {
    scope: ACCOUNT_USAGE_SCOPES.SiteToday,
    reportedDay: "2026-11-17",
    observedAt,
    totalRequests: 15,
    totalTokens: 230,
    cost: {
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      amount: observeAmount(
        "1.25",
        {
          kind: EVIDENCE_KINDS.Reported,
          adapter: SITE_TYPES.SUB2API,
          operation: "usage",
          contractVersion: "usd/v1",
        },
        observedAt,
      ),
      window: {
        start: Date.parse("2026-11-17T00:00:00Z"),
        end: observedAt,
        timeZone: "UTC",
      },
    },
  }
  const snapshot = buildUsageSnapshot(calculateAccountStats([account]), {
    schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
    accounts: {},
  })
  const user = userEvent.setup()
  render(
    <OverviewUsageSnapshot
      t={((key: string) => key) as TFunction}
      onNavigate={vi.fn()}
      snapshot={snapshot}
    />,
  )
  const siteDay = await screen.findByRole("region", {
    name: "optionsOverview:usage.siteDay",
  })
  expect(within(siteDay).getByText("2026-11-17")).toBeVisible()
  expect(
    within(siteDay).getByText("optionsOverview:usage.requests"),
  ).toBeVisible()
  expect(
    within(siteDay).getByText("optionsOverview:usage.tokens"),
  ).toBeVisible()
  expect(
    within(siteDay).queryByText("optionsOverview:usage.todayRequests"),
  ).not.toBeInTheDocument()
  expect(
    within(siteDay).queryByText("optionsOverview:usage.todayTokens"),
  ).not.toBeInTheDocument()
  await user.click(
    within(siteDay).getByRole("button", {
      name: /Observation window|account:financial.window/,
    }),
  )
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Nov 17, 2026")
  expect(screen.getByRole("tooltip")).toHaveTextContent("UTC")
})

it("shows the original site-day observation time when no reporting day or window was supplied", async () => {
  const observedAt = Date.parse("2026-11-17T03:00:00Z")
  const account = buildSiteAccount({
    site_name: "Undated API",
    last_sync_time: Date.now(),
  })
  account.account_info.usage = {
    scope: ACCOUNT_USAGE_SCOPES.SiteToday,
    observedAt,
    totalRequests: 15,
  }
  const snapshot = buildUsageSnapshot(calculateAccountStats([account]), {
    schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
    accounts: {},
  })
  render(
    <OverviewUsageSnapshot
      t={((key: string) => key) as TFunction}
      onNavigate={vi.fn()}
      snapshot={snapshot}
    />,
  )
  const siteDay = await screen.findByRole("region", {
    name: "optionsOverview:usage.siteDay",
  })
  expect(siteDay.querySelector("time")).toHaveAttribute(
    "datetime",
    new Date(observedAt).toISOString(),
  )
  expect(siteDay.querySelector("time")).toHaveTextContent(
    new Date(observedAt).toLocaleString("en"),
  )
})

it.each([false, true])(
  "shows site usage even after the local day changes (%s)",
  async (previousDay) => {
    const now = Date.now() - (previousDay ? 86_400_000 : 0)
    const account = buildSiteAccount({
      site_type: SITE_TYPES.SUB2API,
      site_name: "Example API",
      last_sync_time: now,
    })
    account.account_info.usage = {
      scope: ACCOUNT_USAGE_SCOPES.SiteToday,
      totalRequests: 15,
      totalTokens: 230,
      cost: {
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        amount: observeAmount(
          "1.25",
          {
            kind: EVIDENCE_KINDS.Reported,
            adapter: SITE_TYPES.SUB2API,
            operation: "usage",
            contractVersion: "usd/v1",
          },
          now,
        ),
      },
    }
    const snapshot = buildUsageSnapshot(calculateAccountStats([account]), {
      schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
      accounts: {},
    })
    render(
      <OverviewUsageSnapshot
        t={((key: string) => key) as TFunction}
        onNavigate={vi.fn()}
        snapshot={snapshot}
      />,
    )

    expect(await screen.findByText("Example API")).toBeVisible()
    expect(screen.getByText(/USD\s*1.25/)).toBeVisible()
    expect(screen.getByText("15")).toBeVisible()
    expect(screen.getByText("230")).toBeVisible()
    if (previousDay)
      expect(screen.getByText("account:financial.lastKnown")).toBeVisible()
  },
)

it("discloses partial account coverage beside a reference cost", async () => {
  const account = buildSiteAccount({
    id: "current",
    last_sync_time: Date.now(),
  })
  account.account_info.today_quota_consumption = 1_250_000
  account.account_info.todayStatsAvailability =
    buildCompleteTodayStatsAvailability()
  const snapshot = buildUsageSnapshot(
    calculateAccountStats([account, buildSiteAccount({ id: "no-cost" })]),
    { schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION, accounts: {} },
  )
  render(
    <OverviewUsageSnapshot
      t={((key: string) => key) as TFunction}
      onNavigate={vi.fn()}
      snapshot={snapshot}
    />,
  )
  expect(await screen.findByText(/USD\s*2.5/)).toBeVisible()
  expect(
    screen.getByLabelText(/optionsOverview:todayMetricAvailability.partial/),
  ).toBeVisible()
  expect(
    screen.getAllByText("optionsOverview:todayMetricAvailability.partial")[0],
  ).toBeVisible()
})

it.each([false, true])(
  "renders native costs and distinguishes missing history from recorded zero (%s)",
  async (hasSevenDayUsageData) => {
    const complete = {
      status: "complete",
      completeCount: 1,
      partialCount: 0,
      eligibleCount: 1,
      legacyUnclassifiedCount: 0,
    } as const
    render(
      <OverviewUsageSnapshot
        t={((key: string) => key) as TFunction}
        onNavigate={vi.fn()}
        snapshot={{
          todayRequests: 0,
          todayTokens: 0,
          todayCostText: "obsolete raw quota",
          todayRequestsCoverage: complete,
          todayTokensCoverage: complete,
          todayCostCoverage: complete,
          todayCostGroups: [
            {
              amount: {
                value: "1.23456789",
                asset: { kind: ASSET_KINDS.Currency, code: "CNY" },
              },
              window: {
                start: Date.parse("2026-11-11T00:00:00Z"),
                end: Date.parse("2026-11-11T01:00:00Z"),
                timeZone: "UTC",
              },
              coverage: complete,
            },
            {
              amount: {
                value: "2",
                asset: { kind: ASSET_KINDS.Currency, code: "USD" },
              },
              window: {
                start: Date.parse("2026-11-11T00:00:00Z"),
                end: Date.parse("2026-11-11T02:00:00Z"),
                timeZone: "UTC",
              },
              coverage: {
                ...complete,
                status: "partial",
                completeCount: 0,
                partialCount: 1,
              },
            },
          ],
          sevenDayRequests: 0,
          sevenDayTokens: 0,
          hasTodayUsageData: true,
          hasSevenDayUsageData,
          hasUsageData: true,
          target: { menuItemId: MENU_ITEM_IDS.USAGE_ANALYTICS },
        }}
      />,
    )
    expect(await screen.findByText(/CNY\s*1.23456789/)).toBeVisible()
    expect(screen.getByText(/USD\s*2/)).toBeVisible()
    expect(screen.getAllByText(/UTC/)).toHaveLength(2)
    expect(
      screen.getByLabelText(/optionsOverview:todayMetricAvailability.partial/),
    ).toBeVisible()
    expect(screen.queryByText("obsolete raw quota")).not.toBeInTheDocument()
    for (const label of ["sevenDayRequests", "sevenDayTokens"]) {
      const metric = screen.getByText(
        `optionsOverview:usage.${label}`,
      ).parentElement!
      if (hasSevenDayUsageData) {
        expect(within(metric).getByText("0")).toBeVisible()
        expect(
          within(metric).queryByText(
            "optionsOverview:todayMetricAvailability.unavailable",
          ),
        ).not.toBeInTheDocument()
      } else {
        expect(within(metric).queryByText("0")).not.toBeInTheDocument()
        expect(
          within(metric).getByText(
            "optionsOverview:todayMetricAvailability.unavailable",
          ),
        ).toBeVisible()
      }
    }
  },
)

it("keeps partial provider-day costs visibly qualified in the overview", async () => {
  const account = buildSiteAccount({
    id: "partial-provider",
    site_name: "Provider A",
    last_sync_time: Date.now(),
  })
  account.account_info.usage = {
    scope: ACCOUNT_USAGE_SCOPES.SiteToday,
    cost: {
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      coverage: FINANCIAL_COVERAGE.Partial,
      amount: observeAmount(
        "3.5",
        {
          kind: EVIDENCE_KINDS.Reported,
          adapter: "fixture",
          operation: "cost",
          contractVersion: "1",
        },
        Date.now(),
      ),
    },
  }
  const snapshot = buildUsageSnapshot(calculateAccountStats([account]), {
    schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
    accounts: {},
  })
  render(
    <OverviewUsageSnapshot
      t={((key: string) => key) as TFunction}
      onNavigate={vi.fn()}
      snapshot={snapshot}
    />,
  )
  expect(await screen.findByText(/USD\s*3.5/)).toBeVisible()
  expect(
    screen.getByText("account:todayMetricAvailability.partial"),
  ).toBeVisible()
})
