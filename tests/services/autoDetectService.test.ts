import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_DETECT_ERROR_CODES } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiService/common/type"
import { autoDetectSmart } from "~/services/siteDetection/autoDetectService"

const {
  mockFetchUserInfo,
  mockGetActiveOrAllTabs,
  mockGetActiveTabs,
  mockGetAccountSiteType,
  mockIsMessageReceiverUnavailableError,
  mockSendRuntimeMessage,
} = vi.hoisted(() => ({
  mockFetchUserInfo: vi.fn(),
  mockGetActiveOrAllTabs: vi.fn(),
  mockGetActiveTabs: vi.fn(),
  mockGetAccountSiteType: vi.fn(),
  mockIsMessageReceiverUnavailableError: vi.fn(),
  mockSendRuntimeMessage: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(() => ({
    fetchUserInfo: mockFetchUserInfo,
  })),
}))

vi.mock("~/services/siteDetection/detectSiteType", () => ({
  getAccountSiteType: mockGetAccountSiteType,
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    getActiveOrAllTabs: mockGetActiveOrAllTabs,
    getActiveTabs: mockGetActiveTabs,
    isMessageReceiverUnavailableError: mockIsMessageReceiverUnavailableError,
    sendRuntimeMessage: mockSendRuntimeMessage,
  }
})

describe("autoDetectSmart", () => {
  const browserAny = globalThis.browser as any
  const originalRuntime = browserAny.runtime
  const originalTabs = browserAny.tabs

  beforeEach(() => {
    vi.clearAllMocks()

    browserAny.runtime = originalRuntime ?? {}
    browserAny.tabs = {
      ...(typeof originalTabs === "object" && originalTabs ? originalTabs : {}),
      sendMessage: vi.fn(),
    }

    mockGetAccountSiteType.mockResolvedValue(SITE_TYPES.NEW_API)
    mockGetActiveOrAllTabs.mockResolvedValue([])
    mockGetActiveTabs.mockResolvedValue([])
    mockIsMessageReceiverUnavailableError.mockReturnValue(false)
    mockSendRuntimeMessage.mockResolvedValue(null)
    mockFetchUserInfo.mockResolvedValue({
      id: 1,
      username: "tester",
    })
  })

  afterEach(() => {
    browserAny.runtime = originalRuntime
    browserAny.tabs = originalTabs
  })

  it("uses the active tab content-script flow when the current tab matches the target origin", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 1,
        active: true,
        url: "https://example.com/dashboard",
      },
    ])
    mockGetActiveTabs.mockResolvedValue([{ id: 1 }])
    browserAny.tabs.sendMessage.mockResolvedValue({
      success: true,
      data: {
        userId: 12,
        user: { id: 12, username: "alice" },
        accessToken: "current-tab-token",
        siteTypeHint: SITE_TYPES.VELOERA,
      },
    })

    const result = await autoDetectSmart("https://example.com/api/user/self")

    expect(result).toEqual({
      success: true,
      data: {
        userId: 12,
        user: { id: 12, username: "alice" },
        siteType: SITE_TYPES.VELOERA,
        accessToken: "current-tab-token",
        sub2apiAuth: undefined,
        fetchContext: {
          kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
          tabId: 1,
          origin: "https://example.com",
        },
      },
    })
    expect(mockSendRuntimeMessage).not.toHaveBeenCalled()
    expect(mockFetchUserInfo).not.toHaveBeenCalled()
  })

  it("returns a current-tab fetch context when current-tab detection succeeds", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 101,
        active: true,
        url: "https://example.com/dashboard",
        incognito: true,
        cookieStoreId: "1-incognito",
      },
    ])
    browserAny.tabs.sendMessage.mockResolvedValue({
      success: true,
      data: {
        userId: 12,
        user: { id: 12, username: "alice" },
      },
    })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result).toEqual({
      success: true,
      data: {
        userId: 12,
        user: { id: 12, username: "alice" },
        siteType: SITE_TYPES.NEW_API,
        accessToken: undefined,
        sub2apiAuth: undefined,
        fetchContext: {
          kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
          tabId: 101,
          origin: "https://example.com",
          incognito: true,
          cookieStoreId: "1-incognito",
        },
      },
    })
    expect(browserAny.tabs.sendMessage).toHaveBeenCalledWith(101, {
      action: expect.any(String),
      url: "https://example.com/console",
    })
    expect(mockGetActiveTabs).not.toHaveBeenCalled()
  })

  it("keeps incognito current-tab context on API fallback when content user data is missing", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 102,
        active: true,
        url: "https://example.com/dashboard",
        incognito: true,
        cookieStoreId: "1-incognito",
      },
    ])
    browserAny.tabs.sendMessage.mockResolvedValue({
      success: false,
      error: "no local storage user",
    })
    mockFetchUserInfo.mockResolvedValue({
      id: 13,
      username: "api-incognito-user",
    })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result).toEqual({
      success: true,
      data: {
        userId: 13,
        user: { id: 13, username: "api-incognito-user" },
        siteType: SITE_TYPES.NEW_API,
        accessToken: undefined,
        sub2apiAuth: undefined,
        fetchContext: {
          kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
          tabId: 102,
          origin: "https://example.com",
          incognito: true,
          cookieStoreId: "1-incognito",
        },
      },
    })
    expect(mockFetchUserInfo).toHaveBeenCalledWith({
      baseUrl: "https://example.com/console",
      auth: {
        authType: expect.any(String),
      },
      fetchContext: {
        kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
        tabId: 102,
        origin: "https://example.com",
        incognito: true,
        cookieStoreId: "1-incognito",
      },
    })
  })

  it("keeps current-tab context when content script fails with a non-receiver error and API fallback succeeds", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 107,
        active: true,
        url: "https://example.com/dashboard",
      },
    ])
    browserAny.tabs.sendMessage.mockRejectedValueOnce(
      new Error("content storage failed"),
    )
    mockIsMessageReceiverUnavailableError.mockReturnValue(false)
    mockFetchUserInfo.mockResolvedValueOnce({
      id: 18,
      username: "api-after-content-error",
    })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      userId: 18,
      user: { id: 18, username: "api-after-content-error" },
      fetchContext: {
        kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
        tabId: 107,
        origin: "https://example.com",
      },
    })
  })

  it("falls back when current-tab error classification throws", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 108,
        active: true,
        url: "https://example.com/dashboard",
      },
    ])
    browserAny.tabs.sendMessage.mockRejectedValueOnce(
      new Error("content storage failed"),
    )
    mockIsMessageReceiverUnavailableError.mockImplementationOnce(() => {
      throw new Error("classifier failed")
    })
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      data: {
        userId: 19,
        user: { id: 19, username: "background-after-classifier-error" },
        siteTypeHint: SITE_TYPES.NEW_API,
      },
    })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      userId: 19,
      user: { id: 19, username: "background-after-classifier-error" },
    })
    expect(mockSendRuntimeMessage).toHaveBeenCalledTimes(1)
  })

  it("falls back when site type resolution fails after current-tab data is found", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 106,
        active: true,
        url: "https://example.com/dashboard",
      },
    ])
    mockGetAccountSiteType
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("site type failed"))
      .mockResolvedValue(SITE_TYPES.NEW_API)
    mockFetchUserInfo.mockResolvedValueOnce({
      id: 17,
      username: "fallback-after-site-type-failure",
    })
    browserAny.tabs.sendMessage.mockResolvedValue({
      success: true,
      data: {
        userId: 16,
        user: { id: 16, username: "content-user" },
      },
    })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result).toEqual({
      success: true,
      data: {
        userId: 17,
        user: {
          id: 17,
          username: "fallback-after-site-type-failure",
        },
        siteType: SITE_TYPES.NEW_API,
        accessToken: undefined,
        sub2apiAuth: undefined,
        fetchContext: {
          kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
          tabId: 106,
          origin: "https://example.com",
        },
      },
    })
    expect(mockFetchUserInfo).toHaveBeenCalledTimes(1)
  })

  it("uses the matched current tab id instead of re-querying active tabs", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 101,
        active: true,
        url: "https://example.com/dashboard",
      },
    ])
    mockGetActiveTabs.mockResolvedValue([
      {
        id: 202,
        active: true,
        url: "https://other.example.com/home",
      },
    ])
    browserAny.tabs.sendMessage.mockResolvedValue({
      success: true,
      data: {
        userId: 12,
        user: { id: 12, username: "alice" },
      },
    })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      userId: 12,
      fetchContext: {
        kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
        tabId: 101,
      },
    })
    expect(browserAny.tabs.sendMessage).toHaveBeenCalledWith(101, {
      action: expect.any(String),
      url: "https://example.com/console",
    })
    expect(browserAny.tabs.sendMessage).not.toHaveBeenCalledWith(
      202,
      expect.anything(),
    )
    expect(mockGetActiveTabs).not.toHaveBeenCalled()
  })

  it("skips current-tab detection from an AIHubMix console tab and uses the API origin background flow", async () => {
    mockGetAccountSiteType.mockResolvedValue(SITE_TYPES.AIHUBMIX)
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 2,
        active: true,
        url: "https://console.aihubmix.com/statistics",
      },
    ])
    mockGetActiveTabs.mockResolvedValue([{ id: 2 }])
    browserAny.tabs.sendMessage.mockResolvedValue({
      success: true,
      data: {
        userId: 99,
        user: { id: 99, username: "wrong-current-tab-user" },
        accessToken: "wrong-current-tab-token",
        siteTypeHint: SITE_TYPES.AIHUBMIX,
      },
    })
    mockSendRuntimeMessage.mockResolvedValue({
      success: true,
      data: {
        userId: 7,
        user: { id: 7, username: "aihubmix-user" },
        accessToken: "console-session-token",
        siteTypeHint: SITE_TYPES.AIHUBMIX,
      },
    })

    const result = await autoDetectSmart("https://aihubmix.com")

    expect(result).toEqual({
      success: true,
      data: {
        userId: 7,
        user: { id: 7, username: "aihubmix-user" },
        siteType: SITE_TYPES.AIHUBMIX,
        accessToken: "console-session-token",
        sub2apiAuth: undefined,
      },
    })
    expect(result.data).not.toHaveProperty("fetchContext")
    expect(browserAny.tabs.sendMessage).not.toHaveBeenCalled()
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: expect.any(String),
      requestId: expect.any(String),
      url: "https://aihubmix.com",
    })
    expect(mockFetchUserInfo).not.toHaveBeenCalled()
  })

  it("uses current-tab detection for AIHubMix when the active tab is the API origin", async () => {
    mockGetAccountSiteType.mockResolvedValue(SITE_TYPES.AIHUBMIX)
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 2,
        active: true,
        url: "https://aihubmix.com/statistics",
      },
    ])
    mockGetActiveTabs.mockResolvedValue([{ id: 2 }])
    browserAny.tabs.sendMessage.mockResolvedValue({
      success: true,
      data: {
        userId: 7,
        user: { id: 7, username: "aihubmix-user" },
        accessToken: "main-origin-session-token",
        siteTypeHint: SITE_TYPES.AIHUBMIX,
      },
    })

    const result = await autoDetectSmart("https://console.aihubmix.com")

    expect(result).toEqual({
      success: true,
      data: {
        userId: 7,
        user: { id: 7, username: "aihubmix-user" },
        siteType: SITE_TYPES.AIHUBMIX,
        accessToken: "main-origin-session-token",
        sub2apiAuth: undefined,
        fetchContext: {
          kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
          tabId: 2,
          origin: "https://aihubmix.com",
        },
      },
    })
    expect(browserAny.tabs.sendMessage).toHaveBeenCalledWith(2, {
      action: expect.any(String),
      url: "https://aihubmix.com",
    })
    expect(mockSendRuntimeMessage).not.toHaveBeenCalled()
    expect(mockFetchUserInfo).not.toHaveBeenCalled()
  })

  it("surfaces a current-tab reload hint when the content script is unavailable and direct fallback stays generic", async () => {
    browserAny.runtime = null

    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 1,
        active: true,
        url: "https://example.com/settings",
      },
    ])
    mockGetActiveTabs.mockResolvedValue([{ id: 1 }])
    browserAny.tabs.sendMessage.mockRejectedValue(new Error("no receiver"))
    mockIsMessageReceiverUnavailableError.mockReturnValue(true)
    mockFetchUserInfo.mockResolvedValue(null)

    const result = await autoDetectSmart("https://example.com/api/user/self")

    expect(result).toEqual({
      success: false,
      error: "messages:autodetect.currentTabNeedsReload",
      errorCode: AUTO_DETECT_ERROR_CODES.CURRENT_TAB_CONTENT_SCRIPT_UNAVAILABLE,
    })
  })

  it("falls back to background messaging when the current tab does not match the target origin", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 10,
        active: true,
        url: "https://other.example.com/profile",
      },
    ])
    mockSendRuntimeMessage.mockResolvedValue({
      success: true,
      data: {
        userId: 88,
        user: { id: 88, username: "background-user" },
        accessToken: "background-token",
        siteTypeHint: SITE_TYPES.NEW_API,
      },
    })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result).toEqual({
      success: true,
      data: {
        userId: 88,
        user: { id: 88, username: "background-user" },
        siteType: SITE_TYPES.NEW_API,
        accessToken: "background-token",
        sub2apiAuth: undefined,
      },
    })
    expect(result.data).not.toHaveProperty("fetchContext")
    expect(mockFetchUserInfo).not.toHaveBeenCalled()
  })

  it("uses active incognito tab context for background fallback even when the origin does not match", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 104,
        active: true,
        url: "https://other.example.com/profile",
        incognito: true,
        cookieStoreId: "1-incognito",
      },
    ])
    mockSendRuntimeMessage.mockResolvedValue({
      success: true,
      data: {
        userId: 89,
        user: { id: 89, username: "background-incognito-user" },
        siteTypeHint: SITE_TYPES.NEW_API,
      },
    })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      userId: 89,
      siteType: SITE_TYPES.NEW_API,
      fetchContext: {
        kind: API_SERVICE_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
        incognito: true,
        cookieStoreId: "1-incognito",
      },
    })
    expect(browserAny.tabs.sendMessage).not.toHaveBeenCalled()
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: expect.any(String),
      requestId: expect.any(String),
      url: "https://example.com/console",
      useIncognito: true,
      cookieStoreId: "1-incognito",
    })
  })

  it("asks background auto-detect to use incognito when a matching current tab cannot provide content data", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 103,
        active: true,
        url: "https://example.com/dashboard",
        incognito: true,
        cookieStoreId: "1-incognito",
      },
    ])
    browserAny.tabs.sendMessage.mockResolvedValue({
      success: false,
      error: "no local storage user",
    })
    mockFetchUserInfo.mockResolvedValue(null)
    mockSendRuntimeMessage.mockResolvedValue({
      success: true,
      data: {
        userId: 14,
        user: { id: 14, username: "background-incognito-user" },
        siteTypeHint: SITE_TYPES.NEW_API,
      },
    })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      userId: 14,
      siteType: SITE_TYPES.NEW_API,
      fetchContext: {
        kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
        tabId: 103,
        origin: "https://example.com",
        incognito: true,
        cookieStoreId: "1-incognito",
      },
    })
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: expect.any(String),
      requestId: expect.any(String),
      url: "https://example.com/console",
      useIncognito: true,
      cookieStoreId: "1-incognito",
    })
  })

  it("uses API fallback when background auto-detect cannot return user data", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 20,
        active: true,
        url: "https://different.example.com/home",
      },
    ])
    mockSendRuntimeMessage.mockResolvedValue({
      success: false,
      data: undefined,
    })
    mockFetchUserInfo.mockResolvedValue({
      id: 9,
      username: "api-user",
    })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result).toEqual({
      success: true,
      data: {
        userId: 9,
        user: {
          id: 9,
          username: "api-user",
        },
        siteType: SITE_TYPES.NEW_API,
        accessToken: undefined,
        sub2apiAuth: undefined,
      },
    })
    expect(result.data).not.toHaveProperty("fetchContext")
  })

  it("falls back to direct detection when background auto-detect throws", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 23,
        active: true,
        url: "https://different.example.com/home",
      },
    ])
    mockSendRuntimeMessage.mockRejectedValueOnce(new Error("runtime failed"))
    mockFetchUserInfo.mockResolvedValueOnce({
      id: 23,
      username: "direct-after-runtime-throw",
    })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result).toEqual({
      success: true,
      data: {
        userId: 23,
        user: {
          id: 23,
          username: "direct-after-runtime-throw",
        },
        siteType: SITE_TYPES.NEW_API,
        accessToken: undefined,
        sub2apiAuth: undefined,
      },
    })
    expect(mockFetchUserInfo).toHaveBeenCalledTimes(1)
  })

  it("falls back to direct detection when API fallback after background data miss throws", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 24,
        active: true,
        url: "https://different.example.com/home",
      },
    ])
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: false,
      data: undefined,
    })
    mockFetchUserInfo
      .mockRejectedValueOnce(new Error("context api failed"))
      .mockResolvedValueOnce({
        id: 24,
        username: "direct-after-api-throw",
      })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result).toEqual({
      success: true,
      data: {
        userId: 24,
        user: {
          id: 24,
          username: "direct-after-api-throw",
        },
        siteType: SITE_TYPES.NEW_API,
        accessToken: undefined,
        sub2apiAuth: undefined,
      },
    })
    expect(mockFetchUserInfo).toHaveBeenCalledTimes(2)
  })

  it("keeps active incognito tab context on API fallback after background cannot return user data", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 105,
        active: true,
        url: "https://different.example.com/home",
        incognito: true,
        cookieStoreId: "1-incognito",
      },
    ])
    mockSendRuntimeMessage.mockResolvedValue({
      success: false,
      data: undefined,
    })
    mockFetchUserInfo.mockResolvedValue({
      id: 15,
      username: "api-incognito-context-user",
    })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result).toEqual({
      success: true,
      data: {
        userId: 15,
        user: {
          id: 15,
          username: "api-incognito-context-user",
        },
        siteType: SITE_TYPES.NEW_API,
        accessToken: undefined,
        sub2apiAuth: undefined,
        fetchContext: {
          kind: API_SERVICE_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
          incognito: true,
          cookieStoreId: "1-incognito",
        },
      },
    })
    expect(mockFetchUserInfo).toHaveBeenCalledWith({
      baseUrl: "https://example.com/console",
      auth: {
        authType: expect.any(String),
      },
      fetchContext: {
        kind: API_SERVICE_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
        incognito: true,
        cookieStoreId: "1-incognito",
      },
    })
  })

  it("keeps API fallback access tokens only when the adapter returns a string", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 21,
        active: true,
        url: "https://different.example.com/home",
      },
    ])
    mockSendRuntimeMessage.mockResolvedValue({
      success: false,
      data: undefined,
    })
    mockFetchUserInfo
      .mockResolvedValueOnce({
        id: 10,
        username: "api-user",
        access_token: "api-access-token",
      })
      .mockResolvedValueOnce({
        id: 11,
        username: "api-user-with-object-token",
        access_token: { value: "not-a-string" },
      })

    await expect(
      autoDetectSmart("https://example.com/console"),
    ).resolves.toEqual({
      success: true,
      data: {
        userId: 10,
        user: {
          id: 10,
          username: "api-user",
          access_token: "api-access-token",
        },
        siteType: SITE_TYPES.NEW_API,
        accessToken: "api-access-token",
        sub2apiAuth: undefined,
      },
    })

    await expect(
      autoDetectSmart("https://example.com/console"),
    ).resolves.toEqual({
      success: true,
      data: {
        userId: 11,
        user: {
          id: 11,
          username: "api-user-with-object-token",
          access_token: { value: "not-a-string" },
        },
        siteType: SITE_TYPES.NEW_API,
        accessToken: undefined,
        sub2apiAuth: undefined,
      },
    })
  })

  it("falls back to direct detection when background site-type detection throws", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 30,
        active: true,
        url: "https://different.example.com/home",
      },
    ])
    mockGetAccountSiteType
      .mockRejectedValueOnce(new Error("background detect failed"))
      .mockResolvedValueOnce(SITE_TYPES.NEW_API)
    mockFetchUserInfo.mockResolvedValue({
      id: 21,
      username: "direct-user",
    })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result).toEqual({
      success: true,
      data: {
        userId: 21,
        user: {
          id: 21,
          username: "direct-user",
        },
        siteType: SITE_TYPES.NEW_API,
        accessToken: undefined,
        sub2apiAuth: undefined,
      },
    })
    expect(result.data).not.toHaveProperty("fetchContext")
    expect(mockSendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("falls back to direct detection when background auto-detect returns an unsuccessful result", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 31,
        active: true,
        url: "https://different.example.com/home",
      },
    ])
    mockFetchUserInfo.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 22,
      username: "direct-after-background-failure",
    })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result).toEqual({
      success: true,
      data: {
        userId: 22,
        user: {
          id: 22,
          username: "direct-after-background-failure",
        },
        siteType: SITE_TYPES.NEW_API,
        accessToken: undefined,
        sub2apiAuth: undefined,
      },
    })
    expect(result.data).not.toHaveProperty("fetchContext")
    expect(mockFetchUserInfo).toHaveBeenCalledTimes(2)
  })

  it("falls back to background after current-tab context creation throws", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 32,
        active: true,
        url: "http://[::1",
      },
      {
        id: 33,
        active: false,
        url: "https://different.example.com/home",
      },
    ])
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      data: {
        userId: 32,
        user: { id: 32, username: "background-after-current-tab-throw" },
        siteTypeHint: SITE_TYPES.NEW_API,
      },
    })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      userId: 32,
      user: { id: 32, username: "background-after-current-tab-throw" },
    })
    expect(result.data).not.toHaveProperty("fetchContext")
    expect(browserAny.tabs.sendMessage).not.toHaveBeenCalled()
    expect(mockSendRuntimeMessage).toHaveBeenCalledTimes(1)
  })

  it("returns a current-tab reload hint when content and API fallback both fail", async () => {
    browserAny.runtime = null

    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 33,
        active: true,
        url: "https://example.com/home",
      },
    ])
    browserAny.tabs.sendMessage.mockRejectedValueOnce(new Error("no receiver"))
    mockIsMessageReceiverUnavailableError.mockReturnValue(true)
    mockFetchUserInfo.mockResolvedValue(null)

    const result = await autoDetectSmart("https://example.com/console")

    expect(result).toEqual({
      success: false,
      error: "messages:autodetect.currentTabNeedsReload",
      errorCode: AUTO_DETECT_ERROR_CODES.CURRENT_TAB_CONTENT_SCRIPT_UNAVAILABLE,
    })
  })

  it("falls back to direct detection when browser tab and runtime capabilities are unavailable", async () => {
    browserAny.tabs = null
    browserAny.runtime = null
    mockGetAccountSiteType.mockRejectedValue(new Error("detect failed"))

    const result = await autoDetectSmart("https://example.com")

    expect(result).toEqual({
      success: false,
      error: "detect failed",
    })
  })

  it("keeps an invalid input URL on the direct detection path", async () => {
    browserAny.tabs = null
    browserAny.runtime = null
    mockFetchUserInfo.mockResolvedValue({
      id: 42,
      username: "invalid-url-user",
    })

    const result = await autoDetectSmart("not a url")

    expect(result).toEqual({
      success: true,
      data: {
        userId: 42,
        user: {
          id: 42,
          username: "invalid-url-user",
        },
        siteType: SITE_TYPES.NEW_API,
        accessToken: undefined,
        sub2apiAuth: undefined,
      },
    })
    expect(result.data).not.toHaveProperty("fetchContext")
    expect(mockGetAccountSiteType).toHaveBeenCalledWith("not a url")
    expect(mockFetchUserInfo).toHaveBeenCalledWith({
      baseUrl: "not a url",
      auth: {
        authType: expect.any(String),
      },
    })
  })
})
