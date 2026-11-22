import { beforeEach, describe, expect, it, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition } from "~/services/amounts/balance"
import {
  maybeCaptureAccountReferenceBalance,
  maybeCaptureDailyBalanceSnapshot,
} from "~/services/history/dailyBalanceHistory/capture"
import type {
  AccountNativeBalance,
  AccountTodayStatsAvailability,
} from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { buildPeriodIncome } from "~~/tests/test-utils/financialPeriod"

const { upsertSnapshotMock } = vi.hoisted(() => ({
  upsertSnapshotMock: vi.fn(),
}))

vi.mock("~/services/history/dailyBalanceHistory/storage", () => ({
  dailyBalanceHistoryStorage: {
    upsertSnapshot: (...args: unknown[]) => upsertSnapshotMock(...args),
  },
}))

const complete = buildCompleteTodayStatsAvailability()
const unavailable = {
  status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
  reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
} as const
const partial = {
  status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
  reason: ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
} as const

it("captures an account's native income despite its total-only exclusion setting", async () => {
  const account = buildSiteAccount({ excludeFromTodayIncome: true })
  const scope = accountBalanceScope({
    accountId: account.id,
    baseUrl: account.site_url,
  })
  account.account_info.balance = accountBalanceSnapshot(
    scope,
    [
      balancePosition({
        id: "wallet",
        scope,
        asset: { kind: "currency", code: "USD" },
        value: "20",
        observedAt: Date.now(),
        source: {
          adapter: "fixture",
          operation: "wallet",
          contractVersion: "1",
          kind: "reported",
        },
      }),
    ],
    Date.now(),
    "complete",
  )
  account.account_info.reportedIncome = [buildPeriodIncome(account.id, "2")]
  await maybeCaptureAccountReferenceBalance({
    account,
    config: { ...DEFAULT_BALANCE_HISTORY_PREFERENCES, enabled: true },
    source: "refresh",
  })
  expect(upsertSnapshotMock).toHaveBeenCalledWith(
    expect.objectContaining({
      snapshot: expect.objectContaining({ today_income: 1_000_000 }),
    }),
  )
})

const capture = (
  todayStatsAvailability: AccountTodayStatsAvailability,
  nativeBalance?: AccountNativeBalance,
) =>
  maybeCaptureDailyBalanceSnapshot({
    config: {
      ...DEFAULT_BALANCE_HISTORY_PREFERENCES,
      enabled: true,
    },
    accountId: "account-1",
    quota: 1_000_000,
    nativeBalance,
    today_income: 200_000,
    today_quota_consumption: 300_000,
    todayStatsAvailability,
    source: "refresh",
    capturedAtMs: Date.UTC(2026, 4, 23, 12),
    timeZone: "UTC",
  })

it.each([true, false])(
  "captures a newer source only when both readings prove the same wallet (%s)",
  async (identified) => {
    upsertSnapshotMock.mockClear().mockResolvedValue(true)
    const account = buildSiteAccount({ id: "same-wallet" })
    const asOf = Date.now()
    const scope = {
      ...accountBalanceScope({
        baseUrl: account.site_url,
        accountId: account.id,
      }),
      ...(identified ? { walletId: "verified-wallet" } : {}),
    }
    const old = balancePosition({
      id: "wallet",
      scope,
      asset: { kind: "currency", code: "USD" },
      value: "20",
      observedAt: asOf - 1000,
      source: {
        adapter: "fixture",
        operation: "old-endpoint",
        contractVersion: "1",
        kind: "reported",
      },
    })
    old.amount = {
      ...old.amount,
      status: "stale",
      value: "20",
      observedAt: asOf - 1000,
      reason: "offline",
    }
    const current = balancePosition({
      id: "wallet",
      scope,
      asset: { kind: "currency", code: "USD" },
      value: "25",
      observedAt: asOf,
      source: {
        adapter: "fixture",
        operation: "new-endpoint",
        contractVersion: "1",
        kind: "reported",
      },
    })
    account.account_info.balance = accountBalanceSnapshot(
      scope,
      [old, current],
      asOf,
      "complete",
    )
    expect(
      await maybeCaptureAccountReferenceBalance({
        account,
        source: "refresh",
        asOf,
      }),
    ).toBe(identified)
    if (identified)
      expect(upsertSnapshotMock).toHaveBeenCalledWith(
        expect.objectContaining({
          snapshot: expect.objectContaining({ quota: 12_500_000 }),
        }),
      )
    else expect(upsertSnapshotMock).not.toHaveBeenCalled()
  },
)

describe("maybeCaptureDailyBalanceSnapshot", () => {
  it("does not record native token assets as zero-dollar snapshots", async () => {
    expect(
      await capture(complete, {
        unit: "quota",
        total: 10,
        asset: {
          id: "https://emrank.tech/token",
          label: "Token",
          displayScale: 1000000,
          displayLabel: "M Token",
        },
      }),
    ).toBe(false)
    expect(upsertSnapshotMock).not.toHaveBeenCalled()
  })

  it("does not record native credits as monetary balance history", async () => {
    expect(
      await capture(complete, {
        unit: "credits",
        total: 36000,
        permanent: 34000,
        daily: 2000,
      }),
    ).toBe(false)
    expect(upsertSnapshotMock).not.toHaveBeenCalled()
  })
  it("excludes scoped USD allowances instead of mixing permanent balance with all-pool spending", async () => {
    expect(
      await capture(complete, {
        unit: "USD",
        total: 8,
        permanent: 2,
        daily: 3,
      }),
    ).toBe(false)
    expect(upsertSnapshotMock).not.toHaveBeenCalled()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    upsertSnapshotMock.mockResolvedValue(true)
  })

  it.each([
    {
      label: "complete consumption and unavailable income",
      availability: buildCompleteTodayStatsAvailability({
        income: unavailable,
      }),
      expectedConsumption: 300_000,
      expectedIncome: null,
    },
    {
      label: "partial consumption and complete income",
      availability: buildCompleteTodayStatsAvailability({
        consumption: partial,
      }),
      expectedConsumption: null,
      expectedIncome: 200_000,
    },
    {
      label: "unavailable consumption and income",
      availability: buildCompleteTodayStatsAvailability({
        consumption: unavailable,
        income: unavailable,
      }),
      expectedConsumption: null,
      expectedIncome: null,
    },
    {
      label: "not-collected cashflow",
      availability: buildCompleteTodayStatsAvailability({
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
        },
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
        },
      }),
      expectedConsumption: null,
      expectedIncome: null,
    },
  ])(
    "always stores quota while preserving $label coverage",
    async ({ availability, expectedConsumption, expectedIncome }) => {
      await capture(availability)

      expect(upsertSnapshotMock).toHaveBeenCalledWith({
        accountId: "account-1",
        dayKey: "2026-05-23",
        snapshot: {
          quota: 1_000_000,
          today_income: expectedIncome,
          today_quota_consumption: expectedConsumption,
          capturedAt: Date.UTC(2026, 4, 23, 12),
          source: "refresh",
        },
        retentionDays: DEFAULT_BALANCE_HISTORY_PREFERENCES.retentionDays,
        timeZone: "UTC",
      })
    },
  )

  it("stores both complete cashflow metrics", async () => {
    await capture(complete)

    expect(upsertSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          quota: 1_000_000,
          today_income: 200_000,
          today_quota_consumption: 300_000,
        }),
      }),
    )
  })
})

it("does not record an unavailable cash balance as a real zero", async () => {
  expect(
    await maybeCaptureDailyBalanceSnapshot({
      config: { ...DEFAULT_BALANCE_HISTORY_PREFERENCES, enabled: true },
      accountId: "missing-balance",
      quota: 0,
      balanceUnavailable: true,
      today_income: 0,
      today_quota_consumption: 0,
      todayStatsAvailability: complete,
      source: "refresh",
    }),
  ).toBe(false)
  expect(upsertSnapshotMock).not.toHaveBeenCalled()
})

describe("history compatibility with native accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    upsertSnapshotMock.mockResolvedValue(true)
  })

  it("does not timestamp a last-known balance as a fresh history reference", async () => {
    const asOf = Date.UTC(2026, 10, 22, 12)
    const account = buildSiteAccount({ id: "stale-account" })
    const scope = accountBalanceScope({
      baseUrl: account.site_url,
      accountId: account.id,
    })
    const wallet = balancePosition({
      id: "wallet",
      scope,
      source: {
        adapter: "fixture",
        operation: "wallet",
        contractVersion: "1",
        kind: "reported",
      },
      asset: { kind: "currency", code: CURRENCIES.USD },
      value: "15",
      observedAt: asOf - 86_400_000,
    })
    wallet.amount = {
      ...wallet.amount,
      status: "stale",
    } as typeof wallet.amount
    account.account_info.balance = accountBalanceSnapshot(
      scope,
      [wallet],
      asOf,
      "partial",
    )

    expect(
      await maybeCaptureAccountReferenceBalance({
        account,
        source: "refresh",
        asOf,
      }),
    ).toBe(false)
    expect(upsertSnapshotMock).not.toHaveBeenCalled()
  })

  it.each([0, 1])(
    "keeps independent wallets out of one reference series when wallet %s is unreadable",
    async (missing) => {
      const asOf = Date.UTC(2026, 10, 22, 12)
      const account = buildSiteAccount({ id: "multiple-wallets" })
      const scope = accountBalanceScope({
        baseUrl: account.site_url,
        accountId: account.id,
      })
      const wallets = ["20", "70"].map((value, index) =>
        balancePosition({
          id: "wallet",
          scope: { ...scope, walletId: String(index) },
          source: {
            adapter: "fixture",
            operation: "wallet",
            contractVersion: "1",
            kind: "reported",
          },
          asset: { kind: "currency", code: CURRENCIES.USD },
          value: index === missing ? undefined : value,
          observedAt: asOf,
        }),
      )
      account.account_info.balance = accountBalanceSnapshot(
        scope,
        wallets,
        asOf,
        "partial",
      )
      expect(
        await maybeCaptureAccountReferenceBalance({
          account,
          source: "refresh",
          asOf,
        }),
      ).toBe(false)
      expect(upsertSnapshotMock).not.toHaveBeenCalled()
    },
  )

  it.each([
    { currency: CURRENCIES.USD, count: 1, expected: true },
    { currency: CURRENCIES.CNY, count: 1, expected: false },
    { currency: CURRENCIES.USD, count: 2, expected: false },
  ])(
    "writes a reference only for one USD wallet ($currency, $count)",
    async ({ currency, count, expected }) => {
      const asOf = new Date(2026, 10, 22, 12).getTime()
      const account = buildSiteAccount({ id: "account-1" })
      const scope = accountBalanceScope({
        baseUrl: account.site_url,
        accountId: account.id,
      })
      const wallets = Array.from({ length: count }, (_, index) =>
        balancePosition({
          id: "wallet",
          scope: { ...scope, walletId: String(index) },
          source: {
            adapter: "fixture",
            operation: "wallet",
            contractVersion: "1",
            kind: "reported",
          },
          asset: { kind: "currency", code: currency },
          value: "15",
          observedAt: asOf,
        }),
      )
      account.account_info.balance = accountBalanceSnapshot(
        scope,
        wallets,
        asOf,
        "complete",
      )
      account.account_info.today_income = 100_000
      account.account_info.today_quota_consumption = 200_000
      expect(
        await maybeCaptureAccountReferenceBalance({
          account,
          source: "refresh",
          asOf,
        }),
      ).toBe(expected)
      if (!expected) {
        expect(upsertSnapshotMock).not.toHaveBeenCalled()
        return
      }
      expect(upsertSnapshotMock).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: account.id,
          dayKey: "2026-11-22",
          snapshot: {
            quota: 7_500_000,
            today_income: null,
            today_quota_consumption: null,
            capturedAt: asOf,
            source: "refresh",
          },
        }),
      )
    },
  )
})
