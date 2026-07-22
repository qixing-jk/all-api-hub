import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import type { CreateTokenRequest } from "~/services/accountTokens/tokenProvisioningModel"
import {
  createApiToken,
  deleteApiToken,
  extractDefaultExchangeRate,
  fetchAccountAvailableModels,
  fetchAccountData,
  fetchAccountQuota,
  fetchAccountTokens,
  fetchAllModels,
  fetchCheckInStatus,
  fetchModelPricing,
  fetchSiteStatus,
  fetchSupportCheckIn,
  fetchTodayIncome,
  fetchTodayUsage,
  fetchTokenById,
  fetchUserInfo,
  getOrCreateAccessToken,
  refreshAccountData,
  resolveApiTokenKey,
  searchApiTokens,
  updateApiToken,
  validateAccountConnection,
} from "~/services/apiService/aihubmix"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { INVITE_LINK_FAILURE_REASONS } from "~/services/inviteLinks/errors"
import { MODEL_LIST_SOURCE_KINDS } from "~/services/modelList/pricingModel"
import { MODEL_VENDOR_EVIDENCE_KINDS } from "~/services/models/modelDescriptor"
import { resolveModelVendorCandidate } from "~/services/models/modelVendor"
import { calculateModelPrice } from "~/services/models/utils/modelPricing"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  AuthTypeEnum,
} from "~/types"
import { server } from "~~/tests/msw/server"

const baseRequest = {
  baseUrl: "https://aihubmix.com",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "7",
    accessToken: "system-access-token",
  },
}

const baseAccountRequest = {
  ...baseRequest,
  checkIn: { enableDetection: false },
}

const tokenRequest: CreateTokenRequest = {
  name: "temporary-key",
  remain_quota: 500000,
  expired_time: -1,
  unlimited_quota: false,
  model_limits_enabled: false,
  model_limits: "",
  allow_ips: "",
  group: "default",
}

describe("apiService AIHubMix", () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  it("uses the app default exchange rate because AIHubMix exposes no site rate field", () => {
    expect(extractDefaultExchangeRate(null)).toBe(
      UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
    )
    expect(
      extractDefaultExchangeRate({
        system_name: "AIHubMix",
        checkin_enabled: false,
      }),
    ).toBe(UI_CONSTANTS.EXCHANGE_RATE.DEFAULT)
  })

  it("returns static metadata and no built-in daily/check-in metrics", async () => {
    await expect(fetchSiteStatus(baseRequest)).resolves.toEqual({
      system_name: "AIHubMix",
      checkin_enabled: false,
    })
    await expect(fetchSupportCheckIn(baseRequest)).resolves.toBe(false)
    await expect(fetchCheckInStatus(baseRequest)).resolves.toBeUndefined()
    await expect(fetchTodayUsage(baseRequest)).resolves.toEqual({
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      todayStatsAvailability: {
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
        },
        requests: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
        },
        tokens: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
      },
    })
    await expect(fetchTodayIncome(baseRequest)).resolves.toEqual({
      today_income: 0,
      todayStatsAvailability: {
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
      },
    })
  })

  it("returns independent availability snapshots", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: { username: "example-user", quota: 100 },
        }),
      ),
    )

    const first = await fetchAccountData(baseAccountRequest)
    first.todayStatsAvailability!.consumption.status =
      ACCOUNT_TODAY_METRIC_STATUSES.Complete

    const second = await fetchAccountData(baseAccountRequest)

    expect(second.todayStatsAvailability!.consumption).toEqual({
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
    })
    expect(second.todayStatsAvailability).not.toBe(first.todayStatsAvailability)
    expect(second.todayStatsAvailability!.consumption).not.toBe(
      first.todayStatsAvailability!.consumption,
    )
  })

  it("builds the vendor invite URL from the saved-account user response", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", ({ request }) => {
        expect(request.headers.get("Authorization")).toBe("system-access-token")
        expect(request.headers.get("Cookie")).toBeNull()

        return HttpResponse.json({
          success: true,
          data: {
            username: "invite-user",
            aff_code: "  invite-code  ",
          },
        })
      }),
    )

    const apiService = (await import(
      "~/services/apiService/aihubmix"
    )) as Record<string, unknown>
    const fetchInviteLink = apiService.fetchInviteLink as
      | ((request: typeof baseRequest) => Promise<string>)
      | undefined

    expect(fetchInviteLink).toEqual(expect.any(Function))
    await expect(fetchInviteLink!(baseRequest)).resolves.toBe(
      "https://aihubmix.com/?aff=invite-code",
    )
  })

  it("disables caching when fetching the invite link", async () => {
    let requestCache: RequestCache | undefined
    server.use(
      http.get("https://aihubmix.com/api/user/self", ({ request }) => {
        requestCache = request.cache

        return HttpResponse.json({
          success: true,
          data: { aff_code: "invite-code" },
        })
      }),
    )

    const { fetchInviteLink } = await import("~/services/apiService/aihubmix")

    await fetchInviteLink(baseRequest)

    expect(requestCache).toBe("no-store")
  })

  it("forwards invite-link cancellation to the native request", async () => {
    const abortController = new AbortController()
    let receivedSignal: AbortSignal | null | undefined
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce((_input, options) => {
        receivedSignal = options?.signal

        return new Promise<Response>((resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          )
          queueMicrotask(() =>
            resolve(
              HttpResponse.json({
                success: true,
                data: { aff_code: "invite-code" },
              }),
            ),
          )
        })
      })

    try {
      const apiService = (await import(
        "~/services/apiService/aihubmix"
      )) as Record<string, unknown>
      const fetchInviteLink = apiService.fetchInviteLink as
        | ((
            request: typeof baseRequest & { abortSignal: AbortSignal },
          ) => Promise<string>)
        | undefined
      const inviteLinkPromise = fetchInviteLink!({
        ...baseRequest,
        abortSignal: abortController.signal,
      })

      abortController.abort()

      await expect(inviteLinkPromise).rejects.toMatchObject({
        name: "AbortError",
      })
      expect(receivedSignal).toBe(abortController.signal)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it.each([
    {
      caseName: "null data",
      response: { success: true, data: null },
    },
    {
      caseName: "missing data",
      response: { success: true },
    },
    {
      caseName: "array data",
      response: { success: true, data: [] },
    },
    {
      caseName: "non-string code",
      response: { success: true, data: { aff_code: 42 } },
    },
    {
      caseName: "blank code",
      response: { success: true, data: { aff_code: "   " } },
    },
  ])(
    "rejects malformed AIHubMix invitation payloads: $caseName",
    async ({ response }) => {
      server.use(
        http.get("https://aihubmix.com/api/user/self", () =>
          HttpResponse.json(response),
        ),
      )

      const apiService = (await import(
        "~/services/apiService/aihubmix"
      )) as Record<string, unknown>
      const fetchInviteLink = apiService.fetchInviteLink as
        | ((request: typeof baseRequest) => Promise<string>)
        | undefined

      expect(fetchInviteLink).toEqual(expect.any(Function))
      await expect(fetchInviteLink!(baseRequest)).rejects.toMatchObject({
        reason: INVITE_LINK_FAILURE_REASONS.InviteDataMissing,
      })
    },
  )

  it("classifies malformed AIHubMix envelopes as invalid responses", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json(null),
      ),
    )

    const { fetchInviteLink } = await import("~/services/apiService/aihubmix")

    await expect(fetchInviteLink(baseRequest)).rejects.toMatchObject({
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
    })
  })

  it("normalizes invalid numbers, empty access tokens, and direct data bodies", async () => {
    server.use(
      http.get("https://aihubmix.com/api/token/", () =>
        HttpResponse.json([
          {
            id: "bad-id",
            user_id: "bad-user-id",
            key: "direct-key",
            status: "bad-status",
            name: 123,
            created_time: "bad-created",
            accessed_time: "bad-accessed",
            expired_time: "bad-expired",
            remain_quota: "bad-quota",
            used_quota: "bad-used",
            unlimited_quota: false,
            model_limits: 123,
            models: ["not", "a", "string"],
            allow_ips: 123,
            ip_whitelist: 456,
            subnet: 789,
            group: 123,
          },
        ]),
      ),
    )

    await expect(fetchAccountTokens(baseRequest)).resolves.toEqual([
      expect.objectContaining({
        id: 0,
        user_id: 0,
        key: "direct-key",
        status: 1,
        name: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        used_quota: 0,
        model_limits_enabled: false,
        model_limits: "",
        allow_ips: "",
        group: undefined,
      }),
    ])

    await expect(
      fetchAccountTokens({
        ...baseRequest,
        auth: { ...baseRequest.auth, accessToken: null as any },
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.HTTP_401,
    })
  })

  it("trims access tokens and treats blank string fields as empty normalized values", async () => {
    let capturedAuthorization: string | null = null
    server.use(
      http.get("https://aihubmix.com/api/token/", ({ request }) => {
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({
          success: true,
          message: "",
          data: [
            {
              id: "42",
              user_id: "7",
              key: "",
              name: "blank-compatible",
              status: 1,
              created_time: "  ",
              accessed_time: "  ",
              expired_time: "  ",
              remain_quota: "  ",
              used_quota: "  ",
              unlimited_quota: false,
              models: "gpt-4o",
              subnet: "192.168.0.0/24",
            },
          ],
        })
      }),
    )

    await expect(
      fetchAccountTokens({
        ...baseRequest,
        auth: { ...baseRequest.auth, accessToken: "  trimmed-token  " },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 42,
        user_id: 7,
        key: "",
        created_time: 0,
        accessed_time: 0,
        expired_time: -1,
        remain_quota: 0,
        used_quota: 0,
        model_limits_enabled: true,
        model_limits: "gpt-4o",
        allow_ips: "192.168.0.0/24",
      }),
    ])
    expect(capturedAuthorization).toBe("trimmed-token")
  })

  it("fetches cookie-authenticated user info from /call/usr/self", async () => {
    let capturedCookieAuth = false
    server.use(
      http.get("https://aihubmix.com/call/usr/self", ({ request }) => {
        capturedCookieAuth = request.credentials === "include"
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "existing-access-token",
            quota: 900000,
            used_quota: 12345,
          },
        })
      }),
    )

    const userInfo = await fetchUserInfo({
      baseUrl: "https://aihubmix.com",
      auth: { authType: AuthTypeEnum.Cookie },
    })

    expect(capturedCookieAuth).toBe(true)
    expect(userInfo).toMatchObject({
      id: "aihubmix-user",
      username: "aihubmix-user",
      access_token: "existing-access-token",
    })
  })

  it("uses username as the stable cookie-authenticated account identity when AIHubMix omits id", async () => {
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "existing-access-token",
          },
        }),
      ),
    )

    await expect(
      fetchUserInfo({
        baseUrl: "https://aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).resolves.toMatchObject({
      id: "aihubmix-user",
      username: "aihubmix-user",
      access_token: "existing-access-token",
    })
  })

  it("fetches cookie user info from the main web origin for console.aihubmix.com", async () => {
    let mainOriginUserInfoCalled = false
    let consoleOriginUserInfoCalled = false
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () => {
        mainOriginUserInfoCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "",
          },
        })
      }),
      http.get("https://console.aihubmix.com/call/usr/self", () => {
        consoleOriginUserInfoCalled = true
        return HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: null,
          },
          { status: 500 },
        )
      }),
    )

    await expect(
      fetchUserInfo({
        baseUrl: "https://console.aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).resolves.toMatchObject({
      id: "aihubmix-user",
      username: "aihubmix-user",
    })
    expect(mainOriginUserInfoCalled).toBe(true)
    expect(consoleOriginUserInfoCalled).toBe(false)
  })

  it("fetches access-token user info from /api/user/self with raw Authorization", async () => {
    let capturedAuthorization: string | null = null
    let mainOriginUserInfoCalled = false
    server.use(
      http.get("https://aihubmix.com/api/user/self", ({ request }) => {
        mainOriginUserInfoCalled = true
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "",
            quota: 900000,
          },
        })
      }),
      http.get("https://console.aihubmix.com/api/user/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: null,
          },
          { status: 500 },
        ),
      ),
      http.get("https://aihubmix.com/call/usr/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong auth endpoint",
            data: null,
          },
          { status: 500 },
        ),
      ),
    )

    await expect(
      fetchUserInfo({
        baseUrl: "https://console.aihubmix.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "system-access-token",
        },
      }),
    ).resolves.toMatchObject({
      id: "aihubmix-user",
      username: "aihubmix-user",
    })
    expect(mainOriginUserInfoCalled).toBe(true)
    expect(capturedAuthorization).toBe("system-access-token")
  })

  it("uses existing access_token from /call/usr/self before fetching the console token", async () => {
    let consoleTokenCalled = false
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "existing-access-token",
          },
        }),
      ),
      http.get("https://aihubmix.com/call/usr/tkn", () => {
        consoleTokenCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: "created-access-token",
        })
      }),
    )

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).resolves.toEqual({
      username: "aihubmix-user",
      access_token: "existing-access-token",
    })
    expect(consoleTokenCalled).toBe(false)
  })

  it("fetches the console access token when /call/usr/self has no usable token", async () => {
    let consoleTokenRequestUrl: string | null = null
    let capturedCookieAuth = false
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "",
          },
        }),
      ),
      http.get("https://aihubmix.com/call/usr/tkn", ({ request }) => {
        consoleTokenRequestUrl = request.url
        capturedCookieAuth = request.credentials === "include"
        return HttpResponse.json({
          success: true,
          message: "",
          data: "created-access-token",
        })
      }),
    )

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).resolves.toEqual({
      username: "aihubmix-user",
      access_token: "created-access-token",
    })
    expect(capturedCookieAuth).toBe(true)
    expect(consoleTokenRequestUrl).toContain(
      "https://aihubmix.com/call/usr/tkn",
    )
    expect(consoleTokenRequestUrl).toContain("_t=")
  })

  it("fetches the console access token from the main API origin for console.aihubmix.com", async () => {
    let mainOriginUserInfoCalled = false
    let mainOriginTokenCalled = false
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () => {
        mainOriginUserInfoCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "",
          },
        })
      }),
      http.get("https://aihubmix.com/call/usr/tkn", () => {
        mainOriginTokenCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: "main-origin-access-token",
        })
      }),
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "api user self requires access token",
            data: null,
          },
          { status: 401 },
        ),
      ),
      http.get("https://console.aihubmix.com/api/user/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: null,
          },
          { status: 500 },
        ),
      ),
      http.get("https://console.aihubmix.com/call/usr/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: null,
          },
          { status: 500 },
        ),
      ),
      http.get("https://console.aihubmix.com/call/usr/tkn", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: "",
          },
          { status: 500 },
        ),
      ),
    )

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://console.aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).resolves.toEqual({
      username: "aihubmix-user",
      access_token: "main-origin-access-token",
    })
    expect(mainOriginUserInfoCalled).toBe(true)
    expect(mainOriginTokenCalled).toBe(true)
  })

  it("sends saved-token management calls with raw Authorization token", async () => {
    let capturedAuthorization: string | null = null
    server.use(
      http.get("https://aihubmix.com/api/token/", ({ request }) => {
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({
          success: true,
          message: "",
          data: [
            {
              id: 1,
              user_id: 7,
              key: "plain-key",
              name: "test-key",
              status: 1,
              created_time: 100,
              accessed_time: 200,
              expired_time: -1,
              remain_quota: "500000",
              unlimited_quota: false,
              used_quota: "1000",
              model_limits: "gpt-4o",
              allow_ips: "127.0.0.1",
            },
          ],
        })
      }),
    )

    const tokens = await fetchAccountTokens(baseRequest)

    expect(capturedAuthorization).toBe("system-access-token")
    expect(tokens).toEqual([
      expect.objectContaining({
        id: 1,
        key: "plain-key",
        name: "test-key",
        remain_quota: 500000,
        used_quota: 1000,
        model_limits: "gpt-4o",
        allow_ips: "127.0.0.1",
      }),
    ])
  })

  it("rejects saved-token calls without an access token before network requests", async () => {
    let tokenEndpointCalled = false
    server.use(
      http.get("https://aihubmix.com/api/token/", () => {
        tokenEndpointCalled = true
        return HttpResponse.json({ success: true, message: "", data: [] })
      }),
    )

    await expect(
      fetchAccountTokens({
        ...baseRequest,
        auth: { ...baseRequest.auth, accessToken: "   " },
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: API_ERROR_CODES.HTTP_401,
    })
    expect(tokenEndpointCalled).toBe(false)
  })

  it("sends saved-token management calls to the main API origin for console.aihubmix.com", async () => {
    let mainOriginTokenListCalled = false
    server.use(
      http.get("https://aihubmix.com/api/token/", () => {
        mainOriginTokenListCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: [],
        })
      }),
      http.get("https://console.aihubmix.com/api/token/", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: [],
          },
          { status: 500 },
        ),
      ),
    )

    await expect(
      fetchAccountTokens({
        ...baseRequest,
        baseUrl: "https://console.aihubmix.com",
      }),
    ).resolves.toEqual([])
    expect(mainOriginTokenListCalled).toBe(true)
  })

  it("searches API keys through /api/token/search with keyword query", async () => {
    let capturedAuthorization: string | null = null
    let capturedKeyword: string | null = null
    server.use(
      http.get("https://aihubmix.com/api/token/search", ({ request }) => {
        capturedAuthorization = request.headers.get("authorization")
        capturedKeyword = new URL(request.url).searchParams.get("keyword")
        return HttpResponse.json({
          success: true,
          message: "",
          data: [
            {
              id: 9,
              user_id: 7,
              key: "searched-key",
              name: "search match",
              status: 1,
              created_time: 100,
              accessed_time: 200,
              expired_time: -1,
              remain_quota: 500000,
              unlimited_quota: false,
              used_quota: 1000,
            },
          ],
        })
      }),
    )

    const tokens = await searchApiTokens(baseRequest, "temporary key")

    expect(capturedAuthorization).toBe("system-access-token")
    expect(capturedKeyword).toBe("temporary key")
    expect(tokens).toEqual([
      expect.objectContaining({
        id: 9,
        key: "searched-key",
        name: "search match",
      }),
    ])
  })

  it("keeps cumulative used quota out of today statistics", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            quota: "900000",
            used_quota: "12345",
          },
        }),
      ),
    )

    const accountData = await fetchAccountData({
      ...baseRequest,
      checkIn: {
        enableDetection: true,
        siteStatus: {
          isCheckedInToday: false,
        },
      },
    })

    expect(accountData).toMatchObject({
      quota: 900000,
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
      todayStatsAvailability: {
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
        },
        requests: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
        },
        tokens: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
      },
      checkIn: {
        enableDetection: false,
      },
    })
  })

  it("fetches raw account quota and validates connection health", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            quota: "900000",
          },
        }),
      ),
    )

    await expect(fetchAccountQuota(baseRequest)).resolves.toBe(900000)
    await expect(validateAccountConnection(baseRequest)).resolves.toBe(true)
  })

  it("maps refresh and connection failures to shared health/failure shapes", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "bad access token",
            data: null,
          },
          { status: 401 },
        ),
      ),
    )

    await expect(refreshAccountData(baseAccountRequest)).resolves.toMatchObject(
      {
        success: false,
        healthStatus: {
          message: "account:healthStatus.httpError",
        },
      },
    )
    await expect(validateAccountConnection(baseRequest)).resolves.toBe(false)
  })

  it("reports healthy refresh data when the account read succeeds", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            quota: 500000,
            used_quota: 1000,
          },
        }),
      ),
    )

    await expect(refreshAccountData(baseAccountRequest)).resolves.toMatchObject(
      {
        success: true,
        data: {
          quota: 500000,
          today_quota_consumption: 0,
        },
        healthStatus: {
          status: "healthy",
          message: "account:healthStatus.normal",
        },
      },
    )
  })

  it("maps token detail, create, update, and delete to documented endpoints", async () => {
    const calls: Array<{ method: string; pathname: string; body?: any }> = []

    server.use(
      http.get("https://aihubmix.com/api/token/:id", ({ params, request }) => {
        calls.push({
          method: request.method,
          pathname: new URL(request.url).pathname,
        })
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: Number(params.id),
            key: "detail-key",
            name: "detail",
            status: 1,
            created_time: 1,
            accessed_time: 2,
            expired_time: -1,
            remain_quota: 100,
            unlimited_quota: false,
            used_quota: 0,
          },
        })
      }),
      http.post("https://aihubmix.com/api/token/", async ({ request }) => {
        calls.push({
          method: request.method,
          pathname: new URL(request.url).pathname,
          body: await request.json(),
        })
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 271585,
            user_id: 152534,
            key: "sk-test****fake",
            status: 1,
            name: "11",
            created_time: 1778417169,
            accessed_time: 1778417169,
            expired_time: -1,
            remain_quota: -1,
            unlimited_quota: true,
            used_quota: 0,
            models: null,
            subnet: "",
            full_key: "sk-test-00000000000000000000000000000000",
          },
        })
      }),
      http.put("https://aihubmix.com/api/token/", async ({ request }) => {
        calls.push({
          method: request.method,
          pathname: new URL(request.url).pathname,
          body: await request.json(),
        })
        return HttpResponse.json({ success: true, message: "", data: true })
      }),
      http.delete("https://aihubmix.com/api/token/:id", ({ request }) => {
        calls.push({
          method: request.method,
          pathname: new URL(request.url).pathname,
        })
        return HttpResponse.json({ success: true, message: "", data: true })
      }),
    )

    await expect(fetchTokenById(baseRequest, 12)).resolves.toMatchObject({
      id: 12,
      key: "detail-key",
    })
    await expect(createApiToken(baseRequest, tokenRequest)).resolves.toEqual(
      expect.objectContaining({
        id: 271585,
        user_id: 152534,
        key: "sk-test-00000000000000000000000000000000",
        name: "11",
      }),
    )
    await expect(updateApiToken(baseRequest, 12, tokenRequest)).resolves.toBe(
      true,
    )
    await expect(deleteApiToken(baseRequest, 12)).resolves.toBe(true)

    expect(calls).toEqual([
      { method: "GET", pathname: "/api/token/12" },
      {
        method: "POST",
        pathname: "/api/token/",
        body: {
          name: tokenRequest.name,
          expired_time: tokenRequest.expired_time,
          unlimited_quota: tokenRequest.unlimited_quota,
          remain_quota: tokenRequest.remain_quota,
          models: "",
          subnet: "",
        },
      },
      {
        method: "PUT",
        pathname: "/api/token/",
        body: {
          id: 12,
          name: tokenRequest.name,
          expired_time: tokenRequest.expired_time,
          unlimited_quota: tokenRequest.unlimited_quota,
          remain_quota: tokenRequest.remain_quota,
          models: "",
          subnet: "",
        },
      },
      { method: "DELETE", pathname: "/api/token/12" },
    ])
  })

  it("maps common form model and IP fields to AIHubMix create-key fields", async () => {
    let createPayload: unknown = null
    server.use(
      http.post("https://aihubmix.com/api/token/", async ({ request }) => {
        createPayload = await request.json()
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 20,
            user_id: 7,
            key: "sk-created",
            name: "model-limited",
            status: 1,
            created_time: 1,
            accessed_time: 1,
            expired_time: -1,
            remain_quota: -1,
            unlimited_quota: true,
            used_quota: 0,
            models: "gpt-4o,claude-3-5-sonnet",
            subnet: "127.0.0.1",
          },
        })
      }),
    )

    await expect(
      createApiToken(baseRequest, {
        ...tokenRequest,
        name: "model-limited",
        remain_quota: 123,
        unlimited_quota: true,
        model_limits_enabled: true,
        model_limits: "gpt-4o,claude-3-5-sonnet",
        allow_ips: "127.0.0.1",
        group: "ignored-group",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 20,
        model_limits: "gpt-4o,claude-3-5-sonnet",
        model_limits_enabled: true,
        allow_ips: "127.0.0.1",
      }),
    )

    expect(createPayload).toEqual({
      name: "model-limited",
      expired_time: -1,
      unlimited_quota: true,
      remain_quota: -1,
      models: "gpt-4o,claude-3-5-sonnet",
      subnet: "127.0.0.1",
    })
  })

  it("normalizes missing IP limits to an empty subnet", async () => {
    let createPayload: unknown = null
    server.use(
      http.post("https://aihubmix.com/api/token/", async ({ request }) => {
        createPayload = await request.json()
        return HttpResponse.json({ success: true, message: "", data: true })
      }),
    )

    await expect(
      createApiToken(baseRequest, {
        ...tokenRequest,
        allow_ips: undefined as any,
      }),
    ).resolves.toBe(true)

    expect(createPayload).toEqual({
      name: tokenRequest.name,
      expired_time: tokenRequest.expired_time,
      unlimited_quota: tokenRequest.unlimited_quota,
      remain_quota: tokenRequest.remain_quota,
      models: "",
      subnet: "",
    })
  })

  it("uses a localized fallback message for HTTP errors without response messages", async () => {
    server.use(
      http.get("https://aihubmix.com/api/token/", () =>
        HttpResponse.json({ error: "unauthorized" }, { status: 401 }),
      ),
    )

    await expect(fetchAccountTokens(baseRequest)).rejects.toMatchObject({
      statusCode: 401,
      message: "messages:errors.api.requestFailed",
    })
  })

  it("does not try to reveal masked keys through unsupported detail endpoints", async () => {
    let revealCalled = false
    let detailCalled = false
    server.use(
      http.post("https://aihubmix.com/api/token/:id/key", () => {
        revealCalled = true
        return HttpResponse.json(
          { success: false, message: "unsupported" },
          { status: 500 },
        )
      }),
      http.get("https://aihubmix.com/api/token/:id", () => {
        detailCalled = true
        return HttpResponse.json(
          { success: false, message: "detail is not a secret endpoint" },
          { status: 500 },
        )
      }),
    )

    await expect(
      resolveApiTokenKey(baseRequest, {
        id: 12,
        key: "sk-abcd************wxyz",
      } as any),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.TOKEN_SECRET_UNAVAILABLE,
      message: "messages:errors.tokenSecretUnavailable",
    })
    expect(revealCalled).toBe(false)
    expect(detailCalled).toBe(false)
  })

  it("passes through usable AIHubMix keys without reveal requests", async () => {
    let revealCalled = false
    let detailCalled = false
    server.use(
      http.post("https://aihubmix.com/api/token/:id/key", () => {
        revealCalled = true
        return HttpResponse.json({ success: false, message: "unsupported" })
      }),
      http.get("https://aihubmix.com/api/token/:id", () => {
        detailCalled = true
        return HttpResponse.json({
          success: false,
          message: "detail is not a secret endpoint",
        })
      }),
    )

    await expect(
      resolveApiTokenKey(baseRequest, {
        id: 12,
        key: "plain-key",
      } as any),
    ).resolves.toBe("plain-key")
    expect(revealCalled).toBe(false)
    expect(detailCalled).toBe(false)
  })

  it("normalizes available model response variants to model id strings", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model: "gpt-4o", developer_id: 1, order: 10 },
            { model: "gpt-4o-mini", developer_id: 1, order: 20 },
            { model: "claude-3-5-sonnet", developer_id: 2, order: 30 },
          ],
        }),
      ),
    )

    await expect(fetchAccountAvailableModels(baseRequest)).resolves.toEqual([
      "gpt-4o",
      "gpt-4o-mini",
      "claude-3-5-sonnet",
    ])
  })

  it("trims and de-duplicates user-scoped model ids", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            " gpt-4o ",
            { model: "gpt-4o" },
            { id: " claude-3-5-sonnet " },
            " ",
          ],
        }),
      ),
    )

    await expect(fetchAccountAvailableModels(baseRequest)).resolves.toEqual([
      "gpt-4o",
      "claude-3-5-sonnet",
    ])
  })

  it("normalizes catalog model response variants", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model_id: "gpt-4o" },
            { id: "gpt-4o-mini" },
            { name: "claude-3-5-sonnet" },
            { id: 123 },
          ],
        }),
      ),
    )

    await expect(fetchAllModels(baseRequest)).resolves.toEqual([
      "gpt-4o",
      "gpt-4o-mini",
      "claude-3-5-sonnet",
    ])
  })

  it("trims and de-duplicates global catalog model ids", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model_id: " gpt-4o " },
            { id: "gpt-4o" },
            { name: " claude-3-5-sonnet " },
            { model_id: " " },
          ],
        }),
      ),
    )

    await expect(fetchAllModels(baseRequest)).resolves.toEqual([
      "gpt-4o",
      "claude-3-5-sonnet",
    ])
  })

  it("maps AIHubMix /api/v1/models catalog prices as direct USD per 1M token prices", async () => {
    let legacyModelsCalled = false
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            {
              model_id: "gemini-3.5-flash",
              desc: "Fast Gemini model",
              developer_id: 8,
              developer_name: "Google",
              endpoints: ["chat"],
              pricing: {
                cache_read: 1.5,
                input: 1.5,
                output: 9,
              },
            },
            {
              model_id: "claude-3-5-sonnet",
              desc: "Anthropic model",
              developer_id: 2,
              developer_name: "Anthropic",
              endpoints: ["chat"],
            },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [{ model: "gemini-3.5-flash", developer_id: 8, order: 10 }],
        }),
      ),
      http.get("https://aihubmix.com/api/models", () => {
        legacyModelsCalled = true
        return HttpResponse.json({ success: true, message: "", data: {} })
      }),
    )

    const result = await fetchModelPricing(baseRequest)

    expect(result).toMatchObject({
      success: true,
      group_ratio: {},
      usable_group: {},
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
        provider: SITE_TYPES.AIHUBMIX,
      },
      data: [
        {
          model_name: "gemini-3.5-flash",
          model_description: "Fast Gemini model",
          owner_by: "Google",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name: "Google",
            externalId: "8",
          },
          model_price: 0,
          quota_type: 0,
          enable_groups: [],
          supported_endpoint_types: ["chat"],
          token_price_usd_per_million: {
            cache_read: 1.5,
            input: 1.5,
            output: 9,
          },
        },
      ],
    })
    expect(calculateModelPrice(result.data[0], {}, 7)).toMatchObject({
      inputUSD: 1.5,
      outputUSD: 9,
      inputCNY: 10.5,
      outputCNY: 63,
    })
    expect(legacyModelsCalled).toBe(false)
  })

  it("prefers a non-empty developer name over developer and routing owner metadata", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            {
              model_id: "precedence-model",
              developer_name: " Example Primary Publisher ",
              developer: "Example Secondary Publisher",
              owner_by: "Example Router",
              developer_id: "primary-publisher-id",
            },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [{ model: "precedence-model" }],
        }),
      ),
    )

    const result = await fetchModelPricing(baseRequest)

    expect(result.data[0].vendorEvidence).toEqual({
      kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
      name: "Example Primary Publisher",
      externalId: "primary-publisher-id",
    })
  })

  it("falls back from /api/user/available_models to /call/usr/avail_mdls for user-scoped AIHubMix models", async () => {
    let webAvailableModelsCalled = false
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model_id: "gpt-web-scope", desc: "Web scope model" },
            { model_id: "gpt-catalog-only", desc: "Catalog only model" },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json(
          { success: false, message: "removed", data: [] },
          { status: 404 },
        ),
      ),
      http.get("https://aihubmix.com/call/usr/avail_mdls", () => {
        webAvailableModelsCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: [{ model: "gpt-web-scope", developer_id: 1, order: 1 }],
        })
      }),
    )

    const pricing = await fetchModelPricing(baseRequest)

    expect(webAvailableModelsCalled).toBe(true)
    expect(pricing.model_list_source?.kind).toBe(
      MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
    )
    expect(pricing.data.map((model) => model.model_name)).toEqual([
      "gpt-web-scope",
    ])
  })

  it("falls through from malformed API user scope to valid web user scope", async () => {
    let webAvailableModelsCalled = false
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model_id: "gpt-web-scope", desc: "Web scope model" },
            { model_id: "gpt-catalog-only", desc: "Catalog only model" },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: { unexpected: true },
        }),
      ),
      http.get("https://aihubmix.com/call/usr/avail_mdls", () => {
        webAvailableModelsCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: [{ model: "gpt-web-scope", developer_id: 1, order: 1 }],
        })
      }),
    )

    const pricing = await fetchModelPricing(baseRequest)

    expect(webAvailableModelsCalled).toBe(true)
    expect(pricing.model_list_source?.kind).toBe(
      MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
    )
    expect(pricing.data.map((model) => model.model_name)).toEqual([
      "gpt-web-scope",
    ])
  })

  it("accepts recognized object wrappers for AIHubMix user scope", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model_id: "gpt-wrapper-scope", desc: "Wrapper scope model" },
            { model_id: "gpt-catalog-only", desc: "Catalog only model" },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            models: [{ model: "gpt-wrapper-scope", developer_id: 1 }],
          },
        }),
      ),
    )

    const pricing = await fetchModelPricing(baseRequest)

    expect(pricing.model_list_source?.kind).toBe(
      MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
    )
    expect(pricing.data.map((model) => model.model_name)).toEqual([
      "gpt-wrapper-scope",
    ])
  })

  it("falls through from unrecognized API user scope array fields to valid web user scope", async () => {
    let webAvailableModelsCalled = false
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model_id: "gpt-web-scope", desc: "Web scope model" },
            { model_id: "gpt-catalog-only", desc: "Catalog only model" },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: { unexpected: [] },
        }),
      ),
      http.get("https://aihubmix.com/call/usr/avail_mdls", () => {
        webAvailableModelsCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: [{ model: "gpt-web-scope", developer_id: 1, order: 1 }],
        })
      }),
    )

    const pricing = await fetchModelPricing(baseRequest)

    expect(webAvailableModelsCalled).toBe(true)
    expect(pricing.model_list_source?.kind).toBe(
      MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
    )
    expect(pricing.data.map((model) => model.model_name)).toEqual([
      "gpt-web-scope",
    ])
  })

  it("uses the full AIHubMix catalog with fallback metadata when user-scoped endpoints fail", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model_id: "gpt-catalog-a", desc: "Catalog model A" },
            { model_id: "gpt-catalog-b", desc: "Catalog model B" },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json(
          { success: false, message: "removed", data: [] },
          { status: 404 },
        ),
      ),
      http.get("https://aihubmix.com/call/usr/avail_mdls", () =>
        HttpResponse.json(
          { success: false, message: "not authenticated", data: [] },
          { status: 401 },
        ),
      ),
    )

    await expect(fetchModelPricing(baseRequest)).resolves.toMatchObject({
      success: true,
      group_ratio: {},
      usable_group: {},
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
        provider: SITE_TYPES.AIHUBMIX,
      },
      data: [
        { model_name: "gpt-catalog-a", enable_groups: [] },
        { model_name: "gpt-catalog-b", enable_groups: [] },
      ],
    })
  })

  it("keeps the public ID-only catalog shape evidence-free for downstream curated fallback", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            {
              model_id: "gpt-4o",
              desc: "Public catalog model",
              developer_id: 1,
              endpoints: ["chat"],
              pricing: { input: 2.5, output: 10 },
            },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json(
          { success: false, message: "removed", data: [] },
          { status: 404 },
        ),
      ),
      http.get("https://aihubmix.com/call/usr/avail_mdls", () =>
        HttpResponse.json(
          { success: false, message: "not authenticated", data: [] },
          { status: 401 },
        ),
      ),
    )

    const result = await fetchModelPricing(baseRequest)
    const [model] = result.data

    expect(result.model_list_source).toMatchObject({
      kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
      provider: SITE_TYPES.AIHUBMIX,
    })
    expect(model).toMatchObject({
      model_name: "gpt-4o",
      model_description: "Public catalog model",
      owner_by: "1",
      supported_endpoint_types: ["chat"],
      token_price_usd_per_million: { input: 2.5, output: 10 },
    })
    expect(model).not.toHaveProperty("vendorEvidence")
    expect(
      resolveModelVendorCandidate(
        { id: model.model_name, vendorEvidence: model.vendorEvidence },
        { state: "unmatched" },
      ),
    ).toMatchObject({
      state: "candidate",
      knownId: "openai",
      source: "curated-rule",
    })
  })

  it("uses catalog fallback metadata when both user scope payloads are malformed", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model_id: "gpt-catalog-a", desc: "Catalog model A" },
            { model_id: "gpt-catalog-b", desc: "Catalog model B" },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: { unexpected: true },
        }),
      ),
      http.get("https://aihubmix.com/call/usr/avail_mdls", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: "bad",
        }),
      ),
    )

    await expect(fetchModelPricing(baseRequest)).resolves.toMatchObject({
      success: true,
      group_ratio: {},
      usable_group: {},
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
        provider: SITE_TYPES.AIHUBMIX,
      },
      data: [
        { model_name: "gpt-catalog-a", enable_groups: [] },
        { model_name: "gpt-catalog-b", enable_groups: [] },
      ],
    })
  })

  it("treats a successful empty AIHubMix user scope as an empty model list", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [{ model_id: "gpt-catalog-only", desc: "Catalog model" }],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({ success: true, message: "", data: [] }),
      ),
    )

    const pricing = await fetchModelPricing(baseRequest)

    expect(pricing.model_list_source?.kind).toBe(
      MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
    )
    expect(pricing.data).toEqual([])
  })

  it("keeps AIHubMix user-scoped model ids that are missing from the catalog as minimal rows", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [{ model_id: "gpt-known", desc: "Known model" }],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [{ model: "gpt-missing-from-catalog" }],
        }),
      ),
    )

    await expect(fetchModelPricing(baseRequest)).resolves.toMatchObject({
      data: [
        {
          model_name: "gpt-missing-from-catalog",
          model_description: "",
          model_ratio: 0,
          completion_ratio: 0,
          enable_groups: [],
          supported_endpoint_types: [],
        },
      ],
    })
  })

  it("maps catalog metadata into publisher and routing evidence without promoting standalone developer ids", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            {
              model_id: "catalog-with-description",
              description: "Description fallback",
              developer_name: " ",
              developer: " Developer fallback ",
              developer_id: "opaque-developer-id",
              endpoints: " chat, embeddings , ",
            },
            {
              model_id: "catalog-with-owner",
              owner_by: " Owner fallback ",
              developer_id: 99,
            },
            {
              model_id: "catalog-with-developer-id",
              developer_id: 12,
            },
            {
              model_id: "catalog-with-string-developer-id",
              developer_id: "opaque-only",
            },
            {
              model_id: "catalog-with-invalid-developer-id",
              developer_name: "Valid Developer",
              developer_id: { invalid: true },
            },
          ],
        }),
      ),
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [
            { model: "catalog-with-description" },
            { model: "catalog-with-owner" },
            { model: "catalog-with-developer-id" },
            { model: "catalog-with-string-developer-id" },
            { model: "catalog-with-invalid-developer-id" },
          ],
        }),
      ),
    )

    const result = await fetchModelPricing(baseRequest)

    expect(result).toMatchObject({
      data: [
        {
          model_name: "catalog-with-description",
          model_description: "Description fallback",
          owner_by: " ",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name: "Developer fallback",
            externalId: "opaque-developer-id",
          },
          supported_endpoint_types: ["chat", "embeddings"],
        },
        {
          model_name: "catalog-with-owner",
          owner_by: " Owner fallback ",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
            name: "Owner fallback",
          },
        },
        {
          model_name: "catalog-with-developer-id",
          owner_by: "12",
        },
        {
          model_name: "catalog-with-string-developer-id",
          owner_by: "opaque-only",
        },
        {
          model_name: "catalog-with-invalid-developer-id",
          owner_by: "Valid Developer",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name: "Valid Developer",
          },
        },
      ],
    })
    expect(result.data[1].vendorEvidence).not.toHaveProperty("externalId")
    expect(result.data[2]).not.toHaveProperty("vendorEvidence")
    expect(result.data[3]).not.toHaveProperty("vendorEvidence")
    expect(result.data[4].vendorEvidence).not.toHaveProperty("externalId")
  })

  it("normalizes nested catalog string model values", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: [{ model_id: "gpt-4o" }, { id: "claude-3-5-sonnet" }],
        }),
      ),
    )

    await expect(fetchAllModels(baseRequest)).resolves.toEqual([
      "gpt-4o",
      "claude-3-5-sonnet",
    ])
  })

  it("throws ApiError for malformed model catalog payloads", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: null,
        }),
      ),
    )

    await expect(fetchAllModels(baseRequest)).rejects.toBeInstanceOf(ApiError)
  })

  it("fetches available models from the main API origin for console.aihubmix.com", async () => {
    let mainOriginModelsCalled = false
    server.use(
      http.get("https://aihubmix.com/api/user/available_models", () => {
        mainOriginModelsCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: ["gpt-4o"],
        })
      }),
      http.get("https://console.aihubmix.com/api/user/available_models", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: [],
          },
          { status: 500 },
        ),
      ),
    )

    await expect(
      fetchAccountAvailableModels({
        ...baseRequest,
        baseUrl: "https://console.aihubmix.com",
      }),
    ).resolves.toEqual(["gpt-4o"])
    expect(mainOriginModelsCalled).toBe(true)
  })

  it("falls back to the global model catalog when user available models fail", async () => {
    let globalModelsCalled = false
    server.use(
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json(
          {
            success: false,
            message: "available models unavailable",
            data: [],
          },
          { status: 500 },
        ),
      ),
      http.get("https://aihubmix.com/call/usr/avail_mdls", () =>
        HttpResponse.json(
          {
            success: false,
            message: "web available models unavailable",
            data: [],
          },
          { status: 500 },
        ),
      ),
      http.get("https://aihubmix.com/api/v1/models", () => {
        globalModelsCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: [{ model_id: "gpt-4o" }, { model_id: "claude-3-5-sonnet" }],
        })
      }),
    )

    await expect(fetchAccountAvailableModels(baseRequest)).resolves.toEqual([
      "gpt-4o",
      "claude-3-5-sonnet",
    ])
    expect(globalModelsCalled).toBe(true)
  })

  it("throws ApiError for malformed response bodies", async () => {
    server.use(
      http.get("https://aihubmix.com/api/token/", () =>
        HttpResponse.json(null),
      ),
    )

    await expect(fetchAccountTokens(baseRequest)).rejects.toBeInstanceOf(
      ApiError,
    )
  })

  it("throws a business ApiError when the API returns success false", async () => {
    server.use(
      http.get("https://aihubmix.com/api/token/", () =>
        HttpResponse.json({
          success: false,
          message: "business failed",
          data: null,
        }),
      ),
    )

    await expect(fetchAccountTokens(baseRequest)).rejects.toMatchObject({
      code: API_ERROR_CODES.BUSINESS_ERROR,
      message: "business failed",
    })
  })

  it("falls back to invalid response copy for business errors without a message", async () => {
    server.use(
      http.get("https://aihubmix.com/api/token/", () =>
        HttpResponse.json({
          success: false,
          data: null,
        }),
      ),
    )

    await expect(fetchAccountTokens(baseRequest)).rejects.toMatchObject({
      code: API_ERROR_CODES.BUSINESS_ERROR,
      message: "messages:errors.api.invalidResponseFormat",
    })
  })
})
