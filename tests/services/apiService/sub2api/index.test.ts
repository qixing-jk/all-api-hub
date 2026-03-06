import { beforeEach, describe, expect, it, vi } from "vitest"

import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import type {
  ApiServiceAccountRequest,
  CreateTokenRequest,
} from "~/services/apiService/common/type"
import { fetchApi } from "~/services/apiService/common/utils"
import {
  createApiToken,
  fetchAccountTokens,
  refreshAccountData,
} from "~/services/apiService/sub2api"
import {
  convertUsdBalanceToQuota,
  parseSub2ApiEnvelope,
  parseSub2ApiUserIdentity,
} from "~/services/apiService/sub2api/parsing"
import { resyncSub2ApiAuthToken } from "~/services/apiService/sub2api/tokenResync"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

vi.mock("~/services/apiService/common", () => ({
  determineHealthStatus: vi.fn(() => ({
    status: SiteHealthStatus.Unknown,
    message: "determineHealthStatus",
  })),
}))

vi.mock("~/services/apiService/common/utils", () => ({
  fetchApi: vi.fn(),
}))

vi.mock("~/services/apiService/sub2api/tokenResync", () => ({
  resyncSub2ApiAuthToken: vi.fn(),
}))

describe("apiService sub2api parsing", () => {
  it("convertUsdBalanceToQuota rounds using conversion factor", () => {
    expect(convertUsdBalanceToQuota(0)).toBe(0)
    expect(convertUsdBalanceToQuota(-1)).toBe(0)
    expect(convertUsdBalanceToQuota(1)).toBe(500000)
    expect(convertUsdBalanceToQuota(1.234)).toBe(Math.round(1.234 * 500000))
  })

  it("parseSub2ApiEnvelope returns data when code is 0", () => {
    const data = parseSub2ApiEnvelope(
      { code: 0, message: "ok", data: { value: 1 } },
      "/api/v1/auth/me",
    )
    expect(data).toEqual({ value: 1 })
  })

  it("parseSub2ApiEnvelope throws when code is missing", () => {
    expect(() =>
      parseSub2ApiEnvelope(
        { message: "ok", data: { value: 1 } },
        "/api/v1/auth/me",
      ),
    ).toThrow("messages:errors.api.invalidResponseFormat")
  })

  it("parseSub2ApiEnvelope throws when code is not a number", () => {
    expect(() =>
      parseSub2ApiEnvelope(
        { code: "0", message: "ok", data: { value: 1 } },
        "/api/v1/auth/me",
      ),
    ).toThrow("messages:errors.api.invalidResponseFormat")
  })

  it("parseSub2ApiEnvelope throws when message is missing", () => {
    expect(() =>
      parseSub2ApiEnvelope({ code: 0, data: { value: 1 } }, "/api/v1/auth/me"),
    ).toThrow("messages:errors.api.invalidResponseFormat")
  })

  it("parseSub2ApiEnvelope throws when message is not a string", () => {
    expect(() =>
      parseSub2ApiEnvelope(
        { code: 0, message: 123, data: { value: 1 } },
        "/api/v1/auth/me",
      ),
    ).toThrow("messages:errors.api.invalidResponseFormat")
  })

  it("parseSub2ApiEnvelope throws business error when code is non-zero", () => {
    const thrown = (() => {
      try {
        parseSub2ApiEnvelope(
          { code: 123, message: "bad", data: null },
          "/api/v1/auth/me",
        )
      } catch (error) {
        return error
      }

      return null
    })()

    expect(thrown).toBeInstanceOf(ApiError)
    expect((thrown as ApiError).message).toBe("bad")
    expect((thrown as ApiError).code).toBe(API_ERROR_CODES.BUSINESS_ERROR)
  })

  it("parseSub2ApiUserIdentity normalizes numeric fields and computes quota", () => {
    const identity = parseSub2ApiUserIdentity({
      id: "12",
      username: " alice ",
      email: "alice@example.com",
      balance: "1.5",
    })

    expect(identity.userId).toBe(12)
    expect(identity.username).toBe("alice")
    expect(identity.balanceUsd).toBe(1.5)
    expect(identity.quota).toBe(Math.round(1.5 * 500000))
  })

  it("parseSub2ApiUserIdentity falls back to email local-part when username is empty", () => {
    const identity = parseSub2ApiUserIdentity({
      id: 99,
      username: "",
      email: "alice@example.com",
      balance: 0,
    })

    expect(identity.userId).toBe(99)
    expect(identity.username).toBe("alice")
  })

  it("parseSub2ApiUserIdentity defaults username to empty string when both username and email are missing", () => {
    const identity = parseSub2ApiUserIdentity({
      id: 99,
      balance: 0,
    })

    expect(identity.userId).toBe(99)
    expect(identity.username).toBe("")
  })
})

describe("apiService sub2api refreshAccountData", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  const createRequest = (
    overrides: Partial<ApiServiceAccountRequest> = {},
  ): ApiServiceAccountRequest =>
    ({
      baseUrl: "https://sub2.example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "old-jwt",
      },
      checkIn: {
        enableDetection: true,
        autoCheckInEnabled: true,
        siteStatus: { isCheckedInToday: false },
        customCheckIn: { url: "", redeemUrl: "", openRedeemWithCheckIn: true },
      },
      ...overrides,
    }) as ApiServiceAccountRequest

  const createTokenRequest = (
    overrides: Partial<CreateTokenRequest> = {},
  ): CreateTokenRequest => ({
    name: "Test Token",
    remain_quota: 0,
    expired_time: -1,
    unlimited_quota: true,
    model_limits_enabled: false,
    model_limits: "",
    allow_ips: "",
    group: "default",
    ...overrides,
  })

  it("returns success without retry when /api/v1/auth/me succeeds", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: { id: 1, username: "alice", balance: 2 },
    } as any)

    const result = await refreshAccountData(createRequest())

    expect(result.success).toBe(true)
    expect(result.data?.quota).toBe(1_000_000)
    expect(result.data?.checkIn.enableDetection).toBe(false)
    expect(result.authUpdate?.userId).toBe(1)
    expect(result.authUpdate?.username).toBe("alice")
    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
  })

  it("re-syncs token and retries once on HTTP 401 (success)", async () => {
    vi.mocked(fetchApi)
      .mockRejectedValueOnce(
        new ApiError("Unauthorized", 401, "/api/v1/auth/me"),
      )
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { id: 2, username: "bob", balance: 1 },
      } as any)

    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "new-jwt",
      source: "existing_tab",
    })

    const request = createRequest()
    const result = await refreshAccountData(request)

    expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith(request.baseUrl)
    expect(fetchApi).toHaveBeenCalledTimes(2)
    const retryRequest = vi.mocked(fetchApi).mock.calls[1]?.[0] as any
    expect(retryRequest?.auth?.accessToken).toBe("new-jwt")

    expect(result.success).toBe(true)
    expect(result.data?.quota).toBe(500_000)
    expect(result.authUpdate?.accessToken).toBe("new-jwt")
    expect(result.authUpdate?.userId).toBe(2)
    expect(result.authUpdate?.username).toBe("bob")
  })

  it("returns login-required warning when token re-sync fails", async () => {
    vi.mocked(fetchApi).mockRejectedValueOnce(
      new ApiError("Unauthorized", 401, "/api/v1/auth/me"),
    )
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce(null)

    const result = await refreshAccountData(createRequest())

    expect(result.success).toBe(false)
    expect(result.healthStatus.status).toBe(SiteHealthStatus.Warning)
    expect(result.healthStatus.message).toBe("messages:sub2api.loginRequired")
    expect(fetchApi).toHaveBeenCalledTimes(1)
  })

  it("returns login-required warning when retry still returns 401", async () => {
    vi.mocked(fetchApi)
      .mockRejectedValueOnce(
        new ApiError("Unauthorized", 401, "/api/v1/auth/me"),
      )
      .mockRejectedValueOnce(
        new ApiError("Unauthorized", 401, "/api/v1/auth/me"),
      )

    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "new-jwt",
      source: "temp_window",
    })

    const result = await refreshAccountData(createRequest())

    expect(result.success).toBe(false)
    expect(result.healthStatus.status).toBe(SiteHealthStatus.Warning)
    expect(result.healthStatus.message).toBe("messages:sub2api.loginRequired")
    expect(fetchApi).toHaveBeenCalledTimes(2)
  })

  it("proactively refreshes tokens when refresh token is configured and close to expiry", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            access_token: "new-jwt",
            refresh_token: "new-refresh",
            expires_in: 3600,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock as any)

    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: { id: 1, username: "alice", balance: 2 },
    } as any)

    const request = createRequest({
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "old-jwt",
        refreshToken: "old-refresh",
        tokenExpiresAt: now + 60_000,
      },
    })

    const result = await refreshAccountData(request)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchApi).toHaveBeenCalledTimes(1)
    expect(
      (vi.mocked(fetchApi).mock.calls[0]?.[0] as any)?.auth?.accessToken,
    ).toBe("new-jwt")
    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()

    expect(result.success).toBe(true)
    expect(result.authUpdate?.accessToken).toBe("new-jwt")
    expect(result.authUpdate?.sub2apiAuth).toEqual({
      refreshToken: "new-refresh",
      tokenExpiresAt: now + 3600 * 1000,
    })

    nowSpy.mockRestore()
  })

  it("uses rotated refresh token for 401 retry after proactive refresh", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              access_token: "proactive-jwt",
              refresh_token: "rotated-refresh",
              expires_in: 3600,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              access_token: "retry-jwt",
              refresh_token: "final-refresh",
              expires_in: 3600,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
    vi.stubGlobal("fetch", fetchMock as any)

    vi.mocked(fetchApi)
      .mockRejectedValueOnce(
        new ApiError("Unauthorized", 401, "/api/v1/auth/me"),
      )
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { id: 2, username: "bob", balance: 1 },
      } as any)

    const request = createRequest({
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "old-jwt",
        refreshToken: "old-refresh",
        tokenExpiresAt: now + 60_000,
      },
    })

    const result = await refreshAccountData(request)

    expect(fetchMock).toHaveBeenCalledTimes(2)

    const firstPayload = JSON.parse((fetchMock.mock.calls[0]?.[1] as any)?.body)
    expect(firstPayload).toEqual({ refresh_token: "old-refresh" })

    const secondPayload = JSON.parse(
      (fetchMock.mock.calls[1]?.[1] as any)?.body,
    )
    expect(secondPayload).toEqual({ refresh_token: "rotated-refresh" })

    expect(fetchApi).toHaveBeenCalledTimes(2)
    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()

    expect(result.success).toBe(true)
    expect(result.authUpdate?.accessToken).toBe("retry-jwt")
    expect(result.authUpdate?.sub2apiAuth).toEqual({
      refreshToken: "final-refresh",
      tokenExpiresAt: now + 3600 * 1000,
    })

    nowSpy.mockRestore()
  })

  it("refreshes via stored refresh token and retries once on HTTP 401 (success)", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            access_token: "new-jwt",
            refresh_token: "new-refresh",
            expires_in: 3600,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock as any)

    vi.mocked(fetchApi)
      .mockRejectedValueOnce(
        new ApiError("Unauthorized", 401, "/api/v1/auth/me"),
      )
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { id: 2, username: "bob", balance: 1 },
      } as any)

    const request = createRequest({
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "old-jwt",
        refreshToken: "old-refresh",
      },
    })

    const result = await refreshAccountData(request)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
    expect(fetchApi).toHaveBeenCalledTimes(2)

    expect(result.success).toBe(true)
    expect(result.data?.quota).toBe(500_000)
    expect(result.authUpdate?.accessToken).toBe("new-jwt")
    expect(result.authUpdate?.sub2apiAuth).toEqual({
      refreshToken: "new-refresh",
      tokenExpiresAt: now + 3600 * 1000,
    })
    expect(result.authUpdate?.userId).toBe(2)
    expect(result.authUpdate?.username).toBe("bob")

    nowSpy.mockRestore()
  })

  it("re-syncs key requests when refresh token restore throws a non-contract error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"))
    vi.stubGlobal("fetch", fetchMock as any)

    vi.mocked(fetchApi)
      .mockRejectedValueOnce(new ApiError("Unauthorized", 401, "/api/v1/keys"))
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: [
          {
            id: 1,
            user_id: 1,
            key: "sub2api-token",
            status: 1,
            name: "Token",
            created_at: 0,
            updated_at: 0,
            expires_at: null,
            quota: 0,
            quota_used: 0,
            ip_whitelist: [],
            group: { name: "default" },
          },
        ],
      } as any)

    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "resynced-jwt",
      source: "existing_tab",
    })

    const request = createRequest({
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "old-jwt",
        refreshToken: "old-refresh",
      },
    })

    const tokens = await fetchAccountTokens(request)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith(request.baseUrl)
    expect(fetchApi).toHaveBeenCalledTimes(2)
    expect(
      (vi.mocked(fetchApi).mock.calls[1]?.[0] as any)?.auth?.accessToken,
    ).toBe("resynced-jwt")
    expect(tokens).toHaveLength(1)
    expect(tokens[0]).toMatchObject({
      key: "sk-sub2api-token",
      group: "default",
    })
  })

  it("does not re-sync key requests when refresh token restore fails with a contract error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 1,
          message: "invalid_refresh_token",
          data: null,
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock as any)

    vi.mocked(fetchApi).mockRejectedValueOnce(
      new ApiError("Unauthorized", 401, "/api/v1/keys"),
    )

    const request = createRequest({
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "old-jwt",
        refreshToken: "old-refresh",
      },
    })

    await expect(fetchAccountTokens(request)).rejects.toMatchObject({
      message: "messages:sub2api.refreshTokenInvalid",
      code: API_ERROR_CODES.HTTP_401,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
    expect(fetchApi).toHaveBeenCalledTimes(1)
  })

  it("throws localized group-missing error when the selected Sub2API group disappears", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: [{ id: 1, name: "default" }],
    } as any)

    await expect(
      createApiToken(createRequest(), createTokenRequest({ group: "vip" })),
    ).rejects.toMatchObject({
      message: "messages:sub2api.groupMissing",
      code: API_ERROR_CODES.BUSINESS_ERROR,
    })
  })

  it("falls back to dashboard re-sync when refresh token restore fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 1,
          message: "invalid_refresh_token",
          data: null,
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock as any)

    vi.mocked(fetchApi)
      .mockRejectedValueOnce(
        new ApiError("Unauthorized", 401, "/api/v1/auth/me"),
      )
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { id: 2, username: "bob", balance: 1 },
      } as any)

    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "resynced-jwt",
      source: "temp_window",
    })

    const request = createRequest({
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "old-jwt",
        refreshToken: "old-refresh",
      },
    })

    const result = await refreshAccountData(request)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith(request.baseUrl)
    expect(fetchApi).toHaveBeenCalledTimes(2)
    expect(
      (vi.mocked(fetchApi).mock.calls[1]?.[0] as any)?.auth?.accessToken,
    ).toBe("resynced-jwt")
    expect(result.success).toBe(true)
    expect(result.authUpdate?.accessToken).toBe("resynced-jwt")
    expect(result.authUpdate?.userId).toBe(2)
    expect(result.authUpdate?.username).toBe("bob")
  })

  it("returns restore-required warning when refresh token restore and re-sync both fail", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 1,
          message: "invalid_refresh_token",
          data: null,
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock as any)

    vi.mocked(fetchApi).mockRejectedValueOnce(
      new ApiError("Unauthorized", 401, "/api/v1/auth/me"),
    )
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce(null)

    const request = createRequest({
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: 1,
        accessToken: "old-jwt",
        refreshToken: "old-refresh",
      },
    })

    const result = await refreshAccountData(request)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith(request.baseUrl)
    expect(fetchApi).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(false)
    expect(result.healthStatus.status).toBe(SiteHealthStatus.Warning)
    expect(result.healthStatus.message).toBe(
      "messages:sub2api.refreshTokenInvalid",
    )
  })
})
