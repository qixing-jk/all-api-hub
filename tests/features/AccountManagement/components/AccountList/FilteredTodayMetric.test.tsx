import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { FilteredTodayMetric } from "~/features/AccountManagement/components/AccountList/FilteredTodayMetric"
import { getDisplayConsumptionProjection } from "~/services/accounts/metrics/consumptionProjection"
import {
  ASSET_KINDS,
  FINANCIAL_COVERAGE,
} from "~/services/amounts/financialConstants"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import { buildFinancialPeriodFact } from "~~/tests/test-utils/accountTodayStats"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { render, screen } from "~~/tests/test-utils/render"

// Hoisted fixtures load dependency-free runtime values before component imports.
const { CURRENCIES, CURRENCY_DISPLAY_MODES } = await vi.hoisted(
  () => import("~/constants/money"),
)

const display = vi.hoisted(() => ({
  mode: CURRENCIES.USD as "USD" | "CNY" | "original",
}))
vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useUserPreferencesContext: () => ({
    currencyType: CURRENCIES.USD,
    currencyDisplay: display.mode,
  }),
}))
afterEach(() => {
  display.mode = CURRENCIES.USD
})

it.each([
  [CURRENCIES.USD, /USD\s2\.00/],
  [CURRENCIES.CNY, /CNY\s21\.00/],
] as const)(
  "shows one complete %s filtered total across native currencies",
  async (mode, expected) => {
    display.mode = mode
    const total = getDisplayConsumptionProjection(
      ([CURRENCIES.USD, CURRENCIES.CNY] as const).map((code) =>
        buildDisplaySiteData({
          id: code,
          exchangeRate: code === CURRENCIES.USD ? 7 : 14,
          settledConsumption: [
            buildFinancialPeriodFact({
              accountId: code,
              value: code === CURRENCIES.USD ? "1" : "14",
              asset: { kind: ASSET_KINDS.Currency, code },
            }),
          ],
        }),
      ),
    )
    const props = {
      total,
      t: ((key: string) => key) as TFunction,
      compact: true,
    }
    const { rerender } = render(
      <FilteredTodayMetric
        total={total}
        t={((key: string) => key) as TFunction}
        compact
      />,
    )
    expect(await screen.findAllByText(expected)).toHaveLength(1)
    expect(screen.queryByLabelText(/partial/)).not.toBeInTheDocument()
    expect(total.groups).toHaveLength(2)
    display.mode = CURRENCY_DISPLAY_MODES.Original
    rerender(<FilteredTodayMetric {...props} />)
    expect(screen.getByText(/USD\s1\.00/)).toBeVisible()
    expect(screen.getByText(/CNY\s14\.00/)).toBeVisible()
  },
)

it.each([0, 1])(
  "preserves partial coverage counts and pending-refresh precedence (%s pending)",
  async (pending) => {
    const user = userEvent.setup()
    const total = getDisplayConsumptionProjection([
      buildDisplaySiteData({
        id: "one",
        settledConsumption: [
          buildFinancialPeriodFact({
            accountId: "one",
            value: "12",
            coverage: FINANCIAL_COVERAGE.Partial,
          }),
        ],
      }),
    ])
    const coverage = {
      status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
      completeCount: 2,
      partialCount: 1,
      eligibleCount: 4,
      legacyUnclassifiedCount: pending,
    }
    total.groups[0]!.coverage = coverage
    total.nativeCoverage = coverage
    const t = ((
      key: string,
      counts?: {
        complete: number
        partial: number
        refresh: number
        eligible: number
      },
    ) =>
      counts
        ? `${key}: ${counts.complete}/${counts.partial}/${counts.refresh}/${counts.eligible}`
        : key) as TFunction
    render(<FilteredTodayMetric total={total} t={t} compact />)
    const qualifier = pending
      ? "account:todayMetricAvailability.includesPendingRefresh"
      : "shareSnapshots:financial.partial"
    await user.hover(await screen.findByLabelText(qualifier))
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      `${pending ? "account:todayMetricAvailability.coverageWithRefresh" : "account:todayMetricAvailability.coverage"}: 2/1/${pending}/4`,
    )
  },
)

it("keeps same-day release references visible in filtered totals without adding yesterday's values", async () => {
  const total = getDisplayConsumptionProjection([
    buildDisplaySiteData({
      id: "one",
      referenceConsumption: {
        amount: { USD: 1.25, CNY: 8.75 },
        observedAt: Date.now(),
        lastKnown: false,
      },
    }),
    buildDisplaySiteData({
      id: "two",
      referenceConsumption: {
        amount: { USD: 2, CNY: 14 },
        lastKnown: false,
        observedAt: Date.now(),
      },
    }),
    buildDisplaySiteData({
      id: "old",
      referenceConsumption: { amount: { USD: 99, CNY: 693 }, lastKnown: true },
    }),
  ])
  render(
    <FilteredTodayMetric
      total={total}
      t={((key: string) => key) as TFunction}
      compact
    />,
  )
  expect(await screen.findByText(/3\.25/)).toBeVisible()
  expect(
    screen.getByText("balanceHistory:breakdown.controls.reference"),
  ).toBeVisible()
  expect(screen.queryByText(/99/)).not.toBeInTheDocument()
  expect(total.groups).toEqual([])
  expect(total.nativeCoverage.status).toBe("unavailable")
})

it("bounds native filtered totals and reveals exact amounts without an invented currency pair", async () => {
  const user = userEvent.setup()
  const fact = buildFinancialPeriodFact({
    accountId: "one",
    value: "12.000000000000001",
    asset: {
      kind: ASSET_KINDS.Quota,
      id: "fixture:credits",
      label: "Credits",
      displayScale: 1,
      displayLabel: "Credits",
    },
  })
  const total = getDisplayConsumptionProjection([
    buildDisplaySiteData({ id: "one", settledConsumption: [fact] }),
  ])
  render(
    <FilteredTodayMetric
      total={total}
      t={((key: string) => key) as TFunction}
    />,
  )
  const amount = await screen.findByText("12 Credits")
  expect(amount).toBeVisible()
  await user.hover(amount)
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "12.000000000000001 Credits",
  )
  expect(screen.queryByText(/USD|CNY/)).not.toBeInTheDocument()
})
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(2026, 10, 19, 12))
})
afterEach(() => vi.useRealTimers())
