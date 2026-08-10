import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import type { ApiServiceAccountRequest } from "~/services/accounts/accountDataModel"
import type { CreateTokenRequest } from "~/services/accountTokens/tokenProvisioningModel"
import {
  createVoApiV2Token,
  deleteVoApiV2Token,
  fetchAllVoApiV2RawKeys,
  fetchInviteLink,
  fetchSupportCheckIn,
  fetchVoApiV2AccountData,
  fetchVoApiV2AvailableModels,
  fetchVoApiV2KeyGroupDescriptors,
  fetchVoApiV2Tokens,
  fetchVoApiV2UserGroups,
  refreshAccountData,
  renameVoApiV2Key,
  resolveVoApiV2TokenKey,
  setVoApiV2TokenEnabled,
  submitVoApiV2CheckIn,
  updateVoApiV2Token,
} from "~/services/apiService/voapiV2"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { getSelectedCheckInStatus } from "~/services/checkin/autoCheckin/inspection"
import { INVITE_LINK_FAILURE_REASONS } from "~/services/inviteLinks/errors"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  AuthTypeEnum,
  SiteHealthStatus,
} from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { server } from "~~/tests/msw/server"

import { createCheckInConfig } from "../../apiAdapters/checkInFixtures"

const { mockLoggerWarn, mockResyncVoApiV2AuthToken } = vi.hoisted(() => ({
  mockLoggerWarn: vi.fn(),
  mockResyncVoApiV2AuthToken: vi.fn(),
}))

vi.mock("~/services/apiService/voapiV2/tokenResync", () => ({
  resyncVoApiV2AuthToken: mockResyncVoApiV2AuthToken,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: mockLoggerWarn,
  })),
}))

const createVoApiV2Request = (): ApiServiceAccountRequest => ({
  baseUrl: "https://example.invalid",
  accountId: "account-1",
  siteType: SITE_TYPES.VO_API_V2,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "example-dashboard-token",
    userId: 7,
  },
  checkIn: createCheckInConfig(SITE_TYPES.VO_API_V2),
})

const tokenRequest: CreateTokenRequest = {
  name: "default",
  group: "default",
  remain_quota: 500000,
  expired_time: 1893456000,
  unlimited_quota: false,
  model_limits_enabled: false,
  model_limits: "",
  allow_ips: "",
}

describe("apiService VoAPI v2", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockLoggerWarn.mockReset()
    mockResyncVoApiV2AuthToken.mockReset()
    mockResyncVoApiV2AuthToken.mockResolvedValue(null)
    server.resetHandlers()
  })

  it("fetches the canonical invite URL with raw dashboard authorization", async () => {
    server.use(
      http.get(
        "https://example.invalid/api/user/invite-info",
        ({ request }) => {
          expect(request.headers.get("authorization")).toBe(
            "example-dashboard-token",
          )
          return HttpResponse.json({
            code: 0,
            data: {
              url: "  https://invite.example.invalid/join?code=canonical  ",
            },
          })
        },
      ),
    )

    await expect(fetchInviteLink(createVoApiV2Request())).resolves.toBe(
      "https://invite.example.invalid/join?code=canonical",
    )
  })

  it.each([
    ["missing", {}],
    ["blank", { url: "   " }],
    ["non-string", { url: 42 }],
  ])("rejects a %s invite URL", async (_case, data) => {
    server.use(
      http.get("https://example.invalid/api/user/invite-info", () =>
        HttpResponse.json({ code: 0, data }),
      ),
    )

    await expect(fetchInviteLink(createVoApiV2Request())).rejects.toMatchObject(
      {
        reason: INVITE_LINK_FAILURE_REASONS.InviteDataMissing,
      },
    )
  })

  it("preserves VoAPI v2 invite endpoint business errors", async () => {
    server.use(
      http.get("https://example.invalid/api/user/invite-info", () =>
        HttpResponse.json({
          code: 403,
          data: null,
          msg: "Invite feature requires Pro",
        }),
      ),
    )

    await expect(fetchInviteLink(createVoApiV2Request())).rejects.toMatchObject(
      {
        message: "Invite feature requires Pro",
        endpoint: "/api/user/invite-info",
        code: API_ERROR_CODES.BUSINESS_ERROR,
      },
    )
  })

  it("classifies an expired VoAPI v2 invite session", async () => {
    server.use(
      http.get("https://example.invalid/api/user/invite-info", () =>
        HttpResponse.json({
          code: 2,
          data: null,
          msg: "Auth expire",
        }),
      ),
    )

    await expect(fetchInviteLink(createVoApiV2Request())).rejects.toMatchObject(
      {
        reason: INVITE_LINK_FAILURE_REASONS.AuthenticationRequired,
      },
    )
  })

  it("fetches account data with raw authorization and today statistics", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)

    server.use(
      http.get("https://example.invalid/api/user/info", ({ request }) => {
        expect(request.headers.get("authorization")).toBe(
          "example-dashboard-token",
        )
        return HttpResponse.json({
          code: 0,
          data: {
            id: 7,
            username: "owner",
            basicBalance: "2",
            bindBalance: "3",
            totalRequest: 123,
            totalToken: 456,
            currency: "USD",
          },
        })
      }),
      http.get("https://example.invalid/api/dash/statistics", () =>
        HttpResponse.json({
          code: 0,
          data: {
            d: {
              requests: 9,
              usedBasicBalance: "0.5",
              usedBindBalance: "0.25",
              errors: 0,
              maxRpm: 1,
            },
          },
        }),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({
          code: 0,
          data: { todaySigned: true, consecutiveDays: 2 },
        }),
      ),
    )

    const data = await fetchVoApiV2AccountData(createVoApiV2Request())

    expect(data.quota).toBe(2500000)
    expect(data.today_quota_consumption).toBe(375000)
    expect(data.today_requests_count).toBe(9)
    expect(data.todayStatsAvailability).toEqual({
      consumption: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
      requests: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
      tokens: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
      },
      income: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
      },
    })
    expect(
      getSelectedCheckInStatus({
        config: data.checkIn,
        siteType: SITE_TYPES.VO_API_V2,
      }),
    ).toMatchObject({
      today: "checked",
      evidence: { source: "probe", observedAt: 1_700_000_000_000 },
    })
  })

  it("skips today statistics when cashflow refresh is disabled but still detects check-in status", async () => {
    let statsCalled = false
    server.use(
      http.get("https://example.invalid/api/user/info", () =>
        HttpResponse.json({
          code: 0,
          data: { id: 7, basicBalance: "2", bindBalance: "0" },
        }),
      ),
      http.get("https://example.invalid/api/dash/statistics", () => {
        statsCalled = true
        return HttpResponse.json({ code: 0, data: { d: { requests: 1 } } })
      }),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({
          code: 0,
          data: { todaySigned: false },
        }),
      ),
    )

    const data = await fetchVoApiV2AccountData({
      ...createVoApiV2Request(),
      includeTodayCashflow: false,
    })

    expect(data.quota).toBe(1000000)
    expect(data.today_quota_consumption).toBe(0)
    expect(statsCalled).toBe(false)
    expect(data.todayStatsAvailability).toMatchObject({
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
        reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
      },
      income: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
      },
    })
    expect(
      getSelectedCheckInStatus({
        config: data.checkIn,
        siteType: SITE_TYPES.VO_API_V2,
      }),
    ).toMatchObject({ today: "not_checked" })
  })

  it("validates VoAPI v2 requests and consumption sources independently", async () => {
    server.use(
      http.get("https://example.invalid/api/user/info", () =>
        HttpResponse.json({
          code: 0,
          data: { id: 7, basicBalance: "2", bindBalance: "0" },
        }),
      ),
      http.get("https://example.invalid/api/dash/statistics", ({ request }) => {
        const url = new URL(request.url)
        const start = new Date(Number(url.searchParams.get("s")))
        const end = new Date(Number(url.searchParams.get("e")))
        expect(start.toDateString()).toBe(end.toDateString())
        return HttpResponse.json({
          code: 0,
          data: {
            d: {
              requests: "9",
              usedBasicBalance: "0.5",
              usedBindBalance: "invalid",
            },
          },
        })
      }),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({ code: 0, data: { todaySigned: false } }),
      ),
    )

    const data = await fetchVoApiV2AccountData(createVoApiV2Request())

    expect(data.today_quota_consumption).toBe(250000)
    expect(data.today_requests_count).toBe(9)
    expect(data.todayStatsAvailability).toMatchObject({
      consumption: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
        reason: ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
      },
      requests: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
    })
  })

  it("classifies VoAPI v2 statistics with no valid sources as invalid", async () => {
    server.use(
      http.get("https://example.invalid/api/user/info", () =>
        HttpResponse.json({
          code: 0,
          data: { id: 7, basicBalance: "2", bindBalance: "0" },
        }),
      ),
      http.get("https://example.invalid/api/dash/statistics", () =>
        HttpResponse.json({
          code: 0,
          data: {
            d: {
              requests: undefined,
              usedBasicBalance: "invalid",
              usedBindBalance: undefined,
            },
          },
        }),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({ code: 0, data: { todaySigned: false } }),
      ),
    )

    const data = await fetchVoApiV2AccountData(createVoApiV2Request())

    expect(data.todayStatsAvailability).toMatchObject({
      consumption: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
      },
      requests: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
      },
    })
  })

  it("classifies failed VoAPI v2 statistics without failing healthy balance", async () => {
    server.use(
      http.get("https://example.invalid/api/user/info", () =>
        HttpResponse.json({
          code: 0,
          data: { id: 7, basicBalance: "2", bindBalance: "0" },
        }),
      ),
      http.get("https://example.invalid/api/dash/statistics", () =>
        HttpResponse.json({ code: 1, msg: "statistics unavailable" }),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({ code: 0, data: { todaySigned: false } }),
      ),
    )

    const data = await fetchVoApiV2AccountData(createVoApiV2Request())

    expect(data.quota).toBe(1000000)
    expect(data.todayStatsAvailability).toMatchObject({
      consumption: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
      },
      requests: {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
      },
    })
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "Failed to fetch VoAPI v2 dashboard statistics",
      expect.any(Error),
    )
  })

  it("preserves existing check-in status when VoAPI v2 status detection fails", async () => {
    server.use(
      http.get("https://example.invalid/api/user/info", () =>
        HttpResponse.json({
          code: 0,
          data: { id: 7, basicBalance: "2", bindBalance: "0" },
        }),
      ),
      http.get("https://example.invalid/api/dash/statistics", () =>
        HttpResponse.json({ code: 0, data: { d: { requests: 1 } } }),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({ code: 2, data: null, msg: "Auth expire" }),
      ),
    )

    const data = await fetchVoApiV2AccountData({
      ...createVoApiV2Request(),
      checkIn: createCheckInConfig(SITE_TYPES.VO_API_V2, {
        isCheckedInToday: true,
        observedAt: 123,
      }),
    })

    expect(
      getSelectedCheckInStatus({
        config: data.checkIn,
        siteType: SITE_TYPES.VO_API_V2,
      }),
    ).toMatchObject({ today: "checked", evidence: { observedAt: 123 } })
  })

  it("refreshes account data and maps expired dashboard JWT failures", async () => {
    server.use(
      http.get("https://example.invalid/api/user/info", () =>
        HttpResponse.json({
          code: 2,
          data: null,
          msg: "Auth expire",
        }),
      ),
      http.get("https://example.invalid/api/dash/statistics", () =>
        HttpResponse.json({
          code: 2,
          data: null,
          msg: "Auth expire",
        }),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({
          code: 2,
          data: null,
          msg: "Auth expire",
        }),
      ),
    )

    await expect(refreshAccountData(createVoApiV2Request())).resolves.toEqual({
      success: false,
      healthStatus: expect.objectContaining({
        status: SiteHealthStatus.Warning,
      }),
    })
  })

  it("passes temp-window source to dashboard JWT resync after auth expiry", async () => {
    const authorizations: (string | null)[] = []
    mockResyncVoApiV2AuthToken.mockResolvedValueOnce({
      accessToken: "resynced-dashboard-token",
      userId: "8",
      username: "resynced-owner",
      source: "existing_tab",
    })

    server.use(
      http.get("https://example.invalid/api/user/info", ({ request }) => {
        const authorization = request.headers.get("authorization")
        authorizations.push(authorization)

        if (authorization === "example-dashboard-token") {
          return HttpResponse.json({
            code: 2,
            data: null,
            msg: "Auth expire",
          })
        }

        return HttpResponse.json({
          code: 0,
          data: {
            id: 8,
            username: "resynced-owner",
            basicBalance: "2",
            bindBalance: "0",
          },
        })
      }),
      http.get("https://example.invalid/api/dash/statistics", () =>
        HttpResponse.json({
          code: 0,
          data: { d: { requests: 1, usedBasicBalance: "0" } },
        }),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({
          code: 0,
          data: { todaySigned: false },
        }),
      ),
    )

    await expect(
      refreshAccountData({
        ...createVoApiV2Request(),
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        success: true,
        authUpdate: {
          accessToken: "resynced-dashboard-token",
          userId: "8",
          username: "resynced-owner",
        },
      }),
    )

    expect(authorizations).toContain("example-dashboard-token")
    expect(authorizations).toContain("resynced-dashboard-token")
    expect(mockResyncVoApiV2AuthToken).toHaveBeenCalledWith(
      "https://example.invalid",
      TEMP_WINDOW_REQUEST_SOURCES.Popup,
      undefined,
    )
  })

  it("reports the retry auth-expired message after dashboard JWT re-sync", async () => {
    mockResyncVoApiV2AuthToken.mockResolvedValueOnce({
      accessToken: "resynced-dashboard-token",
      userId: "8",
      username: "resynced-owner",
      source: "existing_tab",
    })

    server.use(
      http.get("https://example.invalid/api/user/info", ({ request }) => {
        const authorization = request.headers.get("authorization")
        return HttpResponse.json({
          code: 2,
          data: null,
          msg:
            authorization === "example-dashboard-token"
              ? "Initial auth expire"
              : "Retry auth expire",
        })
      }),
      http.get("https://example.invalid/api/dash/statistics", () =>
        HttpResponse.json({
          code: 2,
          data: null,
          msg: "Retry auth expire",
        }),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({
          code: 2,
          data: null,
          msg: "Retry auth expire",
        }),
      ),
    )

    await expect(refreshAccountData(createVoApiV2Request())).resolves.toEqual({
      success: false,
      healthStatus: {
        status: SiteHealthStatus.Warning,
        message: "account:healthStatus.httpError",
      },
    })
    expect(mockResyncVoApiV2AuthToken).toHaveBeenCalledWith(
      "https://example.invalid",
      undefined,
      undefined,
    )
  })

  it("reports non-auth retry failures after dashboard JWT re-sync", async () => {
    mockResyncVoApiV2AuthToken.mockResolvedValueOnce({
      accessToken: "resynced-dashboard-token",
      userId: "8",
      username: "resynced-owner",
      source: "existing_tab",
    })

    server.use(
      http.get("https://example.invalid/api/user/info", ({ request }) => {
        const authorization = request.headers.get("authorization")
        if (authorization === "example-dashboard-token") {
          return HttpResponse.json({
            code: 2,
            data: null,
            msg: "Initial auth expire",
          })
        }

        return HttpResponse.json(
          { code: 500, data: null, msg: "Backend unavailable" },
          { status: 500 },
        )
      }),
      http.get(/https:\/\/example\.invalid\/api\/dash\/statistics/, () =>
        HttpResponse.json(
          { code: 500, data: null, msg: "Backend unavailable" },
          { status: 500 },
        ),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json(
          { code: 500, data: null, msg: "Backend unavailable" },
          { status: 500 },
        ),
      ),
    )

    await expect(refreshAccountData(createVoApiV2Request())).resolves.toEqual(
      expect.objectContaining({
        success: false,
        healthStatus: expect.objectContaining({
          status: SiteHealthStatus.Warning,
        }),
      }),
    )
  })

  it("reveals token secrets from the VoAPI v2 reveal endpoint", async () => {
    server.use(
      http.post("https://example.invalid/api/keys/11/token", () =>
        HttpResponse.json({
          code: 0,
          data: { token: "example-revealed-api-key" },
        }),
      ),
    )

    await expect(
      resolveVoApiV2TokenKey(createVoApiV2Request(), {
        id: 11,
        key: "masked-example-key",
      }),
    ).resolves.toBe("example-revealed-api-key")
  })

  it("accepts string token reveal responses and rejects malformed reveal payloads", async () => {
    server.use(
      http.post("https://example.invalid/api/keys/11/token", () =>
        HttpResponse.json({
          code: 0,
          data: "example-revealed-api-key",
        }),
      ),
      http.post("https://example.invalid/api/keys/12/token", () =>
        HttpResponse.json({
          code: 0,
          data: { masked: "still-hidden" },
        }),
      ),
    )

    await expect(
      resolveVoApiV2TokenKey(createVoApiV2Request(), {
        id: 11,
        key: "masked-example-key",
      }),
    ).resolves.toBe("example-revealed-api-key")
    await expect(
      resolveVoApiV2TokenKey(createVoApiV2Request(), {
        id: 12,
        key: "masked-example-key",
      }),
    ).rejects.toThrow("VoAPI v2 token reveal response is missing token")
  })

  it("normalizes VoAPI v2 key inventory", async () => {
    server.use(
      http.get("https://example.invalid/api/keys", () =>
        HttpResponse.json({
          code: 0,
          data: [
            {
              id: 11,
              name: "default",
              tokenMasked: "masked-example-key",
              groups: [2],
              enable: true,
              expireTime: 1893456000000,
              amount: "2",
              used: "0.5",
            },
          ],
        }),
      ),
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({
          code: 0,
          data: {
            groups: [{ id: 2, name: "standard", ratio: 1 }],
            models: [],
          },
        }),
      ),
    )

    await expect(fetchVoApiV2Tokens(createVoApiV2Request())).resolves.toEqual([
      expect.objectContaining({
        id: 11,
        name: "default",
        key: "masked-example-key",
        status: 1,
        remain_quota: 1000000,
        used_quota: 250000,
        group: "standard",
        expired_time: 1893456000,
      }),
    ])
  })

  it("normalizes VoAPI v2 paginated key inventory records with group names", async () => {
    server.use(
      http.get("https://example.invalid/api/keys", () =>
        HttpResponse.json({
          code: 0,
          data: {
            page: 1,
            size: 100,
            total: 2,
            pages: 1,
            records: [
              {
                id: 8396,
                name: "default",
                tokenMasked: "sk-example****0001",
                groups: [1],
                enable: true,
                expireTime: -1,
                boundlessAmount: true,
                amount: "0.00000000",
                used: "0.00000000",
              },
              {
                id: 8395,
                name: "quota-limited",
                tokenMasked: "sk-example****0002",
                groups: [2],
                enable: false,
                expireTime: 4102329600000,
                amount: "100.00000000",
                used: "0.50000000",
              },
            ],
          },
        }),
      ),
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({
          code: 0,
          data: {
            groups: [
              { id: 1, name: "default", ratio: 1 },
              { id: 2, name: "priority", ratio: 1 },
            ],
            models: [],
          },
        }),
      ),
    )

    await expect(fetchVoApiV2Tokens(createVoApiV2Request())).resolves.toEqual([
      expect.objectContaining({
        id: 8396,
        name: "default",
        key: "sk-example****0001",
        status: 1,
        remain_quota: 0,
        unlimited_quota: true,
        used_quota: 0,
        group: "default",
        expired_time: -1,
      }),
      expect.objectContaining({
        id: 8395,
        name: "quota-limited",
        key: "sk-example****0002",
        status: 2,
        remain_quota: 50000000,
        used_quota: 250000,
        group: "priority",
        expired_time: 4102329600,
      }),
    ])
  })

  it("fetches every page of the native VoAPI v2 key inventory", async () => {
    const requestedPages: number[] = []
    server.use(
      http.get("https://example.invalid/api/keys", ({ request }) => {
        const url = new URL(request.url)
        const page = Number(url.searchParams.get("page"))
        requestedPages.push(page)

        return HttpResponse.json({
          code: 0,
          data: {
            page,
            size: 1,
            total: 2,
            pages: 2,
            records: [
              {
                id: page === 1 ? 11 : 12,
                name: `page-${page}`,
                groups: [2],
                enable: true,
              },
            ],
          },
        })
      }),
    )

    await expect(
      fetchAllVoApiV2RawKeys(createVoApiV2Request(), 1),
    ).resolves.toEqual([
      expect.objectContaining({ id: 11, name: "page-1" }),
      expect.objectContaining({ id: 12, name: "page-2" }),
    ])
    expect(requestedPages).toEqual([1, 2])
  })

  it("rejects duplicate native key ids across inventory pages", async () => {
    server.use(
      http.get("https://example.invalid/api/keys", ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page"))
        return HttpResponse.json({
          code: 0,
          data: {
            page,
            size: 1,
            total: 2,
            pages: 2,
            records: [{ id: 11, name: `page-${page}`, groups: [2] }],
          },
        })
      }),
    )

    await expect(
      fetchAllVoApiV2RawKeys(createVoApiV2Request(), 1),
    ).rejects.toThrow("VoAPI v2 key inventory contains duplicate key id")
  })

  it("rejects malformed native key ids", async () => {
    server.use(
      http.get("https://example.invalid/api/keys", () =>
        HttpResponse.json({
          code: 0,
          data: {
            page: 1,
            size: 100,
            total: 1,
            pages: 1,
            records: [{ id: "01", name: "malformed", groups: [2] }],
          },
        }),
      ),
    )

    await expect(
      fetchAllVoApiV2RawKeys(createVoApiV2Request()),
    ).rejects.toThrow("VoAPI v2 key inventory contains invalid key id")
  })

  it("rejects oversized numeric native key ids", async () => {
    server.use(
      http.get("https://example.invalid/api/keys", () =>
        HttpResponse.json({
          code: 0,
          data: {
            page: 1,
            size: 100,
            total: 1,
            pages: 1,
            records: [
              {
                id: Number.MAX_SAFE_INTEGER + 1,
                name: "oversized",
                groups: [2],
              },
            ],
          },
        }),
      ),
    )

    await expect(
      fetchAllVoApiV2RawKeys(createVoApiV2Request()),
    ).rejects.toThrow("VoAPI v2 key inventory contains invalid key id")
  })

  it("rejects repeated pagination metadata", async () => {
    server.use(
      http.get("https://example.invalid/api/keys", ({ request }) => {
        const requestedPage = Number(
          new URL(request.url).searchParams.get("page"),
        )
        return HttpResponse.json({
          code: 0,
          data: {
            page: 1,
            size: 1,
            total: 2,
            pages: 2,
            records: [{ id: requestedPage === 1 ? 11 : 12, groups: [2] }],
          },
        })
      }),
    )

    await expect(
      fetchAllVoApiV2RawKeys(createVoApiV2Request(), 1),
    ).rejects.toThrow("VoAPI v2 key inventory has invalid pagination")
  })

  it("rejects pagination metadata that drifts across pages", async () => {
    server.use(
      http.get("https://example.invalid/api/keys", ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page"))
        return HttpResponse.json({
          code: 0,
          data: {
            page,
            size: 1,
            total: page === 1 ? 2 : 3,
            pages: page === 1 ? 2 : 3,
            records: [{ id: page === 1 ? 11 : 12, groups: [2] }],
          },
        })
      }),
    )

    await expect(
      fetchAllVoApiV2RawKeys(createVoApiV2Request(), 1),
    ).rejects.toThrow("VoAPI v2 key inventory has invalid pagination")
  })

  it("rejects a page that drops established pagination metadata", async () => {
    server.use(
      http.get("https://example.invalid/api/keys", ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page"))
        return HttpResponse.json({
          code: 0,
          data:
            page === 1
              ? {
                  page,
                  size: 1,
                  total: 2,
                  pages: 2,
                  records: [{ id: 11, groups: [2] }],
                }
              : { records: [{ id: 12, groups: [2] }] },
        })
      }),
    )

    await expect(
      fetchAllVoApiV2RawKeys(createVoApiV2Request(), 1),
    ).rejects.toThrow("VoAPI v2 key inventory has invalid pagination")
  })

  it("rejects a terminal inventory whose item count differs from total", async () => {
    server.use(
      http.get("https://example.invalid/api/keys", ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page"))
        return HttpResponse.json({
          code: 0,
          data: {
            page,
            size: 1,
            total: 2,
            pages: 2,
            records: page === 1 ? [{ id: 11, groups: [2] }] : [],
          },
        })
      }),
    )

    await expect(
      fetchAllVoApiV2RawKeys(createVoApiV2Request(), 1),
    ).rejects.toThrow("VoAPI v2 key inventory has invalid pagination")
  })

  it("keeps duplicate group names distinct by canonical native id", async () => {
    server.use(
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({
          code: 0,
          data: {
            groups: [
              { id: 9, name: "Shared" },
              { id: "10", name: "Shared" },
            ],
          },
        }),
      ),
    )

    await expect(
      fetchVoApiV2KeyGroupDescriptors(createVoApiV2Request()),
    ).resolves.toEqual([
      { id: 9, requirementKey: "9", displayName: "Shared" },
      { id: 10, requirementKey: "10", displayName: "Shared" },
    ])
  })

  it.each([
    ["malformed", [{ id: "09", name: "Malformed" }]],
    [
      "duplicate",
      [
        { id: 9, name: "First" },
        { id: "9", name: "Second" },
      ],
    ],
  ])("rejects %s native group identities", async (_case, groups) => {
    server.use(
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({ code: 0, data: { groups } }),
      ),
    )

    await expect(
      fetchVoApiV2KeyGroupDescriptors(createVoApiV2Request()),
    ).rejects.toThrow("VoAPI v2 key template contains invalid group identity")
  })

  it("creates keys with VoAPI v2 amount and group payloads", async () => {
    let payload: unknown
    server.use(
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({
          code: 0,
          data: {
            groups: [{ id: 2, name: "default", ratio: 1 }],
            models: [],
          },
        }),
      ),
      http.post("https://example.invalid/api/keys", async ({ request }) => {
        payload = await request.json()
        return HttpResponse.json({ code: 0, data: null })
      }),
    )

    await expect(
      createVoApiV2Token(createVoApiV2Request(), tokenRequest),
    ).resolves.toBe(true)

    expect(payload).toEqual({
      name: "default",
      groups: [2],
      amount: "1",
      boundlessAmount: false,
      genCount: 1,
      enable: true,
      expireTime: 1893456000000,
    })
  })

  it("creates unlimited keys with VoAPI v2 boundlessAmount", async () => {
    let payload: unknown
    server.use(
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({
          code: 0,
          data: {
            groups: [{ id: 2, name: "default", ratio: 1 }],
            models: [],
          },
        }),
      ),
      http.post("https://example.invalid/api/keys", async ({ request }) => {
        payload = await request.json()
        return HttpResponse.json({ code: 0, data: null })
      }),
    )

    await expect(
      createVoApiV2Token(createVoApiV2Request(), {
        ...tokenRequest,
        remain_quota: 0,
        unlimited_quota: true,
      }),
    ).resolves.toBe(true)

    expect(payload).toEqual({
      name: "default",
      groups: [2],
      amount: "0",
      boundlessAmount: true,
      genCount: 1,
      enable: true,
      expireTime: 1893456000000,
    })
  })

  it("rejects key creation when the requested VoAPI v2 group cannot resolve", async () => {
    server.use(
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({
          code: 0,
          data: {
            groups: [{ id: 2, name: "default", ratio: 1 }],
            models: [],
          },
        }),
      ),
    )

    await expect(
      createVoApiV2Token(createVoApiV2Request(), {
        ...tokenRequest,
        group: "missing-group",
      }),
    ).rejects.toThrow("VoAPI v2 group not found")
  })

  it("updates and toggles keys with preserved VoAPI v2 fields", async () => {
    const payloads: unknown[] = []
    server.use(
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({
          code: 0,
          data: {
            groups: [
              { id: 2, name: "default", ratio: 1 },
              { id: 3, name: "previous-group", ratio: 1 },
            ],
            models: [],
          },
        }),
      ),
      http.get("https://example.invalid/api/keys", () =>
        HttpResponse.json({
          code: 0,
          data: [
            {
              id: 11,
              name: "previous",
              groups: [3],
              enable: true,
              expireTime: -1,
              boundlessAmount: true,
              amount: "2",
              used: "0.25",
              note: "keep me",
            },
          ],
        }),
      ),
      http.put("https://example.invalid/api/keys/11", async ({ request }) => {
        payloads.push(await request.json())
        return HttpResponse.json({ code: 0, data: null })
      }),
    )

    await expect(
      updateVoApiV2Token(createVoApiV2Request(), 11, {
        ...tokenRequest,
        remain_quota: 0,
        unlimited_quota: true,
      }),
    ).resolves.toBe(true)
    await expect(
      setVoApiV2TokenEnabled(createVoApiV2Request(), 11, false),
    ).resolves.toBe(true)
    await expect(
      renameVoApiV2Key(createVoApiV2Request(), 11, "Renamed"),
    ).resolves.toBe(true)

    expect(payloads[0]).toEqual({
      id: 11,
      name: "default",
      groups: [2],
      amount: "0",
      boundlessAmount: true,
      enable: true,
      expireTime: 1893456000000,
      used: "0.25",
      note: "keep me",
    })
    expect(payloads[1]).toEqual({
      id: 11,
      name: "previous",
      groups: [3],
      enable: false,
      expireTime: -1,
      boundlessAmount: true,
      amount: "2",
      used: "0.25",
      note: "keep me",
    })
    expect(payloads[2]).toEqual({
      id: 11,
      name: "Renamed",
      groups: [3],
      enable: true,
      expireTime: -1,
      boundlessAmount: true,
      amount: "2",
      used: "0.25",
      note: "keep me",
    })
  })

  it("paginates key inventory when updating a token beyond the first lookup page", async () => {
    const requestedPages: number[] = []
    let payload: unknown
    const firstPageKeys = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      name: `page-one-${index + 1}`,
      groups: [1],
      enable: true,
      expireTime: -1,
      boundlessAmount: false,
      amount: "0",
      used: "0",
    }))

    server.use(
      http.get("https://example.invalid/api/keys", ({ request }) => {
        const url = new URL(request.url)
        const page = Number(url.searchParams.get("page"))
        requestedPages.push(page)

        return HttpResponse.json({
          code: 0,
          data:
            page === 1
              ? firstPageKeys
              : [
                  {
                    id: 150,
                    name: "page-two-target",
                    groups: [3],
                    enable: true,
                    expireTime: -1,
                    boundlessAmount: true,
                    amount: "2",
                    used: "0.25",
                    note: "keep me",
                  },
                ],
        })
      }),
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({
          code: 0,
          data: {
            groups: [
              { id: 2, name: "default", ratio: 1 },
              { id: 3, name: "previous-group", ratio: 1 },
            ],
            models: [],
          },
        }),
      ),
      http.put("https://example.invalid/api/keys/150", async ({ request }) => {
        payload = await request.json()
        return HttpResponse.json({ code: 0, data: null })
      }),
    )

    await expect(
      updateVoApiV2Token(createVoApiV2Request(), 150, {
        ...tokenRequest,
        remain_quota: 0,
        unlimited_quota: true,
      }),
    ).resolves.toBe(true)

    expect(requestedPages).toEqual([1, 2])
    expect(payload).toEqual(
      expect.objectContaining({
        id: 150,
        name: "default",
        groups: [2],
        used: "0.25",
        note: "keep me",
      }),
    )
  })

  it("reports missing tokens after exhausting paginated lookup", async () => {
    const requestedPages: number[] = []
    const firstPageKeys = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      name: `page-one-${index + 1}`,
      groups: [1],
      enable: true,
      expireTime: -1,
      boundlessAmount: false,
      amount: "0",
      used: "0",
    }))

    server.use(
      http.get("https://example.invalid/api/keys", ({ request }) => {
        const url = new URL(request.url)
        const page = Number(url.searchParams.get("page"))
        requestedPages.push(page)

        return HttpResponse.json({
          code: 0,
          data: page === 1 ? firstPageKeys : [],
        })
      }),
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({
          code: 0,
          data: {
            groups: [{ id: 2, name: "default", ratio: 1 }],
            models: [],
          },
        }),
      ),
    )

    await expect(
      updateVoApiV2Token(createVoApiV2Request(), 150, tokenRequest),
    ).rejects.toThrow("VoAPI v2 token not found")
    expect(requestedPages).toEqual([1, 2])
  })

  it("bounds token lookup when the backend keeps returning full pages", async () => {
    const requestedPages: number[] = []
    const fullPageKeys = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      name: `repeated-${index + 1}`,
      groups: [1],
      enable: true,
      expireTime: -1,
      boundlessAmount: false,
      amount: "0",
      used: "0",
    }))

    server.use(
      http.get("https://example.invalid/api/keys", ({ request }) => {
        const url = new URL(request.url)
        requestedPages.push(Number(url.searchParams.get("page")))

        return HttpResponse.json({
          code: 0,
          data: fullPageKeys,
        })
      }),
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({
          code: 0,
          data: {
            groups: [{ id: 2, name: "default", ratio: 1 }],
            models: [],
          },
        }),
      ),
    )

    await expect(
      updateVoApiV2Token(createVoApiV2Request(), 150, tokenRequest),
    ).rejects.toThrow("VoAPI v2 token not found")
    expect(requestedPages).toHaveLength(100)
    expect(requestedPages[0]).toBe(1)
    expect(requestedPages.at(-1)).toBe(100)
  })

  it("deletes VoAPI v2 keys", async () => {
    let deleted = false
    server.use(
      http.delete("https://example.invalid/api/keys/11", () => {
        deleted = true
        return HttpResponse.json({ code: 0, data: null })
      }),
    )

    await expect(deleteVoApiV2Token(createVoApiV2Request(), 11)).resolves.toBe(
      true,
    )
    expect(deleted).toBe(true)
  })

  it("maps VoAPI v2 template groups and models", async () => {
    server.use(
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({
          code: 0,
          data: {
            groups: [{ id: 2, name: "Default", ratio: 1, note: "main" }],
            models: [
              { idKey: "gpt-4.1", enable: true, hidden: false },
              { idKey: "hidden-model", enable: true, hidden: true },
              { idKey: "disabled-model", enable: false, hidden: false },
            ],
          },
        }),
      ),
    )

    await expect(
      fetchVoApiV2AvailableModels(createVoApiV2Request()),
    ).resolves.toEqual(["gpt-4.1"])
    await expect(
      fetchVoApiV2UserGroups(createVoApiV2Request()),
    ).resolves.toEqual({
      "2": { desc: "main", ratio: 1 },
    })
  })

  it("ignores VoAPI v2 user groups with blank ids", async () => {
    server.use(
      http.get("https://example.invalid/api/keys/template", () =>
        HttpResponse.json({
          code: 0,
          data: {
            groups: [{ id: " ", name: "Blank", ratio: 1 }],
            models: [],
          },
        }),
      ),
    )

    await expect(
      fetchVoApiV2UserGroups(createVoApiV2Request()),
    ).resolves.toEqual({})
  })

  it("supports VoAPI v2 API check-in helpers", async () => {
    server.use(
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({
          code: 0,
          data: { todaySigned: true, consecutiveDays: 2 },
        }),
      ),
      http.post("https://example.invalid/api/check_in", () =>
        HttpResponse.json({ code: 0, data: { amount: "0.1" } }),
      ),
    )

    await expect(fetchSupportCheckIn(createVoApiV2Request())).resolves.toBe(
      true,
    )
    await expect(submitVoApiV2CheckIn(createVoApiV2Request())).resolves.toEqual(
      {
        amount: "0.1",
      },
    )
  })

  it("classifies repeated VoAPI v2 check-in as already signed", async () => {
    server.use(
      http.post("https://example.invalid/api/check_in", () =>
        HttpResponse.json({ code: 1, data: null, msg: "Signed in today" }),
      ),
    )

    await expect(submitVoApiV2CheckIn(createVoApiV2Request())).resolves.toEqual(
      {
        alreadySigned: true,
      },
    )
  })
})
