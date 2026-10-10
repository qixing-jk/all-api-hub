import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createKey,
  fetchKeys,
  updateKey,
  type CubenceKey,
} from "~/services/apiService/cubence/keys"
import { withCubenceSession } from "~/services/apiService/cubence/session"
import { readCubenceResponse } from "~/services/apiService/cubence/transport"
import { fetchWithHeaderOverrides } from "~/services/apiTransport/headerOverrides"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

describe("Cubence direct Cookie transport", () => {
  let browserBoundary: ReturnType<typeof installCookieTransport>
  beforeEach(() => {
    browserBoundary = installCookieTransport()
  })
  afterEach(() => vi.restoreAllMocks())

  it("allows a prepared multi-request operation to finish after 60 seconds", async () => {
    vi.useFakeTimers()
    try {
      const pending = withCubenceSession(
        {
          baseUrl: "https://cubence.com",
          auth: { authType: AuthTypeEnum.Cookie, cookie: "token=A" },
        },
        async (request) => {
          await new Promise((resolve) => setTimeout(resolve, 61_000))
          request.abortSignal?.throwIfAborted()
          return "readback complete"
        },
      )
      const result = pending.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      )
      await vi.advanceTimersByTimeAsync(61_000)
      expect(await result).toEqual({ value: "readback complete" })
    } finally {
      vi.useRealTimers()
    }
  })

  it("preserves Cookie domain, path, expiry and partition boundaries", async () => {
    const base = (await browser.cookies.getAll({}))[0]!
    browserBoundary.cookies.mockResolvedValue([
      base,
      { ...base, name: "scoped", value: "allowed", path: "/api/v1/user" },
      { ...base, name: "wrong-path", path: "/api/v1/user2" },
      { ...base, name: "subdomain", domain: "other.cubence.com" },
      { ...base, name: "expired", expirationDate: 1 },
      {
        ...base,
        name: "partitioned",
        partitionKey: { topLevelSite: "https://other.example" },
      },
    ])
    server.use(
      http.get("https://cubence.com/api/v1/user/apikeys", ({ request }) => {
        expect(request.headers.get("cookie")).toBe(
          "scoped=allowed; token=browser-account",
        )
        return HttpResponse.json({ success: true })
      }),
    )
    await readCubenceResponse(
      {
        baseUrl: "https://cubence.com",
        auth: { authType: AuthTypeEnum.Cookie },
        fetchContext: {
          kind: "browser-context",
          cookieStoreId: "private-store",
        },
      },
      "/api/v1/user/apikeys",
    )
    expect(browserBoundary.cookies).toHaveBeenLastCalledWith({
      domain: "cubence.com",
      storeId: "private-store",
    })
  })

  it("rejects an unresolved incognito store instead of reading the regular browser session", async () => {
    await expect(
      readCubenceResponse(
        {
          baseUrl: "https://cubence.com",
          auth: { authType: AuthTypeEnum.Cookie },
          fetchContext: { kind: "browser-context", incognito: true },
        },
        "/api/test",
      ),
    ).rejects.toMatchObject({ code: "COOKIE_REQUEST_UNAVAILABLE" })
    expect(browserBoundary.cookies).not.toHaveBeenCalled()
    expect(browserBoundary.fetch).not.toHaveBeenCalled()
  })

  it("does not dispatch or fall back when the request-header permission is missing", async () => {
    vi.mocked(browser.permissions.contains).mockResolvedValue(false)
    const onDispatch = vi.fn()
    await expect(
      readCubenceResponse(
        {
          baseUrl: "https://cubence.com",
          auth: { authType: AuthTypeEnum.Cookie, cookie: "session=A" },
          observer: { onDispatch, onResponse: vi.fn() },
        },
        "/api/test",
        { method: "POST" },
      ),
    ).rejects.toMatchObject({ code: "COOKIE_PERMISSION_REQUIRED" })
    expect(onDispatch).not.toHaveBeenCalled()
    expect(browserBoundary.fetch).not.toHaveBeenCalled()
    expect(browserBoundary.cookies).not.toHaveBeenCalled()
  })

  it("keeps an expired saved credential bound instead of retrying as the browser account", async () => {
    server.use(
      http.get("https://cubence.com/api/test", () =>
        HttpResponse.json({ error: "expired" }, { status: 401 }),
      ),
    )
    await expect(
      readCubenceResponse(
        {
          baseUrl: "https://cubence.com",
          auth: { authType: AuthTypeEnum.Cookie, cookie: "session=expired" },
        },
        "/api/test",
      ),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(browserBoundary.fetch).toHaveBeenCalledOnce()
    expect(browserBoundary.cookies).not.toHaveBeenCalled()
  })

  it("uses a saved legacy Cookie when the primary Cookie field is blank", async () => {
    server.use(
      http.get("https://cubence.com/api/test", ({ request }) => {
        expect(request.headers.get("cookie")).toBe("session=saved-A")
        return HttpResponse.json({ success: true })
      }),
    )
    await readCubenceResponse(
      {
        baseUrl: "https://cubence.com",
        auth: { authType: AuthTypeEnum.Cookie, cookie: "  " },
        cookieAuthSessionCookie: "Cookie: session=saved-A",
      },
      "/api/test",
    )
    expect(browserBoundary.cookies).not.toHaveBeenCalled()
  })

  it("writes directly with the saved Cookie and site Origin, without a page", async () => {
    const onDispatch = vi.fn()
    server.use(
      http.post("https://cubence.com/api/v1/user/apikeys", ({ request }) => {
        expect(request.headers.get("cookie")).toBe("session=account-A")
        expect(request.headers.get("origin")).toBe("https://cubence.com")
        return HttpResponse.json({ success: true, data: { id: 17 } })
      }),
    )
    await expect(
      readCubenceResponse(
        {
          baseUrl: "https://cubence.com",
          auth: { authType: AuthTypeEnum.Cookie, cookie: "session=account-A" },
          observer: { onDispatch, onResponse: vi.fn() },
        },
        "/api/v1/user/apikeys",
        { method: "POST" },
      ),
    ).resolves.toMatchObject({ data: { id: 17 } })
    expect(browserBoundary.cookies).not.toHaveBeenCalled()
    expect(browserBoundary.fetch.mock.calls[0]![1]?.credentials).toBe("omit")
    expect(onDispatch).toHaveBeenCalledOnce()
  })

  it("keeps one browser Cookie snapshot when the user's tab switches accounts during an operation", async () => {
    server.use(
      http.get("https://cubence.com/api/v1/auth/me", () => {
        browserBoundary.cookies.mockResolvedValue([])
        return HttpResponse.json({
          user: { id: 7, username: "A", active: true },
        })
      }),
      http.get("https://cubence.com/api/v1/user/apikeys", ({ request }) => {
        expect(request.headers.get("cookie")).toBe("token=browser-account")
        return HttpResponse.json({ success: true, data: [] })
      }),
    )
    await expect(
      fetchKeys({
        baseUrl: "https://cubence.com",
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: 7,
        },
      }),
    ).resolves.toEqual([])
    expect(browserBoundary.cookies).toHaveBeenCalledOnce()
  })

  it("rejects a path-specific login Cookie before creating under a different account", async () => {
    const base = (await browser.cookies.getAll({}))[0]!
    browserBoundary.cookies.mockResolvedValue([
      { ...base, name: "token", value: "A" },
      { ...base, name: "token", value: "B", path: "/api/v1/user" },
    ])
    const mutations: string[] = []
    const onDispatch = vi.fn()
    server.use(
      http.get("https://cubence.com/api/v1/auth/me", ({ request }) => {
        expect(request.headers.get("cookie")).toBe("token=A")
        return HttpResponse.json({
          user: { id: 7, username: "A", active: true },
        })
      }),
      http.post("https://cubence.com/api/v1/user/apikeys", ({ request }) => {
        const account = request.headers.get("cookie")?.startsWith("token=B")
          ? "B"
          : "A"
        mutations.push(account)
        return HttpResponse.json({
          success: true,
          data: {
            id: 17,
            user_id: account === "B" ? 8 : 7,
            key: "fake-key",
            name: "test",
            status: "active",
            share_type: "public",
            share_group_id: 13,
            quota_limit: -1,
            quota_used: 0,
            usage_count: 0,
            last_used_at: null,
          },
        })
      }),
    )
    const outcome = await createKey(
      {
        baseUrl: "https://cubence.com",
        auth: { authType: AuthTypeEnum.Cookie, userId: 7 },
        observer: { onDispatch, onResponse: vi.fn() },
      },
      { name: "test", quota_limit: -1, share_group_id: 13 },
    ).catch((error: unknown) => error)
    expect(mutations).toEqual([])
    expect(onDispatch).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ code: "COOKIE_REQUEST_UNAVAILABLE" })
  })

  it.each(["path", "expiry"])(
    "does not send when %s changes the login after identity verification",
    async (change) => {
      const base = (await browser.cookies.getAll({}))[0]!
      const now = Date.now()
      const clock = vi.spyOn(Date, "now").mockReturnValue(now)
      browserBoundary.cookies.mockResolvedValue(
        change === "path"
          ? [
              { ...base, value: "A", path: "/api/v1/auth" },
              { ...base, value: "B", path: "/api/v1/user" },
            ]
          : [
              { ...base, value: "A", expirationDate: now / 1000 + 1 },
              { ...base, name: "analytics", value: "unrelated" },
            ],
      )
      const mutate = vi.fn(() => HttpResponse.json({ success: true }))
      server.use(
        http.get("https://cubence.com/api/v1/auth/me", () => {
          if (change === "expiry") clock.mockReturnValue(now + 2000)
          return HttpResponse.json({
            user: { id: 7, username: "A", active: true },
          })
        }),
        http.post("https://cubence.com/api/v1/user/apikeys", mutate),
      )
      await expect(
        createKey(
          {
            baseUrl: "https://cubence.com",
            auth: { authType: AuthTypeEnum.Cookie, userId: 7 },
          },
          { name: "test", quota_limit: -1, share_group_id: 13 },
        ),
      ).rejects.toMatchObject({ code: "COOKIE_REQUEST_UNAVAILABLE" })
      expect(mutate).not.toHaveBeenCalled()
      expect(browserBoundary.fetch).toHaveBeenCalledOnce()
    },
  )

  it("allows the same login on multiple Cookie scopes and unrelated scoped Cookies", async () => {
    const base = (await browser.cookies.getAll({}))[0]!
    browserBoundary.cookies.mockResolvedValue([
      { ...base, value: "A" },
      {
        ...base,
        value: "A",
        domain: ".cubence.com",
        hostOnly: false,
        path: "/api/v1/user",
      },
      { ...base, name: "csrf", value: "root" },
      { ...base, name: "csrf", value: "scoped", path: "/api/v1/user" },
    ])
    server.use(
      http.get("https://cubence.com/api/v1/auth/me", () =>
        HttpResponse.json({ user: { id: 7, username: "A", active: true } }),
      ),
      http.get("https://cubence.com/api/v1/user/apikeys", ({ request }) => {
        expect(request.headers.get("cookie")).toBe(
          "token=A; csrf=scoped; token=A; csrf=root",
        )
        return HttpResponse.json({ success: true, data: [] })
      }),
    )
    await expect(
      fetchKeys({
        baseUrl: "https://cubence.com",
        auth: { authType: AuthTypeEnum.Cookie, userId: 7 },
      }),
    ).resolves.toEqual([])
  })

  it.each(["identity", "rule"])(
    "does not report a write dispatched when %s preparation fails",
    async (failure) => {
      const onDispatch = vi.fn()
      server.use(
        http.get("https://cubence.com/api/v1/auth/me", () =>
          HttpResponse.json(
            { user: { id: 7, username: "A", active: true } },
            { status: failure === "identity" ? 503 : 200 },
          ),
        ),
      )
      if (failure === "rule") {
        const original = browserBoundary.updateRules.getMockImplementation()!
        browserBoundary.updateRules.mockImplementation(async (update) => {
          if (update.addRules?.[0]?.condition.requestMethods?.includes("post"))
            throw new Error("installation failed")
          return original(update)
        })
      }
      await expect(
        createKey(
          {
            baseUrl: "https://cubence.com",
            auth: {
              authType: AuthTypeEnum.Cookie,
              userId: 7,
              cookie: "session=A",
            },
            observer: { onDispatch, onResponse: vi.fn() },
          },
          {
            name: "test",
            quota_limit: -1,
            share_group_id: 13,
          },
        ),
      ).rejects.toThrow()
      expect(onDispatch).not.toHaveBeenCalled()
    },
  )

  it("checks identity once for an edit and readback, then checks it again for the next operation", async () => {
    const baseline: CubenceKey = {
      id: 17,
      user_id: 7,
      key: "secret",
      name: "Example",
      status: "active",
      share_type: "public",
      share_group_id: 13,
      quota_limit: 100,
      quota_used: 0,
      usage_count: 0,
      last_used_at: null,
    }
    let current = { ...baseline }
    const me = vi.fn(() =>
      HttpResponse.json({ user: { id: 7, username: "A", active: true } }),
    )
    server.use(
      http.get("https://cubence.com/api/v1/auth/me", me),
      http.get("https://cubence.com/api/v1/user/apikeys", () =>
        HttpResponse.json({ success: true, data: [current] }),
      ),
      http.patch("https://cubence.com/api/v1/user/apikeys/17/quota", () => {
        current = { ...current, quota_limit: -1 }
        return HttpResponse.json({ success: true })
      }),
    )
    const request = {
      baseUrl: "https://cubence.com",
      auth: { authType: AuthTypeEnum.Cookie, userId: 7 },
    }
    await expect(
      updateKey(request, baseline, {
        quota_limit: -1,
        share_group_id: 13,
        status: "active",
      }),
    ).resolves.toMatchObject({ quota_limit: -1 })
    expect(me).toHaveBeenCalledOnce()
    expect(browserBoundary.cookies).toHaveBeenCalledOnce()
    await fetchKeys(request)
    expect(me).toHaveBeenCalledTimes(2)
    expect(browserBoundary.cookies).toHaveBeenCalledTimes(2)
  })

  it("cleans a late installed rule after cancellation before another account can send", async () => {
    const controller = new AbortController()
    let release!: () => void
    const pendingInstall = new Promise<void>((resolve) => {
      release = resolve
    })
    const original = browserBoundary.updateRules.getMockImplementation()!
    browserBoundary.updateRules.mockImplementationOnce(async (update) => {
      await pendingInstall
      return original(update)
    })
    server.use(
      http.post("https://cubence.com/api/v1/user/apikeys", ({ request }) => {
        expect(request.headers.get("cookie")).toBe("session=C")
        return HttpResponse.json({ success: true })
      }),
    )
    const request = {
      baseUrl: "https://cubence.com",
      auth: { authType: AuthTypeEnum.Cookie, cookie: "session=A" },
      abortSignal: controller.signal,
    }
    const first = readCubenceResponse(request, "/api/v1/user/apikeys", {
      method: "POST",
    })
    const cancelled = expect(first).rejects.toMatchObject({
      name: "AbortError",
    })
    await vi.waitFor(() =>
      expect(browserBoundary.updateRules).toHaveBeenCalledOnce(),
    )
    controller.abort()
    await cancelled
    const second = readCubenceResponse(
      {
        ...request,
        abortSignal: undefined,
        auth: { ...request.auth, cookie: "session=C" },
      },
      "/api/v1/user/apikeys",
      { method: "POST" },
    )
    expect(browserBoundary.fetch).not.toHaveBeenCalled()
    release()
    await expect(second).resolves.toEqual({ success: true })
    expect(browserBoundary.fetch).toHaveBeenCalledOnce()
    expect(await browser.declarativeNetRequest.getSessionRules()).toEqual([])
  })

  it("blocks ordinary requests until a failed Cookie rule cleanup can recover", async () => {
    server.use(
      http.get("https://cubence.com/api/test", () =>
        HttpResponse.json({ success: true }),
      ),
    )
    const original = browserBoundary.updateRules.getMockImplementation()!
    browserBoundary.updateRules.mockImplementation(async (update) => {
      if (!update.addRules) throw new Error("cleanup unavailable")
      return original(update)
    })
    await readCubenceResponse(
      {
        baseUrl: "https://cubence.com",
        auth: { authType: AuthTypeEnum.Cookie, cookie: "session=A" },
      },
      "/api/test",
    )
    await expect(
      fetchWithHeaderOverrides("https://cubence.com/api/test"),
    ).rejects.toThrow("cleanup unavailable")
    expect(browserBoundary.fetch).toHaveBeenCalledOnce()
    browserBoundary.updateRules.mockImplementation(original)
    await fetchWithHeaderOverrides("https://cubence.com/api/test")
    expect(await browser.declarativeNetRequest.getSessionRules()).toEqual([])
  })

  it("bounds stalled browser Cookie preparation without ever sending a request", async () => {
    let release!: (cookies: browser.cookies.Cookie[]) => void
    browserBoundary.cookies.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const request = readCubenceResponse(
      {
        baseUrl: "https://cubence.com",
        auth: { authType: AuthTypeEnum.Cookie },
        requestTimeoutMs: 20,
      },
      "/api/test",
    )
    // An external watchdog distinguishes the missing product timeout from a hung test.
    const outcome = await Promise.race([
      request.then(
        () => "sent",
        (error) => error.name,
      ),
      new Promise((resolve) => setTimeout(() => resolve("still waiting"), 100)),
    ])
    release([])
    await request.catch(() => {})
    expect(outcome).toBe("TimeoutError")
    expect(browserBoundary.fetch).not.toHaveBeenCalled()
  })
})
