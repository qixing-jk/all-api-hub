import { beforeEach, describe, expect, it, vi } from "vitest"

import { voApiV2AccountRefresh } from "~/services/apiAdapters/voapiV2/accountRefresh"

const { mockFetchSupportCheckIn, mockRefreshAccountData } = vi.hoisted(() => ({
  mockFetchSupportCheckIn: vi.fn(),
  mockRefreshAccountData: vi.fn(),
}))

vi.mock("~/services/apiService/voapiV2", () => ({
  fetchSupportCheckIn: mockFetchSupportCheckIn,
  refreshAccountData: mockRefreshAccountData,
}))

const request = {
  baseUrl: "https://voapi.example.invalid",
  accountId: "account-1",
  auth: {
    authType: "accessToken",
    accessToken: "dashboard-jwt",
  },
} as any

describe("voApiV2AccountRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates support probing and account refresh to VoAPI v2 service helpers", async () => {
    const refreshResult = {
      success: true,
      data: {
        quota: 1,
      },
    }
    mockFetchSupportCheckIn.mockResolvedValueOnce(true)
    mockRefreshAccountData.mockResolvedValueOnce(refreshResult)

    await expect(
      voApiV2AccountRefresh.fetchCheckInSupport?.(request),
    ).resolves.toBe(true)
    await expect(voApiV2AccountRefresh.refreshAccount(request)).resolves.toBe(
      refreshResult,
    )

    expect(mockFetchSupportCheckIn).toHaveBeenCalledWith(request)
    expect(mockRefreshAccountData).toHaveBeenCalledWith(request)
  })
})
