import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { server } from "~/tests/msw/server"
import { AuthTypeEnum, TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types"

let fetchApiData: typeof import("~/services/apiService/common/utils").fetchApiData
let fetchApi: typeof import("~/services/apiService/common/utils").fetchApi
let ApiError: typeof import("~/services/apiService/common/errors").ApiError
let ApiErrorCodes: typeof import("~/services/apiService/common/errors").API_ERROR_CODES

const { mockLogRequestRateLimiter, mockCreateMinIntervalLimiter } = vi.hoisted(
  () => {
    const mockLogRequestRateLimiter = vi.fn().mockResolvedValue(undefined)
    const mockCreateMinIntervalLimiter = vi.fn(() => mockLogRequestRateLimiter)

    return { mockLogRequestRateLimiter, mockCreateMinIntervalLimiter }
  },
)

const { mockHasCookieInterceptorPermissions, mockGetPreferences } = vi.hoisted(
  () => ({
    mockHasCookieInterceptorPermissions: vi.fn(),
    mockGetPreferences: vi.fn(),
  }),
)

vi.mock("~/services/permissions/permissionManager", () => ({
  COOKIE_INTERCEPTOR_PERMISSIONS: [
    "cookies",
    "webRequest",
    "webRequestBlocking",
  ],
  hasCookieInterceptorPermissions: mockHasCookieInterceptorPermissions,
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  DEFAULT_PREFERENCES: {
    tempWindowFallback: {
      enabled: false,
      useInPopup: true,
      useInSidePanel: true,
      useInOptions: true,
      useForAutoRefresh: true,
      useForManualRefresh: true,
    },
  },
  userPreferences: {
    getPreferences: mockGetPreferences,
  },
}))

vi.mock("~/services/apiService/common/minIntervalLimiter", () => ({
  createMinIntervalLimiter: mockCreateMinIntervalLimiter,
}))

const BASE_URL = "https://example.com/base/"
const ENDPOINT = "/api/test"
const API_URL = "https://example.com/base/api/test"

describe("apiService common fetchApi helpers", () => {
  beforeEach(async () => {
    // Ensure we always use the real implementations even if other tests mock these modules.
    const utils = await vi.importActual<
      typeof import("~/services/apiService/common/utils")
    >("~/services/apiService/common/utils")
    fetchApiData = utils.fetchApiData
    fetchApi = utils.fetchApi

    const errors = await vi.importActual<
      typeof import("~/services/apiService/common/errors")
    >("~/services/apiService/common/errors")
    ApiError = errors.ApiError
    ApiErrorCodes = errors.API_ERROR_CODES
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    server.resetHandlers()

    mockHasCookieInterceptorPermissions.mockResolvedValue(true)
    mockGetPreferences.mockResolvedValue({
      tempWindowFallback: {
        enabled: false,
        useInPopup: true,
        useInSidePanel: true,
        useInOptions: true,
        useForAutoRefresh: true,
        useForManualRefresh: true,
      },
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("fetchApiData should build URL with joinUrl and return data on success", async () => {
    const data = { foo: "bar" }
    let callCount = 0
    let capturedUrl: string | null = null
    let capturedCredentials: RequestCredentials | null = null
    let capturedAuthorization: string | null = null

    server.use(
      http.get(API_URL, ({ request }) => {
        callCount += 1
        capturedUrl = request.url
        capturedCredentials = request.credentials
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({ success: true, data, message: "ok" })
      }),
    )

    const result = await fetchApiData<{ foo: string }>(
      {
        baseUrl: BASE_URL,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: 123,
          accessToken: "token",
        },
      },
      { endpoint: ENDPOINT },
    )

    expect(callCount).toBe(1)
    expect(capturedUrl).toBe(API_URL)
    expect(capturedCredentials).toBe("omit")
    expect(capturedAuthorization).toBe("Bearer token")
    expect(result).toEqual(data)
  })

  it("fetchApi should unwrap ApiResponse when _normalResponseType is true", async () => {
    const payload = { models: [{ name: "models/gemini-1.5-pro" }] }
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({
          success: true,
          data: payload,
          message: "ok",
        })
      }),
    )

    const result = await fetchApi<{ models: Array<{ name: string }> }>(
      {
        baseUrl: BASE_URL,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
      },
      { endpoint: ENDPOINT },
      true,
    )

    expect(result).toEqual(payload)
  })

  it("fetchApi should not unwrap non-ApiResponse JSON payloads that include success/data fields", async () => {
    const pricingLikeResponse = {
      data: [{ model_name: "gpt-4.1", model_ratio: 1 }],
      group_ratio: { default: 1 },
      success: true,
      usable_group: { default: "Default" },
    }
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json(pricingLikeResponse)
      }),
    )

    const result = await fetchApi<typeof pricingLikeResponse>(
      {
        baseUrl: BASE_URL,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
      },
      { endpoint: ENDPOINT },
      true,
    )

    expect(result).toEqual(pricingLikeResponse)
  })

  it("fetchApiData should throw ApiError when HTTP response is not ok", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({}, { status: 500 })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it("classifies 401 HTML responses as CONTENT_TYPE_MISMATCH for JSON requests", async () => {
    server.use(
      http.get(API_URL, () => {
        return new HttpResponse("<html></html>", {
          status: 401,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        {
          endpoint: ENDPOINT,
          tempWindowFallback: { statusCodes: [], codes: [] },
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: ApiErrorCodes.CONTENT_TYPE_MISMATCH,
    })
  })

  it.each(["application/xhtml+xml", "application/xhtml+xml; charset=utf-8"])(
    "classifies 401 XHTML responses (%s) as CONTENT_TYPE_MISMATCH for JSON requests",
    async (contentType) => {
      server.use(
        http.get(API_URL, () => {
          return new HttpResponse("<html></html>", {
            status: 401,
            headers: { "Content-Type": contentType },
          })
        }),
      )

      await expect(
        fetchApiData(
          {
            baseUrl: BASE_URL,
            auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          },
          {
            endpoint: ENDPOINT,
            tempWindowFallback: { statusCodes: [], codes: [] },
          },
        ),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: ApiErrorCodes.CONTENT_TYPE_MISMATCH,
      })
    },
  )

  it("classifies 401 JSON responses as HTTP_401 for JSON requests", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({}, { status: 401 })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        {
          endpoint: ENDPOINT,
          tempWindowFallback: { statusCodes: [], codes: [] },
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: ApiErrorCodes.HTTP_401,
    })
  })

  it("classifies 429 HTML responses without Retry-After as CONTENT_TYPE_MISMATCH for JSON requests", async () => {
    server.use(
      http.get(API_URL, () => {
        return new HttpResponse("<html></html>", {
          status: 429,
          headers: { "Content-Type": "text/html" },
        })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        {
          endpoint: ENDPOINT,
          tempWindowFallback: { statusCodes: [], codes: [] },
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 429,
      code: ApiErrorCodes.CONTENT_TYPE_MISMATCH,
    })
  })

  it.each(["application/xhtml+xml", "application/xhtml+xml; charset=utf-8"])(
    "classifies 429 XHTML responses without Retry-After (%s) as CONTENT_TYPE_MISMATCH for JSON requests",
    async (contentType) => {
      server.use(
        http.get(API_URL, () => {
          return new HttpResponse("<html></html>", {
            status: 429,
            headers: { "Content-Type": contentType },
          })
        }),
      )

      await expect(
        fetchApiData(
          {
            baseUrl: BASE_URL,
            auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          },
          {
            endpoint: ENDPOINT,
            tempWindowFallback: { statusCodes: [], codes: [] },
          },
        ),
      ).rejects.toMatchObject({
        statusCode: 429,
        code: ApiErrorCodes.CONTENT_TYPE_MISMATCH,
      })
    },
  )

  it("classifies 429 responses with Retry-After as HTTP_429 for JSON requests", async () => {
    server.use(
      http.get(API_URL, () => {
        return new HttpResponse("<html></html>", {
          status: 429,
          headers: { "Content-Type": "text/html", "Retry-After": "60" },
        })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        {
          endpoint: ENDPOINT,
          tempWindowFallback: { statusCodes: [], codes: [] },
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 429,
      code: ApiErrorCodes.HTTP_429,
    })
  })

  it.each(["application/xhtml+xml", "application/xhtml+xml; charset=utf-8"])(
    "classifies 429 XHTML responses with Retry-After (%s) as HTTP_429 for JSON requests",
    async (contentType) => {
      server.use(
        http.get(API_URL, () => {
          return new HttpResponse("<html></html>", {
            status: 429,
            headers: { "Content-Type": contentType, "Retry-After": "60" },
          })
        }),
      )

      await expect(
        fetchApiData(
          {
            baseUrl: BASE_URL,
            auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          },
          {
            endpoint: ENDPOINT,
            tempWindowFallback: { statusCodes: [], codes: [] },
          },
        ),
      ).rejects.toMatchObject({
        statusCode: 429,
        code: ApiErrorCodes.HTTP_429,
      })
    },
  )

  it("fetchApiData should throw ApiError when success is false with message", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({
          success: false,
          data: null,
          message: "bad request",
        })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toMatchObject({ message: "bad request" } as any)
  })

  it("fetchApiData should tag eligible errors when temp-window fallback is disabled", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({}, { status: 403 })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toMatchObject({
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      originalCode: "HTTP_403",
    })
  })

  it.each([
    ["/api/log", true],
    ["/api/log/", true],
    ["/api/log/usage", true],
    ["/api/login", false],
    ["/api/logout", false],
    ["/api/logs", false],
    ["https://example.com/api/log", true],
    ["https://example.com/api/log/usage", true],
    ["https://example.com/api/login", false],
  ])(
    "fetchApiData should only rate-limit /api/log endpoints (endpoint=%s)",
    async (endpoint, shouldRateLimit) => {
      mockLogRequestRateLimiter.mockClear()

      server.use(
        http.get(/^https:\/\/example\.com\/base\//, () => {
          return HttpResponse.json({
            success: true,
            data: { ok: true },
            message: "ok",
          })
        }),
      )

      await fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint },
      )

      if (shouldRateLimit) {
        expect(mockLogRequestRateLimiter).toHaveBeenCalledTimes(1)
        expect(mockLogRequestRateLimiter).toHaveBeenCalledWith(
          "https://example.com",
        )
      } else {
        expect(mockLogRequestRateLimiter).not.toHaveBeenCalled()
      }
    },
  )
})
