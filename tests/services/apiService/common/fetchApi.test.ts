import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AuthTypeEnum, TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types"
import {
  COOKIE_AUTH_HEADER_NAME,
  COOKIE_SESSION_OVERRIDE_HEADER_NAME,
} from "~/utils/browser/cookieHelper"
import { server } from "~~/tests/msw/server"

let fetchApiData: typeof import("~/services/apiService/common/utils").fetchApiData
let fetchApi: typeof import("~/services/apiService/common/utils").fetchApi
let extractDataFromApiResponseBody: typeof import("~/services/apiService/common/utils").extractDataFromApiResponseBody
let isHttpUrl: typeof import("~/services/apiService/common/utils").isHttpUrl
let ApiError: typeof import("~/services/apiService/common/errors").ApiError
let ApiErrorCodes: typeof import("~/services/apiService/common/errors").API_ERROR_CODES

const { mockLogRequestRateLimiter, mockCreateMinIntervalLimiter } = vi.hoisted(
  () => {
    const mockLogRequestRateLimiter = vi.fn().mockResolvedValue(undefined)
    const mockCreateMinIntervalLimiter = vi.fn(() => mockLogRequestRateLimiter)

    return { mockLogRequestRateLimiter, mockCreateMinIntervalLimiter }
  },
)

const { mockWithSiteApiRequestLimit } = vi.hoisted(() => {
  const mockWithSiteApiRequestLimit = vi.fn(
    async (_key: string, task: () => Promise<unknown>) => await task(),
  )

  return { mockWithSiteApiRequestLimit }
})

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

vi.mock("~/services/apiService/common/siteRequestLimiter", () => ({
  SITE_API_REQUEST_LIMITS: {
    maxConcurrentPerSite: 2,
    requestsPerMinute: 18,
    burst: 4,
  },
  createSiteRequestLimiter: vi.fn(),
  withSiteApiRequestLimit: mockWithSiteApiRequestLimit,
}))

vi.mock("~/utils/browser/protectionBypass", () => ({
  isProtectionBypassFirefoxEnv: vi.fn(() => true),
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
    extractDataFromApiResponseBody = utils.extractDataFromApiResponseBody
    isHttpUrl = utils.isHttpUrl

    const errors = await vi.importActual<
      typeof import("~/services/apiService/common/errors")
    >("~/services/apiService/common/errors")
    ApiError = errors.ApiError
    ApiErrorCodes = errors.API_ERROR_CODES
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    server.resetHandlers()

    mockWithSiteApiRequestLimit.mockImplementation(
      async (_key: string, task: () => Promise<unknown>) => await task(),
    )
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

  it("fetchApiData applies the site API limiter with a normalized origin key", async () => {
    server.use(
      http.get(/^https:\/\/example\.com\/base\//, () => {
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "ok",
        })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: "HTTPS://Example.com/base/",
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: "/api/user/self" },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockWithSiteApiRequestLimit).toHaveBeenCalledTimes(1)
    expect(mockWithSiteApiRequestLimit).toHaveBeenCalledWith(
      "https://example.com",
      expect.any(Function),
    )
  })

  it("fetchApiData uses the same site limiter key for different paths on the same origin", async () => {
    server.use(
      http.get(/^https:\/\/example\.com\/(?:base|admin)\//, () => {
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "ok",
        })
      }),
    )

    await fetchApiData(
      {
        baseUrl: "https://example.com/base/",
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
      },
      { endpoint: "/api/user/self" },
    )
    await fetchApiData(
      {
        baseUrl: "https://example.com/admin/",
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
      },
      { endpoint: "/api/status" },
    )

    expect(mockWithSiteApiRequestLimit).toHaveBeenCalledTimes(2)
    expect(mockWithSiteApiRequestLimit.mock.calls[0][0]).toBe(
      "https://example.com",
    )
    expect(mockWithSiteApiRequestLimit.mock.calls[1][0]).toBe(
      "https://example.com",
    )
  })

  it("fetchApiData forwards cookie auth headers and a session override cookie when available", async () => {
    let capturedCookie: string | null = null
    let capturedCookieAuthMode: string | null = null
    let capturedSessionOverride: string | null = null

    server.use(
      http.get(API_URL, ({ request }) => {
        capturedCookie = request.headers.get("cookie")
        capturedCookieAuthMode = request.headers.get(COOKIE_AUTH_HEADER_NAME)
        capturedSessionOverride = request.headers.get(
          COOKIE_SESSION_OVERRIDE_HEADER_NAME,
        )

        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "ok",
        })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: 123,
          },
        },
        {
          endpoint: ENDPOINT,
          tempWindowFallback: { statusCodes: [], codes: [] },
        },
      ),
    ).resolves.toEqual({ ok: true })

    expect(capturedCookie).toBe("session=abc123")
    expect(capturedCookieAuthMode).toBe("cookie")
    expect(capturedSessionOverride).toBe("session=abc123")
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

  it("fetchApi returns the full response envelope when unwrapping is disabled", async () => {
    const apiEnvelope = {
      success: true,
      data: { nested: "value" },
      message: "ok",
    }
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json(apiEnvelope)
      }),
    )

    const result = await fetchApi<{ nested: string }>(
      {
        baseUrl: BASE_URL,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
      },
      { endpoint: ENDPOINT },
    )

    expect(result).toEqual(apiEnvelope)
  })

  it("fetchApiData rejects non-JSON response types before issuing the request", async () => {
    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: ENDPOINT, responseType: "text" },
      ),
    ).rejects.toMatchObject({
      endpoint: ENDPOINT,
      message: "fetchApiData 仅支持 JSON 响应",
    })
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

  it("rejects 200 responses whose content type is not JSON", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.text("plain text", {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
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
      statusCode: 200,
      code: ApiErrorCodes.CONTENT_TYPE_MISMATCH,
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

      expect(mockWithSiteApiRequestLimit).toHaveBeenCalledWith(
        "https://example.com",
        expect.any(Function),
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

  it("fetchApi supports text responses", async () => {
    server.use(
      http.get("https://example.com/base/api/text", () => {
        return HttpResponse.text("hello world")
      }),
    )

    await expect(
      fetchApi<string>(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: "/api/text", responseType: "text" },
        true,
      ),
    ).resolves.toBe("hello world")
  })

  it("fetchApi supports arrayBuffer responses", async () => {
    server.use(
      http.get("https://example.com/base/api/buffer", () => {
        return new HttpResponse(Uint8Array.from([1, 2, 3]), {
          headers: { "Content-Type": "application/octet-stream" },
        })
      }),
    )

    const result = await fetchApi<ArrayBuffer>(
      {
        baseUrl: BASE_URL,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
      },
      { endpoint: "/api/buffer", responseType: "arrayBuffer" },
      true,
    )

    expect(Array.from(new Uint8Array(result))).toEqual([1, 2, 3])
  })

  it("fetchApi supports blob responses", async () => {
    server.use(
      http.get("https://example.com/base/api/blob", () => {
        return new HttpResponse(Uint8Array.from([4, 5, 6]), {
          headers: { "Content-Type": "application/octet-stream" },
        })
      }),
    )

    const result = await fetchApi<Blob>(
      {
        baseUrl: BASE_URL,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
      },
      { endpoint: "/api/blob", responseType: "blob" },
      true,
    )

    expect(result).toBeInstanceOf(Blob)
    expect(Array.from(new Uint8Array(await result.arrayBuffer()))).toEqual([
      4, 5, 6,
    ])
  })

  it("isHttpUrl and extractDataFromApiResponseBody guard invalid input", () => {
    expect(isHttpUrl("https://example.com")).toBe(true)
    expect(isHttpUrl("http://example.com")).toBe(true)
    expect(isHttpUrl("ftp://example.com")).toBe(false)
    expect(isHttpUrl("not-a-url")).toBe(false)

    expect(() =>
      extractDataFromApiResponseBody(null, "/api/invalid"),
    ).toThrowError(ApiError)
    expect(() =>
      extractDataFromApiResponseBody(
        { success: false, data: null, message: "" },
        "/api/invalid",
      ),
    ).toThrowError(ApiError)
  })
})
