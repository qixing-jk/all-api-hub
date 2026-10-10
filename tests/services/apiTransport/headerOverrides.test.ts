import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchWithHeaderOverrides,
  normalizeHeaderOverrides,
  sanitizeHeaderOverrideError,
} from "~/services/apiTransport/headerOverrides"
import { isolateWebLocks } from "~~/tests/test-utils/webLocks"

describe("credential request header overrides", () => {
  const nativeFetch = vi.fn()

  beforeEach(() => {
    isolateWebLocks()
    nativeFetch.mockReset().mockResolvedValue(new Response("ok"))
    vi.stubGlobal("fetch", nativeFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("redacts reflected header values from diagnostics", () => {
    expect(
      sanitizeHeaderOverrideError(new Error("invalid tenant-secret-value"), {
        "x-tenant": "tenant-secret-value",
        "x-client": "another-secret",
      }),
    ).toBe("invalid [REDACTED]")
  })

  it("normalizes header names and rejects browser-controlled or internal headers", () => {
    for (const malformed of ["x-client", 1, [], true]) {
      expect(() => normalizeHeaderOverrides(malformed)).toThrow()
    }
    expect(
      normalizeHeaderOverrides({
        " User-Agent ": " client/1 ",
        "X-Test": "yes",
      }),
    ).toEqual({
      "user-agent": "client/1",
      "x-test": "yes",
    })
    for (const headers of [
      { Host: "other.example" },
      { Cookie: "secret" },
      { "Sec-Fetch-Site": "none" },
      { "bad name": "value" },
      { "X-Test": "first\r\nsecond" },
      { "X-Test": "a", "x-test": "b" },
    ]) {
      expect(() => normalizeHeaderOverrides(headers)).toThrow()
    }
  })

  it("overrides headers case-insensitively and prevents redirect disclosure", async () => {
    await fetchWithHeaderOverrides(
      "https://api.example/v1/models",
      {
        headers: {
          Authorization: "Bearer original",
          Accept: "application/json",
        },
      },
      { authorization: "Bearer replacement", "x-client": "custom" },
    )
    const headers = new Headers(nativeFetch.mock.calls[0]![1].headers)
    expect(headers.get("authorization")).toBe("Bearer replacement")
    expect(headers.get("accept")).toBe("application/json")
    expect(headers.get("x-client")).toBe("custom")
    expect(nativeFetch.mock.calls[0]![1].redirect).toBe("error")
  })

  it("preserves normal fetch behavior without overrides", async () => {
    const options = { method: "GET" }
    await fetchWithHeaderOverrides("https://api.example/models", options)
    expect(nativeFetch).toHaveBeenCalledWith(
      "https://api.example/models",
      options,
    )
  })

  it("fails before dispatch when UA cannot be applied", async () => {
    vi.stubGlobal("chrome", {})
    await expect(
      fetchWithHeaderOverrides(
        "https://api.example/models",
        {},
        {
          "User-Agent": "client/1",
        },
      ),
    ).rejects.toThrow()
    expect(nativeFetch).not.toHaveBeenCalled()
  })

  function installDnr() {
    const updateSessionRules = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("chrome", {
      runtime: { id: "extension-id" },
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      declarativeNetRequest: {
        updateSessionRules,
        getSessionRules: vi.fn().mockResolvedValue([]),
      },
    })
    return updateSessionRules
  }

  it("sends private Cookie credentials without using the browser session", async () => {
    const updateSessionRules = installDnr()
    const onDispatch = vi.fn()
    await fetchWithHeaderOverrides(
      "https://console.example/api/keys",
      { method: "POST", credentials: "include" },
      undefined,
      {
        cookieSession: {
          cookieHeader: "session=account-A",
          origin: "https://console.example",
        },
        onDispatch,
      },
    )
    expect(nativeFetch.mock.calls[0]![1]).toMatchObject({
      credentials: "omit",
      redirect: "error",
    })
    const rule = updateSessionRules.mock.calls[0]![0].addRules[0]
    expect(rule.action.requestHeaders).toEqual(
      expect.arrayContaining([
        { header: "cookie", operation: "set", value: "session=account-A" },
        {
          header: "origin",
          operation: "set",
          value: "https://console.example",
        },
      ]),
    )
    expect(rule.condition.initiatorDomains).toEqual(["extension-id"])
    expect(rule.condition.requestMethods).toEqual(["post"])
    expect(onDispatch).toHaveBeenCalledOnce()
    expect(updateSessionRules.mock.invocationCallOrder[0]).toBeLessThan(
      onDispatch.mock.invocationCallOrder[0]!,
    )
  })

  it("retires pending header rules even when an ordinary request sees no installed rule", async () => {
    const updateSessionRules = installDnr()
    await fetchWithHeaderOverrides("https://api.example/models")
    expect(nativeFetch).toHaveBeenCalledOnce()
    expect(updateSessionRules).toHaveBeenCalledExactlyOnceWith({
      removeRuleIds: [3_000_000],
    })
  })

  it("waits behind an interrupted owner's pending native rule update before an ordinary request", async () => {
    const updateSessionRules = installDnr()
    const api = (globalThis as any).chrome.declarativeNetRequest
    let finishInstall!: () => void
    let activeCookie: string | undefined
    const pendingInstall = new Promise<void>((resolve) => {
      finishInstall = () => {
        activeCookie = "account-A"
        resolve()
      }
    })
    // A rule query can observe no rule while the browser is still processing
    // a terminated owner's install. Updates share the browser's native queue.
    api.getSessionRules.mockResolvedValue([])
    updateSessionRules.mockImplementation(async () => {
      await pendingInstall
      activeCookie = undefined
    })
    nativeFetch.mockImplementation(() =>
      Promise.resolve(new Response(activeCookie ?? "browser-B")),
    )
    const request = fetchWithHeaderOverrides("https://console.example/api/keys")
    try {
      await vi.waitFor(() =>
        expect(
          api.getSessionRules.mock.calls.length +
            updateSessionRules.mock.calls.length,
        ).toBeGreaterThan(0),
      )
      expect(nativeFetch).not.toHaveBeenCalled()
    } finally {
      finishInstall()
    }
    expect(await (await request).text()).toBe("browser-B")
  })

  it("cleans only the orphaned UA rule before dispatching an ordinary request", async () => {
    const updateSessionRules = installDnr()
    const api = (globalThis as any).chrome.declarativeNetRequest
    api.getSessionRules.mockResolvedValue([
      { id: 1_000_001 },
      { id: 3_000_000 },
    ])
    await fetchWithHeaderOverrides("https://api.example/models")
    expect(updateSessionRules).toHaveBeenCalledExactlyOnceWith({
      removeRuleIds: [3_000_000],
    })
    expect(updateSessionRules.mock.invocationCallOrder[0]).toBeLessThan(
      nativeFetch.mock.invocationCallOrder[0]!,
    )
  })
  it("does not expose ordinary requests to an orphaned UA when rule removal fails", async () => {
    const updateSessionRules = installDnr()
    const api = (globalThis as any).chrome.declarativeNetRequest
    const error = new Error("Rule API unavailable")
    api.getSessionRules.mockResolvedValue([{ id: 3_000_000 }])
    updateSessionRules.mockRejectedValue(error)
    await expect(
      fetchWithHeaderOverrides("https://api.example/models"),
    ).rejects.toBe(error)
    expect(nativeFetch).not.toHaveBeenCalled()
  })

  it("does not inherit an orphaned private Cookie when permission inspection fails", async () => {
    const updateSessionRules = installDnr()
    const api = (globalThis as any).chrome
    api.permissions.contains
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("Permission inspection unavailable"))
    let activeCookie: string | undefined
    let failFirstCleanup = true
    updateSessionRules.mockImplementation(async (update) => {
      if (update.addRules) {
        activeCookie = update.addRules[0].action.requestHeaders.find(
          (header: { header: string }) => header.header === "cookie",
        ).value
      } else if (failFirstCleanup) {
        failFirstCleanup = false
        throw new Error("Cleanup unavailable")
      } else {
        activeCookie = undefined
      }
    })
    nativeFetch.mockImplementation(() =>
      Promise.resolve(new Response(activeCookie ?? "browser-B")),
    )
    const url = "https://console.example/api/keys"
    await fetchWithHeaderOverrides(url, undefined, undefined, {
      cookieSession: {
        origin: "https://console.example",
        cookieHeader: "session=account-A",
      },
    })

    const response = await fetchWithHeaderOverrides(url)
    expect(await response.text()).toBe("browser-B")
  })

  it("does not dispatch when permission inspection and residual rule cleanup both fail", async () => {
    const updateSessionRules = installDnr()
    const api = (globalThis as any).chrome
    api.permissions.contains.mockRejectedValue(
      new Error("Permission inspection unavailable"),
    )
    const cleanupError = new Error("Cleanup unavailable")
    updateSessionRules.mockRejectedValue(cleanupError)
    const onDispatch = vi.fn()
    await expect(
      fetchWithHeaderOverrides(
        "https://console.example/api/keys",
        undefined,
        undefined,
        { onDispatch },
      ),
    ).rejects.toBe(cleanupError)
    expect(nativeFetch).not.toHaveBeenCalled()
    expect(onDispatch).not.toHaveBeenCalled()
  })

  it("preserves ordinary requests when the header permission is explicitly absent", async () => {
    const updateSessionRules = installDnr()
    ;(globalThis as any).chrome.permissions.contains.mockResolvedValue(false)
    await fetchWithHeaderOverrides("https://api.example/models")
    expect(nativeFetch).toHaveBeenCalledOnce()
    expect(updateSessionRules).not.toHaveBeenCalled()
  })

  it("preserves the private Cookie permission error when inspection fails", async () => {
    const updateSessionRules = installDnr()
    ;(globalThis as any).chrome.permissions.contains.mockRejectedValue(
      new Error("Permission inspection unavailable"),
    )
    await expect(
      fetchWithHeaderOverrides(
        "https://console.example/api/keys",
        undefined,
        undefined,
        {
          cookieSession: {
            origin: "https://console.example",
            cookieHeader: "session=account-A",
          },
        },
      ),
    ).rejects.toMatchObject({ code: "COOKIE_PERMISSION_REQUIRED" })
    expect(nativeFetch).not.toHaveBeenCalled()
    expect(updateSessionRules).not.toHaveBeenCalled()
  })

  it("scopes UA to this extension and URL and removes the rule after failure", async () => {
    const updateSessionRules = installDnr()
    nativeFetch.mockRejectedValueOnce(new Error("offline"))
    await expect(
      fetchWithHeaderOverrides(
        "https://api.example/models?limit=1",
        {},
        { "user-agent": "client/1" },
      ),
    ).rejects.toThrow("offline")
    const rule = updateSessionRules.mock.calls[0]![0].addRules[0]
    expect(rule.condition.initiatorDomains).toEqual(["extension-id"])
    expect(
      new RegExp(rule.condition.regexFilter).test(
        "https://api.example/models?limit=1",
      ),
    ).toBe(true)
    expect(
      new RegExp(rule.condition.regexFilter).test(
        "https://api.example/models?limit=10",
      ),
    ).toBe(false)
    expect(rule.action.requestHeaders).toEqual([
      { header: "user-agent", operation: "set", value: "client/1" },
    ])
    expect(updateSessionRules).toHaveBeenLastCalledWith({
      removeRuleIds: [rule.id],
    })
  })

  it("prevents ordinary and differently configured requests from inheriting an active UA", async () => {
    const updateSessionRules = installDnr()
    let release!: (response: Response) => void
    nativeFetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    )
    const first = fetchWithHeaderOverrides(
      "https://api.example/models",
      {},
      { "user-agent": "first" },
    )
    await vi.waitFor(() => expect(nativeFetch).toHaveBeenCalledOnce())
    const ordinary = fetchWithHeaderOverrides("https://api.example/models")
    const second = fetchWithHeaderOverrides(
      "https://api.example/models",
      {},
      { "user-agent": "second" },
    )
    expect(nativeFetch).toHaveBeenCalledOnce()
    release(new Response("first"))
    await Promise.all([first, ordinary, second])
    expect(nativeFetch).toHaveBeenCalledTimes(3)
    const rules = updateSessionRules.mock.calls
      .filter(([input]) => input.addRules)
      .map(([input]) => input.addRules[0])
    expect(rules.map((rule) => rule.action.requestHeaders[0].value)).toEqual([
      "first",
      "second",
    ])
  })

  it("does not install a rule or dispatch a pre-aborted UA request", async () => {
    const updateSessionRules = installDnr()
    const controller = new AbortController()
    controller.abort()
    await expect(
      fetchWithHeaderOverrides(
        "https://api.example/models",
        { signal: controller.signal },
        { "user-agent": "client" },
      ),
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(nativeFetch).not.toHaveBeenCalled()
    expect(updateSessionRules).not.toHaveBeenCalled()
  })

  it("does not dispatch when rule installation fails", async () => {
    const updateSessionRules = installDnr()
    updateSessionRules.mockRejectedValueOnce(
      new Error("missing host permission"),
    )
    await expect(
      fetchWithHeaderOverrides(
        "https://api.example/models",
        {},
        { "user-agent": "client" },
      ),
    ).rejects.toThrow("userAgentPermission")
    expect(nativeFetch).not.toHaveBeenCalled()
  })
  it.each([false, true])(
    "preserves the fetch outcome if UA rule cleanup fails (fetch failure=%s)",
    async (failure) => {
      const updateSessionRules = installDnr()
      updateSessionRules
        .mockReset()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("cleanup unavailable"))
      const response = new Response("ok")
      const fetchError = new Error("upstream unavailable")
      if (failure) nativeFetch.mockRejectedValueOnce(fetchError)
      else nativeFetch.mockResolvedValueOnce(response)
      const request = fetchWithHeaderOverrides(
        "https://api.example/models",
        {},
        { "user-agent": "client/1" },
      )
      if (failure) await expect(request).rejects.toBe(fetchError)
      else await expect(request).resolves.toBe(response)
    },
  )
})
