import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
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
  fetchSiteStatus,
  fetchSupportCheckIn,
  fetchTodayIncome,
  fetchTodayUsage,
  fetchTokenById,
  fetchUserGroups,
  fetchUserInfo,
  getOrCreateAccessToken,
  refreshAccountData,
  resolveApiTokenKey,
  searchApiTokens,
  updateApiToken,
  validateAccountConnection,
} from "~/services/apiService/aihubmix"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import type { CreateTokenRequest } from "~/services/apiService/common/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const baseRequest = {
  baseUrl: "https://aihubmix.com",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: 7,
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
    })
    await expect(fetchTodayIncome(baseRequest)).resolves.toEqual({
      today_income: 0,
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
        key: "sk-direct-key",
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
      id: 7,
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
      id: 7,
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
      id: 7,
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
        key: "sk-plain-key",
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
        key: "sk-searched-key",
        name: "search match",
      }),
    ])
  })

  it("parses account quota and used quota from /api/user/self", async () => {
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
      today_quota_consumption: 12345,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
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
          today_quota_consumption: 1000,
        },
        healthStatus: {
          status: "healthy",
          message: "account:healthStatus.normal",
        },
      },
    )
  })

  it("explicitly marks user groups unsupported without calling common group endpoints", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self/groups", () =>
        HttpResponse.json(
          {
            success: false,
            message: "AIHubMix has no group endpoint",
            data: null,
          },
          { status: 500 },
        ),
      ),
    )

    await expect(fetchUserGroups(baseRequest)).rejects.toMatchObject({
      code: API_ERROR_CODES.FEATURE_UNSUPPORTED,
      message: "aihubmix_user_groups_unsupported",
    })
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
      key: "sk-detail-key",
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
    ).resolves.toBe("sk-plain-key")
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

  it("normalizes catalog model response variants and removes duplicates", async () => {
    server.use(
      http.get("https://aihubmix.com/api/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            OpenAI: [
              { id: "gpt-4o" },
              { name: "gpt-4o-mini" },
              { model: "gpt-4o" },
              { id: 123 },
            ],
            Misc: ["claude-3-5-sonnet"],
          },
        }),
      ),
    )

    await expect(fetchAllModels(baseRequest)).resolves.toEqual([
      "gpt-4o",
      "gpt-4o-mini",
      "claude-3-5-sonnet",
    ])
  })

  it("normalizes nested catalog string model values", async () => {
    server.use(
      http.get("https://aihubmix.com/api/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            OpenAI: ["gpt-4o", "gpt-4o"],
            Anthropic: ["claude-3-5-sonnet"],
          },
        }),
      ),
    )

    await expect(fetchAllModels(baseRequest)).resolves.toEqual([
      "gpt-4o",
      "claude-3-5-sonnet",
    ])
  })

  it("returns an empty model list for unrecognized model payloads", async () => {
    server.use(
      http.get("https://aihubmix.com/api/models", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: null,
        }),
      ),
    )

    await expect(fetchAllModels(baseRequest)).resolves.toEqual([])
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
      http.get("https://aihubmix.com/api/models", () => {
        globalModelsCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            OpenAI: [{ id: "gpt-4o" }],
            Anthropic: [{ id: "claude-3-5-sonnet" }],
          },
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
