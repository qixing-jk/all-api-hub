import { beforeEach, describe, expect, it, vi } from "vitest"

import { loadSub2ApiDashboardEstimateData } from "~/services/apiAdapters/sub2api/dashboardEstimates"
import {
  fetchAccountTokens,
  fetchSub2ApiAvailableGroups,
  fetchSub2ApiGroupRates,
} from "~/services/apiService/sub2api"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiService/sub2api", () => ({
  fetchAccountTokens: vi.fn(),
  fetchSub2ApiAvailableGroups: vi.fn(),
  fetchSub2ApiGroupRates: vi.fn(),
}))

const request: ApiServiceRequest = {
  baseUrl: "https://sub2api.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "1",
    accessToken: "dashboard-jwt",
  },
}

describe("loadSub2ApiDashboardEstimateData", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads dashboard groups, group rates, and account tokens", async () => {
    const groups = [{ id: 9, name: "vip" }]
    const groupRates = { "9": 2 }
    const accountTokens = [
      {
        id: 1,
        user_id: 1,
        key: "sub2api-key",
        name: "VIP Key",
        status: 1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
      },
    ]

    vi.mocked(fetchSub2ApiAvailableGroups).mockResolvedValueOnce(groups)
    vi.mocked(fetchSub2ApiGroupRates).mockResolvedValueOnce(groupRates)
    vi.mocked(fetchAccountTokens).mockResolvedValueOnce(accountTokens)

    await expect(loadSub2ApiDashboardEstimateData(request)).resolves.toEqual({
      groups,
      groupRates,
      accountTokens,
    })
    expect(fetchSub2ApiAvailableGroups).toHaveBeenCalledWith(request)
    expect(fetchSub2ApiGroupRates).toHaveBeenCalledWith(request)
    expect(fetchAccountTokens).toHaveBeenCalledWith(request)
  })

  it("rejects when any dashboard estimate source fails", async () => {
    const error = new Error("dashboard unavailable")

    vi.mocked(fetchSub2ApiAvailableGroups).mockResolvedValueOnce([])
    vi.mocked(fetchSub2ApiGroupRates).mockRejectedValueOnce(error)
    vi.mocked(fetchAccountTokens).mockResolvedValueOnce([])

    await expect(loadSub2ApiDashboardEstimateData(request)).rejects.toBe(error)
  })
})
