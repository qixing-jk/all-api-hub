import { beforeEach, describe, expect, it, vi } from "vitest"

import { maybeCaptureDailyBalanceSnapshot } from "~/services/history/dailyBalanceHistory/capture"
import type { AccountTodayStatsAvailability } from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"

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

const capture = (todayStatsAvailability: AccountTodayStatsAvailability) =>
  maybeCaptureDailyBalanceSnapshot({
    config: {
      ...DEFAULT_BALANCE_HISTORY_PREFERENCES,
      enabled: true,
    },
    accountId: "account-1",
    quota: 1_000_000,
    today_income: 200_000,
    today_quota_consumption: 300_000,
    todayStatsAvailability,
    source: "refresh",
    capturedAtMs: Date.UTC(2026, 4, 23, 12),
    timeZone: "UTC",
  })

describe("maybeCaptureDailyBalanceSnapshot", () => {
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
