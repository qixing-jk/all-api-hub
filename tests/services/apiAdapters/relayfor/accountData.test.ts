import { beforeEach, describe, expect, it, vi } from "vitest"

import { relayForAccountData } from "~/services/apiAdapters/relayfor/accountData"
import {
  fetchRelayForOverview,
  fetchRelayForTimedQuotas,
} from "~/services/apiService/relayfor"
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
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("filters invalid grants and sorts active scoped grants by expiry", async () => {
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
    expect(
      data.nativeBalance?.unit === "USD"
        ? data.nativeBalance.timedDetails
        : undefined,
    ).toEqual([
      expect.objectContaining({
        amount: 0.5,
        expiresAt: "2099-01-01",
        scope: undefined,
      }),
      expect.objectContaining({
        amount: 1,
        expiresAt: "2099-02-01",
        scope: "premium",
      }),
    ])
    expect(
      data.nativeBalance?.unit === "USD"
        ? data.nativeBalance.components?.filter((c) => c.kind === "group")
        : undefined,
    ).toEqual([expect.objectContaining({ amount: 1, scope: "premium" })])
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

    expect(data.quota).toBe(1000000)
    expect(data.today_quota_consumption).toBe(10000)
    expect(data.today_requests_count).toBe(5)
    expect(data.today_completion_tokens).toBe(2500)
    expect(data.today_prompt_tokens).toBe(0)
    expect(data.todayStatsAvailability).toEqual({
      consumption: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
      requests: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
      tokens: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
      income: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
      },
    })
    expect(data.usage).toEqual({
      scope: "lifetime",
      totalRequests: 50,
      totalTokens: 25000,
      totalCost: 3,
    })
  })
})
