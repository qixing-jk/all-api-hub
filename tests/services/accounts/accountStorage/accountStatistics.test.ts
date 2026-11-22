import { describe, expect, it, onTestFinished, vi } from "vitest"

import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { CURRENCIES } from "~/constants/money"
import { calculateAccountStats } from "~/services/accounts/accountStorage/accountStatistics"
import { accountBalanceSnapshot } from "~/services/accounts/balanceSnapshot"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_NATURES,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SUBJECT_KINDS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { SiteHealthStatus } from "~/types"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

it("keeps unavailable provider cost without counters out of statistic readings", () => {
  const site = buildSiteAccount()
  site.account_info.usage = {
    scope: "site_today",
    cost: {
      asset: { kind: "currency", code: "USD" },
      amount: observeAmount(
        undefined,
        {
          adapter: "fixture",
          operation: "cost",
          contractVersion: "1",
          kind: "reported",
        },
        Date.now(),
      ),
    },
  }
  expect(calculateAccountStats([site]).siteDayUsage).toBeUndefined()
})

/** Provider facts remain independent of the deliberately misleading quota DTO. */
function account(
  id: string,
  value: string,
  currency: string = CURRENCIES.USD,
  walletId = id,
) {
  const result = buildSiteAccount({ id })
  const scope = {
    subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: id } as const,
    authority: "https://stats.example",
    walletId,
    models: { kind: SCOPE_SELECTION_KINDS.All } as const,
    groups: { kind: SCOPE_SELECTION_KINDS.All } as const,
    keys: { kind: SCOPE_SELECTION_KINDS.All } as const,
    projects: { kind: SCOPE_SELECTION_KINDS.All } as const,
  }
  result.account_info.balance = accountBalanceSnapshot(
    scope,
    [
      balancePosition({
        id: "wallet",
        value,
        scope,
        observedAt: 100,
        asset: { kind: ASSET_KINDS.Currency, code: currency },
        nature: BALANCE_NATURES.Prepaid,
        validity: { kind: BALANCE_VALIDITY_KINDS.NoExpiry },
        source: {
          adapter: "fixture",
          operation: "wallet",
          contractVersion: "1",
          kind: EVIDENCE_KINDS.Reported,
        },
      }),
    ],
    100,
    FINANCIAL_COVERAGE.Complete,
  )
  result.account_info.quota = 999000000
  return result
}

describe("canonical account balance statistics", () => {
  it("shows a reported site day alongside lifetime usage", () => {
    const site = buildSiteAccount({
      id: "rightcode",
      last_sync_time: Date.now(),
    })
    site.account_info.usage = {
      scope: ACCOUNT_USAGE_SCOPES.Lifetime,
      totalRequests: 200,
    }
    site.account_info.usageObservations = [
      {
        scope: ACCOUNT_USAGE_SCOPES.SiteToday,
        totalRequests: 4,
        totalTokens: 10,
      },
    ]
    expect(calculateAccountStats([site]).siteDayUsage).toEqual([
      expect.objectContaining({ id: "rightcode", requests: 4, tokens: 10 }),
    ])
  })
  it("keeps finite same-day legacy consumption as a reference and leaves yesterday out", () => {
    const current = buildSiteAccount({
      id: "current",
      last_sync_time: Date.now(),
    })
    current.account_info.today_quota_consumption = 1_250_000
    current.account_info.todayStatsAvailability =
      buildCompleteTodayStatsAvailability()
    const old = buildSiteAccount({ id: "old" })
    old.account_info.today_quota_consumption = 5_000_000
    old.account_info.todayStatsAvailability =
      buildCompleteTodayStatsAvailability()
    const stats = calculateAccountStats([current, old])
    expect(stats.referenceTodayConsumption).toMatchObject({
      quota: 1_250_000,
      coverage: { status: "partial", completeCount: 1, eligibleCount: 2 },
    })
    expect(stats.consumptionProjection?.groups).toEqual([])
  })

  it("does not label legacy spending as today's after a failed refresh advances the sync clock", () => {
    const site = buildSiteAccount({
      id: "legacy",
      last_sync_time: Date.now(),
      health: { status: SiteHealthStatus.Error },
    })
    site.account_info.today_quota_consumption = 500_000
    site.account_info.todayStatsAvailability =
      buildCompleteTodayStatsAvailability()
    expect(
      calculateAccountStats([site]).referenceTodayConsumption,
    ).toBeUndefined()
  })
  it("uses the release observation time rather than a later successful balance-only sync for reference spending", () => {
    const now = new Date(2026, 10, 1, 23, 30)
    vi.setSystemTime(now)
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const previous = new Date(now)
    const yesterday = previous.setDate(now.getDate() - 1)
    const site = buildSiteAccount({
      id: "legacy",
      last_sync_time: now.getTime(),
    })
    site.account_info.today_quota_consumption = 500_000
    site.account_info.todayStatsAvailability =
      buildCompleteTodayStatsAvailability()
    site.account_info.legacyFinancial = {
      schemaVersion: 1,
      capturedAt: yesterday,
      cashflow: { consumption: 500_000 },
    }
    expect(
      calculateAccountStats([site]).referenceTodayConsumption,
    ).toBeUndefined()
  })
  it("preserves native currency totals, deduplicates wallets and discloses manual and missing observations", () => {
    const first = account("first", "20", CURRENCIES.USD, "shared")
    const duplicate = account("duplicate", "20", CURRENCIES.USD, "shared")
    const yuan = account("yuan", "50", CURRENCIES.CNY)
    const manual = { ...account("manual", "30"), manualBalanceUsd: "7" }
    const unknown = buildSiteAccount({ id: "unknown" })
    const stale = account("stale", "40")
    const prior = stale.account_info.balance!.positions[0]!
    if (prior.amount.status === OBSERVATION_STATUSES.Known)
      prior.amount = {
        ...prior.amount,
        status: OBSERVATION_STATUSES.Stale,
        reason: "failed-refresh",
      }
    const disabled = { ...account("disabled", "10"), disabled: true }
    const excluded = {
      ...account("excluded", "10"),
      excludeFromTotalBalance: true,
    }
    const stats = calculateAccountStats([
      first,
      duplicate,
      yuan,
      manual,
      unknown,
      stale,
      disabled,
      excluded,
    ])
    expect(stats.total_quota).toBe(33_500_000)
    expect(stats.balancePortfolio).toMatchObject({
      amounts: [
        { value: "67", asset: { kind: "currency", code: "USD" } },
        { value: "50", asset: { kind: "currency", code: "CNY" } },
      ],
      includedCount: 4,
      lastKnownCount: 1,
      eligibleCount: 6,
      duplicateCount: 1,
      manualCount: 1,
      coverage: "partial",
    })
    expect(manual.account_info.balance?.positions[0]?.amount).toMatchObject({
      value: "30",
    })
    expect(excluded.excludeFromTotalBalance).toBe(true)
  })
})
