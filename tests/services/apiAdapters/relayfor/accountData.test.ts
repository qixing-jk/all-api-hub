import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { getSiteDayReadings } from "~/services/accounts/metrics/accountTodayStats"
import {
  aggregateBalances,
  BALANCE_PURPOSES,
} from "~/services/accounts/metrics/balanceProjection"
import { getDisplayConsumptionProjection } from "~/services/accounts/metrics/consumptionProjection"
import { relayForAccountData } from "~/services/apiAdapters/relayfor/accountData"
import {
  fetchRelayForOverview,
  fetchRelayForTimedQuotas,
} from "~/services/apiService/relayfor"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  AuthTypeEnum,
} from "~/types"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

vi.mock("~/services/apiService/relayfor", () => ({
  fetchRelayForOverview: vi.fn(),
  fetchRelayForTimedQuotas: vi.fn().mockResolvedValue([]),
}))

const baseUrl = "https://relayfor.xyz"

const createRequest = (overrides = {}) => ({
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl,
  accountId: "relayfor-test",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "test-token",
  },
  checkIn: buildCheckInConfig(),
  ...overrides,
})

describe("relayForAccountData", () => {
  it("retains timed grant scope and receipt time with one parent wallet collection", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-19T06:00:00Z"))
    try {
      vi.mocked(fetchRelayForOverview).mockResolvedValueOnce({
        user: { id: 1, username: "alice", quota: 0 },
        timed_quota: 1000000,
      } as never)
      vi.mocked(fetchRelayForTimedQuotas).mockImplementationOnce(async () => {
        vi.setSystemTime(new Date("2026-11-19T06:01:00Z"))
        return [
          {
            status: 1,
            quota_remaining: 500000,
            quota_group: "premium",
            expires_at: "2099-02-01",
          },
        ]
      })
      const data = await relayForAccountData.fetchData(createRequest())
      const grant = data.balance?.positions.find((p) =>
        p.id.startsWith("timed-grant:"),
      )
      expect(grant?.amount).toMatchObject({
        observedAt: Date.parse("2026-11-19T06:01:00Z"),
        source: { inputs: ["/api/user/timed-quotas"] },
      })
      expect(grant?.scope.groups).toEqual({
        kind: "restricted",
        ids: ["premium"],
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("retains active plans with indeterminate provider timing as a partial collection", async () => {
    vi.mocked(fetchRelayForOverview).mockResolvedValueOnce({
      user: { id: 1, username: "alice", quota: 0 },
      active_subscriptions: [
        {
          status: 1,
          plan_name: "Zone-less",
          starts_at: "2026-11-19",
          expires_at: "2099-02-01",
          quota_remaining: 500000,
          quota_total: 1000000,
        },
      ],
    } as never)
    const data = await relayForAccountData.fetchData(createRequest())
    expect(data.allowances?.entries).toHaveLength(1)
    expect(data.allowances?.coverage).toBe("partial")
  })
  it("keeps overview provider-day spending available to daily presentation without inventing a local-day window", async () => {
    vi.mocked(fetchRelayForOverview).mockResolvedValueOnce({
      user: { id: 1, quota: 940000 },
      timed_quota: 0,
      group_quotas: [],
      today: { quota: 500000, requests: 4, tokens: 100 },
    } as never)
    const data = await relayForAccountData.fetchData(createRequest())
    expect(getSiteDayReadings(data)).toMatchObject([
      {
        lastKnown: false,
        observedAt: expect.any(Number),
        usage: {
          scope: ACCOUNT_USAGE_SCOPES.SiteToday,
          cost: {
            asset: { kind: "currency", code: "USD" },
            amount: { status: "known", value: "1" },
          },
        },
      },
    ])
    expect(
      getDisplayConsumptionProjection([
        { id: "relayfor-test", settledConsumption: data.settledConsumption },
      ]).groups,
    ).toEqual([])
  })
  it("includes permanent and timed funds reported together in the available total", async () => {
    vi.mocked(fetchRelayForOverview).mockResolvedValueOnce({
      user: { id: 1, quota: 940000 },
      timed_quota: 1880000,
      group_quotas: [],
    } as never)
    const result = await relayForAccountData.fetchData(createRequest())
    expect(
      aggregateBalances([result.balance!], BALANCE_PURPOSES.Available),
    ).toMatchObject({
      amounts: [{ asset: { kind: "currency", code: "USD" }, value: "5.64" }],
      conflictCount: 0,
    })
    expect(
      result
        .balanceRefreshParts!.flatMap((p) => p.positions)
        .filter((p) => ["permanent", "timed"].includes(p.id)),
    ).toHaveLength(2)
  })
  it("isolates native unit-normalization overflow from independent wallet entries", async () => {
    vi.mocked(fetchRelayForOverview).mockResolvedValueOnce({
      user: { id: 1, quota: "0." + "0".repeat(252) + "1" },
      timed_quota: 0,
      group_quotas: [{ quota_group: "premium", quota: "500000" }],
    } as never)
    const result = await relayForAccountData.fetchData(createRequest())
    expect(
      result.balance?.positions.find((entry) => entry.id === "permanent")
        ?.amount.status,
    ).toBe("unavailable")
    expect(
      result.balance?.positions.find((entry) => entry.id === "group:premium")
        ?.amount,
    ).toMatchObject({ status: "known", value: "1" })
  })
  it("keeps wallet debt, scoped groups and plan limits without inventing a combined balance", async () => {
    vi.mocked(fetchRelayForOverview).mockResolvedValueOnce({
      user: { id: 1, username: "alice", quota: "-1000000.000000000005" },
      timed_quota: 500000,
      group_quotas: [{ quota_group: "premium", quota: "1250000" }],
      active_subscriptions: [
        {
          id: 12,
          status: 1,
          starts_at: "2020-01-01T00:00:00Z",
          expires_at: "2099-01-01T00:00:00Z",
          unlimited_quota: true,
          quota_group: "premium",
        },
      ],
    } as never)
    vi.mocked(fetchRelayForTimedQuotas).mockRejectedValueOnce(
      new Error("offline"),
    )
    const data = await relayForAccountData.fetchData(createRequest())
    expect(data).not.toHaveProperty("quota")
    expect(data).not.toHaveProperty("nativeBalance")
    expect(data.balance?.positions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "permanent",
          amount: expect.objectContaining({ value: "-2.00000000000000001" }),
        }),
        expect.objectContaining({
          id: "group:premium",
          scope: expect.objectContaining({
            groups: { kind: "restricted", ids: ["premium"] },
          }),
          amount: expect.objectContaining({ value: "2.5" }),
        }),
      ]),
    )
    expect(data.allowances?.entries[0]).toMatchObject({
      id: "12",
      constraint: { limitState: "unlimited", remaining: { status: "unknown" } },
    })
    expect(data.balanceRefreshParts).toContainEqual(
      expect.objectContaining({
        collectionKey: "timed-grants",
        enumeration: "unavailable",
      }),
    )
  })
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("retains active scoped grants and keeps timezone-free expiry unknown", async () => {
    vi.mocked(fetchRelayForOverview).mockResolvedValueOnce({
      user: { id: 1, username: "alice", quota: 0 },
      timed_quota: 1000000,
      group_quotas: [
        null,
        { quota: "bad" },
        { quota: 500000, quota_group: "premium" },
      ],
    } as never)
    vi.mocked(fetchRelayForTimedQuotas).mockResolvedValueOnce([
      null,
      { status: 2, quota_remaining: 500000, expires_at: "2099-01-01" },
      { status: 1, quota_remaining: 1, expires_at: "invalid" },
      {
        status: 1,
        quota_remaining: 500000,
        expires_at: "2099-02-01",
        quota_group: "premium",
      },
      { status: 1, quota_remaining: 250000, expires_at: "2099-01-01" },
    ])
    const data = await relayForAccountData.fetchData(createRequest())
    const grants = data.balance?.positions.filter(
      (position) => position.collectionKey === "timed-grants",
    )
    expect(grants).toHaveLength(3)
    expect(grants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amount: expect.objectContaining({ value: "0.5" }),
          validity: { kind: "unknown" },
        }),
        expect.objectContaining({
          amount: expect.objectContaining({ value: "1" }),
          scope: expect.objectContaining({
            groups: { kind: "restricted", ids: ["premium"] },
          }),
        }),
      ]),
    )
    expect(data.balanceRefreshParts).toContainEqual(
      expect.objectContaining({
        collectionKey: "timed-grants",
        enumeration: "partial",
      }),
    )
    expect(data.balance?.positions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "group:premium",
          amount: expect.objectContaining({ value: "1" }),
        }),
      ]),
    )
  })

  it("maps balance, lifetime usage and today's activity from /api/user/overview", async () => {
    vi.mocked(fetchRelayForOverview).mockResolvedValueOnce({
      user: { id: 1, username: "relayuser", quota: 1000000, role: 1 },
      total_quota: 1500000,
      timed_quota: 500000,
      requests: 50,
      token_count: 25000,
      today: {
        requests: 5,
        tokens: 2500,
        quota: 10000,
      },
    })

    const data = await relayForAccountData.fetchData(createRequest())

    expect(data.balance?.positions[0]?.amount).toMatchObject({ value: "2" })
    expect(data.today_quota_consumption).toBe(0)
    expect(data.today_requests_count).toBe(5)
    expect(data.today_completion_tokens).toBe(2500)
    expect(data.today_prompt_tokens).toBe(0)
    expect(data.todayStatsAvailability).toEqual({
      consumption: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
      },
      requests: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
      tokens: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
      income: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
      },
    })
    expect(data.usage).toMatchObject({
      scope: ACCOUNT_USAGE_SCOPES.Lifetime,
      totalRequests: 50,
      totalTokens: 25000,
      cost: {
        asset: { kind: "currency", code: "USD" },
        amount: { value: "3" },
      },
    })
  })
})
