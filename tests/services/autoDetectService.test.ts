import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_DETECT_ERROR_CODES } from "~/constants/autoDetect"
import { autoDetectSmart } from "~/services/siteDetection/autoDetectService"

const {
  mockFetchUserInfo,
  mockGetActiveOrAllTabs,
  mockGetActiveTabs,
  mockGetSiteType,
  mockIsMessageReceiverUnavailableError,
  mockSendRuntimeMessage,
} = vi.hoisted(() => ({
  mockFetchUserInfo: vi.fn(),
  mockGetActiveOrAllTabs: vi.fn(),
  mockGetActiveTabs: vi.fn(),
  mockGetSiteType: vi.fn(),
  mockIsMessageReceiverUnavailableError: vi.fn(),
  mockSendRuntimeMessage: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(() => ({
    fetchUserInfo: mockFetchUserInfo,
  })),
}))

vi.mock("~/services/siteDetection/detectSiteType", () => ({
  getSiteType: mockGetSiteType,
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

    mockGetSiteType.mockResolvedValue("new-api")
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
        siteTypeHint: "veloera",
      },
    })

    const result = await autoDetectSmart("https://example.com/api/user/self")

    expect(result).toEqual({
      success: true,
      data: {
        userId: 12,
        user: { id: 12, username: "alice" },
        siteType: "veloera",
        accessToken: "current-tab-token",
        sub2apiAuth: undefined,
      },
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
        siteTypeHint: "new-api",
      },
    })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result).toEqual({
      success: true,
      data: {
        userId: 88,
        user: { id: 88, username: "background-user" },
        siteType: "new-api",
        accessToken: "background-token",
        sub2apiAuth: undefined,
      },
    })
    expect(mockFetchUserInfo).not.toHaveBeenCalled()
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
        siteType: "new-api",
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
    mockGetSiteType
      .mockRejectedValueOnce(new Error("background detect failed"))
      .mockResolvedValueOnce("new-api")
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
        siteType: "new-api",
        accessToken: undefined,
        sub2apiAuth: undefined,
      },
    })
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
        siteType: "new-api",
        accessToken: undefined,
        sub2apiAuth: undefined,
      },
    })
    expect(mockFetchUserInfo).toHaveBeenCalledTimes(2)
  })

  it("falls back to direct detection when browser tab and runtime capabilities are unavailable", async () => {
    browserAny.tabs = null
    browserAny.runtime = null
    mockGetSiteType.mockRejectedValue(new Error("detect failed"))

    const result = await autoDetectSmart("https://example.com")

    expect(result).toEqual({
      success: false,
      error: "detect failed",
    })
  })
})
