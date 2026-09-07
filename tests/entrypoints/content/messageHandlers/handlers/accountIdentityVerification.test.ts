import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { handleGetUserFromLocalStorage } from "~/entrypoints/content/messageHandlers/handlers/storage"

/** Verifies identity through the same message-handler boundary as the popup. */
function verifyIdentity(
  siteType: AccountSiteType,
  url = location.origin,
  candidateUserIds?: string[],
) {
  return new Promise<unknown>((resolve) => {
    handleGetUserFromLocalStorage(
      { siteType, url, verifyIdentity: true, candidateUserIds },
      resolve,
    )
  })
}

describe("current browser account identity verification", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal("location", new URL("https://site.example.com/dashboard"))
    vi.stubGlobal("document", document.implementation.createHTMLDocument())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("leaves the login unconfirmed without refreshing the website session", async () => {
    localStorage.setItem("user", JSON.stringify({ id: 2 }))
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
    vi.stubGlobal("fetch", fetchMock)

    expect(await verifyIdentity(SITE_TYPES.NEW_API)).toEqual({ success: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].method).toBe("GET")
  })

  it("reuses a verified browser token without repeating the identity request", async () => {
    localStorage.setItem("auth_token", "current-session-token")
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ code: 0, data: { id: 2 } })),
      )
    vi.stubGlobal("fetch", fetchMock)

    expect(await verifyIdentity(SITE_TYPES.SUB2API)).toEqual({
      success: true,
      data: { userId: "2", identityVerified: true },
    })
    expect(await verifyIdentity(SITE_TYPES.SUB2API)).toEqual({
      success: true,
      data: { userId: "2", identityVerified: true },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      siteType: SITE_TYPES.SUB2API,
      key: "auth_token",
      initial: "old-token",
      next: "new-token",
    },
    {
      siteType: SITE_TYPES.VO_API_V2,
      key: "userStore",
      initial: JSON.stringify({ auth: { token: "old-token" } }),
      next: JSON.stringify({ auth: { token: "new-token" } }),
    },
  ])(
    "invalidates a verified $siteType identity on login change and logout",
    async (scenario) => {
      localStorage.setItem(scenario.key, scenario.initial)
      const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
        const isNewLogin = new Headers(options.headers)
          .get("Authorization")
          ?.includes("new-token")
        return new Response(
          JSON.stringify({
            code: 0,
            data: { id: isNewLogin ? "new-user" : "old-user" },
          }),
        )
      })
      vi.stubGlobal("fetch", fetchMock)

      expect(await verifyIdentity(scenario.siteType)).toEqual({
        success: true,
        data: { userId: "old-user", identityVerified: true },
      })
      localStorage.setItem(scenario.key, scenario.next)
      expect(await verifyIdentity(scenario.siteType)).toEqual({
        success: true,
        data: { userId: "new-user", identityVerified: true },
      })
      localStorage.removeItem(scenario.key)
      expect(await verifyIdentity(scenario.siteType)).toEqual({
        success: false,
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
  )

  it("rechecks a cached Cookie identity when visible session cookies change", async () => {
    const cookie = vi
      .spyOn(document, "cookie", "get")
      .mockReturnValue("session=old")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: { id: "old-user" } }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: { id: "new-user" } }),
        ),
      )
    vi.stubGlobal("fetch", fetchMock)

    expect(await verifyIdentity(SITE_TYPES.ONE_API)).toEqual({
      success: true,
      data: { userId: "old-user", identityVerified: true },
    })
    cookie.mockReturnValue("session=new")
    expect(await verifyIdentity(SITE_TYPES.ONE_API)).toEqual({
      success: true,
      data: { userId: "new-user", identityVerified: true },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not reuse the previous document's verified identity after a same-URL reload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: { id: "old-user" } }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: { id: "new-user" } }),
        ),
      )
    vi.stubGlobal("fetch", fetchMock)

    expect(await verifyIdentity(SITE_TYPES.ONE_API)).toEqual({
      success: true,
      data: { userId: "old-user", identityVerified: true },
    })
    vi.stubGlobal("document", document.implementation.createHTMLDocument())
    expect(await verifyIdentity(SITE_TYPES.ONE_API)).toEqual({
      success: true,
      data: { userId: "new-user", identityVerified: true },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("cancels an unfinished verification when a new browser session is observed", async () => {
    localStorage.setItem("auth_token", "old-token")
    const fetchMock = vi.fn((_url: string, options: RequestInit) =>
      new Headers(options.headers).get("Authorization") === "Bearer old-token"
        ? new Promise<Response>(() => {})
        : Promise.resolve(
            new Response(JSON.stringify({ code: 0, data: { id: "new-user" } })),
          ),
    )
    vi.stubGlobal("fetch", fetchMock)
    const oldIdentity = verifyIdentity(SITE_TYPES.SUB2API)
    localStorage.setItem("auth_token", "new-token")

    expect(await verifyIdentity(SITE_TYPES.SUB2API)).toEqual({
      success: true,
      data: { userId: "new-user", identityVerified: true },
    })
    expect(await oldIdentity).toEqual({ success: false })
    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([
    SITE_TYPES.SUB2API,
    SITE_TYPES.VO_API_V2,
    SITE_TYPES.AIHUBMIX,
    SITE_TYPES.OPENROUTER,
  ])(
    "skips the network when the current %s JWT has expired",
    async (siteType) => {
      const token = `header.${btoa(JSON.stringify({ exp: 1 }))}.signature`
      if (siteType === SITE_TYPES.SUB2API) {
        localStorage.setItem("auth_token", token)
        // A stale timestamp must not extend the JWT's own expiry.
        localStorage.setItem("token_expires_at", String(Date.now() + 60_000))
      } else if (siteType === SITE_TYPES.VO_API_V2) {
        localStorage.setItem("userStore", JSON.stringify({ auth: { token } }))
      } else {
        vi.stubGlobal(
          "location",
          new URL(
            siteType === SITE_TYPES.AIHUBMIX
              ? "https://console.aihubmix.com/statistics"
              : "https://openrouter.ai/settings",
          ),
        )
        vi.spyOn(document, "cookie", "get").mockReturnValue(
          `__session=${token}`,
        )
      }
      const fetchMock = vi.fn().mockResolvedValue(new Response("{}"))
      vi.stubGlobal("fetch", fetchMock)
      expect(await verifyIdentity(siteType)).toEqual({ success: false })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it.each([
    SITE_TYPES.ONE_API,
    SITE_TYPES.NEW_API,
    SITE_TYPES.MODELFLARE,
    SITE_TYPES.ANYROUTER,
    SITE_TYPES.VELOERA,
    SITE_TYPES.DONE_HUB,
    SITE_TYPES.ONE_HUB,
    SITE_TYPES.V_API,
    SITE_TYPES.VO_API,
    SITE_TYPES.SUPER_API,
    SITE_TYPES.RIX_API,
    SITE_TYPES.NEO_API,
    SITE_TYPES.WONG_GONGYI,
    SITE_TYPES.UNKNOWN,
  ])(
    "rechecks the Cookie session for %s without using a saved access token",
    async (siteType) => {
      localStorage.setItem(
        "user",
        JSON.stringify({ id: 1, access_token: "unrelated-account-token" }),
      )
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { id: "current-user" },
          }),
        ),
      )
      vi.stubGlobal("fetch", fetchMock)

      expect(await verifyIdentity(siteType)).toEqual({
        success: true,
        data: { userId: "current-user", identityVerified: true },
      })
      expect(fetchMock).toHaveBeenCalledWith(
        "https://site.example.com/api/user/self",
        expect.objectContaining({ credentials: "include", redirect: "error" }),
      )
      expect(
        new Headers(fetchMock.mock.calls[0][1].headers).has("Authorization"),
      ).toBe(false)
    },
  )

  it("also verifies self-hosted sites served over HTTP", async () => {
    vi.stubGlobal("location", new URL("http://192.168.1.4:3000/dashboard"))
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { id: 2 } })),
      )
    vi.stubGlobal("fetch", fetchMock)

    expect(await verifyIdentity(SITE_TYPES.ONE_API)).toEqual({
      success: true,
      data: { userId: "2", identityVerified: true },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      "http://192.168.1.4:3000/api/user/self",
      expect.anything(),
    )
  })

  it.each([SITE_TYPES.AIHUBMIX, SITE_TYPES.OPENROUTER])(
    "does not send platform identity requests from an unrelated %s origin",
    async (siteType) => {
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      expect(await verifyIdentity(siteType)).toEqual({ success: false })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it("rejects an identity request for a different page origin", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect(
      await verifyIdentity(SITE_TYPES.NEW_API, "https://other.example.com"),
    ).toEqual({ success: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("discards a response after the page navigates to another origin", async () => {
    let resolveResponse!: (response: Response) => void
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveResponse = resolve
          }),
      ),
    )
    const pending = verifyIdentity(SITE_TYPES.ONE_API)
    vi.stubGlobal("location", new URL("https://other.example.com/dashboard"))
    resolveResponse(
      new Response(JSON.stringify({ success: true, data: { id: 1 } })),
    )
    expect(await pending).toEqual({ success: false })
  })

  it("verifies AIHubMix's Clerk login with the page session token instead of Cookie-only auth", async () => {
    vi.stubGlobal(
      "location",
      new URL("https://console.aihubmix.com/statistics"),
    )
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "__session=clerk-session-token; theme=dark",
    )
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      const authenticated =
        new Headers(options.headers).get("Authorization") ===
        "Bearer clerk-session-token"
      return new Response(
        JSON.stringify(
          authenticated
            ? {
                success: true,
                data: {
                  id: 10,
                  username: "stable-user",
                  display_name: "Display Name",
                },
              }
            : { success: false },
        ),
        { status: authenticated ? 200 : 401 },
      )
    })
    vi.stubGlobal("fetch", fetchMock)

    expect(await verifyIdentity(SITE_TYPES.AIHUBMIX)).toEqual({
      success: true,
      data: { userId: "stable-user", identityVerified: true },
    })
    expect(localStorage.length).toBe(0)
  })

  it.each([null, "1"])(
    "does not enumerate saved logins when the local user hint is %s",
    async (storedId) => {
      if (storedId)
        localStorage.setItem("user", JSON.stringify({ id: storedId }))
      const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
        // Legacy middleware compares this required header to the Cookie session.
        const matchesCookie =
          new Headers(options.headers).get("New-Api-User") === "2"
        return new Response(
          JSON.stringify(
            matchesCookie
              ? { success: true, data: { id: 2 } }
              : { success: false, message: "New-Api-User mismatch" },
          ),
          { status: matchesCookie ? 200 : 401 },
        )
      })
      vi.stubGlobal("fetch", fetchMock)

      expect(
        await verifyIdentity(SITE_TYPES.NEW_API, location.origin, ["1", "2"]),
      ).toEqual({
        success: false,
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(
        fetchMock.mock.calls.every(
          ([, options]) =>
            options.method === "GET" &&
            options.credentials === "include" &&
            !new Headers(options.headers).has("Authorization"),
        ),
      ).toBe(true)
    },
  )

  it.each([
    {
      siteType: SITE_TYPES.SUB2API,
      key: "auth_token",
      initial: "old-token",
      next: "new-token",
    },
    {
      siteType: SITE_TYPES.VO_API_V2,
      key: "userStore",
      initial: JSON.stringify({ auth: { token: "old-token" } }),
      next: JSON.stringify({ auth: { token: "new-token" } }),
    },
  ])(
    "discards a $siteType response when the page switched login during verification",
    async (scenario) => {
      localStorage.setItem(scenario.key, scenario.initial)
      let resolveResponse!: (response: Response) => void
      vi.stubGlobal(
        "fetch",
        vi.fn(
          () =>
            new Promise<Response>((resolve) => {
              resolveResponse = resolve
            }),
        ),
      )

      const pending = verifyIdentity(scenario.siteType)
      localStorage.setItem(scenario.key, scenario.next)
      resolveResponse(
        new Response(JSON.stringify({ code: 0, data: { id: "old-user" } })),
      )

      expect(await pending).toEqual({ success: false })
      expect(localStorage.getItem(scenario.key)).toBe(scenario.next)
    },
  )

  it("does not accept a response that completes after the verification deadline", async () => {
    vi.useFakeTimers()
    let resolveBody!: (body: unknown) => void
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        new Promise((resolve) => {
          resolveBody = resolve
        }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const pending = verifyIdentity(SITE_TYPES.ONE_API)

    await vi.advanceTimersByTimeAsync(5001)
    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true)
    resolveBody({ success: true, data: { id: "old-user" } })

    expect(await pending).toEqual({ success: false })
  })

  it("uses the current V-API identity hint instead of an obsolete legacy user object", async () => {
    localStorage.setItem("user", JSON.stringify({ id: 1 }))
    localStorage.setItem(
      "user-storage",
      JSON.stringify({ state: { user: { id: 2 } } }),
    )
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      const currentHint = new Headers(options.headers).get("X-Api-User") === "2"
      return new Response(
        JSON.stringify(
          currentHint ? { success: true, data: { id: 2 } } : { success: false },
        ),
        { status: currentHint ? 200 : 403 },
      )
    })
    vi.stubGlobal("fetch", fetchMock)

    expect(await verifyIdentity(SITE_TYPES.V_API)).toEqual({
      success: true,
      data: { userId: "2", identityVerified: true },
    })
  })

  it.each([401, 403, 429, 500])(
    "cools down passive checks after an inconclusive response: %s",
    async (status) => {
      let now = Date.now()
      vi.spyOn(Date, "now").mockImplementation(() => now)
      const fetchMock = vi.fn(async () => new Response("{}", { status }))
      vi.stubGlobal("fetch", fetchMock)

      expect(await verifyIdentity(SITE_TYPES.NEW_API)).toEqual({
        success: false,
      })
      expect(await verifyIdentity(SITE_TYPES.NEW_API)).toEqual({
        success: false,
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      now += 5001
      expect(await verifyIdentity(SITE_TYPES.NEW_API)).toEqual({
        success: false,
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
  )

  it("returns an unconfirmed login on network failure without trying auth recovery", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error("Network unavailable"))
    vi.stubGlobal("fetch", fetchMock)
    expect(await verifyIdentity(SITE_TYPES.NEW_API)).toEqual({ success: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(localStorage.length).toBe(0)
  })

  it("shares an in-flight check between extension views inspecting the same document", async () => {
    let resolveResponse!: (response: Response) => void
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve
        }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const first = verifyIdentity(SITE_TYPES.ONE_API)
    const second = verifyIdentity(SITE_TYPES.ONE_API)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolveResponse(
      new Response(JSON.stringify({ success: true, data: { id: 2 } })),
    )
    expect(await Promise.all([first, second])).toEqual([
      { success: true, data: { userId: "2", identityVerified: true } },
      { success: true, data: { userId: "2", identityVerified: true } },
    ])
  })

  it("returns after the deadline even when the identity endpoint never responds", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(
      (_url: string, _options: RequestInit) => new Promise<Response>(() => {}),
    )
    vi.stubGlobal("fetch", fetchMock)
    const pending = verifyIdentity(SITE_TYPES.ONE_API)
    await vi.advanceTimersByTimeAsync(5001)
    expect(await pending).toEqual({ success: false })
    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true)
  })

  it("uses a unique saved identity as a legacy header hint without enumerating accounts", async () => {
    const fetchMock = vi.fn(
      async (_url: string, options: RequestInit) =>
        new Response(
          JSON.stringify(
            new Headers(options.headers).get("New-Api-User") === "2"
              ? { success: true, data: { id: 2 } }
              : { success: false },
          ),
        ),
    )
    vi.stubGlobal("fetch", fetchMock)
    expect(
      await verifyIdentity(SITE_TYPES.NEW_API, location.origin, ["2", "2"]),
    ).toEqual({
      success: true,
      data: { userId: "2", identityVerified: true },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    { status: 200, body: { success: false, data: { id: 1 } } },
    { status: 200, body: { success: true, data: { id: {} } } },
    { status: 200, body: [] },
    { status: 403, body: { success: true, data: { id: 1 } } },
    { status: 500, body: { success: true, data: { id: 1 } } },
  ])(
    "does not turn an unsuccessful or malformed response into a New API identity: $status/$body",
    async ({ status, body }) => {
      localStorage.setItem("user", JSON.stringify({ id: 1 }))
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(body), { status }))
      vi.stubGlobal("fetch", fetchMock)
      expect(
        await verifyIdentity(SITE_TYPES.NEW_API, location.origin, ["1", "2"]),
      ).toEqual({ success: false })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it.each([SITE_TYPES.SUB2API, SITE_TYPES.VO_API_V2])(
    "does not trust a stale user object without a live %s browser token",
    async (siteType) => {
      localStorage.setItem("user", JSON.stringify({ id: 1 }))
      localStorage.setItem("auth_user", JSON.stringify({ id: 1 }))
      localStorage.setItem("userStore", "invalid-json")
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      expect(await verifyIdentity(siteType)).toEqual({ success: false })
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it.each([
    {
      siteType: SITE_TYPES.SUB2API,
      pageUrl: "https://site.example.com/dashboard",
      endpoint: "https://site.example.com/api/v1/auth/me",
      stored: {
        auth_token: "browser-session-token",
        auth_user: JSON.stringify({ id: 1 }),
      },
      body: { code: 0, data: { id: 2, email: "current@example.com" } },
      userId: "2",
      authorization: "Bearer browser-session-token",
    },
    {
      siteType: SITE_TYPES.VO_API_V2,
      pageUrl: "https://site.example.com/dashboard",
      endpoint: "https://site.example.com/api/user/info",
      stored: {
        userStore: JSON.stringify({ auth: { token: "browser-session-token" } }),
      },
      body: { code: 0, data: { id: "new-user", username: "display-name" } },
      userId: "new-user",
      authorization: "browser-session-token",
    },
    {
      siteType: SITE_TYPES.AIHUBMIX,
      pageUrl: "https://console.aihubmix.com/statistics",
      endpoint: "https://aihubmix.com/call/usr/self",
      stored: {},
      body: {
        success: true,
        data: { id: 10, username: "stable-user", display_name: "Display Name" },
      },
      userId: "stable-user",
      authorization: undefined,
    },
    {
      siteType: SITE_TYPES.SHAREDCHAT,
      pageUrl: "https://new.sharedchat.cc/dashboard",
      endpoint: "https://new.sharedchat.cc/frontend-api/getme",
      stored: {},
      body: {
        code: 1,
        data: { id: "shared-user", userToken: "private-test-token" },
      },
      userId: "shared-user",
      authorization: undefined,
    },
    {
      siteType: SITE_TYPES.OPENROUTER,
      pageUrl: "https://openrouter.ai/workspaces/default/keys",
      endpoint: "https://openrouter.ai/api/frontend/v1/private/users/current",
      stored: {},
      body: {
        data: { clerk_user_id: "user_current", email: "current@example.com" },
      },
      userId: "user_current",
      authorization: undefined,
    },
  ])(
    "verifies $siteType using its own browser-session protocol",
    async (scenario) => {
      vi.stubGlobal("location", new URL(scenario.pageUrl))
      for (const [key, value] of Object.entries(scenario.stored)) {
        localStorage.setItem(key, value)
      }
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(scenario.body), { status: 200 }),
        )
      vi.stubGlobal("fetch", fetchMock)

      expect(await verifyIdentity(scenario.siteType)).toEqual({
        success: true,
        data: { userId: scenario.userId, identityVerified: true },
      })
      expect(fetchMock).toHaveBeenCalledWith(
        scenario.endpoint,
        expect.objectContaining({
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }),
      )
      const headers = new Headers(fetchMock.mock.calls[0][1].headers)
      expect(headers.get("Authorization")).toBe(scenario.authorization ?? null)

      vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31_000)
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify(scenario.body), { status: 401 }),
      )
      expect(await verifyIdentity(scenario.siteType)).toEqual({
        success: false,
      })
    },
  )
})
