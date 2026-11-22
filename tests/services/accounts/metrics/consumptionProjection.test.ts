import { afterEach, expect, it, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { calculateAccountStats } from "~/services/accounts/accountStorage/accountStatistics"
import {
  displayCashflowAmount,
  getDisplayConsumptionProjection,
  getDisplayIncomeProjection,
  getReferenceCashflowTotal,
  selectDisplayCashflow,
} from "~/services/accounts/metrics/consumptionProjection"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
  FINANCIAL_SUBJECT_KINDS,
  INCOME_CLASSIFICATIONS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import type { FinancialConsumptionFact } from "~/services/amounts/usage"
import {
  calculateTotalConsumption,
  calculateTotalIncomeForSites,
} from "~/utils/core/formatters"
import {
  buildDisplaySiteData,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"

const now = new Date(2026, 10, 11, 12).getTime()
const start = new Date(2026, 10, 11).getTime()
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

it("reclassifies cached legacy reference amounts after the local day changes", () => {
  const reference = {
    amount: { USD: 5, CNY: 35 },
    observedAt: now,
    lastKnown: false,
  }
  const account = buildDisplaySiteData({
    id: "reference",
    referenceConsumption: reference,
    referenceIncome: reference,
  })
  const tomorrow = new Date(2026, 10, 12, 12).getTime()
  for (const project of [
    getDisplayConsumptionProjection,
    getDisplayIncomeProjection,
  ]) {
    expect(
      getReferenceCashflowTotal(project([account], now), "USD"),
    ).toMatchObject({ value: "5" })
    const next = project([account], tomorrow)
    expect(getReferenceCashflowTotal(next, "USD")).toBeUndefined()
    expect(next.references?.[0]).toMatchObject({
      observedAt: now,
      lastKnown: true,
    })
  }
})

function fact(id: string, value: string, end = now): FinancialConsumptionFact {
  return {
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    amount: {
      status: OBSERVATION_STATUSES.Known,
      value,
      observedAt: now,
      source: {
        adapter: "fixture",
        operation: "usage",
        contractVersion: "1",
        kind: EVIDENCE_KINDS.Reported,
      },
    },
    scope: {
      subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: id },
      authority: "https://usage.example",
      walletId: id,
      projects: { kind: SCOPE_SELECTION_KINDS.All },
      keys: { kind: SCOPE_SELECTION_KINDS.All },
      models: { kind: SCOPE_SELECTION_KINDS.All },
      groups: { kind: SCOPE_SELECTION_KINDS.All },
    },
    window: { start, end, timeZone },
    settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
    coverage: FINANCIAL_COVERAGE.Complete,
  }
}

afterEach(() => vi.useRealTimers())

it("deduplicates a shared wallet when unrestricted routes are omitted or explicit", () => {
  const first = fact("a", "12")
  const second = {
    ...first,
    scope: {
      ...first.scope,
      subject: { kind: "account", accountId: "b" } as const,
      routes: { kind: "all" } as const,
    },
  }
  const accounts = [
    { id: "a", settledConsumption: [first] },
    { id: "b", settledConsumption: [second] },
  ]
  expect(getDisplayConsumptionProjection(accounts, now).groups).toMatchObject([
    { amount: { value: "12" } },
  ])
  second.scope.walletId = "independent-wallet"
  expect(getDisplayConsumptionProjection(accounts, now).groups).toMatchObject([
    { amount: { value: "24" } },
  ])
})

it("keeps native coverage partial across assets and monetary coverage limited to its contributors", () => {
  const usd = fact("a", "10")
  const yuan = {
    ...usd,
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
    amount: { ...usd.amount, value: "72" },
  } as FinancialConsumptionFact
  const euro = {
    ...fact("b", "5"),
    asset: { kind: ASSET_KINDS.Currency, code: "EUR" },
  } as FinancialConsumptionFact
  const result = getDisplayConsumptionProjection(
    [
      { id: "a", exchangeRate: 7.2, settledConsumption: [usd, yuan] },
      { id: "b", settledConsumption: [euro] },
    ],
    now,
  )
  expect(selectDisplayCashflow(result, "USD", 7.2)).toMatchObject({
    value: 20,
    coverage: { status: "partial", completeCount: 1, eligibleCount: 2 },
  })
  expect(
    getDisplayConsumptionProjection(
      [
        {
          id: "a",
          settledConsumption: [usd, { ...yuan, coverage: "partial" }],
        },
      ],
      now,
    ).nativeCoverage,
  ).toMatchObject({
    status: "partial",
    completeCount: 0,
    partialCount: 1,
  })
})

it("shows both income currencies in the selected monetary total while preserving the original facts", () => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  const { settlement: _settlement, ...usd } = fact("a", "10")
  const yuan = {
    ...usd,
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
    amount: { ...usd.amount, value: "72" },
  }
  const result = calculateTotalIncomeForSites([
    buildDisplaySiteData({
      id: "a",
      exchangeRate: 7.2,
      reportedIncome: [usd, yuan].map((reading) => ({
        ...reading,
        classification: INCOME_CLASSIFICATIONS.Unclassified,
      })),
    }),
  ])
  expect(selectDisplayCashflow(result, "USD", 7.2)).toMatchObject({
    value: 20,
    coverage: { status: "complete" },
    displayAmount: { asset: { kind: "currency", code: "USD" }, value: "20" },
  })
  expect(selectDisplayCashflow(result, "CNY", 7.2)).toMatchObject({
    value: 144,
  })
  expect(selectDisplayCashflow(result).displayAmount).toEqual({
    asset: { kind: "currency", code: "USD" },
    value: "10",
  })
  expect(result.groups.map(({ amount }) => amount)).toEqual([
    { asset: { kind: "currency", code: "USD" }, value: "10" },
    { asset: { kind: "currency", code: "CNY" }, value: "72" },
  ])
})

it("converts a yuan subtotal using each contributing account's rate while retaining native facts", () => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  const sites = [
    { id: "a", rate: 7 },
    { id: "b", rate: 14 },
  ].map(({ id, rate }) =>
    buildDisplaySiteData({
      id,
      exchangeRate: rate,
      settledConsumption: [
        {
          ...fact(id, "7"),
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
        },
      ],
    }),
  )
  const result = calculateTotalConsumption(sites)
  expect(displayCashflowAmount(result.groups[0]!, "USD")).toEqual({
    asset: { kind: ASSET_KINDS.Currency, code: "USD" },
    value: "1.5",
  })
  expect(displayCashflowAmount(result.groups[0]!)).toEqual({
    asset: { kind: ASSET_KINDS.Currency, code: "CNY" },
    value: "14",
  })
})

it("shows a known subtotal from a partial day in a provider timezone", () => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  const spending = fact("a", "2")
  spending.window = {
    start: start + 3_600_000,
    end: now,
    timeZone: timeZone === "UTC" ? "Asia/Singapore" : "UTC",
  }
  const result = calculateTotalConsumption([
    buildDisplaySiteData({ id: "a", settledConsumption: [spending] }),
    buildDisplaySiteData({ id: "b" }),
  ])
  expect(result.groups).toEqual([
    expect.objectContaining({
      amount: { asset: spending.asset, value: "2" },
      coverage: expect.objectContaining({
        status: "partial",
        partialCount: 1,
        eligibleCount: 2,
      }),
    }),
  ])
})

it("retains pending-refresh evidence without adding old consumption or income scalars", () => {
  const account = buildSiteAccount({ id: "legacy" })
  account.account_info.today_quota_consumption = 500000
  account.account_info.today_income = 500000
  delete account.account_info.todayStatsAvailability
  const display = accountPresentation.convertToDisplayData(account)
  expect(display.todayStatsAvailability.consumption).toMatchObject({
    status: "unavailable",
    reason: "legacy_unclassified",
  })
  expect(display.todayStatsAvailability.income).toMatchObject({
    status: "unavailable",
    reason: "legacy_unclassified",
  })
  expect(calculateTotalConsumption([display])).toMatchObject({
    amount: { USD: 0, CNY: 0 },
    coverage: { legacyUnclassifiedCount: 1 },
  })
})

it("marks each wallet interval partial when the account has another interval for the same asset", () => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  const second = fact("a", "2", now - 1000)
  second.scope.walletId = "second"
  const result = calculateTotalConsumption([
    buildDisplaySiteData({
      id: "a",
      settledConsumption: [fact("a", "1"), second],
    }),
  ])
  expect(result.groups).toHaveLength(2)
  expect(result.groups.map((group) => group.coverage.status)).toEqual([
    "partial",
    "partial",
  ])
})

it("keeps unidentified same-authority account totals qualified as potentially overlapping", () => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  const first = fact("a", "1"),
    second = fact("b", "2")
  delete first.scope.walletId
  delete second.scope.walletId
  const result = calculateTotalConsumption([
    buildDisplaySiteData({ id: "a", settledConsumption: [first] }),
    buildDisplaySiteData({ id: "b", settledConsumption: [second] }),
  ])
  expect(result.groups[0]?.coverage.status).toBe("partial")
  expect(result.nativeCoverage.status).toBe("partial")
})

it("does not combine different observation intervals into a complete today total", () => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  const result = calculateTotalConsumption([
    buildDisplaySiteData({
      id: "a",
      todayConsumption: { USD: 100, CNY: 700 },
      settledConsumption: [fact("a", "1")],
    }),
    buildDisplaySiteData({
      id: "b",
      todayConsumption: { USD: 200, CNY: 1400 },
      settledConsumption: [fact("b", "2", now - 1000)],
    }),
  ])
  expect(result.amount.USD).toBe(0)
  expect(result.coverage.status).toBe("unavailable")
  expect(result.groups.map((group) => group.amount.value)).toEqual(["1", "2"])
})

it("uses native observations for account presentation and statistics without converting currency", () => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  const account = buildSiteAccount({ id: "a", exchange_rate: 7 })
  account.account_info.today_quota_consumption = 999000000
  account.account_info.settledConsumption = [fact("a", "1.000000000000000017")]
  const display = accountPresentation.convertToDisplayData(account)
  expect(display.settledConsumption).toEqual(
    account.account_info.settledConsumption,
  )
  expect(display.todayConsumption).toEqual({ USD: 0, CNY: 0 })
  const stats = calculateAccountStats([account])
  expect(stats.today_total_consumption).toBe(0)
  expect(stats.consumptionProjection?.groups).toEqual([
    expect.objectContaining({
      amount: {
        asset: { kind: "currency", code: "USD" },
        value: "1.000000000000000017",
      },
      window: { start, end: now, timeZone },
    }),
  ])
})

it("preserves separate exact native currencies and quota with asset-specific coverage", () => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  const usd = fact("a", "1.000000000000000017")
  const yuan = {
    ...fact("b", "-2"),
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
  }
  const tokens = {
    ...fact("c", "17"),
    asset: {
      kind: ASSET_KINDS.Quota,
      id: "issuer:tokens",
      label: "tokens",
      displayScale: 1,
      displayLabel: "tokens",
    },
  }
  const result = calculateTotalConsumption([
    buildDisplaySiteData({ id: "a", settledConsumption: [usd] }),
    buildDisplaySiteData({ id: "b", settledConsumption: [yuan] }),
    buildDisplaySiteData({ id: "c", settledConsumption: [tokens] }),
  ])
  expect(result.groups.map((group) => group.amount)).toEqual([
    { asset: usd.asset, value: "1.000000000000000017" },
    { asset: yuan.asset, value: "-2" },
    { asset: tokens.asset, value: "17" },
  ])
  expect(result.coverageByCurrency.CNY).toMatchObject({
    status: "partial",
    completeCount: 1,
    eligibleCount: 3,
  })
  expect(result.amount).toEqual({ USD: 0, CNY: -2 })
})

it("keeps an independent currency group when valid observations overflow another sum", () => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  const yuan = {
    ...fact("c", "3"),
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
  }
  const result = calculateTotalConsumption([
    buildDisplaySiteData({
      id: "a",
      settledConsumption: [fact("a", "9".repeat(256))],
    }),
    buildDisplaySiteData({ id: "b", settledConsumption: [fact("b", "1")] }),
    buildDisplaySiteData({ id: "c", settledConsumption: [yuan] }),
  ])
  expect(result.groups.map((group) => group.amount)).toEqual([
    { asset: yuan.asset, value: "3" },
  ])
  expect(result.coverageByCurrency.USD.status).toBe("unavailable")
  expect(result.nativeCoverage.status).toBe("partial")
})

it("projects reported income independently from consumption and unqualified scalar income", () => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  const account = buildSiteAccount({ id: "a" })
  account.account_info.today_income = 777000000
  const { settlement: _settlement, ...income } = fact("a", "2")
  account.account_info.reportedIncome = [
    { ...income, classification: INCOME_CLASSIFICATIONS.Topup },
  ]
  account.account_info.settledConsumption = [fact("a", "3")]
  const display = accountPresentation.convertToDisplayData(account)
  expect(display.incomeProjection?.groups[0]?.amount.value).toBe("2")
  expect(display.consumptionProjection?.groups[0]?.amount.value).toBe("3")
  expect(display.todayIncome).toEqual({ USD: 2, CNY: 0 })
  expect(
    calculateTotalIncomeForSites([
      { ...display, todayIncome: { USD: 999, CNY: 6993 } },
    ]).amount,
  ).toEqual({ USD: 2, CNY: 0 })
  expect(
    calculateAccountStats([account]).incomeProjection?.groups[0]?.amount.value,
  ).toBe("2")
})

it("reports the remaining wallet as partial when another wallet has conflicting observations", () => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  const good = fact("a", "1")
  const first = fact("a", "2")
  first.scope.walletId = "conflict"
  const second = fact("a", "3")
  second.scope.walletId = "conflict"
  const result = calculateTotalConsumption([
    buildDisplaySiteData({
      id: "a",
      settledConsumption: [good, first, second],
    }),
  ])
  expect(result.amount.USD).toBe(1)
  expect(result.coverage.status).toBe("partial")
  expect(result.groups[0]?.coverage.status).toBe("partial")
})

it.each([
  ["a", "b", "c"],
  ["a", "c", "b"],
  ["c", "a", "b"],
])(
  "marks every participant of a conflicted shared wallet incomplete (%s,%s,%s)",
  (...order) => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const first = fact("a", "2")
    first.scope.walletId = "shared"
    const second = fact("b", "3")
    second.scope.walletId = "shared"
    const third = fact("c", "2")
    third.scope.walletId = "shared"
    const accounts = [
      buildDisplaySiteData({
        id: "a",
        settledConsumption: [first, fact("a", "1")],
      }),
      buildDisplaySiteData({
        id: "b",
        settledConsumption: [second, fact("b", "1")],
      }),
      buildDisplaySiteData({
        id: "c",
        settledConsumption: [third, fact("c", "1")],
      }),
    ]
    const result = calculateTotalConsumption(
      order.map((id) => accounts.find((account) => account.id === id)!),
    )
    expect(result.amount.USD).toBe(3)
    expect(result.coverage).toMatchObject({ completeCount: 0, partialCount: 3 })
  },
)

it("excludes unverified scopes and duplicate wallets while retaining independent partial observations", () => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  const shared = fact("a", "5")
  const duplicate = {
    ...shared,
    scope: {
      ...shared.scope,
      subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: "b" },
    },
  }
  const restricted = fact("c", "500")
  restricted.scope.models = {
    kind: SCOPE_SELECTION_KINDS.Restricted,
    ids: ["model"],
  }
  const missing = fact("a", "0")
  missing.scope.walletId = "second-wallet"
  missing.amount = {
    status: OBSERVATION_STATUSES.Unavailable,
    reason: "request-failed",
    source: shared.amount.source,
  }
  const result = calculateTotalConsumption([
    buildDisplaySiteData({ id: "a", settledConsumption: [shared, missing] }),
    buildDisplaySiteData({ id: "b", settledConsumption: [duplicate] }),
    buildDisplaySiteData({ id: "c", settledConsumption: [restricted] }),
  ])
  expect(result.amount.USD).toBe(5)
  expect(result.coverage).toMatchObject({
    status: "partial",
    completeCount: 0,
    partialCount: 1,
    eligibleCount: 3,
  })
})
