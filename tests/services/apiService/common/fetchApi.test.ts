import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AuthTypeEnum, TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types"

let fetchApiData: typeof import("~/services/apiService/common/utils").fetchApiData
let ApiError: typeof import("~/services/apiService/common/errors").ApiError

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
  beforeEach(async () => {
    // Ensure we always use the real implementations even if other tests mock these modules.
    const utils = await vi.importActual<
      typeof import("~/services/apiService/common/utils")
    >("~/services/apiService/common/utils")
    fetchApiData = utils.fetchApiData

    const errors = await vi.importActual<
      typeof import("~/services/apiService/common/errors")
    >("~/services/apiService/common/errors")
    ApiError = errors.ApiError
  })

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
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it("fetchApiData should throw ApiError when success is false with message", async () => {
    global.fetch = createFetchMock({
      success: false,
      data: null,
      message: "bad request",
    })

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
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    }) as any

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
})
