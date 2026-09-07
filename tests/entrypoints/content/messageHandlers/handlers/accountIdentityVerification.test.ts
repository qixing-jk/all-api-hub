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

/** A modern dashboard session fixture; the token remains inside the content handler. */
function createDashboardSessionResponse() {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        access_token: "transient-dashboard-token",
        token_type: "Bearer",
        access_expires_at: Math.floor(Date.now() / 1000) + 900,
        session: { sid: "test-session", current: true },
        user: { id: 2 },
      },
    }),
  )
}

describe("current browser account identity verification", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal("location", new URL("https://site.example.com/dashboard"))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

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
    "recovers a legacy New API login when the local user hint is %s",
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
        success: true,
        data: { userId: "2", identityVerified: true },
      })
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
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
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

  it("rechecks modern New API using a transient dashboard session without persisting its token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(createDashboardSessionResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { id: 2 },
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal("fetch", fetchMock)

    expect(await verifyIdentity(SITE_TYPES.NEW_API)).toEqual({
      success: true,
      data: { userId: "2", identityVerified: true },
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://site.example.com/api/user/auth/refresh",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    )
    expect(
      new Headers(fetchMock.mock.calls[2][1].headers).get("Authorization"),
    ).toBe("Bearer transient-dashboard-token")
    expect(localStorage.length).toBe(0)
  })

  it.each([401, 409, 429, 500])(
    "leaves New API unverified after refresh status %s without replaying it",
    async (status) => {
      localStorage.setItem("user", JSON.stringify({ id: 1 }))
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response("{}", { status: 401 }))
        .mockResolvedValueOnce(new Response("{}", { status }))
      vi.stubGlobal("fetch", fetchMock)
      expect(await verifyIdentity(SITE_TYPES.NEW_API)).toEqual({
        success: false,
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    },
  )

  it("does not replay a New API refresh whose response was lost", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockRejectedValueOnce(new Error("Response lost"))
    vi.stubGlobal("fetch", fetchMock)
    expect(await verifyIdentity(SITE_TYPES.NEW_API)).toEqual({ success: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not accept an incomplete New API session bundle", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { access_token: "private-token", user: { id: 2 } },
          }),
        ),
      )
    vi.stubGlobal("fetch", fetchMock)
    expect(await verifyIdentity(SITE_TYPES.NEW_API)).toEqual({ success: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("rejects a New API session when /self identifies a different user", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(createDashboardSessionResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { id: 3 } })),
      )
    vi.stubGlobal("fetch", fetchMock)
    expect(await verifyIdentity(SITE_TYPES.NEW_API)).toEqual({ success: false })
    expect(localStorage.length).toBe(0)
  })

  it("waits for the dashboard refresh lock and cancels if the page has navigated", async () => {
    let releaseLock!: () => void
    const lock = new Promise<void>((resolve) => {
      releaseLock = resolve
    })
    const requestLock = vi.fn(
      async (
        _name: string,
        _options: LockOptions,
        verify: () => Promise<string | null>,
      ) => {
        await lock
        return verify()
      },
    )
    vi.stubGlobal("navigator", { locks: { request: requestLock } })
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 401 }))
    vi.stubGlobal("fetch", fetchMock)
    const pending = verifyIdentity(SITE_TYPES.NEW_API)

    await vi.waitFor(() => {
      expect(requestLock).toHaveBeenCalled()
    })
    expect(requestLock.mock.calls[0][0]).toBe("new-api:auth-refresh")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.stubGlobal("location", new URL("https://other.example.com"))
    releaseLock()
    expect(await pending).toEqual({ success: false })
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

      fetchMock.mockResolvedValue(
        new Response(JSON.stringify(scenario.body), { status: 401 }),
      )
      expect(await verifyIdentity(scenario.siteType)).toEqual({
        success: false,
      })
    },
  )
})
