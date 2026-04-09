import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import { AuthTypeEnum, TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types"
import type { TempWindowFallbackContext } from "~/types/tempWindowFetch"
import {
  canUseTempWindowFetch,
  executeWithTempWindowFallback,
  getTempWindowFallbackBlockStatus,
  tempWindowFetch,
  tempWindowGetRenderedTitle,
  tempWindowTurnstileFetch,
} from "~/utils/browser/tempWindowFetch"

const mocks = vi.hoisted(() => ({
  sendRuntimeMessageMock: vi.fn(),
  handleTempWindowFetchMock: vi.fn(),
  handleTempWindowTurnstileFetchMock: vi.fn(),
  handleTempWindowGetRenderedTitleMock: vi.fn(),
  hasCookieInterceptorPermissionsMock: vi.fn(),
  getPreferencesMock: vi.fn(),
  isExtensionBackgroundMock: vi.fn(),
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

vi.mock("~/utils/browser/browserApi", () => ({
  sendRuntimeMessage: mocks.sendRuntimeMessageMock,
}))

vi.mock("~/entrypoints/background/tempWindowPool", () => ({
  handleTempWindowFetch: mocks.handleTempWindowFetchMock,
  handleTempWindowTurnstileFetch: mocks.handleTempWindowTurnstileFetchMock,
  handleTempWindowGetRenderedTitle: mocks.handleTempWindowGetRenderedTitleMock,
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
  OPTIONS_PAGE_URL: "chrome-extension://test/options.html",
  isExtensionBackground: mocks.isExtensionBackgroundMock,
  isExtensionPopup: mocks.isExtensionPopupMock,
  isExtensionSidePanel: mocks.isExtensionSidePanelMock,
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

  it("reports popup manual-refresh preference blocks through the shared block-status helper", async () => {
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

  it("routes tempWindowFetch through runtime messaging and defaults popup minimize suppression", async () => {
    setWindowHref("chrome-extension://test/popup.html")
    mocks.isExtensionPopupMock.mockReturnValue(true)
    mocks.sendRuntimeMessageMock.mockResolvedValue({
      success: true,
      data: "ok",
    })

    const response = await tempWindowFetch({
      originUrl: "https://example.com",
      fetchUrl: "https://example.com/api/models",
      fetchOptions: { method: "POST" },
    })

    expect(response).toEqual({
      success: true,
      data: "ok",
    })
    expect(mocks.sendRuntimeMessageMock).toHaveBeenCalledWith({
      action: RuntimeActionIds.TempWindowFetch,
      originUrl: "https://example.com",
      fetchUrl: "https://example.com/api/models",
      fetchOptions: { method: "POST" },
      suppressMinimize: true,
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
    expect(mocks.sendRuntimeMessageMock).toHaveBeenCalledWith({
      action: RuntimeActionIds.TempWindowTurnstileFetch,
      originUrl: "https://example.com",
      pageUrl: "https://example.com/checkin",
      fetchUrl: "https://example.com/api/checkin",
      fetchOptions: { method: "POST" },
      suppressMinimize: false,
    })
  })

  it("routes rendered-title requests through runtime messaging in popup contexts", async () => {
    setWindowHref("chrome-extension://test/popup.html")
    mocks.isExtensionPopupMock.mockReturnValue(true)
    mocks.sendRuntimeMessageMock.mockResolvedValue({
      success: true,
      title: "WAF Challenge",
    })

    const response = await tempWindowGetRenderedTitle({
      originUrl: "https://example.com",
    })

    expect(response).toEqual({
      success: true,
      title: "WAF Challenge",
    })
    expect(mocks.sendRuntimeMessageMock).toHaveBeenCalledWith({
      action: RuntimeActionIds.TempWindowGetRenderedTitle,
      originUrl: "https://example.com",
      suppressMinimize: true,
    })
  })

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

  it("falls back using default preferences when loading user preferences fails", async () => {
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
    expect(mocks.sendRuntimeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.TempWindowFetch,
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/models",
        requestId: "uuid:temp-fetch-https://example.com/api/models",
        responseType: "json",
        suppressMinimize: true,
        accountId: "acct-1",
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "session=abc",
      }),
    )
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

  it("preserves an existing originalCode when disabled preferences block fallback in popup", async () => {
    setWindowHref("chrome-extension://test/popup.html")
    mocks.isExtensionPopupMock.mockReturnValue(true)
    mocks.getPreferencesMock.mockResolvedValue({
      tempWindowFallback: buildTempWindowPreferences({
        useInPopup: false,
      }),
    })

    const error = new ApiError(
      "blocked by WAF",
      403,
      "/api/models",
      API_ERROR_CODES.HTTP_403,
    )
    error.originalCode = API_ERROR_CODES.CONTENT_TYPE_MISMATCH

    await expect(
      executeWithTempWindowFallback(buildContext(), async () => {
        throw error
      }),
    ).rejects.toBe(error)

    expect(error.code).toBe(API_ERROR_CODES.TEMP_WINDOW_DISABLED)
    expect(error.originalCode).toBe(API_ERROR_CODES.CONTENT_TYPE_MISMATCH)
    expect(mocks.sendRuntimeMessageMock).not.toHaveBeenCalled()
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

  it("does not use the temp-window shield inside Firefox popups", async () => {
    setWindowHref("chrome-extension://test/popup.html")
    mocks.isProtectionBypassFirefoxEnvMock.mockReturnValue(true)
    mocks.isExtensionPopupMock.mockReturnValue(true)

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

    expect(mocks.getPreferencesMock).not.toHaveBeenCalled()
    expect(error.code).toBe(API_ERROR_CODES.HTTP_403)
    expect(error.originalCode).toBeUndefined()
  })

  it("honors the options-page preference gate before attempting fallback", async () => {
    setWindowHref("chrome-extension://test/options.html?tab=refresh")
    mocks.getPreferencesMock.mockResolvedValue({
      tempWindowFallback: buildTempWindowPreferences({
        useInOptions: false,
      }),
    })

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

    expect(error.code).toBe(API_ERROR_CODES.TEMP_WINDOW_DISABLED)
    expect(error.originalCode).toBe(API_ERROR_CODES.HTTP_403)
  })

  it("honors the side-panel preference gate before attempting fallback", async () => {
    setWindowHref("chrome-extension://test/sidepanel.html")
    mocks.isExtensionSidePanelMock.mockReturnValue(true)
    mocks.getPreferencesMock.mockResolvedValue({
      tempWindowFallback: buildTempWindowPreferences({
        useInSidePanel: false,
      }),
    })

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

    expect(error.code).toBe(API_ERROR_CODES.TEMP_WINDOW_DISABLED)
    expect(error.originalCode).toBe(API_ERROR_CODES.HTTP_403)
  })

  it("honors the auto-refresh preference gate in background contexts", async () => {
    mocks.isExtensionBackgroundMock.mockReturnValue(true)
    mocks.getPreferencesMock.mockResolvedValue({
      tempWindowFallback: buildTempWindowPreferences({
        useForAutoRefresh: false,
      }),
    })

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

    expect(error.code).toBe(API_ERROR_CODES.TEMP_WINDOW_DISABLED)
    expect(error.originalCode).toBe(API_ERROR_CODES.HTTP_403)
  })

  it("honors the manual-refresh preference gate in non-background contexts", async () => {
    mocks.getPreferencesMock.mockResolvedValue({
      tempWindowFallback: buildTempWindowPreferences({
        useForManualRefresh: false,
      }),
    })

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

    expect(error.code).toBe(API_ERROR_CODES.TEMP_WINDOW_DISABLED)
    expect(error.originalCode).toBe(API_ERROR_CODES.HTTP_403)
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
})
