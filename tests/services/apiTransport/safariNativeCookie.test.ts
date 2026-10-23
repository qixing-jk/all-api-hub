import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fetchWithHeaderOverrides } from "~/services/apiTransport/headerOverrides"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { fetchSafariNativeCookie } from "~/services/apiTransport/safariNativeCookie"
import { AuthTypeEnum } from "~/types"

const api = vi.hoisted(() => ({
  contains: vi.fn(),
  send: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  removeCookie: vi.fn(),
  cookieApiAvailable: true,
}))
vi.mock("wxt/browser", () => ({
  browser: {
    permissions: {
      contains: api.contains,
      onRemoved: { addListener: api.add, removeListener: api.remove },
    },
    runtime: { sendNativeMessage: api.send },
    cookies: {
      get remove() {
        return api.cookieApiAvailable ? api.removeCookie : undefined
      },
    },
  },
}))

const url = "http://127.0.0.1:41672/safari1669native/echo"
const session = {
  origin: "http://127.0.0.1:41672",
  cookieHeader: "session=fixture-A",
}
const dispatch = (init?: RequestInit) =>
  fetchWithHeaderOverrides(url, init, undefined, { cookieSession: session })

describe("Safari native Cookie transport boundaries", () => {
  beforeEach(() => {
    vi.stubEnv("BROWSER", "safari")
    vi.stubGlobal("fetch", vi.fn())
    api.contains.mockResolvedValue(true)
    api.removeCookie.mockResolvedValue(null)
    api.cookieApiAvailable = true
    api.send.mockImplementation(async (_, message) => ({
      version: 3,
      id: message.id,
      ok: true,
      ...(message.command === "capabilities"
        ? {
            transport: "isolated-cookie-urlsession",
            cancel: true,
            deadline: true,
            urlPolicy: "https-or-loopback-http",
          }
        : {}),
      status: 200,
      headers: { "set-cookie": "ignored=1" },
      body: "ok",
    }))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("uses the native bridge in an ordinary Safari build without an experiment flag", async () => {
    const response = await dispatch()
    expect(await response.text()).toBe("ok")
    expect(api.send.mock.calls.map((call) => call[1].command)).toEqual([
      "capabilities",
      "request",
    ])
    expect(fetch).not.toHaveBeenCalled()
  })

  it("keeps refresh-style Cookie DTOs on private Safari transport without a stored-account factory", async () => {
    const result = await fetchApiResponse(
      {
        baseUrl: session.origin,
        accountId: "owned-refresh-fixture",
        auth: {
          authType: AuthTypeEnum.Cookie,
          cookie: session.cookieHeader,
          userId: 7,
        },
      },
      { endpoint: "/safari1669native/echo", responseType: "text" },
    ).catch(() => null)
    expect(
      api.send.mock.calls.some((call) => call[1].command === "request"),
    ).toBe(true)
    expect(result?.body).toBe("ok")
    expect(fetch).not.toHaveBeenCalled()
  })

  it("rejects website Deny even when the granted-pattern API returns true", async () => {
    api.removeCookie.mockRejectedValue(new Error("Host permission missing"))
    await expect(dispatch()).rejects.toThrow(
      "messages:cookieTransport.permissionRequired",
    )
    expect(api.send).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("rechecks actual URL access after the handshake even if pattern grants stay true", async () => {
    api.removeCookie
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("denied"))
    await expect(dispatch()).rejects.toThrow(
      "messages:cookieTransport.permissionRequired",
    )
    expect(api.send).toHaveBeenCalledTimes(1)
    expect(api.send.mock.calls[0]![1].command).toBe("capabilities")
    expect(fetch).not.toHaveBeenCalled()
  })

  it("bounds a lost URL permission reply without sending credentials", async () => {
    vi.useFakeTimers()
    api.removeCookie.mockReturnValue(new Promise(() => {}))
    const outcome = dispatch().catch((error) => error.message)
    await vi.advanceTimersByTimeAsync(2000)
    expect(await outcome).toContain(
      "messages:cookieTransport.permissionRequired",
    )
    expect(api.send).not.toHaveBeenCalled()
  })

  it("refuses to send credentials when the URL permission probe API is missing", async () => {
    api.cookieApiAvailable = false
    await expect(dispatch()).rejects.toThrow(
      "messages:cookieTransport.permissionRequired",
    )
    expect(api.send).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ["Request input", new Request(url), undefined],
    ["binary body", url, { method: "POST", body: new Uint8Array([1, 2]) }],
    [
      "oversized UTF-8 body",
      url,
      { method: "POST", body: "é".repeat(256 * 1024 + 1) },
    ],
  ] as const)(
    "rejects %s before uploading credentials",
    async (_, input, init) => {
      await expect(
        fetchSafariNativeCookie(input, init, new Headers(), session),
      ).rejects.toThrow("messages:cookieTransport.scopeUnavailable")
      expect(api.send).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it("detects URL denial without an onRemoved event and cancels the real request lease", async () => {
    vi.useFakeTimers()
    const realSend = api.send.getMockImplementation()!
    let finish!: (value: unknown) => void
    api.send.mockImplementation((app, message) =>
      message.command === "request"
        ? new Promise((resolve) => {
            finish = resolve
          })
        : realSend(app, message),
    )
    const outcome = dispatch().catch((error) => error.message)
    await vi.advanceTimersByTimeAsync(0)
    api.removeCookie.mockRejectedValue(new Error("URL denied"))
    await vi.advanceTimersByTimeAsync(250)
    const request = api.send.mock.calls.find(
      (call) => call[1].command === "request",
    )![1]
    expect(api.send).toHaveBeenCalledWith(expect.any(String), {
      version: 3,
      command: "cancel",
      id: request.id,
    })
    await vi.advanceTimersByTimeAsync(500)
    expect(
      api.send.mock.calls.filter((call) => call[1].command === "cancel"),
    ).toHaveLength(1)
    finish({ version: 3, id: request.id, ok: false })
    expect(await outcome).toContain(
      "messages:cookieTransport.permissionRequired",
    )
    const calls = api.removeCookie.mock.calls.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.removeCookie).toHaveBeenCalledTimes(calls)
  })

  it("coalesces overlapping permission checks and ignores late checks after completion", async () => {
    vi.useFakeTimers()
    const realSend = api.send.getMockImplementation()!
    let finish!: (value: unknown) => void
    api.send.mockImplementation((app, message) =>
      message.command === "request"
        ? new Promise((resolve) => {
            finish = resolve
          })
        : realSend(app, message),
    )
    const pending = dispatch()
    await vi.advanceTimersByTimeAsync(0)
    const removed = api.add.mock.calls[0]![0]
    let check!: (value: boolean) => void
    api.contains.mockReturnValue(
      new Promise((resolve) => {
        check = resolve
      }),
    )
    const before = api.contains.mock.calls.length
    removed()
    removed()
    expect(api.contains).toHaveBeenCalledTimes(before + 1)
    const request = api.send.mock.calls.find(
      (call) => call[1].command === "request",
    )![1]
    finish({ version: 3, id: request.id, ok: true, status: 200, body: "ok" })
    expect(await (await pending).text()).toBe("ok")
    removed()
    check(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.contains).toHaveBeenCalledTimes(before + 1)
    expect(
      api.send.mock.calls.filter((call) => call[1].command === "cancel"),
    ).toHaveLength(0)
    expect(api.remove).toHaveBeenCalledWith(removed)
  })

  it("rejects remote plain HTTP destinations, scope mismatch and missing grants before dispatch", async () => {
    await expect(
      fetchWithHeaderOverrides("http://example.com/", {}, undefined, {
        cookieSession: {
          origin: "http://example.com",
          cookieHeader: "session=fixture-A",
        },
      }),
    ).rejects.toThrow("messages:cookieTransport.scopeUnavailable")
    await expect(
      fetchWithHeaderOverrides(url, {}, undefined, {
        cookieSession: { ...session, origin: "http://127.0.0.1:9999" },
      }),
    ).rejects.toThrow("messages:cookieTransport.scopeUnavailable")
    api.contains.mockResolvedValue(false)
    await expect(dispatch()).rejects.toThrow(
      "messages:cookieTransport.permissionRequired",
    )
    expect(api.send).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("rechecks grants after the capability handshake before uploading credentials", async () => {
    api.contains.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    await expect(dispatch()).rejects.toThrow(
      "messages:cookieTransport.permissionRequired",
    )
    expect(api.send).toHaveBeenCalledTimes(1)
    expect(api.send.mock.calls[0]![1].command).toBe("capabilities")
    expect(api.remove).toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("accepts scoped HTTPS with a fresh host grant", async () => {
    await fetchWithHeaderOverrides(
      "https://example.com/api/user/self",
      {},
      undefined,
      {
        cookieSession: {
          origin: "https://example.com",
          cookieHeader: session.cookieHeader,
        },
      },
    )
    expect(api.send.mock.calls[1]![1].url).toBe(
      "https://example.com/api/user/self",
    )
  })

  it("uses only native messages, explicit Cookie/Origin and hides Set-Cookie", async () => {
    const response = await dispatch()
    expect(await response.text()).toBe("ok")
    expect(response.headers.has("set-cookie")).toBe(false)
    expect(api.send.mock.calls[1]![1].headers).toMatchObject({
      cookie: session.cookieHeader,
      origin: session.origin,
    })
    expect(api.contains).toHaveBeenCalledWith({
      permissions: ["nativeMessaging", "cookies"],
      origins: ["http://127.0.0.1/*"],
    })
    expect(fetch).not.toHaveBeenCalled()
    expect(api.remove).toHaveBeenCalled()
  })

  it("forwards a bounded POST body and removes internal interception markers", async () => {
    const onDispatch = vi.fn()
    await fetchSafariNativeCookie(
      url,
      { method: "POST", body: "owned fixture body" },
      new Headers({
        "all-api-hub": "private",
        "all-api-hub-cookie": "private",
        "content-type": "text/plain",
      }),
      session,
      onDispatch,
    )
    expect(onDispatch).toHaveBeenCalledOnce()
    const message = api.send.mock.calls.find(
      (call) => call[1].command === "request",
    )![1]
    expect(message).toMatchObject({
      method: "POST",
      body: "owned fixture body",
      headers: {
        cookie: session.cookieHeader,
        origin: session.origin,
        "content-type": "text/plain",
      },
    })
    expect(
      Object.keys(message.headers).some((key) => key.startsWith("all-api-hub")),
    ).toBe(false)
  })

  it.each([
    ["missing reply", null],
    ["old protocol", { version: 2 }],
    ["mismatched request ID", { id: "another-request" }],
    ["native failure", { ok: false, body: "session=fixture-secret" }],
    ["non-integer status", { status: 200.5 }],
    ["informational status", { status: 199 }],
    ["invalid status", { status: 600 }],
    ["non-string body", { body: {} }],
    ["oversized UTF-8 reply", { body: "é".repeat(256 * 1024 + 1) }],
  ])(
    "rejects %s without exposing the reply or falling back",
    async (_, invalid) => {
      const realSend = api.send.getMockImplementation()!
      api.send.mockImplementation((app, message) =>
        message.command === "request"
          ? Promise.resolve(
              invalid === null
                ? null
                : {
                    version: 3,
                    id: message.id,
                    ok: true,
                    status: 200,
                    body: "ok",
                    ...invalid,
                  },
            )
          : realSend(app, message),
      )
      await expect(dispatch()).rejects.toThrow(
        "messages:cookieTransport.requestUnavailable",
      )
      expect(fetch).not.toHaveBeenCalled()
      expect(api.remove).toHaveBeenCalled()
    },
  )

  it.each([204, 205, 304])(
    "accepts bodyless HTTP %s replies without constructing an invalid Response",
    async (status) => {
      const realSend = api.send.getMockImplementation()!
      api.send.mockImplementation(async (app, message) => ({
        ...(await realSend(app, message)),
        ...(message.command === "request"
          ? {
              status,
              body: "ignored body",
              headers: {
                "set-cookie": "ignored=1",
                "set-cookie2": "ignored=2",
              },
            }
          : {}),
      }))
      const response = await dispatch()
      expect(response.status).toBe(status)
      expect(response.body).toBeNull()
      expect(await response.text()).toBe("")
      expect(response.headers.has("set-cookie")).toBe(false)
      expect(response.headers.has("set-cookie2")).toBe(false)
    },
  )

  it("sends cancellation and waits for native completion before settling", async () => {
    let finish!: (value: unknown) => void
    let message: any
    api.send.mockImplementation((_, input) => {
      if (input.command === "capabilities")
        return Promise.resolve({
          version: 3,
          id: input.id,
          ok: true,
          transport: "isolated-cookie-urlsession",
          cancel: true,
          deadline: true,
          urlPolicy: "https-or-loopback-http",
        })
      if (input.command === "cancel") return Promise.resolve({ ok: false })
      message = input
      return new Promise((resolve) => {
        finish = resolve
      })
    })
    const abort = new AbortController()
    const pending = dispatch({ signal: abort.signal })
    const outcome = pending.then(
      () => "success",
      (error) => error.name,
    )
    await vi.waitFor(() => expect(message).toBeDefined())
    abort.abort()
    expect(api.send).toHaveBeenCalledWith(expect.any(String), {
      version: 3,
      command: "cancel",
      id: message.id,
    })
    let settled = false
    void outcome.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    finish({ version: 3, id: message.id, ok: false, code: "cancelled" })
    expect(await outcome).toBe("AbortError")
    expect(api.remove).toHaveBeenCalled()
  })

  it("does not send credentials to a missing or older bridge", async () => {
    api.send.mockResolvedValue({
      version: 3,
      ok: false,
      code: "unknown-command",
    })
    await expect(dispatch()).rejects.toThrow(
      "messages:cookieTransport.requestUnavailable",
    )
    expect(api.send).toHaveBeenCalledTimes(1)
    expect(api.send.mock.calls[0]![1]).toEqual({
      version: 3,
      command: "capabilities",
      id: expect.any(String),
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("bounds a lost handshake without sending credentials", async () => {
    vi.useFakeTimers()
    api.send.mockReturnValue(new Promise(() => {}))
    const outcome = dispatch().catch((error) => error.message)
    await vi.advanceTimersByTimeAsync(10000)
    expect(await outcome).toContain(
      "messages:cookieTransport.requestUnavailable",
    )
    expect(api.send).toHaveBeenCalledTimes(1)
    expect(api.send.mock.calls[0]![1].command).toBe("capabilities")
  })

  it("cancels a lost request reply and sets native admission expiry", async () => {
    vi.useFakeTimers()
    const realSend = api.send.getMockImplementation()!
    api.send.mockImplementation((app, message) =>
      message.command === "request"
        ? new Promise(() => {})
        : realSend(app, message),
    )
    const started = Date.now()
    const outcome = dispatch().catch((error) => error.message)
    await vi.advanceTimersByTimeAsync(20000)
    expect(await outcome).toContain(
      "messages:cookieTransport.requestUnavailable",
    )
    const request = api.send.mock.calls.find(
      (call) => call[1].command === "request",
    )![1]
    expect(request.deadline).toBe(started + 20000)
    expect(api.send).toHaveBeenCalledWith(expect.any(String), {
      version: 3,
      command: "cancel",
      id: request.id,
    })
    expect(api.remove).toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("does not reflect bridge errors or replay requests through fetch", async () => {
    api.send.mockRejectedValue(new Error("session=fixture-secret"))
    await expect(dispatch()).rejects.toThrow(
      "messages:cookieTransport.requestUnavailable",
    )
    expect(fetch).not.toHaveBeenCalled()
  })
})
