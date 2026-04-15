import { beforeEach, describe, expect, it, vi } from "vitest"

import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import type {
  ApiServiceAccountRequest,
  CreateTokenRequest,
} from "~/services/apiService/common/type"
import { fetchApi } from "~/services/apiService/common/utils"
import {
  createApiToken,
  deleteApiToken,
  fetchAccountData,
  fetchAccountTokens,
  fetchCurrentUser,
  fetchSiteStatus,
  fetchUserGroups,
  refreshAccountData,
  updateApiToken,
} from "~/services/apiService/sub2api"
import {
  buildSub2ApiUserGroups,
  convertExpirySecondsToSub2ApiDays,
  convertUsdBalanceToQuota,
  extractSub2ApiKeyItems,
  parseSub2ApiEnvelope,
  parseSub2ApiKey,
  parseSub2ApiUserIdentity,
  resolveSub2ApiGroupId,
  translateSub2ApiCreateTokenRequest,
  translateSub2ApiUpdateTokenRequest,
} from "~/services/apiService/sub2api/parsing"
import { resyncSub2ApiAuthToken } from "~/services/apiService/sub2api/tokenResync"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

const { mockGetAccountById, mockUpdateAccount } = vi.hoisted(() => ({
  mockGetAccountById: vi.fn(),
  mockUpdateAccount: vi.fn(),
}))

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

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAccountById: (...args: any[]) => mockGetAccountById(...args),
    updateAccount: (...args: any[]) => mockUpdateAccount(...args),
  },
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

  it("parseSub2ApiEnvelope allows missing data only when explicitly requested", () => {
    expect(
      parseSub2ApiEnvelope({ code: 0, message: "ok" }, "/api/v1/auth/me", {
        allowMissingData: true,
      }),
    ).toBeUndefined()

    const thrown = (() => {
      try {
        parseSub2ApiEnvelope({ code: 9, message: "   " }, "/api/v1/auth/me", {
          allowMissingData: true,
        })
      } catch (error) {
        return error
      }

      return null
    })()

    expect(thrown).toBeInstanceOf(ApiError)
    expect((thrown as ApiError).message).toBe(
      "messages:errors.api.invalidResponseFormat",
    )
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

  it("parseSub2ApiUserIdentity rejects array payloads and non-integer ids", () => {
    expect(() => parseSub2ApiUserIdentity([])).toThrow(
      "messages:errors.api.invalidResponseFormat",
    )
    expect(() =>
      parseSub2ApiUserIdentity({
        id: "12.5",
        username: "alice",
        balance: 0,
      }),
    ).toThrow("messages:errors.api.invalidResponseFormat")
  })

  it("parseSub2ApiKey normalizes quota, dates, group aliases, and fallback user ids", () => {
    const token = parseSub2ApiKey(
      {
        id: "7",
        key: "  sub2api-token  ",
        status: " active ",
        name: "  Primary Key  ",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: 1_735_689_600_000,
        expires_at: "2026-02-01T00:00:00.000Z",
        quota: "2.5",
        quota_used: "5.5",
        ip_whitelist: " 127.0.0.1, 10.0.0.1 ,, ",
        Group: { name: " premium " },
      },
      { defaultUserId: "42", endpoint: "/api/v1/custom-keys" },
    )

    expect(token).toMatchObject({
      id: 7,
      user_id: 42,
      key: "sk-sub2api-token",
      status: 1,
      name: "Primary Key",
      remain_quota: 0,
      unlimited_quota: false,
      used_quota: 2_750_000,
      allow_ips: "127.0.0.1,10.0.0.1",
      group: "premium",
    })
    expect(token.created_time).toBe(1_767_225_600)
    expect(token.accessed_time).toBe(1_735_689_600)
    expect(token.expired_time).toBe(1_769_904_000)
  })

  it("parseSub2ApiKey treats non-positive quota as unlimited and supports nested group", () => {
    const token = parseSub2ApiKey({
      id: 8,
      user_id: 9,
      key: "another-token",
      status: 0,
      name: "Unlimited Key",
      created_at: 0,
      updated_at: null,
      expires_at: "",
      quota: "-1",
      quota_used: "1.25",
      ip_whitelist: [" 127.0.0.1 ", "", "10.0.0.2"],
      group: { name: " default " },
    })

    expect(token).toMatchObject({
      id: 8,
      user_id: 9,
      unlimited_quota: true,
      remain_quota: -1,
      used_quota: 625_000,
      allow_ips: "127.0.0.1,10.0.0.2",
      group: "default",
    })
    expect(Number.isNaN(token.created_time)).toBe(true)
    expect(Number.isNaN(token.accessed_time)).toBe(true)
    expect(token.expired_time).toBe(-1)
  })

  it("builds Sub2API group metadata with rate and description fallbacks", () => {
    const groups = buildSub2ApiUserGroups(
      [
        { id: "1", name: " default ", description: " " },
        {
          id: 2,
          name: "vip",
          description: "VIP Group",
          rate_multiplier: "2.5",
        },
        { id: null, name: "ignored", description: "Ignored" },
        { id: 3, name: " ", description: "Ignored" },
      ],
      {
        1: 0,
        3: "invalid",
      },
    )

    expect(groups).toEqual({
      default: { desc: "default", ratio: 1 },
      vip: { desc: "VIP Group", ratio: 2.5 },
    })
  })

  it("resolves group ids from trimmed names and rejects malformed payloads", () => {
    expect(
      resolveSub2ApiGroupId(
        [
          { id: "1", name: " default " },
          { id: 2, name: "vip" },
        ],
        " vip ",
        "/api/v1/groups/available",
      ),
    ).toBe(2)
    expect(
      resolveSub2ApiGroupId([], "   ", "/api/v1/groups/available"),
    ).toBeUndefined()
    expect(
      resolveSub2ApiGroupId(
        [{ id: "missing", name: "vip" }],
        "vip",
        "/api/v1/groups/available",
      ),
    ).toBeUndefined()
    expect(() =>
      resolveSub2ApiGroupId(
        "invalid" as any,
        "vip",
        "/api/v1/groups/available",
      ),
    ).toThrow("messages:errors.api.invalidResponseFormat")
  })

  it("translates create and update token requests with normalized expiry and allowlist fields", () => {
    const tokenRequest: CreateTokenRequest = {
      name: "  Team Key  ",
      remain_quota: 1_250_000,
      unlimited_quota: false,
      expired_time: 1_700_086_400,
      model_limits_enabled: false,
      model_limits: "",
      allow_ips: " 127.0.0.1, 10.0.0.1 ,, ",
      group: "default",
    }

    expect(
      convertExpirySecondsToSub2ApiDays(1_700_086_400, 1_700_000_000_000),
    ).toBe(1)

    expect(
      translateSub2ApiCreateTokenRequest(tokenRequest, 9, 1_700_000_000_000),
    ).toEqual({
      name: "Team Key",
      quota: 2.5,
      ip_whitelist: ["127.0.0.1", "10.0.0.1"],
      expires_in_days: 1,
      group_id: 9,
    })

    expect(translateSub2ApiUpdateTokenRequest(tokenRequest)).toEqual({
      name: "Team Key",
      quota: 2.5,
      ip_whitelist: ["127.0.0.1", "10.0.0.1"],
      expires_at: "2023-11-15T22:13:20.000Z",
    })

    expect(
      translateSub2ApiCreateTokenRequest(
        {
          name: "Test Token",
          unlimited_quota: true,
          remain_quota: 0,
          expired_time: -1,
          model_limits_enabled: false,
          model_limits: "",
          allow_ips: "",
          group: "default",
        },
        Number.NaN,
      ),
    ).toEqual({
      name: "Test Token",
      quota: 0,
      ip_whitelist: [],
      expires_in_days: 0,
    })
  })

  it("extracts key items from array and object payloads", () => {
    expect(
      extractSub2ApiKeyItems([
        { id: 1, key: "a" },
        { id: 2, key: "b" },
      ] as any),
    ).toHaveLength(2)
    expect(
      extractSub2ApiKeyItems({
        items: [{ id: 3, key: "c" }],
      } as any),
    ).toEqual([{ id: 3, key: "c" }])
  })
})

describe("apiService sub2api refreshAccountData", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.mocked(fetchApi).mockReset()
    vi.mocked(resyncSub2ApiAuthToken).mockReset()
    mockGetAccountById.mockReset()
    mockUpdateAccount.mockReset()
    mockGetAccountById.mockResolvedValue(null)
    mockUpdateAccount.mockResolvedValue(true)
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

  it("hydrates auth from stored account state and persists refreshed credentials", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

    mockGetAccountById.mockResolvedValueOnce({
      account_info: {
        id: 9,
        access_token: "stored-jwt",
      },
      sub2apiAuth: {
        refreshToken: "stored-refresh",
        tokenExpiresAt: now + 60_000,
      },
    })

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
      data: { id: 9, username: "stored-user", balance: 3 },
    } as any)

    const result = await refreshAccountData(
      createRequest({
        accountId: "account-1",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "stale-request-jwt",
        },
      }),
    )

    expect(mockGetAccountById).toHaveBeenCalledWith("account-1")
    expect((vi.mocked(fetchApi).mock.calls[0]?.[0] as any)?.auth).toMatchObject(
      {
        accessToken: "new-jwt",
        refreshToken: "new-refresh",
        tokenExpiresAt: now + 3600 * 1000,
        userId: 9,
      },
    )
    expect(mockUpdateAccount).toHaveBeenCalledWith("account-1", {
      account_info: {
        access_token: "new-jwt",
      },
      sub2apiAuth: {
        refreshToken: "new-refresh",
        tokenExpiresAt: now + 3600 * 1000,
      },
    })
    expect(result.success).toBe(true)
    expect(result.authUpdate?.userId).toBe(9)
    expect(result.authUpdate?.username).toBe("stored-user")

    nowSpy.mockRestore()
  })
})

describe("apiService sub2api exported operations", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.mocked(fetchApi).mockReset()
    vi.mocked(resyncSub2ApiAuthToken).mockReset()
    mockGetAccountById.mockReset()
    mockUpdateAccount.mockReset()
    mockGetAccountById.mockResolvedValue(null)
    mockUpdateAccount.mockResolvedValue(true)
  })

  const baseRequest = {
    baseUrl: "https://sub2.example.com",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      userId: 7,
      accessToken: "jwt-token",
    },
  } as const

  const createOperationTokenRequest = (
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

  it("rejects fetchCurrentUser when the JWT access token is blank", async () => {
    await expect(
      fetchCurrentUser({
        ...baseRequest,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "   ",
        },
      } as any),
    ).rejects.toMatchObject({
      message: "messages:sub2api.loginRequired",
      code: API_ERROR_CODES.HTTP_401,
    })
  })

  it("fetches account data with check-in detection forcibly disabled", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: { id: 7, username: "alice", balance: 1.5 },
    } as any)

    const result = await fetchAccountData({
      ...baseRequest,
      checkIn: {
        enableDetection: true,
        autoCheckInEnabled: true,
        siteStatus: { isCheckedInToday: false },
        customCheckIn: { url: "", redeemUrl: "", openRedeemWithCheckIn: true },
      },
    } as any)

    expect(result).toMatchObject({
      quota: 750000,
      today_quota_consumption: 0,
      today_income: 0,
      checkIn: expect.objectContaining({
        enableDetection: false,
        autoCheckInEnabled: true,
      }),
    })
  })

  it("provides an explicit synthetic site status instead of calling /api/status", async () => {
    await expect(fetchSiteStatus(baseRequest as any)).resolves.toEqual({
      checkin_enabled: false,
    })

    expect(vi.mocked(fetchApi)).not.toHaveBeenCalled()
  })

  it("fetches user groups by combining available groups and rates", async () => {
    vi.mocked(fetchApi)
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: [
          { id: 1, name: "default", description: "Default" },
          { id: 2, name: "vip", description: "" },
        ],
      } as any)
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { 1: 1.5, 2: 2 },
      } as any)

    await expect(fetchUserGroups(baseRequest as any)).resolves.toEqual({
      default: { desc: "Default", ratio: 1.5 },
      vip: { desc: "vip", ratio: 2 },
    })
  })

  it("normalizes invalid token pagination arguments back to defaults", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: [],
    } as any)

    await expect(
      fetchAccountTokens(baseRequest as any, -5, Number.NaN),
    ).resolves.toEqual([])

    expect((vi.mocked(fetchApi).mock.calls[0]?.[1] as any)?.endpoint).toBe(
      "/api/v1/keys?page=1&page_size=100",
    )
  })

  it("updates limited tokens by carrying forward already-used quota", async () => {
    vi.mocked(fetchApi)
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {
          id: 9,
          user_id: 7,
          key: "sub2api-token",
          status: 1,
          name: "Token",
          created_at: 0,
          updated_at: 0,
          expires_at: null,
          quota: 5,
          quota_used: 1.5,
          ip_whitelist: [],
          group: { name: "default" },
        },
      } as any)
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: [{ id: 2, name: "vip" }],
      } as any)
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {},
      } as any)

    await expect(
      updateApiToken(
        baseRequest as any,
        9,
        createOperationTokenRequest({
          group: "vip",
          unlimited_quota: false,
          remain_quota: 500000,
          allow_ips: "127.0.0.1",
        }),
      ),
    ).resolves.toBe(true)

    const putCall = vi.mocked(fetchApi).mock.calls[2]
    expect((putCall?.[1] as any)?.endpoint).toBe("/api/v1/keys/9")
    expect(JSON.parse((putCall?.[1] as any)?.options?.body)).toEqual({
      name: "Test Token",
      quota: 2.5,
      ip_whitelist: ["127.0.0.1"],
      expires_at: "",
      group_id: 2,
    })
  })

  it("deletes tokens through the allow-missing-data success path", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
    } as any)

    await expect(deleteApiToken(baseRequest as any, 12)).resolves.toBe(true)
    expect((vi.mocked(fetchApi).mock.calls[0]?.[1] as any)?.endpoint).toBe(
      "/api/v1/keys/12",
    )
    expect(
      (vi.mocked(fetchApi).mock.calls[0]?.[1] as any)?.options?.method,
    ).toBe("DELETE")
  })

  it("reuses newer stored auth instead of refreshing again when account storage already rotated the JWT", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

    mockGetAccountById
      .mockResolvedValueOnce({
        account_info: {
          id: 7,
          access_token: "old-jwt",
        },
        sub2apiAuth: {
          refreshToken: "old-refresh",
          tokenExpiresAt: now + 3600 * 1000,
        },
      })
      .mockResolvedValueOnce({
        account_info: {
          id: 7,
          access_token: "external-jwt",
        },
        sub2apiAuth: {
          refreshToken: "external-refresh",
          tokenExpiresAt: now + 3600 * 1000,
        },
      })

    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock as any)

    vi.mocked(fetchApi)
      .mockRejectedValueOnce(new ApiError("Unauthorized", 401, "/api/v1/keys"))
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: [],
      } as any)

    await expect(
      fetchAccountTokens({
        ...baseRequest,
        accountId: "account-1",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "request-jwt",
          refreshToken: "request-refresh",
          tokenExpiresAt: now + 3600 * 1000,
        },
      } as any),
    ).resolves.toEqual([])

    expect(fetchMock).not.toHaveBeenCalled()
    expect((vi.mocked(fetchApi).mock.calls[1]?.[0] as any)?.auth).toMatchObject(
      {
        accessToken: "external-jwt",
        refreshToken: "external-refresh",
        tokenExpiresAt: now + 3600 * 1000,
        userId: 7,
      },
    )

    nowSpy.mockRestore()
  })

  it("returns login-required for key requests when a resynced JWT still gets 401", async () => {
    vi.mocked(fetchApi)
      .mockRejectedValueOnce(new ApiError("Unauthorized", 401, "/api/v1/keys"))
      .mockRejectedValueOnce(new ApiError("Unauthorized", 401, "/api/v1/keys"))

    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "resynced-jwt",
      source: "existing_tab",
    })

    await expect(
      fetchAccountTokens({
        ...baseRequest,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "old-jwt",
        },
      } as any),
    ).rejects.toMatchObject({
      message: "messages:sub2api.loginRequired",
      code: API_ERROR_CODES.HTTP_401,
    })
  })

  it("creates tokens without fetching groups when the request leaves group blank", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: {},
    } as any)

    await expect(
      createApiToken(
        baseRequest as any,
        createOperationTokenRequest({
          group: "   ",
          unlimited_quota: false,
          remain_quota: 500000,
        }),
      ),
    ).resolves.toBe(true)

    expect(vi.mocked(fetchApi)).toHaveBeenCalledTimes(1)
    expect((vi.mocked(fetchApi).mock.calls[0]?.[1] as any)?.endpoint).toBe(
      "/api/v1/keys",
    )
    expect(
      JSON.parse(
        (vi.mocked(fetchApi).mock.calls[0]?.[1] as any)?.options?.body,
      ),
    ).toEqual({
      name: "Test Token",
      quota: 1,
      ip_whitelist: [],
      expires_in_days: 0,
    })
  })
})
