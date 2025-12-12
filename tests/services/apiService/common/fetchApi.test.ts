import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "~/services/apiService/common/errors"
import { fetchApiData } from "~/services/apiService/common/utils"
import { AuthTypeEnum, TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types"

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

vi.mock("~/services/userPreferences", () => ({
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

const BASE_URL = "https://example.com/base/"
const ENDPOINT = "/api/test"

const createFetchMock = (response: any) => {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: {
      get: () => "application/json",
    },
    json: async () => response,
  }) as any
}

declare const global: any

describe("apiService common fetchApi helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks()

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
    global.fetch = createFetchMock({ success: true, data, message: "ok" })

    const result = await fetchApiData<{ foo: string }>({
      baseUrl: BASE_URL,
      endpoint: ENDPOINT,
      userId: 123,
      token: "token",
      authType: AuthTypeEnum.AccessToken,
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = (global.fetch as any).mock.calls[0]
    expect(url).toBe("https://example.com/base/api/test")
    expect(options.credentials).toBe("omit")
    expect(options.headers.Authorization).toBe("Bearer token")
    expect(result).toEqual(data)
  })

  it("fetchApiData should throw ApiError when HTTP response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }) as any

    await expect(
      fetchApiData({
        baseUrl: BASE_URL,
        endpoint: ENDPOINT,
        authType: AuthTypeEnum.AccessToken,
      } as any),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it("fetchApiData should throw ApiError when success is false with message", async () => {
    global.fetch = createFetchMock({
      success: false,
      data: null,
      message: "bad request",
    })

    await expect(
      fetchApiData({
        baseUrl: BASE_URL,
        endpoint: ENDPOINT,
        authType: AuthTypeEnum.AccessToken,
      } as any),
    ).rejects.toMatchObject({ message: "bad request" } as any)
  })

  it("fetchApiData should throw ApiError when data is missing", async () => {
    global.fetch = createFetchMock({
      success: true,
      message: "no data",
    })

    await expect(
      fetchApiData({
        baseUrl: BASE_URL,
        endpoint: ENDPOINT,
        authType: AuthTypeEnum.AccessToken,
      } as any),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it("fetchApiData should tag eligible errors when temp-window fallback is disabled", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    }) as any

    await expect(
      fetchApiData({
        baseUrl: BASE_URL,
        endpoint: ENDPOINT,
        authType: AuthTypeEnum.AccessToken,
      } as any),
    ).rejects.toMatchObject({
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      originalCode: "HTTP_403",
    })
  })
})
