import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ACCOUNT_COOKIE_VALIDATION_REASONS,
  ACCOUNT_COOKIE_VALIDATION_STATUS,
} from "~/constants/accountCookieValidation"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { handlePerformTempWindowFetch } from "~/entrypoints/content/messageHandlers/handlers/tempWindowFetch"
import { validateAccountCookie } from "~/services/accounts/cookieValidation"
import type { AccountCookieValidationTarget } from "~/services/apiAdapters/contracts/accountLogin"
import { executeTempWindowFetch } from "~/services/browsingContext/tempPage/fetchTasks"
import { tempWindowBackgroundRuntime } from "~/services/browsingContext/tempPage/runtime"
import { registerWebRequestInterceptor } from "~/utils/browser/cookieHelper"
import * as runtimeMessages from "~/utils/browser/runtimeMessages"
import { isolateWebLocks } from "~~/tests/test-utils/webLocks"

const account: AccountCookieValidationTarget = {
  site_type: SITE_TYPES.ANYROUTER,
  site_url: "https://anyrouter.example",
  account_info: { id: "17" },
  cookieAuth: { sessionCookie: "session=rejected" },
  protectionBypassExecution: {
    version: 2,
    kind: "user_command",
    command: "detect_account",
    surface: "options",
  },
}

describe("Cookie validation transport isolation", () => {
  beforeEach(() => {
    isolateWebLocks()
    // The account editor delegates protected requests to the background runtime.
    vi.stubGlobal("window", {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("does not borrow an ambient login when the direct Cookie rule cannot be installed", async () => {
    const updateSessionRules = vi.fn(async (update) => {
      if (update.addRules?.length) throw new Error("DNR installation failed")
    })
    vi.stubGlobal("chrome", {
      runtime: { id: "extension-id" },
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      declarativeNetRequest: {
        updateSessionRules,
        getSessionRules: vi.fn().mockResolvedValue([]),
      },
    })
    // An ordinary browser fetch would authenticate the ambient same-account login.
    const ambientFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: 17 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", ambientFetch)
    const protectedRequest = vi
      .spyOn(browser.runtime, "sendMessage")
      .mockResolvedValue({
        success: false,
        status: 401,
        data: { success: false, message: "login required" },
      })

    expect(await validateAccountCookie(account)).toEqual({
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid,
    })
    expect(ambientFetch).not.toHaveBeenCalled()
    expect(protectedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.ProtectionBypassExecuteTask,
        task: expect.objectContaining({
          params: expect.objectContaining({
            cookieAuthSessionCookie: "session=rejected",
            authType: "cookie",
          }),
        }),
      }),
    )
  })

  /** Install the Firefox permissions and runtime message boundary used by the editor. */
  function installFirefoxTransport() {
    vi.spyOn(browser.runtime, "getURL").mockImplementation(
      (path) => `moz-extension://extension-id/${path}`,
    )
    vi.spyOn(browser.runtime, "getManifest").mockReturnValue({
      manifest_version: 2,
      name: "Firefox fixture",
      version: "1.0.0",
      optional_permissions: ["cookies", "webRequest", "webRequestBlocking"],
    })
    vi.spyOn(browser.permissions, "contains").mockResolvedValue(true)
    vi.stubGlobal("chrome", { runtime: { id: "extension-id" } })
    const nativeFetch = vi.fn()
    vi.stubGlobal("fetch", nativeFetch)
    const protectedRequest = vi.spyOn(browser.runtime, "sendMessage")
    return { nativeFetch, protectedRequest }
  }

  it("rejects an explicit Firefox Cookie through the actual page receiver and registered interceptor despite a valid ambient login", async () => {
    const { nativeFetch, protectedRequest } = installFirefoxTransport()
    vi.stubGlobal("location", new URL(account.site_url))
    vi.spyOn(browser.cookies, "getAll").mockResolvedValue([
      { name: "session", value: "ambient-valid" },
    ] as browser.cookies.Cookie[])
    let intercept!: (details: any) => Promise<any>
    vi.spyOn(
      browser.webRequest.onBeforeSendHeaders,
      "addListener",
    ).mockImplementation((listener) => {
      intercept = listener as typeof intercept
    })
    registerWebRequestInterceptor([`${account.site_url}/*`])
    expect(intercept).toBeTypeOf("function")
    const sentCookies: string[] = []
    nativeFetch.mockImplementation(async (url, options) => {
      const headers = new Headers(options.headers)
      headers.set("Cookie", "session=ambient-valid")
      const rewritten = await intercept({
        url,
        requestHeaders: [...headers].map(([name, value]) => ({ name, value })),
      })
      const cookie = rewritten.requestHeaders.find(
        (header: { name: string }) => header.name.toLowerCase() === "cookie",
      )?.value
      sentCookies.push(cookie)
      const ambient = cookie === "session=ambient-valid"
      return new Response(
        JSON.stringify(
          ambient
            ? { success: true, data: { id: 17 } }
            : { success: false, message: "login required" },
        ),
        {
          status: ambient ? 200 : 401,
          headers: { "Content-Type": "application/json" },
        },
      )
    })
    vi.spyOn(tempWindowBackgroundRuntime, "acquire").mockResolvedValue({
      tabId: 42,
    } as any)
    vi.spyOn(tempWindowBackgroundRuntime, "release").mockResolvedValue(
      undefined,
    )
    vi.spyOn(runtimeMessages, "sendTabMessageWithRetry").mockImplementation(
      async (_tabId, message) =>
        new Promise((resolve) =>
          handlePerformTempWindowFetch(message, resolve),
        ),
    )
    protectedRequest.mockImplementation(async (message) => {
      if (message.action !== RuntimeActionIds.ProtectionBypassExecuteTask)
        return undefined
      return new Promise((resolve) => {
        void executeTempWindowFetch(message.task.params, false, resolve)
      })
    })
    expect(await validateAccountCookie(account)).toEqual({
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid,
    })
    expect(sentCookies).toEqual(["session=rejected"])
    expect(nativeFetch).toHaveBeenCalledOnce()
  })

  it.each([
    { httpStatus: 200, id: 17, status: ACCOUNT_COOKIE_VALIDATION_STATUS.Valid },
    {
      httpStatus: 200,
      id: 18,
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.IdentityMismatch,
    },
    {
      httpStatus: 401,
      id: null,
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid,
    },
  ])(
    "reports Firefox Cookie $status through its isolated channel",
    async ({ httpStatus, id, status }) => {
      const { nativeFetch, protectedRequest } = installFirefoxTransport()
      protectedRequest.mockResolvedValue({
        success: httpStatus === 200,
        status: httpStatus,
        data:
          id === null
            ? { success: false, message: "login required" }
            : { success: true, data: { id } },
      })
      expect(
        await validateAccountCookie({
          ...account,
          fetchContext: {
            kind: "browser-context",
            cookieStoreId: "firefox-container-2",
          },
        }),
      ).toEqual({ status })
      expect(nativeFetch).not.toHaveBeenCalled()
      expect(protectedRequest).toHaveBeenCalledTimes(1)
      expect(protectedRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          task: expect.objectContaining({
            params: expect.objectContaining({
              cookieAuthSessionCookie: "session=rejected",
              cookieStoreId: "firefox-container-2",
              fetchOptions: expect.objectContaining({
                headers: expect.objectContaining({
                  "All-API-Hub-Session-Cookie": "session=rejected",
                }),
              }),
            }),
          }),
        }),
      )
    },
  )

  it("does not dispatch Firefox verification without interceptor permissions", async () => {
    const { nativeFetch, protectedRequest } = installFirefoxTransport()
    vi.spyOn(browser.permissions, "contains").mockResolvedValue(false)
    expect(await validateAccountCookie(account)).toEqual({
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Permission,
    })
    expect(nativeFetch).not.toHaveBeenCalled()
    expect(protectedRequest).not.toHaveBeenCalled()
  })

  it("does not replace a missing protected Firefox context with ambient authentication", async () => {
    const { nativeFetch, protectedRequest } = installFirefoxTransport()
    expect(
      await validateAccountCookie({
        ...account,
        protectionBypassExecution: undefined,
      }),
    ).toEqual({
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Unsupported,
    })
    expect(nativeFetch).not.toHaveBeenCalled()
    expect(protectedRequest).not.toHaveBeenCalled()
  })

  it("does not repeat a blocked Firefox page request", async () => {
    const { nativeFetch, protectedRequest } = installFirefoxTransport()
    protectedRequest.mockResolvedValue({
      success: false,
      status: 403,
      data: "<html>Website verification</html>",
    })
    expect(await validateAccountCookie(account)).toMatchObject({
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
    })
    expect(nativeFetch).not.toHaveBeenCalled()
    expect(protectedRequest).toHaveBeenCalledTimes(1)
  })

  it("does not dispatch a cancelled Firefox validation", async () => {
    const { nativeFetch, protectedRequest } = installFirefoxTransport()
    const controller = new AbortController()
    controller.abort()
    expect(
      await validateAccountCookie({
        ...account,
        abortSignal: controller.signal,
      }),
    ).toMatchObject({ status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable })
    expect(nativeFetch).not.toHaveBeenCalled()
    expect(protectedRequest).not.toHaveBeenCalled()
  })
})
