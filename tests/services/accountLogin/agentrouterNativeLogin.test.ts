// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://agentrouter.org/login"}
import { afterEach, expect, it, vi } from "vitest"

import { observeAgentRouterNativeLogin } from "~/services/accountLogin/providers/agentrouter/nativeLogin"

vi.mock("~/utils/browser/scripting", () => ({
  executeMainWorldFunction: async (
    _tabId: number,
    fn: (...args: any[]) => unknown,
    args: unknown[],
  ) => fn(...args),
}))
afterEach(() => vi.unstubAllGlobals())

it.each([
  ["fetch", 200],
  ["fetch", 403],
  ["xhr", 200],
  ["xhr", 403],
] as const)(
  "preserves the verification reason from a native %s WAF response (HTTP %s)",
  async (transport, status) => {
    const body = '<!doctype html><meta name="aliyun_waf_aa" content="fixture">'
    const url = new URL("/api/user/login", location.origin).href
    const response = new Response(body, { status })
    Object.defineProperty(response, "url", { value: url })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
    class ChallengedXHR extends EventTarget {
      status = status
      responseURL = url
      responseType = ""
      responseText = body
      open() {}
      send() {
        this.dispatchEvent(new Event("load"))
        this.dispatchEvent(new Event("loadend"))
      }
    }
    vi.stubGlobal("XMLHttpRequest", ChallengedXHR)
    const observer = await observeAgentRouterNativeLogin(
      1,
      location.origin,
      `waf-${transport}-${status}`,
    )
    try {
      if (transport === "fetch") {
        const received = await fetch(url, { method: "POST" })
        expect(await received.text()).toBe(body)
      } else {
        const xhr = new XMLHttpRequest()
        xhr.open("POST", url)
        xhr.send()
        expect(xhr.responseText).toBe(body)
      }
      await expect(observer!.result).resolves.toEqual({
        status: "uncertain",
        reason: "verification_required",
      })
    } finally {
      await observer!.dispose()
    }
  },
)

it.each(["error", "abort", "timeout"])(
  "releases native XHR observation after %s so session verification can resume",
  async (event) => {
    class FailedXHR extends EventTarget {
      status = 0
      responseURL = ""
      open() {}
      send() {
        this.dispatchEvent(new Event(event))
        this.dispatchEvent(new Event("loadend"))
      }
    }
    const originalOpen = FailedXHR.prototype.open
    vi.stubGlobal("XMLHttpRequest", FailedXHR)
    const observer = await observeAgentRouterNativeLogin(
      1,
      location.origin,
      `xhr-${event}`,
    )
    try {
      const settled = vi.fn()
      void observer!.result.then(settled)
      const xhr = new XMLHttpRequest()
      xhr.open("POST", "/api/user/login")
      xhr.send()
      await vi.waitFor(() => expect(settled).toHaveBeenCalledWith(null), {
        timeout: 100,
      })
      expect(FailedXHR.prototype.open).toBe(originalOpen)
    } finally {
      await observer!.dispose()
    }
  },
)

it.each(["", "json"])(
  "captures the native XHR login used by AgentRouter's Axios form (%s)",
  async (responseType) => {
    class NativeXHR extends EventTarget {
      status = 200
      responseType = responseType
      responseURL = ""
      responseText = JSON.stringify({
        success: true,
        data: { id: 17, checked_in: true, email: "private" },
      })
      response = JSON.parse(this.responseText)
      open(_method: string, url: string) {
        this.responseURL = new URL(url, location.href).href
      }
      send() {
        this.dispatchEvent(new Event("load"))
        this.dispatchEvent(new Event("loadend"))
      }
    }
    const originalOpen = NativeXHR.prototype.open
    vi.stubGlobal("XMLHttpRequest", NativeXHR)
    const observer = await observeAgentRouterNativeLogin(
      1,
      location.origin,
      "xhr-test",
    )
    const xhr = new XMLHttpRequest()
    const siteLoaded = vi.fn()
    xhr.open("POST", "/api/user/login?turnstile=")
    xhr.addEventListener("loadend", siteLoaded)
    xhr.send()
    await expect(observer!.result).resolves.toEqual({
      status: "authenticated",
      identity: "17",
      evidence: { checkedIn: true },
    })
    expect(siteLoaded).toHaveBeenCalledOnce()
    expect(NativeXHR.prototype.open).toBe(originalOpen)
    await observer!.dispose()
  },
)

it.each([
  { success: false },
  { success: true, data: { id: 17, require_2fa: true, checked_in: true } },
  { success: true, data: { checked_in: true } },
  { success: true, data: { id: "not-an-id", checked_in: true } },
])(
  "leaves incomplete or second-factor responses for the existing verification flow (%j)",
  async (payload) => {
    const response = Response.json(payload)
    Object.defineProperty(response, "url", {
      value: "https://agentrouter.org/api/user/login",
    })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
    const observer = await observeAgentRouterNativeLogin(
      1,
      location.origin,
      "incomplete",
    )
    await fetch("/api/user/login", { method: "POST" })
    await expect(observer!.result).resolves.toBeNull()
    await observer!.dispose()
  },
)

it.each(["GET", "other-path", "other-origin"])(
  "does not accept unrelated network data or stale localStorage (%s)",
  async (kind) => {
    const url =
      kind === "other-origin"
        ? "https://unrelated.example/api/user/login"
        : kind === "other-path"
          ? "/api/user/self"
          : "/api/user/login"
    const response = Response.json({
      success: true,
      data: { id: 17, checked_in: true },
    })
    Object.defineProperty(response, "url", {
      value: new URL(url, location.href).href,
    })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
    localStorage.setItem("user", JSON.stringify({ id: 17, checked_in: true }))
    const observer = await observeAgentRouterNativeLogin(
      1,
      location.origin,
      "unrelated",
    )
    await fetch(url, { method: kind === "GET" ? "GET" : "POST" })
    await observer!.dispose()
    await expect(observer!.result).resolves.toBeNull()
  },
)

it("restores its hooks when the document unloads without a login response", async () => {
  const nativeFetch = fetch
  const nativeOpen = XMLHttpRequest.prototype.open
  const observer = await observeAgentRouterNativeLogin(
    1,
    location.origin,
    "navigation",
  )
  window.dispatchEvent(new Event("pagehide"))
  await expect(observer!.result).resolves.toBeNull()
  expect(fetch).toBe(nativeFetch)
  expect(XMLHttpRequest.prototype.open).toBe(nativeOpen)
  await observer!.dispose()
})

it("captures only the native login response and leaves the site's response readable", async () => {
  const response = Response.json({
    success: true,
    data: { id: 17, checked_in: true, access_token: "private" },
  })
  Object.defineProperty(response, "url", {
    value: "https://agentrouter.org/api/user/login?turnstile=example",
  })
  const nativeFetch = vi.fn().mockResolvedValue(response)
  vi.stubGlobal("fetch", nativeFetch)
  localStorage.setItem("user", JSON.stringify({ id: 99, checked_in: false }))
  const observer = await observeAgentRouterNativeLogin(
    1,
    location.origin,
    "native-test",
  )
  expect(observer).not.toBeNull()
  const received = await fetch("/api/user/login?turnstile=example", {
    method: "POST",
  })
  await expect(observer!.result).resolves.toEqual({
    status: "authenticated",
    identity: "17",
    evidence: { checkedIn: true },
  })
  expect((await received.json()).data.access_token).toBe("private")
  expect(nativeFetch).toHaveBeenCalledTimes(1)
  expect(fetch).toBe(nativeFetch)
  await observer!.dispose()
})

it.each([
  ["request-object", "authenticated"],
  ["missing-checkin", "authenticated"],
  ["failed-http", null],
  ["malformed", null],
  ["missing-data", null],
  ["redirected", null],
  ["unreadable", null],
  ["network", null],
])("leaves native Fetch behavior intact for %s", async (kind, status) => {
  const url = `${location.origin}/api/user/login`
  const response =
    kind === "malformed"
      ? new Response("not JSON")
      : Response.json(
          kind === "missing-data"
            ? { success: true }
            : { success: true, data: { id: 17 } },
          { status: kind === "failed-http" ? 403 : 200 },
        )
  Object.defineProperty(response, "url", {
    value: kind === "redirected" ? "https://other.example/api/user/login" : url,
  })
  if (kind === "unreadable")
    vi.spyOn(response, "clone").mockImplementation(() => {
      throw new Error("unreadable")
    })
  const original = vi.fn().mockImplementation(async () => {
    if (kind === "network") throw new Error("offline")
    return response
  })
  vi.stubGlobal("fetch", original)
  const observer = await observeAgentRouterNativeLogin(1, location.origin, kind)
  try {
    const request =
      kind === "request-object" ? new Request(url, { method: "POST" }) : url
    const received = fetch(
      request,
      kind === "request-object" ? undefined : { method: "POST" },
    )
    if (kind === "network") await expect(received).rejects.toThrow("offline")
    else await expect(received).resolves.toBe(response)
    await expect(observer!.result).resolves.toEqual(
      status ? { status, identity: "17", evidence: {} } : null,
    )
    expect(fetch).toBe(original)
    expect(original).toHaveBeenCalledOnce()
  } finally {
    await observer!.dispose()
  }
})

it.each([
  "GET",
  "bad-url",
  "json-error",
  "unreadable",
  "other-origin",
  "duplicate",
])("cleans XHR observation without accepting %s evidence", async (kind) => {
  class NativeXHR extends EventTarget {
    status = 403
    responseType = "json"
    responseURL =
      kind === "other-origin"
        ? "https://other.example/api/user/login"
        : `${location.origin}/api/user/login`
    response = { success: true, data: { id: 17 } }
    open() {}
  }
  vi.stubGlobal("XMLHttpRequest", NativeXHR)
  const originalOpen = NativeXHR.prototype.open
  const observer = await observeAgentRouterNativeLogin(
    1,
    location.origin,
    `xhr-edge-${kind}`,
  )
  try {
    const xhr = new XMLHttpRequest()
    if (kind === "unreadable")
      Object.defineProperty(xhr, "responseURL", {
        get() {
          throw new Error("unreadable")
        },
      })
    xhr.open(
      kind === "GET" ? "GET" : "POST",
      kind === "bad-url" ? "http://[" : "/api/user/login",
    )
    if (kind === "duplicate")
      new XMLHttpRequest().open("POST", "/api/user/login")
    xhr.dispatchEvent(new Event("load"))
    await observer!.dispose()
    await expect(observer!.result).resolves.toBeNull()
    expect(NativeXHR.prototype.open).toBe(originalOpen)
  } finally {
    await observer!.dispose()
  }
})

it("ignores invalid Fetch URLs and leaves later page-installed transports intact", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ignored")))
  const originalOpen = XMLHttpRequest.prototype.open
  const observer = await observeAgentRouterNativeLogin(
    1,
    location.origin,
    "invalid-url",
  )
  await fetch("http://[", { method: "POST" })
  const laterFetch = vi.fn()
  const laterOpen = vi.fn()
  window.fetch = laterFetch
  XMLHttpRequest.prototype.open = laterOpen
  try {
    await observer!.dispose()
    await expect(observer!.result).resolves.toBeNull()
    expect(window.fetch).toBe(laterFetch)
    expect(XMLHttpRequest.prototype.open).toBe(laterOpen)
  } finally {
    XMLHttpRequest.prototype.open = originalOpen
  }
})

it("rejects invalid scope and duplicate observation, and bounds an idle observation", async () => {
  vi.useFakeTimers()
  try {
    await expect(
      observeAgentRouterNativeLogin(1, "https://other.example", "r"),
    ).resolves.toBeNull()
    await expect(
      observeAgentRouterNativeLogin(1, location.origin, ""),
    ).resolves.toBeNull()
    await expect(
      observeAgentRouterNativeLogin(1, "https://agentrouter.org:1234", "r"),
    ).resolves.toBeNull()
    const observer = await observeAgentRouterNativeLogin(
      1,
      location.origin,
      "timeout",
    )
    await expect(
      observeAgentRouterNativeLogin(1, location.origin, "timeout"),
    ).resolves.toBeNull()
    await vi.runAllTimersAsync()
    await expect(observer!.result).resolves.toBeNull()
    await observer!.dispose()
    await observer!.dispose()
  } finally {
    vi.useRealTimers()
  }
})

it("ignores an unrelated Fetch rejection and still captures the login", async () => {
  const response = Response.json({
    success: true,
    data: { id: 17, checked_in: false },
  })
  Object.defineProperty(response, "url", {
    value: `${location.origin}/api/user/login`,
  })
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(response),
  )
  const observer = await observeAgentRouterNativeLogin(
    1,
    location.origin,
    "unrelated-failure",
  )
  try {
    await expect(fetch("/api/status")).rejects.toThrow("offline")
    await fetch("/api/user/login", { method: "POST" })
    await expect(observer!.result).resolves.toEqual({
      status: "authenticated",
      identity: "17",
      evidence: { checkedIn: false },
    })
  } finally {
    await observer!.dispose()
  }
})

it("refuses observation when the document moved to a different supported origin", async () => {
  await expect(
    observeAgentRouterNativeLogin(1, "https://ps.air-outer.com", "moved"),
  ).resolves.toBeNull()
})
