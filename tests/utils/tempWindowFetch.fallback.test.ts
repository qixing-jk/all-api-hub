import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
  TEMP_CONTEXT_TASK_KINDS,
} from "~/services/protectionBypass/contracts"
import { AuthTypeEnum, TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types"
import {
  TEMP_WINDOW_REQUEST_SOURCES,
  type TempWindowFallbackContext,
} from "~/types/tempWindowFetch"
import {
  canUseTempWindowFetch,
  executeWithTempWindowFallback,
  getTempWindowFallbackBlockStatus,
  tempWindowFetch,
  tempWindowGetRenderedTitle,
  tempWindowTriggerCheckinPageAction,
  tempWindowTurnstileFetch,
} from "~/utils/browser/tempWindowFetch"

const mocks = vi.hoisted(() => ({
  sendRuntimeMessageMock: vi.fn(),
  handleTempWindowFetchMock: vi.fn(),
  handleTempWindowCheckinPageActionMock: vi.fn(),
  handleTempWindowTurnstileFetchMock: vi.fn(),
  handleTempWindowGetRenderedTitleMock: vi.fn(),
  hasCookieInterceptorPermissionsMock: vi.fn(),
  getPreferencesMock: vi.fn(),
  isExtensionBackgroundMock: vi.fn(),
  isExtensionOptionsMock: vi.fn(),
  isExtensionPopupMock: vi.fn(),
  isExtensionSidePanelMock: vi.fn(),
  isProtectionBypassFirefoxEnvMock: vi.fn(),
  safeRandomUUIDMock: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  defaultTempWindowFallback: {
    enabled: true,
    useInPopup: true,
    useInSidePanel: true,
    useInOptions: true,
    useForAutoRefresh: true,
    useForManualRefresh: true,
    tempContextMode: "composite" as const,
  },
}))

const testExecution = {
  version: 1,
  kind: "automatic",
  feature: PROTECTION_BYPASS_FEATURES.AccountRefresh,
  trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
  surface: PROTECTION_BYPASS_SURFACES.Background,
} as const

vi.mock("~/utils/browser/browserApi", () => ({
  sendRuntimeMessage: mocks.sendRuntimeMessageMock,
}))

vi.mock("~/entrypoints/background/protectionBypassCoordinator", () => ({
  protectionBypassCoordinator: {
    execute: async ({ task }: { task: { kind: string; params: unknown } }) => {
      let response: unknown
      let responded = false
      const sendResponse = (value?: unknown) => {
        if (!responded) response = value
        responded = true
      }
      let result
      if (task.kind === TEMP_CONTEXT_TASK_KINDS.TurnstileFetch) {
        result = mocks.handleTempWindowTurnstileFetchMock(
          task.params,
          sendResponse,
        )
      } else if (task.kind === TEMP_CONTEXT_TASK_KINDS.NativePageAction) {
        result = mocks.handleTempWindowCheckinPageActionMock(
          task.params,
          sendResponse,
        )
      } else if (task.kind === TEMP_CONTEXT_TASK_KINDS.RenderedTitle) {
        result = mocks.handleTempWindowGetRenderedTitleMock(
          task.params,
          sendResponse,
        )
      } else {
        result = mocks.handleTempWindowFetchMock(task.params, sendResponse)
      }
      await result
      if (!responded) throw new Error("handler completed without response")
      return response
    },
  },
}))

vi.mock("~/services/permissions/permissionManager", () => ({
  COOKIE_INTERCEPTOR_PERMISSIONS: ["cookies", "declarativeNetRequest"],
  hasCookieInterceptorPermissions: mocks.hasCookieInterceptorPermissionsMock,
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  DEFAULT_PREFERENCES: {
    tempWindowFallback: mocks.defaultTempWindowFallback,
  },
  userPreferences: {
    getPreferences: mocks.getPreferencesMock,
  },
}))

vi.mock("~/utils/browser/index", () => ({
  isExtensionBackground: mocks.isExtensionBackgroundMock,
  isExtensionOptions: mocks.isExtensionOptionsMock,
  isExtensionPopup: mocks.isExtensionPopupMock,
  isExtensionSidePanel: mocks.isExtensionSidePanelMock,
}))

vi.mock("~/utils/browser/extensionPageUrls", () => ({
  OPTIONS_PAGE_URL: "chrome-extension://test/options.html",
}))

vi.mock("~/utils/browser/protectionBypass", () => ({
  isProtectionBypassFirefoxEnv: mocks.isProtectionBypassFirefoxEnvMock,
}))

vi.mock("~/utils/core/identifier", () => ({
  safeRandomUUID: mocks.safeRandomUUIDMock,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => mocks.logger,
}))

function buildTempWindowPreferences(
  overrides: Partial<typeof mocks.defaultTempWindowFallback> = {},
) {
  return {
    ...mocks.defaultTempWindowFallback,
    ...overrides,
  }
}

function buildContext(
  overrides: Partial<TempWindowFallbackContext> = {},
): TempWindowFallbackContext {
  return {
    baseUrl: "https://example.com",
    url: "https://example.com/api/models",
    endpoint: "/api/models",
    fetchOptions: { method: "GET" },
    onlyData: false,
    responseType: "json",
    authType: AuthTypeEnum.AccessToken,
    protectionBypassExecution: testExecution,
    ...overrides,
  }
}

function setWindowHref(href: string) {
  vi.stubGlobal("window", {
    location: {
      href,
    },
  })
}

function expectRuntimeTask(
  kind: string,
  params: Record<string, unknown>,
): void {
  expect(mocks.sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      action: RuntimeActionIds.ProtectionBypassExecuteTask,
      execution: testExecution,
      task: expect.objectContaining({
        kind,
        params: expect.objectContaining(params),
      }),
    }),
  )
}

describe("tempWindowFetch runtime helpers and fallback gating", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()

    mocks.sendRuntimeMessageMock.mockResolvedValue({ success: true })
    mocks.hasCookieInterceptorPermissionsMock.mockResolvedValue(true)
    mocks.getPreferencesMock.mockResolvedValue({
      tempWindowFallback: buildTempWindowPreferences(),
    })
    mocks.isExtensionBackgroundMock.mockReturnValue(false)
    mocks.isExtensionOptionsMock.mockReturnValue(false)
    mocks.isExtensionPopupMock.mockReturnValue(false)
    mocks.isExtensionSidePanelMock.mockReturnValue(false)
    mocks.isProtectionBypassFirefoxEnvMock.mockReturnValue(false)
    mocks.safeRandomUUIDMock.mockImplementation(
      (prefix: string) => `uuid:${prefix}`,
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("always allows temp-window fetch outside Firefox-specific environments", async () => {
    mocks.isProtectionBypassFirefoxEnvMock.mockReturnValue(false)

    await expect(canUseTempWindowFetch()).resolves.toBe(true)

    expect(mocks.hasCookieInterceptorPermissionsMock).not.toHaveBeenCalled()
  })

  it("checks cookie-interceptor permissions in Firefox environments", async () => {
    mocks.isProtectionBypassFirefoxEnvMock.mockReturnValue(true)
    mocks.hasCookieInterceptorPermissionsMock.mockResolvedValue(false)

    await expect(canUseTempWindowFetch()).resolves.toBe(false)
  })

  it("reports popup presentation preference blocks through the shared block-status helper", async () => {
    await expect(
      getTempWindowFallbackBlockStatus({
        preferences: buildTempWindowPreferences({
          useInPopup: false,
        }),
        isBackground: false,
        inPopup: true,
      }),
    ).resolves.toEqual({
      kind: "blocked",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      reason: "popup_disabled",
    })
  })

  it("uses caller-normalized temp-window preferences without replacing them", async () => {
    await expect(
      getTempWindowFallbackBlockStatus({
        preferences: buildTempWindowPreferences({ enabled: false }),
        isBackground: false,
        inPopup: false,
      }),
    ).resolves.toEqual({
      kind: "blocked",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      reason: "master_disabled",
    })
  })

  it.each([
    {
      location: "background",
      isBackground: true,
      preferences: buildTempWindowPreferences({ useForAutoRefresh: false }),
    },
    {
      location: "non-background",
      isBackground: false,
      preferences: buildTempWindowPreferences({ useForManualRefresh: false }),
    },
  ])(
    "does not infer authorization from a $location execution location",
    async ({ isBackground, preferences }) => {
      await expect(
        getTempWindowFallbackBlockStatus({
          preferences,
          isBackground,
        }),
      ).resolves.toEqual({
        kind: "available",
        code: null,
        reason: null,
      })
    },
  )

  it("reports Firefox permission blocks through the shared block-status helper", async () => {
    mocks.isProtectionBypassFirefoxEnvMock.mockReturnValue(true)
    mocks.hasCookieInterceptorPermissionsMock.mockResolvedValue(false)

    await expect(
      getTempWindowFallbackBlockStatus({
        preferences: buildTempWindowPreferences(),
        isBackground: false,
        inPopup: false,
      }),
    ).resolves.toEqual({
      kind: "blocked",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED,
      reason: "permission_required",
    })
  })

  it("reports Firefox popup contexts as not applicable before permission checks", async () => {
    mocks.isProtectionBypassFirefoxEnvMock.mockReturnValue(true)
    mocks.hasCookieInterceptorPermissionsMock.mockResolvedValue(false)

    await expect(
      getTempWindowFallbackBlockStatus({
        preferences: buildTempWindowPreferences(),
        isBackground: false,
        inPopup: true,
      }),
    ).resolves.toEqual({
      kind: "not_applicable",
      code: null,
      reason: "firefox_popup_unsupported",
    })
  })

  it("routes tempWindowFetch through the canonical runtime envelope", async () => {
    setWindowHref("chrome-extension://test/popup.html")
    mocks.isExtensionPopupMock.mockReturnValue(true)
    mocks.sendRuntimeMessageMock.mockResolvedValue({
      success: true,
      data: "ok",
    })

    const response = await tempWindowFetch({
      protectionBypassExecution: testExecution,
      originUrl: "https://example.com",
      fetchUrl: "https://example.com/api/models",
      fetchOptions: { method: "POST" },
    })

    expect(response).toEqual({
      success: true,
      data: "ok",
    })
    expectRuntimeTask(TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch, {
      originUrl: "https://example.com",
      fetchUrl: "https://example.com/api/models",
      fetchOptions: { method: "POST" },
    })
  })

  it("omits abort signals from tempWindowFetch runtime messages", async () => {
    const abortController = new AbortController()
    mocks.sendRuntimeMessageMock.mockResolvedValue({
      success: true,
      data: "ok",
    })

    await tempWindowFetch({
      protectionBypassExecution: testExecution,
      originUrl: "https://example.com",
      fetchUrl: "https://example.com/api/models",
      fetchOptions: {
        method: "POST",
        signal: abortController.signal,
      },
    })

    expectRuntimeTask(TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch, {
      fetchOptions: { method: "POST" },
    })
  })

  it("omits fetch options from tempWindowFetch runtime messages when none are provided", async () => {
    mocks.sendRuntimeMessageMock.mockResolvedValue({
      success: true,
      data: "ok",
    })

    await tempWindowFetch({
      protectionBypassExecution: testExecution,
      originUrl: "https://example.com",
      fetchUrl: "https://example.com/api/models",
    })

    expectRuntimeTask(TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch, {
      originUrl: "https://example.com",
      fetchUrl: "https://example.com/api/models",
    })
  })

  it("routes tempWindowTurnstileFetch through runtime messaging and keeps explicit suppression overrides", async () => {
    setWindowHref("chrome-extension://test/popup.html")
    mocks.isExtensionPopupMock.mockReturnValue(true)
    mocks.sendRuntimeMessageMock.mockResolvedValue({
      success: true,
      data: "token",
      turnstile: { status: "token_obtained", hasTurnstile: true },
    })

    const response = await tempWindowTurnstileFetch({
      protectionBypassExecution: testExecution,
      originUrl: "https://example.com",
      pageUrl: "https://example.com/checkin",
      fetchUrl: "https://example.com/api/checkin",
      fetchOptions: { method: "POST" },
      suppressMinimize: false,
    })

    expect(response).toEqual({
      success: true,
      data: "token",
      turnstile: { status: "token_obtained", hasTurnstile: true },
    })
    expectRuntimeTask("turnstile_fetch", {
      originUrl: "https://example.com",
      pageUrl: "https://example.com/checkin",
      fetchUrl: "https://example.com/api/checkin",
      fetchOptions: { method: "POST" },
      suppressMinimize: false,
    })
  })

  it("omits abort signals from tempWindowTurnstileFetch runtime messages", async () => {
    const abortController = new AbortController()
    mocks.sendRuntimeMessageMock.mockResolvedValue({
      success: true,
      data: "token",
      turnstile: { status: "token_obtained", hasTurnstile: true },
    })

    await tempWindowTurnstileFetch({
      protectionBypassExecution: testExecution,
      originUrl: "https://example.com",
      pageUrl: "https://example.com/checkin",
      fetchUrl: "https://example.com/api/checkin",
      fetchOptions: {
        method: "POST",
        signal: abortController.signal,
      },
    })

    expectRuntimeTask("turnstile_fetch", {
      fetchOptions: { method: "POST" },
    })
  })

  it("omits fetch options from tempWindowTurnstileFetch runtime messages when none are provided", async () => {
    mocks.sendRuntimeMessageMock.mockResolvedValue({
      success: true,
      data: "token",
      turnstile: { status: "token_obtained", hasTurnstile: true },
    })

    await tempWindowTurnstileFetch({
      protectionBypassExecution: testExecution,
      originUrl: "https://example.com",
      pageUrl: "https://example.com/checkin",
      fetchUrl: "https://example.com/api/checkin",
    })

    expectRuntimeTask("turnstile_fetch", {
      originUrl: "https://example.com",
      pageUrl: "https://example.com/checkin",
      fetchUrl: "https://example.com/api/checkin",
    })
    expect(
      mocks.sendRuntimeMessageMock.mock.calls[0]?.[0].task.params,
    ).not.toHaveProperty("fetchOptions")
  })

  it("routes tempWindowTriggerCheckinPageAction through runtime messaging", async () => {
    mocks.sendRuntimeMessageMock.mockResolvedValueOnce({
      success: false,
      reason: "identity_mismatch",
      identity: { userId: "other-user", user: { id: "other-user" } },
      expectedUserId: "target-user",
    })

    const response = await tempWindowTriggerCheckinPageAction({
      protectionBypassExecution: testExecution,
      originUrl: "https://example.invalid",
      pageUrl: "https://example.invalid/console/personal",
      siteType: "new-api",
      expectedUserId: "target-user",
      requestId: "req-native-runtime",
      suppressMinimize: true,
    })

    expectRuntimeTask("native_page_action", {
      originUrl: "https://example.invalid",
      pageUrl: "https://example.invalid/console/personal",
      siteType: "new-api",
      expectedUserId: "target-user",
      requestId: "req-native-runtime",
      suppressMinimize: true,
    })
    expect(response.reason).toBe("identity_mismatch")
  })

  it("routes rendered-title requests through runtime messaging in popup contexts", async () => {
    setWindowHref("chrome-extension://test/popup.html")
    mocks.isExtensionPopupMock.mockReturnValue(true)
    mocks.sendRuntimeMessageMock.mockResolvedValue({
      success: true,
      title: "WAF Challenge",
    })

    const response = await tempWindowGetRenderedTitle({
      protectionBypassExecution: testExecution,
      originUrl: "https://example.com",
    })

    expect(response).toEqual({
      success: true,
      title: "WAF Challenge",
    })
    expectRuntimeTask("rendered_title", {
      originUrl: "https://example.com",
    })
  })

  it("prefers the propagated popup source when fallback executes in background", async () => {
    mocks.isProtectionBypassFirefoxEnvMock.mockReturnValue(true)

    await expect(
      getTempWindowFallbackBlockStatus({
        preferences: buildTempWindowPreferences(),
        isBackground: true,
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      }),
    ).resolves.toEqual({
      kind: "not_applicable",
      code: null,
      reason: "firefox_popup_unsupported",
    })
  })

  it("dispatches Firefox popup requests for centralized presentation policy", async () => {
    mocks.isProtectionBypassFirefoxEnvMock.mockReturnValue(true)
    const popupSource = {
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      protectionBypassExecution: testExecution,
    }

    await tempWindowFetch({
      originUrl: "https://example.invalid",
      fetchUrl: "https://example.invalid/api/models",
      ...popupSource,
    })
    await tempWindowTurnstileFetch({
      originUrl: "https://example.invalid",
      pageUrl: "https://example.invalid/checkin",
      fetchUrl: "https://example.invalid/api/checkin",
      ...popupSource,
    })
    await tempWindowTriggerCheckinPageAction({
      originUrl: "https://example.invalid",
      pageUrl: "https://example.invalid/console/personal",
      siteType: "new-api",
      expectedUserId: "target-user",
      ...popupSource,
    })
    await tempWindowGetRenderedTitle({
      originUrl: "https://example.invalid",
      ...popupSource,
    })

    expect(mocks.sendRuntimeMessageMock).toHaveBeenCalledTimes(4)
    expect(mocks.handleTempWindowFetchMock).not.toHaveBeenCalled()
    expect(mocks.handleTempWindowTurnstileFetchMock).not.toHaveBeenCalled()
    expect(mocks.handleTempWindowCheckinPageActionMock).not.toHaveBeenCalled()
    expect(mocks.handleTempWindowGetRenderedTitleMock).not.toHaveBeenCalled()
  })

  it.each([
    TEMP_WINDOW_REQUEST_SOURCES.Background,
    TEMP_WINDOW_REQUEST_SOURCES.Popup,
  ])(
    "propagates $source execution surface outside task params",
    async (source) => {
      mocks.sendRuntimeMessageMock.mockResolvedValue({
        success: true,
        status: 200,
        data: { success: true, data: { ok: true }, message: "ok" },
      })

      await executeWithTempWindowFallback(
        buildContext({
          forceTempWindow: true,
          tempWindowRequestSource: source,
        }),
        async () => ({ success: true, data: { ok: false }, message: "direct" }),
      )

      expectRuntimeTask(TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch, {})
      expect(
        mocks.sendRuntimeMessageMock.mock.calls[0]?.[0].task.params,
      ).not.toHaveProperty("tempWindowRequestSource")
    },
  )

  it("rethrows non-ApiError failures without attempting temp-window fallback", async () => {
    const networkError = new TypeError("socket hang up")

    await expect(
      executeWithTempWindowFallback(buildContext(), async () => {
        throw networkError
      }),
    ).rejects.toBe(networkError)

    expect(mocks.sendRuntimeMessageMock).not.toHaveBeenCalled()
    expect(mocks.logger.debug).toHaveBeenCalledWith(
      "Temp window fallback skipped",
      expect.objectContaining({
        reason:
          "Error is not an ApiError instance; treating as normal network/other error.",
        extra: expect.objectContaining({
          error: networkError,
        }),
      }),
    )
  })

  it("does not read user preferences before dispatching fallback", async () => {
    mocks.getPreferencesMock.mockRejectedValue(new Error("storage unavailable"))
    mocks.sendRuntimeMessageMock.mockResolvedValue({
      success: true,
      status: 200,
      data: {
        success: true,
        data: {
          models: ["gpt-4.1"],
        },
      },
    })

    const result = await executeWithTempWindowFallback(
      buildContext({
        onlyData: true,
        accountId: "acct-1",
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "session=abc",
        useIncognito: true,
      }),
      async () => {
        throw new ApiError(
          "blocked by WAF",
          403,
          "/api/models",
          API_ERROR_CODES.HTTP_403,
        )
      },
    )

    expect(result).toEqual({
      models: ["gpt-4.1"],
    })
    expect(mocks.getPreferencesMock).not.toHaveBeenCalled()
    expectRuntimeTask(TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch, {
      originUrl: "https://example.com",
      fetchUrl: "https://example.com/api/models",
      requestId: "uuid:temp-fetch-https://example.com/api/models",
      responseType: "json",
      accountId: "acct-1",
      authType: AuthTypeEnum.Cookie,
      cookieAuthSessionCookie: "session=abc",
      useIncognito: true,
    })
  })

  it("returns the full API response when onlyData is disabled", async () => {
    const responseBody = {
      success: true,
      data: { total: 3 },
      message: "ok",
    }
    mocks.sendRuntimeMessageMock.mockResolvedValue({
      success: true,
      status: 200,
      data: responseBody,
    })

    const result = await executeWithTempWindowFallback(
      buildContext(),
      async () => {
        throw new ApiError(
          "blocked by WAF",
          403,
          "/api/models",
          API_ERROR_CODES.CONTENT_TYPE_MISMATCH,
        )
      },
    )

    expect(result).toEqual(responseBody)
  })

  it("returns raw text bodies for text fallback requests", async () => {
    mocks.sendRuntimeMessageMock.mockResolvedValue({
      success: true,
      status: 200,
      data: "<html>challenge cleared</html>",
    })

    const result = await executeWithTempWindowFallback(
      buildContext({
        responseType: "text",
      }),
      async () => {
        throw new ApiError(
          "blocked by WAF",
          403,
          "/api/models",
          API_ERROR_CODES.HTTP_403,
        )
      },
    )

    expect(result).toBe("<html>challenge cleared</html>")
  })

  it("falls back on 401 cookie-auth failures so stored account cookies can be replayed", async () => {
    mocks.sendRuntimeMessageMock.mockResolvedValue({
      success: true,
      status: 200,
      data: {
        success: true,
        data: { account: "stored-cookie" },
        message: "ok",
      },
    })

    const result = await executeWithTempWindowFallback(
      buildContext({
        onlyData: true,
        accountId: "acct-1",
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "session=stored-account",
      }),
      async () => {
        throw new ApiError(
          "current browser session is unauthorized",
          401,
          "/api/models",
          API_ERROR_CODES.HTTP_401,
        )
      },
    )

    expect(result).toEqual({ account: "stored-cookie" })
    expectRuntimeTask(TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch, {
      accountId: "acct-1",
      authType: AuthTypeEnum.Cookie,
      cookieAuthSessionCookie: "session=stored-account",
    })
  })

  it("does not fall back on cookie-auth 401 when an explicit empty allowlist is provided", async () => {
    const error = new ApiError(
      "current browser session is unauthorized",
      401,
      "/api/models",
      API_ERROR_CODES.HTTP_401,
    )

    await expect(
      executeWithTempWindowFallback(
        buildContext({
          onlyData: true,
          accountId: "acct-1",
          authType: AuthTypeEnum.Cookie,
          cookieAuthSessionCookie: "session=stored-account",
          tempWindowFallback: { statusCodes: [], codes: [] },
        }),
        async () => {
          throw error
        },
      ),
    ).rejects.toBe(error)

    expect(mocks.sendRuntimeMessageMock).not.toHaveBeenCalled()
  })

  it("honors an explicit cookie-auth 401 allowlist", async () => {
    mocks.sendRuntimeMessageMock.mockResolvedValue({
      success: true,
      status: 200,
      data: {
        success: true,
        data: { account: "stored-cookie" },
        message: "ok",
      },
    })

    const result = await executeWithTempWindowFallback(
      buildContext({
        onlyData: true,
        accountId: "acct-1",
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "session=stored-account",
        tempWindowFallback: { statusCodes: [401], codes: [] },
      }),
      async () => {
        throw new ApiError(
          "current browser session is unauthorized",
          401,
          "/api/models",
          API_ERROR_CODES.HTTP_401,
        )
      },
    )

    expect(result).toEqual({ account: "stored-cookie" })
    expectRuntimeTask(TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch, {
      accountId: "acct-1",
      authType: AuthTypeEnum.Cookie,
      cookieAuthSessionCookie: "session=stored-account",
    })
  })

  it("does not fall back on 401 token-auth failures", async () => {
    const error = new ApiError(
      "access token is unauthorized",
      401,
      "/api/models",
      API_ERROR_CODES.HTTP_401,
    )

    await expect(
      executeWithTempWindowFallback(buildContext(), async () => {
        throw error
      }),
    ).rejects.toBe(error)

    expect(mocks.sendRuntimeMessageMock).not.toHaveBeenCalled()
  })

  it("surfaces temp-window transport failures as ApiError with a fallback message", async () => {
    mocks.sendRuntimeMessageMock.mockResolvedValue({
      success: false,
      status: 403,
      code: API_ERROR_CODES.HTTP_403,
    })

    await expect(
      executeWithTempWindowFallback(buildContext(), async () => {
        throw new ApiError(
          "blocked by WAF",
          403,
          "/api/models",
          API_ERROR_CODES.HTTP_403,
        )
      }),
    ).rejects.toMatchObject({
      message: "Temp window fetch failed",
      statusCode: 403,
      endpoint: "/api/models",
      code: API_ERROR_CODES.HTTP_403,
    })
  })

  it("relabels the error when Firefox permission requirements block fallback", async () => {
    mocks.isProtectionBypassFirefoxEnvMock.mockReturnValue(true)
    mocks.hasCookieInterceptorPermissionsMock.mockResolvedValue(false)

    const error = new ApiError(
      "blocked by WAF",
      403,
      "/api/models",
      API_ERROR_CODES.HTTP_403,
    )

    await expect(
      executeWithTempWindowFallback(buildContext(), async () => {
        throw error
      }),
    ).rejects.toBe(error)

    expect(error.code).toBe(API_ERROR_CODES.TEMP_WINDOW_PERMISSION_REQUIRED)
    expect(error.originalCode).toBe(API_ERROR_CODES.HTTP_403)
    expect(mocks.sendRuntimeMessageMock).not.toHaveBeenCalled()
  })

  it("defers Firefox popup support decisions to the background policy", async () => {
    setWindowHref("chrome-extension://test/popup.html")
    mocks.isProtectionBypassFirefoxEnvMock.mockReturnValue(true)
    mocks.isExtensionPopupMock.mockReturnValue(true)

    const error = new ApiError(
      "blocked by WAF",
      403,
      "/api/models",
      API_ERROR_CODES.HTTP_403,
    )

    await executeWithTempWindowFallback(buildContext(), async () => {
      throw error
    })

    expect(mocks.getPreferencesMock).not.toHaveBeenCalled()
    expect(mocks.sendRuntimeMessageMock).toHaveBeenCalledTimes(1)
  })

  it("skips fallback for non-http base URLs", async () => {
    const error = new ApiError(
      "blocked by WAF",
      403,
      "/api/models",
      API_ERROR_CODES.HTTP_403,
    )

    await expect(
      executeWithTempWindowFallback(
        buildContext({
          baseUrl: "file:///tmp/example",
        }),
        async () => {
          throw error
        },
      ),
    ).rejects.toBe(error)

    expect(mocks.sendRuntimeMessageMock).not.toHaveBeenCalled()
  })

  it("skips fallback when the error does not match the request allowlist", async () => {
    const error = new ApiError(
      "blocked by WAF",
      403,
      "/api/models",
      API_ERROR_CODES.HTTP_403,
    )

    await expect(
      executeWithTempWindowFallback(
        buildContext({
          tempWindowFallback: {
            statusCodes: [429],
            codes: [API_ERROR_CODES.HTTP_429],
          },
        }),
        async () => {
          throw error
        },
      ),
    ).rejects.toBe(error)

    expect(mocks.sendRuntimeMessageMock).not.toHaveBeenCalled()
    expect(mocks.logger.debug).toHaveBeenCalledWith(
      "Temp window fallback skipped",
      expect.objectContaining({
        reason:
          "Error does not match any temp window fallback codes or statuses.",
        extra: expect.objectContaining({
          statusCode: 403,
          code: API_ERROR_CODES.HTTP_403,
        }),
      }),
    )
  })

  it("skips fallback for backend business errors even when the response status is 403", async () => {
    const error = new ApiError(
      "Backend rejected the request",
      403,
      "/v1/models",
      API_ERROR_CODES.BUSINESS_ERROR,
    )

    await expect(
      executeWithTempWindowFallback(buildContext(), async () => {
        throw error
      }),
    ).rejects.toBe(error)

    expect(mocks.sendRuntimeMessageMock).not.toHaveBeenCalled()
    expect(mocks.logger.debug).toHaveBeenCalledWith(
      "Temp window fallback skipped",
      expect.objectContaining({
        reason:
          "Error is a backend business error; temp window fallback cannot recover it.",
        extra: expect.objectContaining({
          statusCode: 403,
          code: API_ERROR_CODES.BUSINESS_ERROR,
        }),
      }),
    )
  })
})
