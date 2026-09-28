import { beforeEach, describe, expect, it, vi } from "vitest"

import { QUOTA_PER_USD } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import {
  getOrCreateAccessToken as fetchRixApiAccessToken,
  fetchAccountData as fetchRixApiAccountData,
  fetchAccountQuota as fetchRixApiAccountQuota,
  fetchUserInfo as fetchRixApiUserInfo,
  refreshAccountData as refreshRixApiAccountData,
} from "~/services/apiService/newApiFamily/variants/rixApi"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const {
  mockData,
  mockFetchTodayIncome,
  mockFetchTodayUsage,
  mockGetTodayTimestampRange,
  mockRefreshSelectedStatus,
} = vi.hoisted(() => ({
  mockData: vi.fn(),
  mockFetchTodayIncome: vi.fn(),
  mockFetchTodayUsage: vi.fn(),
  mockGetTodayTimestampRange: vi.fn(),
  mockRefreshSelectedStatus: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: { data: mockData },
}))

vi.mock("~/services/apiService/newApiFamily/default/accountData", () => ({
  fetchTodayIncome: mockFetchTodayIncome,
  fetchTodayUsage: mockFetchTodayUsage,
}))

vi.mock("~/services/apiService/newApiFamily/default/accountDataUtils", () => ({
  getTodayTimestampRange: mockGetTodayTimestampRange,
}))

vi.mock("~/services/checkin/autoCheckin/refresh", () => ({
  refreshSelectedStatus: mockRefreshSelectedStatus,
}))

const request = {
  baseUrl: "https://rix.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.Cookie,
    userId: "rix-owner",
  },
}

const timestampRange = { start: 111, end: 222 }

describe("Rix API account data variant", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTodayTimestampRange.mockReturnValue(timestampRange)
    mockFetchTodayUsage.mockResolvedValue({
      today_quota_consumption: 1,
      today_prompt_tokens: 2,
      today_completion_tokens: 3,
      today_requests_count: 4,
      todayStatsAvailability: {
        consumption: { status: "complete" },
        requests: { status: "complete" },
        tokens: { status: "complete" },
      },
    })
    mockFetchTodayIncome.mockResolvedValue({
      today_income: 5,
      todayStatsAvailability: { income: { status: "complete" } },
    })
    mockRefreshSelectedStatus.mockResolvedValue({ enabled: false })
  })

  it("converts a US dollar balance into quota units", async () => {
    mockData.mockResolvedValue({ balance: "2.5" })

    await expect(fetchRixApiAccountQuota(request)).resolves.toBe(
      Math.round(2.5 * QUOTA_PER_USD),
    )
    expect(mockData).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: request.baseUrl }),
      { endpoint: "/api/user/self" },
    )
  })

  it("accepts a numeric balance as well as the string form", async () => {
    mockData.mockResolvedValue({ balance: 1.25 })

    await expect(fetchRixApiAccountQuota(request)).resolves.toBe(
      Math.round(1.25 * QUOTA_PER_USD),
    )
  })

  it("keeps an integer quota for deployments that still report one", async () => {
    mockData.mockResolvedValue({ quota: 4242, balance: "9.99" })

    await expect(fetchRixApiAccountQuota(request)).resolves.toBe(4242)
  })

  it("falls back to zero when neither field is usable", async () => {
    mockData.mockResolvedValue({ balance: "not-a-number" })
    await expect(fetchRixApiAccountQuota(request)).resolves.toBe(0)

    mockData.mockResolvedValue({})
    await expect(fetchRixApiAccountQuota(request)).resolves.toBe(0)

    mockData.mockResolvedValue({ balance: "-1" })
    await expect(fetchRixApiAccountQuota(request)).resolves.toBe(0)
  })

  it("composes the Rix quota with the shared today metrics and check-in state", async () => {
    mockData.mockResolvedValue({ balance: "0" })

    const data = await fetchRixApiAccountData({
      ...request,
      siteType: SITE_TYPES.RIX_API,
      checkIn: buildCheckInConfig(),
    })

    expect(data.quota).toBe(0)
    expect(data.today_quota_consumption).toBe(1)
    expect(data.today_income).toBe(5)
    expect(data.checkIn).toEqual({ enabled: false })
    expect(mockGetTodayTimestampRange).toHaveBeenCalledTimes(1)
    expect(mockRefreshSelectedStatus).toHaveBeenCalledWith(
      expect.objectContaining({ siteType: SITE_TYPES.RIX_API }),
    )
  })

  it("resolves the account identity from the username Rix still reports", async () => {
    mockData.mockResolvedValue({
      username: "white-label-owner",
      display_name: "Owners Display",
      balance: "0",
      github_id: "125447674",
    })

    const userInfo = await fetchRixApiUserInfo(request, "white-label-owner")

    expect(userInfo.id).toBe("white-label-owner")
    expect(userInfo.username).toBe("white-label-owner")
    expect(userInfo.access_token).toBe("")
    expect(userInfo.loginProviders).toEqual(["github"])
  })

  it("prefers the numeric id when a deployment still exposes one", async () => {
    mockData.mockResolvedValue({ id: 25983, username: "legacy-owner" })

    await expect(fetchRixApiUserInfo(request, "25983")).resolves.toMatchObject({
      id: "25983",
      username: "legacy-owner",
    })
  })

  it("keeps an existing access token from the payload", async () => {
    mockData.mockResolvedValue({
      username: "demo-owner",
      access_token: "existing-pat",
    })

    await expect(
      fetchRixApiUserInfo(request, "demo-owner"),
    ).resolves.toMatchObject({
      access_token: "existing-pat",
    })
  })

  it("rejects an account that does not match the expected identity", async () => {
    mockData.mockResolvedValue({ username: "someone-else" })

    await expect(
      fetchRixApiUserInfo(request, "white-label-owner"),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    })
  })

  it("rejects a payload with no usable identity", async () => {
    mockData.mockResolvedValue({ balance: "0" })

    await expect(fetchRixApiUserInfo(request, "anyone")).rejects.toBeInstanceOf(
      ApiError,
    )
  })

  it("reuses the access token the deployment already reports", async () => {
    mockData.mockResolvedValue({
      username: "demo-owner",
      access_token: "existing-token",
    })

    await expect(
      fetchRixApiAccessToken(request, { expectedUserId: "demo-owner" }),
    ).resolves.toMatchObject({
      username: "demo-owner",
      access_token: "existing-token",
    })
    expect(mockData).toHaveBeenCalledTimes(1)
  })

  it("mints an admin key when the deployment reports no token", async () => {
    mockData
      .mockResolvedValueOnce({ username: "white-label-owner" })
      .mockResolvedValueOnce({ key: "rix-admin-secret" })

    const tokenInfo = await fetchRixApiAccessToken(request, {
      expectedUserId: "white-label-owner",
    })

    expect(tokenInfo).toEqual({
      username: "white-label-owner",
      access_token: "rix-admin-secret",
    })
    expect(mockData).toHaveBeenLastCalledWith(request, {
      endpoint: "/api/user/admin-keys",
      options: {
        method: "POST",
        body: JSON.stringify({
          name: "All API Hub",
          scopes: [
            "account:read",
            "keys:read",
            "keys:write",
            "logs:read",
            "usage:read",
          ],
          expires_in_days: 0,
        }),
      },
    })
  })

  it("accepts the minted plaintext when it is a bare string", async () => {
    mockData
      .mockResolvedValueOnce({ username: "white-label-owner" })
      .mockResolvedValueOnce("rix-admin-secret")

    await expect(
      fetchRixApiAccessToken(request, { expectedUserId: "white-label-owner" }),
    ).resolves.toMatchObject({ access_token: "rix-admin-secret" })
  })

  it("rejects a mint response without a usable secret", async () => {
    mockData
      .mockResolvedValueOnce({ username: "white-label-owner" })
      .mockResolvedValueOnce({ id: 7, name: "All API Hub" })

    await expect(
      fetchRixApiAccessToken(request, { expectedUserId: "white-label-owner" }),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it("preserves login providers when existing access token is returned", async () => {
    mockData.mockResolvedValue({
      username: "demo-owner",
      access_token: "existing-token",
      github_id: "gh-12345",
    })

    await expect(
      fetchRixApiAccessToken(request, { expectedUserId: "demo-owner" }),
    ).resolves.toEqual({
      username: "demo-owner",
      access_token: "existing-token",
      loginProviders: ["github"],
    })
  })

  it("handles failure when refreshing account data", async () => {
    mockData.mockRejectedValue(new Error("network failure"))

    const result = await refreshRixApiAccountData({
      ...request,
      siteType: SITE_TYPES.RIX_API,
      checkIn: buildCheckInConfig(),
    })
    expect(result.success).toBe(false)
    expect(result.healthStatus).toBeDefined()
  })
})
