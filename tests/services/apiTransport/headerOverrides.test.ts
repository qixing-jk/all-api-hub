import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchWithHeaderOverrides,
  normalizeHeaderOverrides,
  sanitizeHeaderOverrideError,
} from "~/services/apiTransport/headerOverrides"

describe("credential request header overrides", () => {
  const nativeFetch = vi.fn()

  beforeEach(() => {
    nativeFetch.mockReset().mockResolvedValue(new Response("ok"))
    vi.stubGlobal("fetch", nativeFetch)
  })

  afterEach(() => vi.unstubAllGlobals())

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

  it("does not mutate DNR rules for ordinary requests when no UA rule is orphaned", async () => {
    const updateSessionRules = installDnr()
    await fetchWithHeaderOverrides("https://api.example/models")
    expect(nativeFetch).toHaveBeenCalledOnce()
    expect(updateSessionRules).not.toHaveBeenCalled()
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
  it.each(["read", "remove"])(
    "does not expose ordinary requests to an orphaned UA when rule %s fails",
    async (failure) => {
      const updateSessionRules = installDnr()
      const api = (globalThis as any).chrome.declarativeNetRequest
      const error = new Error("Rule API unavailable")
      if (failure === "read") api.getSessionRules.mockRejectedValue(error)
      else {
        api.getSessionRules.mockResolvedValue([{ id: 3_000_000 }])
        updateSessionRules.mockRejectedValue(error)
      }
      await expect(
        fetchWithHeaderOverrides("https://api.example/models"),
      ).rejects.toBe(error)
      expect(nativeFetch).not.toHaveBeenCalled()
    },
  )

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
