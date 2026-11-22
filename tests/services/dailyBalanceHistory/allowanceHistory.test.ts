import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { accountAllowanceObservation } from "~/services/accounts/allowances"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { budgetConstraint } from "~/services/amounts/budgets"
import {
  ASSET_KINDS,
  BALANCE_VALIDITY_KINDS,
  BUDGET_LIMIT_STATES,
  BUDGET_PERIODS,
  BUDGET_WINDOW_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
} from "~/services/amounts/financialConstants"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { maybeCaptureDailyBalanceSnapshot } from "~/services/history/dailyBalanceHistory/capture"
import { buildFinancialHistorySeries } from "~/services/history/dailyBalanceHistory/selectors"
import { dailyBalanceHistoryStorage } from "~/services/history/dailyBalanceHistory/storage"
import { DAILY_BALANCE_HISTORY_CAPTURE_SOURCES } from "~/types/dailyBalanceHistory"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"

const { values } = vi.hoisted(() => ({ values: new Map<string, unknown>() }))
vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    async get(key: string) {
      return values.get(key)
    }
    async set(key: string, value: unknown) {
      values.set(key, value)
    }
  },
}))

const scope = accountBalanceScope({
  baseUrl: "https://plans.example",
  accountId: "plans",
})
const source = {
  adapter: "fixture",
  operation: "plans",
  contractVersion: "1",
  kind: EVIDENCE_KINDS.Reported,
}
const now = new Date(2026, 1, 7, 12).getTime()
const allowances = (remaining: string | undefined, capturedAt = now) =>
  accountAllowanceObservation(
    scope,
    [
      {
        source,
        collectionKey: "plans",
        enumeration: FINANCIAL_ENUMERATION.Complete,
        entries:
          remaining === undefined
            ? []
            : ["day", "week"].map((period, index) => ({
                id: `plan:${period}`,
                identityKind: "upstream" as const,
                collectionKey: "plans",
                label: period,
                validity: { kind: BALANCE_VALIDITY_KINDS.Unknown },
                constraint: budgetConstraint({
                  source,
                  scope,
                  asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
                  observedAt: capturedAt,
                  limitState: BUDGET_LIMIT_STATES.Finite,
                  remaining: index ? "90" : remaining,
                  window: {
                    kind: BUDGET_WINDOW_KINDS.Unknown,
                    period: period as (typeof BUDGET_PERIODS)["Day" | "Week"],
                  },
                }),
              })),
      },
    ],
    capturedAt,
  ).allowances

beforeEach(() => {
  values.clear()
  vi.setSystemTime(now)
})
afterEach(() => vi.useRealTimers())

it.each([
  {
    allowances: allowances("20"),
    endedPositionKeys: ["missing-wallet-clock"],
  },
  {
    balance: accountBalanceSnapshot(
      scope,
      [],
      now,
      FINANCIAL_COVERAGE.Complete,
    ),
    endedAllowanceKeys: ["missing-allowance-clock"],
  },
])(
  "preserves a malformed imported receipt whose end marker has no observation clock",
  async (snapshot) => {
    const imported = {
      schemaVersion: 4,
      referenceSnapshotsByAccountId: {},
      financialSnapshotsByAccountId: {
        plans: [{ ...snapshot, source: "refresh" }],
      },
    }
    values.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, imported)

    await expect(dailyBalanceHistoryStorage.getStore()).rejects.toThrow()
    expect(
      await dailyBalanceHistoryStorage.pruneAll({ retentionDays: 30 }),
    ).toBe(false)
    expect(values.get(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE)).toEqual(
      imported,
    )
  },
)

it("captures an allowance-only account with simultaneous windows and ends removed plans without fabricating funds", async () => {
  const old = {
    schemaVersion: 4,
    referenceSnapshotsByAccountId: {
      old: {
        "2026-01-01": {
          balanceUsd: 1,
          incomeUsd: null,
          consumptionUsd: null,
          capturedAt: now,
          source: "refresh",
        },
      },
    },
  }
  values.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, old)
  expect(
    await maybeCaptureDailyBalanceSnapshot({
      accountId: "plans",
      allowances: allowances("20"),
      generation: 1,
      source: "refresh",
    }),
  ).toBe(true)
  expect(
    await maybeCaptureDailyBalanceSnapshot({
      accountId: "plans",
      allowances: allowances(undefined, now + 1000),
      generation: 2,
      source: "refresh",
    }),
  ).toBe(true)
  const store = await dailyBalanceHistoryStorage.getStore()
  expect(store.schemaVersion).toBe(4)
  expect(store.referenceSnapshotsByAccountId).toEqual(
    old.referenceSnapshotsByAccountId,
  )
  expect(
    store.financialSnapshotsByAccountId?.plans?.[0]?.balance,
  ).toBeUndefined()
  expect(
    store.financialSnapshotsByAccountId?.plans?.[0]?.allowances?.entries,
  ).toHaveLength(2)
  expect(
    store.financialSnapshotsByAccountId?.plans?.[1]?.endedAllowanceKeys,
  ).toHaveLength(2)
  const day = getDayKeyFromUnixSeconds(now / 1000)
  const report = buildFinancialHistorySeries({
    store,
    accountIds: ["plans"],
    startDayKey: day,
    endDayKey: day,
    asOf: now + 2000,
  })
  expect(report.series).toHaveLength(2)
  expect(
    report.series.map((series) =>
      series.observations.map((point) => [point.status, point.value]),
    ),
  ).toEqual([
    [
      ["known", "20"],
      ["ended", null],
    ],
    [
      ["known", "90"],
      ["ended", null],
    ],
  ])
  expect(
    report.series
      .flatMap((series) => series.observations)
      .every((point) => point.netInflow === undefined),
  ).toBe(true)
})

it("records a reported reset without inventing a period boundary and keeps unlimited as a nonnumeric state", async () => {
  const finite = allowances("20")
  finite.entries[0]!.constraint.window = {
    kind: BUDGET_WINDOW_KINDS.Rolling,
    period: BUDGET_PERIODS.Day,
    resetsAt: now + 1000,
  }
  const unlimited = allowances("20", now + 2000)
  unlimited.entries[0]!.constraint = budgetConstraint({
    scope,
    source,
    observedAt: now + 2000,
    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
    limitState: BUDGET_LIMIT_STATES.Unlimited,
    window: {
      kind: BUDGET_WINDOW_KINDS.Rolling,
      period: BUDGET_PERIODS.Day,
      resetsAt: now + 3000,
    },
  })
  for (const [index, observation] of [finite, unlimited].entries())
    await maybeCaptureDailyBalanceSnapshot({
      accountId: "plans",
      allowances: observation,
      generation: index + 1,
      source: DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh,
    })
  const store = await dailyBalanceHistoryStorage.getStore()
  const day = getDayKeyFromUnixSeconds(now / 1000)
  const report = buildFinancialHistorySeries({
    store,
    accountIds: ["plans"],
    startDayKey: day,
    endDayKey: day,
    asOf: now + 2500,
  })
  const daily = report.series.find((item) => item.allowance?.label === "day")!
  expect(
    daily.observations.map((point) => [point.status, point.value]),
  ).toEqual([
    ["known", "20"],
    ["reset", null],
    ["known", null],
  ])
  expect(daily.observations.at(-1)?.allowance?.constraint.limitState).toBe(
    "unlimited",
  )
  expect(daily.position.window).toBeUndefined()
})
