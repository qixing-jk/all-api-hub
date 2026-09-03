import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_BROWSER_SESSION_SOURCES } from "~/services/accountBrowserSession/types"
import type { ApiServiceAccountRequest } from "~/services/accounts/accountDataModel"
import type { CreateTokenRequest } from "~/services/accountTokens/tokenProvisioningModel"
import {
  createApiToken,
  createSub2ApiTokenForGroupId,
  deleteApiToken,
  extractDefaultExchangeRate,
  fetchAccountAvailableModels,
  fetchAccountData,
  fetchAccountTokens,
  fetchCheckInStatus,
  fetchCurrentUser,
  fetchInviteLink,
  fetchSiteStatus,
  fetchSub2ApiAnnouncements,
  fetchSub2ApiRuntimeModels,
  fetchSupportCheckIn,
  fetchTodayIncome,
  fetchTodayUsage,
  fetchTokenById,
  fetchUserGroups,
  fetchUserInfo,
  getOrCreateAccessToken,
  markSub2ApiAnnouncementRead,
  refreshAccountData,
  updateApiToken,
} from "~/services/apiService/sub2api"
import type { Sub2ApiAuthSessionRequest } from "~/services/apiService/sub2api/authSession"
import {
  recoverSub2ApiBrowserAuth as resyncSub2ApiAuthToken,
  SUB2API_SESSION_BINDING_MISMATCH_CODE,
  Sub2ApiAuthIdentityMismatchError,
} from "~/services/apiService/sub2api/browserAuth"
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
import {
  SUB2API_TOKEN_REFRESH_FAILURE_REASONS,
  Sub2ApiTokenRefreshError,
} from "~/services/apiService/sub2api/tokenRefresh"
import type {
  Sub2ApiAnnouncementListData,
  Sub2ApiEnvelope,
} from "~/services/apiService/sub2api/type"
import { createDeferredAbortDeadline } from "~/services/apiTransport/abortableTask"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApi } from "~/services/apiTransport/request"
import {
  API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES,
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
} from "~/services/apiTransport/type"
import { INVITE_LINK_FAILURE_REASONS } from "~/services/inviteLinks/errors"
import {
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_EXECUTION_VERSION,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  AuthTypeEnum,
  SiteHealthStatus,
} from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"

import { createCheckInConfig } from "../../apiAdapters/checkInFixtures"

const { mockGetLatestAuth, mockPersistAuthUpdate } = vi.hoisted(() => ({
  mockGetLatestAuth: vi.fn(),
  mockPersistAuthUpdate: vi.fn(),
}))

vi.mock("~/services/accounts/accountHealth", () => ({
  determineHealthStatus: vi.fn(() => ({
    status: SiteHealthStatus.Unknown,
    message: "determineHealthStatus",
  })),
  extractDefaultExchangeRate: (
    statusInfo: { price?: number; stripe_unit_price?: number } | null,
  ) => statusInfo?.price ?? statusInfo?.stripe_unit_price ?? null,
}))

vi.mock("~/services/apiTransport/request", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/apiTransport/request")>()
  return {
    ...actual,
    fetchApi: vi.fn(),
    notifyApiTransportObserver: vi.fn(),
  }
})

vi.mock("~/services/apiService/sub2api/browserAuth", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/apiService/sub2api/browserAuth")
    >()
  return {
    ...actual,
    recoverSub2ApiBrowserAuth: vi.fn().mockResolvedValue(null),
  }
})

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

  it("fetchSub2ApiAnnouncements requests unread-only notices when asked", async () => {
    const announcementsResponse: Sub2ApiEnvelope<Sub2ApiAnnouncementListData> =
      {
        code: 0,
        message: "ok",
        data: [
          {
            id: 1,
            title: "Notice",
            content: "Body",
          },
        ],
      }

    vi.mocked(fetchApi).mockResolvedValueOnce(announcementsResponse as any)

    await expect(
      fetchSub2ApiAnnouncements(
        {
          baseUrl: "https://example.com",
          accountId: "account-1",
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "token",
          },
        },
        { unreadOnly: true },
      ),
    ).resolves.toMatchObject([
      {
        id: 1,
        title: "Notice",
        content: "Body",
      },
    ])

    expect(fetchApi).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        endpoint: expect.stringContaining("unread_only=1"),
        options: expect.objectContaining({
          method: "GET",
          cache: "no-store",
        }),
      }),
      true,
    )
  })

  it("markSub2ApiAnnouncementRead returns false when the upstream call fails", async () => {
    vi.mocked(fetchApi).mockRejectedValueOnce(new Error("read failed"))

    await expect(
      markSub2ApiAnnouncementRead(
        {
          baseUrl: "https://example.com",
          accountId: "account-1",
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "token",
          },
        },
        "announcement-1",
      ),
    ).resolves.toBe(false)
  })

  it("returns the fixed unsupported check-in and parses today usage", async () => {
    const request = {
      baseUrl: "https://example.com",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
      },
    }

    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: {
        total_requests: 2,
        total_input_tokens: 12,
        total_output_tokens: 8,
        total_actual_cost: 0.25,
      },
    } as any)

    await expect(fetchSupportCheckIn(request as any)).resolves.toBe(false)
    await expect(fetchCheckInStatus(request as any)).resolves.toBeUndefined()
    await expect(fetchTodayUsage(request as any)).resolves.toEqual({
      today_quota_consumption: 125000,
      today_prompt_tokens: 12,
      today_completion_tokens: 8,
      today_requests_count: 2,
      todayStatsAvailability: {
        consumption: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
        requests: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
        tokens: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
      },
    })
    await expect(fetchTodayIncome(request as any)).resolves.toEqual({
      today_income: 0,
      todayStatsAvailability: {
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
      },
    })
  })

  it("returns independent income availability snapshots", async () => {
    const request = {
      baseUrl: "https://sub2api.example.invalid",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "account-token",
      },
    } as ApiServiceAccountRequest
    const first = await fetchTodayIncome(request)
    first.todayStatsAvailability!.income.status =
      ACCOUNT_TODAY_METRIC_STATUSES.Complete

    const second = await fetchTodayIncome(request)

    expect(second.todayStatsAvailability!.income).toEqual({
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
    })
    expect(second.todayStatsAvailability!.income).not.toBe(
      first.todayStatsAvailability!.income,
    )
  })

  it("validates Sub2API today fields independently", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: {
        total_requests: "invalid",
        total_input_tokens: "12",
        total_output_tokens: undefined,
        total_actual_cost: "0.25",
      },
    } as any)

    await expect(
      fetchTodayUsage({
        baseUrl: "https://sub2.example.invalid",
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
      } as any),
    ).resolves.toMatchObject({
      today_quota_consumption: 125000,
      today_prompt_tokens: 12,
      today_completion_tokens: 0,
      today_requests_count: 0,
      todayStatsAvailability: {
        consumption: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
        requests: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
        },
        tokens: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
          reason: ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
        },
      },
    })
  })

  it("rejects token availability when both Sub2API token totals are invalid", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: {
        total_requests: 2,
        total_input_tokens: "invalid",
        total_output_tokens: undefined,
        total_actual_cost: 0.25,
      },
    } as any)

    await expect(
      fetchTodayUsage({
        baseUrl: "https://sub2.example.invalid",
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
      } as any),
    ).resolves.toMatchObject({
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      todayStatsAvailability: {
        tokens: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
        },
      },
    })
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
      key: "sub2api-token",
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
    })
  })

  it("rejects an already-expired positive timestamp when creating a token", () => {
    expect(() =>
      translateSub2ApiCreateTokenRequest(
        {
          name: "Expired Token",
          unlimited_quota: true,
          remain_quota: 0,
          expired_time: 1_700_000_000,
          model_limits_enabled: false,
          model_limits: "",
          allow_ips: "",
          group: "default",
        },
        undefined,
        1_700_000_000_000,
      ),
    ).toThrow("Sub2API token expiration must be in the future")
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
    vi.mocked(resyncSub2ApiAuthToken).mockReset().mockResolvedValue(null)
    mockGetLatestAuth.mockReset()
    mockPersistAuthUpdate.mockReset()
    mockGetLatestAuth.mockResolvedValue(null)
    mockPersistAuthUpdate.mockResolvedValue({ status: "persisted" })
  })

  const createRequest = (
    overrides: Partial<
      Sub2ApiAuthSessionRequest<ApiServiceAccountRequest>
    > = {},
  ): Sub2ApiAuthSessionRequest<ApiServiceAccountRequest> =>
    ({
      baseUrl: "https://sub2.example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "old-jwt",
      },
      siteType: SITE_TYPES.SUB2API,
      checkIn: {
        ...createCheckInConfig(SITE_TYPES.SUB2API, { matched: false }),
        customCheckIn: { url: "", redeemUrl: "", openRedeemWithCheckIn: true },
      },
      ...overrides,
    }) as Sub2ApiAuthSessionRequest<ApiServiceAccountRequest>

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

  it("returns success with today usage when /api/v1/auth/me and /api/v1/usage/stats succeed", async () => {
    vi.mocked(fetchApi)
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { id: 1, username: "alice", balance: 2 },
      } as any)
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {
          total_requests: 3,
          total_input_tokens: 120,
          total_output_tokens: 45,
          total_actual_cost: 1.25,
        },
      } as any)

    const result = await refreshAccountData(createRequest())

    expect(result.success).toBe(true)
    expect(result.data?.quota).toBe(1_000_000)
    expect(result.data?.today_quota_consumption).toBe(625_000)
    expect(result.data?.today_prompt_tokens).toBe(120)
    expect(result.data?.today_completion_tokens).toBe(45)
    expect(result.data?.today_requests_count).toBe(3)
    expect(result.data?.checkIn.selection).not.toHaveProperty("methodId")
    expect(result.authUpdate?.userId).toBe("1")
    expect(result.authUpdate?.username).toBe("alice")
    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
    expect((vi.mocked(fetchApi).mock.calls[1]?.[1] as any)?.endpoint).toBe(
      "/api/v1/usage/stats?period=today",
    )
  })

  it("recovers authentication when the today-usage request returns 401", async () => {
    vi.mocked(fetchApi)
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { id: 1, username: "alice", balance: 2 },
      } as any)
      .mockRejectedValueOnce(
        new ApiError("Unauthorized", 401, "/api/v1/usage/stats?period=today"),
      )
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { id: 1, username: "alice", balance: 2 },
      } as any)
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {
          total_requests: 4,
          total_input_tokens: 120,
          total_output_tokens: 45,
          total_actual_cost: 1.25,
        },
      } as any)
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "browser-jwt",
      userId: "1",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })

    const result = await refreshAccountData(createRequest())

    expect(result.success).toBe(true)
    expect(result.data?.today_requests_count).toBe(4)
    expect(resyncSub2ApiAuthToken).toHaveBeenCalledTimes(1)
    expect(fetchApi).toHaveBeenCalledTimes(4)
    expect(vi.mocked(fetchApi).mock.calls[2]?.[0].auth?.accessToken).toBe(
      "browser-jwt",
    )
    expect(vi.mocked(fetchApi).mock.calls[3]?.[0].auth?.accessToken).toBe(
      "browser-jwt",
    )
  })

  it("keeps an ordinary first account request on the default transport", async () => {
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "old-jwt",
      userId: "1",
      fetchContext: {
        kind: "current-tab",
        tabId: 17,
        origin: "https://sub2.example.com",
      },
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: { id: 1, username: "alice", balance: 2 },
    } as any)

    const result = await refreshAccountData(
      createRequest({ includeTodayCashflow: false }),
    )

    expect(result.success).toBe(true)
    expect(vi.mocked(fetchApi).mock.calls[0]?.[0]).not.toHaveProperty(
      "fetchContext",
    )
    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
  })

  it("recovers a session-binding mismatch without submitting the refresh token", async () => {
    const rawFetch = vi.fn()
    vi.stubGlobal("fetch", rawFetch)
    vi.mocked(fetchApi)
      .mockRejectedValueOnce(
        new ApiError(
          "Session network fingerprint changed",
          401,
          "/api/v1/auth/me",
          API_ERROR_CODES.HTTP_401,
          SUB2API_SESSION_BINDING_MISMATCH_CODE,
        ),
      )
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { id: 1, username: "alice", balance: 2 },
      } as any)
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "browser-jwt",
      userId: "1",
      fetchContext: {
        kind: "current-tab",
        tabId: 17,
        origin: "https://sub2.example.com",
      },
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })

    const result = await refreshAccountData(
      createRequest({
        accountId: "account-1",
        includeTodayCashflow: false,
        sub2apiAuthSession: {
          getLatestAuth: (...args: any[]) => mockGetLatestAuth(...args),
          persistAuthUpdate: (...args: any[]) => mockPersistAuthUpdate(...args),
        },
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "1",
          accessToken: "old-jwt",
          refreshToken: "must-not-be-submitted",
          tokenExpiresAt: Date.now() + 3_600_000,
        },
      }),
    )

    expect(result.success).toBe(true)
    expect(rawFetch).not.toHaveBeenCalled()
    expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith({
      baseUrl: "https://sub2.example.com",
      expectedUserId: "1",
    })
    expect(vi.mocked(fetchApi).mock.calls[1]?.[0]).toMatchObject({
      auth: { accessToken: "browser-jwt" },
      fetchContext: {
        kind: "current-tab",
        tabId: 17,
        origin: "https://sub2.example.com",
      },
      currentTabFallback: API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES.Forbid,
    })
    expect(vi.mocked(fetchApi).mock.calls[1]?.[0].auth).not.toHaveProperty(
      "refreshToken",
    )
    expect(vi.mocked(fetchApi).mock.calls[1]?.[0].auth).not.toHaveProperty(
      "tokenExpiresAt",
    )
    expect(mockPersistAuthUpdate).toHaveBeenCalledWith("account-1", {
      accessToken: "browser-jwt",
      clearRefreshCredentials: true,
      expectedOrigin: "https://sub2.example.com",
      expectedUserId: "1",
      userId: "1",
    })
  })

  it("skips the public today-usage request when cashflow collection is disabled", async () => {
    await expect(
      fetchTodayUsage({
        baseUrl: "https://sub2.example.invalid",
        includeTodayCashflow: false,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "dashboard-jwt",
        },
      } as ApiServiceAccountRequest),
    ).resolves.toMatchObject({
      today_quota_consumption: 0,
      todayStatsAvailability: {
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
        },
      },
    })

    expect(fetchApi).not.toHaveBeenCalled()
  })

  it("keeps a temp-context auth recovery in the protected request context", async () => {
    vi.mocked(fetchApi)
      .mockRejectedValueOnce(
        new ApiError(
          "Session network fingerprint changed",
          401,
          "/api/v1/auth/me",
          API_ERROR_CODES.HTTP_401,
          SUB2API_SESSION_BINDING_MISMATCH_CODE,
        ),
      )
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { id: 1, username: "alice", balance: 2 },
      } as any)
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "temp-context-jwt",
      userId: "1",
      fetchContext: {
        kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
        cookieStoreId: "temporary-container",
      },
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
    })

    const result = await refreshAccountData(
      createRequest({ includeTodayCashflow: false }),
    )

    expect(result.success).toBe(true)
    expect(vi.mocked(fetchApi).mock.calls[1]?.[0]).toMatchObject({
      auth: { accessToken: "temp-context-jwt" },
      fetchContext: {
        kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
        cookieStoreId: "temporary-container",
      },
      forceTempWindow: true,
    })
    expect(vi.mocked(fetchApi).mock.calls[1]?.[0]).not.toHaveProperty(
      "currentTabFallback",
    )
  })

  it("returns browser-recovered refresh credentials without inventing an expiry", async () => {
    vi.mocked(fetchApi)
      .mockRejectedValueOnce(
        new ApiError("Unauthorized", 401, "/api/v1/auth/me"),
      )
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { id: 1, username: "alice", balance: 2 },
      } as any)
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "browser-jwt",
      userId: "1",
      sub2apiAuth: { refreshToken: "browser-refresh-token" },
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })

    const result = await refreshAccountData(
      createRequest({ includeTodayCashflow: false }),
    )

    expect(result.success).toBe(true)
    expect(result.authUpdate?.sub2apiAuth).toEqual({
      refreshToken: "browser-refresh-token",
    })
  })

  it("skips Sub2API today usage when includeTodayCashflow is false", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: { id: 1, username: "alice", balance: 2 },
    } as any)

    const result = await refreshAccountData(
      createRequest({ includeTodayCashflow: false }),
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      todayStatsAvailability: {
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
        },
        requests: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
        },
        tokens: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
        },
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
      },
    })
    expect(fetchApi).toHaveBeenCalledTimes(1)
  })

  it("keeps healthy balance data when the today usage request fails", async () => {
    vi.mocked(fetchApi)
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { id: 1, username: "alice", balance: 2 },
      } as any)
      .mockRejectedValueOnce(new Error("usage unavailable"))

    const result = await refreshAccountData(createRequest())

    expect(result).toMatchObject({
      success: true,
      data: {
        quota: 1_000_000,
        today_quota_consumption: 0,
        todayStatsAvailability: {
          consumption: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
            reason: ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
          },
          requests: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
            reason: ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
          },
          tokens: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
            reason: ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
          },
          income: {
            status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
            reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
          },
        },
      },
    })
  })

  it("passes temp-window source to token resync and preserves it on the retry", async () => {
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
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })

    const protectionBypassExecution = {
      version: PROTECTION_BYPASS_EXECUTION_VERSION,
      kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
      command: PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount,
      surface: "popup",
    } as const
    const request = createRequest({
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      protectionBypassExecution,
    })
    const result = await refreshAccountData(request)

    expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: request.baseUrl,
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        protectionBypassExecution,
        expectedUserId: "1",
      }),
    )
    const retryRequest = vi.mocked(fetchApi).mock.calls[1]?.[0] as any
    expect(retryRequest?.auth?.accessToken).toBe("new-jwt")
    expect(retryRequest?.tempWindowRequestSource).toBe(
      TEMP_WINDOW_REQUEST_SOURCES.Popup,
    )

    expect(result.success).toBe(true)
    expect(result.data?.quota).toBe(500_000)
    expect(result.authUpdate?.accessToken).toBe("new-jwt")
    expect(result.authUpdate?.userId).toBe("2")
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

  it("classifies invalid refresh tokens by machine code instead of display message", async () => {
    vi.mocked(fetchApi).mockRejectedValueOnce(
      new ApiError("Unauthorized", 401, "/api/v1/auth/me"),
    )
    vi.mocked(resyncSub2ApiAuthToken).mockRejectedValueOnce(
      new ApiError(
        "Localized display copy changed",
        401,
        "/api/v1/auth/me",
        API_ERROR_CODES.HTTP_401,
        "sub2api_refresh_token_invalid",
      ),
    )

    const result = await refreshAccountData(createRequest())

    expect(result.success).toBe(false)
    expect(result.healthStatus).toEqual({
      status: SiteHealthStatus.Warning,
      message: "messages:sub2api.refreshTokenInvalid",
    })
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
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
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
        userId: "1",
        accessToken: "old-jwt",
        refreshToken: "old-refresh",
        tokenExpiresAt: now + 60_000,
      },
    })

    const result = await refreshAccountData(request)

    expect(fetchMock).toHaveBeenCalledTimes(1)
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

  it("resynchronizes instead of using stale auth when post-rotation identity verification is unavailable", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              access_token: "rotated-access-token",
              refresh_token: "rotated-refresh-token",
              expires_in: 3600,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    )
    vi.mocked(fetchApi)
      .mockRejectedValueOnce(new Error("identity verification unavailable"))
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { id: 1, username: "alice", balance: 2 },
      } as any)
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "identity-checked-access-token",
      userId: "1",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })

    const result = await refreshAccountData(
      createRequest({
        accountId: "account-1",
        includeTodayCashflow: false,
        sub2apiAuthSession: {
          getLatestAuth: (...args: any[]) => mockGetLatestAuth(...args),
          persistAuthUpdate: (...args: any[]) => mockPersistAuthUpdate(...args),
        },
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "1",
          accessToken: "old-access-token",
          refreshToken: "single-use-refresh-token",
          tokenExpiresAt: now + 60_000,
        },
      }),
    )

    expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://sub2.example.com",
        expectedUserId: "1",
      }),
    )
    expect(
      (vi.mocked(fetchApi).mock.calls[1]?.[0] as any)?.auth.accessToken,
    ).toBe("identity-checked-access-token")
    expect(result.success).toBe(true)
    expect(result.authUpdate?.accessToken).toBe("identity-checked-access-token")
    nowSpy.mockRestore()
  })

  it("continues with the current access token after a conclusive proactive refresh rejection", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ code: 401, message: "invalid refresh token" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          ),
        ),
    )
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: { id: 1, username: "alice", balance: 2 },
    } as any)

    const result = await refreshAccountData(
      createRequest({
        includeTodayCashflow: false,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "1",
          accessToken: "old-access-token",
          refreshToken: "invalid-refresh-token",
          tokenExpiresAt: now + 60_000,
        },
      }),
    )

    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
    expect(
      (vi.mocked(fetchApi).mock.calls[0]?.[0] as any)?.auth.accessToken,
    ).toBe("old-access-token")
    expect(result.success).toBe(true)
    expect(result.authUpdate).not.toHaveProperty("accessToken")
    nowSpy.mockRestore()
  })

  it("returns the credential persistence warning when the auth store throws", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              access_token: "rotated-access-token",
              refresh_token: "rotated-refresh-token",
              expires_in: 3600,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    )
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: { id: 1, username: "alice", balance: 2 },
    } as any)
    mockPersistAuthUpdate.mockRejectedValueOnce(
      new Error("storage unavailable"),
    )

    const result = await refreshAccountData(
      createRequest({
        accountId: "account-1",
        includeTodayCashflow: false,
        sub2apiAuthSession: {
          getLatestAuth: (...args: any[]) => mockGetLatestAuth(...args),
          persistAuthUpdate: (...args: any[]) => mockPersistAuthUpdate(...args),
        },
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "1",
          accessToken: "old-access-token",
          refreshToken: "single-use-refresh-token",
          tokenExpiresAt: now + 60_000,
        },
      }),
    )

    expect(result.success).toBe(false)
    expect(result.healthStatus).toEqual({
      status: SiteHealthStatus.Warning,
      message: "messages:sub2api.authPersistenceFailed",
    })
    nowSpy.mockRestore()
  })

  it("returns the credential persistence warning when a stored account has no expected identity", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              access_token: "rotated-access-token",
              refresh_token: "rotated-refresh-token",
              expires_in: 3600,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    )

    const result = await refreshAccountData(
      createRequest({
        accountId: "account-1",
        includeTodayCashflow: false,
        sub2apiAuthSession: {
          getLatestAuth: (...args: any[]) => mockGetLatestAuth(...args),
          persistAuthUpdate: (...args: any[]) => mockPersistAuthUpdate(...args),
        },
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "old-access-token",
          refreshToken: "single-use-refresh-token",
          tokenExpiresAt: now + 60_000,
        },
      }),
    )

    expect(fetchApi).not.toHaveBeenCalled()
    expect(mockPersistAuthUpdate).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.healthStatus).toEqual({
      status: SiteHealthStatus.Warning,
      message: "messages:sub2api.authPersistenceFailed",
    })
    nowSpy.mockRestore()
  })

  it("skips persistence when refreshed credentials have no auth store", async () => {
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

    const result = await refreshAccountData(
      createRequest({
        accountId: "account-without-store",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "1",
          accessToken: "old-jwt",
          refreshToken: "old-refresh",
          tokenExpiresAt: now + 60_000,
        },
      }),
    )

    expect(result.success).toBe(true)
    expect(result.authUpdate?.accessToken).toBe("new-jwt")
    expect(mockPersistAuthUpdate).not.toHaveBeenCalled()

    nowSpy.mockRestore()
  })

  it("does not invoke a business mutation after rotated credentials fail to persist", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              access_token: "rotated-access-token",
              refresh_token: "rotated-refresh-token",
              expires_in: 3600,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    )
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: { id: 1, username: "example-user", balance: 1 },
    } as any)
    mockPersistAuthUpdate.mockResolvedValueOnce({ status: "write_failed" })

    const request = createRequest({
      accountId: "account-1",
      sub2apiAuthSession: {
        getLatestAuth: (...args: any[]) => mockGetLatestAuth(...args),
        persistAuthUpdate: (...args: any[]) => mockPersistAuthUpdate(...args),
      },
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "old-access-token",
        refreshToken: "single-use-refresh-token",
        tokenExpiresAt: now + 60_000,
      },
    })

    await expect(
      createApiToken(request, createTokenRequest({ group: "" })),
    ).rejects.toThrow("messages:sub2api.authPersistenceFailed")

    expect(fetchApi).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchApi).mock.calls[0]?.[1]).toMatchObject({
      endpoint: "/api/v1/auth/me",
    })
    expect(mockPersistAuthUpdate).toHaveBeenCalledTimes(1)
    nowSpy.mockRestore()
  })

  it("rejects refreshed credentials that resolve to another account identity", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              access_token: "other-user-access-token",
              refresh_token: "other-user-refresh-token",
              expires_in: 3600,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    )
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: { id: 2, username: "other-user", balance: 1 },
    } as any)

    const request = createRequest({
      accountId: "account-1",
      sub2apiAuthSession: {
        getLatestAuth: (...args: any[]) => mockGetLatestAuth(...args),
        persistAuthUpdate: (...args: any[]) => mockPersistAuthUpdate(...args),
      },
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "old-access-token",
        refreshToken: "single-use-refresh-token",
        tokenExpiresAt: now + 60_000,
      },
    })

    await expect(
      createApiToken(request, createTokenRequest({ group: "" })),
    ).rejects.toThrow("messages:sub2api.authPersistenceFailed")

    expect(fetchApi).toHaveBeenCalledTimes(1)
    expect(mockPersistAuthUpdate).not.toHaveBeenCalled()
    nowSpy.mockRestore()
  })

  it.each([
    {
      label: "identity",
      stored: {
        accessToken: "other-user-access-token",
        origin: "https://sub2.example.com",
        userId: "2",
      },
    },
    {
      label: "origin",
      stored: {
        accessToken: "other-origin-access-token",
        origin: "https://other.example.invalid",
        userId: "1",
      },
    },
  ])("rejects stored auth after account $label drift", async ({ stored }) => {
    mockGetLatestAuth.mockResolvedValueOnce(stored)
    const request = createRequest({
      accountId: "account-1",
      sub2apiAuthSession: {
        getLatestAuth: (...args: any[]) => mockGetLatestAuth(...args),
        persistAuthUpdate: (...args: any[]) => mockPersistAuthUpdate(...args),
      },
    })

    await expect(
      createApiToken(request, createTokenRequest({ group: "" })),
    ).rejects.toThrow("messages:sub2api.authPersistenceFailed")

    expect(fetchApi).not.toHaveBeenCalled()
    expect(mockPersistAuthUpdate).not.toHaveBeenCalled()
  })

  it("reports stored identity drift with the credential persistence warning", async () => {
    mockGetLatestAuth.mockResolvedValueOnce({
      accessToken: "other-user-access-token",
      origin: "https://sub2.example.com",
      userId: "2",
    })

    const result = await refreshAccountData(
      createRequest({
        accountId: "account-1",
        sub2apiAuthSession: {
          getLatestAuth: (...args: any[]) => mockGetLatestAuth(...args),
          persistAuthUpdate: (...args: any[]) => mockPersistAuthUpdate(...args),
        },
      }),
    )

    expect(fetchApi).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: false,
      healthStatus: {
        status: SiteHealthStatus.Warning,
        message: "messages:sub2api.authPersistenceFailed",
      },
    })
  })

  it("reports browser-session identity drift with the credential persistence warning", async () => {
    vi.mocked(fetchApi).mockRejectedValueOnce(
      new ApiError("Unauthorized", 401, "/api/v1/auth/me"),
    )
    vi.mocked(resyncSub2ApiAuthToken).mockRejectedValueOnce(
      new Sub2ApiAuthIdentityMismatchError(),
    )

    const result = await refreshAccountData(createRequest())

    expect(result).toEqual({
      success: false,
      healthStatus: {
        status: SiteHealthStatus.Warning,
        message: "messages:sub2api.authPersistenceFailed",
      },
    })
  })

  it("reports a resynced browser session with no account identity as non-persistable", async () => {
    vi.mocked(fetchApi).mockRejectedValueOnce(
      new ApiError("Unauthorized", 401, "/api/v1/auth/me"),
    )
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "identity-missing-access-token",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })

    const result = await refreshAccountData(
      createRequest({
        accountId: "account-1",
        sub2apiAuthSession: {
          getLatestAuth: (...args: any[]) => mockGetLatestAuth(...args),
          persistAuthUpdate: (...args: any[]) => mockPersistAuthUpdate(...args),
        },
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "old-access-token",
        },
      }),
    )

    expect(mockPersistAuthUpdate).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: false,
      healthStatus: {
        status: SiteHealthStatus.Warning,
        message: "messages:sub2api.authPersistenceFailed",
      },
    })
  })

  it("reports identity drift found while resyncing after refresh-token rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ code: 401, message: "invalid refresh token" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          ),
        ),
    )
    vi.mocked(fetchApi).mockRejectedValueOnce(
      new ApiError("Unauthorized", 401, "/api/v1/auth/me"),
    )
    vi.mocked(resyncSub2ApiAuthToken).mockRejectedValueOnce(
      new Sub2ApiAuthIdentityMismatchError(),
    )

    const result = await refreshAccountData(
      createRequest({
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "1",
          accessToken: "old-access-token",
          refreshToken: "invalid-refresh-token",
        },
      }),
    )

    expect(result).toEqual({
      success: false,
      healthStatus: {
        status: SiteHealthStatus.Warning,
        message: "messages:sub2api.authPersistenceFailed",
      },
    })
  })

  it("hydrates an account whose stored auth has not yet learned an identity", async () => {
    mockGetLatestAuth.mockResolvedValueOnce({
      accessToken: "stored-access-token",
      origin: "https://sub2.example.com",
    })
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: { id: 1, username: "alice", balance: 2 },
    } as any)

    const result = await refreshAccountData(
      createRequest({
        accountId: "account-1",
        includeTodayCashflow: false,
        sub2apiAuthSession: {
          getLatestAuth: (...args: any[]) => mockGetLatestAuth(...args),
          persistAuthUpdate: (...args: any[]) => mockPersistAuthUpdate(...args),
        },
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "request-access-token",
        },
      }),
    )

    expect((vi.mocked(fetchApi).mock.calls[0]?.[0] as any)?.auth).toMatchObject(
      {
        accessToken: "stored-access-token",
      },
    )
    expect(result.success).toBe(true)
    expect(result.authUpdate?.userId).toBe("1")
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
        userId: "1",
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
        userId: "1",
        accessToken: "old-jwt",
        refreshToken: "old-refresh",
      },
    })

    const result = await refreshAccountData(request)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()

    expect(result.success).toBe(true)
    expect(result.data?.quota).toBe(500_000)
    expect(result.authUpdate?.accessToken).toBe("new-jwt")
    expect(result.authUpdate?.sub2apiAuth).toEqual({
      refreshToken: "new-refresh",
      tokenExpiresAt: now + 3600 * 1000,
    })
    expect(result.authUpdate?.userId).toBe("2")
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
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })

    const request = createRequest({
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "old-jwt",
        refreshToken: "old-refresh",
      },
    })

    const tokens = await fetchAccountTokens(request)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: request.baseUrl,
        expectedUserId: "1",
      }),
    )
    expect(
      (vi.mocked(fetchApi).mock.calls[1]?.[0] as any)?.auth?.accessToken,
    ).toBe("resynced-jwt")
    expect(tokens).toHaveLength(1)
    expect(tokens[0]).toMatchObject({
      key: "sub2api-token",
      group: "default",
    })
  })

  it("preserves the original refresh failure when browser-session resync also fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValueOnce(new Error("refresh response unavailable")),
    )
    vi.mocked(fetchApi).mockRejectedValueOnce(
      new ApiError("Unauthorized", 401, "/api/v1/keys"),
    )
    vi.mocked(resyncSub2ApiAuthToken).mockRejectedValueOnce(
      new Error("browser session unavailable"),
    )

    const failure = await fetchAccountTokens(
      createRequest({
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "1",
          accessToken: "old-access-token",
          refreshToken: "single-use-refresh-token",
        },
      }),
    ).catch((error) => error)

    expect(failure).toBeInstanceOf(Sub2ApiTokenRefreshError)
    expect(failure).toMatchObject({
      reason: SUB2API_TOKEN_REFRESH_FAILURE_REASONS.UNCERTAIN_ROTATION,
    })
    expect(fetchApi).toHaveBeenCalledTimes(1)
    expect(resyncSub2ApiAuthToken).toHaveBeenCalledTimes(1)
  })

  it("recovers a lost refresh-token response only through identity-checked resync", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            access_token: "rotated-access-without-pair",
            expires_in: 3600,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock as any)
    vi.mocked(fetchApi)
      .mockRejectedValueOnce(new ApiError("Unauthorized", 401, "/api/v1/keys"))
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {
          items: [
            {
              id: 1,
              name: "Recovered key",
              key: "recovered-key",
              enabled: true,
              quota: 0,
              used_quota: 0,
              group: { name: "default" },
            },
          ],
        },
      } as any)
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "identity-checked-access-token",
      userId: "1",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })

    const tokens = await fetchAccountTokens(
      createRequest({
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "1",
          accessToken: "old-access-token",
          refreshToken: "single-use-refresh-token",
        },
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://sub2.example.com",
        expectedUserId: "1",
      }),
    )
    expect(tokens).toHaveLength(1)
  })

  it("does not use stale auth after a proactive refresh response is lost", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValueOnce(new Error("network down")),
    )
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "identity-checked-access-token",
      userId: "1",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: { items: [] },
    } as any)

    await fetchAccountTokens(
      createRequest({
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "1",
          accessToken: "old-access-token",
          refreshToken: "single-use-refresh-token",
          tokenExpiresAt: now + 60_000,
        },
      }),
    )

    expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://sub2.example.com",
        expectedUserId: "1",
      }),
    )
    expect(fetchApi).toHaveBeenCalledTimes(1)
    expect(
      (vi.mocked(fetchApi).mock.calls[0]?.[0] as any).auth.accessToken,
    ).toBe("identity-checked-access-token")
    nowSpy.mockRestore()
  })

  it("uses the current access token after a conclusive proactive key refresh rejection", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ code: 401, message: "invalid refresh token" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          ),
        ),
    )
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: { items: [] },
    } as any)

    await fetchAccountTokens(
      createRequest({
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "1",
          accessToken: "current-access-token",
          refreshToken: "invalid-refresh-token",
          tokenExpiresAt: now + 60_000,
        },
      }),
    )

    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
    expect(
      (vi.mocked(fetchApi).mock.calls[0]?.[0] as any).auth.accessToken,
    ).toBe("current-access-token")
    nowSpy.mockRestore()
  })

  it("persists supplemental credentials returned by browser-session re-sync", async () => {
    const tokenExpiresAt = 1_700_003_600_000
    vi.mocked(fetchApi)
      .mockRejectedValueOnce(new ApiError("Unauthorized", 401, "/api/v1/keys"))
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { items: [] },
      } as any)
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "resynced-access-token",
      userId: "1",
      sub2apiAuth: {
        refreshToken: "resynced-refresh-token",
        tokenExpiresAt,
      },
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })

    await fetchAccountTokens(
      createRequest({
        accountId: "account-1",
        sub2apiAuthSession: {
          getLatestAuth: (...args: any[]) => mockGetLatestAuth(...args),
          persistAuthUpdate: (...args: any[]) => mockPersistAuthUpdate(...args),
        },
      }),
    )

    expect(mockPersistAuthUpdate).toHaveBeenCalledWith("account-1", {
      accessToken: "resynced-access-token",
      refreshToken: "resynced-refresh-token",
      tokenExpiresAt,
      expectedOrigin: "https://sub2.example.com",
      expectedUserId: "1",
      userId: "1",
    })
    expect((vi.mocked(fetchApi).mock.calls[1]?.[0] as any).auth).toMatchObject({
      accessToken: "resynced-access-token",
      refreshToken: "resynced-refresh-token",
      tokenExpiresAt,
      userId: "1",
    })
  })

  it("does not replay a business request after its refreshed retry fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              access_token: "refreshed-access-token",
              refresh_token: "rotated-refresh-token",
              expires_in: 3600,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    )
    vi.mocked(fetchApi)
      .mockRejectedValueOnce(new ApiError("Unauthorized", 401, "/api/v1/keys"))
      .mockRejectedValueOnce(new ApiError("Unauthorized", 401, "/api/v1/keys"))

    await expect(
      fetchAccountTokens(
        createRequest({
          auth: {
            authType: AuthTypeEnum.AccessToken,
            userId: "1",
            accessToken: "old-access-token",
            refreshToken: "single-use-refresh-token",
          },
        }),
      ),
    ).rejects.toMatchObject({
      message: "messages:sub2api.loginRequired",
      code: API_ERROR_CODES.HTTP_401,
    })

    expect(fetchApi).toHaveBeenCalledTimes(2)
    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
  })

  it("preserves a non-auth business failure from the single refreshed retry", async () => {
    const businessFailure = new ApiError(
      "upstream unavailable",
      503,
      "/api/v1/keys",
    )
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: {
              access_token: "refreshed-access-token",
              refresh_token: "rotated-refresh-token",
              expires_in: 3600,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    )
    vi.mocked(fetchApi)
      .mockRejectedValueOnce(new ApiError("Unauthorized", 401, "/api/v1/keys"))
      .mockRejectedValueOnce(businessFailure)

    await expect(
      fetchAccountTokens(
        createRequest({
          auth: {
            authType: AuthTypeEnum.AccessToken,
            userId: "1",
            accessToken: "old-access-token",
            refreshToken: "single-use-refresh-token",
          },
        }),
      ),
    ).rejects.toBe(businessFailure)

    expect(fetchApi).toHaveBeenCalledTimes(2)
    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
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
        userId: "1",
        accessToken: "old-jwt",
        refreshToken: "old-refresh",
      },
    })

    await expect(fetchAccountTokens(request)).rejects.toMatchObject({
      message: "messages:sub2api.refreshTokenInvalid",
      code: API_ERROR_CODES.HTTP_401,
      upstreamCode: "sub2api_refresh_token_invalid",
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
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
    })

    const request = createRequest({
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "old-jwt",
        refreshToken: "old-refresh",
      },
    })

    const result = await refreshAccountData(request)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: request.baseUrl,
        expectedUserId: "1",
      }),
    )
    expect(
      (vi.mocked(fetchApi).mock.calls[1]?.[0] as any)?.auth?.accessToken,
    ).toBe("resynced-jwt")
    expect(result.success).toBe(true)
    expect(result.authUpdate?.accessToken).toBe("resynced-jwt")
    expect(result.authUpdate?.userId).toBe("2")
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
        userId: "1",
        accessToken: "old-jwt",
        refreshToken: "old-refresh",
      },
    })

    const result = await refreshAccountData(request)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: request.baseUrl,
        expectedUserId: "1",
      }),
    )
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

    mockGetLatestAuth.mockResolvedValueOnce({
      accessToken: "stored-jwt",
      userId: "9",
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

    vi.mocked(fetchApi)
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { id: 9, username: "stored-user", balance: 3 },
      } as any)
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { id: 9, username: "stored-user", balance: 3 },
      } as any)

    const result = await refreshAccountData(
      createRequest({
        accountId: "account-1",
        sub2apiAuthSession: {
          getLatestAuth: (...args: any[]) => mockGetLatestAuth(...args),
          persistAuthUpdate: (...args: any[]) => mockPersistAuthUpdate(...args),
        },
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "stale-request-jwt",
        },
      }),
    )

    expect(mockGetLatestAuth).toHaveBeenCalledWith("account-1")
    expect((vi.mocked(fetchApi).mock.calls[0]?.[0] as any)?.auth).toMatchObject(
      {
        accessToken: "new-jwt",
        refreshToken: "new-refresh",
        tokenExpiresAt: now + 3600 * 1000,
        userId: "9",
      },
    )
    expect(mockPersistAuthUpdate).toHaveBeenCalledWith("account-1", {
      accessToken: "new-jwt",
      refreshToken: "new-refresh",
      tokenExpiresAt: now + 3600 * 1000,
      expectedOrigin: "https://sub2.example.com",
      expectedUserId: "9",
      userId: "9",
    })
    expect(result.success).toBe(true)
    expect(result.authUpdate?.userId).toBe("9")
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
    mockGetLatestAuth.mockReset()
    mockPersistAuthUpdate.mockReset()
    mockGetLatestAuth.mockResolvedValue(null)
    mockPersistAuthUpdate.mockResolvedValue({ status: "persisted" })
  })

  const baseRequest = {
    baseUrl: "https://sub2.example.com",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      userId: "7",
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

  it("checks the public flag before fetching and encoding the affiliate code", async () => {
    const abortDeadline = {
      signal: new AbortController().signal,
      start: vi.fn(),
      dispose: vi.fn(),
    }
    vi.mocked(fetchApi)
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { affiliate_enabled: true },
      } as any)
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { aff_code: "  code/with spaces?  " },
      } as any)

    await expect(
      fetchInviteLink({
        ...baseRequest,
        baseUrl: "https://sub2.example.invalid/console",
        abortDeadline,
      } as any),
    ).resolves.toBe(
      "https://sub2.example.invalid/register?aff=code%2Fwith%20spaces%3F",
    )

    expect(vi.mocked(fetchApi)).toHaveBeenCalledTimes(2)
    const publicSettingsRequest = vi.mocked(fetchApi).mock.calls[0]?.[0]
    expect(publicSettingsRequest?.abortDeadline).toBe(abortDeadline)
    expect(publicSettingsRequest?.baseUrl).toBe(
      "https://sub2.example.invalid/console",
    )
    expect(publicSettingsRequest?.auth).toEqual({
      authType: AuthTypeEnum.None,
    })
    expect((vi.mocked(fetchApi).mock.calls[0]?.[1] as any)?.endpoint).toBe(
      "/api/v1/settings/public",
    )
    expect(vi.mocked(fetchApi).mock.calls[1]?.[0]).toMatchObject({
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "jwt-token",
      },
    })
    expect(vi.mocked(fetchApi).mock.calls[1]?.[0]?.abortDeadline).toBe(
      abortDeadline,
    )
    expect((vi.mocked(fetchApi).mock.calls[1]?.[1] as any)?.endpoint).toBe(
      "/api/v1/user/aff",
    )
  })

  it("does not reset one invite-link deadline through an authenticated 401 retry", async () => {
    vi.useFakeTimers()
    const abortDeadline = createDeferredAbortDeadline(1_000)
    let callCount = 0
    vi.mocked(fetchApi).mockImplementation(async (request) => {
      if (request.abortSignal?.aborted) {
        throw request.abortSignal.reason
      }

      request.abortDeadline?.start()
      callCount += 1

      if (callCount === 1) {
        await vi.advanceTimersByTimeAsync(900)
        return {
          code: 0,
          message: "ok",
          data: { affiliate_enabled: true },
        } as any
      }

      if (callCount === 2) {
        await vi.advanceTimersByTimeAsync(100)
        throw new ApiError("Unauthorized", 401, "/api/v1/user/aff")
      }

      return {
        code: 0,
        message: "ok",
        data: { aff_code: "unexpected-retry" },
      } as any
    })
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "retry-jwt",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })

    try {
      await expect(
        fetchInviteLink({
          ...baseRequest,
          baseUrl: "https://sub2.example.invalid",
          abortSignal: abortDeadline.signal,
          abortDeadline,
        } as any),
      ).rejects.toMatchObject({ name: "TimeoutError" })

      expect(vi.mocked(fetchApi)).toHaveBeenCalledTimes(3)
      for (const [request] of vi.mocked(fetchApi).mock.calls) {
        expect(request.abortDeadline).toBe(abortDeadline)
      }
      expect(
        vi
          .mocked(fetchApi)
          .mock.calls.map(
            ([, options]) => (options as { endpoint: string }).endpoint,
          ),
      ).toEqual([
        "/api/v1/settings/public",
        "/api/v1/user/aff",
        "/api/v1/user/aff",
      ])
      expect(vi.mocked(fetchApi).mock.calls[2]?.[0]?.auth.accessToken).toBe(
        "retry-jwt",
      )
      expect(abortDeadline.signal.aborted).toBe(true)
    } finally {
      abortDeadline.dispose()
      vi.useRealTimers()
    }
  })

  it.each([
    ["missing data", { code: 0, message: "ok" }],
    ["null data", { code: 0, message: "ok", data: null }],
    ["array data", { code: 0, message: "ok", data: [] }],
    ["missing flag", { code: 0, message: "ok", data: {} }],
    [
      "non-boolean flag",
      { code: 0, message: "ok", data: { affiliate_enabled: "true" } },
    ],
  ])(
    "rejects affiliate links for %s without calling the authenticated endpoint",
    async (_label, publicSettingsEnvelope) => {
      vi.mocked(fetchApi).mockResolvedValueOnce(publicSettingsEnvelope as any)

      await expect(
        fetchInviteLink({
          ...baseRequest,
          baseUrl: "https://sub2.example.invalid",
        } as any),
      ).rejects.toMatchObject({
        reason: INVITE_LINK_FAILURE_REASONS.InvalidResponse,
      })

      expect(vi.mocked(fetchApi)).toHaveBeenCalledTimes(1)
      expect((vi.mocked(fetchApi).mock.calls[0]?.[1] as any)?.endpoint).toBe(
        "/api/v1/settings/public",
      )
    },
  )

  it("classifies an explicitly disabled affiliate feature", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: { affiliate_enabled: false },
    } as any)

    await expect(
      fetchInviteLink({
        ...baseRequest,
        baseUrl: "https://sub2.example.invalid",
      } as any),
    ).rejects.toMatchObject({
      reason: INVITE_LINK_FAILURE_REASONS.FeatureDisabled,
    })

    expect(vi.mocked(fetchApi)).toHaveBeenCalledTimes(1)
  })

  it("preserves public-settings business errors", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 41,
      message: "public settings unavailable",
    } as any)

    await expect(
      fetchInviteLink({
        ...baseRequest,
        baseUrl: "https://sub2.example.invalid",
      } as any),
    ).rejects.toMatchObject({
      message: "public settings unavailable",
      code: API_ERROR_CODES.BUSINESS_ERROR,
    })
    expect(vi.mocked(fetchApi)).toHaveBeenCalledTimes(1)
  })

  it("classifies malformed public-settings envelopes as invalid responses", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({ message: "ok" } as any)

    await expect(
      fetchInviteLink({
        ...baseRequest,
        baseUrl: "https://sub2.example.invalid",
      } as any),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
    })
    expect(vi.mocked(fetchApi)).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["missing data", { code: 0, message: "ok" }],
    ["null data", { code: 0, message: "ok", data: null }],
    ["array data", { code: 0, message: "ok", data: [] }],
    ["missing code", { code: 0, message: "ok", data: {} }],
    ["non-string code", { code: 0, message: "ok", data: { aff_code: 7 } }],
    ["blank code", { code: 0, message: "ok", data: { aff_code: "   " } }],
  ])("rejects %s from the affiliate endpoint", async (_label, affEnvelope) => {
    vi.mocked(fetchApi)
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { affiliate_enabled: true },
      } as any)
      .mockResolvedValueOnce(affEnvelope as any)

    await expect(
      fetchInviteLink({
        ...baseRequest,
        baseUrl: "https://sub2.example.invalid",
      } as any),
    ).rejects.toMatchObject({
      reason: INVITE_LINK_FAILURE_REASONS.InviteDataMissing,
    })

    expect(vi.mocked(fetchApi)).toHaveBeenCalledTimes(2)
  })

  it("preserves authenticated affiliate business errors", async () => {
    vi.mocked(fetchApi)
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { affiliate_enabled: true },
      } as any)
      .mockResolvedValueOnce({
        code: 42,
        message: "affiliate unavailable",
      } as any)

    await expect(
      fetchInviteLink({
        ...baseRequest,
        baseUrl: "https://sub2.example.invalid",
      } as any),
    ).rejects.toMatchObject({
      message: "affiliate unavailable",
      code: API_ERROR_CODES.BUSINESS_ERROR,
    })
    expect(vi.mocked(fetchApi)).toHaveBeenCalledTimes(2)
  })

  it("preserves authenticated affiliate auth errors", async () => {
    vi.mocked(fetchApi)
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: { affiliate_enabled: true },
      } as any)
      .mockRejectedValueOnce(
        new ApiError("Unauthorized", 401, "/api/v1/user/aff"),
      )
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce(null)

    await expect(
      fetchInviteLink({
        ...baseRequest,
        baseUrl: "https://sub2.example.invalid",
      } as any),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.HTTP_401,
      endpoint: "/api/v1/user/aff",
    })
    expect(vi.mocked(fetchApi)).toHaveBeenCalledTimes(2)
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

  it("fetchUserInfo returns the shared compatibility shape from /api/v1/auth/me", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: {
        id: 12,
        username: "alice",
        email: "alice@example.com",
        balance: "1.5",
      },
    } as any)

    await expect(
      fetchUserInfo({
        baseUrl: "https://sub2.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "jwt-token",
        },
      }),
    ).resolves.toEqual({
      id: "12",
      username: "alice",
      access_token: "jwt-token",
      user: {
        id: "12",
        username: "alice",
        access_token: "jwt-token",
        email: "alice@example.com",
        balance: "1.5",
      },
    })

    expect(fetchApi).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          authType: AuthTypeEnum.AccessToken,
          accessToken: "jwt-token",
        }),
      }),
      expect.objectContaining({
        endpoint: "/api/v1/auth/me",
        options: expect.objectContaining({
          method: "GET",
          cache: "no-store",
        }),
      }),
      true,
    )
  })

  it("getOrCreateAccessToken reuses the existing Sub2API JWT when present", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: {
        id: 12,
        username: "alice",
        email: "alice@example.com",
        balance: "1.5",
      },
    } as any)

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://sub2.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "jwt-token",
        },
      }),
    ).resolves.toEqual({
      username: "alice",
      access_token: "jwt-token",
    })

    expect(fetchApi).toHaveBeenCalledTimes(1)
    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
  })

  it("getOrCreateAccessToken refreshes the Sub2API JWT when only refresh token state is usable", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            access_token: "refreshed-jwt",
            refresh_token: "rotated-refresh",
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
      data: {
        id: 12,
        username: "alice",
        email: "alice@example.com",
        balance: "1.5",
      },
    } as any)

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://sub2.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "",
          refreshToken: "stored-refresh",
          tokenExpiresAt: now - 1,
        },
      }),
    ).resolves.toEqual({
      username: "alice",
      access_token: "refreshed-jwt",
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
    nowSpy.mockRestore()
  })

  it("recovers through the browser when refresh-token restore fails without an access token", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network down"))
    vi.stubGlobal("fetch", fetchMock as any)
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "browser-recovered-jwt",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: {
        id: 12,
        username: "alice",
        email: "alice@example.invalid",
        balance: "1.5",
      },
    } as any)

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://sub2.example.invalid",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "",
          refreshToken: "stored-refresh",
        },
      }),
    ).resolves.toEqual({
      username: "alice",
      access_token: "browser-recovered-jwt",
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(resyncSub2ApiAuthToken).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchApi).mock.calls[0]?.[0].auth).not.toHaveProperty(
      "refreshToken",
    )
  })

  it("getOrCreateAccessToken falls back to browser-session re-sync when proactive refresh fails", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)
    const fetchMock = vi.fn().mockRejectedValue(new Error("refresh failed"))
    vi.stubGlobal("fetch", fetchMock as any)
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "resynced-jwt",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: {
        id: 12,
        username: "alice",
        email: "alice@example.com",
        balance: "1.5",
      },
    } as any)

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://sub2.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "expired-jwt",
          refreshToken: "stored-refresh",
          tokenExpiresAt: now - 1,
        },
      }),
    ).resolves.toEqual({
      username: "alice",
      access_token: "resynced-jwt",
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://sub2.example.com",
      }),
    )
    expect((vi.mocked(fetchApi).mock.calls[0]?.[0] as any)?.auth).toMatchObject(
      {
        accessToken: "resynced-jwt",
      },
    )
    nowSpy.mockRestore()
  })

  it("getOrCreateAccessToken refreshes and retries when a JWT without expiry metadata is stale", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          message: "ok",
          data: {
            access_token: "refreshed-jwt",
            refresh_token: "rotated-refresh",
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
        data: {
          id: 12,
          username: "alice",
          email: "alice@example.com",
          balance: "1.5",
        },
      } as any)

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://sub2.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "stale-jwt",
          refreshToken: "stored-refresh",
        },
      }),
    ).resolves.toEqual({
      username: "alice",
      access_token: "refreshed-jwt",
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchApi).toHaveBeenCalledTimes(2)
    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
    expect(
      (vi.mocked(fetchApi).mock.calls[1]?.[0] as any)?.auth?.accessToken,
    ).toBe("refreshed-jwt")
    nowSpy.mockRestore()
  })

  it("getOrCreateAccessToken falls back to browser-session re-sync when refresh token restore fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"))
    vi.stubGlobal("fetch", fetchMock as any)

    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "resynced-jwt",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })

    vi.mocked(fetchApi)
      .mockRejectedValueOnce(
        new ApiError("Unauthorized", 401, "/api/v1/auth/me"),
      )
      .mockResolvedValueOnce({
        code: 0,
        message: "ok",
        data: {
          id: 12,
          username: "alice",
          email: "alice@example.com",
          balance: "1.5",
        },
      } as any)

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://sub2.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "expired-jwt",
          refreshToken: "stored-refresh",
        },
      }),
    ).resolves.toEqual({
      username: "alice",
      access_token: "resynced-jwt",
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://sub2.example.com",
      }),
    )
    expect(fetchApi).toHaveBeenCalledTimes(2)
    expect(
      (vi.mocked(fetchApi).mock.calls[1]?.[0] as any)?.auth?.accessToken,
    ).toBe("resynced-jwt")
  })

  it("getOrCreateAccessToken falls back to browser-session re-sync when no refresh token is available", async () => {
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "resynced-jwt",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })

    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: {
        id: 12,
        username: "alice",
        email: "alice@example.com",
        balance: "1.5",
      },
    } as any)

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://sub2.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "",
        },
      }),
    ).resolves.toEqual({
      username: "alice",
      access_token: "resynced-jwt",
    })

    expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://sub2.example.com",
      }),
    )
  })

  it("getOrCreateAccessToken returns login-required when re-sync is unavailable", async () => {
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce(null)

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://sub2.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "",
        },
      }),
    ).rejects.toMatchObject({
      message: "messages:sub2api.loginRequired",
      code: API_ERROR_CODES.HTTP_401,
    })

    expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://sub2.example.com",
      }),
    )
  })

  it("getOrCreateAccessToken converts 401 after re-sync into login-required", async () => {
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "resynced-jwt",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    vi.mocked(fetchApi).mockRejectedValueOnce(
      new ApiError("still unauthorized", 401, "/api/v1/auth/me"),
    )

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://sub2.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "",
        },
      }),
    ).rejects.toMatchObject({
      message: "messages:sub2api.loginRequired",
      code: API_ERROR_CODES.HTTP_401,
    })
  })

  it("getOrCreateAccessToken preserves non-auth errors after re-sync retry", async () => {
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "resynced-jwt",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    vi.mocked(fetchApi).mockRejectedValueOnce(new Error("server exploded"))

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://sub2.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "",
        },
      }),
    ).rejects.toThrow("server exploded")
  })

  it("fetches account data without reshaping canonical check-in state", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: { id: "7", username: "alice", balance: 1.5 },
    } as any)

    const checkIn = {
      ...createCheckInConfig(SITE_TYPES.SUB2API, { matched: false }),
      customCheckIn: { url: "", redeemUrl: "", openRedeemWithCheckIn: true },
    }
    const result = await fetchAccountData({
      ...baseRequest,
      siteType: SITE_TYPES.SUB2API,
      checkIn,
    } as any)

    expect(result).toMatchObject({
      quota: 750000,
      today_quota_consumption: 0,
      today_income: 0,
      checkIn,
    })
  })

  it("maps the public Sub2API site name into the account status contract", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: { site_name: "  Example Portal  " },
    } as any)

    await expect(fetchSiteStatus(baseRequest as any)).resolves.toEqual({
      system_name: "Example Portal",
      checkin_enabled: false,
    })

    expect(vi.mocked(fetchApi)).toHaveBeenCalledWith(
      {
        ...baseRequest,
        auth: { authType: AuthTypeEnum.None },
      },
      {
        endpoint: "/api/v1/settings/public",
        options: { method: "GET", cache: "no-store" },
      },
      true,
    )
  })

  it("keeps synthetic status when public settings have no site name", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: { site_name: null },
    } as any)

    await expect(fetchSiteStatus(baseRequest as any)).resolves.toEqual({
      checkin_enabled: false,
    })
  })

  it("keeps synthetic Sub2API status when the optional public name lookup fails", async () => {
    vi.mocked(fetchApi).mockRejectedValueOnce(
      new Error("public settings unavailable"),
    )

    await expect(fetchSiteStatus(baseRequest as any)).resolves.toEqual({
      checkin_enabled: false,
    })
  })

  it("reuses the common exchange-rate extraction contract for status payloads", () => {
    expect(
      extractDefaultExchangeRate({
        checkin_enabled: false,
        price: 7.2,
      } as any),
    ).toBe(7.2)
    expect(extractDefaultExchangeRate({ checkin_enabled: false } as any)).toBe(
      null,
    )
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

  it("rethrows update-token failures after logging the Sub2API context", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({
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
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 0,
      message: "ok",
      data: [{ id: 2, name: "vip" }],
    } as any)
    vi.mocked(fetchApi).mockRejectedValueOnce(new Error("put failed"))

    await expect(
      updateApiToken(
        baseRequest as any,
        9,
        createOperationTokenRequest({
          group: "vip",
          unlimited_quota: false,
        }),
      ),
    ).rejects.toThrow("put failed")
  })

  it("rethrows delete-token failures after the upstream delete call rejects", async () => {
    vi.mocked(fetchApi).mockRejectedValueOnce(new Error("delete failed"))

    await expect(deleteApiToken(baseRequest as any, 12)).rejects.toThrow(
      "delete failed",
    )
  })

  it("rethrows token-detail and group-fetch failures after logging the Sub2API context", async () => {
    vi.mocked(fetchApi).mockRejectedValueOnce(new Error("detail failed"))

    await expect(fetchTokenById(baseRequest as any, 9)).rejects.toThrow(
      "detail failed",
    )

    vi.mocked(fetchApi).mockRejectedValueOnce(new Error("groups failed"))
    await expect(fetchUserGroups(baseRequest as any)).rejects.toThrow(
      "groups failed",
    )
  })

  it("returns an empty model list for Sub2API managed accounts", async () => {
    await expect(
      fetchAccountAvailableModels(baseRequest as any),
    ).resolves.toEqual([])
  })

  describe("fetchSub2ApiRuntimeModels", () => {
    const createRuntimeRequest = (
      overrides: Partial<ApiServiceAccountRequest> = {},
    ): ApiServiceAccountRequest =>
      ({
        baseUrl: "https://sub2.example.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          apiKey: "runtime-api-key",
        },
        ...overrides,
      }) as ApiServiceAccountRequest

    it("fetches OpenAI-style runtime models with bearer API-key auth", async () => {
      const abortController = new AbortController()
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            object: "list",
            data: [
              {
                id: "example-runtime-model",
                object: "model",
                created: 1_700_000_000,
                owned_by: "example",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      vi.stubGlobal("fetch", fetchMock as any)

      await expect(
        fetchSub2ApiRuntimeModels(
          createRuntimeRequest({ abortSignal: abortController.signal }),
        ),
      ).resolves.toEqual(["example-runtime-model"])

      expect(fetchMock).toHaveBeenCalledWith(
        "https://sub2.example.com/v1/models",
        expect.objectContaining({
          method: "GET",
          cache: "no-store",
          signal: abortController.signal,
          headers: expect.objectContaining({
            Authorization: "Bearer runtime-api-key",
          }),
        }),
      )
      expect(fetchApi).not.toHaveBeenCalled()
      expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
    })

    it("fetches Sub2API-style runtime models and normalizes IDs", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "example-runtime-model",
                display_name: "Example Runtime Model",
                created_at: "2026-06-14T00:00:00.000Z",
              },
              {
                id: " second-runtime-model ",
                display_name: "Second Runtime Model",
                created_at: 1_700_000_000,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      vi.stubGlobal("fetch", fetchMock as any)

      await expect(
        fetchSub2ApiRuntimeModels(createRuntimeRequest()),
      ).resolves.toEqual(["example-runtime-model", "second-runtime-model"])
    })

    it("returns an empty list when the runtime model data list is empty", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock as any)

      await expect(
        fetchSub2ApiRuntimeModels(createRuntimeRequest()),
      ).resolves.toEqual([])
    })

    it("rejects malformed runtime model payloads with a validation error", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: "" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock as any)

      await expect(
        fetchSub2ApiRuntimeModels(createRuntimeRequest()),
      ).rejects.toMatchObject({
        message: "messages:errors.api.invalidResponseFormat",
        code: API_ERROR_CODES.BUSINESS_ERROR,
      })
    })

    it("rejects invalid JSON runtime model responses with a validation error", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response("<html>not json</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock as any)

      await expect(
        fetchSub2ApiRuntimeModels(createRuntimeRequest()),
      ).rejects.toMatchObject({
        message: "messages:errors.api.invalidResponseFormat",
        code: API_ERROR_CODES.BUSINESS_ERROR,
      })
    })

    it("treats runtime 401 and 403 responses as API-key auth failures", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
        .mockResolvedValueOnce(new Response("Forbidden", { status: 403 }))
      vi.stubGlobal("fetch", fetchMock as any)

      await expect(
        fetchSub2ApiRuntimeModels(createRuntimeRequest()),
      ).rejects.toMatchObject({
        code: API_ERROR_CODES.HTTP_401,
      })

      await expect(
        fetchSub2ApiRuntimeModels(createRuntimeRequest()),
      ).rejects.toMatchObject({
        code: API_ERROR_CODES.HTTP_401,
      })
    })

    it("surfaces non-auth runtime model HTTP failures with endpoint context", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response("Gateway timeout", {
          status: 504,
          statusText: "",
        }),
      )
      vi.stubGlobal("fetch", fetchMock as any)

      await expect(
        fetchSub2ApiRuntimeModels(createRuntimeRequest()),
      ).rejects.toMatchObject({
        message: "Sub2API runtime model request failed",
        statusCode: 504,
        code: API_ERROR_CODES.HTTP_OTHER,
        endpoint: "/v1/models",
      })
    })

    it("logs and rethrows network failures from the runtime model endpoint", async () => {
      const networkError = new Error("network down")
      const fetchMock = vi.fn().mockRejectedValueOnce(networkError)
      vi.stubGlobal("fetch", fetchMock as any)

      await expect(
        fetchSub2ApiRuntimeModels(
          createRuntimeRequest({
            accountId: "account-runtime",
          }),
        ),
      ).rejects.toBe(networkError)
    })

    it("surfaces Sub2API runtime business errors before auth fallbacks", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "GROUP_DELETED",
            message: "API Key 所属分组已删除",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      )
      vi.stubGlobal("fetch", fetchMock as any)

      await expect(
        fetchSub2ApiRuntimeModels(createRuntimeRequest()),
      ).rejects.toMatchObject({
        message: "API Key 所属分组已删除",
        code: API_ERROR_CODES.BUSINESS_ERROR,
        endpoint: "/v1/models",
      })
    })

    it("rejects dashboard access tokens without calling the runtime model endpoint", async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock as any)

      await expect(
        fetchSub2ApiRuntimeModels(
          createRuntimeRequest({
            auth: {
              authType: AuthTypeEnum.AccessToken,
              accessToken: "dashboard-jwt",
            },
          }),
        ),
      ).rejects.toMatchObject({
        code: API_ERROR_CODES.HTTP_401,
      })

      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  it("reuses newer stored auth instead of refreshing again when account storage already rotated the JWT", async () => {
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)

    mockGetLatestAuth
      .mockResolvedValueOnce({
        accessToken: "old-jwt",
        userId: "7",
        sub2apiAuth: {
          refreshToken: "old-refresh",
          tokenExpiresAt: now + 3600 * 1000,
        },
      })
      .mockResolvedValueOnce({
        accessToken: "external-jwt",
        userId: "7",
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
        sub2apiAuthSession: {
          getLatestAuth: (...args: any[]) => mockGetLatestAuth(...args),
          persistAuthUpdate: (...args: any[]) => mockPersistAuthUpdate(...args),
        },
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
        userId: "7",
      },
    )

    nowSpy.mockRestore()
  })

  it("reuses newer stored auth instead of opening a browser recovery context", async () => {
    mockGetLatestAuth
      .mockResolvedValueOnce({
        accessToken: "old-jwt",
        origin: "https://sub2.example.com",
        userId: "7",
      })
      .mockResolvedValueOnce({
        accessToken: "newer-stored-jwt",
        origin: "https://sub2.example.com",
        userId: "7",
      })
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
        sub2apiAuthSession: {
          getLatestAuth: (...args: any[]) => mockGetLatestAuth(...args),
          persistAuthUpdate: (...args: any[]) => mockPersistAuthUpdate(...args),
        },
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "7",
          accessToken: "old-jwt",
        },
      } as any),
    ).resolves.toEqual([])

    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
    expect(vi.mocked(fetchApi).mock.calls[1]?.[0].auth?.accessToken).toBe(
      "newer-stored-jwt",
    )
  })

  it("returns login-required for key requests when a resynced JWT still gets 401", async () => {
    vi.mocked(fetchApi)
      .mockRejectedValueOnce(new ApiError("Unauthorized", 401, "/api/v1/keys"))
      .mockRejectedValueOnce(new ApiError("Unauthorized", 401, "/api/v1/keys"))

    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValueOnce({
      accessToken: "resynced-jwt",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
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
    })
  })

  it("rejects native-group token creation when the provider rejects the request", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce({
      code: 403,
      message: "provider rejected create",
    } as any)

    await expect(
      createSub2ApiTokenForGroupId(
        baseRequest as any,
        createOperationTokenRequest(),
        9,
      ),
    ).rejects.toMatchObject({ message: "provider rejected create" })
  })

  it("rethrows the original native-group token creation transport error", async () => {
    const transportError = new Error("provider unavailable")
    vi.mocked(fetchApi).mockRejectedValueOnce(transportError)

    await expect(
      createSub2ApiTokenForGroupId(
        baseRequest as any,
        createOperationTokenRequest(),
        9,
      ),
    ).rejects.toBe(transportError)
  })
})
