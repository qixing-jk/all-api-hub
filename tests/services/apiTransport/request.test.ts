import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  API_AUTH_TOKEN_MODES,
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
} from "~/services/apiTransport/type"
import { AuthTypeEnum, TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  COOKIE_AUTH_HEADER_NAME,
  COOKIE_SESSION_OVERRIDE_HEADER_NAME,
} from "~/utils/browser/cookieHelper"
import { server } from "~~/tests/msw/server"

let fetchApiData: typeof import("~/services/apiTransport/request").fetchApiData
let fetchApi: typeof import("~/services/apiTransport/request").fetchApi
let extractDataFromApiResponseBody: typeof import("~/services/apiTransport/response").extractDataFromApiResponseBody
let isHttpUrl: typeof import("~/services/apiTransport/response").isHttpUrl
let ApiError: typeof import("~/services/apiTransport/errors").ApiError
let ApiErrorCodes: typeof import("~/services/apiTransport/errors").API_ERROR_CODES

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

const { mockSendTabMessageWithRetry, mockSendRuntimeMessage } = vi.hoisted(
  () => ({
    mockSendTabMessageWithRetry: vi.fn(),
    mockSendRuntimeMessage: vi.fn(),
  }),
)

const { mockIsProtectionBypassFirefoxEnv } = vi.hoisted(() => ({
  mockIsProtectionBypassFirefoxEnv: vi.fn(() => true),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendTabMessageWithRetry: mockSendTabMessageWithRetry,
    sendRuntimeMessage: mockSendRuntimeMessage,
  }
})

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

vi.mock("~/services/apiTransport/minIntervalLimiter", () => ({
  createMinIntervalLimiter: mockCreateMinIntervalLimiter,
}))

vi.mock("~/services/apiTransport/siteRequestLimiter", () => ({
  SITE_API_REQUEST_LIMITS: {
    maxConcurrentPerSite: 2,
    requestsPerMinute: 18,
    burst: 4,
  },
  createSiteRequestLimiter: vi.fn(),
  withSiteApiRequestLimit: mockWithSiteApiRequestLimit,
}))

vi.mock("~/utils/browser/protectionBypass", () => ({
  isProtectionBypassFirefoxEnv: mockIsProtectionBypassFirefoxEnv,
}))

vi.mock("~/utils/browser/index", () => ({
  isExtensionBackground: vi.fn(() => false),
  isExtensionOptions: vi.fn(() => false),
  isExtensionPopup: vi.fn(() => false),
  isExtensionSidePanel: vi.fn(() => false),
}))

vi.mock("~/utils/browser/extensionPageUrls", () => ({
  OPTIONS_PAGE_URL: "chrome-extension://test/options.html",
}))

const BASE_URL = "https://example.com/base/"
const ENDPOINT = "/api/test"
const API_URL = "https://example.com/base/api/test"

function mockTempWindowFallbackDisabledPreference() {
  mockGetPreferences.mockResolvedValueOnce({
    tempWindowFallback: {
      enabled: false,
      useInPopup: true,
      useInSidePanel: true,
      useInOptions: true,
      useForAutoRefresh: true,
      useForManualRefresh: true,
    },
  })
}

async function expectTempWindowDisabledFallback(
  endpoint: string = ENDPOINT,
): Promise<void> {
  await expect(
    fetchApiData(
      {
        baseUrl: BASE_URL,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
      },
      { endpoint },
    ),
  ).rejects.toMatchObject({
    code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
    originalCode: "HTTP_403",
    message: "请求失败: 403",
  })
}

describe("apiTransport request helpers", () => {
  beforeEach(async () => {
    // Ensure we always use the real implementations even if other tests mock these modules.
    const request = await vi.importActual<
      typeof import("~/services/apiTransport/request")
    >("~/services/apiTransport/request")
    fetchApiData = request.fetchApiData
    fetchApi = request.fetchApi

    const response = await vi.importActual<
      typeof import("~/services/apiTransport/response")
    >("~/services/apiTransport/response")
    extractDataFromApiResponseBody = response.extractDataFromApiResponseBody
    isHttpUrl = response.isHttpUrl

    const errors = await vi.importActual<
      typeof import("~/services/apiTransport/errors")
    >("~/services/apiTransport/errors")
    ApiError = errors.ApiError
    ApiErrorCodes = errors.API_ERROR_CODES
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    server.resetHandlers()

    mockHasCookieInterceptorPermissions.mockReset()
    mockGetPreferences.mockReset()
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
    mockSendTabMessageWithRetry.mockReset()
    mockSendRuntimeMessage.mockReset()
    mockSendRuntimeMessage.mockResolvedValue({ success: true })
    mockIsProtectionBypassFirefoxEnv.mockReset()
    mockIsProtectionBypassFirefoxEnv.mockReturnValue(true)
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
          userId: "123",
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

  it("fetchApiData merges custom headers without dropping auth headers", async () => {
    let capturedAccept: string | null = null
    let capturedAuthorization: string | null = null

    server.use(
      http.get(API_URL, ({ request }) => {
        capturedAccept = request.headers.get("accept")
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "ok",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "token",
          },
        },
        {
          endpoint: ENDPOINT,
          options: {
            headers: {
              Accept: "application/json",
            },
          },
        },
      ),
    ).resolves.toEqual({ ok: true })

    expect(capturedAccept).toBe("application/json")
    expect(capturedAuthorization).toBe("Bearer token")
  })

  it("uses Bearer authorization for access tokens by default", async () => {
    let capturedAuthorization: string | null = null

    server.use(
      http.get(API_URL, ({ request }) => {
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "ok",
        })
      }),
    )

    await fetchApi(
      {
        baseUrl: BASE_URL,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "jwt-default",
        },
      },
      { endpoint: ENDPOINT },
      true,
    )

    expect(capturedAuthorization).toBe("Bearer jwt-default")
  })

  it("uses raw authorization when authTokenMode is raw", async () => {
    let capturedAuthorization: string | null = null

    server.use(
      http.get(API_URL, ({ request }) => {
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "ok",
        })
      }),
    )

    await fetchApi(
      {
        baseUrl: BASE_URL,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "jwt-raw",
        },
      },
      {
        endpoint: ENDPOINT,
        authTokenMode: API_AUTH_TOKEN_MODES.Raw,
      },
      true,
    )

    expect(capturedAuthorization).toBe("jwt-raw")
  })

  it("keeps caller-provided Authorization header override in raw-token mode", async () => {
    let capturedAuthorization: string | null = null

    server.use(
      http.get(API_URL, ({ request }) => {
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "ok",
        })
      }),
    )

    await fetchApi(
      {
        baseUrl: BASE_URL,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "jwt-from-account",
        },
      },
      {
        endpoint: ENDPOINT,
        authTokenMode: API_AUTH_TOKEN_MODES.Raw,
        options: {
          headers: {
            Authorization: "manual-header",
          },
        },
      },
      true,
    )

    expect(capturedAuthorization).toBe("manual-header")
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
            userId: "123",
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

  it("fetchApiData prefers current-tab content fetch for same-origin read requests", async () => {
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        success: true,
        data: { ok: true },
        message: "ok",
      },
    })

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
        },
        {
          endpoint: ENDPOINT,
          options: {
            method: "GET",
            headers: {
              "X-Probe": "auto-detect",
            },
          },
        },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry).toHaveBeenCalledTimes(1)
    expect(mockSendTabMessageWithRetry).toHaveBeenCalledWith(
      456,
      expect.objectContaining({
        action: RuntimeActionIds.ContentPerformTempWindowFetch,
        fetchUrl: API_URL,
        responseType: "json",
      }),
    )
    expect(mockSendTabMessageWithRetry.mock.calls[0][1].fetchOptions).toEqual(
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        headers: expect.objectContaining({
          Cookie: "session=abc123",
          "X-Probe": "auto-detect",
        }),
      }),
    )
  })

  it("omits abort signals from current-tab content fetch messages", async () => {
    const abortController = new AbortController()
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        success: true,
        data: { ok: true },
        message: "ok",
      },
    })

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          abortSignal: abortController.signal,
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry).toHaveBeenCalledTimes(1)
    expect(mockSendTabMessageWithRetry.mock.calls[0][1].fetchOptions).toEqual(
      expect.not.objectContaining({
        signal: expect.anything(),
      }),
    )
  })

  it("normalizes Headers objects before sending current-tab content fetch", async () => {
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      success: true,
      data: { success: true, data: { ok: true }, message: "content" },
    })

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
        },
        {
          endpoint: ENDPOINT,
          options: {
            method: "GET",
            headers: new Headers({
              "X-Header-Object": "yes",
            }),
          },
        },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry.mock.calls[0][1].fetchOptions).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "session=abc123",
          "x-header-object": "yes",
        }),
      }),
    )
  })

  it("normalizes header tuple arrays before sending current-tab content fetch", async () => {
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      success: true,
      data: { success: true, data: { ok: true }, message: "content" },
    })

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
        },
        {
          endpoint: ENDPOINT,
          options: {
            method: "GET",
            headers: [["X-Header-Tuple", "yes"]],
          },
        },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry.mock.calls[0][1].fetchOptions).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "session=abc123",
          "X-Header-Tuple": "yes",
        }),
      }),
    )
  })

  it("fetchApiData can use current-tab content fetch for mutating requests", async () => {
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      success: true,
      data: { success: true, data: { ok: true }, message: "content" },
    })

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
        },
        {
          endpoint: ENDPOINT,
          options: {
            method: "POST",
            body: JSON.stringify({ probe: true }),
          },
        },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry).toHaveBeenCalledTimes(1)
    expect(mockSendTabMessageWithRetry).toHaveBeenCalledWith(
      456,
      expect.objectContaining({
        action: RuntimeActionIds.ContentPerformTempWindowFetch,
        fetchUrl: API_URL,
        responseType: "json",
      }),
    )
    expect(mockSendTabMessageWithRetry.mock.calls[0][1].fetchOptions).toEqual(
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ probe: true }),
      }),
    )
  })

  it("fetchApiData skips current-tab content fetch when the request URL is not same-origin", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "direct",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "token",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://other.example.com",
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry).not.toHaveBeenCalled()
  })

  it("skips current-tab content fetch when the context origin is invalid", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "direct",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "token",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "not a url",
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry).not.toHaveBeenCalled()
  })

  it("skips current-tab content fetch when the tab id is invalid", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "direct",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "token",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: "456" as unknown as number,
            origin: "https://example.com",
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry).not.toHaveBeenCalled()
  })

  it("fetchApiData falls back to the normal fetch path when current-tab content fetch fails", async () => {
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      success: false,
      status: 503,
      error: "content fetch failed",
    })

    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "direct",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "token",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry).toHaveBeenCalledTimes(1)
  })

  it("fetchApiData preserves the popup temp window source through fallback context", async () => {
    mockIsProtectionBypassFirefoxEnv.mockReturnValue(false)
    mockGetPreferences.mockResolvedValueOnce({
      tempWindowFallback: {
        enabled: true,
        useInPopup: true,
        useInSidePanel: true,
        useInOptions: true,
        useForAutoRefresh: true,
        useForManualRefresh: true,
      },
    })
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      success: false,
      status: 503,
      error: "content fetch failed",
    })
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        success: true,
        data: { ok: true },
        message: "temp",
      },
    })

    let normalFetchCount = 0
    server.use(
      http.get(API_URL, () => {
        normalFetchCount += 1
        return HttpResponse.json({
          success: true,
          data: { ok: false },
          message: "normal",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
            incognito: true,
            cookieStoreId: "1-incognito",
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({ ok: true })

    expect(normalFetchCount).toBe(0)
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.TempWindowFetch,
        originUrl: BASE_URL,
        fetchUrl: API_URL,
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        suppressMinimize: true,
        useIncognito: true,
        cookieStoreId: "1-incognito",
      }),
    )
  })

  it("fetchApiData skips normal fetch for incognito browser-context fallback", async () => {
    mockGetPreferences.mockResolvedValueOnce({
      tempWindowFallback: {
        enabled: true,
        useInPopup: true,
        useInSidePanel: true,
        useInOptions: true,
        useForAutoRefresh: true,
        useForManualRefresh: true,
      },
    })
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        success: true,
        data: { ok: true },
        message: "temp",
      },
    })

    let normalFetchCount = 0
    server.use(
      http.get(API_URL, () => {
        normalFetchCount += 1
        return HttpResponse.json({
          success: true,
          data: { ok: false },
          message: "normal",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
            incognito: true,
            cookieStoreId: "1-incognito",
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry).not.toHaveBeenCalled()
    expect(normalFetchCount).toBe(0)
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.TempWindowFetch,
        originUrl: BASE_URL,
        fetchUrl: API_URL,
        useIncognito: true,
        cookieStoreId: "1-incognito",
      }),
    )
  })

  it("fetchApiData skips normal fetch when a browser-context cookie store is present", async () => {
    mockGetPreferences.mockResolvedValueOnce({
      tempWindowFallback: {
        enabled: true,
        useInPopup: true,
        useInSidePanel: true,
        useInOptions: true,
        useForAutoRefresh: true,
        useForManualRefresh: true,
      },
    })
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        success: true,
        data: { ok: true },
        message: "temp",
      },
    })

    let normalFetchCount = 0
    server.use(
      http.get(API_URL, () => {
        normalFetchCount += 1
        return HttpResponse.json({
          success: true,
          data: { ok: false },
          message: "normal",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
            cookieStoreId: "firefox-container-2",
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry).not.toHaveBeenCalled()
    expect(normalFetchCount).toBe(0)
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.TempWindowFetch,
        originUrl: BASE_URL,
        fetchUrl: API_URL,
        cookieStoreId: "firefox-container-2",
      }),
    )
  })

  it("fetchApiData honors current-tab transport opt-out", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "direct",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "token",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
        },
        {
          endpoint: ENDPOINT,
          currentTabTransport: "disabled",
        },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry).not.toHaveBeenCalled()
  })

  it("fetchApi skips current-tab content fetch for binary response types", async () => {
    server.use(
      http.get("https://example.com/base/api/buffer", () => {
        return new HttpResponse(Uint8Array.from([9, 8, 7]), {
          headers: { "Content-Type": "application/octet-stream" },
        })
      }),
    )

    const result = await fetchApi<ArrayBuffer>(
      {
        baseUrl: BASE_URL,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "token",
        },
        fetchContext: {
          kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
          tabId: 456,
          origin: "https://example.com",
        },
      },
      { endpoint: "/api/buffer", responseType: "arrayBuffer" },
      true,
    )

    expect(Array.from(new Uint8Array(result))).toEqual([9, 8, 7])
    expect(mockSendTabMessageWithRetry).not.toHaveBeenCalled()
  })

  it("fetchApi returns full JSON envelopes from current-tab content fetch when unwrapping is disabled", async () => {
    const apiEnvelope = {
      success: true,
      data: { nested: "value" },
      message: "content-envelope",
    }
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      success: true,
      data: apiEnvelope,
    })

    const result = await fetchApi<{ nested: string }>(
      {
        baseUrl: BASE_URL,
        auth: { authType: AuthTypeEnum.Cookie, cookie: "session=abc123" },
        fetchContext: {
          kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
          tabId: 456,
          origin: "https://example.com",
        },
      },
      { endpoint: ENDPOINT },
    )

    expect(result).toEqual(apiEnvelope)
    expect(mockSendTabMessageWithRetry).toHaveBeenCalledTimes(1)
  })

  it("fetchApi returns text responses from current-tab content fetch", async () => {
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      success: true,
      data: "content text",
    })

    await expect(
      fetchApi<string>(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie, cookie: "session=abc123" },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
        },
        { endpoint: ENDPOINT, responseType: "text" },
        true,
      ),
    ).resolves.toBe("content text")

    expect(mockSendTabMessageWithRetry).toHaveBeenCalledWith(
      456,
      expect.objectContaining({
        responseType: "text",
      }),
    )
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

  it("fetchApi returns raw non-JSON responses when unwrapping is disabled", async () => {
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
      ),
    ).resolves.toBe("hello world")
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
      message: "messages:errors.api.onlyJsonSupported",
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

  it("preserves backend JSON error messages for non-2xx responses", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json(
          {
            success: false,
            message: "error: invalid user new-api",
          },
          { status: 400 },
        )
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie },
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "error: invalid user new-api",
      code: ApiErrorCodes.HTTP_OTHER,
    })
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

  it("wraps successful JSON parse failures in ApiError", async () => {
    server.use(
      http.get(API_URL, () => {
        return new HttpResponse("{", {
          headers: { "Content-Type": "application/json" },
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
      endpoint: ENDPOINT,
      code: ApiErrorCodes.JSON_PARSE_ERROR,
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

  it("fetchApiData rejects successful JSON envelopes without data", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({
          success: true,
          message: "ok",
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
    ).rejects.toMatchObject({
      endpoint: ENDPOINT,
      message: "messages:errors.api.invalidResponseFormat",
    })
  })

  it("fetchApiData should not invoke temp-window fallback for known backend API 403 errors", async () => {
    const modelsEndpoint = "/v1/models"
    const modelsUrl = "https://example.com/base/v1/models"

    server.use(
      http.get(modelsUrl, () => {
        return HttpResponse.json(
          {
            error: {
              code: "",
              message: "Access denied for test group",
              type: "new_api_error",
            },
          },
          { status: 403 },
        )
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: modelsEndpoint },
      ),
    ).rejects.toMatchObject({
      endpoint: modelsEndpoint,
      statusCode: 403,
      code: ApiErrorCodes.BUSINESS_ERROR,
      message: "Access denied for test group",
    })

    expect(mockSendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("fetchApiData should surface VoAPI v2 403 business error messages", async () => {
    const modelsEndpoint = "/v1/models"
    const modelsUrl = "https://example.com/base/v1/models"

    server.use(
      http.get(modelsUrl, () => {
        return HttpResponse.json(
          {
            code: 2,
            data: null,
            msg: "api key expire",
          },
          { status: 403 },
        )
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: modelsEndpoint },
      ),
    ).rejects.toMatchObject({
      endpoint: modelsEndpoint,
      statusCode: 403,
      code: ApiErrorCodes.BUSINESS_ERROR,
      message: "api key expire",
    })

    expect(mockSendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("fetchApiData should keep unknown structured 403 errors eligible for temp-window fallback", async () => {
    mockTempWindowFallbackDisabledPreference()
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json(
          {
            error: {
              code: "gateway_denied",
              message: "Gateway denied the request",
              type: "gateway_error",
            },
          },
          { status: 403 },
        )
      }),
    )

    await expectTempWindowDisabledFallback()
  })

  it("fetchApiData should keep primitive JSON 403 errors eligible for temp-window fallback", async () => {
    mockTempWindowFallbackDisabledPreference()
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json("gateway denied", { status: 403 })
      }),
    )

    await expectTempWindowDisabledFallback()
  })

  it("fetchApiData should keep structured 403 errors without messages eligible for temp-window fallback", async () => {
    mockTempWindowFallbackDisabledPreference()
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json(
          {
            error: {
              code: "gateway_denied",
              type: "gateway_error",
            },
          },
          { status: 403 },
        )
      }),
    )

    await expectTempWindowDisabledFallback()
  })

  it("fetchApiData should tag eligible errors when temp-window fallback is disabled", async () => {
    mockGetPreferences.mockResolvedValueOnce({
      tempWindowFallback: {
        enabled: false,
        useInPopup: true,
        useInSidePanel: true,
        useInOptions: true,
        useForAutoRefresh: true,
        useForManualRefresh: true,
      },
    })
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

  it("allows callers with their own limiter to bypass the generic site API limiter", async () => {
    server.use(
      http.get("https://example.com/base/api/test", () => {
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
        bypassSiteRequestLimit: true,
      },
      { endpoint: ENDPOINT },
    )

    expect(mockWithSiteApiRequestLimit).not.toHaveBeenCalled()
  })

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
    ).toThrowError(
      expect.objectContaining({ code: ApiErrorCodes.JSON_PARSE_ERROR }),
    )

    let businessError: unknown
    try {
      extractDataFromApiResponseBody(
        { success: false, data: null, message: "" },
        "/api/invalid",
      )
    } catch (error) {
      businessError = error
    }
    expect(businessError).toMatchObject({
      code: ApiErrorCodes.BUSINESS_ERROR,
    })
  })
})
