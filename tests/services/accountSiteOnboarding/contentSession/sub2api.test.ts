import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  sub2ApiContentSessionExtractor,
  Sub2ApiContentSessionLoginRequiredError,
} from "~/services/accountSiteOnboarding/contentSession/sub2api"
import { ContentSessionProtocolError } from "~/services/accountSiteOnboarding/contracts"

function createLocalStorageMock() {
  const store = new Map<string, string>()

  return {
    clear: vi.fn(() => {
      store.clear()
    }),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, String(value))
    }),
    get length() {
      return store.size
    },
  }
}

describe("sub2ApiContentSessionExtractor", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.stubGlobal("localStorage", createLocalStorageMock())
  })

  describe("unknown-site session probing", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "location",
        new URL("https://panel.example.invalid/dashboard"),
      )
      localStorage.setItem("auth_token", "jwt-token")
      localStorage.setItem(
        "auth_user",
        JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
      )
    })

    it.each([
      ["another protocol", { success: true, data: { id: 123 } }, 200],
      [
        "an ambiguous auth failure",
        { code: "UNAUTHORIZED", message: "Unauthorized" },
        401,
      ],
      ["a different identity", { code: 0, data: { id: 456 } }, 200],
      ["an invalid identity", { code: 0, data: { id: "bad" } }, 200],
    ])(
      "rejects %s before refreshing or writing website credentials",
      async (_, body, status) => {
        localStorage.setItem("refresh_token", "refresh-before")
        localStorage.setItem("token_expires_at", String(Date.now() - 1))
        const fetchMock = vi.fn().mockResolvedValue(
          new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
          }),
        )
        vi.stubGlobal("fetch", fetchMock)
        const setItem = vi.spyOn(localStorage, "setItem").mockClear()
        await expect(
          sub2ApiContentSessionExtractor.probe!({
            siteTypeHint: SITE_TYPES.UNKNOWN,
          }),
        ).resolves.toBeNull()
        expect(fetchMock).toHaveBeenCalledOnce()
        expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET")
        expect(setItem).not.toHaveBeenCalled()
        expect(localStorage.getItem("auth_token")).toBe("jwt-token")
        expect(localStorage.getItem("refresh_token")).toBe("refresh-before")
      },
    )

    it.each(["token", "user"])(
      "rejects a changed %s before credential refresh",
      async (changed) => {
        localStorage.setItem("refresh_token", "refresh-before")
        localStorage.setItem("token_expires_at", String(Date.now() + 30_000))
        const fetchMock = vi.fn().mockImplementation(async () => {
          if (changed === "token")
            localStorage.setItem("auth_token", "other-token")
          if (changed === "user")
            localStorage.setItem("auth_user", JSON.stringify({ id: 456 }))
          return new Response(JSON.stringify({ code: 0, data: { id: 123 } }), {
            status: 200,
          })
        })
        vi.stubGlobal("fetch", fetchMock)
        await expect(
          sub2ApiContentSessionExtractor.probe!({
            url: "https://panel.example.invalid",
            siteTypeHint: SITE_TYPES.UNKNOWN,
          }),
        ).resolves.toBeNull()
        expect(fetchMock).toHaveBeenCalledOnce()
        expect(localStorage.getItem("refresh_token")).toBe("refresh-before")
      },
    )

    it("extracts a matching identity without an extra origin-change rejection", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async () => {
          vi.stubGlobal("location", new URL("https://other.example.invalid"))
          return new Response(JSON.stringify({ code: 0, data: { id: 123 } }), {
            status: 200,
          })
        }),
      )
      await expect(
        sub2ApiContentSessionExtractor.probe!({
          siteTypeHint: SITE_TYPES.UNKNOWN,
        }),
      ).resolves.toMatchObject({ userId: 123, accessToken: "jwt-token" })
    })

    it("reports a disconnected probe instead of treating it as a protocol mismatch", async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValue(new TypeError("Failed to fetch"))
      vi.stubGlobal("fetch", fetchMock)
      await expect(
        sub2ApiContentSessionExtractor.probe!({
          siteTypeHint: SITE_TYPES.UNKNOWN,
        }),
      ).rejects.toThrow("Sub2API session probe request failed")
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(localStorage.getItem("auth_token")).toBe("jwt-token")
    })

    it.each(["headers", "body"])(
      "accepts probe %s that complete after 15 seconds",
      async (phase) => {
        vi.useFakeTimers()
        try {
          let complete!: () => void
          const body = { code: 0, data: { id: 123 } }
          const pending = new Promise<unknown>((resolve) => {
            complete = () =>
              resolve(
                phase === "headers"
                  ? new Response(JSON.stringify(body), { status: 200 })
                  : body,
              )
          })
          const fetchMock =
            phase === "headers"
              ? vi.fn().mockReturnValue(pending)
              : vi
                  .fn()
                  .mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: () => pending,
                  })
          vi.stubGlobal("fetch", fetchMock)
          const observed = sub2ApiContentSessionExtractor.probe!({
            siteTypeHint: SITE_TYPES.UNKNOWN,
          }).then(
            (value) => ({ value }),
            (error) => ({ error }),
          )
          await vi.advanceTimersByTimeAsync(16_000)
          complete()
          expect(await observed).toMatchObject({
            value: { userId: 123, accessToken: "jwt-token" },
          })
          expect(fetchMock).toHaveBeenCalledOnce()
          expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("redirect")
        } finally {
          vi.useRealTimers()
        }
      },
    )

    it.each([429, 503])(
      "reports HTTP %i as unavailable rather than another protocol",
      async (status) => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(new Response(null, { status })),
        )
        await expect(
          sub2ApiContentSessionExtractor.probe!({
            siteTypeHint: SITE_TYPES.UNKNOWN,
          }),
        ).rejects.toThrow("Sub2API session probe request failed")
      },
    )

    it("reports a disconnected response body without rotating tokens", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new TypeError("Body interrupted")),
      })
      vi.stubGlobal("fetch", fetchMock)
      await expect(
        sub2ApiContentSessionExtractor.probe!({
          siteTypeHint: SITE_TYPES.UNKNOWN,
        }),
      ).rejects.toThrow("Sub2API session probe request failed")
      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it("confirms the live identity before refreshing exactly once", async () => {
      localStorage.setItem("refresh_token", "refresh-before")
      localStorage.setItem("token_expires_at", String(Date.now() + 30_000))
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ code: 0, data: { id: 123 } }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              code: 0,
              data: {
                access_token: "next-access",
                refresh_token: "next-refresh",
                expires_in: 3600,
              },
            }),
            { status: 200 },
          ),
        )
      vi.stubGlobal("fetch", fetchMock)
      const result = await sub2ApiContentSessionExtractor.probe!({
        url: "https://panel.example.invalid",
        siteTypeHint: SITE_TYPES.UNKNOWN,
      })
      expect(result).toMatchObject({
        accessToken: "next-access",
        userId: 123,
        siteTypeHint: SITE_TYPES.SUB2API,
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        method: "GET",
      })
      expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" })
      expect(localStorage.getItem("refresh_token")).toBe("next-refresh")
    })

    it.each(["auth_token", "auth_user"])(
      "does not probe without the %s footprint",
      async (key) => {
        localStorage.removeItem(key)
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        await expect(
          sub2ApiContentSessionExtractor.probe!({
            siteTypeHint: SITE_TYPES.UNKNOWN,
          }),
        ).resolves.toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
      },
    )
  })

  it.each([
    ["https://ai-router.dev/dashboard", "https://api.ai-router.dev"],
    ["https://www.ai-router.dev", "https://api.ai-router.dev"],
    [
      "https://panel.example.invalid/dashboard",
      "https://panel.example.invalid",
    ],
  ])(
    "uses the registered API origin when refreshing %s",
    async (browserUrl, apiOrigin) => {
      localStorage.setItem("auth_token", "old-token")
      localStorage.setItem(
        "auth_user",
        JSON.stringify({ id: 123, username: "alice" }),
      )
      localStorage.setItem("refresh_token", "old-refresh")
      localStorage.setItem("token_expires_at", String(Date.now() + 30_000))
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              access_token: "new-access",
              refresh_token: "new-refresh",
              expires_in: 3600,
            },
          }),
          { status: 200 },
        ),
      )
      vi.stubGlobal("fetch", fetchMock)
      await expect(
        sub2ApiContentSessionExtractor.extract({
          url: browserUrl,
          siteTypeHint: SITE_TYPES.SUB2API,
        }),
      ).resolves.toMatchObject({ accessToken: "new-access" })
      expect(fetchMock).toHaveBeenCalledWith(
        `${apiOrigin}/api/v1/auth/refresh`,
        expect.objectContaining({ method: "POST" }),
      )
      expect(fetchMock).toHaveBeenCalledOnce()
    },
  )

  it("binds unknown-site probe and refresh to the live browser origin's registered API", async () => {
    vi.stubGlobal("location", new URL("https://ai-router.dev/dashboard"))
    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice" }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(Date.now() + 30_000))
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, data: { id: 123 } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              access_token: "new-access",
              refresh_token: "new-refresh",
              expires_in: 3600,
            },
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal("fetch", fetchMock)
    await expect(
      sub2ApiContentSessionExtractor.probe!({
        url: "https://unrelated.example.invalid",
        siteTypeHint: SITE_TYPES.UNKNOWN,
      }),
    ).resolves.toMatchObject({ accessToken: "new-access" })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://api.ai-router.dev/api/v1/auth/me",
    )
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "https://api.ai-router.dev/api/v1/auth/refresh",
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("returns the Sub2API user payload when auth_token and auth_user are valid", async () => {
    localStorage.setItem("auth_token", "jwt-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).resolves.toEqual({
      userId: 123,
      user: {
        id: 123,
        username: "alice",
        balance: 1.5,
      },
      accessToken: "jwt-token",
      siteTypeHint: SITE_TYPES.SUB2API,
    })
  })

  it("only claims Sub2API storage when the context is for Sub2API", () => {
    localStorage.setItem("auth_token", "jwt-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )

    expect(
      sub2ApiContentSessionExtractor.canExtract({
        url: "https://sub2.example.invalid",
        siteTypeHint: SITE_TYPES.SUB2API,
      }),
    ).toBe(true)
    expect(
      sub2ApiContentSessionExtractor.canExtract({
        url: "https://one-api.example.invalid",
        siteTypeHint: SITE_TYPES.ONE_API,
      }),
    ).toBe(false)
    expect(
      sub2ApiContentSessionExtractor.canExtract({
        url: "https://example.invalid",
        siteTypeHint: SITE_TYPES.UNKNOWN,
      }),
    ).toBe(false)
  })

  it("throws login-required when the saved access token is blank", async () => {
    localStorage.setItem("auth_token", "   ")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).rejects.toBeInstanceOf(Sub2ApiContentSessionLoginRequiredError)
  })

  it("refreshes near-expiry tokens and returns refreshed auth metadata", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now + 60_000))

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            access_token: "new-token",
            refresh_token: "new-refresh",
            expires_in: 3600,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock as any)

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).resolves.toEqual({
      userId: 123,
      user: {
        id: 123,
        username: "alice",
        balance: 1.5,
      },
      accessToken: "new-token",
      sub2apiAuth: {
        refreshToken: "new-refresh",
        tokenExpiresAt: now + 3600 * 1000,
      },
      siteTypeHint: SITE_TYPES.SUB2API,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://sub2.example.invalid/api/v1/auth/refresh",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer old-token",
        }),
        body: JSON.stringify({ refresh_token: "old-refresh" }),
      }),
    )
    expect(localStorage.getItem("auth_token")).toBe("new-token")
    expect(localStorage.getItem("refresh_token")).toBe("new-refresh")
    expect(localStorage.getItem("token_expires_at")).toBe(
      String(now + 3600 * 1000),
    )
  })

  it("throws login-required when refresh fails and the token is expired", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now - 1))

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 1, message: "invalid" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock as any)

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).rejects.toBeInstanceOf(Sub2ApiContentSessionLoginRequiredError)
  })

  it.each(["headers", "body"])(
    "accepts refresh %s that complete after 15 seconds and stores the renewed pair",
    async (phase) => {
      vi.useFakeTimers()
      try {
        localStorage.setItem("auth_token", "old-token")
        localStorage.setItem(
          "auth_user",
          JSON.stringify({ id: 123, username: "alice" }),
        )
        localStorage.setItem("refresh_token", "old-refresh")
        localStorage.setItem("token_expires_at", String(Date.now() + 60_000))
        const body = {
          code: 0,
          data: {
            access_token: "new-token",
            refresh_token: "new-refresh",
            expires_in: 3600,
          },
        }
        let complete!: () => void
        const pending = new Promise<unknown>((resolve) => {
          complete = () =>
            resolve(
              phase === "headers"
                ? new Response(JSON.stringify(body), { status: 200 })
                : body,
            )
        })
        const fetchMock =
          phase === "headers"
            ? vi.fn().mockReturnValue(pending)
            : vi.fn().mockResolvedValue({ ok: true, json: () => pending })
        vi.stubGlobal("fetch", fetchMock)
        const observed = sub2ApiContentSessionExtractor
          .extract({ url: "https://panel.example.invalid" })
          .then(
            (value) => ({ value }),
            (error) => ({ error }),
          )
        await vi.advanceTimersByTimeAsync(16_000)
        complete()
        expect(await observed).toMatchObject({
          value: { userId: 123, accessToken: "new-token" },
        })
        expect(fetchMock).toHaveBeenCalledOnce()
        expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("redirect")
        expect(localStorage.getItem("refresh_token")).toBe("new-refresh")
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it("fails closed when a dispatched refresh request disconnects without retrying or writing credentials", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now + 60_000))

    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"))
    vi.stubGlobal("fetch", fetchMock)
    const setItem = vi.spyOn(localStorage, "setItem").mockClear()

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).rejects.toBeInstanceOf(Sub2ApiContentSessionLoginRequiredError)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.getItem("auth_token")).toBe("old-token")
    expect(localStorage.getItem("refresh_token")).toBe("old-refresh")
    expect(localStorage.getItem("token_expires_at")).toBe(String(now + 60_000))
  })
  it("throws login-required when refresh request rejects and the token is expired", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now - 1))

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).rejects.toBeInstanceOf(Sub2ApiContentSessionLoginRequiredError)
  })

  it("fails closed when a dispatched refresh response is not JSON", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now + 60_000))

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("not-json", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const setItem = vi.spyOn(localStorage, "setItem").mockClear()

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).rejects.toBeInstanceOf(Sub2ApiContentSessionLoginRequiredError)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.getItem("auth_token")).toBe("old-token")
    expect(localStorage.getItem("refresh_token")).toBe("old-refresh")
  })
  it("throws login-required when an expired refresh response is not JSON", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now - 1))

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not-json", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      ) as any,
    )

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).rejects.toBeInstanceOf(Sub2ApiContentSessionLoginRequiredError)
  })

  it("fails closed when a dispatched refresh response has incomplete token fields", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now + 60_000))

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          data: { access_token: "", refresh_token: "", expires_in: 0 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)
    const setItem = vi.spyOn(localStorage, "setItem").mockClear()

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).rejects.toBeInstanceOf(Sub2ApiContentSessionLoginRequiredError)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.getItem("auth_token")).toBe("old-token")
    expect(localStorage.getItem("refresh_token")).toBe("old-refresh")
  })
  it("throws login-required when an expired token has no refresh token", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("token_expires_at", String(now - 1))

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).rejects.toBeInstanceOf(Sub2ApiContentSessionLoginRequiredError)
  })

  it("keeps a still-valid token when no refresh token is stored", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("token_expires_at", String(now + 60_000))

    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock as any)

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).resolves.toMatchObject({
      accessToken: "old-token",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("fails closed when a dispatched refresh response has code zero but no data", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now + 60_000))

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const setItem = vi.spyOn(localStorage, "setItem").mockClear()

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).rejects.toBeInstanceOf(Sub2ApiContentSessionLoginRequiredError)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.getItem("auth_token")).toBe("old-token")
    expect(localStorage.getItem("refresh_token")).toBe("old-refresh")
  })

  it("rejects a non-OK refresh response even when the JSON body has code zero", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now + 60_000))

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            access_token: "unexpected-access",
            refresh_token: "unexpected-refresh",
            expires_in: 3600,
          },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)
    const setItem = vi.spyOn(localStorage, "setItem").mockClear()

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).rejects.toBeInstanceOf(Sub2ApiContentSessionLoginRequiredError)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.getItem("auth_token")).toBe("old-token")
    expect(localStorage.getItem("refresh_token")).toBe("old-refresh")
  })

  it("throws login-required when an expired refresh response has invalid token field types", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now - 1))

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              access_token: 123,
              refresh_token: null,
              expires_in: "3600",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ) as any,
    )

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).rejects.toBeInstanceOf(Sub2ApiContentSessionLoginRequiredError)
  })

  it("uses refreshed tokens saved by a concurrent extraction before reporting login-required", async () => {
    const now = 1_700_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    localStorage.setItem("auth_token", "old-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    localStorage.setItem("refresh_token", "old-refresh")
    localStorage.setItem("token_expires_at", String(now - 1))

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              access_token: "new-token",
              refresh_token: "new-refresh",
              expires_in: 3600,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 1, message: "invalid" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      )
    vi.stubGlobal("fetch", fetchMock as any)

    const [firstResult, secondResult] = await Promise.all([
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ])

    expect(firstResult?.accessToken).toBe("new-token")
    expect(secondResult?.accessToken).toBe("new-token")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not send an authenticated request when cached auth_user is malformed", async () => {
    vi.stubGlobal(
      "location",
      new URL("https://panel.example.invalid/dashboard"),
    )
    localStorage.setItem("auth_token", "jwt-token")
    localStorage.setItem("auth_user", "not-json")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      sub2ApiContentSessionExtractor.probe!({
        siteTypeHint: SITE_TYPES.UNKNOWN,
      }),
    ).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("preserves protocol errors raised after Sub2API identity verification", async () => {
    vi.stubGlobal(
      "location",
      new URL("https://panel.example.invalid/dashboard"),
    )
    localStorage.setItem("auth_token", "jwt-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { id: 123 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )
    const protocolError = new ContentSessionProtocolError("provider failure")
    vi.spyOn(sub2ApiContentSessionExtractor, "extract").mockRejectedValue(
      protocolError,
    )

    await expect(
      sub2ApiContentSessionExtractor.probe!({
        siteTypeHint: SITE_TYPES.UNKNOWN,
      }),
    ).rejects.toBe(protocolError)
  })

  it("wraps unexpected extraction failures after Sub2API identity verification", async () => {
    vi.stubGlobal(
      "location",
      new URL("https://panel.example.invalid/dashboard"),
    )
    localStorage.setItem("auth_token", "jwt-token")
    localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 123, username: "alice", balance: 1.5 }),
    )
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { id: 123 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )
    vi.spyOn(sub2ApiContentSessionExtractor, "extract").mockRejectedValue(
      new Error("unexpected failure"),
    )

    const result = sub2ApiContentSessionExtractor.probe!({
      siteTypeHint: SITE_TYPES.UNKNOWN,
    })
    await expect(result).rejects.toBeInstanceOf(ContentSessionProtocolError)
    await expect(result).rejects.toThrow("Sub2API session extraction failed")
  })

  it("throws login-required when auth_user is invalid", async () => {
    localStorage.setItem("auth_token", "jwt-token")
    localStorage.setItem("auth_user", "not-json")

    await expect(
      sub2ApiContentSessionExtractor.extract({
        url: "https://sub2.example.invalid",
      }),
    ).rejects.toBeInstanceOf(Sub2ApiContentSessionLoginRequiredError)
  })
})
