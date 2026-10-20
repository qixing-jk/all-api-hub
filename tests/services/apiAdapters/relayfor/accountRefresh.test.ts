import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchRelayForAccountData } from "~/services/apiAdapters/relayfor/accountData"
import { relayForAccountRefresh } from "~/services/apiAdapters/relayfor/accountRefresh"
import { ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

vi.mock("~/services/apiAdapters/relayfor/accountData", () => ({
  fetchRelayForAccountData: vi.fn(),
}))

const request = {
  baseUrl: "https://relayfor.xyz",
  accountId: "acc-1",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token-123" },
  checkIn: buildCheckInConfig(),
}

it("keeps native check-in discovery available during refresh", async () => {
  await expect(
    relayForAccountRefresh.fetchCheckInSupport!(request),
  ).resolves.toBe(true)
})

describe("relayForAccountRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns healthy result when account data fetch succeeds", async () => {
    vi.mocked(fetchRelayForAccountData).mockResolvedValueOnce({
      quota: 500000,
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
      todayStatsAvailability: {} as never,
      checkIn: request.checkIn,
    })

    const result = await relayForAccountRefresh.refreshAccount(request)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.quota).toBe(500000)
      expect(result.healthStatus.status).toBe(SiteHealthStatus.Healthy)
    }
  })

  it("returns unhealthy result when account data fetch fails", async () => {
    vi.mocked(fetchRelayForAccountData).mockRejectedValueOnce(
      new ApiError("Unauthorized", 401),
    )

    const result = await relayForAccountRefresh.refreshAccount(request)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.healthStatus.status).toBe(SiteHealthStatus.Warning)
    }
  })
})
