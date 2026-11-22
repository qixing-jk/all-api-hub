import { describe, expect, it, vi } from "vitest"

import { CURRENCIES } from "~/constants/money"
import { createBalanceHistoryPreview } from "~/features/BalanceHistory/data/createBalanceHistoryPreview"
import { useBalanceHistoryViewModel } from "~/features/BalanceHistory/workspace/useBalanceHistoryViewModel"
import { REPORT_PREVIEW_SCENARIOS } from "~/features/DevPanel/reportPreviewScenarios"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition, observeAmount } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  FINANCIAL_SETTLEMENT_STATUSES,
  INCOME_CLASSIFICATIONS,
} from "~/services/amounts/financialConstants"
import { DAILY_BALANCE_HISTORY_METRICS } from "~/services/history/dailyBalanceHistory/constants"
import {
  getDayKeyFromUnixSeconds,
  subtractDaysFromDayKey,
} from "~/utils/core/dayKey"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

it("builds the mixed preview with archived days, native balances and distinct activity", () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  try {
    const now = new Date(2026, 10, 2, 12).getTime()
    vi.setSystemTime(now)
    const { accounts, store } = createBalanceHistoryPreview(
      REPORT_PREVIEW_SCENARIOS.Mixed,
    )
    const accountIds = accounts.map(({ id }) => id)
    const [first, second, quota] = accountIds
    expect(Object.keys(store.referenceSnapshotsByAccountId)).toEqual([
      first,
      second,
    ])
    expect(
      Object.keys(store.referenceSnapshotsByAccountId[first!]!),
    ).toHaveLength(6)
    const snapshots = store.financialSnapshotsByAccountId!
    expect(snapshots[first!]).toHaveLength(20)
    expect(snapshots[first!]?.at(-1)).toMatchObject({
      balance: {
        capturedAt: now,
        positions: expect.arrayContaining([
          expect.objectContaining({ id: "bonus-credits" }),
        ]),
      },
      reportedIncome: [
        expect.objectContaining({
          amount: expect.objectContaining({ value: "2.5" }),
        }),
      ],
    })
    expect(snapshots[second!]?.at(-1)?.settledConsumption).toEqual([
      expect.objectContaining({
        amount: expect.objectContaining({ value: "0.42" }),
      }),
    ])
    expect(snapshots[quota!]?.at(-1)?.balance?.positions[0]?.asset.kind).toBe(
      "quota",
    )
  } finally {
    vi.useRealTimers()
  }
})

function activityPreview() {
  const preview = createBalanceHistoryPreview(REPORT_PREVIEW_SCENARIOS.Empty)
  preview.accounts = preview.accounts.slice(0, 2)
  const now = Date.now()
  const start = new Date(now).setHours(0, 0, 0, 0)
  preview.accounts.forEach((account, index) => {
    const scope = accountBalanceScope({
      baseUrl: account.site_url,
      accountId: account.id,
    })
    const asset = {
      kind: ASSET_KINDS.Currency,
      code: index ? CURRENCIES.CNY : CURRENCIES.USD,
    } as const
    const source = {
      adapter: "fixture",
      operation: "cashflow",
      contractVersion: "1",
      kind: "reported" as const,
    }
    const observation = {
      asset,
      scope,
      window: {
        start,
        end: now,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      coverage: "complete" as const,
    }
    preview.store.financialSnapshotsByAccountId![account.id] = [
      {
        source: "refresh",
        balance: accountBalanceSnapshot(
          scope,
          [
            balancePosition({
              id: "wallet",
              scope,
              asset,
              value: index ? "9" : "8",
              source,
              observedAt: now,
            }),
          ],
          now,
          "complete",
        ),
        reportedIncome: [
          {
            ...observation,
            amount: observeAmount(index ? "31" : "4", source, now),
            classification: INCOME_CLASSIFICATIONS.Unclassified,
          },
        ],
        settledConsumption: [
          {
            ...observation,
            amount: observeAmount(index ? "3" : "2", source, now),
            settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
          },
        ],
      },
    ]
  })
  const today = getDayKeyFromUnixSeconds(now / 1000)
  preview.store.referenceSnapshotsByAccountId[preview.accounts[0]!.id] = {
    [subtractDaysFromDayKey(today, 1)]: {
      balanceUsd: 10,
      incomeUsd: 1.25,
      consumptionUsd: 0.75,
      capturedAt: now - 86_400_000,
      source: "refresh",
    },
  }
  return preview
}

describe("Balance History native metric workflow", () => {
  it.each([
    DAILY_BALANCE_HISTORY_METRICS.Income,
    "consumption",
    "site-day",
  ] as const)(
    "allows filtering an account with only in-range %s history",
    async (kind) => {
      const preview = activityPreview()
      const account = preview.accounts[0]!
      const snapshot =
        preview.store.financialSnapshotsByAccountId![account.id]![0]!
      const charge = snapshot.settledConsumption![0]!
      snapshot.balance = undefined
      snapshot.reportedIncome =
        kind === "income" ? snapshot.reportedIncome : undefined
      snapshot.settledConsumption =
        kind === "consumption" ? [charge] : undefined
      snapshot.reportedDayCosts =
        kind === "site-day"
          ? [
              {
                asset: charge.asset,
                amount: charge.amount,
                scope: charge.scope,
                window: charge.window,
                dayKey: getDayKeyFromUnixSeconds(charge.window.start / 1000),
              },
            ]
          : undefined
      preview.store.referenceSnapshotsByAccountId = {}
      preview.store.financialSnapshotsByAccountId = { [account.id]: [snapshot] }
      const { result } = renderHook(() => useBalanceHistoryViewModel(preview))
      await waitFor(() => expect(result.current.nativeActivity).toHaveLength(1))
      expect(
        result.current.accountOptions.find(({ value }) => value === account.id)
          ?.disabled,
      ).toBe(false)
      expect(
        result.current.accountOptions.find(
          ({ value }) => value === preview.accounts[1]!.id,
        )?.disabled,
      ).toBe(true)
      act(() => {
        result.current.setSelectedAccountIds([account.id])
        result.current.selectBreakdownMetric(
          kind === "income"
            ? DAILY_BALANCE_HISTORY_METRICS.Income
            : DAILY_BALANCE_HISTORY_METRICS.Outcome,
        )
      })
      expect(result.current.breakdownData.values).toEqual([
        kind === "income" ? 4 : 2,
      ])
      act(() => {
        result.current.setSelectedAccountIds([])
        result.current.setEndDayKey(
          subtractDaysFromDayKey(result.current.maxDayKey, 1),
        )
      })
      expect(
        result.current.accountOptions.find(({ value }) => value === account.id)
          ?.disabled,
      ).toBe(true)
    },
  )

  it.each([
    ["income", 4, 31],
    ["consumption", 2, 3],
    ["change", 2, 28],
  ])(
    "keeps %s selected when account filtering changes the available asset group",
    async (kind, usd, cny) => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(new Date(2026, 10, 2, 12))
      try {
        const preview = activityPreview()
        const { result } = renderHook(() => useBalanceHistoryViewModel(preview))
        await waitFor(() =>
          expect(result.current?.nativeMetrics?.length).toBeGreaterThan(0),
        )
        const metric = result.current.nativeMetrics.find(
          (metric) =>
            metric.kind === kind && metric.currencyCode === CURRENCIES.USD,
        )!
        act(() => {
          result.current.selectTrendMetric(metric.key)
          result.current.selectBreakdownMetric(metric.key)
        })
        expect(result.current.breakdownData.values).toEqual([usd])
        act(() =>
          result.current.setSelectedAccountIds([preview.accounts[1]!.id]),
        )
        expect(result.current.nativeTrend?.currencyCode).toBe("CNY")
        expect(result.current.nativeTrend?.kind).toBe(kind)
        expect(result.current.trendOption.series).toContainEqual(
          expect.objectContaining({ data: [cny] }),
        )
        expect(result.current.breakdownData.values).toEqual([cny])
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it("routes common metrics by the selected currency and preserves explicit archive access", async () => {
    const preview = activityPreview()
    const { result } = renderHook(() => useBalanceHistoryViewModel(preview))
    await waitFor(() =>
      expect(result.current?.nativeMetrics?.length).toBeGreaterThan(0),
    )
    act(() => {
      result.current.selectTrendMetric(DAILY_BALANCE_HISTORY_METRICS.Income)
      result.current.selectBreakdownMetric(
        DAILY_BALANCE_HISTORY_METRICS.Outcome,
      )
    })
    expect(result.current.nativeTrend?.currencyCode).toBe("USD")
    expect(result.current.breakdownData.values).toEqual([2])
    act(() => result.current.handleCurrencyChange(CURRENCIES.CNY))
    expect(result.current.nativeTrend?.currencyCode).toBe("CNY")
    expect(result.current.trendOption.series).toContainEqual(
      expect.objectContaining({ data: [31] }),
    )
    expect(result.current.breakdownData.values).toEqual([3])
    act(() => {
      result.current.handleCurrencyChange(CURRENCIES.USD)
      result.current.selectTrendMetric("reference:income")
      result.current.selectBreakdownMetric("reference:outcome")
    })
    expect(result.current.nativeTrend).toBeUndefined()
    expect(result.current.trendOption.series).toContainEqual(
      expect.objectContaining({
        data: expect.arrayContaining([1.25]),
      }),
    )
    expect(result.current.breakdownData.values).toEqual([0.75])
  })
})
