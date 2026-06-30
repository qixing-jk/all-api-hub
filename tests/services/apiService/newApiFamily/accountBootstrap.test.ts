import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createAccessToken,
  defaultAccountBootstrapImplementation,
  extractDefaultExchangeRate,
  fetchSiteStatus,
  fetchSupportCheckIn,
  fetchUserInfo,
  getOrCreateAccessToken,
} from "~/services/apiService/newApiFamily/default/accountBootstrap"
import { AuthTypeEnum } from "~/types"

const { mockFetchApiData } = vi.hoisted(() => ({
  mockFetchApiData: vi.fn(),
}))

vi.mock("~/services/apiTransport/request", () => ({
  fetchApiData: mockFetchApiData,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  })),
}))

vi.mock("~/utils/i18n/core", () => ({
  t: vi.fn((key: string) => key),
}))

describe("newApiFamily accountBootstrap", () => {
  const request = {
    baseUrl: "https://bootstrap.example.invalid",
    accountId: "account-1",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      userId: "user-1",
      accessToken: "access-token",
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetchUserInfo returns the normalized public shape", async () => {
    mockFetchApiData.mockResolvedValueOnce({
      id: 9,
      username: "alice",
      access_token: "",
      quota: 123,
    })

    await expect(fetchUserInfo(request)).resolves.toEqual({
      id: "9",
      username: "alice",
      access_token: "",
      user: {
        id: 9,
        username: "alice",
        access_token: "",
        quota: 123,
      },
    })
  })

  it("fetchUserInfo rejects missing upstream user ids", async () => {
    mockFetchApiData.mockResolvedValueOnce({
      username: "alice",
      access_token: "",
      quota: 123,
    })

    await expect(fetchUserInfo(request)).rejects.toMatchObject({
      name: "ApiError",
      endpoint: "/api/user/self",
    })
  })

  it("createAccessToken delegates to the token endpoint", async () => {
    mockFetchApiData.mockResolvedValueOnce("new-token")

    await expect(createAccessToken(request)).resolves.toBe("new-token")
    expect(mockFetchApiData).toHaveBeenCalledWith(request, {
      endpoint: "/api/user/token",
    })
  })

  it("getOrCreateAccessToken reuses the existing token when present", async () => {
    mockFetchApiData.mockResolvedValueOnce({
      id: 1,
      username: "alice",
      access_token: "existing-token",
    })

    await expect(getOrCreateAccessToken(request)).resolves.toEqual({
      username: "alice",
      access_token: "existing-token",
    })
    expect(mockFetchApiData).toHaveBeenCalledTimes(1)
  })

  it("getOrCreateAccessToken creates a token when the account has none", async () => {
    mockFetchApiData
      .mockResolvedValueOnce({
        id: 1,
        username: "alice",
        access_token: "",
      })
      .mockResolvedValueOnce("generated-token")

    await expect(getOrCreateAccessToken(request)).resolves.toEqual({
      username: "alice",
      access_token: "generated-token",
    })
    expect(mockFetchApiData).toHaveBeenNthCalledWith(2, request, {
      endpoint: "/api/user/token",
    })
  })

  it("getOrCreateAccessToken rejects blank generated tokens at the bootstrap boundary", async () => {
    mockFetchApiData
      .mockResolvedValueOnce({
        id: 1,
        username: "alice",
        access_token: "",
      })
      .mockResolvedValueOnce("   ")

    await expect(getOrCreateAccessToken(request)).rejects.toMatchObject({
      name: "ApiError",
      endpoint: "/api/user/token",
    })
  })

  it("fetchSiteStatus forces public auth and returns null on failures", async () => {
    mockFetchApiData
      .mockResolvedValueOnce({
        checkin_enabled: true,
        price: 2.5,
      })
      .mockRejectedValueOnce(new Error("status failed"))

    await expect(fetchSiteStatus(request)).resolves.toEqual({
      checkin_enabled: true,
      price: 2.5,
    })
    expect(mockFetchApiData).toHaveBeenNthCalledWith(
      1,
      {
        ...request,
        auth: { authType: AuthTypeEnum.None },
      },
      { endpoint: "/api/status" },
    )
    await expect(fetchSiteStatus(request)).resolves.toBeNull()
  })

  it("extractDefaultExchangeRate follows the documented fallback order", () => {
    expect(extractDefaultExchangeRate(null)).toBeNull()
    expect(extractDefaultExchangeRate({ price: 2.5 } as any)).toBe(2.5)
    expect(
      extractDefaultExchangeRate({ price: 0, stripe_unit_price: 3 } as any),
    ).toBe(3)
    expect(
      extractDefaultExchangeRate({
        price: 0,
        stripe_unit_price: 0,
        PaymentUSDRate: 4,
      } as any),
    ).toBe(4)
    expect(
      extractDefaultExchangeRate({
        price: -1,
        stripe_unit_price: 0,
        PaymentUSDRate: 0,
      } as any),
    ).toBeNull()
  })

  it("fetchSupportCheckIn forwards the site flag from fetchSiteStatus", async () => {
    mockFetchApiData.mockResolvedValueOnce({
      checkin_enabled: false,
    })

    await expect(fetchSupportCheckIn(request)).resolves.toBe(false)
  })

  it("uses New API-family bootstrap helpers by default for New API", async () => {
    const implementation = defaultAccountBootstrapImplementation
    const userInfo = {
      id: "user-1",
      username: "Example User",
      access_token: "access-token",
      user: {
        id: "user-1",
        username: "Example User",
        access_token: "access-token",
      },
    }
    const accessToken = {
      username: "Example User",
      access_token: "created-token",
    }
    const siteStatus = {
      system_name: "Example API",
      checkin_enabled: true,
      price: 7.2,
    }
    mockFetchApiData
      .mockResolvedValueOnce(userInfo.user)
      .mockResolvedValueOnce({
        id: userInfo.id,
        username: accessToken.username,
        access_token: accessToken.access_token,
      })
    mockFetchApiData.mockResolvedValueOnce(siteStatus)
    mockFetchApiData.mockResolvedValueOnce(siteStatus)

    await expect(implementation.fetchUserInfo(request)).resolves.toEqual(
      userInfo,
    )
    await expect(
      implementation.getOrCreateAccessToken(request),
    ).resolves.toEqual(accessToken)
    await expect(implementation.fetchSiteStatus(request)).resolves.toBe(
      siteStatus,
    )
    await expect(implementation.fetchSupportCheckIn(request)).resolves.toBe(
      true,
    )
    expect(implementation.extractDefaultExchangeRate(siteStatus)).toBe(7.2)

    expect(mockFetchApiData).toHaveBeenCalledWith(request, {
      endpoint: "/api/user/self",
    })
  })
})
