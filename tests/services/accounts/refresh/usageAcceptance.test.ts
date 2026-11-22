import { expect, it, onTestFinished, vi } from "vitest"

import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { CURRENCIES } from "~/constants/money"
import { accountReportingScope } from "~/services/accounts/balanceSnapshot"
import { getSiteDayReadings } from "~/services/accounts/metrics/accountTodayStats"
import {
  acceptUsageObservations,
  acceptUsageSummary,
} from "~/services/accounts/refresh/usageAcceptance"
import { observeAmount } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import type { AccountUsageSummary } from "~/types"

it("retains the observation clock and freshness of counter-only usage after a failed refresh", () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  vi.setSystemTime(100)
  const collected = acceptUsageObservations(undefined, [
    {
      scope: ACCOUNT_USAGE_SCOPES.SiteToday,
      reportedDay: "2026-11-18",
      totalRequests: 4,
      totalTokens: 100,
    },
  ])
  vi.setSystemTime(200)
  const retained = acceptUsageObservations(collected, [])
  expect(
    getSiteDayReadings(
      { usageObservations: retained, last_sync_time: 200 },
      200,
    )[0],
  ).toMatchObject({
    observedAt: 100,
    lastKnown: true,
    usage: { totalRequests: 4, totalTokens: 100 },
  })
})

const dailyUsage = (): AccountUsageSummary => ({
  scope: ACCOUNT_USAGE_SCOPES.Today,
  totalRequests: 4,
  cost: {
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    scope: accountReportingScope({
      baseUrl: "https://day.example",
      accountId: "day",
    }),
    window: { start: 100, end: 200, timeZone: "UTC" },
    amount: observeAmount(
      "1.5",
      {
        adapter: "daya",
        operation: "/api/v1/usage/dashboard/stats",
        contractVersion: "wallet-usd/v1",
        kind: EVIDENCE_KINDS.Reported,
      },
      200,
    ),
  },
})

it("keeps provider-day counters separate from an old cost when neither report establishes a billing day", () => {
  const firstAt = Date.UTC(2026, 10, 18, 12)
  const source = {
    adapter: "pmapi",
    operation: "/api/user/info",
    contractVersion: "1",
    kind: EVIDENCE_KINDS.Reported,
  } as const
  const previous: AccountUsageSummary = {
    scope: ACCOUNT_USAGE_SCOPES.SiteToday,
    observedAt: firstAt,
    totalRequests: 10,
    cost: {
      asset: { kind: "currency", code: "USD" },
      amount: observeAmount("5", source, firstAt),
    },
  }
  const incoming: AccountUsageSummary = {
    ...previous,
    observedAt: firstAt + 86_400_000,
    totalRequests: 2,
    cost: {
      ...previous.cost!,
      amount: observeAmount(undefined, source, firstAt + 86_400_000),
    },
  }
  const observations = acceptUsageObservations([previous], [incoming])!
  expect(observations[0]).toMatchObject({
    totalRequests: 2,
    cost: { amount: { status: "unavailable" } },
  })
  expect(observations[1]).toMatchObject({
    totalRequests: 10,
    cost: { amount: { status: "stale", value: "5", observedAt: firstAt } },
  })
  expect(acceptUsageSummary(previous, incoming)?.cost?.amount.status).toBe(
    "unavailable",
  )
  const fresh = {
    ...incoming,
    cost: {
      ...incoming.cost!,
      amount: observeAmount("7", source, firstAt + 86_400_000),
    },
  }
  expect(acceptUsageSummary(previous, fresh)?.cost?.amount).toMatchObject({
    status: "known",
    value: "7",
  })
})

it("keeps the last usable cost in singleton usage when the clock moves backward", () => {
  const old = dailyUsage()
  const incoming = {
    ...old,
    observedAt: 150,
    totalRequests: 8,
    cost: {
      ...old.cost!,
      window: { ...old.cost!.window!, end: 150 },
      amount: observeAmount(undefined, old.cost!.amount.source, 150),
    },
  }
  expect(acceptUsageSummary(old, incoming)).toMatchObject({
    totalRequests: 8,
    observedAt: 150,
    cost: {
      window: old.cost!.window,
      amount: { value: "1.5", status: "stale", observedAt: 200 },
    },
  })
})

it("retains a failed growing-day cost in the primary observation with its original window and fresh counters", () => {
  const previous = dailyUsage()
  const incoming: AccountUsageSummary = {
    ...previous,
    totalRequests: 8,
    totalTokens: 100,
    observedAt: 300,
    cost: {
      ...previous.cost!,
      window: { ...previous.cost!.window!, end: 300 },
      amount: observeAmount(undefined, previous.cost!.amount.source, 300),
    },
  }
  const accepted = acceptUsageObservations([previous], [incoming])!
  expect(accepted).toHaveLength(1)
  expect(accepted[0]).toMatchObject({
    totalRequests: 8,
    totalTokens: 100,
    observedAt: 300,
    cost: {
      ...previous.cost,
      amount: { ...previous.cost!.amount, status: "stale" },
    },
  })
})

it.each([
  "start",
  "timeZone",
  "reset",
  "identity",
  "source",
  "asset",
  "restricted",
  "kind",
  "shorter",
  "interval",
] as const)(
  "keeps failed %s observations distinct from a saved daily amount",
  (change) => {
    const previous = dailyUsage()
    const incoming = structuredClone(previous)
    incoming.cost!.window!.end = 300
    incoming.cost!.amount = observeAmount(
      undefined,
      { ...previous.cost!.amount.source },
      300,
    )
    if (change === "start") incoming.cost!.window!.start = 150
    if (change === "timeZone")
      incoming.cost!.window!.timeZone = "Asia/Singapore"
    if (change === "reset") incoming.cost!.window!.resetsAt = 400
    if (change === "identity") incoming.cost!.scope!.walletId = "another-wallet"
    if (change === "source") incoming.cost!.amount.source.contractVersion = "2"
    if (change === "asset")
      incoming.cost!.asset = {
        kind: ASSET_KINDS.Currency,
        code: CURRENCIES.CNY,
      }
    if (change === "restricted")
      incoming.cost!.scope!.models = {
        kind: SCOPE_SELECTION_KINDS.Restricted,
        ids: ["model"],
      }
    if (change === "kind") incoming.cost!.amount.source.kind = "derived"
    if (change === "shorter") incoming.cost!.window!.end = 150
    if (change === "interval") {
      previous.scope = ACCOUNT_USAGE_SCOPES.CurrentPeriod
      incoming.scope = ACCOUNT_USAGE_SCOPES.CurrentPeriod
    }
    const accepted = acceptUsageObservations([previous], [incoming])!
    expect(accepted[0]!.cost!.amount.status).toBe("unavailable")
    expect(accepted[1]?.cost?.amount).toMatchObject({
      status: "stale",
      value: "1.5",
      observedAt: 200,
    })
  },
)

it("qualifies known recognized daily report payloads consistently with their compatible keys", () => {
  const previous = dailyUsage()
  for (const field of ["projects", "keys", "models", "groups"] as const)
    previous.cost!.scope![field] = { kind: "unknown" }
  const incoming = structuredClone(previous)
  incoming.cost!.amount = observeAmount(
    "2.5",
    { ...previous.cost!.amount.source },
    300,
  )
  incoming.cost!.window!.end = 300
  const accepted = acceptUsageObservations([previous], [incoming])!
  expect(accepted).toHaveLength(1)
  expect(accepted[0]!.cost).toMatchObject({
    scope: {
      projects: { kind: "all" },
      keys: { kind: "all" },
      models: { kind: "all" },
      groups: { kind: "all" },
    },
    amount: { status: "known", value: "2.5", observedAt: 300 },
  })
})

it("never places yesterday's last-known cost under a newly reported provider day", () => {
  const scope = accountReportingScope({
    baseUrl: "https://day.example",
    accountId: "day",
  })
  const source = {
    adapter: "rightcode",
    operation: "overview",
    contractVersion: "1",
    kind: "reported" as const,
  }
  const previous = {
    scope: "site_today" as const,
    reportedDay: "2026-11-18",
    cost: {
      asset: { kind: "currency" as const, code: CURRENCIES.USD },
      scope,
      amount: observeAmount("1.5", source, 100),
    },
  }
  const incoming = {
    ...previous,
    reportedDay: "2026-11-19",
    totalRequests: 4,
    cost: { ...previous.cost, amount: observeAmount(undefined, source, 200) },
  }
  const accepted = acceptUsageObservations([previous], [incoming])!
  expect(accepted[0]).toMatchObject({
    reportedDay: "2026-11-19",
    totalRequests: 4,
    cost: { amount: { status: "unavailable" } },
  })
  expect(accepted[1]).toMatchObject({
    reportedDay: "2026-11-18",
    cost: { amount: { status: "stale", value: "1.5", observedAt: 100 } },
  })
})
