import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  readAccountBrowserSessionFromExistingTabs,
  readAccountBrowserSessionFromTab,
  resolveAccountBrowserSession,
} from "~/services/accountBrowserSession"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"

const {
  mockGetAllTabs,
  mockGetBrowserApiCapabilities,
  mockSendRuntimeMessage,
  mockSendTabMessage,
} = vi.hoisted(() => ({
  mockGetAllTabs: vi.fn(),
  mockGetBrowserApiCapabilities: vi.fn(),
  mockSendRuntimeMessage: vi.fn(),
  mockSendTabMessage: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", () => ({
  getAllTabs: mockGetAllTabs,
  getBrowserApiCapabilities: mockGetBrowserApiCapabilities,
  sendRuntimeMessage: mockSendRuntimeMessage,
  sendTabMessageWithRetry: mockSendTabMessage,
}))

describe("account browser-session reader", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetBrowserApiCapabilities.mockReturnValue({
      hasWindows: true,
      hasTabs: true,
      hasBackgroundMessaging: true,
    })
  })

  it("reads and normalizes a successful tab content-session response", async () => {
    mockSendTabMessage.mockResolvedValueOnce({
      success: true,
      data: {
        userId: 42,
        user: { username: " tab-user " },
        accessToken: " jwt-from-tab ",
        siteTypeHint: SITE_TYPES.SUB2API,
        sub2apiAuth: {
          refreshToken: " refresh-token ",
          tokenExpiresAt: 123456,
        },
      },
    })

    const session = await readAccountBrowserSessionFromTab({
      tabId: 12,
      baseUrl: "https://sub2.example.com",
      siteType: SITE_TYPES.SUB2API,
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      fetchContext: {
        kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
        tabId: 12,
        origin: "https://sub2.example.com",
        incognito: true,
        cookieStoreId: "firefox-container-1",
      },
    })

    expect(session).toEqual({
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      siteType: SITE_TYPES.SUB2API,
      userId: "42",
      user: { username: " tab-user " },
      accessToken: "jwt-from-tab",
      siteTypeHint: SITE_TYPES.SUB2API,
      sub2apiAuth: {
        refreshToken: "refresh-token",
        tokenExpiresAt: 123456,
      },
      fetchContext: {
        kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
        tabId: 12,
        origin: "https://sub2.example.com",
        incognito: true,
        cookieStoreId: "firefox-container-1",
      },
    })
    expect(mockSendTabMessage).toHaveBeenCalledWith(12, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: "https://sub2.example.com",
      siteType: SITE_TYPES.SUB2API,
    })
  })

  it("returns null for failed or unusable tab responses", async () => {
    mockSendTabMessage
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true, data: { userId: "   " } })
      .mockRejectedValueOnce(new Error("receiver missing"))

    await expect(
      readAccountBrowserSessionFromTab({
        tabId: 1,
        baseUrl: "https://sub2.example.com",
        siteType: SITE_TYPES.SUB2API,
        source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      }),
    ).resolves.toBeNull()
    await expect(
      readAccountBrowserSessionFromTab({
        tabId: 1,
        baseUrl: "https://sub2.example.com",
        siteType: SITE_TYPES.SUB2API,
        source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      }),
    ).resolves.toBeNull()
    await expect(
      readAccountBrowserSessionFromTab({
        tabId: 1,
        baseUrl: "https://sub2.example.com",
        siteType: SITE_TYPES.SUB2API,
        source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      }),
    ).resolves.toBeNull()
  })

  it("normalizes payload fetch context only when it matches a trusted shape", async () => {
    mockSendTabMessage
      .mockResolvedValueOnce({
        success: true,
        data: {
          userId: "42",
          fetchContext: {
            kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 42,
            origin: " https://sub2.example.com ",
            incognito: true,
            cookieStoreId: " firefox-container-1 ",
          },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          userId: "43",
          siteType: SITE_TYPES.SUB2API,
          fetchContext: {
            kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: "not-a-number",
            origin: "https://sub2.example.com",
          },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          userId: "44",
          fetchContext: {
            kind: API_SERVICE_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
            incognito: true,
            cookieStoreId: " firefox-container-2 ",
          },
        },
      })

    await expect(
      readAccountBrowserSessionFromTab({
        tabId: 42,
        baseUrl: "https://sub2.example.com",
        siteType: SITE_TYPES.SUB2API,
        source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        fetchContext: {
          kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
          tabId: 42,
          origin: "https://sub2.example.com",
          incognito: true,
          cookieStoreId: "firefox-container-1",
        },
      }),
    )

    const sessionWithoutTrustedFetchContext =
      await readAccountBrowserSessionFromTab({
        tabId: 43,
        baseUrl: "https://sub2.example.com",
        siteType: SITE_TYPES.SUB2API,
        source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      })

    expect(sessionWithoutTrustedFetchContext).toEqual(
      expect.objectContaining({
        userId: "43",
        siteTypeHint: SITE_TYPES.SUB2API,
      }),
    )
    expect(sessionWithoutTrustedFetchContext).not.toHaveProperty("fetchContext")

    await expect(
      readAccountBrowserSessionFromTab({
        tabId: 44,
        baseUrl: "https://sub2.example.com",
        siteType: SITE_TYPES.SUB2API,
        source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        fetchContext: {
          kind: API_SERVICE_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
          incognito: true,
          cookieStoreId: "firefox-container-2",
        },
      }),
    )
  })

  it("notifies callers about tab read errors without throwing", async () => {
    const onError = vi.fn()
    const error = new Error("receiver missing")
    mockSendTabMessage.mockRejectedValueOnce(error)

    await expect(
      readAccountBrowserSessionFromTab({
        tabId: 1,
        baseUrl: "https://sub2.example.com",
        siteType: SITE_TYPES.SUB2API,
        source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
        onError,
      }),
    ).resolves.toBeNull()

    expect(onError).toHaveBeenCalledWith(error, {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
    })
  })

  it("filters same-origin tabs, tries the active tab first, and honors the usability predicate", async () => {
    mockGetAllTabs.mockResolvedValueOnce([
      { id: 1, url: "https://other.example.com/dashboard", active: true },
      { id: 2, url: "https://sub2.example.com/settings", active: false },
      { id: 3, url: "https://sub2.example.com/console", active: true },
    ])
    mockSendTabMessage
      .mockResolvedValueOnce({
        success: true,
        data: {
          userId: "1",
          user: { username: "without-refresh" },
          accessToken: "token-1",
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          userId: "2",
          user: { username: "with-refresh" },
          accessToken: "token-2",
          sub2apiAuth: { refreshToken: "refresh-2" },
        },
      })

    const session = await readAccountBrowserSessionFromExistingTabs({
      baseUrl: "https://sub2.example.com",
      siteType: SITE_TYPES.SUB2API,
      isUsableSession: (candidate) =>
        Boolean(candidate.sub2apiAuth?.refreshToken),
    })

    expect(session?.userId).toBe("2")
    expect(session?.source).toBe(ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB)
    expect(mockSendTabMessage).toHaveBeenNthCalledWith(1, 3, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: "https://sub2.example.com",
      siteType: SITE_TYPES.SUB2API,
    })
    expect(mockSendTabMessage).toHaveBeenNthCalledWith(2, 2, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: "https://sub2.example.com",
      siteType: SITE_TYPES.SUB2API,
    })
  })

  it("filters existing tabs by browser context before probing local storage", async () => {
    mockGetAllTabs.mockResolvedValueOnce([
      {
        id: 1,
        url: "https://sub2.example.com/dashboard",
        active: true,
        incognito: false,
      },
      {
        id: 2,
        url: "https://sub2.example.com/settings",
        active: false,
        incognito: true,
        cookieStoreId: "firefox-container-2",
      },
      {
        id: 3,
        url: "https://sub2.example.com/console",
        active: false,
        incognito: true,
        cookieStoreId: "firefox-container-1",
      },
    ])
    mockSendTabMessage.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "3",
        user: { username: "container-user" },
        accessToken: "container-token",
      },
    })

    const session = await readAccountBrowserSessionFromExistingTabs({
      baseUrl: "https://sub2.example.com",
      siteType: SITE_TYPES.SUB2API,
      browserContext: {
        incognito: true,
        cookieStoreId: "firefox-container-1",
      },
    })

    expect(session).toEqual(
      expect.objectContaining({
        userId: "3",
        fetchContext: {
          kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
          tabId: 3,
          origin: "https://sub2.example.com",
          incognito: true,
          cookieStoreId: "firefox-container-1",
        },
      }),
    )
    expect(mockSendTabMessage).toHaveBeenCalledTimes(1)
    expect(mockSendTabMessage).toHaveBeenCalledWith(3, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: "https://sub2.example.com",
      siteType: SITE_TYPES.SUB2API,
    })
  })

  it("falls back to temp-window auto-detect when existing tabs are unusable", async () => {
    mockGetAllTabs.mockResolvedValueOnce([
      { id: 10, url: "https://sub2.example.com/dashboard", active: true },
    ])
    mockSendTabMessage.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "10",
        user: { username: "tab-user" },
        accessToken: "tab-token",
      },
    })
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "11",
        user: { username: "temp-user" },
        accessToken: "temp-token",
        sub2apiAuth: { refreshToken: "temp-refresh" },
      },
    })

    const session = await resolveAccountBrowserSession({
      baseUrl: "https://sub2.example.com",
      siteType: SITE_TYPES.SUB2API,
      useExistingTabs: true,
      useTempWindow: true,
      requestIdPrefix: "test-session",
      isUsableSession: (candidate) =>
        Boolean(candidate.sub2apiAuth?.refreshToken),
    })

    expect(session).toEqual(
      expect.objectContaining({
        source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
        userId: "11",
        accessToken: "temp-token",
        sub2apiAuth: { refreshToken: "temp-refresh" },
      }),
    )
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoDetectSite,
        url: "https://sub2.example.com",
        requestId: expect.stringMatching(/^test-session-/),
      }),
    )
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.not.objectContaining({
        tempWindowRequestSource: expect.anything(),
      }),
    )
  })

  it("passes popup temp-window source and the explicit minimize override without persisting either", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "11",
        user: { username: "temp-user" },
        accessToken: "temp-token",
      },
    })

    const session = await resolveAccountBrowserSession({
      baseUrl: "https://example.invalid",
      siteType: SITE_TYPES.SUB2API,
      useTempWindow: true,
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      suppressMinimize: false,
    })

    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoDetectSite,
        url: "https://example.invalid",
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        suppressMinimize: false,
      }),
    )
    expect(session).not.toHaveProperty("tempWindowRequestSource")
    expect(session).not.toHaveProperty("suppressMinimize")
  })

  it("notifies callers about temp-window read errors without throwing", async () => {
    const error = new Error("private backend error")
    const onError = vi.fn()

    mockGetAllTabs.mockResolvedValueOnce([])
    mockSendRuntimeMessage.mockRejectedValueOnce(error)

    await expect(
      resolveAccountBrowserSession({
        baseUrl: "https://sub2.example.com",
        siteType: SITE_TYPES.SUB2API,
        useExistingTabs: true,
        useTempWindow: true,
        onError,
      }),
    ).resolves.toBeNull()

    expect(onError).toHaveBeenCalledWith(error, {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
    })
  })

  it("returns null when temp-window auto-detect responds without session data", async () => {
    mockGetAllTabs.mockResolvedValueOnce([])
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: false,
    })

    await expect(
      resolveAccountBrowserSession({
        baseUrl: "https://sub2.example.com",
        siteType: SITE_TYPES.SUB2API,
        useExistingTabs: true,
        useTempWindow: true,
      }),
    ).resolves.toBeNull()

    expect(mockSendRuntimeMessage).toHaveBeenCalledTimes(1)
  })

  it("passes current-tab browser context without container metadata to fallbacks", async () => {
    mockSendTabMessage.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "9",
        user: { username: "current-user" },
        accessToken: "current-token",
      },
    })
    mockGetAllTabs.mockResolvedValueOnce([])
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "11",
        user: { username: "temp-user" },
        accessToken: "temp-token",
      },
    })

    const session = await resolveAccountBrowserSession({
      baseUrl: "https://sub2.example.com",
      siteType: SITE_TYPES.SUB2API,
      currentTab: {
        tabId: 9,
        incognito: true,
      },
      useExistingTabs: true,
      useTempWindow: true,
      isUsableSession: (candidate) =>
        candidate.source === ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
    })

    expect(session?.source).toBe(ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW)
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoDetectSite,
        url: "https://sub2.example.com",
        useIncognito: true,
      }),
    )
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.not.objectContaining({
        cookieStoreId: expect.any(String),
      }),
    )
  })

  it("omits current-tab fetch context when the base URL has no parseable origin", async () => {
    mockSendTabMessage.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "12",
        user: { username: "tab-user" },
      },
    })

    const session = await resolveAccountBrowserSession({
      baseUrl: "not a url",
      siteType: SITE_TYPES.SUB2API,
      currentTab: {
        tabId: 12,
        incognito: true,
        cookieStoreId: "firefox-container-1",
      },
    })

    expect(session).toEqual(
      expect.objectContaining({
        source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
        userId: "12",
      }),
    )
    expect(session?.fetchContext).toBeUndefined()
  })

  it("passes incognito but not cookie-store metadata to AutoDetectSite temp-window fallback", async () => {
    mockGetAllTabs.mockResolvedValueOnce([])
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "11",
        user: { username: "temp-user" },
        accessToken: "temp-token",
      },
    })

    const session = await resolveAccountBrowserSession({
      baseUrl: "https://sub2.example.com",
      siteType: SITE_TYPES.SUB2API,
      currentTab: {
        tabId: 9,
        incognito: true,
        cookieStoreId: "firefox-container-1",
      },
      useExistingTabs: true,
      useTempWindow: true,
      requestIdPrefix: "container-check",
      isUsableSession: (candidate) =>
        candidate.source === ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW &&
        Boolean(candidate.accessToken),
    })

    expect(session?.source).toBe(ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW)
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoDetectSite,
        url: "https://sub2.example.com",
        useIncognito: true,
      }),
    )
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.not.objectContaining({
        cookieStoreId: expect.any(String),
      }),
    )
  })
})
