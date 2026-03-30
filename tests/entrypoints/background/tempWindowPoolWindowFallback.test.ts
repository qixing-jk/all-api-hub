import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { API_ERROR_CODES } from "~/services/apiService/common/errors"
import { AuthTypeEnum } from "~/types"
import {
  AUTH_MODE,
  COOKIE_SESSION_OVERRIDE_HEADER_NAME,
} from "~/utils/browser/cookieHelper"

const originalBrowser = (globalThis as any).browser

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe("tempWindowPool window fallback", () => {
  let createTabMock: ReturnType<typeof vi.fn>
  let createWindowMock: ReturnType<typeof vi.fn>
  let removeTabOrWindowMock: ReturnType<typeof vi.fn>
  let hasWindowsApiMock: ReturnType<typeof vi.fn>
  let isAllowedIncognitoAccessMock: ReturnType<typeof vi.fn>
  let onTabRemovedMock: ReturnType<typeof vi.fn>
  let onWindowRemovedMock: ReturnType<typeof vi.fn>
  let getAccountByIdMock: ReturnType<typeof vi.fn>
  let getCookieHeaderForUrlMock: ReturnType<typeof vi.fn>
  let addAuthMethodHeaderMock: ReturnType<typeof vi.fn>
  let applyTempWindowCookieRuleMock: ReturnType<typeof vi.fn>
  let removeTempWindowCookieRuleMock: ReturnType<typeof vi.fn>
  let isProtectionBypassFirefoxEnvMock: ReturnType<typeof vi.fn>
  let getSiteTypeMock: ReturnType<typeof vi.fn>
  let getPreferencesMock: ReturnType<typeof vi.fn>
  let sendMessageMock: ReturnType<typeof vi.fn>
  let tabsGetMock: ReturnType<typeof vi.fn>
  let tabsQueryMock: ReturnType<typeof vi.fn>
  let tempContextMode: "window" | "composite" | "tab"
  let defaultTempContextMode: "window" | "composite" | "tab"

  beforeEach(() => {
    createTabMock = vi.fn()
    createWindowMock = vi.fn()
    removeTabOrWindowMock = vi.fn().mockResolvedValue(undefined)
    hasWindowsApiMock = vi.fn(() => true)
    isAllowedIncognitoAccessMock = vi.fn().mockResolvedValue(true)
    onTabRemovedMock = vi.fn(() => () => {})
    onWindowRemovedMock = vi.fn(() => () => {})
    getAccountByIdMock = vi.fn()
    getCookieHeaderForUrlMock = vi.fn().mockResolvedValue("")
    addAuthMethodHeaderMock = vi.fn(
      async (headers: HeadersInit, mode: string) => ({
        ...(headers as Record<string, string>),
        "X-Auth-Mode": mode,
      }),
    )
    applyTempWindowCookieRuleMock = vi.fn().mockResolvedValue(null)
    removeTempWindowCookieRuleMock = vi.fn().mockResolvedValue(undefined)
    isProtectionBypassFirefoxEnvMock = vi.fn(() => false)
    getSiteTypeMock = vi.fn().mockResolvedValue("new-api")
    getPreferencesMock = vi.fn().mockImplementation(() =>
      Promise.resolve({
        tempWindowFallback: {
          tempContextMode,
        },
      }),
    )
    sendMessageMock = vi.fn(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentGetRenderedTitle:
            return { success: true, title: "Example title" }
          case RuntimeActionIds.ContentGetUserFromLocalStorage:
            return {
              success: true,
              data: {
                userId: "user-1",
                user: "alice",
                accessToken: "access-token",
                siteTypeHint: "new-api",
              },
            }
          case RuntimeActionIds.ContentPerformTempWindowFetch:
            return {
              success: true,
              data: {
                success: true,
                message: "",
                data: "ok",
              },
            }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )
    tabsGetMock = vi.fn().mockResolvedValue({ status: "complete" })
    tabsQueryMock = vi.fn().mockResolvedValue([])
    tempContextMode = "window"
    defaultTempContextMode = "window"

    vi.useFakeTimers()
    vi.resetModules()
    ;(globalThis as any).browser = {
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      },
      tabs: {
        get: tabsGetMock,
        query: tabsQueryMock,
        update: vi.fn().mockResolvedValue(undefined),
        sendMessage: sendMessageMock,
      },
      windows: {
        get: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
      },
    }

    vi.doMock("~/utils/browser/browserApi", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/browserApi")>()

      return {
        ...actual,
        createTab: createTabMock,
        createWindow: createWindowMock,
        hasWindowsAPI: hasWindowsApiMock,
        isAllowedIncognitoAccess: isAllowedIncognitoAccessMock,
        onTabRemoved: onTabRemovedMock,
        onWindowRemoved: onWindowRemovedMock,
        removeTabOrWindow: removeTabOrWindowMock,
      }
    })
    vi.doMock("~/services/accounts/accountStorage", () => ({
      accountStorage: {
        getAccountById: getAccountByIdMock,
      },
    }))
    vi.doMock("~/utils/browser/cookieHelper", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/cookieHelper")>()

      return {
        ...actual,
        addAuthMethodHeader: addAuthMethodHeaderMock,
        getCookieHeaderForUrl: getCookieHeaderForUrlMock,
      }
    })
    vi.doMock("~/utils/browser/dnrCookieInjector", () => ({
      applyTempWindowCookieRule: applyTempWindowCookieRuleMock,
      removeTempWindowCookieRule: removeTempWindowCookieRuleMock,
    }))
    vi.doMock("~/utils/browser/protectionBypass", () => ({
      isProtectionBypassFirefoxEnv: isProtectionBypassFirefoxEnvMock,
    }))
    vi.doMock("~/services/siteDetection/detectSiteType", () => ({
      getSiteType: getSiteTypeMock,
    }))
    vi.doMock("~/services/preferences/userPreferences", () => ({
      DEFAULT_PREFERENCES: {
        tempWindowFallback: {
          tempContextMode: defaultTempContextMode,
        },
      },
      userPreferences: {
        getPreferences: getPreferencesMock,
      },
    }))
    vi.doMock("~/utils/i18n/core", () => ({
      t: vi.fn((key: string) => key),
    }))
  })

  afterEach(() => {
    ;(globalThis as any).browser = originalBrowser

    vi.useRealTimers()
    vi.doUnmock("~/services/accounts/accountStorage")
    vi.doUnmock("~/utils/browser/cookieHelper")
    vi.doUnmock("~/utils/browser/dnrCookieInjector")
    vi.doUnmock("~/utils/browser/protectionBypass")
    vi.doUnmock("~/utils/browser/browserApi")
    vi.doUnmock("~/services/siteDetection/detectSiteType")
    vi.doUnmock("~/services/preferences/userPreferences")
    vi.doUnmock("~/utils/i18n/core")
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("rolls back popup temp-context creation to a plain tab", async () => {
    tempContextMode = "window"
    createWindowMock.mockRejectedValueOnce(
      new Error("Popup windows are not allowed on this runtime"),
    )
    createTabMock.mockResolvedValueOnce({ id: 101 })

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/test",
        fetchOptions: { method: "GET" },
        requestId: "req-popup",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "ok",
      },
    })
    expect(createWindowMock).toHaveBeenCalledTimes(1)
    expect(createTabMock).toHaveBeenCalledWith("https://example.com", false)

    await vi.advanceTimersByTimeAsync(2500)
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(101)
  })

  it("rolls back composite temp-context creation to a plain tab", async () => {
    tempContextMode = "composite"
    createWindowMock.mockRejectedValueOnce(
      new Error("Window creation is not supported for popup or normal windows"),
    )
    createTabMock.mockResolvedValueOnce({ id: 202 })

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/composite",
        fetchOptions: { method: "GET" },
        requestId: "req-composite",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "ok",
      },
    })
    expect(createWindowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "normal",
        url: "https://example.com",
      }),
    )
    expect(createTabMock).toHaveBeenCalledWith("https://example.com", false)

    await vi.advanceTimersByTimeAsync(2500)
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(202)
  })

  it("cleans up a half-created composite window before rolling back to a plain tab", async () => {
    tempContextMode = "composite"
    createWindowMock.mockResolvedValueOnce({ id: 303 })
    tabsQueryMock.mockResolvedValueOnce([])
    createTabMock.mockResolvedValueOnce({ id: 304 })

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/composite-missing-tab",
        fetchOptions: { method: "GET" },
        requestId: "req-composite-missing-tab",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "ok",
      },
    })
    expect(removeTabOrWindowMock).toHaveBeenNthCalledWith(1, 303)
    expect(createTabMock).toHaveBeenCalledWith("https://example.com", false)

    await vi.advanceTimersByTimeAsync(2500)
    expect(removeTabOrWindowMock).toHaveBeenNthCalledWith(2, 304)
  })

  it("continues composite temp-window fetches when minimizing the shared window fails", async () => {
    tempContextMode = "composite"
    createWindowMock.mockResolvedValueOnce({ id: 305 })
    tabsQueryMock.mockResolvedValueOnce([{ id: 306 }])
    ;(globalThis as any).browser.windows.update.mockRejectedValueOnce(
      new Error("minimize failed"),
    )

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/composite-minimize-failure",
        fetchOptions: { method: "GET" },
        requestId: "req-composite-minimize-failure",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect((globalThis as any).browser.windows.update).toHaveBeenCalledWith(
      305,
      {
        state: "minimized",
      },
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "ok",
      },
    })

    await vi.advanceTimersByTimeAsync(2500)
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(306)
  })

  it("preserves a structured unsupported result for incognito temp contexts", async () => {
    tempContextMode = "window"
    createWindowMock.mockRejectedValueOnce(
      new Error("Popup windows are not allowed on this runtime"),
    )

    const { handleTempWindowTurnstileFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowTurnstileFetch(
      {
        originUrl: "https://example.com",
        pageUrl: "https://example.com/checkin",
        fetchUrl: "https://example.com/api/checkin",
        fetchOptions: { method: "POST" },
        useIncognito: true,
        requestId: "req-incognito",
      },
      sendResponse,
    )

    await request
    await vi.advanceTimersByTimeAsync(2500)

    expect(createTabMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "messages:background.windowCreationUnavailable",
      code: API_ERROR_CODES.TEMP_WINDOW_WINDOW_CREATION_UNAVAILABLE,
      turnstile: {
        status: "error",
        hasTurnstile: false,
      },
    })
  })

  it("preserves a windows-api-unavailable error for incognito temp contexts", async () => {
    tempContextMode = "window"
    hasWindowsApiMock.mockReturnValue(false)
    createWindowMock.mockResolvedValueOnce(undefined)

    const { handleTempWindowTurnstileFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleTempWindowTurnstileFetch(
      {
        originUrl: "https://example.com",
        pageUrl: "https://example.com/checkin",
        fetchUrl: "https://example.com/api/checkin",
        fetchOptions: { method: "POST" },
        useIncognito: true,
        requestId: "req-incognito-no-windows-api",
      },
      sendResponse,
    )

    expect(createTabMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "messages:background.windowCreationUnavailable",
      code: API_ERROR_CODES.TEMP_WINDOW_WINDOWS_API_UNAVAILABLE,
      turnstile: {
        status: "error",
        hasTurnstile: false,
      },
    })
  })

  it("preserves a missing-handle error for incognito popup temp contexts", async () => {
    tempContextMode = "window"
    createWindowMock.mockResolvedValueOnce({ id: 404 })
    tabsQueryMock.mockResolvedValueOnce([])

    const { handleTempWindowTurnstileFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleTempWindowTurnstileFetch(
      {
        originUrl: "https://example.com",
        pageUrl: "https://example.com/checkin",
        fetchUrl: "https://example.com/api/checkin",
        fetchOptions: { method: "POST" },
        useIncognito: true,
        requestId: "req-incognito-missing-tab",
      },
      sendResponse,
    )

    expect(createTabMock).not.toHaveBeenCalled()
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(404)
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "messages:background.windowCreationUnavailable",
      code: API_ERROR_CODES.TEMP_WINDOW_WINDOW_HANDLE_UNAVAILABLE,
      turnstile: {
        status: "error",
        hasTurnstile: false,
      },
    })
  })

  it("requires incognito access before opening a turnstile temp context", async () => {
    isAllowedIncognitoAccessMock.mockResolvedValueOnce(false)

    const { handleTempWindowTurnstileFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleTempWindowTurnstileFetch(
      {
        originUrl: "https://example.com",
        pageUrl: "https://example.com/auth",
        fetchUrl: "https://example.com/api/turnstile",
        fetchOptions: { method: "GET" },
        useIncognito: true,
        requestId: "req-incognito-access-denied",
      },
      sendResponse,
    )

    expect(createWindowMock).not.toHaveBeenCalled()
    expect(createTabMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "messages:background.incognitoAccessRequired",
      turnstile: {
        status: "error",
        hasTurnstile: false,
      },
    })
  })

  it("falls back to the default saved temp-context mode when user preferences are missing that field", async () => {
    tempContextMode = "tab"
    defaultTempContextMode = "composite"
    getPreferencesMock.mockResolvedValueOnce({})
    createWindowMock.mockResolvedValueOnce({ id: 490 })
    tabsQueryMock.mockResolvedValueOnce([{ id: 491 }])

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/default-composite-mode",
        fetchOptions: { method: "GET" },
        requestId: "req-default-composite-mode",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect(createWindowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "normal",
        url: "https://example.com",
      }),
    )
    expect(createTabMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "ok",
      },
    })
  })

  it("falls back to default temp-context preferences when reading user preferences throws", async () => {
    tempContextMode = "window"
    defaultTempContextMode = "tab"
    getPreferencesMock.mockRejectedValueOnce(
      new Error("preferences unavailable"),
    )
    createTabMock.mockResolvedValueOnce({ id: 492 })

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/default-tab-mode",
        fetchOptions: { method: "GET" },
        requestId: "req-default-tab-mode",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect(createWindowMock).not.toHaveBeenCalled()
    expect(createTabMock).toHaveBeenCalledWith("https://example.com", false)
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "ok",
      },
    })
  })

  it("surfaces unexpected popup-window creation failures in temp fetch flows", async () => {
    tempContextMode = "window"
    createWindowMock.mockRejectedValueOnce(
      new Error("unexpected popup creation failure"),
    )

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/popup-error",
        fetchOptions: { method: "GET" },
        requestId: "req-popup-error",
      },
      sendResponse,
    )

    expect(createTabMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "unexpected popup creation failure",
      code: undefined,
    })
  })

  it("surfaces unexpected composite-window creation failures in temp fetch flows", async () => {
    tempContextMode = "composite"
    createWindowMock.mockRejectedValueOnce(
      new Error("unexpected composite creation failure"),
    )

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/composite-error",
        fetchOptions: { method: "GET" },
        requestId: "req-composite-error",
      },
      sendResponse,
    )

    expect(createTabMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "unexpected composite creation failure",
      code: undefined,
    })
  })

  it("allows a tracked temp fetch to be manually closed while the content request is still in flight", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 493 })

    const deferredFetch = createDeferred<{
      success: boolean
      data: {
        success: boolean
        message: string
        data: string
      }
    }>()

    sendMessageMock.mockImplementation(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentPerformTempWindowFetch:
            return deferredFetch.promise
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleCloseTempWindow, handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const fetchResponse = vi.fn()
    const request = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/manual-close",
        fetchOptions: { method: "GET" },
        requestId: "req-manual-close",
      },
      fetchResponse,
    )

    await vi.advanceTimersByTimeAsync(500)

    const closeResponse = vi.fn()
    await handleCloseTempWindow(
      { requestId: "req-manual-close" },
      closeResponse,
    )

    expect(closeResponse).toHaveBeenCalledWith({ success: true })

    await vi.advanceTimersByTimeAsync(2000)
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(493)

    deferredFetch.reject(new Error("manual close canceled the fetch"))
    await request

    expect(fetchResponse).toHaveBeenCalledWith({
      success: false,
      error: "manual close canceled the fetch",
      code: undefined,
    })

    await vi.advanceTimersByTimeAsync(2000)
    expect(removeTabOrWindowMock).toHaveBeenCalledTimes(1)
  })

  it("rejects invalid temp-window fetch requests before opening any context", async () => {
    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleTempWindowFetch(
      {
        originUrl: "",
        fetchUrl: "",
        fetchOptions: { method: "GET" },
        requestId: "req-invalid",
      },
      sendResponse,
    )

    expect(createWindowMock).not.toHaveBeenCalled()
    expect(createTabMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "messages:background.invalidFetchRequest",
    })
  })

  it("rejects invalid turnstile requests before opening any context", async () => {
    const { handleTempWindowTurnstileFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleTempWindowTurnstileFetch(
      {
        originUrl: "https://example.com",
        pageUrl: "",
        fetchUrl: "",
        fetchOptions: { method: "POST" },
        requestId: "req-invalid-turnstile",
      },
      sendResponse,
    )

    expect(createWindowMock).not.toHaveBeenCalled()
    expect(createTabMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "messages:background.invalidFetchRequest",
      turnstile: {
        status: "error",
        hasTurnstile: false,
      },
    })
  })

  it("merges detected site type with user data from the temp context", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 508 })

    const { handleAutoDetectSite } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleAutoDetectSite(
      {
        url: "https://example.com/account",
        requestId: "req-auto-detect-success",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect(getSiteTypeMock).toHaveBeenCalledWith("https://example.com/account")
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        siteType: "new-api",
        userId: "user-1",
        user: "alice",
        accessToken: "access-token",
        siteTypeHint: "new-api",
      },
    })

    await vi.advanceTimersByTimeAsync(2500)
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(508)
  })

  it("returns a safe null result when site detection succeeds but no user data can be read", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 509 })
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentGetUserFromLocalStorage:
            return {
              success: false,
              error: "no-session",
            }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleAutoDetectSite } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleAutoDetectSite(
      {
        url: "https://example.com/account",
        requestId: "req-auto-detect-no-user",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: null,
    })

    await vi.advanceTimersByTimeAsync(2500)
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(509)
  })

  it("surfaces auto-detect failures when site-type detection throws", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 510 })
    getSiteTypeMock.mockRejectedValueOnce(new Error("site-type lookup failed"))

    const { handleAutoDetectSite } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleAutoDetectSite(
      {
        url: "https://example.com/account",
        requestId: "req-auto-detect-site-type-error",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "site-type lookup failed",
    })

    await vi.advanceTimersByTimeAsync(2500)
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(510)
  })

  it("returns a safe null auto-detect result when temp-context user data lookup throws", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 514 })
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentGetUserFromLocalStorage:
            throw new Error("local-storage unavailable")
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleAutoDetectSite } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleAutoDetectSite(
      {
        url: "https://example.com/account",
        requestId: "req-auto-detect-user-read-error",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: null,
    })

    await vi.advanceTimersByTimeAsync(2100)
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(514)
  })

  it("returns a failure response when rendered-title content never answers and still cleans up the temp context", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 511 })
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentGetRenderedTitle:
            return undefined
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowGetRenderedTitle } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowGetRenderedTitle(
      {
        originUrl: "https://example.com/rendered-title",
        requestId: "req-rendered-title-missing-response",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "No response from rendered title fetch",
    })

    await vi.advanceTimersByTimeAsync(2100)
    expect(removeTabOrWindowMock).toHaveBeenCalledTimes(1)
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(511)
  })

  it("keeps rendered-title fetches working when popup window minimization fails", async () => {
    tempContextMode = "window"
    createWindowMock.mockResolvedValueOnce({ id: 612 })
    tabsQueryMock.mockResolvedValueOnce([{ id: 613 }])
    ;(globalThis as any).browser.windows.update.mockRejectedValueOnce(
      new Error("minimize failed"),
    )

    const { handleTempWindowGetRenderedTitle } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowGetRenderedTitle(
      {
        originUrl: "https://example.com/rendered-title-minimize-failure",
        requestId: "req-rendered-title-minimize-failure",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect((globalThis as any).browser.windows.update).toHaveBeenCalledWith(
      612,
      {
        state: "minimized",
      },
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      title: "Example title",
    })

    await vi.advanceTimersByTimeAsync(2100)
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(612)
  })

  it("allows manual close while a rendered-title request is still in delayed-release state", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 512 })

    const { handleCloseTempWindow, handleTempWindowGetRenderedTitle } =
      await import("~/entrypoints/background/tempWindowPool")

    const titleResponse = vi.fn()
    const request = handleTempWindowGetRenderedTitle(
      {
        originUrl: "https://example.com/rendered-title",
        requestId: "req-rendered-title-close",
      },
      titleResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect(titleResponse).toHaveBeenCalledWith({
      success: true,
      title: "Example title",
    })

    const closeResponse = vi.fn()
    await handleCloseTempWindow(
      { requestId: "req-rendered-title-close" },
      closeResponse,
    )

    expect(closeResponse).toHaveBeenCalledWith({ success: true })

    await vi.advanceTimersByTimeAsync(2100)
    expect(removeTabOrWindowMock).toHaveBeenCalledTimes(1)
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(512)
  })

  it("returns a structured close failure when browser removal throws for an open temp window", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 5120 })

    const { handleCloseTempWindow, handleOpenTempWindow } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const openResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-close-error",
        url: "https://example.com/close-error",
      },
      openResponse,
    )

    expect(openResponse).toHaveBeenCalledWith({
      success: true,
      tabId: 5120,
    })

    removeTabOrWindowMock.mockRejectedValueOnce(new Error("close failed"))

    const closeResponse = vi.fn()
    await handleCloseTempWindow({ requestId: "req-close-error" }, closeResponse)

    expect(closeResponse).toHaveBeenCalledWith({
      success: false,
      error: "close failed",
    })
  })

  it("cleans up a pooled tab context when the browser removes the temp tab externally", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 513 })

    const {
      handleCloseTempWindow,
      handleTempWindowGetRenderedTitle,
      setupTempWindowListeners,
    } = await import("~/entrypoints/background/tempWindowPool")

    setupTempWindowListeners()

    const titleResponse = vi.fn()
    const request = handleTempWindowGetRenderedTitle(
      {
        originUrl: "https://example.com/rendered-title",
        requestId: "req-rendered-title-tab-removed",
      },
      titleResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect(titleResponse).toHaveBeenCalledWith({
      success: true,
      title: "Example title",
    })

    const onTabRemoved = onTabRemovedMock.mock.calls.at(0)?.[0]
    expect(onTabRemoved).toBeTypeOf("function")

    onTabRemoved?.(513)
    await vi.advanceTimersByTimeAsync(1)

    const closeResponse = vi.fn()
    await handleCloseTempWindow(
      { requestId: "req-rendered-title-tab-removed" },
      closeResponse,
    )

    expect(closeResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: "messages:background.windowNotFound",
      }),
    )

    await vi.advanceTimersByTimeAsync(2100)
    expect(removeTabOrWindowMock).not.toHaveBeenCalled()
  })

  it("cleans up a pooled popup context when the browser removes the temp window externally", async () => {
    tempContextMode = "window"
    createWindowMock.mockResolvedValueOnce({ id: 613 })
    tabsQueryMock.mockResolvedValueOnce([{ id: 614 }])

    const {
      handleCloseTempWindow,
      handleTempWindowGetRenderedTitle,
      setupTempWindowListeners,
    } = await import("~/entrypoints/background/tempWindowPool")

    setupTempWindowListeners()

    const titleResponse = vi.fn()
    const request = handleTempWindowGetRenderedTitle(
      {
        originUrl: "https://example.com/rendered-title-window",
        requestId: "req-rendered-title-window-removed",
      },
      titleResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request

    expect(titleResponse).toHaveBeenCalledWith({
      success: true,
      title: "Example title",
    })

    const onWindowRemoved = onWindowRemovedMock.mock.calls.at(0)?.[0]
    expect(onWindowRemoved).toBeTypeOf("function")

    onWindowRemoved?.(613)
    await vi.advanceTimersByTimeAsync(1)

    const closeResponse = vi.fn()
    await handleCloseTempWindow(
      { requestId: "req-rendered-title-window-removed" },
      closeResponse,
    )

    expect(closeResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: "messages:background.windowNotFound",
      }),
    )

    await vi.advanceTimersByTimeAsync(2100)
    expect(removeTabOrWindowMock).not.toHaveBeenCalled()
  })

  it("cleans up pooled tab contexts on background suspend without double-closing delayed releases", async () => {
    tempContextMode = "tab"
    createTabMock
      .mockResolvedValueOnce({ id: 615 })
      .mockResolvedValueOnce({ id: 616 })

    const { cleanupTempContextsOnSuspend, handleTempWindowFetch } =
      await import("~/entrypoints/background/tempWindowPool")

    const firstResponse = vi.fn()
    const firstRequest = handleTempWindowFetch(
      {
        originUrl: "https://example.com/suspend-one",
        fetchUrl: "https://example.com/api/suspend-one",
        fetchOptions: { method: "GET" },
        requestId: "req-suspend-tab-1",
      },
      firstResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await firstRequest

    expect(firstResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "ok",
      },
    })

    await cleanupTempContextsOnSuspend()

    expect(removeTabOrWindowMock).toHaveBeenCalledTimes(1)
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(615)

    await vi.advanceTimersByTimeAsync(2500)
    expect(removeTabOrWindowMock).toHaveBeenCalledTimes(1)

    const secondResponse = vi.fn()
    const secondRequest = handleTempWindowFetch(
      {
        originUrl: "https://example.com/suspend-two",
        fetchUrl: "https://example.com/api/suspend-two",
        fetchOptions: { method: "GET" },
        requestId: "req-suspend-tab-2",
      },
      secondResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await secondRequest

    expect(createTabMock).toHaveBeenCalledTimes(2)
    expect(createTabMock).toHaveBeenLastCalledWith(
      "https://example.com/suspend-two",
      false,
    )
    expect(secondResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "ok",
      },
    })
  })

  it("cleans up pooled popup contexts on background suspend and forces a fresh popup next time", async () => {
    tempContextMode = "window"
    createWindowMock
      .mockResolvedValueOnce({ id: 617 })
      .mockResolvedValueOnce({ id: 618 })
    tabsQueryMock
      .mockResolvedValueOnce([{ id: 619 }])
      .mockResolvedValueOnce([{ id: 620 }])

    const { cleanupTempContextsOnSuspend, handleTempWindowGetRenderedTitle } =
      await import("~/entrypoints/background/tempWindowPool")

    const firstResponse = vi.fn()
    const firstRequest = handleTempWindowGetRenderedTitle(
      {
        originUrl: "https://example.com/rendered-title-suspend",
        requestId: "req-suspend-window-1",
      },
      firstResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await firstRequest

    expect(firstResponse).toHaveBeenCalledWith({
      success: true,
      title: "Example title",
    })

    await cleanupTempContextsOnSuspend()

    expect(removeTabOrWindowMock).toHaveBeenCalledTimes(1)
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(617)

    await vi.advanceTimersByTimeAsync(2500)
    expect(removeTabOrWindowMock).toHaveBeenCalledTimes(1)

    const secondResponse = vi.fn()
    const secondRequest = handleTempWindowGetRenderedTitle(
      {
        originUrl: "https://example.com/rendered-title-suspend",
        requestId: "req-suspend-window-2",
      },
      secondResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await secondRequest

    expect(createWindowMock).toHaveBeenCalledTimes(2)
    expect(secondResponse).toHaveBeenCalledWith({
      success: true,
      title: "Example title",
    })
  })

  it("fails fast when the temp tab disappears before the page becomes ready", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 506 })
    tabsGetMock.mockRejectedValueOnce(new Error("tab disappeared"))

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/tab-disappeared",
        fetchOptions: { method: "GET" },
        requestId: "req-tab-disappeared",
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "tab disappeared",
      code: undefined,
    })
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(506)
    expect(sendMessageMock).not.toHaveBeenCalledWith(
      506,
      expect.objectContaining({
        action: RuntimeActionIds.ContentPerformTempWindowFetch,
      }),
    )
  })

  it("returns a page-load timeout when the temp context never finishes loading", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 507 })
    tabsGetMock.mockResolvedValue({ status: "loading" })

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/still-loading",
        fetchOptions: { method: "GET" },
        requestId: "req-loading-timeout",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(20_100)
    await request

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "messages:background.pageLoadTimeout",
      code: undefined,
    })
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(507)
    expect(sendMessageMock).not.toHaveBeenCalledWith(
      507,
      expect.objectContaining({
        action: RuntimeActionIds.ContentPerformTempWindowFetch,
      }),
    )
  })

  it("returns a failure response when the content script never answers the temp fetch", async () => {
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentPerformTempWindowFetch:
            return undefined
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )
    createWindowMock.mockRejectedValueOnce(
      new Error("Popup windows are not allowed on this runtime"),
    )
    createTabMock.mockResolvedValueOnce({ id: 505 })

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/no-response",
        fetchOptions: { method: "GET" },
        requestId: "req-no-response",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await request
    await vi.advanceTimersByTimeAsync(2500)

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "No response from temp window fetch",
    })
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(505)
  })

  it("waits for protection guards to pass before issuing the temp fetch", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 508 })

    let cloudflareAttempts = 0
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            cloudflareAttempts += 1
            return {
              success: true,
              passed: cloudflareAttempts >= 2,
            }
          case RuntimeActionIds.ContentPerformTempWindowFetch:
            return {
              success: true,
              data: {
                success: true,
                message: "",
                data: "guard-cleared",
              },
            }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/guard-wait",
        fetchOptions: { method: "GET" },
        requestId: "req-guard-wait",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(400)
    expect(sendMessageMock).not.toHaveBeenCalledWith(
      508,
      expect.objectContaining({
        action: RuntimeActionIds.ContentPerformTempWindowFetch,
      }),
    )

    await vi.advanceTimersByTimeAsync(700)
    await request

    const fetchCalls = sendMessageMock.mock.calls.filter(
      ([, message]) =>
        message.action === RuntimeActionIds.ContentPerformTempWindowFetch,
    )
    expect(fetchCalls).toHaveLength(1)
    expect(cloudflareAttempts).toBeGreaterThanOrEqual(2)
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "guard-cleared",
      },
    })
  })

  it("retries after a transient guard-check messaging failure instead of failing the temp fetch", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 509 })

    let capAttempts = 0
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
            capAttempts += 1
            if (capAttempts === 1) {
              throw new Error("content script not ready")
            }
            return { success: true, passed: true }
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentPerformTempWindowFetch:
            return {
              success: true,
              data: {
                success: true,
                message: "",
                data: "guard-recovered",
              },
            }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/guard-retry",
        fetchOptions: { method: "GET" },
        requestId: "req-guard-retry",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(1200)
    await request

    expect(capAttempts).toBeGreaterThanOrEqual(2)
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "guard-recovered",
      },
    })
    expect(removeTabOrWindowMock).not.toHaveBeenCalledWith(509)
  })

  it("reuses a live same-origin tab context before delayed release and recreates it after idle cleanup", async () => {
    tempContextMode = "tab"
    createTabMock
      .mockResolvedValueOnce({ id: 606 })
      .mockResolvedValueOnce({ id: 607 })

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const firstResponse = vi.fn()
    const firstRequest = handleTempWindowFetch(
      {
        originUrl: "https://example.com/a",
        fetchUrl: "https://example.com/api/first",
        fetchOptions: { method: "GET" },
        requestId: "req-reuse-1",
      },
      firstResponse,
    )
    await vi.advanceTimersByTimeAsync(500)
    await firstRequest

    const secondResponse = vi.fn()
    const secondRequest = handleTempWindowFetch(
      {
        originUrl: "https://example.com/b",
        fetchUrl: "https://example.com/api/second",
        fetchOptions: { method: "GET" },
        requestId: "req-reuse-2",
      },
      secondResponse,
    )
    await vi.advanceTimersByTimeAsync(500)
    await secondRequest

    expect(createTabMock).toHaveBeenCalledTimes(1)
    const fetchCallsBeforeCleanup = sendMessageMock.mock.calls.filter(
      ([, message]) =>
        message.action === RuntimeActionIds.ContentPerformTempWindowFetch,
    )
    expect(fetchCallsBeforeCleanup).toHaveLength(2)

    await vi.advanceTimersByTimeAsync(2500)
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(606)

    const thirdResponse = vi.fn()
    const thirdRequest = handleTempWindowFetch(
      {
        originUrl: "https://example.com/c",
        fetchUrl: "https://example.com/api/third",
        fetchOptions: { method: "GET" },
        requestId: "req-reuse-3",
      },
      thirdResponse,
    )
    await vi.advanceTimersByTimeAsync(500)
    await thirdRequest

    expect(createTabMock).toHaveBeenCalledTimes(2)
    expect(createTabMock).toHaveBeenLastCalledWith(
      "https://example.com/c",
      false,
    )
  })

  it("defers same-origin cleanup while a reused temp tab is still busy", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 608 })

    const secondFetchDeferred = createDeferred<{
      success: boolean
      data: {
        success: boolean
        message: string
        data: string
      }
    }>()
    let fetchAttempt = 0
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentGetRenderedTitle:
            return { success: true, title: "Example title" }
          case RuntimeActionIds.ContentGetUserFromLocalStorage:
            return {
              success: true,
              data: {
                userId: "user-1",
                user: "alice",
                accessToken: "access-token",
                siteTypeHint: "new-api",
              },
            }
          case RuntimeActionIds.ContentPerformTempWindowFetch:
            fetchAttempt += 1
            if (fetchAttempt === 1) {
              return {
                success: true,
                data: {
                  success: true,
                  message: "",
                  data: "first-result",
                },
              }
            }

            return secondFetchDeferred.promise
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const firstResponse = vi.fn()
    const firstRequest = handleTempWindowFetch(
      {
        originUrl: "https://example.com/one",
        fetchUrl: "https://example.com/api/one",
        fetchOptions: { method: "GET" },
        requestId: "req-overlap-1",
      },
      firstResponse,
    )
    await vi.advanceTimersByTimeAsync(500)
    await firstRequest

    const secondResponse = vi.fn()
    const secondRequest = handleTempWindowFetch(
      {
        originUrl: "https://example.com/two",
        fetchUrl: "https://example.com/api/two",
        fetchOptions: { method: "GET" },
        requestId: "req-overlap-2",
      },
      secondResponse,
    )
    await vi.advanceTimersByTimeAsync(1000)

    expect(createTabMock).toHaveBeenCalledTimes(1)
    expect(fetchAttempt).toBe(2)
    expect(secondResponse).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1500)
    expect(removeTabOrWindowMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5000)
    expect(removeTabOrWindowMock).not.toHaveBeenCalled()

    secondFetchDeferred.resolve({
      success: true,
      data: {
        success: true,
        message: "",
        data: "second-result",
      },
    })
    await secondRequest

    await vi.advanceTimersByTimeAsync(2500)
    expect(removeTabOrWindowMock).toHaveBeenCalledTimes(1)
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(608)
    expect(secondResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "second-result",
      },
    })
  })

  it("force-closing one shared temp tab clears the other request mapping and requires a fresh context next time", async () => {
    tempContextMode = "tab"
    createTabMock
      .mockResolvedValueOnce({ id: 650 })
      .mockResolvedValueOnce({ id: 651 })

    const firstFetchDeferred = createDeferred<{
      success: boolean
      data: {
        success: boolean
        message: string
        data: string
      }
    }>()
    const secondFetchDeferred = createDeferred<{
      success: boolean
      data: {
        success: boolean
        message: string
        data: string
      }
    }>()
    let fetchAttempt = 0
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentPerformTempWindowFetch:
            fetchAttempt += 1
            if (fetchAttempt === 1) {
              return firstFetchDeferred.promise
            }

            if (fetchAttempt === 2) {
              return secondFetchDeferred.promise
            }

            if (fetchAttempt === 3) {
              return {
                success: true,
                data: {
                  success: true,
                  message: "",
                  data: `result-${fetchAttempt}`,
                },
              }
            }

            return secondFetchDeferred.promise
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleCloseTempWindow, handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const firstResponse = vi.fn()
    const firstRequest = handleTempWindowFetch(
      {
        originUrl: "https://example.com/force-close-one",
        fetchUrl: "https://example.com/api/force-close-one",
        fetchOptions: { method: "GET" },
        requestId: "req-force-close-1",
      },
      firstResponse,
    )
    await vi.advanceTimersByTimeAsync(500)

    const secondResponse = vi.fn()
    const secondRequest = handleTempWindowFetch(
      {
        originUrl: "https://example.com/force-close-two",
        fetchUrl: "https://example.com/api/force-close-two",
        fetchOptions: { method: "GET" },
        requestId: "req-force-close-2",
      },
      secondResponse,
    )
    await vi.advanceTimersByTimeAsync(500)

    expect(createTabMock).toHaveBeenCalledTimes(1)
    expect(secondResponse).not.toHaveBeenCalled()

    const closeResponse = vi.fn()
    await handleCloseTempWindow(
      { requestId: "req-force-close-1" },
      closeResponse,
    )

    expect(closeResponse).toHaveBeenCalledWith({ success: true })

    await vi.advanceTimersByTimeAsync(2000)
    expect(removeTabOrWindowMock).toHaveBeenCalledTimes(1)
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(650)

    const otherCloseResponse = vi.fn()
    await handleCloseTempWindow(
      { requestId: "req-force-close-2" },
      otherCloseResponse,
    )

    expect(otherCloseResponse).toHaveBeenCalledWith({
      success: false,
      error: "messages:background.windowNotFound",
    })

    firstFetchDeferred.reject(new Error("shared temp tab was force-closed"))
    secondFetchDeferred.reject(new Error("shared temp tab was force-closed"))
    await Promise.all([firstRequest, secondRequest])

    expect(firstResponse).toHaveBeenCalledWith({
      success: false,
      error: "shared temp tab was force-closed",
      code: undefined,
    })
    expect(secondResponse).toHaveBeenCalledWith({
      success: false,
      error: "shared temp tab was force-closed",
      code: undefined,
    })

    await vi.advanceTimersByTimeAsync(2000)
    expect(removeTabOrWindowMock).toHaveBeenCalledTimes(1)

    const thirdResponse = vi.fn()
    const thirdRequest = handleTempWindowFetch(
      {
        originUrl: "https://example.com/force-close-three",
        fetchUrl: "https://example.com/api/force-close-three",
        fetchOptions: { method: "GET" },
        requestId: "req-force-close-3",
      },
      thirdResponse,
    )
    await vi.advanceTimersByTimeAsync(500)
    await thirdRequest

    expect(createTabMock).toHaveBeenCalledTimes(2)
    expect(createTabMock).toHaveBeenLastCalledWith(
      "https://example.com/force-close-three",
      false,
    )
    expect(thirdResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "result-3",
      },
    })
  })

  it("drops a stale pooled context and creates a fresh tab for the next same-origin fetch", async () => {
    tempContextMode = "tab"
    createTabMock
      .mockResolvedValueOnce({ id: 708 })
      .mockResolvedValueOnce({ id: 709 })

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const firstResponse = vi.fn()
    const firstRequest = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/first",
        fetchOptions: { method: "GET" },
        requestId: "req-stale-1",
      },
      firstResponse,
    )
    await vi.advanceTimersByTimeAsync(500)
    await firstRequest

    tabsGetMock.mockRejectedValueOnce(new Error("tab missing"))

    const secondResponse = vi.fn()
    const secondRequest = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/second",
        fetchOptions: { method: "GET" },
        requestId: "req-stale-2",
      },
      secondResponse,
    )
    await vi.advanceTimersByTimeAsync(500)
    await secondRequest

    expect(createTabMock).toHaveBeenCalledTimes(2)
    expect(removeTabOrWindowMock).not.toHaveBeenCalledWith(708)
    const fetchCalls = sendMessageMock.mock.calls.filter(
      ([, message]) =>
        message.action === RuntimeActionIds.ContentPerformTempWindowFetch,
    )
    expect(fetchCalls.at(-1)?.[0]).toBe(709)
  })

  it("injects a WAF cookie rule for token-auth temp fetches and removes it afterward", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 606 })
    getCookieHeaderForUrlMock.mockResolvedValueOnce("cf_clearance=1")
    applyTempWindowCookieRuleMock.mockResolvedValueOnce(1_000_606)

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/token-auth",
        fetchOptions: {
          method: "GET",
          credentials: "omit",
        },
        authType: AuthTypeEnum.AccessToken,
        requestId: "req-token-auth",
      },
      sendResponse,
    )
    await vi.advanceTimersByTimeAsync(1000)
    await request

    const fetchCall = sendMessageMock.mock.calls.find(
      ([, message]) =>
        message.action === RuntimeActionIds.ContentPerformTempWindowFetch,
    )

    expect(getCookieHeaderForUrlMock).toHaveBeenCalledWith(
      "https://example.com/api/token-auth",
      {
        includeSession: false,
      },
    )
    expect(applyTempWindowCookieRuleMock).toHaveBeenCalledWith({
      tabId: 606,
      url: "https://example.com/api/token-auth",
      cookieHeader: "cf_clearance=1",
    })
    expect(fetchCall?.[1].fetchOptions).toEqual(
      expect.objectContaining({
        credentials: "include",
      }),
    )
    expect(removeTempWindowCookieRuleMock).toHaveBeenCalledWith(1_000_606)
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "ok",
      },
    })
  })

  it("keeps token-auth fetch credentials omitted when the WAF cookie rule cannot be installed", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 607 })
    getCookieHeaderForUrlMock.mockResolvedValueOnce("cf_clearance=1")
    applyTempWindowCookieRuleMock.mockResolvedValueOnce(null)

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/token-auth-no-rule",
        fetchOptions: {
          method: "GET",
          credentials: "omit",
        },
        authType: AuthTypeEnum.AccessToken,
        requestId: "req-token-auth-no-rule",
      },
      sendResponse,
    )
    await vi.advanceTimersByTimeAsync(1000)
    await request

    const fetchCall = sendMessageMock.mock.calls.find(
      ([, message]) =>
        message.action === RuntimeActionIds.ContentPerformTempWindowFetch,
    )

    expect(getCookieHeaderForUrlMock).toHaveBeenCalledWith(
      "https://example.com/api/token-auth-no-rule",
      {
        includeSession: false,
      },
    )
    expect(applyTempWindowCookieRuleMock).toHaveBeenCalledWith({
      tabId: 607,
      url: "https://example.com/api/token-auth-no-rule",
      cookieHeader: "cf_clearance=1",
    })
    expect(fetchCall?.[1].fetchOptions).toEqual(
      expect.objectContaining({
        credentials: "omit",
      }),
    )
    expect(removeTempWindowCookieRuleMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "ok",
      },
    })
  })

  it("keeps token-auth fetch credentials omitted when no WAF cookie header is available", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 608 })
    getCookieHeaderForUrlMock.mockResolvedValueOnce("")

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/token-auth-no-cookie-header",
        fetchOptions: {
          method: "GET",
          credentials: "omit",
        },
        authType: AuthTypeEnum.AccessToken,
        requestId: "req-token-auth-no-cookie-header",
      },
      sendResponse,
    )
    await vi.advanceTimersByTimeAsync(1000)
    await request

    const fetchCall = sendMessageMock.mock.calls.find(
      ([, message]) =>
        message.action === RuntimeActionIds.ContentPerformTempWindowFetch,
    )

    expect(getCookieHeaderForUrlMock).toHaveBeenCalledWith(
      "https://example.com/api/token-auth-no-cookie-header",
      {
        includeSession: false,
      },
    )
    expect(applyTempWindowCookieRuleMock).not.toHaveBeenCalled()
    expect(fetchCall?.[1].fetchOptions).toEqual(
      expect.objectContaining({
        credentials: "omit",
      }),
    )
    expect(removeTempWindowCookieRuleMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "ok",
      },
    })
  })

  it("injects merged WAF and session cookies for Chromium cookie-auth fetches", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 707 })
    getCookieHeaderForUrlMock.mockResolvedValueOnce("cf_clearance=1")
    applyTempWindowCookieRuleMock.mockResolvedValueOnce(1_000_707)

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/cookie-auth",
        fetchOptions: {
          method: "GET",
        },
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "session=abc",
        requestId: "req-cookie-auth",
      },
      sendResponse,
    )
    await vi.advanceTimersByTimeAsync(500)
    await request

    const fetchCall = sendMessageMock.mock.calls.find(
      ([, message]) =>
        message.action === RuntimeActionIds.ContentPerformTempWindowFetch,
    )

    expect(applyTempWindowCookieRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: 707,
        url: "https://example.com/api/cookie-auth",
        cookieHeader: expect.stringContaining("cf_clearance=1"),
      }),
    )
    expect(applyTempWindowCookieRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cookieHeader: expect.stringContaining("session=abc"),
      }),
    )
    expect(fetchCall?.[1].fetchOptions).toEqual(
      expect.objectContaining({
        credentials: "include",
      }),
    )
    expect(removeTempWindowCookieRuleMock).toHaveBeenCalledWith(1_000_707)
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "ok",
      },
    })
  })

  it("falls back to the stored account session cookie for Chromium cookie-auth fetches", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 708 })
    getAccountByIdMock.mockResolvedValueOnce({
      cookieAuth: {
        sessionCookie: "session=from-storage",
      },
    })
    getCookieHeaderForUrlMock.mockResolvedValueOnce("cf_clearance=1")
    applyTempWindowCookieRuleMock.mockResolvedValueOnce(1_000_708)

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/cookie-auth-stored-session",
        fetchOptions: {
          method: "GET",
        },
        authType: AuthTypeEnum.Cookie,
        accountId: "account-1",
        requestId: "req-cookie-auth-stored-session",
      },
      sendResponse,
    )
    await vi.advanceTimersByTimeAsync(500)
    await request

    const fetchCall = sendMessageMock.mock.calls.find(
      ([, message]) =>
        message.action === RuntimeActionIds.ContentPerformTempWindowFetch,
    )

    expect(getAccountByIdMock).toHaveBeenCalledWith("account-1")
    expect(applyTempWindowCookieRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: 708,
        url: "https://example.com/api/cookie-auth-stored-session",
        cookieHeader: expect.stringContaining("cf_clearance=1"),
      }),
    )
    expect(applyTempWindowCookieRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cookieHeader: expect.stringContaining("session=from-storage"),
      }),
    )
    expect(fetchCall?.[1].fetchOptions).toEqual(
      expect.objectContaining({
        credentials: "include",
      }),
    )
    expect(removeTempWindowCookieRuleMock).toHaveBeenCalledWith(1_000_708)
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "ok",
      },
    })
  })

  it("does not inject cookie-auth overrides when the stored account has no usable session cookie", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 709 })
    getAccountByIdMock.mockResolvedValueOnce({
      cookieAuth: {
        sessionCookie: "   ",
      },
    })

    const { handleTempWindowFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowFetch(
      {
        originUrl: "https://example.com",
        fetchUrl: "https://example.com/api/cookie-auth-no-session",
        fetchOptions: {
          method: "GET",
        },
        authType: AuthTypeEnum.Cookie,
        accountId: "account-no-session",
        requestId: "req-cookie-auth-no-session",
      },
      sendResponse,
    )
    await vi.advanceTimersByTimeAsync(500)
    await request

    const fetchCall = sendMessageMock.mock.calls.find(
      ([, message]) =>
        message.action === RuntimeActionIds.ContentPerformTempWindowFetch,
    )

    expect(getAccountByIdMock).toHaveBeenCalledWith("account-no-session")
    expect(getCookieHeaderForUrlMock).not.toHaveBeenCalledWith(
      "https://example.com/api/cookie-auth-no-session",
      {
        includeSession: false,
      },
    )
    expect(applyTempWindowCookieRuleMock).not.toHaveBeenCalled()
    expect(fetchCall?.[1].fetchOptions).toEqual(
      expect.objectContaining({
        method: "GET",
      }),
    )
    expect(fetchCall?.[1].fetchOptions).not.toEqual(
      expect.objectContaining({
        credentials: "include",
      }),
    )
    expect(removeTempWindowCookieRuleMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "ok",
      },
    })
  })

  it("adds Firefox auth headers during turnstile fetches without using DNR cookie rules", async () => {
    tempContextMode = "tab"
    isProtectionBypassFirefoxEnvMock.mockReturnValue(true)
    createTabMock.mockResolvedValueOnce({ id: 808 })
    vi.useRealTimers()
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentWaitForTurnstileToken:
            return {
              success: true,
              status: "token_obtained",
              token: " token-123 ",
              detection: {
                hasTurnstile: true,
              },
            }
          case RuntimeActionIds.ContentPerformTempWindowFetch:
            return {
              success: true,
              data: {
                success: true,
                message: "",
                data: "ok",
              },
            }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowTurnstileFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleTempWindowTurnstileFetch(
      {
        originUrl: "https://example.com",
        pageUrl: "https://example.com/checkin",
        fetchUrl: "https://example.com/api/checkin",
        fetchOptions: {
          method: "POST",
        },
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "session=abc",
        requestId: "req-turnstile-firefox",
        turnstileParamName: "cf-turnstile-response",
      },
      sendResponse,
    )

    const fetchCall = sendMessageMock.mock.calls.find(
      ([, message]) =>
        message.action === RuntimeActionIds.ContentPerformTempWindowFetch,
    )

    expect(fetchCall?.[1].fetchUrl).toContain("cf-turnstile-response=token-123")
    expect(addAuthMethodHeaderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        [COOKIE_SESSION_OVERRIDE_HEADER_NAME.toLowerCase()]: "session=abc",
      }),
      AUTH_MODE.COOKIE_AUTH_MODE,
    )
    expect(fetchCall?.[1].fetchOptions).toEqual(
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({
          [COOKIE_SESSION_OVERRIDE_HEADER_NAME.toLowerCase()]: "session=abc",
          "X-Auth-Mode": AUTH_MODE.COOKIE_AUTH_MODE,
        }),
      }),
    )
    expect(applyTempWindowCookieRuleMock).not.toHaveBeenCalled()
    expect(removeTempWindowCookieRuleMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "ok",
      },
      turnstile: {
        status: "token_obtained",
        hasTurnstile: true,
      },
    })
  })

  it("adds Firefox token-auth headers during turnstile fetches without cookie overrides", async () => {
    tempContextMode = "tab"
    isProtectionBypassFirefoxEnvMock.mockReturnValue(true)
    createTabMock.mockResolvedValueOnce({ id: 811 })
    vi.useRealTimers()
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentWaitForTurnstileToken:
            return {
              success: true,
              status: "token_obtained",
              token: "token-xyz",
              detection: {
                hasTurnstile: true,
              },
            }
          case RuntimeActionIds.ContentPerformTempWindowFetch:
            return {
              success: true,
              data: {
                success: true,
                message: "",
                data: "ok",
              },
            }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowTurnstileFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleTempWindowTurnstileFetch(
      {
        originUrl: "https://example.com",
        pageUrl: "https://example.com/checkin",
        fetchUrl: "https://example.com/api/token-checkin",
        fetchOptions: {
          method: "POST",
          credentials: "omit",
        },
        authType: AuthTypeEnum.AccessToken,
        requestId: "req-turnstile-firefox-token-auth",
      },
      sendResponse,
    )

    const fetchCall = sendMessageMock.mock.calls.find(
      ([, message]) =>
        message.action === RuntimeActionIds.ContentPerformTempWindowFetch,
    )

    expect(addAuthMethodHeaderMock).toHaveBeenCalledWith(
      {},
      AUTH_MODE.TOKEN_AUTH_MODE,
    )
    expect(fetchCall?.[1].fetchOptions).toEqual(
      expect.objectContaining({
        credentials: "omit",
        headers: expect.objectContaining({
          "X-Auth-Mode": AUTH_MODE.TOKEN_AUTH_MODE,
        }),
      }),
    )
    expect(fetchCall?.[1].fetchOptions.headers).not.toEqual(
      expect.objectContaining({
        [COOKIE_SESSION_OVERRIDE_HEADER_NAME.toLowerCase()]: expect.any(String),
      }),
    )
    expect(applyTempWindowCookieRuleMock).not.toHaveBeenCalled()
    expect(removeTempWindowCookieRuleMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "ok",
      },
      turnstile: {
        status: "token_obtained",
        hasTurnstile: true,
      },
    })
  })

  it("defaults to Firefox cookie-auth mode headers when turnstile fetches have no explicit auth hints", async () => {
    tempContextMode = "tab"
    isProtectionBypassFirefoxEnvMock.mockReturnValue(true)
    createTabMock.mockResolvedValueOnce({ id: 812 })
    vi.useRealTimers()
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentWaitForTurnstileToken:
            return {
              success: true,
              status: "token_obtained",
              token: "token-cookie-default",
              detection: {
                hasTurnstile: true,
              },
            }
          case RuntimeActionIds.ContentPerformTempWindowFetch:
            return {
              success: true,
              data: {
                success: true,
                message: "",
                data: "ok",
              },
            }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowTurnstileFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleTempWindowTurnstileFetch(
      {
        originUrl: "https://example.com",
        pageUrl: "https://example.com/checkin",
        fetchUrl: "https://example.com/api/default-cookie-mode",
        fetchOptions: {
          method: "POST",
        },
        requestId: "req-turnstile-firefox-default-cookie-mode",
      },
      sendResponse,
    )

    const fetchCall = sendMessageMock.mock.calls.find(
      ([, message]) =>
        message.action === RuntimeActionIds.ContentPerformTempWindowFetch,
    )

    expect(addAuthMethodHeaderMock).toHaveBeenCalledWith(
      {},
      AUTH_MODE.COOKIE_AUTH_MODE,
    )
    expect(fetchCall?.[1].fetchOptions).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Auth-Mode": AUTH_MODE.COOKIE_AUTH_MODE,
        }),
      }),
    )
    expect(fetchCall?.[1].fetchOptions.headers).not.toEqual(
      expect.objectContaining({
        [COOKIE_SESSION_OVERRIDE_HEADER_NAME.toLowerCase()]: expect.any(String),
      }),
    )
    expect(applyTempWindowCookieRuleMock).not.toHaveBeenCalled()
    expect(removeTempWindowCookieRuleMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        success: true,
        message: "",
        data: "ok",
      },
      turnstile: {
        status: "token_obtained",
        hasTurnstile: true,
      },
    })
  })

  it("returns structured turnstile timeout metadata when no token becomes available", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 809 })
    vi.useRealTimers()
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentWaitForTurnstileToken:
            return {
              success: true,
              status: "timeout",
              detection: {
                hasTurnstile: true,
              },
            }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowTurnstileFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowTurnstileFetch(
      {
        originUrl: "https://example.com",
        pageUrl: "https://example.com/checkin",
        fetchUrl: "https://example.com/api/checkin",
        fetchOptions: {
          method: "POST",
        },
        requestId: "req-turnstile-timeout",
      },
      sendResponse,
    )

    await request

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Turnstile token not available",
      turnstile: {
        status: "timeout",
        hasTurnstile: true,
      },
    })
    expect(sendMessageMock).not.toHaveBeenCalledWith(
      809,
      expect.objectContaining({
        action: RuntimeActionIds.ContentPerformTempWindowFetch,
      }),
    )
    await new Promise((resolve) => setTimeout(resolve, 2500))
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(809)
    expect(removeTempWindowCookieRuleMock).not.toHaveBeenCalled()
  })

  it("surfaces a missing post-turnstile fetch response and still cleans up cookie rules", async () => {
    tempContextMode = "tab"
    createTabMock.mockResolvedValueOnce({ id: 810 })
    getCookieHeaderForUrlMock.mockResolvedValueOnce("cf_clearance=1")
    applyTempWindowCookieRuleMock.mockResolvedValueOnce(1_000_810)
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentWaitForTurnstileToken:
            return {
              success: true,
              status: "token_obtained",
              token: "token-xyz",
              detection: {
                hasTurnstile: true,
              },
            }
          case RuntimeActionIds.ContentPerformTempWindowFetch:
            return undefined
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowTurnstileFetch } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowTurnstileFetch(
      {
        originUrl: "https://example.com",
        pageUrl: "https://example.com/checkin",
        fetchUrl: "https://example.com/api/checkin",
        fetchOptions: {
          method: "POST",
          credentials: "omit",
        },
        authType: AuthTypeEnum.AccessToken,
        requestId: "req-turnstile-no-fetch-response",
      },
      sendResponse,
    )

    await vi.advanceTimersByTimeAsync(1000)
    await request
    await vi.advanceTimersByTimeAsync(2500)

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "No response from temp window fetch",
      code: undefined,
      turnstile: {
        status: "token_obtained",
        hasTurnstile: true,
      },
    })
    expect(applyTempWindowCookieRuleMock).toHaveBeenCalledWith({
      tabId: 810,
      url: "https://example.com/api/checkin?turnstile=token-xyz",
      cookieHeader: "cf_clearance=1",
    })
    expect(removeTempWindowCookieRuleMock).toHaveBeenCalledWith(1_000_810)
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(810)
  })
})
