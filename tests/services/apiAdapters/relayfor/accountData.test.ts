import { beforeEach, describe, expect, it, vi } from "vitest"

import { relayForAccountData } from "~/services/apiAdapters/relayfor/accountData"
import { fetchRelayForOverview } from "~/services/apiService/relayfor"
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
