import { act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest"

import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { CURRENCIES, CURRENCY_DISPLAY_MODES } from "~/constants/money"
import BalanceDisplay from "~/features/AccountManagement/components/AccountList/rows/BalanceDisplay"
import enAccount from "~/locales/en/account.json"
import enBalanceHistory from "~/locales/en/balanceHistory.json"
import {
  accountAllowanceObservation,
  ALLOWANCE_IDENTITY_KINDS,
} from "~/services/accounts/allowances"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import {
  getDisplayConsumptionProjection,
  getDisplayIncomeProjection,
} from "~/services/accounts/metrics/consumptionProjection"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import { budgetConstraint } from "~/services/amounts/budgets"
import {
  ASSET_KINDS,
  BALANCE_RELATIONS,
  BALANCE_VALIDITY_KINDS,
  BUDGET_ENFORCEMENT,
  BUDGET_LIMIT_STATES,
  BUDGET_PERIODS,
  BUDGET_WINDOW_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
  FINANCIAL_SETTLEMENT_STATUSES,
  FINANCIAL_SUBJECT_KINDS,
  INCOME_CLASSIFICATIONS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { ACCOUNT_SUBSCRIPTION_STATUSES as subscriptionStatuses } from "~/types"
import type { DisplaySiteData } from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { buildDisplaySiteData as buildBaseDisplaySiteData } from "~~/tests/test-utils/factories"
import { testI18n } from "~~/tests/test-utils/i18n"
import { atIndex } from "~~/tests/test-utils/indexedAccess"
import {
  buildNetInflow,
  buildNetInflowItem,
} from "~~/tests/test-utils/netInflow"
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

/** Explicit numeric UI examples represent separately reported native currency facts. */
function buildDisplaySiteData(
  overrides: Partial<DisplaySiteData> = {},
  cashflowCurrencies: readonly ("USD" | "CNY")[] = [
    CURRENCIES.USD,
    CURRENCIES.CNY,
  ],
): DisplaySiteData {
  const site = buildBaseDisplaySiteData(overrides)
  if (
    !overrides.settledConsumption &&
    overrides.todayConsumption &&
    site.todayStatsAvailability.consumption.status !== "unavailable"
  ) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    site.settledConsumption = cashflowCurrencies.map((currency) => ({
      asset: { kind: ASSET_KINDS.Currency, code: currency },
      amount: observeAmount(
        String(overrides.todayConsumption![currency]),
        {
          adapter: "fixture",
          operation: currency,
          contractVersion: "1",
          kind: EVIDENCE_KINDS.Reported,
        },
        Date.now(),
      ),
      scope: {
        subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: site.id },
        authority: "https://fixture.example",
        walletId: site.id,
        projects: { kind: SCOPE_SELECTION_KINDS.All },
        keys: { kind: SCOPE_SELECTION_KINDS.All },
        models: { kind: SCOPE_SELECTION_KINDS.All },
        groups: { kind: SCOPE_SELECTION_KINDS.All },
      },
      window: {
        start: start.getTime(),
        end: end.getTime(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      coverage:
        site.todayStatsAvailability.consumption.status === "partial"
          ? "partial"
          : "complete",
      settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
    }))
  }
  if (
    !overrides.reportedIncome &&
    overrides.todayIncome &&
    site.todayStatsAvailability.income.status !== "unavailable"
  ) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    site.reportedIncome = cashflowCurrencies.map((currency) => ({
      asset: { kind: ASSET_KINDS.Currency, code: currency },
      amount: observeAmount(
        String(overrides.todayIncome![currency]),
        {
          adapter: "fixture",
          operation: currency,
          contractVersion: "1",
          kind: EVIDENCE_KINDS.Reported,
        },
        Date.now(),
      ),
      scope: {
        subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: site.id },
        authority: "https://fixture.example",
        walletId: site.id,
        projects: { kind: SCOPE_SELECTION_KINDS.All },
        keys: { kind: SCOPE_SELECTION_KINDS.All },
        models: { kind: SCOPE_SELECTION_KINDS.All },
        groups: { kind: SCOPE_SELECTION_KINDS.All },
      },
      window: {
        start: start.getTime(),
        end: end.getTime(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      coverage:
        site.todayStatsAvailability.income.status === "partial"
          ? "partial"
          : "complete",
      classification: INCOME_CLASSIFICATIONS.Unclassified,
    }))
  }
  return site
}

function mockDefaultNumberFormatLocale(locale: string) {
  const NativeNumberFormat = Intl.NumberFormat
  const numberFormatSpy = vi
    .spyOn(Intl, "NumberFormat")
    .mockImplementation(function (
      locales?: Intl.LocalesArgument,
      options?: Intl.NumberFormatOptions,
    ) {
      return new NativeNumberFormat(locales ?? locale, options)
    })
  onTestFinished(() => numberFormatSpy.mockRestore())
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

vi.mock("~/features/AccountManagement/actions/AccountActionsContext", () => ({
  useAccountActionsContext: () => mockUseAccountActionsContext(),
}))

vi.mock("~/features/AccountManagement/data/AccountDataContext", () => ({
  useAccountDataContext: () => mockUseAccountDataContext(),
}))

describe("BalanceDisplay", () => {
  it.each(["native", "reference"] as const)(
    "updates unchanged %s cashflow rows at local midnight",
    async (kind) => {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
      vi.setSystemTime(new Date(2026, 10, 22, 23, 59, 59))
      onTestFinished(() => {
        vi.useRealTimers()
      })
      const observedAt = Date.now()
      const site = buildDisplaySiteData(
        kind === "native"
          ? { todayIncome: { USD: 2.5, CNY: 17.5 } }
          : {
              reportedIncome: [],
              referenceIncome: {
                amount: { USD: 2.5, CNY: 17.5 },
                observedAt,
                lastKnown: false,
              },
            },
        [CURRENCIES.USD],
      )
      const mounted = await render(<BalanceDisplay site={site} />)
      const income = screen.getByRole("button", { name: /refreshIncome/ })
      expect(income).toHaveTextContent("+$2.50")
      expect(income).not.toHaveTextContent("account:financial.lastKnown")
      await act(async () => vi.advanceTimersByTime(1001))
      const refreshedIncome = screen.getByRole("button", {
        name: /refreshIncome/,
      })
      if (kind === "native")
        expect(refreshedIncome).not.toHaveTextContent("$2.50")
      else {
        expect(refreshedIncome).toHaveTextContent("+$2.50")
        expect(refreshedIncome).toHaveTextContent("account:financial.lastKnown")
        expect(site.referenceIncome?.lastKnown).toBe(false)
      }
      mounted.unmount()
    },
  )

  it("converts native yuan consumption and income to the selected dollar display", () => {
    const site = buildDisplaySiteData({
      todayConsumption: { USD: 99, CNY: 7 },
      todayIncome: { USD: 99, CNY: 7 },
      exchangeRate: 7,
    })
    site.settledConsumption = [site.settledConsumption![1]!]
    site.reportedIncome = [site.reportedIncome![1]!]
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.USD,
      currencyDisplay: CURRENCIES.USD,
      showTodayCashflow: true,
      preferences: {},
    })
    render(<BalanceDisplay site={site} />)
    expect(
      screen.getByRole("button", {
        name: /account:list.balance.refreshCashflow/,
      }),
    ).toHaveTextContent("-$1.00")
    expect(
      screen.getByRole("button", {
        name: /account:list.balance.refreshIncome/,
      }),
    ).toHaveTextContent("+$1.00")
    expect(site.settledConsumption[0]?.amount).toMatchObject({ value: "7" })
  })
  it("uses original balance and cashflow units independently of the remembered reference currency", () => {
    const site = buildDisplaySiteData({
      todayConsumption: { USD: 2, CNY: 14 },
      todayIncome: { USD: 2, CNY: 14 },
      exchangeRate: 7,
    })
    site.settledConsumption = [site.settledConsumption![0]!]
    site.reportedIncome = [site.reportedIncome![0]!]
    const scope = accountBalanceScope({
      baseUrl: site.baseUrl,
      accountId: site.id,
    })
    site.balanceSnapshot = accountBalanceSnapshot(
      scope,
      [
        balancePosition({
          id: "wallet",
          scope,
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          value: "2",
          observedAt: Date.now(),
          source: {
            adapter: "fixture",
            operation: "balance",
            contractVersion: "1",
            kind: EVIDENCE_KINDS.Reported,
          },
        }),
      ],
      Date.now(),
      FINANCIAL_COVERAGE.Complete,
    )
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.CNY,
      currencyDisplay: CURRENCY_DISPLAY_MODES.Original,
      showTodayCashflow: true,
      preferences: {},
    })
    render(<BalanceDisplay site={site} />)
    expect(screen.getByText("$2.00", { exact: true })).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: /account:list.balance.refreshCashflow/,
      }),
    ).toHaveTextContent("-$2.00")
    expect(
      screen.getByRole("button", {
        name: /account:list.balance.refreshIncome/,
      }),
    ).toHaveTextContent("+$2.00")
  })
  it("keeps a provider-day cost visibly partial in the account row", () => {
    const site = buildDisplaySiteData({
      usage: {
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
      },
    })
    render(<BalanceDisplay site={site} />)
    const reading = within(
      screen.getByRole("group", {
        name: testI18n.t("optionsOverview:usage.siteDay"),
      }),
    )
    expect(reading.getByText(/USD\s*3.50/)).toBeVisible()
    expect(
      reading.getByText(testI18n.t("keyManagement:financial.partial")),
    ).toBeVisible()
  })

  it("keeps a saved reference visible beside native observations with no readable amount", () => {
    const site = buildDisplaySiteData({
      todayConsumption: { USD: 1, CNY: 7 },
      todayIncome: { USD: 1, CNY: 7 },
      referenceConsumption: {
        amount: { USD: 3.25, CNY: 22.75 },
        lastKnown: true,
        observedAt: Date.now() - 60_000,
      },
      referenceIncome: {
        amount: { USD: 2.5, CNY: 17.5 },
        lastKnown: true,
        observedAt: Date.now() - 60_000,
      },
    })
    for (const fact of [...site.settledConsumption!, ...site.reportedIncome!]) {
      fact.amount = {
        status: "unavailable",
        reason: "cost missing",
        source: fact.amount.source,
      }
    }
    render(<BalanceDisplay site={site} />)
    expect(
      screen.getByRole("button", {
        name: /account:list.balance.refreshCashflow/,
      }),
    ).toHaveTextContent("-$3.25")
    expect(
      screen.getByRole("button", {
        name: /account:list.balance.refreshIncome/,
      }),
    ).toHaveTextContent("+$2.50")
    expect(
      screen.getByRole("button", {
        name: /account:list.balance.refreshCashflow/,
      }),
    ).toHaveTextContent("account:financial.lastKnown")
    expect(
      within(
        screen.getByRole("button", {
          name: /account:list.balance.refreshCashflow/,
        }),
      ).getByRole("img", {
        name: /balanceHistory:breakdown.controls.reference/,
      }),
    ).toBeVisible()
    expect(getDisplayConsumptionProjection([site]).groups).toEqual([])
  })

  it.each([
    {
      asset: {
        kind: ASSET_KINDS.Quota,
        id: "credits",
        label: "Credits",
        displayLabel: "Credits",
        displayScale: 1,
      },
      value: "25",
      expected: "25 Credits",
    },
    {
      asset: {
        kind: ASSET_KINDS.Quota,
        id: "tokens",
        label: "Token",
        displayLabel: "M Token",
        displayScale: 1_000_000,
      },
      value: "1200000",
      expected: "1.2 M Token",
    },
    {
      asset: { kind: ASSET_KINDS.Crypto, id: "XNO" },
      value: "0.0001",
      expected: "<0.01 XNO",
    },
  ] as const)(
    "shows native $expected cashflow in the account row without a currency conversion",
    ({ asset, value, expected }) => {
      const site = buildDisplaySiteData({
        todayConsumption: { USD: 1, CNY: 7 },
        todayIncome: { USD: 1, CNY: 7 },
      })
      site.settledConsumption = [
        {
          ...site.settledConsumption![0]!,
          asset,
          amount: observeAmount(
            value,
            site.settledConsumption![0]!.amount.source,
            Date.now(),
          ),
        },
      ]
      site.reportedIncome = [
        {
          ...site.reportedIncome![0]!,
          asset,
          amount: observeAmount(
            value,
            site.reportedIncome![0]!.amount.source,
            Date.now(),
          ),
        },
      ]
      mockUseUserPreferencesContext.mockReturnValue({
        currencyType: CURRENCIES.CNY,
        showTodayCashflow: true,
        preferences: {},
      })
      render(<BalanceDisplay site={site} />)
      expect(
        screen.getByRole("button", {
          name: /account:list.balance.refreshCashflow/,
        }),
      ).toHaveTextContent(`-${expected}`)
      expect(
        screen.getByRole("button", {
          name: /account:list.balance.refreshIncome/,
        }),
      ).toHaveTextContent(`+${expected}`)
      expect(getDisplayConsumptionProjection([site]).amount).toEqual({
        USD: 0,
        CNY: 0,
      })
      expect(getDisplayIncomeProjection([site]).amount).toEqual({
        USD: 0,
        CNY: 0,
      })
      expect(site.reportedIncome[0]?.amount).toMatchObject({ value })
    },
  )

  it.each(
    (["native", "reference"] as const).flatMap((source) =>
      [
        { value: 2.5, consumption: "-$2.50", income: "+$2.50" },
        { value: -2.5, consumption: "+$2.50", income: "-$2.50" },
        { value: 0, consumption: "-$0.00", income: "+$0.00" },
      ].map((amount) => ({ source, ...amount })),
    ),
  )(
    "shows $source cashflow $value with a single direction and retains signed observations",
    ({
      source,
      value,
      consumption: expectedConsumption,
      income: expectedIncome,
    }) => {
      const original = structuredClone(
        testI18n.getResourceBundle("en", "account"),
      )
      onTestFinished(() => {
        testI18n.removeResourceBundle("en", "account")
        if (original) testI18n.addResourceBundle("en", "account", original)
      })
      testI18n.addResourceBundle("en", "account", enAccount, true, true)
      const amount = { USD: value, CNY: value * 7 }
      const site = buildDisplaySiteData(
        {
          todayConsumption: amount,
          todayIncome: amount,
          ...(source === "reference"
            ? {
                settledConsumption: [],
                reportedIncome: [],
                referenceConsumption: {
                  amount,
                  observedAt: Date.now(),
                  lastKnown: false,
                },
                referenceIncome: {
                  amount,
                  observedAt: Date.now(),
                  lastKnown: false,
                },
              }
            : {}),
        },
        [CURRENCIES.USD],
      )
      render(<BalanceDisplay site={site} />)
      const consumption = screen.getByRole("button", {
        name: new RegExp(enAccount.list.balance.refreshCashflow),
      })
      const income = screen.getByRole("button", {
        name: new RegExp(enAccount.list.balance.refreshIncome),
      })
      expect(consumption).toHaveTextContent(expectedConsumption)
      expect(income).toHaveTextContent(expectedIncome)
      expect(consumption).toHaveClass(
        value > 0
          ? "text-cashflow-expense"
          : value < 0
            ? "text-cashflow-income"
            : "text-faint-foreground",
      )
      expect(income).toHaveClass(
        value > 0
          ? "text-cashflow-income"
          : value < 0
            ? "text-cashflow-expense"
            : "text-faint-foreground",
      )
      if (source === "native") {
        expect(site.settledConsumption?.[0]?.amount).toMatchObject({
          value: String(value),
        })
        expect(site.reportedIncome?.[0]?.amount).toMatchObject({
          value: String(value),
        })
        expect(getDisplayConsumptionProjection([site]).amount.USD).toBe(value)
        expect(getDisplayIncomeProjection([site]).amount.USD).toBe(value)
      } else {
        expect(site.referenceConsumption?.amount.USD).toBe(value)
        expect(site.referenceIncome?.amount.USD).toBe(value)
      }
    },
  )

  it.each(
    (["native", "reference"] as const).flatMap((source) =>
      [
        { value: 0.001, consumptionPrefix: "-", incomePrefix: "+" },
        { value: -0.001, consumptionPrefix: "+", incomePrefix: "-" },
      ].flatMap((amount) =>
        [
          {
            nativeCurrency: CURRENCIES.USD,
            currencyType: CURRENCIES.USD,
            expected: "<$0.01",
          },
          {
            nativeCurrency: CURRENCIES.USD,
            currencyType: CURRENCIES.CNY,
            expected: "<¥0.01",
          },
          ...(source === "native"
            ? [
                {
                  nativeCurrency: CURRENCIES.CNY,
                  currencyType: CURRENCIES.USD,
                  expected: "<$0.01",
                },
              ]
            : []),
        ].map((currency) => ({ source, ...amount, ...currency })),
      ),
    ),
  )(
    "bounds $source sub-cent cashflow $value in $currencyType from $nativeCurrency without inflating its value",
    ({
      source,
      value,
      consumptionPrefix,
      incomePrefix,
      nativeCurrency,
      currencyType,
      expected,
    }) => {
      const original = structuredClone(
        testI18n.getResourceBundle("en", "account"),
      )
      onTestFinished(() => {
        testI18n.removeResourceBundle("en", "account")
        if (original) testI18n.addResourceBundle("en", "account", original)
      })
      testI18n.addResourceBundle("en", "account", enAccount, true, true)
      mockUseUserPreferencesContext.mockReturnValue({
        currencyType,
        showTodayCashflow: true,
        preferences: {},
      })
      const amount = { USD: value, CNY: value * 7 }
      const site = buildDisplaySiteData({
        exchangeRate: 7,
        todayConsumption: amount,
        todayIncome: amount,
        ...(source === "reference"
          ? {
              settledConsumption: [],
              reportedIncome: [],
              referenceConsumption: {
                amount,
                observedAt: Date.now(),
                lastKnown: false,
              },
              referenceIncome: {
                amount,
                observedAt: Date.now(),
                lastKnown: false,
              },
            }
          : {}),
      })
      if (source === "native") {
        const matchesCurrency = ({
          asset,
        }: {
          asset: { kind: string; code?: string }
        }) =>
          asset.kind === ASSET_KINDS.Currency && asset.code === nativeCurrency
        site.settledConsumption =
          site.settledConsumption?.filter(matchesCurrency)
        site.reportedIncome = site.reportedIncome?.filter(matchesCurrency)
      }
      render(<BalanceDisplay site={site} />)
      expect(
        screen.getByRole("button", {
          name: new RegExp(enAccount.list.balance.refreshCashflow),
        }),
      ).toHaveTextContent(`${consumptionPrefix}${expected}`)
      expect(
        screen.getByRole("button", {
          name: new RegExp(enAccount.list.balance.refreshIncome),
        }),
      ).toHaveTextContent(`${incomePrefix}${expected}`)
      if (source === "native") {
        const nativeValue =
          nativeCurrency === CURRENCIES.USD ? value : amount.CNY
        expect(site.settledConsumption?.[0]?.amount).toMatchObject({
          value: String(nativeValue),
        })
        expect(site.reportedIncome?.[0]?.amount).toMatchObject({
          value: String(nativeValue),
        })
        const consumption = getDisplayConsumptionProjection([site])
        const income = getDisplayIncomeProjection([site])
        const originalCurrency =
          nativeCurrency === CURRENCIES.USD ? CURRENCIES.USD : CURRENCIES.CNY
        expect(consumption.amount[originalCurrency]).toBe(nativeValue)
        expect(income.amount[originalCurrency]).toBe(nativeValue)
        expect(consumption.coverageByCurrency[originalCurrency].status).toBe(
          ACCOUNT_TODAY_METRIC_STATUSES.Complete,
        )
        expect(income.coverageByCurrency[originalCurrency].status).toBe(
          ACCOUNT_TODAY_METRIC_STATUSES.Complete,
        )
      } else {
        expect(site.referenceConsumption?.amount).toEqual(amount)
        expect(site.referenceIncome?.amount).toEqual(amount)
      }
    },
  )

  it.each(
    (["consumption", "income"] as const).flatMap((metric) =>
      [
        {
          metric,
          nativeCurrency: CURRENCIES.USD,
          currencyType: CURRENCIES.USD,
          expected: "$6.00",
        },
        {
          metric,
          nativeCurrency: CURRENCIES.USD,
          currencyType: CURRENCIES.CNY,
          expected: "¥42.00",
        },
        {
          metric,
          nativeCurrency: CURRENCIES.CNY,
          currencyType: CURRENCIES.USD,
          expected: "$0.86",
        },
      ].flatMap((currency) =>
        [
          {
            value: "6.000000000000000001",
            consumptionPrefix: "-",
            incomePrefix: "+",
          },
          {
            value: "-6.000000000000000001",
            consumptionPrefix: "+",
            incomePrefix: "-",
          },
        ].map((amount) => ({ ...currency, ...amount })),
      ),
    ),
  )(
    "shows precise native $metric $value in $currencyType while retaining $nativeCurrency arithmetic and details",
    async ({
      metric,
      nativeCurrency,
      currencyType,
      expected,
      value,
      consumptionPrefix,
      incomePrefix,
    }) => {
      const user = userEvent.setup()
      const original = structuredClone(
        testI18n.getResourceBundle("en", "account"),
      )
      onTestFinished(() => {
        testI18n.removeResourceBundle("en", "account")
        if (original) testI18n.addResourceBundle("en", "account", original)
      })
      testI18n.addResourceBundle("en", "account", enAccount, true, true)
      mockUseUserPreferencesContext.mockReturnValue({
        currencyType,
        showTodayCashflow: true,
        preferences: {},
      })
      const site = buildDisplaySiteData({
        exchangeRate: 7,
        todayConsumption: { USD: 6, CNY: 6 },
        todayIncome: { USD: 6, CNY: 6 },
      })
      const observations =
        metric === "consumption"
          ? site.settledConsumption!
          : site.reportedIncome!
      const fact = observations.find(
        ({ asset }) =>
          asset.kind === ASSET_KINDS.Currency && asset.code === nativeCurrency,
      )!
      fact.amount = observeAmount(value, fact.amount.source, Date.now())
      if (metric === "consumption")
        site.settledConsumption = [
          fact as NonNullable<DisplaySiteData["settledConsumption"]>[number],
        ]
      else
        site.reportedIncome = [
          fact as NonNullable<DisplaySiteData["reportedIncome"]>[number],
        ]
      const projection =
        metric === "consumption"
          ? getDisplayConsumptionProjection([site])
          : getDisplayIncomeProjection([site])
      expect(projection.groups[0]?.amount.value).toBe(value)
      const originalCurrency =
        nativeCurrency === CURRENCIES.USD ? CURRENCIES.USD : CURRENCIES.CNY
      expect(projection.coverageByCurrency[originalCurrency].status).toBe(
        ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      )

      render(<BalanceDisplay site={site} />)

      const label =
        metric === "consumption"
          ? enAccount.list.balance.refreshCashflow
          : enAccount.list.balance.refreshIncome
      expect(
        screen.getByRole("button", { name: new RegExp(label) }),
      ).toHaveTextContent(
        `${metric === "consumption" ? consumptionPrefix : incomePrefix}${expected}`,
      )
      await user.click(
        screen.getByRole("button", { name: enAccount.financial.details }),
      )
      const group = screen.getByRole("group", {
        name: new RegExp(
          metric === "consumption"
            ? enAccount.financial.usagePeriod
            : enAccount.financial.reportedIncome,
        ),
      })
      await user.click(
        within(group).getByRole("button", {
          name: testI18n.t("keyManagement:actions.details"),
        }),
      )
      expect(
        within(group).getByText(
          new RegExp(
            `^${value.startsWith("-") ? "-" : ""}${nativeCurrency}\\s*6\\.000000000000000001$`,
          ),
        ),
      ).toBeVisible()
      expect(fact.amount).toMatchObject({ value })
      expect(projection.amount[originalCurrency]).toBe(0)
    },
  )

  it("converts a CNY-only credit to the selected USD view", () => {
    const site = buildDisplaySiteData({
      todayIncome: { USD: 1, CNY: 7 },
      exchangeRate: 7,
    })
    site.reportedIncome = site.reportedIncome?.slice(1)

    render(<BalanceDisplay site={site} />)

    expect(
      screen.getByRole("button", { name: /refreshIncome/ }),
    ).toHaveTextContent("+$1.00")
  })

  it("shows converted income and spending when only USD is reported", () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.CNY,
      showTodayCashflow: true,
      preferences: {},
    })
    const site = buildDisplaySiteData({
      exchangeRate: 7,
      todayConsumption: { USD: 3, CNY: 21 },
      todayIncome: { USD: 2, CNY: 14 },
    })
    site.settledConsumption = site.settledConsumption?.slice(0, 1)
    site.reportedIncome = site.reportedIncome?.slice(0, 1)

    render(<BalanceDisplay site={site} />)

    expect(
      screen.getByRole("button", { name: /refreshCashflow/ }),
    ).toHaveTextContent("-¥21.00")
    expect(
      screen.getByRole("button", { name: /refreshIncome/ }),
    ).toHaveTextContent("+¥14.00")
  })

  it("retains partial, pending and stale observation qualifiers in details beside independent reported income", async () => {
    const scope = accountBalanceScope({
      baseUrl: "https://facts.example",
      accountId: "account-1",
    })
    const source = {
      adapter: "fixture",
      operation: "usage",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    }
    const window = { start: 1700000000000, end: 1700000001000, timeZone: "UTC" }
    const amount = {
      status: OBSERVATION_STATUSES.Stale,
      value: "5",
      observedAt: 1700000001000,
      reason: "failed-refresh",
      source,
    }
    const site = buildDisplaySiteData({
      settledConsumption: [
        {
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          amount,
          scope,
          window,
          coverage: FINANCIAL_COVERAGE.Partial,
          settlement: FINANCIAL_SETTLEMENT_STATUSES.Pending,
        },
      ],
      reportedIncome: [
        {
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
          amount: observeAmount("7", source, 1700000001000),
          scope,
          window,
          coverage: FINANCIAL_COVERAGE.Complete,
          classification: INCOME_CLASSIFICATIONS.Topup,
        },
      ],
    })
    render(<BalanceDisplay site={site} />)
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: testI18n.t("account:financial.details"),
      }),
    )
    expect(
      screen.getByText(testI18n.t("account:financial.pendingCharge"), {
        exact: false,
      }),
    ).toBeVisible()
    expect(
      within(screen.getByRole("dialog")).getByText(
        testI18n.t("keyManagement:financial.partial"),
        {
          exact: false,
        },
      ),
    ).toBeVisible()
    expect(screen.getByText(/CNY\s*7/)).toBeVisible()
    const spending = within(screen.getByRole("dialog")).getByRole("group", {
      name: /account:financial.usagePeriod/,
    })
    expect(
      within(spending).getByTitle(new Date(1700000001000).toLocaleString("en")),
    ).toBeVisible()
    expect(spending).toHaveTextContent("account:financial.lastKnown")
  })
  it("shows readable consumption rows and reveals exact observations with a details button", async () => {
    const user = userEvent.setup()
    const source = {
      adapter: "grsai",
      operation: "dashboard",
      contractVersion: "native/v1",
      kind: EVIDENCE_KINDS.Reported,
    }
    const asset = {
      kind: ASSET_KINDS.Quota,
      id: "grsai:credits",
      label: "credits",
      displayLabel: "credits",
      displayScale: 1,
    }
    const lifetime = {
      scope: "lifetime" as const,
      cost: {
        asset,
        amount: observeAmount("400000.000000000000017", source, 1000),
      },
    }
    const period = {
      scope: "current_period" as const,
      cost: {
        asset,
        amount: observeAmount("1332", { ...source, operation: "today" }, 1000),
      },
    }
    render(
      <BalanceDisplay
        site={buildDisplaySiteData({
          usage: lifetime,
          usageObservations: [lifetime, period],
        })}
      />,
    )
    expect(
      screen.queryByText(/400,000\.000000000000017.*credits/),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: testI18n.t("account:financial.details"),
      }),
    )
    const lifetimeRow = screen.getByRole("group", {
      name: `${testI18n.t("account:financial.usageLifetime")} · 400,000 credits`,
    })
    expect(
      screen.queryByText(/400,000\.000000000000017.*credits/),
    ).not.toBeInTheDocument()
    const detailsButton = within(lifetimeRow).getByRole("button", {
      name: testI18n.t("keyManagement:actions.details"),
    })
    expect(detailsButton).toHaveAttribute("aria-expanded", "false")
    await user.click(detailsButton)
    expect(screen.getByText(/400,000\.000000000000017.*credits/)).toBeVisible()
    expect(detailsButton).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText(/1,332.*credits/)).toBeVisible()
    expect(
      screen.getByText(testI18n.t("account:financial.usageLifetime")),
    ).toBeVisible()
    expect(
      screen.getByText(testI18n.t("account:financial.timingUnknown")),
    ).toBeVisible()
    expect(
      screen.getAllByText(/400,000\.000000000000017.*credits/),
    ).toHaveLength(1)
    expect(screen.getByRole("dialog")).not.toHaveTextContent(
      "grsai/dashboard@native/v1",
    )
    expect(
      screen.queryAllByText(testI18n.t("account:financial.scopeUnknown")),
    ).toHaveLength(0)
  })
  it("updates an open plan row when its reported expiry passes", () => {
    vi.useFakeTimers()
    onTestFinished(() => {
      vi.useRealTimers()
    })
    vi.setSystemTime(1000)
    const scope = accountBalanceScope({
      baseUrl: "https://plans.example",
      accountId: "test",
    })
    const source = {
      adapter: "fixture",
      operation: "plans",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    }
    const allowances = accountAllowanceObservation(
      scope,
      [
        {
          source,
          collectionKey: "plans",
          enumeration: FINANCIAL_ENUMERATION.Complete,
          entries: [
            {
              id: "daily",
              identityKind: ALLOWANCE_IDENTITY_KINDS.Upstream,
              collectionKey: "plans",
              label: "Daily plan",
              validity: { kind: BALANCE_VALIDITY_KINDS.Expires, at: 2000 },
              constraint: budgetConstraint({
                scope,
                source,
                observedAt: 1000,
                asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
                limitState: BUDGET_LIMIT_STATES.Finite,
                remaining: "20",
              }),
            },
          ],
        },
      ],
      1000,
    ).allowances
    render(<BalanceDisplay site={buildDisplaySiteData({ allowances })} />)
    expect(
      screen.getByRole("group", { name: "Daily plan · $20.00" }),
    ).not.toHaveTextContent("balanceHistory:native.expired")
    act(() => vi.advanceTimersByTime(1001))
    expect(
      screen.getByRole("group", {
        name: "Daily plan · $20.00 · balanceHistory:native.expired",
      }),
    ).toHaveTextContent("balanceHistory:native.expired")
  })

  it("shows each native plan window and unknown limits without fabricating a cash balance", async () => {
    const user = userEvent.setup()
    const scope = accountBalanceScope({
      baseUrl: "https://plans.example",
      accountId: "test",
    })
    const source = {
      adapter: "fixture",
      operation: "plans",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    }
    const allowances = accountAllowanceObservation(
      scope,
      [
        {
          source,
          collectionKey: "plans",
          enumeration: FINANCIAL_ENUMERATION.Complete,
          entries: ["day", "week"].map((period, index) => ({
            id: period,
            identityKind: "upstream" as const,
            collectionKey: "plans",
            label: `Plan ${period}`,
            validity: { kind: BALANCE_VALIDITY_KINDS.Unknown },
            constraint: budgetConstraint({
              scope,
              source,
              observedAt: 1000,
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
              limitState: BUDGET_LIMIT_STATES.Finite,
              remaining: index ? "90" : "20",
              enforcement: index
                ? BUDGET_ENFORCEMENT.Advisory
                : BUDGET_ENFORCEMENT.Hard,
              window: {
                kind: BUDGET_WINDOW_KINDS.Unknown,
                period: period as (typeof BUDGET_PERIODS)["Day" | "Week"],
              },
            }),
          })),
        },
      ],
      1000,
    ).allowances
    render(
      <BalanceDisplay
        site={buildDisplaySiteData({
          balanceSnapshot: undefined,
          allowances,
          balance: { USD: 999, CNY: 999 },
        })}
      />,
    )
    expect(screen.getByRole("group", { name: /Plan day/ })).toHaveTextContent(
      "20",
    )
    expect(screen.getByRole("group", { name: /Plan week/ })).toHaveTextContent(
      "90",
    )
    expect(screen.queryByText("$999.00")).not.toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    expect(screen.queryByRole("meter")).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: testI18n.t("account:financial.details"),
      }),
    )
    expect(screen.getByRole("dialog")).not.toHaveTextContent(
      testI18n.t("keyManagement:financial.unknownWindow"),
    )
    expect(screen.getByRole("dialog")).toHaveTextContent(
      testI18n.t("account:financial.remainingOnly"),
    )
    expect(screen.getByRole("dialog")).toHaveTextContent(
      testI18n.t("keyManagement:financial.hardLimit"),
    )
    expect(screen.getByRole("dialog")).toHaveTextContent(
      testI18n.t("keyManagement:financial.alertOnly"),
    )
  })

  it("shows the canonical native currency and unavailable components without reconstructing USD", async () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.USD,
      currencyDisplay: CURRENCY_DISPLAY_MODES.Original,
      showTodayCashflow: true,
      preferences: {},
    })
    const user = userEvent.setup()
    const scope = accountBalanceScope({
      baseUrl: "https://platform.kimi.com",
      accountId: "test",
      auth: { authType: "access_token" },
    } as never)
    const source = {
      adapter: "kimi",
      operation: "console/account",
      contractVersion: "2",
      kind: EVIDENCE_KINDS.Reported,
    } as const
    const position = (id: string, value: unknown) =>
      balancePosition({
        id,
        value,
        scope,
        source,
        observedAt: 100,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
      })
    const snapshot = accountBalanceSnapshot(
      scope,
      [
        position("available", "8"),
        {
          ...position("cash", undefined),
          parentId: "available",
          relation: BALANCE_RELATIONS.Component,
        },
      ],
      100,
      FINANCIAL_COVERAGE.Complete,
    )
    render(
      <BalanceDisplay
        site={buildDisplaySiteData({
          balanceSnapshot: snapshot,
          balance: { USD: 999, CNY: 999 },
        })}
      />,
    )
    expect(screen.getByRole("button", { name: /¥8\.00/ })).toHaveTextContent(
      "¥8.00",
    )
    expect(screen.queryByText("$999.00")).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "account:financial.details" }),
    )
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "account:financial.unavailable",
    )
    expect(screen.getByRole("dialog")).not.toHaveTextContent("console/account")
  })
  it("refreshes multiple native assets without converting XNO", async () => {
    const user = userEvent.setup()
    const refreshAccount = vi.fn().mockResolvedValue(undefined)
    mockUseAccountActionsContext.mockReturnValue({
      handleRefreshAccount: refreshAccount,
      refreshingAccountId: null,
    })
    const scope = accountBalanceScope({
      baseUrl: "https://nanogpt.example",
      accountId: "account-1",
    })
    const source = {
      adapter: "nanogpt",
      operation: "balance",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    }
    const balance = accountBalanceSnapshot(
      scope,
      [
        balancePosition({
          id: "usd",
          scope,
          source,
          observedAt: 100,
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          value: "0",
        }),
        balancePosition({
          id: "xno",
          scope,
          source,
          observedAt: 100,
          asset: { kind: ASSET_KINDS.Crypto, id: "XNO" },
          value: "26.71801147",
        }),
      ],
      100,
      FINANCIAL_COVERAGE.Complete,
    )
    const site = buildDisplaySiteData({ balanceSnapshot: balance })
    render(<BalanceDisplay site={site} />)
    expect(screen.getByText("26.72 XNO")).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: testI18n.t("account:financial.details"),
      }),
    )
    expect(screen.getByText("26.71801147 XNO")).toBeVisible()
    await user.keyboard("{Escape}")
    expect(
      screen.getByRole("button", {
        description: "account:list.balance.refreshBalance",
      }),
    ).toHaveTextContent("$0.00")
    await user.click(
      screen.getByRole("button", {
        description: "account:list.balance.refreshBalance",
      }),
    )
    expect(refreshAccount).toHaveBeenCalledExactlyOnceWith(site, true)
  })

  it("formats display currency while retaining native amount precision", () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.CNY,
      showTodayCashflow: false,
    })
    const scope = accountBalanceScope({
      baseUrl: "https://native.example",
      accountId: "account-1",
    })
    const balance = accountBalanceSnapshot(
      scope,
      [
        balancePosition({
          id: "usd",
          scope,
          source: {
            adapter: "fixture",
            operation: "balance",
            contractVersion: "1",
            kind: EVIDENCE_KINDS.Reported,
          },
          observedAt: 100,
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          value: "6.000000000000000001",
        }),
      ],
      100,
      FINANCIAL_COVERAGE.Complete,
    )
    render(
      <BalanceDisplay
        site={buildDisplaySiteData({
          balanceSnapshot: balance,
          exchangeRate: 7,
        })}
      />,
    )
    expect(
      screen.getByRole("button", {
        description: "account:list.balance.refreshBalance",
      }),
    ).toHaveTextContent("¥42.00")
    expect(balance.positions[0]?.amount).toMatchObject({
      value: "6.000000000000000001",
    })
    expect(
      screen.getByRole("group", {
        name: "account:financial.available · ¥42.00 · account:financial.observed",
      }),
    ).toBeVisible()
  })

  it("previews canonical details on hover, pins on click, and retains scope and expiry", async () => {
    const user = userEvent.setup()
    const originals = ["account", "balanceHistory"].map(
      (namespace) =>
        [
          namespace,
          structuredClone(testI18n.getResourceBundle("en", namespace)),
        ] as const,
    )
    onTestFinished(() => {
      for (const [namespace, resource] of originals) {
        testI18n.removeResourceBundle("en", namespace)
        if (resource) testI18n.addResourceBundle("en", namespace, resource)
      }
    })
    testI18n.addResourceBundle(
      "en",
      "account",
      { financial: { expires: enAccount.financial.expires } },
      true,
      true,
    )
    testI18n.addResourceBundle(
      "en",
      "balanceHistory",
      { native: { restrictions: enBalanceHistory.native.restrictions } },
      true,
      true,
    )
    const scope = accountBalanceScope({
      baseUrl: "https://plans.example",
      accountId: "account-1",
    })
    const source = {
      adapter: "fixture",
      operation: "plans",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    }
    const allowances = accountAllowanceObservation(
      scope,
      [
        {
          source,
          collectionKey: "plans",
          enumeration: FINANCIAL_ENUMERATION.Complete,
          entries: [
            {
              id: "month",
              identityKind: ALLOWANCE_IDENTITY_KINDS.Upstream,
              collectionKey: "plans",
              label: "Monthly",
              validity: {
                kind: BALANCE_VALIDITY_KINDS.Expires,
                at: Date.UTC(2099, 0, 10, 12),
              },
              constraint: budgetConstraint({
                source,
                scope: {
                  ...scope,
                  groups: {
                    kind: SCOPE_SELECTION_KINDS.Restricted,
                    ids: ["premium-only"],
                  },
                  models: {
                    kind: SCOPE_SELECTION_KINDS.Restricted,
                    ids: ["gpt-4o"],
                  },
                },
                observedAt: 100,
                asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
                limitState: BUDGET_LIMIT_STATES.Finite,
                remaining: "3",
                window: {
                  kind: BUDGET_WINDOW_KINDS.Rolling,
                  period: BUDGET_PERIODS.Day,
                  resetsAt: Date.UTC(2098, 11, 1),
                },
              }),
            },
          ],
        },
      ],
      100,
    ).allowances
    render(<BalanceDisplay site={buildDisplaySiteData({ allowances })} />)
    const trigger = screen.getByRole("button", {
      name: "account:financial.details",
    })
    await user.hover(trigger)
    const details = await screen.findByRole("dialog")
    expect(details).toHaveTextContent("Monthly")
    expect(details).toHaveTextContent("premium-only")
    expect(details).toHaveTextContent("gpt-4o")
    expect(details).toHaveTextContent("2098")
    expect(details).toHaveTextContent("2099")
    await user.hover(details)
    expect(details).toBeVisible()
    await user.unhover(details)
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    )
    await user.click(trigger)
    await user.unhover(trigger)
    expect(screen.getByRole("dialog")).toBeVisible()
    await user.click(trigger)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("keeps unknown wallet amounts unavailable and leaves refresh reachable", async () => {
    const user = userEvent.setup()
    const refreshAccount = vi.fn().mockResolvedValue(undefined)
    mockUseAccountActionsContext.mockReturnValue({
      handleRefreshAccount: refreshAccount,
      refreshingAccountId: null,
    })
    const site = buildDisplaySiteData({
      balanceSnapshot: undefined,
      balance: { USD: 0, CNY: 0 },
    })
    render(<BalanceDisplay site={site} />)
    const refresh = screen.getByRole("button", {
      description: "account:list.balance.refreshBalance",
    })
    expect(refresh).toHaveTextContent("account:financial.unavailable")
    expect(refresh).not.toHaveTextContent("$0.00")
    await user.click(refresh)
    expect(refreshAccount).toHaveBeenCalledExactlyOnceWith(site, true)
  })

  it.each(Object.values(subscriptionStatuses))(
    "labels legacy subscription status %s without unqualified remaining amounts",
    (status) => {
      render(
        <BalanceDisplay
          site={buildDisplaySiteData({
            subscription: { status, remainingTokens: 123 },
          })}
        />,
      )
      expect(
        screen.getByTitle("account:stats.subscriptionStatus"),
      ).toHaveTextContent(`account:stats.subscriptionState.${status}`)
      const remaining = screen.queryByTitle(
        /account:stats.subscriptionRemainingTokens/,
      )
      if (
        status === subscriptionStatuses.Active ||
        status === subscriptionStatuses.Grace
      ) {
        expect(remaining).toHaveTextContent("123")
        expect(
          screen.getAllByText("account:financial.lastKnown").length,
        ).toBeGreaterThan(0)
      } else expect(remaining).not.toBeInTheDocument()
    },
  )

  it("keeps a separate provider-day counter reading beside the cost reading", () => {
    render(
      <BalanceDisplay
        site={buildDisplaySiteData({
          usage: {
            scope: ACCOUNT_USAGE_SCOPES.SiteToday,
            cost: {
              asset: { kind: "currency", code: "USD" },
              amount: observeAmount(
                "2",
                {
                  adapter: "fixture",
                  operation: "usage",
                  contractVersion: "1",
                  kind: "reported",
                },
                Date.now(),
              ),
            },
          },
          usageObservations: [
            { scope: ACCOUNT_USAGE_SCOPES.SiteToday, totalRequests: 12 },
          ],
        })}
      />,
    )
    const readings = screen.getAllByRole("group", {
      name: "optionsOverview:usage.siteDay",
    })
    expect(readings).toHaveLength(2)
    expect(within(readings[1]!).getByText("12", { exact: true })).toBeVisible()
  })

  it("removes legacy subscription units at expiry without a site update", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    vi.setSystemTime(new Date(2026, 10, 22, 12))
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const site = buildDisplaySiteData({
      allowances: undefined,
      subscription: {
        status: subscriptionStatuses.Active,
        remainingTokens: 123,
        remainingCount: 7,
        expireTime: new Date(Date.now() + 1000).toISOString(),
      },
    })
    await render(<BalanceDisplay site={site} />)
    expect(
      screen.getByTitle(/account:stats.subscriptionRemainingTokens/),
    ).toBeVisible()
    expect(
      screen.getByTitle(/account:stats.subscriptionRemainingCount/),
    ).toBeVisible()
    await act(async () => vi.advanceTimersByTime(1001))
    expect(
      screen.queryByTitle(/account:stats.subscriptionRemainingTokens/),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTitle(/account:stats.subscriptionRemainingCount/),
    ).not.toBeInTheDocument()
  })

  it("shows a saved active subscription's last-known remaining units", () => {
    render(
      <BalanceDisplay
        site={buildDisplaySiteData({
          subscription: {
            isActive: true,
            remainingTokens: 123,
            remainingCount: 45,
          },
        })}
      />,
    )
    expect(
      screen.getByTitle(/account:stats.subscriptionRemainingTokens/),
    ).toHaveTextContent("123")
    expect(
      screen.getByTitle(/account:stats.subscriptionRemainingCount/),
    ).toHaveTextContent("45")
    expect(
      screen.getAllByText("account:financial.lastKnown").length,
    ).toBeGreaterThan(0)
  })

  it("shows known site-day cost and activity in the account row", () => {
    const observedAt = Date.now()
    render(
      <BalanceDisplay
        site={buildDisplaySiteData({
          usage: { scope: ACCOUNT_USAGE_SCOPES.Lifetime, totalRequests: 123 },
          usageObservations: [
            {
              scope: ACCOUNT_USAGE_SCOPES.SiteToday,
              totalRequests: 4,
              totalTokens: 10,
              cost: {
                asset: { kind: ASSET_KINDS.Currency, code: "USD" },
                amount: observeAmount(
                  "3",
                  {
                    adapter: "rightcode",
                    operation: "usage",
                    contractVersion: "1",
                    kind: EVIDENCE_KINDS.Reported,
                  },
                  observedAt,
                ),
              },
            },
          ],
        })}
      />,
    )
    const usage = screen.getByLabelText("optionsOverview:usage.siteDay")
    expect(usage).toHaveTextContent("USD 3")
    expect(screen.getByText("123", { exact: true })).toBeVisible()
    expect(usage).toHaveTextContent("4")
    expect(usage).toHaveTextContent("10")
  })

  it.each([true, false])(
    "labels yesterday's provider-day reading independently of cost visibility (%s)",
    (showTodayCashflow) => {
      const now = new Date(2026, 10, 1, 23, 30)
      vi.setSystemTime(now)
      onTestFinished(() => {
        vi.useRealTimers()
      })
      const previous = new Date(now)
      const observedAt = previous.setDate(now.getDate() - 1)
      mockUseUserPreferencesContext.mockReturnValue({
        currencyType: CURRENCIES.USD,
        showTodayCashflow,
        preferences: {},
      })
      const site = buildDisplaySiteData({
        last_sync_time: Date.now(),
        usage: {
          scope: ACCOUNT_USAGE_SCOPES.SiteToday,
          totalRequests: 7,
          cost: {
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            amount: observeAmount(
              "2.5",
              {
                adapter: "pmapi",
                operation: "today",
                contractVersion: "1",
                kind: EVIDENCE_KINDS.Reported,
              },
              observedAt,
            ),
          },
        },
      })
      render(<BalanceDisplay site={site} />)
      const row = screen.getByRole("group", {
        name: "optionsOverview:usage.siteDay",
      })
      expect(row).toHaveTextContent("account:financial.lastKnown")
      expect(
        within(row).getByTitle(new Date(observedAt).toLocaleString()),
      ).toBeVisible()
      expect(row).toHaveTextContent("7")
      if (showTodayCashflow) expect(row).toHaveTextContent("2.5")
      else expect(row).not.toHaveTextContent("2.5")
    },
  )

  it("shows provider-day counters once while retaining independent lifetime counters", () => {
    render(
      <BalanceDisplay
        site={buildDisplaySiteData({
          last_sync_time: Date.now(),
          usage: {
            scope: ACCOUNT_USAGE_SCOPES.SiteToday,
            totalRequests: 137,
            totalTokens: 293,
          },
        })}
      />,
    )
    expect(screen.getAllByText("137")).toHaveLength(1)
    expect(screen.getAllByText("293")).toHaveLength(1)
  })

  it("keeps saved release spending and income readable as references before native refresh", () => {
    const observedAt = Date.now()
    const site = buildDisplaySiteData({
      settledConsumption: [],
      reportedIncome: [],
      referenceConsumption: {
        amount: { USD: 3.25, CNY: 22.75 },
        observedAt,
        lastKnown: false,
      },
      referenceIncome: {
        amount: { USD: 2.5, CNY: 17.5 },
        observedAt,
        lastKnown: false,
      },
    })
    render(<BalanceDisplay site={site} />)
    const consumption = screen.getByRole("button", { name: /refreshCashflow/ })
    const income = screen.getByRole("button", { name: /refreshIncome/ })
    expect(consumption).toHaveTextContent("-$3.25")
    expect(income).toHaveTextContent("+$2.50")
    expect(consumption).toHaveTextContent(
      testI18n.t("balanceHistory:breakdown.controls.reference"),
    )
    expect(income).toHaveTextContent(
      testI18n.t("balanceHistory:breakdown.controls.reference"),
    )
    expect(consumption).toHaveAccessibleName(/account:financial.legacy/)
    expect(
      screen.getByRole("button", {
        name: testI18n.t("account:financial.details"),
      }),
    ).toBeVisible()
  })

  beforeEach(() => {
    vi.clearAllMocks()

    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.USD,
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

  it("updates native balances without a floating-point animation and preserves daily cashflow actions", async () => {
    const user = userEvent.setup()
    const scope = accountBalanceScope({
      baseUrl: "https://native.example",
      accountId: "account-1",
    })
    const snapshot = (value: string) =>
      accountBalanceSnapshot(
        scope,
        [
          balancePosition({
            id: "wallet",
            scope,
            source: {
              adapter: "fixture",
              operation: "balance",
              contractVersion: "1",
              kind: EVIDENCE_KINDS.Reported,
            },
            observedAt: 100,
            asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
            value,
          }),
        ],
        100,
        FINANCIAL_COVERAGE.Complete,
      )
    const site = buildDisplaySiteData(
      {
        balanceSnapshot: snapshot("25.25"),
        todayConsumption: { USD: 3, CNY: 21 },
        todayIncome: { USD: 2, CNY: 14 },
      },
      [CURRENCIES.USD],
    )
    const updated = buildDisplaySiteData(
      {
        ...site,
        balanceSnapshot: snapshot("30.25"),
        settledConsumption: undefined,
        reportedIncome: undefined,
        todayConsumption: { USD: 4, CNY: 28 },
        todayIncome: { USD: 3, CNY: 21 },
      },
      [CURRENCIES.USD],
    )
    const refreshAccount = vi.fn().mockResolvedValue(undefined)
    mockUseAccountActionsContext.mockReturnValue({
      handleRefreshAccount: refreshAccount,
      refreshingAccountId: null,
    })
    const { rerender } = render(<BalanceDisplay site={site} />)
    rerender(<BalanceDisplay site={updated} />)
    const button = screen.getByRole("button", {
      description: "account:list.balance.refreshBalance",
    })
    expect(button).toHaveTextContent("30.25")
    expect(within(button).queryByTestId("countup")).not.toBeInTheDocument()
    expect(
      screen.getByTitle("account:list.balance.refreshCashflow"),
    ).toHaveTextContent("4.00")
    await user.click(button)
    expect(refreshAccount).toHaveBeenCalledExactlyOnceWith(updated, true)
  })

  it("qualifies partial daily values without hiding their refresh actions", async () => {
    const user = userEvent.setup()
    const handleRefreshAccount = vi.fn().mockResolvedValue(undefined)
    const site = buildDisplaySiteData(
      {
        todayConsumption: { USD: 3, CNY: 21 },
        todayIncome: { USD: 2, CNY: 14 },
        todayStatsAvailability: buildCompleteTodayStatsAvailability({
          consumption: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
            reason: ACCOUNT_TODAY_METRIC_REASONS.PageLimit,
          },
        }),
      },
      [CURRENCIES.USD],
    )
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

    await user.click(atIndex(unavailableValues, 0))
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
    expect(legacyValue).not.toHaveAccessibleName(
      /account:todayMetricAvailability\.unavailable/,
    )

    await user.tab()
    await user.tab()
    expect(legacyValue).toHaveFocus()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "account:todayMetricAvailability.refreshActionHelp",
    )

    await user.click(legacyValue)
    expect(handleRefreshAccount).toHaveBeenCalledWith(site, true)
  })

  it("renders native negative net inflow separately from confirmed income", async () => {
    const user = userEvent.setup()
    const site = buildDisplaySiteData({
      balance: { USD: 25.25, CNY: 176.75 },
      todayConsumption: { USD: 3, CNY: 21 },
      todayIncome: { USD: 2, CNY: 14 },
      estimatedTodayIncome: { USD: 5.5, CNY: 38.5 },
      netInflowEstimate: {
        status: "available",
        estimates: [buildNetInflowItem(buildNetInflow("-5"))],
      },
    })
    const updatedSite = buildDisplaySiteData({
      ...site,
      estimatedTodayIncome: { USD: 6.5, CNY: 45.5 },
      netInflowEstimate: {
        status: "available",
        estimates: [buildNetInflowItem(buildNetInflow("-6"))],
      },
    })
    const handleRefreshAccount = vi.fn().mockResolvedValue(undefined)

    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.USD,
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

    const estimatedNode = screen.getByRole("button", {
      name: /account:stats.estimatedNetInflow/,
    })
    expect(estimatedNode).toHaveTextContent(/CNY\s*-6|-[^0-9]*CNY\s*6/)
    expect(estimatedNode).not.toHaveTextContent("$6.50")
    expect(estimatedNode).toHaveTextContent("account:stats.estimatedNetInflow")

    await user.click(estimatedNode)

    expect(handleRefreshAccount).toHaveBeenCalledWith(updatedSite, true)
  })

  it("preserves available and unavailable native ledgers in the same row", () => {
    const missing = buildNetInflowItem({
      ...buildNetInflow(),
      amount: { value: "2", asset: { kind: ASSET_KINDS.Crypto, id: "XNO" } },
    })
    missing.status = "missing_baseline"
    missing.position.label = "Reserve wallet"
    delete missing.netInflow
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.USD,
      showTodayCashflow: true,
      preferences: {
        balanceHistory: { estimatedTodayIncome: { enabled: true } },
      },
    })
    const site = buildDisplaySiteData({
      netInflowEstimate: {
        status: "available",
        estimates: [buildNetInflowItem(), missing],
      },
    })
    render(<BalanceDisplay site={site} />)
    const button = screen.getByRole("button", {
      name: /account:stats.estimatedNetInflow/,
    })
    expect(button).toHaveTextContent(/CNY\s*-5|-[^0-9]*CNY\s*5/)
    expect(button).toHaveTextContent("Reserve wallet")
    expect(button).toHaveAccessibleName(/Reserve wallet.*XNO/)
    expect(button).toHaveTextContent("XNO")
    expect(button).toHaveTextContent("account:financial.unavailable")
    expect(button).toHaveAccessibleName(/account:netInflow.reasons.baseline/)
  })

  it("hides native net inflow with the preference off and shows unavailable readings with it on", () => {
    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.USD,
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
          netInflowEstimate: {
            status: "available",
            estimates: [buildNetInflowItem()],
          },
        })}
      />,
    )

    expect(
      screen.queryByLabelText(/account:stats.estimatedNetInflow/),
    ).not.toBeInTheDocument()

    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.USD,
      showTodayCashflow: true,
      preferences: {
        balanceHistory: {
          estimatedTodayIncome: { enabled: true },
        },
      },
    })

    rerender(
      <BalanceDisplay
        site={buildDisplaySiteData({
          netInflowEstimate: { status: "missing_baseline", estimates: [] },
        })}
      />,
    )

    expect(
      screen.getByRole("button", { name: /account:stats.estimatedNetInflow/ }),
    ).toHaveTextContent("account:financial.unavailable")
  })

  it.each(["disabled", "manual_balance"] as const)(
    "shows the %s estimate reason without offering a provider refresh",
    (status) => {
      mockUseUserPreferencesContext.mockReturnValue({
        currencyType: CURRENCIES.USD,
        showTodayCashflow: true,
        preferences: {
          balanceHistory: { estimatedTodayIncome: { enabled: true } },
        },
      })
      render(
        <BalanceDisplay
          site={buildDisplaySiteData({
            netInflowEstimate: { status, estimates: [] },
          })}
        />,
      )

      expect(
        screen.getByLabelText(/account:stats.estimatedNetInflow/),
      ).toHaveAccessibleName(/account:netInflow.reasons/)
      expect(
        screen.queryByRole("button", {
          name: /account:stats.estimatedNetInflow/,
        }),
      ).not.toBeInTheDocument()
    },
  )

  it("renders neutral disabled net inflow without a refresh action", async () => {
    const user = userEvent.setup()
    const handleRefreshAccount = vi.fn().mockResolvedValue(undefined)

    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.USD,
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
          netInflowEstimate: {
            status: "available",
            estimates: [buildNetInflowItem(buildNetInflow("0"))],
          },
        })}
      />,
    )

    const estimatedNode = screen.getByLabelText(
      /account:stats.estimatedNetInflow/,
    )
    expect(estimatedNode).toHaveTextContent(/CNY\s*0/)
    expect(estimatedNode).toHaveClass("text-muted-foreground")
    expect(
      screen.queryByRole("button", {
        name: /account:stats.estimatedNetInflow/,
      }),
    ).not.toBeInTheDocument()

    await user.click(estimatedNode)

    expect(handleRefreshAccount).not.toHaveBeenCalled()
  })

  it("renders a neutral enabled net inflow as a refresh action", async () => {
    const user = userEvent.setup()
    const handleRefreshAccount = vi.fn().mockResolvedValue(undefined)

    mockUseUserPreferencesContext.mockReturnValue({
      currencyType: CURRENCIES.USD,
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
      netInflowEstimate: {
        status: "available",
        estimates: [buildNetInflowItem(buildNetInflow("0"))],
      },
    })
    render(<BalanceDisplay site={site} />)

    const estimatedButton = screen.getByRole("button", {
      name: /account:stats.estimatedNetInflow/,
    })
    expect(estimatedButton).toHaveTextContent(/CNY\s*0/)
    expect(estimatedButton).toHaveClass("text-muted-foreground")

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
    expect(disabledValues[1]).toHaveClass("text-faint-foreground")
    expect(disabledValues[2]).toHaveClass("text-faint-foreground")

    await user.click(atIndex(disabledValues, 0))

    expect(handleRefreshAccount).not.toHaveBeenCalled()
  })

  it("keeps disabled partial cashflow static while exposing each value and localized qualifier", async () => {
    const user = userEvent.setup()
    const handleRefreshAccount = vi.fn().mockResolvedValue(undefined)
    const site = buildDisplaySiteData(
      {
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
      },
      [CURRENCIES.USD],
    )
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
      expect(value).not.toHaveAttribute("title")
    })

    await user.click(atIndex(partialValues, 0))
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "account:list.site.disabled",
    )
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "account:todayMetricAvailability.partial",
    )
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

    await user.click(atIndex(unavailableValues, 0))
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

    const balanceNode = screen.getByRole("button", {
      description: "account:list.balance.refreshBalance",
    })
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

      const balanceButton = screen.getByTitle(
        "account:list.balance.refreshBalance",
      )
      const cashflowButton = screen.getByRole("button", {
        name: "account:list.balance.refreshCashflow",
      })
      const incomeButton = screen.getByRole("button", {
        name: "account:list.balance.refreshIncome",
      })

      const buttons = [balanceButton, cashflowButton, incomeButton]
      const initiator = screen.getByTitle(initiatorName)
      const siblings = buttons.filter((button) => button !== initiator)

      await user.click(initiator)

      expect(initiator).toHaveAttribute("aria-busy", "true")
      expect(initiator).toBeDisabled()
      for (const sibling of siblings) {
        expect(sibling).toBeDisabled()
        expect(sibling).not.toHaveAttribute("aria-busy")
      }

      await user.click(initiator)
      await user.click(atIndex(siblings, 0))
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
      currencyType: CURRENCIES.CNY,
      showTodayCashflow: false,
    })
    mockUseAccountDataContext.mockReturnValue({
      isInitialLoad: true,
      prevBalances: {
        [site.id]: { USD: 100, CNY: 700 },
      },
    })

    render(<BalanceDisplay site={site} />)

    const balanceNode = screen.getByRole("button", {
      description: "account:list.balance.refreshBalance",
    })

    expect(
      screen.queryByTitle("account:list.balance.refreshCashflow"),
    ).toBeNull()
    expect(screen.queryByTitle("account:list.balance.refreshIncome")).toBeNull()
    expect(screen.queryByTestId("countup")).toBeNull()
    expect(balanceNode).toHaveTextContent("account:financial.unavailable")
  })

  it.each([
    ["en-US", "12.3K"],
    ["zh-SG", "1.2万"],
  ] as const)(
    "renders provider usage and subscription details when account data exposes them (%s)",
    (locale, formattedTokens) => {
      mockDefaultNumberFormatLocale(locale)
      render(
        <BalanceDisplay
          site={buildDisplaySiteData({
            usage: {
              scope: ACCOUNT_USAGE_SCOPES.CurrentPeriod,
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
      expect(
        screen.getByTitle("account:stats.usageRequests"),
      ).toHaveTextContent("42")
      expect(screen.getByTitle("account:stats.usageTokens")).toHaveTextContent(
        formattedTokens,
      )
      expect(
        screen.getByTitle("account:stats.subscriptionRemainingCount"),
      ).toHaveTextContent("8")
    },
  )

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
    ).toHaveTextContent("account:stats.subscriptionState.inactive")
    expect(
      screen.queryByTitle("account:stats.subscriptionRemainingCount"),
    ).not.toBeInTheDocument()
  })
})
