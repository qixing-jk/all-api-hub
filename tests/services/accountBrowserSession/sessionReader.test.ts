import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  readAccountBrowserSessionFromExistingTabs,
  readAccountBrowserSessionFromTab,
  resolveAccountBrowserSession as resolveAccountBrowserSessionProduction,
} from "~/services/accountBrowserSession"
import { NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND } from "~/services/accountSiteOnboarding/contracts"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import { PROTECTION_BYPASS_EXECUTION_VERSION } from "~/services/protectionBypass/contracts"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"

const {
  mockExecuteProtectionBypassTask,
  mockGetAllTabs,
  mockGetBrowserApiCapabilities,
  mockIsExtensionBackground,
  mockSendRuntimeMessage,
  mockSendTabMessage,
} = vi.hoisted(() => ({
  mockExecuteProtectionBypassTask: vi.fn(),
  mockGetAllTabs: vi.fn(),
  mockGetBrowserApiCapabilities: vi.fn(),
  mockIsExtensionBackground: vi.fn(),
  mockSendRuntimeMessage: vi.fn(),
  mockSendTabMessage: vi.fn(),
}))

vi.mock("~/utils/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser")>()
  return {
    ...actual,
    isExtensionBackground: mockIsExtensionBackground,
  }
})

vi.mock("~/utils/browser/browserApi", () => ({
  getAllTabs: mockGetAllTabs,
  getBrowserApiCapabilities: mockGetBrowserApiCapabilities,
  sendRuntimeMessage: mockSendRuntimeMessage,
  sendTabMessageWithRetry: mockSendTabMessage,
}))

vi.mock("~/utils/browser/tempWindowFetch", () => ({
  executeProtectionBypassTask: async (request: unknown) => {
    if (!mockIsExtensionBackground()) {
      return mockSendRuntimeMessage({
        action: RuntimeActionIds.ProtectionBypassExecuteTask,
        ...(request as object),
      })
    }

    let response: unknown
    let responded = false
    await mockExecuteProtectionBypassTask(
      request,
      undefined,
      (value: unknown) => {
        if (!responded) response = value
        responded = true
      },
    )
    if (!responded) throw new Error("handler completed without response")
    return response
  },
}))

const testExecution = {
  version: PROTECTION_BYPASS_EXECUTION_VERSION,
  kind: "user_command",
  command: "manage_api_keys",
  surface: "options",
} as const

function resolveAccountBrowserSession(
  options: Parameters<typeof resolveAccountBrowserSessionProduction>[0],
) {
  return resolveAccountBrowserSessionProduction({
    ...options,
    protectionBypassExecution:
      options.protectionBypassExecution ?? testExecution,
  })
}

describe("account browser-session reader", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsExtensionBackground.mockReturnValue(false)
    mockGetBrowserApiCapabilities.mockReturnValue({
      hasWindows: true,
      hasTabs: true,
      hasBackgroundMessaging: true,
    })
  })

  it.each(["MV3 service worker", "Firefox MV2 background page"])(
    "routes a temp session read directly through the coordinator in a %s",
    async () => {
      mockIsExtensionBackground.mockReturnValue(true)
      mockExecuteProtectionBypassTask.mockImplementationOnce(
        async (_request, sender, sendResponse) => {
          expect(sender).toBeUndefined()
          sendResponse({
            success: true,
            data: {
              siteType: SITE_TYPES.SUB2API,
              userId: "11",
              user: { username: "background-user" },
            },
          })
        },
      )

      const session = await resolveAccountBrowserSession({
        baseUrl: "https://unknown.example.invalid",
        siteType: SITE_TYPES.SUB2API,
        useTempWindow: true,
      })

      expect(session).toEqual(
        expect.objectContaining({
          source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
          siteType: SITE_TYPES.SUB2API,
          userId: "11",
        }),
      )
      expect(mockExecuteProtectionBypassTask).toHaveBeenCalledWith(
        expect.objectContaining({
          task: {
            kind: "session_read",
            params: expect.objectContaining({
              url: "https://unknown.example.invalid",
              siteType: SITE_TYPES.SUB2API,
            }),
          },
        }),
        undefined,
        expect.any(Function),
      )
      expect(mockSendRuntimeMessage).not.toHaveBeenCalled()
    },
  )

  it("uses runtime messaging for a non-background temp session read", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      data: {
        siteType: SITE_TYPES.SUB2API,
        userId: "12",
        user: { username: "popup-user" },
      },
    })

    await resolveAccountBrowserSession({
      baseUrl: "https://unknown.example.invalid",
      siteType: SITE_TYPES.SUB2API,
      useTempWindow: true,
    })

    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.ProtectionBypassExecuteTask,
        task: {
          kind: "session_read",
          params: expect.objectContaining({ siteType: SITE_TYPES.SUB2API }),
        },
      }),
    )
    expect(mockExecuteProtectionBypassTask).not.toHaveBeenCalled()
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

  it("normalizes a valid transient dashboard auth payload", async () => {
    mockSendTabMessage.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "user-42",
        user: { username: "example-user" },
        transientAuth: {
          kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
          token: " placeholder-token ",
          expiresAt: 2_000_000_000,
          sessionId: " placeholder-session ",
          origin: " HTTPS://DASHBOARD.EXAMPLE.INVALID:443/ ",
          untrusted: "drop-me",
        },
      },
    })

    const session = await readAccountBrowserSessionFromTab({
      tabId: 13,
      baseUrl: "https://dashboard.example.invalid/account",
      siteType: SITE_TYPES.NEW_API,
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
    })

    expect(session).toEqual({
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      siteType: SITE_TYPES.NEW_API,
      userId: "user-42",
      user: { username: "example-user" },
      transientAuth: {
        kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
        token: "placeholder-token",
        expiresAt: 2_000_000_000,
        sessionId: "placeholder-session",
        origin: "https://dashboard.example.invalid",
      },
    })
  })

  it.each([
    ["an unknown kind", { kind: "unknown_kind" }],
    ["a blank token", { token: "   " }],
    ["a blank session id", { sessionId: "   " }],
    ["a malformed origin", { origin: "not a valid URL" }],
    ["a mismatched origin", { origin: "https://other.example.invalid" }],
    ["a non-finite expiry", { expiresAt: Number.POSITIVE_INFINITY }],
  ])(
    "drops transient dashboard auth with %s while preserving identity",
    async (_label, override) => {
      mockSendTabMessage.mockResolvedValueOnce({
        success: true,
        data: {
          userId: "user-42",
          user: { username: "example-user" },
          transientAuth: {
            kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
            token: "placeholder-token",
            expiresAt: 2_000_000_000,
            sessionId: "placeholder-session",
            origin: "https://dashboard.example.invalid",
            ...override,
          },
        },
      })

      const session = await readAccountBrowserSessionFromTab({
        tabId: 14,
        baseUrl: "https://dashboard.example.invalid",
        siteType: SITE_TYPES.NEW_API,
        source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      })

      expect(session).toEqual(
        expect.objectContaining({
          userId: "user-42",
          user: { username: "example-user" },
        }),
      )
      expect(session).not.toHaveProperty("transientAuth")
    },
  )

  it("drops transient dashboard auth for non-New API sites while preserving identity", async () => {
    mockSendTabMessage.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "user-42",
        transientAuth: {
          kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
          token: "placeholder-token",
          expiresAt: 2_000_000_000,
          sessionId: "placeholder-session",
          origin: "https://dashboard.example.invalid",
        },
      },
    })

    const session = await readAccountBrowserSessionFromTab({
      tabId: 15,
      baseUrl: "https://dashboard.example.invalid/account",
      siteType: SITE_TYPES.VELOERA,
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
    })

    expect(session).toEqual(
      expect.objectContaining({
        userId: "user-42",
        siteType: SITE_TYPES.VELOERA,
      }),
    )
    expect(session).not.toHaveProperty("transientAuth")
  })

  it.each(["kind", "token", "expiresAt", "sessionId", "origin"])(
    "drops transient dashboard auth when %s is inherited",
    async (inheritedField) => {
      const fields: Record<string, unknown> = {
        kind: NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
        token: "placeholder-token",
        expiresAt: 2_000_000_000,
        sessionId: "placeholder-session",
        origin: "https://dashboard.example.invalid",
      }
      const transientAuth = Object.assign(
        Object.create({ [inheritedField]: fields[inheritedField] }),
        Object.fromEntries(
          Object.entries(fields).filter(([field]) => field !== inheritedField),
        ),
      )
      mockSendTabMessage.mockResolvedValueOnce({
        success: true,
        data: {
          userId: "user-42",
          transientAuth,
        },
      })

      const session = await readAccountBrowserSessionFromTab({
        tabId: 16,
        baseUrl: "https://dashboard.example.invalid/account",
        siteType: SITE_TYPES.NEW_API,
        source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      })

      expect(session).toEqual(expect.objectContaining({ userId: "user-42" }))
      expect(session).not.toHaveProperty("transientAuth")
    },
  )

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
        action: RuntimeActionIds.ProtectionBypassExecuteTask,
        task: {
          kind: "session_read",
          params: expect.objectContaining({
            url: "https://sub2.example.com",
            requestId: expect.stringMatching(/^test-session-/),
          }),
        },
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
        action: RuntimeActionIds.ProtectionBypassExecuteTask,
        task: {
          kind: "session_read",
          params: expect.objectContaining({
            url: "https://example.invalid",
            suppressMinimize: false,
          }),
        },
      }),
    )
    expect(session).not.toHaveProperty("tempWindowRequestSource")
    expect(session).not.toHaveProperty("suppressMinimize")
  })

  it("preserves protection bypass execution through the AutoDetectSite session read", async () => {
    const protectionBypassExecution = {
      version: PROTECTION_BYPASS_EXECUTION_VERSION,
      kind: "user_command",
      command: "manage_api_keys",
      surface: "options",
    } as const
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "11",
        user: { username: "temp-user" },
        accessToken: "temp-token",
      },
    })

    await resolveAccountBrowserSession({
      baseUrl: "https://example.invalid",
      siteType: SITE_TYPES.SUB2API,
      useTempWindow: true,
      protectionBypassExecution,
    })

    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.ProtectionBypassExecuteTask,
        execution: protectionBypassExecution,
        task: {
          kind: "session_read",
          params: expect.not.objectContaining({ protectionBypassExecution }),
        },
      }),
    )
    expect(mockSendRuntimeMessage).toHaveBeenCalledTimes(1)
    const envelope = mockSendRuntimeMessage.mock.calls[0]?.[0]
    expect(envelope).toBeDefined()
    expect(envelope).not.toHaveProperty("protectionBypassExecution")
    expect(envelope).not.toHaveProperty("tempWindowRequestSource")
    expect(envelope?.task).not.toHaveProperty("execution")
    expect(envelope?.task?.params).not.toHaveProperty(
      "protectionBypassExecution",
    )
    expect(envelope?.task?.params).not.toHaveProperty("tempWindowRequestSource")
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
        action: RuntimeActionIds.ProtectionBypassExecuteTask,
        task: {
          kind: "session_read",
          params: expect.objectContaining({
            url: "https://sub2.example.com",
            useIncognito: true,
          }),
        },
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
        action: RuntimeActionIds.ProtectionBypassExecuteTask,
        task: {
          kind: "session_read",
          params: expect.objectContaining({
            url: "https://sub2.example.com",
            useIncognito: true,
          }),
        },
      }),
    )
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.not.objectContaining({
        cookieStoreId: expect.any(String),
      }),
    )
  })
})
