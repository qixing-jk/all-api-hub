import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import * as permissionManager from "~/services/permissions/permissionManager"
import {
  addAuthMethodHeader,
  addExtensionHeader,
  AUTH_MODE,
  checkCookieInterceptorRequirement,
  COOKIE_AUTH_HEADER_NAME,
  COOKIE_SESSION_OVERRIDE_HEADER_NAME,
  EXTENSION_HEADER_NAME,
  EXTENSION_HEADER_VALUE,
  registerWebRequestInterceptor,
  setupWebRequestInterceptor,
} from "~/utils/browser/cookieHelper"
import * as protectionBypass from "~/utils/browser/protectionBypass"

describe("cookieHelper interceptor-related behavior", () => {
  const originalBrowser = (globalThis as any).browser
  let addListenerMock: ReturnType<typeof vi.fn>
  let removeListenerMock: ReturnType<typeof vi.fn>
  let registeredListener:
    | ((
        details: browser.webRequest._OnBeforeSendHeadersDetails,
      ) => Promise<any>)
    | undefined

  beforeEach(() => {
    addListenerMock = vi.fn((listener) => {
      registeredListener = listener
    })
    removeListenerMock = vi.fn()
    registeredListener = undefined
    ;(globalThis as any).browser = {
      cookies: {
        getAll: vi.fn().mockResolvedValue([]),
      },
      webRequest: {
        onBeforeSendHeaders: {
          addListener: addListenerMock,
          removeListener: removeListenerMock,
        },
      },
    }
  })

  afterEach(() => {
    ;(globalThis as any).browser = originalBrowser
    vi.restoreAllMocks()
  })

  it("checks interceptor permissions only in Firefox mode", async () => {
    const firefoxSpy = vi
      .spyOn(protectionBypass, "isProtectionBypassFirefoxEnv")
      .mockReturnValue(false)
    const permissionSpy = vi.spyOn(
      permissionManager,
      "hasCookieInterceptorPermissions",
    )

    await expect(checkCookieInterceptorRequirement()).resolves.toBe(false)
    expect(permissionSpy).not.toHaveBeenCalled()

    firefoxSpy.mockReturnValue(true)
    permissionSpy.mockResolvedValueOnce(false)

    await expect(checkCookieInterceptorRequirement()).resolves.toBe(false)
    expect(permissionSpy).toHaveBeenCalledTimes(1)

    permissionSpy.mockResolvedValueOnce(true)
    await expect(checkCookieInterceptorRequirement()).resolves.toBe(true)
  })

  it("adds extension and auth-mode headers only when supported", async () => {
    vi.spyOn(protectionBypass, "isProtectionBypassFirefoxEnv").mockReturnValue(
      false,
    )

    expect(addExtensionHeader({ existing: "value" })).toEqual({
      existing: "value",
    })

    vi.spyOn(protectionBypass, "isProtectionBypassFirefoxEnv").mockReturnValue(
      true,
    )
    vi.spyOn(
      permissionManager,
      "hasCookieInterceptorPermissions",
    ).mockResolvedValue(true)

    expect(
      addExtensionHeader([
        ["Accept", "application/json"],
        ["X-Trace", "1"],
      ]),
    ).toEqual({
      Accept: "application/json",
      "X-Trace": "1",
      [EXTENSION_HEADER_NAME]: EXTENSION_HEADER_VALUE,
    })

    await expect(
      addAuthMethodHeader(
        new Headers({ Accept: "application/json" }),
        AUTH_MODE.TOKEN_AUTH_MODE,
      ),
    ).resolves.toEqual({
      accept: "application/json",
      [COOKIE_AUTH_HEADER_NAME]: AUTH_MODE.TOKEN_AUTH_MODE,
    })

    vi.spyOn(
      permissionManager,
      "hasCookieInterceptorPermissions",
    ).mockResolvedValueOnce(false)

    await expect(
      addAuthMethodHeader(
        { Accept: "application/json" },
        AUTH_MODE.COOKIE_AUTH_MODE,
      ),
    ).resolves.toEqual({
      Accept: "application/json",
    })
  })

  it("registers and refreshes the Firefox webRequest interceptor", () => {
    vi.spyOn(protectionBypass, "isProtectionBypassFirefoxEnv").mockReturnValue(
      true,
    )

    registerWebRequestInterceptor(["https://example.com/*"])
    expect(addListenerMock).toHaveBeenCalledWith(
      expect.any(Function),
      { urls: ["https://example.com/*"] },
      ["blocking", "requestHeaders"],
    )

    registerWebRequestInterceptor(["https://example.com/*"])
    expect(removeListenerMock).toHaveBeenCalledTimes(1)

    registerWebRequestInterceptor([])
    expect(addListenerMock).toHaveBeenCalledTimes(2)

    vi.spyOn(protectionBypass, "isProtectionBypassFirefoxEnv").mockReturnValue(
      false,
    )
    setupWebRequestInterceptor(["https://example.com/*"])
    expect(addListenerMock).toHaveBeenCalledTimes(2)
  })

  it("ignores non-extension requests in the registered webRequest handler", async () => {
    vi.spyOn(protectionBypass, "isProtectionBypassFirefoxEnv").mockReturnValue(
      true,
    )

    registerWebRequestInterceptor(["https://example.com/*"])
    expect(registeredListener).toBeTypeOf("function")

    await expect(
      registeredListener!({
        url: "https://example.com",
        requestHeaders: [{ name: "Accept", value: "application/json" }],
      } as any),
    ).resolves.toEqual({})
  })

  it("replaces cookie headers and merges session overrides for extension-tagged requests", async () => {
    vi.spyOn(protectionBypass, "isProtectionBypassFirefoxEnv").mockReturnValue(
      true,
    )
    ;(globalThis as any).browser.cookies.getAll = vi.fn().mockResolvedValue([
      { name: "session", value: "browser-session" },
      { name: "cf_clearance", value: "clearance" },
    ])

    registerWebRequestInterceptor(["https://example.com/*"])
    expect(registeredListener).toBeTypeOf("function")

    const result = await registeredListener!({
      url: "https://example.com",
      requestHeaders: [
        { name: EXTENSION_HEADER_NAME, value: EXTENSION_HEADER_VALUE },
        { name: COOKIE_AUTH_HEADER_NAME, value: AUTH_MODE.COOKIE_AUTH_MODE },
        {
          name: COOKIE_SESSION_OVERRIDE_HEADER_NAME,
          value: "session=override-session; token=abc",
        },
        { name: "Cookie", value: "old=value" },
        { name: "Accept", value: "application/json" },
      ],
    } as any)

    expect(result.requestHeaders).toEqual(
      expect.arrayContaining([
        {
          name: "Cookie",
          value: "cf_clearance=clearance; session=override-session; token=abc",
        },
        { name: "Accept", value: "application/json" },
      ]),
    )
    expect(
      result.requestHeaders.some(
        (header: any) =>
          header.name === EXTENSION_HEADER_NAME ||
          header.name === COOKIE_AUTH_HEADER_NAME ||
          header.name === COOKIE_SESSION_OVERRIDE_HEADER_NAME,
      ),
    ).toBe(false)
  })

  it("adds a new cookie header when no Cookie header exists and session cookies are excluded", async () => {
    vi.spyOn(protectionBypass, "isProtectionBypassFirefoxEnv").mockReturnValue(
      true,
    )
    ;(globalThis as any).browser.cookies.getAll = vi.fn().mockResolvedValue([
      { name: "session", value: "browser-session" },
      { name: "cf_clearance", value: "clearance" },
    ])

    registerWebRequestInterceptor(["https://example.com/*"])

    const result = await registeredListener!({
      url: "https://example.com",
      requestHeaders: [
        { name: EXTENSION_HEADER_NAME, value: EXTENSION_HEADER_VALUE },
        { name: COOKIE_AUTH_HEADER_NAME, value: AUTH_MODE.TOKEN_AUTH_MODE },
        { name: "Accept", value: "application/json" },
      ],
    } as any)

    expect(result.requestHeaders).toEqual(
      expect.arrayContaining([
        { name: "Cookie", value: "cf_clearance=clearance" },
        { name: "Accept", value: "application/json" },
      ]),
    )
  })
})
