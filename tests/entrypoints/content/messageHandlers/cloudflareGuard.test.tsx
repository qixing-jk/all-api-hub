import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { handleCheckCloudflareGuard } from "~/entrypoints/content/messageHandlers/handlers/cloudflareGuard"
import { setupContentMessageHandlers } from "~/entrypoints/content/messageHandlers/index"
import {
  detectCloudflareChallengePage,
  logCloudflareGuard,
} from "~/entrypoints/content/messageHandlers/utils/cloudflareGuard"

const {
  addListenerMock,
  capHandlerMock,
  cloudflareHandlerMock,
  getRenderedTitleHandlerMock,
  getLocalStorageHandlerMock,
  getUserHandlerMock,
  loggerMocks,
  performTempFetchHandlerMock,
  sendRuntimeMessageMock,
  shieldBypassHandlerMock,
  turnstileHandlerMock,
  waitUserInfoHandlerMock,
} = vi.hoisted(() => ({
  addListenerMock: vi.fn(),
  capHandlerMock: vi.fn(() => "cap"),
  cloudflareHandlerMock: vi.fn(() => "cloudflare"),
  getRenderedTitleHandlerMock: vi.fn(() => "title"),
  getLocalStorageHandlerMock: vi.fn(() => "storage"),
  getUserHandlerMock: vi.fn(() => "user"),
  loggerMocks: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  performTempFetchHandlerMock: vi.fn(() => "temp-fetch"),
  sendRuntimeMessageMock: vi.fn(),
  shieldBypassHandlerMock: vi.fn(() => "shield"),
  turnstileHandlerMock: vi.fn(() => "turnstile"),
  waitUserInfoHandlerMock: vi.fn(() => "wait-user"),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => loggerMocks,
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    sendRuntimeMessage: sendRuntimeMessageMock,
  }
})

vi.mock("~/entrypoints/content/messageHandlers/handlers", () => ({
  handleCheckCapGuard: capHandlerMock,
  handleCheckCloudflareGuard: cloudflareHandlerMock,
  handleGetLocalStorage: getLocalStorageHandlerMock,
  handleGetRenderedTitle: getRenderedTitleHandlerMock,
  handleGetUserFromLocalStorage: getUserHandlerMock,
  handlePerformTempWindowFetch: performTempFetchHandlerMock,
  handleShowShieldBypassUi: shieldBypassHandlerMock,
  handleWaitAndGetUserInfo: waitUserInfoHandlerMock,
  handleWaitForTurnstileToken: turnstileHandlerMock,
}))

describe("cloudflare guard utilities and handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.title = ""
    document.body.innerHTML = ""
    window.history.replaceState(null, "", "/")
    delete (window as any)._cf_chl_opt
    ;(globalThis as any).browser = {
      runtime: {
        onMessage: {
          addListener: addListenerMock,
        },
      },
    }
    sendRuntimeMessageMock.mockResolvedValue(undefined)
  })

  it("logs Cloudflare events and tolerates relay failures", async () => {
    sendRuntimeMessageMock.mockRejectedValueOnce(new Error("relay failed"))

    logCloudflareGuard("  checkFailed  ", { source: "content" })
    logCloudflareGuard("", undefined)

    await Promise.resolve()

    expect(loggerMocks.error).toHaveBeenCalledWith("checkFailed", {
      source: "content",
    })
    expect(loggerMocks.debug).toHaveBeenCalledWith("event", undefined)
    expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(1, {
      action: RuntimeActionIds.CloudflareGuardLog,
      event: "  checkFailed  ",
      details: { source: "content" },
    })
    expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(2, {
      action: RuntimeActionIds.CloudflareGuardLog,
      event: "",
      details: null,
    })
  })

  it("detects strong and support Cloudflare challenge markers", () => {
    document.title = "Just a moment..."
    document.body.innerHTML = `
      <script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script>
      <script src="/cdn-cgi/images/trace/jsch/transparent.gif"></script>
      <form id="challenge-form"></form>
      <div id="cf-content"></div>
      <div id="cf-wrapper"></div>
      <div class="cf-error-code">1020</div>
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
    `
    ;(window as any)._cf_chl_opt = { cType: "non-interactive" }
    window.history.replaceState(
      null,
      "",
      "/cdn-cgi/challenge-platform/h/g?__cf_chl_rt_tk=abc",
    )

    const detection = detectCloudflareChallengePage()

    expect(detection.isChallenge).toBe(true)
    expect(detection.score).toBeGreaterThanOrEqual(10)
    expect(detection.reasons).toEqual(
      expect.arrayContaining([
        "_cf_chl_opt",
        "challenge-platform",
        "trace-jsch",
        "challenge-form",
        "cf-content",
        "cf-wrapper",
        "cf-error-1020",
        "cf-url",
        "title",
        "turnstile",
      ]),
    )
    expect(detection.url).toContain("/cdn-cgi/challenge-platform")
  })

  it("returns non-challenge when support markers do not reach the threshold", () => {
    document.title = "Regular page"
    document.body.innerHTML = `<div id="cf-content"></div>`

    const detection = detectCloudflareChallengePage()

    expect(detection.isChallenge).toBe(false)
    expect(detection.score).toBe(2)
    expect(detection.reasons).toEqual(["cf-content"])
  })

  it("handles guard checks and logs request-scoped results", () => {
    document.title = "Attention Required"
    document.body.innerHTML = `<div id="cf-wrapper"></div>`

    const sendResponse = vi.fn()
    const keepAlive = handleCheckCloudflareGuard(
      { requestId: "req-cloudflare" },
      sendResponse,
    )

    expect(keepAlive).toBe(true)
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        passed: false,
        detection: expect.objectContaining({
          isChallenge: true,
        }),
      }),
    )
    expect(loggerMocks.debug).toHaveBeenCalledWith("check", {
      requestId: "req-cloudflare",
      origin: "http://localhost:3000",
      title: "Attention Required",
      passed: false,
      detection: expect.objectContaining({
        isChallenge: true,
      }),
    })
  })

  it("returns an error response when detection throws", () => {
    const titleGetter = vi
      .spyOn(document, "title", "get")
      .mockImplementation(() => {
        throw new Error("boom")
      })

    const sendResponse = vi.fn()
    handleCheckCloudflareGuard({ requestId: "req-error" }, sendResponse)

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "boom",
    })
    expect(loggerMocks.error).toHaveBeenCalledWith("checkError", {
      requestId: "req-error",
      error: "boom",
    })

    titleGetter.mockRestore()
  })

  it("registers and dispatches content message handlers by action id", () => {
    setupContentMessageHandlers()

    expect(addListenerMock).toHaveBeenCalledTimes(1)
    const listener = addListenerMock.mock.calls[0][0] as (
      request: { action: string },
      sender: unknown,
      sendResponse: (value?: unknown) => void,
    ) => unknown

    const sendResponse = vi.fn()

    expect(
      listener(
        { action: RuntimeActionIds.ContentGetLocalStorage },
        null,
        sendResponse,
      ),
    ).toBe("storage")
    expect(
      listener(
        { action: RuntimeActionIds.ContentGetUserFromLocalStorage },
        null,
        sendResponse,
      ),
    ).toBe("user")
    expect(
      listener(
        { action: RuntimeActionIds.ContentCheckCapGuard },
        null,
        sendResponse,
      ),
    ).toBe("cap")
    expect(
      listener(
        { action: RuntimeActionIds.ContentCheckCloudflareGuard },
        null,
        sendResponse,
      ),
    ).toBe("cloudflare")
    expect(
      listener(
        { action: RuntimeActionIds.ContentWaitForTurnstileToken },
        null,
        sendResponse,
      ),
    ).toBe("turnstile")
    expect(
      listener(
        { action: RuntimeActionIds.ContentWaitAndGetUserInfo },
        null,
        sendResponse,
      ),
    ).toBe("wait-user")
    expect(
      listener(
        { action: RuntimeActionIds.ContentPerformTempWindowFetch },
        null,
        sendResponse,
      ),
    ).toBe("temp-fetch")
    expect(
      listener(
        { action: RuntimeActionIds.ContentGetRenderedTitle },
        null,
        sendResponse,
      ),
    ).toBe("title")
    expect(
      listener(
        { action: RuntimeActionIds.ContentShowShieldBypassUi },
        null,
        sendResponse,
      ),
    ).toBe("shield")
    expect(
      listener({ action: "unknown-action" }, null, sendResponse),
    ).toBeUndefined()
  })
})
